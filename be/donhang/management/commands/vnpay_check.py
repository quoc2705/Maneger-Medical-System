from django.conf import settings
from django.core.management.base import BaseCommand

from donhang.vnpay_utils import probe_vnpay_credentials


class Command(BaseCommand):
    help = 'Kiểm tra TMN + HASH_SECRET có được VNPay sandbox chấp nhận không'

    def handle(self, *args, **options):
        cfg = getattr(settings, 'VNPAY', {})
        self.stdout.write(f"TMN_CODE: {cfg.get('TMN_CODE', '')}")
        self.stdout.write(f"HASH_SECRET length: {len((cfg.get('HASH_SECRET') or '').strip())}")
        self.stdout.write(f"RETURN_URL: {cfg.get('RETURN_URL', '')}")
        self.stdout.write('Sending test URL to VNPay sandbox...')

        ok, msg = probe_vnpay_credentials()
        if ok:
            self.stdout.write(self.style.SUCCESS(msg))
        else:
            self.stdout.write(self.style.ERROR(msg))
