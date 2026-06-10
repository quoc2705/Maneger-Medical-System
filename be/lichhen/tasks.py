from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task
def huy_lich_hen_qua_ngay_task():
    """Task định kỳ: hủy lịch hẹn quá ngày."""
    from .overdue_services import huy_lich_hen_qua_ngay

    count = huy_lich_hen_qua_ngay(gui_thong_bao=True, limit=1000)
    return {'da_huy': count}
