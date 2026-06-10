from rest_framework import serializers
from rest_framework.fields import empty
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from .models import *
from .utils import generate_ma_benh_nhan, chuan_hoa_so_dien_thoai_vietnam

# ==================== SERIALIZERS CHO NGƯỜI DÙNG ====================

class NguoiDungSerializer(serializers.ModelSerializer):
    """Serializer cơ bản cho người dùng"""
    vai_tro_display = serializers.CharField(source='get_vai_tro_display', read_only=True)
    gioi_tinh_display = serializers.CharField(source='get_gioi_tinh_display', read_only=True)
    
    class Meta:
        model = NguoiDung
        fields = [
            'id', 'ten_dang_nhap', 'ho_ten', 'email', 'so_dien_thoai',
            'vai_tro', 'vai_tro_display', 'avatar', 'dia_chi', 'ngay_sinh',
            'gioi_tinh', 'gioi_tinh_display', 'cccd', 'nguoi_lien_he_khan',
            'sdt_lien_he_khan', 'is_active', 'is_verified', 'last_login',
            'last_active', 'ngay_tao'
        ]
        read_only_fields = ['id', 'is_active', 'is_verified', 'last_login', 'last_active', 'ngay_tao']

class NguoiDungCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo người dùng mới"""
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    password2 = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    
    class Meta:
        model = NguoiDung
        fields = [
            'ten_dang_nhap', 'password', 'password2', 'ho_ten', 'email',
            'so_dien_thoai', 'vai_tro', 'ngay_sinh', 'gioi_tinh', 'dia_chi'
        ]
    
    def validate_email(self, value):
        """Validate email unique và format"""
        value = (value or '').strip()
        # Check format
        if not value or '@' not in value:
            raise serializers.ValidationError("Email không hợp lệ")
        value = NguoiDung.objects.normalize_email(value)
        # Check unique
        if NguoiDung.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email đã được sử dụng")
        
        # Check domain
        allowed_domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com']
        domain = value.split('@')[1]
        # Bỏ qua check domain nếu không muốn giới hạn
        
        return value
    
    def validate_ten_dang_nhap(self, value):
        """Validate username"""
        value = (value or '').strip()
        if NguoiDung.objects.filter(ten_dang_nhap=value).exists():
            raise serializers.ValidationError("Tên đăng nhập đã tồn tại")
        
        if len(value) < 3:
            raise serializers.ValidationError("Tên đăng nhập phải có ít nhất 3 ký tự")
        
        return value
    
    def validate_so_dien_thoai(self, value):
        """Validate số điện thoại"""
        value = chuan_hoa_so_dien_thoai_vietnam((value or '').strip())
        if not value:
            raise serializers.ValidationError("Số điện thoại là bắt buộc")
        if NguoiDung.objects.filter(so_dien_thoai=value).exists():
            raise serializers.ValidationError("Số điện thoại đã được sử dụng")
        return value
    
    def validate_password(self, value):
        """Validate độ mạnh của password"""
        if len(value) < 8:
            raise serializers.ValidationError("Mật khẩu phải có ít nhất 8 ký tự")
        
        # Check có ít nhất 1 chữ hoa
        if not any(c.isupper() for c in value):
            raise serializers.ValidationError("Mật khẩu phải có ít nhất 1 chữ hoa")
        
        # Check có ít nhất 1 chữ số
        if not any(c.isdigit() for c in value):
            raise serializers.ValidationError("Mật khẩu phải có ít nhất 1 chữ số")
        
        # Check có ít nhất 1 ký tự đặc biệt
        special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>?"
        if not any(c in special_chars for c in value):
            raise serializers.ValidationError("Mật khẩu phải có ít nhất 1 ký tự đặc biệt")
        
        return value
    
    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError({"password": "Mật khẩu không khớp"})
        
        return data
    
    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        
        user = NguoiDung(**validated_data)
        user.set_password(password)
        user.save()
        
        return user

class NguoiDungUpdateSerializer(serializers.ModelSerializer):
    """Serializer cho cập nhật thông tin người dùng"""
    class Meta:
        model = NguoiDung
        fields = [
            'ho_ten', 'email', 'so_dien_thoai', 'avatar', 'dia_chi',
            'ngay_sinh', 'gioi_tinh', 'cccd', 'nguoi_lien_he_khan', 'sdt_lien_he_khan'
        ]

    def validate_email(self, value):
        if value is None:
            return value
        value = (value or '').strip()
        if not value:
            return value
        qs = NguoiDung.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Email đã được sử dụng')
        return value

    def validate_so_dien_thoai(self, value):
        if value is None:
            return value
        value = chuan_hoa_so_dien_thoai_vietnam((value or '').strip())
        if not value:
            return value
        qs = NguoiDung.objects.filter(so_dien_thoai=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Số điện thoại đã được sử dụng')
        return value

def _validate_mat_khau_manh(value):
    if len(value) < 8:
        raise serializers.ValidationError('Mật khẩu phải có ít nhất 8 ký tự')
    if not any(c.isupper() for c in value):
        raise serializers.ValidationError('Mật khẩu phải có ít nhất 1 chữ hoa')
    if not any(c.isdigit() for c in value):
        raise serializers.ValidationError('Mật khẩu phải có ít nhất 1 chữ số')
    special_chars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    if not any(c in special_chars for c in value):
        raise serializers.ValidationError('Mật khẩu phải có ít nhất 1 ký tự đặc biệt')
    return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return (value or '').strip().lower()


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, style={'input_type': 'password'})
    new_password2 = serializers.CharField(required=True, style={'input_type': 'password'})

    def validate_new_password(self, value):
        return _validate_mat_khau_manh(value)

    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({'new_password': 'Mật khẩu không khớp'})
        return data


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer cho đổi mật khẩu"""
    old_password = serializers.CharField(required=True, style={'input_type': 'password'})
    new_password = serializers.CharField(required=True, style={'input_type': 'password'})
    new_password2 = serializers.CharField(required=True, style={'input_type': 'password'})
    
    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({"new_password": "Mật khẩu mới không khớp"})
        
        if len(data['new_password']) < 8:
            raise serializers.ValidationError({"new_password": "Mật khẩu phải có ít nhất 8 ký tự"})
        
        return data

class LoginSerializer(serializers.Serializer):
    """Serializer cho đăng nhập"""
    ten_dang_nhap = serializers.CharField(required=True)
    password = serializers.CharField(required=True, style={'input_type': 'password'})
    
    def validate(self, data):
        ten_dang_nhap = (data.get('ten_dang_nhap') or '').strip()
        password = data.get('password')
        
        if ten_dang_nhap and password:
            username = ten_dang_nhap
            if '@' in ten_dang_nhap:
                matched = NguoiDung.objects.filter(email__iexact=ten_dang_nhap).first()
                if matched:
                    username = matched.ten_dang_nhap

            user = authenticate(username=username, password=password)
            
            if user:
                if not user.is_active:
                    raise serializers.ValidationError("Tài khoản đã bị khóa")
                
                if user.is_locked:
                    if user.locked_until and user.locked_until > timezone.now():
                        raise serializers.ValidationError(
                            f"Tài khoản bị khóa đến {user.locked_until.strftime('%d/%m/%Y %H:%M')}"
                        )
                    else:
                        user.unlock_account()
            else:
                # Ghi lại số lần đăng nhập thất bại
                try:
                    user = NguoiDung.objects.get(ten_dang_nhap=username)
                    user.login_attempts += 1
                    if user.login_attempts >= 5:
                        user.lock_account(30)  # Khóa 30 phút
                    user.save()
                except NguoiDung.DoesNotExist:
                    pass
                
                raise serializers.ValidationError("Tên đăng nhập hoặc mật khẩu không đúng")
        else:
            raise serializers.ValidationError("Vui lòng nhập tên đăng nhập và mật khẩu")
        
        data['user'] = user
        return data

# ==================== SERIALIZERS CHO BỆNH NHÂN ====================

class BenhNhanSerializer(serializers.ModelSerializer):
    """Serializer cho bệnh nhân"""
    ho_ten = serializers.CharField(source='nguoi_dung.ho_ten', read_only=True)
    email = serializers.EmailField(source='nguoi_dung.email', read_only=True)
    so_dien_thoai = serializers.CharField(source='nguoi_dung.so_dien_thoai', read_only=True)
    tuoi = serializers.IntegerField(read_only=True)
    bhyt_con_han = serializers.BooleanField(read_only=True)
    bmi = serializers.SerializerMethodField()
    
    class Meta:
        model = BenhNhan
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def get_bmi(self, obj):
        return obj.get_bmi()

class BenhNhanDetailSerializer(BenhNhanSerializer):
    """Serializer chi tiết cho bệnh nhân"""
    lich_su_kham = serializers.SerializerMethodField()
    
    class Meta(BenhNhanSerializer.Meta):
        # SỬA DÒNG NÀY 
        fields = [
            'ma_benh_nhan', 'nguoi_dung', 'ngay_sinh', 'gioi_tinh', 'dia_chi',
            'so_bao_hiem', 'ngay_dang_ky_bhyt', 'ngay_het_han_bhyt', 'noi_dang_ky_kham_chua',
            'nhom_mau', 'chieu_cao', 'can_nang', 'tien_su_benh', 'tien_su_di_ung',
            'benh_man_tinh', 'nghe_nghiep', 'noi_lam_viec', 'tinh_trang_hon_nhan',
            'ho_ten_nguoi_than', 'quan_he_nguoi_than', 'sdt_nguoi_than',
            'created_at', 'updated_at', 'lich_su_kham'
        ]
        
        # fields = BenhNhanSerializer.Meta.fields + ['lich_su_kham']  # Thêm field lich_su_kham vào danh sách fields
    
    def get_lich_su_kham(self, obj):
        try:
            from benhan.models import HoSoBenhAn
            lich_su = HoSoBenhAn.objects.filter(benh_nhan=obj).order_by('-ngay_kham')[:10]
            from benhan.serializers import HoSoBenhAnSerializer
            return HoSoBenhAnSerializer(lich_su, many=True).data
        except (ImportError, Exception):
            return []

class BenhNhanCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo bệnh nhân mới"""
    nguoi_dung = NguoiDungCreateSerializer()
    
    class Meta:
        model = BenhNhan
        fields = [
            'nguoi_dung', 'ma_benh_nhan', 'ngay_sinh', 'gioi_tinh', 'dia_chi',
            'so_bao_hiem', 'nhom_mau', 'chieu_cao', 'can_nang',
            'tien_su_benh', 'tien_su_di_ung', 'benh_man_tinh',
            'ho_ten_nguoi_than', 'quan_he_nguoi_than', 'sdt_nguoi_than'
        ]
        extra_kwargs = {
            'ma_benh_nhan': {'required': False, 'allow_blank': True}
        }

    def run_validation(self, data=empty):
        """Gán vai_tro=BENH_NHAN trước khi validate lồng NguoiDungCreateSerializer (tránh thiếu vai_tro khi lễ tân không gửi)."""
        if data is not empty and isinstance(data, dict):
            nd = data.get('nguoi_dung')
            if isinstance(nd, dict):
                merged = {**nd, 'vai_tro': 'BENH_NHAN'}
                data = {**data, 'nguoi_dung': merged}
        return super().run_validation(data)
    
    def create(self, validated_data):
        nguoi_dung_data = validated_data.pop('nguoi_dung')
        validated_data.pop('ma_benh_nhan', None)
        nguoi_dung_data['vai_tro'] = 'BENH_NHAN'
        
        nguoi_dung_serializer = NguoiDungCreateSerializer(data=nguoi_dung_data)
        if nguoi_dung_serializer.is_valid():
            nguoi_dung = nguoi_dung_serializer.save()
        else:
            raise serializers.ValidationError(nguoi_dung_serializer.errors)
        
        benh_nhan = BenhNhan.objects.create(
            nguoi_dung=nguoi_dung,
            ma_benh_nhan=generate_ma_benh_nhan(),
            **validated_data
        )
        return benh_nhan
    
    def validate_ngay_sinh(self, value):
        """Validate ngày sinh không phải tương lai"""
        from datetime import date
        if value > date.today():
            raise serializers.ValidationError("Ngày sinh không thể trong tương lai")
        
        # Tuổi phải từ 0-120
        age = date.today().year - value.year
        if age > 120:
            raise serializers.ValidationError("Tuổi không hợp lệ")
        
        return value
    
    def validate_chieu_cao(self, value):
        if value and (value < 30 or value > 250):
            raise serializers.ValidationError("Chiều cao không hợp lệ (30-250 cm)")
        return value
    
    def validate_can_nang(self, value):
        if value and (value < 2 or value > 300):
            raise serializers.ValidationError("Cân nặng không hợp lệ (2-300 kg)")
        return value

# ==================== SERIALIZERS CHO BÁC SĨ ====================

class BacSiSerializer(serializers.ModelSerializer):
    """Serializer cho bác sĩ"""
    ho_ten = serializers.CharField(source='nguoi_dung.ho_ten', read_only=True)
    email = serializers.EmailField(source='nguoi_dung.email', read_only=True)
    so_dien_thoai = serializers.CharField(source='nguoi_dung.so_dien_thoai', read_only=True)
    avatar = serializers.ImageField(source='nguoi_dung.avatar', read_only=True)
    trinh_do_display = serializers.CharField(source='get_trinh_do_display', read_only=True)
    chuc_vu_display = serializers.CharField(source='get_chuc_vu_display', read_only=True)
    danh_gia_trung_binh = serializers.FloatField(read_only=True)
    
    class Meta:
        model = BacSi
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

class BacSiDetailSerializer(BacSiSerializer):
    """Serializer chi tiết cho bác sĩ"""
    danh_gia = serializers.SerializerMethodField()

    class Meta(BacSiSerializer.Meta):
        fields = '__all__'

    def get_danh_gia(self, obj):
        danh_gia = obj.danh_gia.all().order_by('-created_at')
        return DanhGiaBacSiSerializer(danh_gia, many=True).data

class BacSiCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo bác sĩ mới"""
    nguoi_dung = NguoiDungCreateSerializer()
    ma_bac_si = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = BacSi
        fields = '__all__'
    
    @transaction.atomic
    def create(self, validated_data):
        nguoi_dung_data = validated_data.pop('nguoi_dung')
        nguoi_dung_data['vai_tro'] = 'BAC_SI'
        
        nguoi_dung_serializer = NguoiDungCreateSerializer(data=nguoi_dung_data)
        if nguoi_dung_serializer.is_valid():
            nguoi_dung = nguoi_dung_serializer.save()
        else:
            raise serializers.ValidationError(nguoi_dung_serializer.errors)

        ma = (validated_data.get('ma_bac_si') or '').strip()
        if not ma or BacSi.objects.filter(ma_bac_si=ma).exists():
            validated_data['ma_bac_si'] = BacSi.generate_next_ma_bac_si()
        else:
            validated_data['ma_bac_si'] = ma
        
        bac_si = BacSi.objects.create(nguoi_dung=nguoi_dung, **validated_data)
        return bac_si

# ==================== SERIALIZERS CHO NHÂN VIÊN ====================

class NhanVienSerializer(serializers.ModelSerializer):
    """Serializer cho nhân viên"""
    ho_ten = serializers.CharField(source='nguoi_dung.ho_ten', read_only=True)
    email = serializers.EmailField(source='nguoi_dung.email', read_only=True)
    so_dien_thoai = serializers.CharField(source='nguoi_dung.so_dien_thoai', read_only=True)
    chuc_vu_display = serializers.CharField(source='get_chuc_vu_display', read_only=True)
    
    class Meta:
        model = NhanVien
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

class NhanVienCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo nhân viên mới (cùng pattern BacSiCreateSerializer: fields __all__)."""
    nguoi_dung = NguoiDungCreateSerializer()

    class Meta:
        model = NhanVien
        fields = '__all__'

    @transaction.atomic
    def create(self, validated_data):
        nguoi_dung_data = validated_data.pop('nguoi_dung')
        nguoi_dung_data['vai_tro'] = 'NHAN_VIEN'

        nguoi_dung_serializer = NguoiDungCreateSerializer(data=nguoi_dung_data)
        if not nguoi_dung_serializer.is_valid():
            raise serializers.ValidationError({'nguoi_dung': nguoi_dung_serializer.errors})
        nguoi_dung = nguoi_dung_serializer.save()

        ma = (validated_data.get('ma_nhan_vien') or '').strip()
        if not ma or NhanVien.objects.filter(ma_nhan_vien=ma).exists():
            validated_data['ma_nhan_vien'] = NhanVien.generate_next_ma_nhan_vien()
        else:
            validated_data['ma_nhan_vien'] = ma

        return NhanVien.objects.create(nguoi_dung=nguoi_dung, **validated_data)

class NhanVienDetailSerializer(NhanVienSerializer):
    """Serializer chi tiết cho nhân viên (GET admin). Không dùng list(Meta.fields) khi fields='__all__' — list('__all__') tách thành từng ký tự và gây ImproperlyConfigured."""

    class Meta(NhanVienSerializer.Meta):
        fields = '__all__'
# ==================== SERIALIZERS CHO CÁC MODEL KHÁC ====================

class DanhGiaBacSiSerializer(serializers.ModelSerializer):
    """Serializer cho đánh giá bác sĩ"""
    ten_benh_nhan = serializers.CharField(source='benh_nhan.nguoi_dung.ho_ten', read_only=True)
    
    class Meta:
        model = DanhGiaBacSi
        fields = '__all__'
        read_only_fields = ['created_at']
    
    def validate_diem(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Điểm đánh giá phải từ 1-5")
        return value

class ThongBaoSerializer(serializers.ModelSerializer):
    """Serializer cho thông báo"""
    loai_display = serializers.CharField(source='get_loai_display', read_only=True)
    
    class Meta:
        model = ThongBao
        fields = '__all__'
        read_only_fields = ['created_at']

class DoctorScheduleSerializer(serializers.ModelSerializer):
    """Không dùng source qua bac_si.* để tránh JOIN collation MySQL (doctor_schedule vs bac_si)."""
    bac_si = serializers.UUIDField(source='bac_si_id', read_only=True)
    ten_bac_si = serializers.SerializerMethodField()
    ma_bac_si = serializers.SerializerMethodField()
    ca_lam_display = serializers.CharField(source='get_ca_lam_display', read_only=True)

    class Meta:
        model = DoctorSchedule
        fields = [
            'id', 'bac_si', 'ma_bac_si', 'ten_bac_si', 'ngay_lam', 'ca_lam',
            'ca_lam_display', 'ghi_chu', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def _bac_si_row(self, obj):
        if not obj.bac_si_id:
            return None
        cached = getattr(obj, '_bac_si_cache', None)
        if cached is not None:
            return cached
        from .models import BacSi
        row = BacSi.objects.filter(pk=obj.bac_si_id).select_related('nguoi_dung').first()
        obj._bac_si_cache = row
        return row

    def get_ten_bac_si(self, obj):
        bs = self._bac_si_row(obj)
        return bs.nguoi_dung.ho_ten if bs and bs.nguoi_dung_id else ''

    def get_ma_bac_si(self, obj):
        bs = self._bac_si_row(obj)
        return bs.ma_bac_si if bs else ''


class DoctorScheduleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorSchedule
        fields = ['ngay_lam', 'ca_lam', 'ghi_chu']

    def validate_ngay_lam(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError('Không thể đăng ký ca cho ngày trong quá khứ')
        return value

    def validate_ca_lam(self, value):
        valid = {c[0] for c in DoctorSchedule.CA_LAM_CHOICES}
        if value not in valid:
            raise serializers.ValidationError('Ca làm phải là SANG, CHIEU hoặc TOI')
        return value

    def validate(self, data):
        from .doctor_schedule import CA_LABEL, ca_lam_da_qua

        ngay = data.get('ngay_lam')
        ca = data.get('ca_lam')
        if ngay and ca and ca_lam_da_qua(ngay, ca):
            ten_ca = CA_LABEL.get(ca, ca)
            raise serializers.ValidationError({
                'ca_lam': (
                    f'{ten_ca} ngày {ngay.strftime("%d/%m/%Y")} đã qua, '
                    f'không thể đăng ký ca này.'
                ),
            })
        return data


class LichLamViecSerializer(serializers.ModelSerializer):
    """Serializer cho lịch làm việc"""
    ten_nguoi_dung = serializers.CharField(source='nguoi_dung.ho_ten', read_only=True)
    trang_thai_display = serializers.CharField(source='get_trang_thai_display', read_only=True)
    
    class Meta:
        model = LichLamViec
        fields = '__all__'
    
    def validate(self, data):
        if data['gio_bat_dau'] >= data['gio_ket_thuc']:
            raise serializers.ValidationError("Giờ kết thúc phải sau giờ bắt đầu")
        return data

class LichSuKhamBenhSerializer(serializers.ModelSerializer):
    """Serializer cho lịch sử khám bệnh"""
    ten_benh_nhan = serializers.CharField(source='benh_nhan.nguoi_dung.ho_ten', read_only=True)
    ten_bac_si = serializers.CharField(source='bac_si.nguoi_dung.ho_ten', read_only=True)
    
    class Meta:
        model = LichSuKhamBenh
        fields = '__all__'

class NhatKyHoatDongSerializer(serializers.ModelSerializer):
    """Serializer cho nhật ký hoạt động"""
    ten_nguoi_dung = serializers.CharField(source='nguoi_dung.ho_ten', read_only=True)
    hanh_dong_display = serializers.CharField(source='get_hanh_dong_display', read_only=True)
    
    class Meta:
        model = NhatKyHoatDong
        fields = '__all__'
        read_only_fields = ['created_at']