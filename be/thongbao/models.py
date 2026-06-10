from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
import uuid


# ---------------------------------------------------------------------------
# ThongBao
# ---------------------------------------------------------------------------
class ThongBao(models.Model):
    class LoaiThongBao(models.TextChoices):
        LICH_HEN = 'LICH_HEN', 'Lịch hẹn'
        DON_HANG = 'DON_HANG', 'Đơn hàng'
        TIN_NHAN = 'TIN_NHAN', 'Tin nhắn mới'
        HE_THONG = 'HE_THONG', 'Hệ thống'
        THANH_TOAN = 'THANH_TOAN', 'Thanh toán'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nguoi_nhan = models.ForeignKey(
        'nguoidung.NguoiDung',
        on_delete=models.CASCADE,
        related_name='thong_bao_list',  # Changed to unique name
    )
    loai_thong_bao = models.CharField(max_length=20, choices=LoaiThongBao.choices)
    tieu_de = models.CharField(max_length=255)
    noi_dung = models.TextField()

    da_doc_luc = models.DateTimeField(
        null=True,
        blank=True,
        help_text='None = chưa đọc; có giá trị = thời điểm đọc',
    )

    ngay_tao = models.DateTimeField(auto_now_add=True)

    lien_ket = models.URLField(
        max_length=500, blank=True, help_text='URL chuyển hướng khi bấm vào thông báo'
    )

    class Meta:
        db_table = 'thong_bao_app'  # Changed to avoid conflict
        verbose_name = 'Thông báo'
        verbose_name_plural = 'Thông báo'
        ordering = ['-ngay_tao']
        indexes = [
            models.Index(fields=['nguoi_nhan', 'da_doc_luc']),
            models.Index(fields=['ngay_tao']),
            models.Index(fields=['loai_thong_bao']),
        ]

    def __str__(self):
        return f"{self.tieu_de} — {self.nguoi_nhan.ho_ten}"

    @property
    def da_doc(self) -> bool:
        """Tương thích ngược với code cũ kiểm tra da_doc."""
        return self.da_doc_luc is not None

    def danh_dau_da_doc(self) -> None:
        """Đánh dấu thông báo đã đọc (nếu chưa đọc)."""
        if self.da_doc_luc is None:
            self.da_doc_luc = timezone.now()
            self.save(update_fields=['da_doc_luc'])

    @classmethod
    def tao_thong_bao(cls, nguoi_nhan, loai, tieu_de, noi_dung, lien_ket=''):
        """
        Helper tạo thông báo.
        """
        loai_hop_le = [c[0] for c in cls.LoaiThongBao.choices]
        if loai not in loai_hop_le:
            raise ValidationError(
                f"Loại thông báo '{loai}' không hợp lệ. "
                f"Các loại hợp lệ: {loai_hop_le}"
            )
        return cls.objects.create(
            nguoi_nhan=nguoi_nhan,
            loai_thong_bao=loai,
            tieu_de=tieu_de,
            noi_dung=noi_dung,
            lien_ket=lien_ket,
        )

    @classmethod
    def danh_dau_tat_ca_da_doc(cls, nguoi_nhan) -> int:
        """
        Bulk-update tất cả thông báo chưa đọc của một user.
        Trả về số bản ghi đã cập nhật.
        """
        return cls.objects.filter(
            nguoi_nhan=nguoi_nhan,
            da_doc_luc__isnull=True,
        ).update(da_doc_luc=timezone.now())

    @classmethod
    def dem_chua_doc(cls, nguoi_nhan) -> int:
        """Đếm số thông báo chưa đọc — dùng trong badge UI."""
        return cls.objects.filter(
            nguoi_nhan=nguoi_nhan,
            da_doc_luc__isnull=True,
        ).count()


# ---------------------------------------------------------------------------
# ThongBaoPhatHanh — admin gửi thông báo theo phạm vi
# ---------------------------------------------------------------------------
class ThongBaoPhatHanh(models.Model):
    """Bản ghi phát hành thông báo (lưu metadata + phạm vi gửi)."""

    class PhamVi(models.TextChoices):
        TAT_CA = 'TAT_CA', 'Toàn bộ người dùng'
        VAI_TRO = 'VAI_TRO', 'Theo vai trò'
        CHUC_VU = 'CHUC_VU', 'Theo chức vụ nhân viên'
        NGUOI_DUNG = 'NGUOI_DUNG', 'Một người dùng cụ thể'

    class LoaiThongBao(models.TextChoices):
        HE_THONG = 'HE_THONG', 'Hệ thống'
        LICH_HEN = 'LICH_HEN', 'Lịch hẹn'
        DON_THUOC = 'DON_THUOC', 'Đơn thuốc'
        TIEM_CHUNG = 'TIEM_CHUNG', 'Tiêm chủng'
        THANH_TOAN = 'THANH_TOAN', 'Thanh toán'
        TAI_KHOAN = 'TAI_KHOAN', 'Tài khoản'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tieu_de = models.CharField(max_length=255)
    noi_dung = models.TextField()
    loai_thong_bao = models.CharField(
        max_length=20,
        choices=LoaiThongBao.choices,
        default=LoaiThongBao.HE_THONG,
    )
    pham_vi = models.CharField(max_length=20, choices=PhamVi.choices)

    vai_tro = models.CharField(
        max_length=20,
        blank=True,
        help_text='BENH_NHAN | BAC_SI | NHAN_VIEN | ADMIN khi pham_vi=VAI_TRO',
    )
    chuc_vu = models.CharField(
        max_length=30,
        blank=True,
        help_text='LE_TAN | BAN_THUOC | KE_TOAN khi pham_vi=CHUC_VU',
    )
    nguoi_nhan = models.ForeignKey(
        'nguoidung.NguoiDung',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='thong_bao_phat_hanh_chi_dinh',
        db_constraint=False,
        help_text='Khi pham_vi=NGUOI_DUNG',
    )
    nguoi_gui = models.ForeignKey(
        'nguoidung.NguoiDung',
        on_delete=models.PROTECT,
        related_name='thong_bao_da_gui',
        db_constraint=False,
    )
    thoi_gian_gui = models.DateTimeField(help_text='Thời điểm gửi thông báo')
    so_nguoi_nhan = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'thong_bao_phat_hanh'
        verbose_name = 'Phát hành thông báo'
        verbose_name_plural = 'Phát hành thông báo'
        ordering = ['-thoi_gian_gui', '-created_at']
        indexes = [
            models.Index(fields=['-thoi_gian_gui']),
            models.Index(fields=['pham_vi']),
            models.Index(fields=['loai_thong_bao']),
        ]

    def __str__(self):
        return f'{self.tieu_de} ({self.get_pham_vi_display()})'