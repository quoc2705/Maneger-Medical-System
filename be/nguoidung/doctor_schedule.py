"""Ca làm bác sĩ — bảng doctor_schedule và tiện ích phân ca."""
from datetime import time

from django.utils import timezone

# Ca sáng 06:00–11:59 | chiều 12:00–17:59 | tối 18:00–21:59 (giờ máy chủ / TIME_ZONE)
CA_SANG = 'SANG'
CA_CHIEU = 'CHIEU'
CA_TOI = 'TOI'

CA_LAM_CHOICES = [
    (CA_SANG, 'Ca sáng'),
    (CA_CHIEU, 'Ca chiều'),
    (CA_TOI, 'Ca tối'),
]

CA_LABEL = dict(CA_LAM_CHOICES)


def phan_ca_tu_thoi_diem(dt=None):
    """Suy ra ca làm từ datetime (aware → local)."""
    if dt is None:
        dt = timezone.now()
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    h = dt.hour
    if h < 12:
        return CA_SANG
    if h < 18:
        return CA_CHIEU
    return CA_TOI


def phan_ca_tu_gio(time_obj):
    """Suy ra ca từ time (không ngày)."""
    if time_obj < time(12, 0):
        return CA_SANG
    if time_obj < time(18, 0):
        return CA_CHIEU
    return CA_TOI


# Giờ kết thúc đăng ký ca trong ngày (theo TIME_ZONE)
_CA_HET_GIO = {
    CA_SANG: 12,   # sau 11:59
    CA_CHIEU: 18,  # sau 17:59
    CA_TOI: 22,    # sau 21:59
}


def ca_lam_da_qua(ngay_date, ca_lam, now=None):
    """True nếu ngày/ca đã qua — không cho đăng ký mới."""
    now = now or timezone.now()
    local = timezone.localtime(now)
    today = local.date()
    if ngay_date < today:
        return True
    if ngay_date > today:
        return False
    het_gio = _CA_HET_GIO.get(ca_lam)
    if het_gio is None:
        return False
    return local.hour >= het_gio


def bac_si_id_co_ca_trong_ngay(ngay_date, ca_lam):
    from nguoidung.models import DoctorSchedule

    return set(
        DoctorSchedule.objects.filter(
            ngay_lam=ngay_date,
            ca_lam=ca_lam,
        ).values_list('bac_si_id', flat=True)
    )


def cac_ca_bac_si_trong_ngay(ngay_date):
    """{bac_si_id: ['SANG', 'CHIEU', ...]}"""
    from nguoidung.models import DoctorSchedule

    out = {}
    for row in DoctorSchedule.objects.filter(ngay_lam=ngay_date).values('bac_si_id', 'ca_lam'):
        out.setdefault(row['bac_si_id'], []).append(row['ca_lam'])
    return out
