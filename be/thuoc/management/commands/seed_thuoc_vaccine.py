"""Nạp dữ liệu mẫu thuốc, vaccine và tồn kho."""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from thuoc.models import (
    ChiTietPhieuNhapThuoc,
    ChiTietPhieuNhapVaccine,
    DonViTinh,
    KhoThuoc,
    KhoVaccine,
    LoaiThuoc,
    LoaiVaccine,
    NhaCungCap,
    PhieuNhapKho,
    Thuoc,
    ThuocNhaCungCap,
    Vaccine,
)


class Command(BaseCommand):
    help = 'Nạp dữ liệu mẫu: loại thuốc/vaccine, NCC, thuốc, vaccine và tồn kho'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Xóa dữ liệu thuốc/vaccine mẫu (theo mã TH*/VC*) trước khi nạp lại',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['clear']:
            self._clear_sample_data()

        ncc_dhg, _ = NhaCungCap.objects.get_or_create(
            ma_ncc='NCC001',
            defaults={
                'ten_ncc': 'DHG Pharma',
                'dia_chi': '179 Đường Cao Lỗ, Phường 4, Quận 8, TP.HCM',
                'so_dien_thoai': '02838560303',
                'email': 'contact@dhgpharma.com.vn',
                'ma_so_thue': '0301234567',
                'nguoi_lien_he': 'Nguyễn Văn A',
            },
        )
        ncc_sanofi, _ = NhaCungCap.objects.get_or_create(
            ma_ncc='NCC002',
            defaults={
                'ten_ncc': 'Sanofi Vietnam',
                'dia_chi': 'Lô III-2, Đường số 11, KCN SHTP, TP.HCM',
                'so_dien_thoai': '02854113999',
                'email': 'info@sanofi.com',
                'ma_so_thue': '0304567890',
                'nguoi_lien_he': 'Trần Thị B',
            },
        )

        don_vi = {}
        for ten, ky_hieu in [
            ('Viên', 'viên'),
            ('Chai', 'chai'),
            ('Hộp', 'hộp'),
            ('Ống', 'ống'),
            ('Vỉ', 'vỉ'),
        ]:
            obj, _ = DonViTinh.objects.get_or_create(ten_don_vi=ten, defaults={'ky_hieu': ky_hieu})
            don_vi[ten] = obj

        loai_thuoc = {}
        for ten, mo_ta in [
            ('Giảm đau - Hạ sốt', 'Paracetamol, Ibuprofen...'),
            ('Kháng sinh', 'Amoxicillin, Azithromycin...'),
            ('Vitamin & Khoáng chất', 'Vitamin C, B complex...'),
            ('Tiêu hóa', 'Omeprazole, Domperidone...'),
            ('Tim mạch', 'Amlodipine, Atorvastatin...'),
        ]:
            obj, _ = LoaiThuoc.objects.get_or_create(ten_loai=ten, defaults={'mo_ta': mo_ta})
            loai_thuoc[ten] = obj

        loai_vaccine = {}
        for ten, mo_ta in [
            ('Tiêm chủng mở rộng', 'Vaccine trong chương trình tiêm chủng quốc gia'),
            ('Tiêm chủng dịch vụ', 'Vaccine dịch vụ tự nguyện'),
            ('Vaccine cúm & dịch tễ', 'Phòng cúm mùa và bệnh truyền nhiễm'),
        ]:
            obj, _ = LoaiVaccine.objects.get_or_create(ten_loai=ten, defaults={'mo_ta': mo_ta})
            loai_vaccine[ten] = obj

        today = date.today()
        nhap = today - timedelta(days=30)
        han_thuoc = today + timedelta(days=365 * 2)
        han_vaccine = today + timedelta(days=365)

        thuoc_data = [
            {
                'ma_thuoc': f'TH{today.year}0001',
                'ten_thuoc': 'Paracetamol 500mg',
                'loai': 'Giảm đau - Hạ sốt',
                'don_vi': 'Viên',
                'don_gia_nhap': Decimal('500'),
                'gia_ban': Decimal('800'),
                'ham_luong': '500mg',
                'thanh_phan': 'Paracetamol',
                'cach_dung': 'Uống sau ăn, mỗi lần 1-2 viên, cách 4-6 giờ',
                'chi_dinh': 'Giảm đau, hạ sốt',
                'ncc': ncc_dhg,
                'ton': 500,
                'lo_sx': 'L202601',
            },
            {
                'ma_thuoc': f'TH{today.year}0002',
                'ten_thuoc': 'Amoxicillin 500mg',
                'loai': 'Kháng sinh',
                'don_vi': 'Viên',
                'don_gia_nhap': Decimal('1200'),
                'gia_ban': Decimal('2000'),
                'ham_luong': '500mg',
                'thanh_phan': 'Amoxicillin trihydrate',
                'cach_dung': 'Uống 2 lần/ngày, mỗi lần 1 viên',
                'chi_dinh': 'Nhiễm khuẩn đường hô hấp, tiết niệu',
                'can_don_thuoc': True,
                'ncc': ncc_dhg,
                'ton': 200,
                'lo_sx': 'L202602',
            },
            {
                'ma_thuoc': f'TH{today.year}0003',
                'ten_thuoc': 'Vitamin C 1000mg',
                'loai': 'Vitamin & Khoáng chất',
                'don_vi': 'Viên',
                'don_gia_nhap': Decimal('800'),
                'gia_ban': Decimal('1500'),
                'ham_luong': '1000mg',
                'thanh_phan': 'Acid ascorbic',
                'cach_dung': 'Uống 1 viên/ngày sau bữa ăn',
                'chi_dinh': 'Bổ sung vitamin C',
                'ncc': ncc_dhg,
                'ton': 300,
                'lo_sx': 'L202603',
            },
            {
                'ma_thuoc': f'TH{today.year}0004',
                'ten_thuoc': 'Omeprazole 20mg',
                'loai': 'Tiêu hóa',
                'don_vi': 'Viên',
                'don_gia_nhap': Decimal('1500'),
                'gia_ban': Decimal('3000'),
                'ham_luong': '20mg',
                'thanh_phan': 'Omeprazole',
                'cach_dung': 'Uống 1 viên/ngày trước bữa sáng',
                'chi_dinh': 'Viêm loét dạ dày, trào ngược',
                'can_don_thuoc': True,
                'ncc': ncc_sanofi,
                'ton': 150,
                'lo_sx': 'L202604',
            },
            {
                'ma_thuoc': f'TH{today.year}0005',
                'ten_thuoc': 'Amlodipine 5mg',
                'loai': 'Tim mạch',
                'don_vi': 'Viên',
                'don_gia_nhap': Decimal('2000'),
                'gia_ban': Decimal('4500'),
                'ham_luong': '5mg',
                'thanh_phan': 'Amlodipine besylate',
                'cach_dung': 'Uống 1 viên/ngày',
                'chi_dinh': 'Tăng huyết áp',
                'can_don_thuoc': True,
                'ncc': ncc_sanofi,
                'ton': 100,
                'lo_sx': 'L202605',
            },
            {
                'ma_thuoc': f'TH{today.year}0006',
                'ten_thuoc': 'Oresol (bột pha)',
                'loai': 'Tiêu hóa',
                'don_vi': 'Gói',
                'don_gia_nhap': Decimal('1500'),
                'gia_ban': Decimal('2500'),
                'ham_luong': '4.1g/gói',
                'thanh_phan': 'Glucose, Natri clorid, Kali clorid',
                'cach_dung': 'Pha 1 gói với 200ml nước, uống từng ngụm',
                'chi_dinh': 'Mất nước, tiêu chảy',
                'ncc': ncc_dhg,
                'ton': 400,
                'lo_sx': 'L202606',
            },
        ]

        # Đảm bảo đơn vị Gói tồn tại
        if 'Gói' not in don_vi:
            don_vi['Gói'], _ = DonViTinh.objects.get_or_create(ten_don_vi='Gói', defaults={'ky_hieu': 'gói'})

        thuoc_count = 0
        for item in thuoc_data:
            thuoc, created = Thuoc.objects.get_or_create(
                ma_thuoc=item['ma_thuoc'],
                defaults={
                    'ten_thuoc': item['ten_thuoc'],
                    'loai_thuoc': loai_thuoc[item['loai']],
                    'don_gia_nhap': item['don_gia_nhap'],
                    'gia_ban': item['gia_ban'],
                    'don_vi': don_vi[item['don_vi']],
                    'ham_luong': item.get('ham_luong', ''),
                    'thanh_phan': item.get('thanh_phan', ''),
                    'cach_dung': item.get('cach_dung', ''),
                    'chi_dinh': item.get('chi_dinh', ''),
                    'can_don_thuoc': item.get('can_don_thuoc', False),
                    'nha_san_xuat': item['ncc'].ten_ncc,
                    'nuoc_san_xuat': 'Việt Nam',
                    'trang_thai': True,
                },
            )
            ThuocNhaCungCap.objects.get_or_create(
                thuoc=thuoc,
                nha_cung_cap=item['ncc'],
                defaults={'gia_cung_cap': item['don_gia_nhap'], 'la_ncc_chinh': True},
            )
            if not KhoThuoc.objects.filter(thuoc=thuoc, lo_sx=item['lo_sx']).exists():
                KhoThuoc.objects.create(
                    thuoc=thuoc,
                    so_luong=item['ton'],
                    ngay_nhap=nhap,
                    han_su_dung=han_thuoc,
                    lo_sx=item['lo_sx'],
                    vi_tri='Kệ A',
                )
            if created:
                thuoc_count += 1

        vaccine_data = [
            {
                'ma_vaccine': f'VC{today.year}0001',
                'ten_vaccine': 'Vắc xin 6 in 1 (Infanrix Hexa)',
                'loai': 'Tiêm chủng mở rộng',
                'phong_benh': 'Bạch hầu, ho gà, uốn ván, bại liệt, Hib, viêm gan B',
                'do_tuoi_ap_dung': '2 - 12 tháng',
                'so_mui': 3,
                'lich_tiem': '2 tháng; 4 tháng; 6 tháng',
                'khoang_cach_mui': 60,
                'gia_nhap': Decimal('350000'),
                'gia_tiem': Decimal('650000'),
                'bao_quan': '2-8°C',
                'ncc': ncc_sanofi,
                'ton': 50,
                'lo_sx': 'V202601',
            },
            {
                'ma_vaccine': f'VC{today.year}0002',
                'ten_vaccine': 'Vắc xin Viêm gan B sơ sinh',
                'loai': 'Tiêm chủng mở rộng',
                'phong_benh': 'Viêm gan B',
                'do_tuoi_ap_dung': 'Sơ sinh trong 24h đầu',
                'so_mui': 4,
                'lich_tiem': 'Sơ sinh; 1 tháng; 2 tháng; 6 tháng',
                'khoang_cach_mui': 30,
                'gia_nhap': Decimal('80000'),
                'gia_tiem': Decimal('150000'),
                'bao_quan': '2-8°C',
                'ncc': ncc_dhg,
                'ton': 80,
                'lo_sx': 'V202602',
            },
            {
                'ma_vaccine': f'VC{today.year}0003',
                'ten_vaccine': 'Vắc xin Cúm mùa (Vaxigrip Tetra)',
                'loai': 'Vaccine cúm & dịch tễ',
                'phong_benh': 'Cúm mùa (4 chủng)',
                'do_tuoi_ap_dung': 'Từ 6 tháng tuổi',
                'so_mui': 1,
                'lich_tiem': '1 mũi/năm',
                'gia_nhap': Decimal('180000'),
                'gia_tiem': Decimal('350000'),
                'bao_quan': '2-8°C',
                'ncc': ncc_sanofi,
                'ton': 120,
                'lo_sx': 'V202603',
                'la_vaccine_dich_vu': True,
            },
            {
                'ma_vaccine': f'VC{today.year}0004',
                'ten_vaccine': 'Vắc xin HPV (Gardasil 9)',
                'loai': 'Tiêm chủng dịch vụ',
                'phong_benh': 'HPV (9 chủng)',
                'do_tuoi_ap_dung': 'Từ 9 - 45 tuổi',
                'so_mui': 3,
                'lich_tiem': '0; 2 tháng; 6 tháng',
                'khoang_cach_mui': 60,
                'gia_nhap': Decimal('1200000'),
                'gia_tiem': Decimal('1800000'),
                'bao_quan': '2-8°C',
                'ncc': ncc_sanofi,
                'ton': 30,
                'lo_sx': 'V202604',
                'la_vaccine_dich_vu': True,
            },
            {
                'ma_vaccine': f'VC{today.year}0005',
                'ten_vaccine': 'Vắc xin Sởi - Rubella',
                'loai': 'Tiêm chủng mở rộng',
                'phong_benh': 'Sởi, Rubella',
                'do_tuoi_ap_dung': '9 - 12 tháng',
                'so_mui': 2,
                'lich_tiem': '9 tháng; 18 tháng',
                'khoang_cach_mui': 270,
                'gia_nhap': Decimal('60000'),
                'gia_tiem': Decimal('120000'),
                'bao_quan': '2-8°C',
                'ncc': ncc_dhg,
                'ton': 60,
                'lo_sx': 'V202605',
            },
        ]

        vaccine_count = 0
        for item in vaccine_data:
            vaccine, created = Vaccine.objects.get_or_create(
                ma_vaccine=item['ma_vaccine'],
                defaults={
                    'ten_vaccine': item['ten_vaccine'],
                    'loai_vaccine': loai_vaccine[item['loai']],
                    'phong_benh': item['phong_benh'],
                    'do_tuoi_ap_dung': item['do_tuoi_ap_dung'],
                    'so_mui': item['so_mui'],
                    'lich_tiem': item.get('lich_tiem', ''),
                    'khoang_cach_mui': item.get('khoang_cach_mui'),
                    'gia_nhap': item['gia_nhap'],
                    'gia_tiem': item['gia_tiem'],
                    'bao_quan': item.get('bao_quan', '2-8°C'),
                    'nha_cung_cap': item['ncc'],
                    'nha_san_xuat': item['ncc'].ten_ncc,
                    'nuoc_san_xuat': 'Pháp' if 'Sanofi' in item['ncc'].ten_ncc else 'Việt Nam',
                    'la_vaccine_dich_vu': item.get('la_vaccine_dich_vu', False),
                    'trang_thai': True,
                },
            )
            if not KhoVaccine.objects.filter(vaccine=vaccine, lo_sx=item['lo_sx']).exists():
                KhoVaccine.objects.create(
                    vaccine=vaccine,
                    so_luong=item['ton'],
                    ngay_nhap=nhap,
                    han_su_dung=han_vaccine,
                    lo_sx=item['lo_sx'],
                    vi_tri='Tủ lạnh B',
                )
            if created:
                vaccine_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done: {thuoc_count} new medicines, {vaccine_count} new vaccines '
            f'(total TH: {Thuoc.objects.count()}, VC: {Vaccine.objects.count()})'
        ))

    def _clear_sample_data(self):
        year = date.today().year
        ma_thuoc = list(Thuoc.objects.filter(ma_thuoc__startswith=f'TH{year}').values_list('pk', flat=True))
        ma_vaccine = list(Vaccine.objects.filter(ma_vaccine__startswith=f'VC{year}').values_list('pk', flat=True))
        KhoThuoc.objects.filter(thuoc_id__in=ma_thuoc).delete()
        KhoVaccine.objects.filter(vaccine_id__in=ma_vaccine).delete()
        ThuocNhaCungCap.objects.filter(thuoc_id__in=ma_thuoc).delete()
        ChiTietPhieuNhapThuoc.objects.filter(thuoc_id__in=ma_thuoc).delete()
        ChiTietPhieuNhapVaccine.objects.filter(vaccine_id__in=ma_vaccine).delete()
        Thuoc.objects.filter(pk__in=ma_thuoc).delete()
        Vaccine.objects.filter(pk__in=ma_vaccine).delete()
        self.stdout.write(self.style.WARNING('Cleared sample TH*/VC* data for current year'))
