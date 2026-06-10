from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.core.validators import RegexValidator, EmailValidator
from django.forms import ValidationError
from django.utils import timezone
from datetime import date, timedelta
import uuid

class NguoiDungManager(BaseUserManager):
    def create_user(self, ten_dang_nhap, mat_khau=None, **extra_fields):
        if not ten_dang_nhap:
            raise ValueError('Tên đăng nhập là bắt buộc')
        
        # Chuẩn hóa email
        if 'email' in extra_fields:
            extra_fields['email'] = self.normalize_email(extra_fields['email'])
        
        user = self.model(ten_dang_nhap=ten_dang_nhap, **extra_fields)
        user.set_password(mat_khau)
        user.save(using=self._db)
        return user

    def create_superuser(self, ten_dang_nhap, mat_khau=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('vai_tro', 'ADMIN')
        extra_fields.setdefault('is_verified', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser phải có is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser phải có is_superuser=True')
        
        return self.create_user(ten_dang_nhap, mat_khau, **extra_fields)
    
    def get_benh_nhan(self):
        return self.filter(vai_tro='BENH_NHAN', is_active=True)
    
    def get_bac_si(self):
        return self.filter(vai_tro='BAC_SI', is_active=True)
    
    def get_nhan_vien(self):
        return self.filter(vai_tro='NHAN_VIEN', is_active=True)
class NguoiDung(AbstractBaseUser, PermissionsMixin):
    VAI_TRO_CHOICES = [
        ('BENH_NHAN', 'Bệnh nhân'),
        ('BAC_SI', 'Bác sĩ'),
        ('NHAN_VIEN', 'Nhân viên'),
        ('ADMIN', 'Quản trị viên'),
    ]
    GIOI_TINH_CHOICES = [
        ('NAM', 'Nam'),
        ('NU', 'Nữ'),
        ('KHAC', 'Khác'),
    ]
    
    # Validators
    phone_regex = RegexValidator(
        regex=r'^0[0-9]{9,10}$',
        message='Số điện thoại phải bắt đầu bằng 0 và có 10-11 số'
    )
    cccd_regex = RegexValidator(
        regex=r'^[0-9]{9,12}$',
        message='CCCD phải có 9-12 số'
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    ten_dang_nhap = models.CharField(max_length=150, unique=True, db_index=True)
    email = models.EmailField(unique=True, validators=[EmailValidator()], db_index=True)
    
    ho_ten = models.CharField(max_length=255)
    so_dien_thoai = models.CharField(max_length=15, validators=[phone_regex], db_index=True)
    vai_tro = models.CharField(max_length=20, choices=VAI_TRO_CHOICES, db_index=True)
    
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    dia_chi = models.TextField(blank=True)
    ngay_sinh = models.DateField(null=True, blank=True)
    gioi_tinh = models.CharField(max_length=10, choices=GIOI_TINH_CHOICES, blank=True)
    cccd = models.CharField(max_length=12, unique=True, null=True, blank=True, 
                           validators=[cccd_regex], help_text='Căn cước công dân')
    
    nguoi_lien_he_khan = models.CharField(max_length=255, blank=True)
    sdt_lien_he_khan = models.CharField(max_length=15, blank=True, validators=[phone_regex])
    
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_device = models.CharField(max_length=255, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False, help_text='Đã xác thực email/SĐT')
    is_locked = models.BooleanField(default=False, help_text='Tài khoản bị khóa')
    locked_until = models.DateTimeField(null=True, blank=True)
    login_attempts = models.IntegerField(default=0)
    
    last_active = models.DateTimeField(null=True, blank=True)
    ngay_tao = models.DateTimeField(auto_now_add=True)
    ngay_cap_nhat = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # Soft delete
    
    objects = NguoiDungManager()
    
    USERNAME_FIELD = 'ten_dang_nhap'
    REQUIRED_FIELDS = ['email', 'ho_ten', 'so_dien_thoai', 'vai_tro']
    
    class Meta:
        db_table = 'nguoi_dung'
        verbose_name = 'Người dùng'
        verbose_name_plural = 'Người dùng'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['so_dien_thoai']),
            models.Index(fields=['vai_tro']),
            models.Index(fields=['is_active']),
            models.Index(fields=['cccd']),
        ]
    
    def __str__(self):
        return f"{self.ho_ten} ({self.get_vai_tro_display()})"
    
    def lock_account(self, minutes=30):
        self.is_locked = True
        self.locked_until = timezone.now() + timedelta(minutes=minutes)
        self.save()
    
    def unlock_account(self):
        self.is_locked = False
        self.locked_until = None
        self.login_attempts = 0
        self.save()
    
    def record_login(self, request):
        self.last_login = timezone.now()
        self.last_login_ip = self.get_client_ip(request)
        self.last_login_device = request.META.get('HTTP_USER_AGENT', '')[:255]
        self.login_attempts = 0
        self.last_active = timezone.now()
        self.save()
    
    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def soft_delete(self):
        self.is_active = False
        self.deleted_at = timezone.now()
        self.save()
    
    def restore(self):
        self.is_active = True
        self.deleted_at = None
        self.save()


class BenhNhan(models.Model):
    NHOM_MAU_CHOICES = [
        ('A+', 'A+'), ('A-', 'A-'),
        ('B+', 'B+'), ('B-', 'B-'),
        ('AB+', 'AB+'), ('AB-', 'AB-'),
        ('O+', 'O+'), ('O-', 'O-'),
        ('CHUA_XAC_DINH', 'Chưa xác định'),
    ]
    
    TINH_TRANG_HON_NHAN = [
        ('DOC_THAN', 'Độc thân'),
        ('DA_KET_HON', 'Đã kết hôn'),
        ('LY_HON', 'Ly hôn'),
        ('GOA', 'Góa'),
    ]
    
    NGHE_NGHIEP_CHOICES = [
        ('HOC_SINH', 'Học sinh'),
        ('SINH_VIEN', 'Sinh viên'),
        ('CAN_BO', 'Cán bộ công nhân viên'),
        ('KINH_DOANH', 'Kinh doanh'),
        ('HUU_TRI', 'Hưu trí'),
        ('TU_DO', 'Tự do'),
        ('NOI_TRO', 'Nội trợ'),
        ('KHAC', 'Khác'),
    ]
    
    GIOI_TINH_CHOICES = [
        ('NAM', 'Nam'),
        ('NU', 'Nữ'),
        ('KHAC', 'Khác'),
    ]
    
    nguoi_dung = models.OneToOneField(
        NguoiDung, on_delete=models.CASCADE, 
        primary_key=True, related_name='benh_nhan'
    )
    ma_benh_nhan = models.CharField(max_length=20, unique=True, db_index=True)
    ngay_sinh = models.DateField()
    gioi_tinh = models.CharField(max_length=10, choices=GIOI_TINH_CHOICES)
    dia_chi = models.TextField()
    so_bao_hiem = models.CharField(max_length=50, blank=True, null=True, db_index=True)
    ngay_dang_ky_bhyt = models.DateField(null=True, blank=True)
    ngay_het_han_bhyt = models.DateField(null=True, blank=True)
    noi_dang_ky_kham_chua = models.CharField(max_length=255, blank=True)
    
    nhom_mau = models.CharField(max_length=15, choices=NHOM_MAU_CHOICES, default='CHUA_XAC_DINH')
    chieu_cao = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='cm')
    can_nang = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='kg')
    
    tien_su_benh = models.TextField(blank=True, help_text='Tiền sử bệnh lý')
    tien_su_di_ung = models.TextField(blank=True, help_text='Dị ứng thuốc/thực phẩm')
    benh_man_tinh = models.TextField(blank=True, help_text='Bệnh mãn tính (nếu có)')
    
    nghe_nghiep = models.CharField(max_length=20, choices=NGHE_NGHIEP_CHOICES, blank=True)
    noi_lam_viec = models.CharField(max_length=255, blank=True)
    tinh_trang_hon_nhan = models.CharField(max_length=20, choices=TINH_TRANG_HON_NHAN, blank=True)
    
    ho_ten_nguoi_than = models.CharField(max_length=255, blank=True)
    quan_he_nguoi_than = models.CharField(max_length=50, blank=True)
    sdt_nguoi_than = models.CharField(max_length=15, blank=True)
    

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'benh_nhan'
        verbose_name = 'Bệnh nhân'
        verbose_name_plural = 'Bệnh nhân'
        indexes = [
            models.Index(fields=['ma_benh_nhan']),
            models.Index(fields=['so_bao_hiem']),
            models.Index(fields=['ngay_sinh']),
        ]
    
    def __str__(self):
        return f"{self.ma_benh_nhan} - {self.nguoi_dung.ho_ten}"
    
    def tuoi(self):
        today = date.today()
        age = today.year - self.ngay_sinh.year
        if (today.month, today.day) < (self.ngay_sinh.month, self.ngay_sinh.day):
            age -= 1
        return age
    
    def kiem_tra_bhyt_con_han(self):
        if self.ngay_het_han_bhyt:
            return self.ngay_het_han_bhyt >= date.today()
        return False
    
    def get_bmi(self):
        if self.chieu_cao and self.can_nang:
            height_m = self.chieu_cao / 100
            bmi = self.can_nang / (height_m * height_m)
            return round(bmi, 2)
        return None
    
    def get_bmi_phan_loai(self):
        bmi = self.get_bmi()
        if not bmi:
            return "Chưa có dữ liệu"
        if bmi < 18.5:
            return "Thiếu cân"
        elif bmi < 25:
            return "Bình thường"
        elif bmi < 30:
            return "Thừa cân"
        else:
            return "Béo phì"
        
    def clean(self):
        """Validate dữ liệu trước khi save"""
        super().clean()
        
        # Validate BHYT dates
        if self.ngay_dang_ky_bhyt and self.ngay_het_han_bhyt:
            if self.ngay_het_han_bhyt <= self.ngay_dang_ky_bhyt:
                raise ValidationError({
                    'ngay_het_han_bhyt': 'Ngày hết hạn phải sau ngày đăng ký'
                })
        
        # Validate ngày sinh không phải tương lai
        if self.ngay_sinh and self.ngay_sinh > date.today():
            raise ValidationError({
                'ngay_sinh': 'Ngày sinh không thể trong tương lai'
            })
        
        # Validate chiều cao, cân nặng hợp lý
        if self.chieu_cao and (self.chieu_cao < 30 or self.chieu_cao > 250):
            raise ValidationError({
                'chieu_cao': 'Chiều cao không hợp lý (30-250 cm)'
            })
        
        if self.can_nang and (self.can_nang < 2 or self.can_nang > 300):
            raise ValidationError({
                'can_nang': 'Cân nặng không hợp lý (2-300 kg)'
            })
    
    def save(self, *args, **kwargs):
        self.clean()  # Gọi validate trước khi save
        super().save(*args, **kwargs)


class BacSi(models.Model):
    CHUC_VU_CHOICES = [
        ('TRUONG_KHOA', 'Trưởng khoa'),
        ('PHO_KHOA', 'Phó khoa'),
        ('BAC_SI_CHU_NHIEM', 'Bác sĩ chủ nhiệm'),
        ('BAC_SI_DIEU_TRI', 'Bác sĩ điều trị'),
        ('BAC_SI_NOI_TRU', 'Bác sĩ nội trú'),
        ('THUC_TAP_SINH', 'Thực tập sinh'),
    ]
    
    TRINH_DO_CHOICES = [
        ('TIEN_SI', 'Tiến sĩ'),
        ('THAC_SI', 'Thạc sĩ'),
        ('BAC_SI_CK2', 'Bác sĩ chuyên khoa II'),
        ('BAC_SI_CK1', 'Bác sĩ chuyên khoa I'),
        ('BAC_SI', 'Bác sĩ'),
        ('Y_SI', 'Y sĩ'),
    ]
    
    nguoi_dung = models.OneToOneField(
        NguoiDung, on_delete=models.CASCADE, 
        primary_key=True, related_name='bac_si'
    )
    ma_bac_si = models.CharField(max_length=20, unique=True, db_index=True)
    chuyen_khoa = models.CharField(max_length=100, db_index=True)
    so_giay_phep = models.CharField(max_length=50, unique=True)
    
    trinh_do = models.CharField(max_length=20, choices=TRINH_DO_CHOICES, default='BAC_SI')
    chuc_vu = models.CharField(max_length=30, choices=CHUC_VU_CHOICES, blank=True)
    chuyen_mon = models.TextField(blank=True, help_text='Lĩnh vực chuyên môn sâu')
    
    khoa_phong = models.CharField(max_length=100, blank=True)
    ngay_bat_dau_cong_tac = models.DateField(null=True, blank=True)
    ngay_ket_thuc_cong_tac = models.DateField(null=True, blank=True)
    
    chung_chi = models.TextField(blank=True, help_text='Các chứng chỉ đã đạt được')
    ngoai_ngu = models.CharField(max_length=255, blank=True)
    
    lich_lam_viec = models.JSONField(default=dict, blank=True, help_text='Lịch làm việc mẫu')

    gioi_thieu = models.TextField(blank=True, help_text='Giới thiệu về bác sĩ')
    thanh_tich = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_working = models.BooleanField(default=True, help_text='Đang công tác')

    class Meta:
        db_table = 'bac_si'
        verbose_name = 'Bác sĩ'
        verbose_name_plural = 'Bác sĩ'
        indexes = [
            models.Index(fields=['ma_bac_si']),
            models.Index(fields=['chuyen_khoa']),
            models.Index(fields=['so_giay_phep']),
        ]
    
    def validate_lich_lam_viec(self, value):
        """Validate cấu trúc lịch làm việc"""
        if not isinstance(value, dict):
            raise ValidationError('Lịch làm việc phải là dictionary')
        
        valid_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        
        for day, schedule in value.items():
            if day not in valid_days:
                raise ValidationError(f'Ngày không hợp lệ: {day}')
            
            if not isinstance(schedule, dict):
                raise ValidationError(f'Lịch của {day} phải là dictionary')
            
            if 'working' in schedule and schedule['working']:
                if 'start' not in schedule or 'end' not in schedule:
                    raise ValidationError(f'Thiếu giờ bắt đầu/kết thúc cho {day}')
                
                # Validate format time (HH:MM)
                import re
                time_pattern = re.compile(r'^([01]?[0-9]|2[0-3]):[0-5][0-9]$')
                if not time_pattern.match(schedule['start']):
                    raise ValidationError(f'Giờ bắt đầu không hợp lệ: {schedule["start"]}')
                if not time_pattern.match(schedule['end']):
                    raise ValidationError(f'Giờ kết thúc không hợp lệ: {schedule["end"]}')
    
    def save(self, *args, **kwargs):
        if self.lich_lam_viec:
            self.validate_lich_lam_viec(self.lich_lam_viec)
        super().save(*args, **kwargs)
    
    def __str__(self):
        chuc_danh = f"BS. {self.trinh_do}" if self.trinh_do != 'BAC_SI' else "BS."
        return f"{chuc_danh} {self.nguoi_dung.ho_ten} - {self.chuyen_khoa}"
    
    def get_lich_lam_viec_mac_dinh(self):
        if not self.lich_lam_viec:
            default_schedule = {
                'monday': {'working': True, 'start': '08:00', 'end': '17:00'},
                'tuesday': {'working': True, 'start': '08:00', 'end': '17:00'},
                'wednesday': {'working': True, 'start': '08:00', 'end': '17:00'},
                'thursday': {'working': True, 'start': '08:00', 'end': '17:00'},
                'friday': {'working': True, 'start': '08:00', 'end': '17:00'},
                'saturday': {'working': False},
                'sunday': {'working': False},
            }
            return default_schedule
        return self.lich_lam_viec
    
    def danh_gia_trung_binh(self):
        from django.db.models import Avg
        avg = self.danh_gia.aggregate(Avg('diem'))['diem__avg']
        return round(avg, 2) if avg else 0

    @classmethod
    def generate_next_ma_bac_si(cls):
        """Mã BS{YYYY}{seq 4 số} — cùng quy tắc với BN/NV."""
        year = date.today().year
        prefix = f'BS{year}'
        codes = cls.objects.filter(ma_bac_si__startswith=prefix).values_list(
            'ma_bac_si', flat=True
        )
        max_seq = 0
        for code in codes:
            try:
                suf = str(code)[-4:]
                max_seq = max(max_seq, int(suf))
            except (ValueError, TypeError):
                continue
        return f'{prefix}{str(max_seq + 1).zfill(4)}'


class NhanVien(models.Model):
    CHUC_VU_CHOICES = [
        ('BAN_THUOC', 'Bán thuốc'),
        ('LE_TAN', 'Lễ tân'),
        ('KE_TOAN', 'Kế toán'),
    ]
    
    nguoi_dung = models.OneToOneField(
        NguoiDung, on_delete=models.CASCADE, 
        primary_key=True, related_name='nhan_vien'
    )
    ma_nhan_vien = models.CharField(max_length=20, unique=True, db_index=True)
    phong_ban = models.CharField(max_length=100)
    
    chuc_vu = models.CharField(max_length=20, choices=CHUC_VU_CHOICES, default='LE_TAN')
    ngay_bat_dau_lam = models.DateField(null=True, blank=True)
    mo_ta_cong_viec = models.TextField(blank=True)
    
    quyen_han = models.JSONField(default=dict, blank=True, help_text='Các quyền được cấp')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_working = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'nhan_vien'
        verbose_name = 'Nhân viên'
        verbose_name_plural = 'Nhân viên'
        indexes = [
            models.Index(fields=['ma_nhan_vien']),
            models.Index(fields=['chuc_vu']),
        ]
    
    @classmethod
    def generate_next_ma_nhan_vien(cls):
        """Mã NV{YYYY}{seq 4 số} — tránh trùng khi client gửi mã cũ hoặc danh sách chưa đồng bộ."""
        year = date.today().year
        prefix = f'NV{year}'
        codes = cls.objects.filter(ma_nhan_vien__startswith=prefix).values_list(
            'ma_nhan_vien', flat=True
        )
        max_seq = 0
        for code in codes:
            try:
                suf = str(code)[-4:]
                max_seq = max(max_seq, int(suf))
            except (ValueError, TypeError):
                continue
        return f'{prefix}{str(max_seq + 1).zfill(4)}'

    def __str__(self):
        chuc_vu_display = dict(self.CHUC_VU_CHOICES).get(self.chuc_vu, '')
        return f"{self.ma_nhan_vien} - {self.nguoi_dung.ho_ten} ({chuc_vu_display})"
    
    def get_default_permissions(self):
        default_permissions = {
            'BAN_THUOC': ['xem_kho', 'xuat_kho', 'ban_thuoc'],
            'LE_TAN': ['tiep_nhan', 'dat_lich', 'thanh_toan'],
            'KE_TOAN': ['xem_doanh_thu', 'thanh_toan', 'bao_cao', 'xem_kho', 'nhap_kho', 'xuat_kho', 'kiem_ke'],
        }
        return default_permissions.get(self.chuc_vu, [])
    
    def validate_quyen_han(self, value):
        """Validate cấu trúc quyền hạn"""
        if not isinstance(value, dict):
            raise ValidationError('Quyền hạn phải là dictionary')
        
        valid_permissions = ['all', 'xem_benh_nhan', 'cham_soc', 'ghi_nhan_chi_so',
                           'tiep_nhan', 'dat_lich', 'thanh_toan', 'xem_kho',
                           'nhap_kho', 'xuat_kho', 'kiem_ke', 'xem_doanh_thu',
                           'bao_cao', 'ban_thuoc']
        
        for perm in value.get('permissions', []):
            if perm not in valid_permissions and perm != 'all':
                raise ValidationError(f'Quyền không hợp lệ: {perm}')
    
    def save(self, *args, **kwargs):
        if self.quyen_han:
            self.validate_quyen_han(self.quyen_han)
        super().save(*args, **kwargs)


class LichSuKhamBenh(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    benh_nhan = models.ForeignKey(BenhNhan, on_delete=models.CASCADE, related_name='lich_su_kham')
    bac_si = models.ForeignKey(BacSi, on_delete=models.SET_NULL, null=True)
    ngay_kham = models.DateTimeField()
    chuan_doan = models.CharField(max_length=255)
    ket_luan = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'lich_su_kham_benh'
        verbose_name = 'Lịch sử khám bệnh'
        verbose_name_plural = 'Lịch sử khám bệnh'
        ordering = ['-ngay_kham']
        indexes = [
            models.Index(fields=['benh_nhan', 'ngay_kham']),
        ]
    
    def __str__(self):
        return f"{self.benh_nhan.ma_benh_nhan} - {self.ngay_kham.strftime('%d/%m/%Y')}"


class DanhGiaBacSi(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    benh_nhan = models.ForeignKey(BenhNhan, on_delete=models.CASCADE, related_name='danh_gia')
    bac_si = models.ForeignKey(BacSi, on_delete=models.CASCADE, related_name='danh_gia')
    ho_so = models.ForeignKey('benhan.HoSoBenhAn', on_delete=models.CASCADE, null=True, blank=True)
    
    diem = models.IntegerField(choices=[(i, i) for i in range(1, 6)], help_text='Điểm từ 1-5')
    nhan_xet = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'danh_gia_bac_si'
        verbose_name = 'Đánh giá bác sĩ'
        verbose_name_plural = 'Đánh giá bác sĩ'
        unique_together = ['benh_nhan', 'bac_si', 'ho_so']
        indexes = [
            models.Index(fields=['bac_si', 'diem']),
        ]
    
    def __str__(self):
        return f"{self.benh_nhan.ma_benh_nhan} đánh giá BS.{self.bac_si.nguoi_dung.ho_ten}: {self.diem}/5"


class ThongBao(models.Model):
    LOAI_THONG_BAO = [
        ('HE_THONG', 'Hệ thống'),
        ('LICH_HEN', 'Lịch hẹn'),
        ('DON_THUOC', 'Đơn thuốc'),
        ('TIEM_CHUNG', 'Tiêm chủng'),
        ('THANH_TOAN', 'Thanh toán'),
        ('TAI_KHOAN', 'Tài khoản'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nguoi_nhan = models.ForeignKey(NguoiDung, on_delete=models.CASCADE, related_name='thong_bao')
    loai = models.CharField(max_length=20, choices=LOAI_THONG_BAO)
    tieu_de = models.CharField(max_length=255)
    noi_dung = models.TextField()
    
    du_lieu_lien_quan = models.JSONField(default=dict, blank=True)
    
    da_xem = models.BooleanField(default=False)
    ngay_xem = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'nguoidung_thong_bao'
        verbose_name = 'Thông báo'
        verbose_name_plural = 'Thông báo'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['nguoi_nhan', 'da_xem']),
            models.Index(fields=['loai']),
        ]
    
    def __str__(self):
        return f"[{self.get_loai_display()}] {self.tieu_de}"
    
    def mark_as_read(self):
        """Đánh dấu đã xem"""
        self.da_xem = True
        self.ngay_xem = timezone.now()
        self.save()


class DoctorSchedule(models.Model):
    """Đăng ký ca làm bác sĩ — bảng doctor_schedule."""
    CA_LAM_CHOICES = [
        ('SANG', 'Ca sáng'),
        ('CHIEU', 'Ca chiều'),
        ('TOI', 'Ca tối'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bac_si = models.ForeignKey(
        BacSi,
        on_delete=models.CASCADE,
        related_name='doctor_schedules',
        db_constraint=False,
    )
    ngay_lam = models.DateField(help_text='Ngày làm việc')
    ca_lam = models.CharField(max_length=10, choices=CA_LAM_CHOICES)
    ghi_chu = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'doctor_schedule'
        verbose_name = 'Lịch ca làm bác sĩ'
        verbose_name_plural = 'Lịch ca làm bác sĩ'
        ordering = ['ngay_lam', 'ca_lam', 'bac_si__ma_bac_si']
        unique_together = [('bac_si', 'ngay_lam', 'ca_lam')]
        indexes = [
            models.Index(fields=['ngay_lam', 'ca_lam']),
            models.Index(fields=['bac_si', 'ngay_lam']),
        ]

    def __str__(self):
        return f"{self.bac_si.ma_bac_si} — {self.ngay_lam} — {self.get_ca_lam_display()}"


class LichLamViec(models.Model):
    """Lịch làm việc chi tiết của bác sĩ/nhân viên"""
    TRANG_THAI_CHOICES = [
        ('RANH', 'Rảnh'),
        ('DA_DAT', 'Đã đặt'),
        ('DA_KHAM', 'Đã khám'),
        ('HUY', 'Đã hủy'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nguoi_dung = models.ForeignKey(NguoiDung, on_delete=models.CASCADE, related_name='lich_lam_viec')
    
    ngay = models.DateField()
    gio_bat_dau = models.TimeField()
    gio_ket_thuc = models.TimeField()
    
    trang_thai = models.CharField(max_length=20, choices=TRANG_THAI_CHOICES, default='RANH')
    ghi_chu = models.TextField(blank=True)
    
    benh_nhan = models.ForeignKey(BenhNhan, on_delete=models.SET_NULL, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'lich_lam_viec'
        verbose_name = 'Lịch làm việc'
        verbose_name_plural = 'Lịch làm việc'
        ordering = ['ngay', 'gio_bat_dau']
        unique_together = ['nguoi_dung', 'ngay', 'gio_bat_dau']
        indexes = [
            models.Index(fields=['nguoi_dung', 'ngay']),
            models.Index(fields=['trang_thai']),
        ]
    
    def __str__(self):
        return f"{self.nguoi_dung.ho_ten} - {self.ngay} {self.gio_bat_dau}-{self.gio_ket_thuc}"

class NhatKyHoatDong(models.Model):
    HANH_DONG_CHOICES = [
        ('DANG_NHAP', 'Đăng nhập'),
        ('DANG_XUAT', 'Đăng xuất'),
        ('XEM', 'Xem'),
        ('THEM', 'Thêm'),
        ('SUA', 'Sửa'),
        ('XOA', 'Xóa'),
        ('THANH_TOAN', 'Thanh toán'),
        ('KHAC', 'Khác'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nguoi_dung = models.ForeignKey(NguoiDung, on_delete=models.SET_NULL, null=True, related_name='nhat_ky')
    
    hanh_dong = models.CharField(max_length=20, choices=HANH_DONG_CHOICES)
    doi_tuong = models.CharField(max_length=100, help_text='Loại đối tượng thao tác')
    doi_tuong_id = models.CharField(max_length=100, blank=True)
    
    du_lieu_cu = models.JSONField(default=dict, blank=True)
    du_lieu_moi = models.JSONField(default=dict, blank=True)
    
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'nhat_ky_hoat_dong'
        verbose_name = 'Nhật ký hoạt động'
        verbose_name_plural = 'Nhật ký hoạt động'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['nguoi_dung', '-created_at']),
            models.Index(fields=['hanh_dong']),
        ]
    
    def __str__(self):
        return f"{self.nguoi_dung} - {self.hanh_dong} - {self.created_at}"