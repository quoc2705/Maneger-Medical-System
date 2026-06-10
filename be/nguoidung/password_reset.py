"""Gửi email đặt lại mật khẩu."""
import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)

FORGOT_PASSWORD_MSG = (
    'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.'
)


def build_reset_link(user, *, base_url=None):
    site = (base_url or getattr(settings, 'SITE_URL', None) or '').strip().rstrip('/')
    if not site:
        site = 'http://127.0.0.1:8000'
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f'{site}/login/?reset={uid}&token={token}'


def gui_email_dat_lai_mat_khau(user, *, reset_url):
    if not getattr(settings, 'EMAIL_ENABLED', False):
        logger.info('Quên MK: EMAIL_ENABLED=false — link cho %s: %s', user.email, reset_url)
        return False

    clinic = getattr(settings, 'CLINIC_NAME', 'PhòngKhám+')
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or 'noreply@phongkham.local'
    subject = f'[{clinic}] Đặt lại mật khẩu'
    body_lines = [
        f'Kính gửi {user.ho_ten or user.ten_dang_nhap},',
        '',
        'Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu tài khoản PhòngKhám+.',
        'Nhấn vào liên kết bên dưới để tạo mật khẩu mới (liên kết có hiệu lực 24 giờ):',
        '',
        reset_url,
        '',
        'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn an toàn.',
        '',
        f'Trân trọng,',
        f'{clinic}',
    ]
    try:
        send_mail(
            subject,
            '\n'.join(body_lines),
            from_email,
            [user.email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception('Không gửi được email đặt lại MK cho %s', user.email)
        return False
