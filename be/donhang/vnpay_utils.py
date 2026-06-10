"""
VNPay 2.1.0 — HMAC-SHA512.

Tạo URL: khớp sample PHP chính thức (urlencode key + value, sort alphabet).
Verify IPN/Return: thử cả PHP (giữ vnp_SecureHashType) và Node (bỏ SecureHashType).
"""
import hashlib
import hmac
import logging
import unicodedata
from urllib.parse import quote_plus, urlencode

from django.conf import settings

logger = logging.getLogger(__name__)

_SIGN_EXCLUDE_VERIFY = frozenset({'vnp_SecureHash', 'vnp_SecureHashType'})
_SIGN_EXCLUDE_CREATE = frozenset({'vnp_SecureHash', 'vnp_SecureHashType'})


def _cfg():
    return getattr(settings, 'VNPAY', None) or {}


def _secret_raw(cfg):
    return (cfg.get('HASH_SECRET') or '').strip()


def _normalize_vnpay_ip(ip: str) -> str:
    """VNPay yêu cầu IPv4 — chuẩn hóa IP từ proxy/ngrok."""
    ip = (ip or '127.0.0.1').split(',')[0].strip()
    if ip.startswith('::ffff:'):
        ip = ip[7:]
    if ':' in ip:
        return '127.0.0.1'
    return ip[:45] or '127.0.0.1'


def _order_info_ascii(text, max_len=255):
    if not text:
        return 'Thanh toan don hang'
    nfd = unicodedata.normalize('NFD', str(text)[:max_len])
    ascii_buf = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    out = ''.join(c if 32 <= ord(c) < 127 else ' ' for c in ascii_buf)
    out = ' '.join(out.split())[:max_len].strip()
    return out or 'Thanh toan don hang'


def _hmac_sha512_hex(secret: str, message: str) -> str:
    return hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha512,
    ).hexdigest()


def _sign_items(params: dict, *, exclude: frozenset):
    items = []
    for k in sorted(params.keys()):
        if not k.startswith('vnp_') or k in exclude:
            continue
        v = params.get(k)
        if v is None:
            continue
        val = str(v)
        if val == '':
            continue
        items.append((k, val))
    return items


def build_sign_data_encoded(params: dict, *, exclude: frozenset) -> str:
    """PHP urlencode(key)=urlencode(value) — dùng khi tạo URL thanh toán."""
    items = _sign_items(params, exclude=exclude)
    return '&'.join(f'{quote_plus(k)}={quote_plus(v)}' for k, v in items)


def build_sign_data_raw(params: dict, *, exclude: frozenset) -> str:
    """Node qs.stringify(encode:false) — key=value không encode."""
    items = _sign_items(params, exclude=exclude)
    return '&'.join(f'{k}={v}' for k, v in items)


def build_sign_data_urlencode(params: dict, *, exclude: frozenset) -> str:
    """URLSearchParams / urllib urlencode — chỉ encode value."""
    items = _sign_items(params, exclude=exclude)
    return urlencode(items, quote_via=quote_plus)


def _hmac_matches(secret: str, sign_data: str, recv: str) -> bool:
    if not sign_data or not recv:
        return False
    calc = _hmac_sha512_hex(secret, sign_data)
    return hmac.compare_digest(calc.lower(), recv.strip().lower())


def _verify_variants(params: dict):
    """Trả về (sign_data, tên_variant) nếu khớp, else None."""
    secret = _secret_raw(_cfg())
    recv = (params.get('vnp_SecureHash') or '').strip()
    if not secret or not recv:
        return None

    # PHP IPN chính thức: chỉ bỏ vnp_SecureHash, giữ vnp_SecureHashType
    php_exclude = frozenset({'vnp_SecureHash'})
    variants = [
        ('php_encoded_keep_type', build_sign_data_encoded(params, exclude=php_exclude)),
        ('php_raw_keep_type', build_sign_data_raw(params, exclude=php_exclude)),
        ('node_encoded', build_sign_data_urlencode(params, exclude=_SIGN_EXCLUDE_VERIFY)),
        ('node_raw', build_sign_data_raw(params, exclude=_SIGN_EXCLUDE_VERIFY)),
        ('node_encoded_keyval', build_sign_data_encoded(params, exclude=_SIGN_EXCLUDE_VERIFY)),
    ]
    for name, sign_data in variants:
        if _hmac_matches(secret, sign_data, recv):
            return sign_data, name
    return None


def verify_vnpay_signature(params: dict, query_string: str = ''):
    cfg = _cfg()
    secret = _secret_raw(cfg)
    if not secret:
        return False, 'Thiếu HASH_SECRET'

    recv = (params.get('vnp_SecureHash') or '').strip()
    if not recv:
        return False, 'Thiếu vnp_SecureHash'

    matched = _verify_variants(params)
    if matched:
        _, variant = matched
        logger.debug('VNPay verify OK (%s)', variant)
        return True, None

    # Log debug — không ghi secret
    php_exclude = frozenset({'vnp_SecureHash'})
    previews = {
        'php_keep_type': build_sign_data_encoded(params, exclude=php_exclude)[:100],
        'node_raw': build_sign_data_raw(params, exclude=_SIGN_EXCLUDE_VERIFY)[:100],
    }
    logger.warning(
        'VNPay verify fail | secret_len=%s recv=%s… | previews=%s | params=%s | qs_len=%s',
        len(secret),
        recv[:16],
        previews,
        {k: params[k] for k in sorted(params) if k.startswith('vnp_')},
        len(query_string or ''),
    )
    return False, 'Sai chữ ký'


verify_ipn_params = verify_vnpay_signature


def is_vnpay_portal_test_ipn(params: dict) -> bool:
    """
    Nút «Test call IPN» trên cổng merchant sandbox gửi dữ liệu giả:
    vnp_SecureHash=hash_test, vnp_BankCode=BANK_TEST, vnp_TxnRef=222222.
    Chỉ kiểm tra URL có nhận request — không có HMAC thật.
    """
    sh = (params.get('vnp_SecureHash') or '').strip().lower()
    bank = (params.get('vnp_BankCode') or '').strip()
    txn = (params.get('vnp_TxnRef') or '').strip()
    return sh in ('hash_test', 'test') and bank == 'BANK_TEST' and txn == '222222'


def create_payment_url(
    *,
    amount_vnd,
    txn_ref,
    order_info,
    ip_addr,
    locale='vn',
    bill_email='',
    bill_mobile='',
):
    cfg = _cfg()
    tmn = (cfg.get('TMN_CODE') or '').strip()
    secret = _secret_raw(cfg)
    pay_url = (cfg.get('PAYMENT_URL') or '').strip() or 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
    return_url = (cfg.get('RETURN_URL') or '').strip()

    if not (tmn and secret and return_url):
        return None, 'Chưa cấu hình settings.VNPAY (TMN_CODE, HASH_SECRET, RETURN_URL)'

    from django.utils import timezone

    create_date = timezone.localtime().strftime('%Y%m%d%H%M%S')
    amount = int(round(float(amount_vnd) * 100))
    if amount <= 0:
        return None, 'Số tiền không hợp lệ'

    # Tham số cốt lõi — khớp sample VNPay 2.1.0 + thư viện vnpay (URL encoded)
    data = {
        'vnp_Version': '2.1.0',
        'vnp_Command': 'pay',
        'vnp_TmnCode': tmn,
        'vnp_Amount': str(amount),
        'vnp_CurrCode': 'VND',
        'vnp_TxnRef': str(txn_ref)[:100],
        'vnp_OrderInfo': _order_info_ascii(order_info),
        'vnp_OrderType': 'other',
        'vnp_Locale': locale if locale in ('vn', 'en') else 'vn',
        'vnp_ReturnUrl': return_url,
        'vnp_CreateDate': create_date,
        'vnp_IpAddr': _normalize_vnpay_ip(ip_addr),
    }

    # HMAC-SHA512: quote_plus từng value (space → +), sort alphabet
    sign_data = build_sign_data_urlencode(data, exclude=_SIGN_EXCLUDE_CREATE)
    secure_hash = _hmac_sha512_hex(secret, sign_data)
    full_url = f'{pay_url}?{sign_data}&vnp_SecureHash={secure_hash}'
    logger.warning(
        'VNPay tạo URL txn=%s amount=%s sign_len=%s return=%s',
        txn_ref,
        amount,
        len(sign_data),
        return_url[:60],
    )
    return full_url, None


def build_payment_url(
    *,
    amount_vnd,
    txn_ref,
    order_info,
    ip_addr,
    locale='vn',
    bill_email='',
    bill_mobile='',
):
    return create_payment_url(
        amount_vnd=amount_vnd,
        txn_ref=txn_ref,
        order_info=order_info,
        ip_addr=ip_addr,
        locale=locale,
        bill_email=bill_email,
        bill_mobile=bill_mobile,
    )


def vnpay_da_cau_hinh() -> bool:
    cfg = _cfg()
    return bool(
        (cfg.get('TMN_CODE') or '').strip()
        and _secret_raw(cfg)
        and (cfg.get('RETURN_URL') or '').strip()
    )
