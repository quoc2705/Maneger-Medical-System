import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phongkham.settings')

app = Celery('phongkham')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Cấu hình Celery Beat - Task định kỳ
app.conf.beat_schedule = {
    # Nhắc lịch hẹn trước 1 ngày (thông báo tài khoản + SMS) — mỗi 15 phút quét NhacNhoLichHen đến hạn
    'nhac-lich-hen-truoc-1-ngay': {
        'task': 'thongbao.tasks.xu_ly_nhac_lich_hen_truoc_moc',
        'schedule': crontab(minute='*/15'),
    },
    
    # Kiểm tra thuốc hết hạn mỗu tuần (Thứ 2 lúc 9h)
    'kiem-tra-thuoc-het-han-hang-tuan': {
        'task': 'thongbao.tasks.kiem_tra_thuoc_het_han',
        'schedule': crontab(day_of_week=1, hour=9, minute=0),  # 9:00 AM Thứ 2
    },

    # Hủy lịch hẹn quá ngày — mỗi ngày 00:30 và mỗi 6 giờ (phòng Celery tắt)
    'huy-lich-hen-qua-ngay-dem': {
        'task': 'lichhen.tasks.huy_lich_hen_qua_ngay_task',
        'schedule': crontab(hour=0, minute=30),
    },
    'huy-lich-hen-qua-ngay-6h': {
        'task': 'lichhen.tasks.huy_lich_hen_qua_ngay_task',
        'schedule': crontab(minute=15, hour='*/6'),
    },
}

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')