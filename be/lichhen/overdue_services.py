"""Tự động hủy lịch hẹn đã qua ngày (chưa hoàn thành)."""
from datetime import datetime, time, timedelta
import logging

from django.db import transaction
from django.utils import timezone

from .models import LichHen, LichSuLichHen, NhacNhoLichHen

logger = logging.getLogger(__name__)

TRANG_THAI_CHO_HUY = (
    'CHO_XAC_NHAN',
    'DA_DAT',
    'DA_XAC_NHAN',
    'CHECKED_IN',
    'QUA_HAN',
    'DANG_KHAM',
)

LY_DO_HUY_QUA_NGAY = (
    'Tự động hủy — lịch hẹn quá ngày, bệnh nhân không đến hoặc không hoàn tất khám.'
)


def _khoang_ngay_trong_tz(ngay_date):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(ngay_date, time.min), tz)
    end = start + timedelta(days=1)
    return start, end


def huy_lich_hen_qua_ngay(*, gui_thong_bao=True, limit=500) -> int:
    """
    Hủy các lịch có ngày hẹn trước hôm nay (giờ VN) và vẫn ở trạng thái chờ/khám dở.
    Trả về số lịch đã hủy.
    """
    from nguoidung.models import ThongBao

    hom_nay = timezone.localdate()
    start_today, _ = _khoang_ngay_trong_tz(hom_nay)

    ids = list(
        LichHen.objects.filter(
            trang_thai__in=TRANG_THAI_CHO_HUY,
            ngay_gio_hen__lt=start_today,
        )
        .order_by('ngay_gio_hen')
        .values_list('pk', flat=True)[:limit]
    )

    da_huy = 0
    for pk in ids:
        try:
            with transaction.atomic():
                lh = (
                    LichHen.objects.select_for_update()
                    .select_related('benh_nhan__nguoi_dung')
                    .filter(pk=pk, trang_thai__in=TRANG_THAI_CHO_HUY)
                    .first()
                )
                if not lh or lh.ngay_gio_hen >= start_today:
                    continue

                tt_cu = lh.trang_thai
                lh.huy(LY_DO_HUY_QUA_NGAY, nguoi_huy=None)
                LichSuLichHen.objects.create(
                    lich_hen=lh,
                    trang_thai_cu=tt_cu,
                    trang_thai_moi='DA_HUY',
                    ghi_chu=LY_DO_HUY_QUA_NGAY,
                    nguoi_thay_doi=None,
                )
                NhacNhoLichHen.objects.filter(lich_hen=lh, trang_thai='CHO_GUI').delete()

                if gui_thong_bao:
                    gio = timezone.localtime(lh.ngay_gio_hen).strftime('%H:%M %d/%m/%Y')
                    ThongBao.objects.create(
                        nguoi_nhan=lh.benh_nhan.nguoi_dung,
                        loai='LICH_HEN',
                        tieu_de='Lịch hẹn đã bị hủy (quá hạn)',
                        noi_dung=(
                            f'Lịch {lh.get_loai_lich_display()} lúc {gio} '
                            f'(mã {lh.ma_lich_hen or lh.pk}) đã quá ngày và được hệ thống tự động hủy. '
                            f'Bạn có thể đặt lịch mới trên ứng dụng.'
                        ),
                        du_lieu_lien_quan={
                            'lich_hen_id': str(lh.pk),
                            'ma_lich_hen': lh.ma_lich_hen or '',
                            'loai': 'tu_dong_huy_qua_ngay',
                        },
                    )
                da_huy += 1
        except Exception:
            logger.exception('huy_lich_hen_qua_ngay: lỗi lịch %s', pk)

    if da_huy:
        logger.info('huy_lich_hen_qua_ngay: đã hủy %s lịch quá ngày', da_huy)
    return da_huy
