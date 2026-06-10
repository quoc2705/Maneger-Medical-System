from django.db import transaction
from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from .models import *
from nguoidung.serializers import BenhNhanSerializer, BacSiSerializer, NguoiDungSerializer
from nguoidung.models import BenhNhan
from thuoc.models import Vaccine
from thuoc.serializers import VaccineSerializer

# Tên field model LichHen (Meta.fields = '__all__' không kết hợp được với field bổ sung ở LichHenDetailSerializer)
LICH_HEN_MODEL_FIELD_NAMES = [f.name for f in LichHen._meta.fields]

# ==================== SERIALIZERS CHO LỊCH HẸN ====================

class LichHenSerializer(serializers.ModelSerializer):
    """Serializer cơ bản cho lịch hẹn"""
    ten_benh_nhan = serializers.CharField(source='benh_nhan.nguoi_dung.ho_ten', read_only=True)
    ma_benh_nhan = serializers.CharField(source='benh_nhan.ma_benh_nhan', read_only=True)
    ten_bac_si = serializers.CharField(source='bac_si.nguoi_dung.ho_ten', read_only=True)
    loai_lich_display = serializers.CharField(source='get_loai_lich_display', read_only=True)
    trang_thai_display = serializers.CharField(source='get_trang_thai_display', read_only=True)
    thoi_gian_cho = serializers.IntegerField(read_only=True)
    thoi_gian_kham = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = LichHen
        fields = '__all__'
        read_only_fields = ['ma_lich_hen', 'ngay_tao', 'ngay_cap_nhat', 'thoi_gian_cho', 'thoi_gian_kham']

class LichHenDetailSerializer(LichHenSerializer):
    """Serializer chi tiết lịch hẹn"""
    benh_nhan = BenhNhanSerializer(read_only=True)
    bac_si = BacSiSerializer(read_only=True)
    nhan_vien_tao = serializers.SerializerMethodField()
    nguoi_huy = NguoiDungSerializer(read_only=True)
    lich_su = serializers.SerializerMethodField()
    nhac_nho = serializers.SerializerMethodField()
    
    class Meta(LichHenSerializer.Meta):
        fields = LICH_HEN_MODEL_FIELD_NAMES + [
            'ten_benh_nhan', 'ma_benh_nhan', 'ten_bac_si', 'loai_lich_display', 'trang_thai_display',
            'thoi_gian_cho', 'thoi_gian_kham', 'lich_su', 'nhac_nho',
        ]
    
    def get_nhan_vien_tao(self, obj):
        if obj.nhan_vien_tao:
            return {
                'id': str(obj.nhan_vien_tao.nguoi_dung_id),
                'ho_ten': obj.nhan_vien_tao.nguoi_dung.ho_ten,
                'ma_nhan_vien': obj.nhan_vien_tao.ma_nhan_vien
            }
        return None
    
    def get_lich_su(self, obj):
        return LichSuLichHenSerializer(obj.lich_su.all()[:10], many=True).data
    
    def get_nhac_nho(self, obj):
        return NhacNhoLichHenSerializer(obj.nhac_nho.all(), many=True).data

class LichHenCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo lịch hẹn mới"""
    benh_nhan = serializers.PrimaryKeyRelatedField(
        queryset=BenhNhan.objects.all(), required=False, allow_null=True
    )
    vaccine = serializers.PrimaryKeyRelatedField(
        queryset=Vaccine.objects.filter(trang_thai=True),
        required=False,
        allow_null=True,
        write_only=True,
        help_text='Bắt buộc khi loai_lich = TIEM_CHUNG',
    )
    trang_thai = serializers.ChoiceField(
        choices=LichHen.TRANG_THAI_CHOICES, required=False,
        help_text='Chỉ NV/Admin: thường dùng DA_DAT hoặc DA_XAC_NHAN khi đặt tại quầy',
    )
    ma_benh_nhan = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        help_text='Thay cho benh_nhan (UUID): nhập mã BN tại quầy',
    )

    class Meta:
        model = LichHen
        fields = [
            'benh_nhan', 'ma_benh_nhan', 'bac_si', 'loai_lich', 'ngay_gio_hen',
            'ngay_gio_ket_thuc', 'so_dien_thoai_lien_he', 'email_lien_he',
            'can_nhac_nho', 'ghi_chu', 'trang_thai', 'vaccine',
        ]
    
    def validate_ngay_gio_hen(self, value):
        """Validate ngày giờ hẹn không được trong quá khứ"""
        if value < timezone.now():
            raise serializers.ValidationError("Ngày giờ hẹn không thể trong quá khứ")
        return value
    
    def validate(self, data):
        """Validate tổng thể"""
        ma_bn = (data.pop('ma_benh_nhan', None) or '').strip()
        req = self.context.get('request')
        u = getattr(req, 'user', None) if req else None
        if ma_bn:
            bn = BenhNhan.objects.filter(ma_benh_nhan__iexact=ma_bn).first()
            if not bn:
                raise serializers.ValidationError(
                    {'ma_benh_nhan': 'Không tìm thấy bệnh nhân với mã này'}
                )
            data['benh_nhan'] = bn
        elif not data.get('benh_nhan'):
            if u and getattr(u, 'vai_tro', None) == 'BENH_NHAN' and hasattr(u, 'benh_nhan'):
                data['benh_nhan'] = u.benh_nhan
            else:
                raise serializers.ValidationError(
                    {'benh_nhan': 'Cần UUID bệnh nhân hoặc ma_benh_nhan'}
                )

        # Lịch tiêm bắt buộc phải chọn vaccine
        if data.get('loai_lich') == 'TIEM_CHUNG' and not data.get('vaccine'):
            raise serializers.ValidationError(
                {'vaccine': 'Vui lòng chọn vaccine khi đặt lịch tiêm chủng'}
            )
        if data.get('loai_lich') != 'TIEM_CHUNG':
            data.pop('vaccine', None)

        # Kiểm tra giờ kết thúc
        if data.get('ngay_gio_ket_thuc'):
            if data['ngay_gio_ket_thuc'] <= data['ngay_gio_hen']:
                raise serializers.ValidationError(
                    {"ngay_gio_ket_thuc": "Giờ kết thúc phải sau giờ bắt đầu"}
                )
        
        # Kiểm tra xem bác sĩ có bận không
        if data.get('bac_si'):
            ngay_gio_hen = data['ngay_gio_hen']
            ngay_gio_ket_thuc = data.get('ngay_gio_ket_thuc') or (ngay_gio_hen + timedelta(minutes=30))
            
            lich_trung = LichHen.objects.filter(
                bac_si=data['bac_si'],
                ngay_gio_hen__lt=ngay_gio_ket_thuc,
                ngay_gio_ket_thuc__gt=ngay_gio_hen,
                trang_thai__in=['DA_DAT', 'DA_XAC_NHAN', 'DANG_KHAM']
            )
            
            if lich_trung.exists():
                raise serializers.ValidationError(
                    "Bác sĩ đã có lịch hẹn trong khung giờ này"
                )

        tr = data.get('trang_thai')
        if tr:
            if not u or not (
                getattr(u, 'is_superuser', False)
                or getattr(u, 'vai_tro', None) in ('ADMIN', 'NHAN_VIEN')
            ):
                raise serializers.ValidationError(
                    {'trang_thai': 'Chỉ nhân viên hoặc admin được đặt trạng thái khi tạo lịch'}
                )
            if tr not in ('CHO_XAC_NHAN', 'DA_DAT', 'DA_XAC_NHAN'):
                raise serializers.ValidationError(
                    {'trang_thai': 'Khi tạo mới chỉ dùng CHO_XAC_NHAN, DA_DAT hoặc DA_XAC_NHAN'}
                )

        return data
    
    def create(self, validated_data):
        vaccine = validated_data.pop('vaccine', None)

        # Tạo mã lịch hẹn tự động
        from django.db.models import Max
        import datetime
        
        today = datetime.datetime.now()
        prefix = f"LH{today.strftime('%y%m')}"
        
        last_lich = LichHen.objects.filter(ma_lich_hen__startswith=prefix).aggregate(
            Max('ma_lich_hen')
        )['ma_lich_hen__max']
        
        if last_lich:
            last_number = int(last_lich[-4:])
            new_number = last_number + 1
        else:
            new_number = 1
        
        validated_data['ma_lich_hen'] = f"{prefix}{new_number:04d}"
        
        with transaction.atomic():
            # Tạo lịch hẹn
            lich_hen = LichHen.objects.create(**validated_data)

            # Lịch tiêm tạo kèm thông tin vaccine ngay lúc đặt lịch
            if lich_hen.loai_lich == 'TIEM_CHUNG' and vaccine:
                LichTiem.objects.create(
                    lich_hen=lich_hen,
                    vaccine=vaccine,
                    so_mui=1,
                    ghi_chu='Chọn từ màn hình đặt lịch bệnh nhân',
                )

            # Tạo lịch sử
            LichSuLichHen.objects.create(
                lich_hen=lich_hen,
                trang_thai_cu='',
                trang_thai_moi=lich_hen.trang_thai,
                nguoi_thay_doi=self.context['request'].user
            )
        
        return lich_hen

class LichHenUpdateSerializer(serializers.ModelSerializer):
    """Serializer cho cập nhật lịch hẹn"""
    class Meta:
        model = LichHen
        fields = [
            'bac_si', 'ngay_gio_hen', 'ngay_gio_ket_thuc',
            'so_dien_thoai_lien_he', 'email_lien_he', 'can_nhac_nho', 'ghi_chu',
            'ma_phong', 'ten_phong',
        ]
    
    def validate_ngay_gio_hen(self, value):
        if value and value < timezone.now():
            raise serializers.ValidationError("Ngày giờ hẹn không thể trong quá khứ")
        return value

class LichHenActionSerializer(serializers.Serializer):
    """Serializer cho các action (xác nhận, hủy, etc)"""
    ly_do = serializers.CharField(required=False, allow_blank=True)
    ghi_chu = serializers.CharField(required=False, allow_blank=True)


class PhanCongBacSiSerializer(serializers.Serializer):
    """Phân công / đổi bác sĩ cho lịch hẹn (lễ tân điều phối phòng khám)."""
    bac_si = serializers.UUIDField()


class PhanCongPhongSerializer(serializers.Serializer):
    """Gán mã/tên phòng khám cho lịch đã check-in."""
    ma_phong = serializers.CharField(max_length=30)
    ten_phong = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')


class WalkInLichHenSerializer(serializers.Serializer):
    """Walk-in: tạo lịch mới trạng thái CHECKED_IN, xếp theo hàng chờ (STT), BS theo tải nhẹ nhất."""
    benh_nhan = serializers.UUIDField(required=False, allow_null=True)
    ma_benh_nhan = serializers.CharField(required=False, allow_blank=True, default='')
    bac_si = serializers.UUIDField(required=False, allow_null=True)
    tu_dong_chon_bac_si = serializers.BooleanField(default=True)
    loai_lich = serializers.ChoiceField(choices=LichHen.LOAI_LICH_CHOICES, default='KHAM_BENH')
    vaccine = serializers.PrimaryKeyRelatedField(
        queryset=Vaccine.objects.filter(trang_thai=True),
        required=False,
        allow_null=True,
    )
    ma_phong = serializers.CharField(required=False, allow_blank=True, default='')
    ten_phong = serializers.CharField(required=False, allow_blank=True, default='')
    ghi_chu = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        ma = (data.get('ma_benh_nhan') or '').strip()
        uid = data.get('benh_nhan')
        data.pop('ma_benh_nhan', None)
        if ma:
            bn = BenhNhan.objects.filter(ma_benh_nhan__iexact=ma).first()
            if not bn:
                raise serializers.ValidationError(
                    {'ma_benh_nhan': 'Không tìm thấy bệnh nhân với mã này'}
                )
            data['benh_nhan'] = bn.pk
        elif uid:
            data['benh_nhan'] = uid
        else:
            raise serializers.ValidationError(
                'Cần mã bệnh nhân (ma_benh_nhan) hoặc UUID khóa bệnh nhân (benh_nhan)'
            )
        loai = data.get('loai_lich') or 'KHAM_BENH'
        if loai == 'TIEM_CHUNG' and not data.get('vaccine'):
            raise serializers.ValidationError(
                {'vaccine': 'Vui lòng chọn vaccine khi tiếp nhận tiêm chủng'}
            )
        if loai != 'TIEM_CHUNG':
            data['vaccine'] = None
        return data

# ==================== SERIALIZERS CHO LỊCH KHÁM ====================

class LichKhamSerializer(serializers.ModelSerializer):
    """Serializer cho lịch khám"""
    ten_bac_si = serializers.CharField(source='bac_si.nguoi_dung.ho_ten', read_only=True)
    
    class Meta:
        model = LichKham
        fields = '__all__'

class LichKhamCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo lịch khám"""
    class Meta:
        model = LichKham
        fields = ['lich_hen', 'bac_si', 'ly_do_kham', 'trieu_chung', 'ghi_chu']
    
    def validate(self, data):
        # Kiểm tra loại lịch hẹn
        if data['lich_hen'].loai_lich != 'KHAM_BENH':
            raise serializers.ValidationError("Lịch hẹn không phải là lịch khám bệnh")
        return data

# ==================== SERIALIZERS CHO LỊCH TIÊM ====================

class LichTiemSerializer(serializers.ModelSerializer):
    """Serializer cho lịch tiêm"""
    ten_vaccine = serializers.CharField(source='vaccine.ten_vaccine', read_only=True)
    ten_nguoi_tiem = serializers.CharField(source='nguoi_tiem.nguoi_dung.ho_ten', read_only=True)
    trang_thai_tiem_display = serializers.CharField(source='get_trang_thai_tiem_display', read_only=True)
    
    class Meta:
        model = LichTiem
        fields = '__all__'

class LichTiemCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo lịch tiêm"""
    class Meta:
        model = LichTiem
        fields = ['lich_hen', 'vaccine', 'so_mui', 'ghi_chu']
    
    def validate(self, data):
        # Kiểm tra loại lịch hẹn
        if data['lich_hen'].loai_lich != 'TIEM_CHUNG':
            raise serializers.ValidationError("Lịch hẹn không phải là lịch tiêm chủng")
        
        # Kiểm tra số mũi
        if data['so_mui'] < 1:
            raise serializers.ValidationError({"so_mui": "Số mũi phải lớn hơn 0"})
        
        return data

class LichTiemThucHienSerializer(serializers.Serializer):
    """Serializer cho thực hiện tiêm"""
    lo_vaccine = serializers.CharField(required=True)
    han_su_dung = serializers.DateField(required=True)
    phan_ung_sau_tiem = serializers.CharField(required=False, allow_blank=True)
    xu_tri_phan_ung = serializers.CharField(required=False, allow_blank=True)
    
    def validate_han_su_dung(self, value):
        if value < timezone.now().date():
            raise serializers.ValidationError("Vaccine đã hết hạn sử dụng")
        return value

# ==================== SERIALIZERS CHO LỊCH SỬ ====================

class LichSuLichHenSerializer(serializers.ModelSerializer):
    """Serializer cho lịch sử lịch hẹn"""
    ten_nguoi_thay_doi = serializers.CharField(source='nguoi_thay_doi.ho_ten', read_only=True)
    
    class Meta:
        model = LichSuLichHen
        fields = '__all__'
        read_only_fields = ['created_at']

class GuiNhacBenhNhanSerializer(serializers.Serializer):
    """Lễ tân gửi nhắc bệnh nhân tại quầy (tiếp nhận / hàng chờ)."""
    LOAI = (
        ('NHAC_CO_HEN', 'Nhắc có lịch hẹn'),
        ('SAP_DEN_LUOT', 'Sắp đến lượt'),
        ('MOI_VAO_PHONG', 'Mời vào phòng'),
        ('CHO_DOI', 'Vui lòng chờ'),
        ('TU_CHON', 'Tùy chỉnh'),
    )
    loai = serializers.ChoiceField(choices=[c[0] for c in LOAI], default='TU_CHON')
    noi_dung = serializers.CharField(required=False, allow_blank=True, max_length=2000)


# ==================== SERIALIZERS CHO NHẮC NHỞ ====================

class NhacNhoLichHenSerializer(serializers.ModelSerializer):
    """Serializer cho nhắc nhở lịch hẹn"""
    loai_nhac_display = serializers.CharField(source='get_loai_nhac_display', read_only=True)
    trang_thai_display = serializers.CharField(source='get_trang_thai_display', read_only=True)
    
    class Meta:
        model = NhacNhoLichHen
        fields = '__all__'
        read_only_fields = ['sent_at', 'created_at']

class NhacNhoCreateSerializer(serializers.ModelSerializer):
    """Serializer cho tạo nhắc nhở"""
    class Meta:
        model = NhacNhoLichHen
        fields = ['lich_hen', 'loai_nhac', 'thoi_gian_nhac', 'noi_dung']
    
    def validate_thoi_gian_nhac(self, value):
        if value < timezone.now():
            raise serializers.ValidationError("Thời gian nhắc không thể trong quá khứ")
        return value

# ==================== SERIALIZERS CHO ĐÁNH GIÁ ====================

class DanhGiaDichVuSerializer(serializers.ModelSerializer):
    """Serializer cho đánh giá dịch vụ"""
    ten_benh_nhan = serializers.CharField(source='lich_hen.benh_nhan.nguoi_dung.ho_ten', read_only=True)
    
    class Meta:
        model = DanhGiaDichVu
        fields = '__all__'
        read_only_fields = ['created_at']
    
    def validate(self, data):
        # Kiểm tra lịch hẹn đã hoàn thành chưa
        if data['lich_hen'].trang_thai != 'HOAN_THANH':
            raise serializers.ValidationError("Chỉ có thể đánh giá lịch hẹn đã hoàn thành")
        
        # Kiểm tra đã đánh giá chưa
        if hasattr(data['lich_hen'], 'danh_gia'):
            raise serializers.ValidationError("Lịch hẹn này đã được đánh giá")
        
        return data

# ==================== SERIALIZERS CHO THỐNG KÊ ====================

class ThongKeLichHenSerializer(serializers.Serializer):
    """Serializer cho thống kê lịch hẹn"""
    tong_so = serializers.IntegerField()
    theo_trang_thai = serializers.DictField()
    theo_loai = serializers.DictField()
    theo_bac_si = serializers.ListField()
    hom_nay = serializers.IntegerField()
    sap_toi = serializers.IntegerField()

class BaoCaoLichHenSerializer(serializers.Serializer):
    """Serializer cho báo cáo lịch hẹn"""
    tu_ngay = serializers.DateField()
    den_ngay = serializers.DateField()
    tong_lich_hen = serializers.IntegerField()
    ty_le_hoan_thanh = serializers.FloatField()
    ty_le_huy = serializers.FloatField()
    ty_le_vang_mat = serializers.FloatField()
    thoi_gian_cho_trung_binh = serializers.FloatField()
    danh_gia_trung_binh = serializers.FloatField()