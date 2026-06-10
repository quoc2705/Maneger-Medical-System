"""Phân phối thông báo admin → hộp thư người dùng (nguoidung.ThongBao)."""
from django.db.models import Q
from django.utils import timezone

from nguoidung.models import NguoiDung, NhanVien, ThongBao

from .models import ThongBaoPhatHanh

# Chức vụ được phép chọn khi gửi thông báo theo phạm vi CHUC_VU
CHUC_VU_PHAT_HANH = frozenset({'BAN_THUOC', 'LE_TAN', 'KE_TOAN'})


def chuc_vu_phat_hanh_options():
    labels = dict(NhanVien.CHUC_VU_CHOICES)
    return [
        {'value': code, 'label': labels.get(code, code)}
        for code in NhanVien.CHUC_VU_CHOICES
        if code[0] in CHUC_VU_PHAT_HANH
    ]


def lay_nguoi_nhan_theo_pham_vi(phat_hanh: ThongBaoPhatHanh):
    """Trả về queryset NguoiDung active theo phạm vi phát hành."""
    qs = NguoiDung.objects.filter(is_active=True)

    if phat_hanh.pham_vi == ThongBaoPhatHanh.PhamVi.TAT_CA:
        return qs

    if phat_hanh.pham_vi == ThongBaoPhatHanh.PhamVi.VAI_TRO:
        if not phat_hanh.vai_tro:
            return qs.none()
        return qs.filter(vai_tro=phat_hanh.vai_tro)

    if phat_hanh.pham_vi == ThongBaoPhatHanh.PhamVi.CHUC_VU:
        if not phat_hanh.chuc_vu:
            return qs.none()
        return qs.filter(
            vai_tro='NHAN_VIEN',
            nhan_vien__chuc_vu=phat_hanh.chuc_vu,
            nhan_vien__is_working=True,
        )

    if phat_hanh.pham_vi == ThongBaoPhatHanh.PhamVi.NGUOI_DUNG:
        if not phat_hanh.nguoi_nhan_id:
            return qs.none()
        return qs.filter(pk=phat_hanh.nguoi_nhan_id)

    return qs.none()


def phan_phoi_thong_bao(phat_hanh: ThongBaoPhatHanh) -> int:
    """
    Tạo bản ghi ThongBao cho từng người nhận.
    Trả về số bản ghi đã tạo.
    """
    recipients = list(lay_nguoi_nhan_theo_pham_vi(phat_hanh).distinct())
    if not recipients:
        phat_hanh.so_nguoi_nhan = 0
        phat_hanh.save(update_fields=['so_nguoi_nhan'])
        return 0

    phat_hanh_id = str(phat_hanh.id)
    loai = phat_hanh.loai_thong_bao
    # Đồng bộ loại với bảng nguoidung_thong_bao
    loai_map = {
        'DON_HANG': 'DON_THUOC',
    }
    loai_nd = loai_map.get(loai, loai)
    hop_le = {c[0] for c in ThongBao.LOAI_THONG_BAO}
    if loai_nd not in hop_le:
        loai_nd = 'HE_THONG'

    bulk = []
    for user in recipients:
        bulk.append(
            ThongBao(
                nguoi_nhan=user,
                loai=loai_nd,
                tieu_de=phat_hanh.tieu_de,
                noi_dung=phat_hanh.noi_dung,
                du_lieu_lien_quan={
                    'phat_hanh_id': phat_hanh_id,
                    'nguoi_gui_id': str(phat_hanh.nguoi_gui_id),
                    'nguoi_gui_ten': getattr(phat_hanh.nguoi_gui, 'ho_ten', ''),
                },
            )
        )

    ThongBao.objects.bulk_create(bulk, batch_size=500)
    phat_hanh.so_nguoi_nhan = len(bulk)
    phat_hanh.save(update_fields=['so_nguoi_nhan'])
    return len(bulk)


def dem_nguoi_nhan_du_kien(pham_vi, vai_tro='', chuc_vu='', nguoi_nhan_id=None) -> int:
    """Ước lượng số người nhận trước khi gửi (preview)."""
    fake = ThongBaoPhatHanh(
        pham_vi=pham_vi,
        vai_tro=vai_tro or '',
        chuc_vu=chuc_vu or '',
        nguoi_nhan_id=nguoi_nhan_id,
    )
    return lay_nguoi_nhan_theo_pham_vi(fake).count()
