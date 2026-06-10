"""Gửi thông báo in-app và email sau khi VNPay xác nhận thanh toán đơn online."""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _email_benh_nhan(don_hang):
    email = (don_hang.email_nhan or '').strip()
    if email:
        return email
    try:
        return (don_hang.benh_nhan.nguoi_dung.email or '').strip()
    except Exception:
        return ''


def gui_xac_nhan_thanh_toan_vnpay(don_hang, *, ma_giao_dich=''):
    """
    Thông báo trong app + email (nếu bật EMAIL_ENABLED và có địa chỉ nhận).
    Gọi sau khi IPN ghi nhận thanh toán thành công.
    """
    nguoi_dung = don_hang.benh_nhan.nguoi_dung
    so_tien = f'{float(don_hang.tong_tien):,.0f}đ'
    ma_don = don_hang.ma_don_hang

    try:
        from thongbao.models import ThongBao

        noi_dung_tb = (
            f'Đơn hàng {ma_don} đã thanh toán VNPay thành công ({so_tien}). '
            f'Phòng khám sẽ chuẩn bị và giao hàng theo địa chỉ đã đăng ký.'
        )
        if ma_giao_dich:
            noi_dung_tb += f' Mã giao dịch: {ma_giao_dich}.'

        ThongBao.tao_thong_bao(
            nguoi_nhan=nguoi_dung,
            loai='THANH_TOAN',
            tieu_de='Thanh toán VNPay thành công',
            noi_dung=noi_dung_tb,
        )
    except Exception:
        logger.exception('VNPay: không gửi được thông báo in-app đơn %s', ma_don)

    if not getattr(settings, 'EMAIL_ENABLED', False):
        return

    to_email = _email_benh_nhan(don_hang)
    if not to_email:
        logger.info('VNPay: bỏ qua email — đơn %s không có email nhận', don_hang.ma_don_hang)
        return

    clinic = getattr(settings, 'CLINIC_NAME', 'PhòngKhám+')
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or 'noreply@phongkham.local'
    subject = f'[{clinic}] Xác nhận thanh toán đơn hàng {don_hang.ma_don_hang}'
    body_lines = [
        f'Kính gửi {don_hang.ten_nguoi_nhan or nguoi_dung.ho_ten},',
        '',
        f'Chúng tôi đã nhận thanh toán VNPay cho đơn hàng {don_hang.ma_don_hang}.',
        f'Số tiền: {so_tien}',
    ]
    if ma_giao_dich:
        body_lines.append(f'Mã giao dịch VNPay: {ma_giao_dich}')
    body_lines.extend([
        '',
        'Thông tin giao hàng:',
        f'  - Người nhận: {don_hang.ten_nguoi_nhan or "—"}',
        f'  - SĐT: {don_hang.so_dien_thoai_nhan or "—"}',
        f'  - Địa chỉ: {don_hang.dia_chi_giao_hang or "—"}',
        '',
        'Đơn hàng đang được chuẩn bị. Bạn có thể theo dõi trạng thái trong mục «Đơn hàng của tôi» trên ứng dụng.',
        '',
        f'Trân trọng,',
        f'{clinic}',
    ])
    try:
        send_mail(
            subject=subject,
            message='\n'.join(body_lines),
            from_email=from_email,
            recipient_list=[to_email],
            fail_silently=False,
        )
        logger.info('VNPay: đã gửi email xác nhận đơn %s → %s', don_hang.ma_don_hang, to_email)
    except Exception:
        logger.exception('VNPay: gửi email thất bại đơn %s → %s', don_hang.ma_don_hang, to_email)
