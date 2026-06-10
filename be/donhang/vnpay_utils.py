"""
VNPay Payment Gateway 2.1.0 — HMAC-SHA512.

Tạo URL thanh toán: sort key alphabet → urlencode(key)=urlencode(value) → HMAC-SHA512 (chuẩn PHP VNPay).
Verify IPN/Return: thử nhiều biến thể (PHP giữ vnp_SecureHashType, Node bỏ cả hai).
"""
import hashlib
import hmac
import logging
import unicodedata
import urllib.request
from urllib.parse import quote_plus, urlencode, urlparse

from django.conf import settings

logger = logging.getLogger(__name__)

_SIGN_EXCLUDE = frozenset({'vnp_SecureHash', 'vnp_SecureHashType'})
MOCK_SECURE_HASH = 'mock_test'


def _cfg():
    return getattr(settings, 'VNPAY', None) or {}


def is_vnpay_test_mode() -> bool:
    return bool(_cfg().get('TEST_MODE'))


def is_vnpay_mock_payment(params: dict) -> bool:
    if not is_vnpay_test_mode():
        return False
    sh = (params.get('vnp_SecureHash') or '').strip().lower()
    return sh == MOCK_SECURE_HASH


def _mock_payment_base() -> str:
    cfg = _cfg()
    for url in (cfg.get('IPN_URL'), cfg.get('RETURN_URL')):
        url = (url or '').strip()
        if not url:
            continue
        p = urlparse(url)
        if p.scheme and p.netloc:
            return f'{p.scheme}://{p.netloc}/api/don-hang/vnpay-mock/'
    site = (getattr(settings, 'SITE_URL', None) or '').strip().rstrip('/')
    if site:
        return f'{site}/api/don-hang/vnpay-mock/'
    return '/api/don-hang/vnpay-mock/'


def _secret_raw(cfg=None):
    cfg = cfg or _cfg()
    return (cfg.get('HASH_SECRET') or '').strip()


def _normalize_vnpay_ip(ip: str) -> str:
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


def build_sign_data(params: dict, *, exclude: frozenset = _SIGN_EXCLUDE) -> str:
    """
    Chuỗi ký chuẩn VNPay 2.1.0 (sample PHP):
    urlencode(key)=urlencode(value), nối bằng &, sort alphabet.
    Khoảng trắng → '+' (không phải %20).
    """
    items = _sign_items(params, exclude=exclude)
    return '&'.join(f'{quote_plus(k)}={quote_plus(v)}' for k, v in items)


def build_sign_data_raw(params: dict, *, exclude: frozenset) -> str:
    items = _sign_items(params, exclude=exclude)
    return '&'.join(f'{k}={v}' for k, v in items)


def build_sign_data_urlencode(params: dict, *, exclude: frozenset) -> str:
    items = _sign_items(params, exclude=exclude)
    return urlencode(items, quote_via=quote_plus)


def _hmac_matches(secret: str, sign_data: str, recv: str) -> bool:
    if not sign_data or not recv:
        return False
    calc = _hmac_sha512_hex(secret, sign_data)
    return hmac.compare_digest(calc.lower(), recv.strip().lower())


def _verify_variants(params: dict):
    secret = _secret_raw()
    recv = (params.get('vnp_SecureHash') or '').strip()
    if not secret or not recv:
        return None

    php_exclude = frozenset({'vnp_SecureHash'})
    variants = [
        ('php_keep_type', build_sign_data(params, exclude=php_exclude)),
        ('php_raw_keep_type', build_sign_data_raw(params, exclude=php_exclude)),
        ('node_encoded', build_sign_data_urlencode(params, exclude=_SIGN_EXCLUDE)),
        ('node_raw', build_sign_data_raw(params, exclude=_SIGN_EXCLUDE)),
        ('node_php_no_type', build_sign_data(params, exclude=_SIGN_EXCLUDE)),
    ]
    for name, sign_data in variants:
        if _hmac_matches(secret, sign_data, recv):
            return sign_data, name
    return None


def verify_vnpay_signature(params: dict, query_string: str = ''):
    if is_vnpay_mock_payment(params):
        return True, None

    secret = _secret_raw()
    if not secret:
        return False, 'Thiếu HASH_SECRET'

    recv = (params.get('vnp_SecureHash') or '').strip()
    if not recv:
        return False, 'Thiếu vnp_SecureHash'

    matched = _verify_variants(params)
    if matched:
        return True, None

    logger.warning(
        'VNPay verify fail | secret_len=%s recv=%s… | params=%s',
        len(secret),
        recv[:16],
        {k: params[k] for k in sorted(params) if k.startswith('vnp_')},
    )
    return False, 'Sai chữ ký'


verify_ipn_params = verify_vnpay_signature


def is_vnpay_portal_test_ipn(params: dict) -> bool:
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
    return_url = (cfg.get('RETURN_URL') or '').strip()

    if is_vnpay_test_mode():
        if not return_url and not (getattr(settings, 'SITE_URL', None) or '').strip():
            return None, 'Chưa cấu hình VNPAY_RETURN_URL hoặc SITE_URL (cần cho môi trường test)'
        amount = int(round(float(amount_vnd) * 100))
        if amount <= 0:
            return None, 'Số tiền không hợp lệ'
        qs = urlencode(
            {
                'txn_ref': str(txn_ref)[:100],
                'amount': str(amount),
                'order_info': _order_info_ascii(order_info, max_len=80),
            },
            quote_via=quote_plus,
        )
        mock_url = f'{_mock_payment_base()}?{qs}'
        logger.info('VNPay TEST_MODE: mock URL txn=%s amount=%s', txn_ref, amount)
        return mock_url, None

    tmn = (cfg.get('TMN_CODE') or '').strip()
    secret = _secret_raw(cfg)
    pay_url = (cfg.get('PAYMENT_URL') or '').strip() or 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

    if not (tmn and secret and return_url):
        return None, 'Chưa cấu hình settings.VNPAY (TMN_CODE, HASH_SECRET, RETURN_URL)'

    from django.utils import timezone

    create_date = timezone.localtime().strftime('%Y%m%d%H%M%S')
    amount = int(round(float(amount_vnd) * 100))
    if amount <= 0:
        return None, 'Số tiền không hợp lệ'

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

    sign_data = build_sign_data(data)
    secure_hash = _hmac_sha512_hex(secret, sign_data)
    full_url = f'{pay_url}?{sign_data}&vnp_SecureHash={secure_hash}'
    logger.warning(
        'VNPay tạo URL txn=%s amount=%s tmn=%s sign_prefix=%s',
        txn_ref,
        amount,
        tmn,
        sign_data[:80],
    )
    return full_url, None


def build_payment_url(**kwargs):
    return create_payment_url(**kwargs)


def vnpay_da_cau_hinh() -> bool:
    cfg = _cfg()
    if is_vnpay_test_mode():
        return bool(
            (cfg.get('RETURN_URL') or '').strip()
            or (getattr(settings, 'SITE_URL', None) or '').strip()
        )
    return bool(
        (cfg.get('TMN_CODE') or '').strip()
        and _secret_raw(cfg)
        and (cfg.get('RETURN_URL') or '').strip()
    )


def build_mock_return_query(txn_ref: str, amount_cents: int, *, success: bool = True) -> str:
    """Query string giả lập VNPay Return (chỉ dùng khi TEST_MODE)."""
    from django.utils import timezone

    params = {
        'vnp_TxnRef': txn_ref,
        'vnp_Amount': str(amount_cents),
        'vnp_ResponseCode': '00' if success else '24',
        'vnp_TransactionStatus': '00' if success else '02',
        'vnp_TransactionNo': f'MOCK{timezone.localtime().strftime("%Y%m%d%H%M%S")}',
        'vnp_BankCode': 'MOCK_BANK',
        'vnp_PayDate': timezone.localtime().strftime('%Y%m%d%H%M%S'),
        'vnp_SecureHash': MOCK_SECURE_HASH,
    }
    return urlencode(params, quote_via=quote_plus)


def probe_vnpay_credentials(timeout: int = 15):
    """
    Gửi URL test lên sandbox VNPay — trả (ok, message).
    ok=False + code 70 → HASH_SECRET không khớp server VNPay (không phải lỗi code).
    """
    if is_vnpay_test_mode():
        return True, 'VNPAY_TEST_MODE=true — dùng trang mock local, không cần secret VNPay'
    if not vnpay_da_cau_hinh():
        return False, 'Chưa cấu hình VNPAY_TMN_CODE / VNPAY_HASH_SECRET / VNPAY_RETURN_URL'

    url, err = create_payment_url(
        amount_vnd=100000,
        txn_ref='PROBE_VNPAY',
        order_info='Kiem tra cau hinh',
        ip_addr='127.0.0.1',
    )
    if err:
        return False, err

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=timeout)
        final = resp.geturl()
    except Exception as exc:
        return False, f'Không kết nối được VNPay: {exc}'

    if 'code=70' in final or 'Error.html' in final:
        tmn = _cfg().get('TMN_CODE', '')
        return False, (
            f'VNPay rejected signature (code 70). TMN={tmn}. '
            'VNPAY_HASH_SECRET in .env does not match VNPay server. '
            'Email hotrovnpay@vnpay.vn to request a new Hash Secret for this website.'
        )
    return True, f'Credentials OK - VNPay accepted URL (redirect: {final[:80]}...)'
