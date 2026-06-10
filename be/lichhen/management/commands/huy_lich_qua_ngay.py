from django.core.management.base import BaseCommand

from lichhen.overdue_services import huy_lich_hen_qua_ngay


class Command(BaseCommand):
    help = 'Hủy các lịch hẹn đã qua ngày (chưa hoàn thành)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--khong-thong-bao',
            action='store_true',
            help='Không gửi thông báo in-app cho bệnh nhân',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=500,
            help='Số lịch tối đa xử lý mỗi lần chạy',
        )

    def handle(self, *args, **options):
        count = huy_lich_hen_qua_ngay(
            gui_thong_bao=not options['khong_thong_bao'],
            limit=options['limit'],
        )
        if count:
            self.stdout.write(self.style.SUCCESS(f'Đã hủy {count} lịch quá ngày.'))
        else:
            self.stdout.write('Không có lịch quá ngày cần hủy.')
