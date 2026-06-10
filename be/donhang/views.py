import logging
from django.conf import settings
from django.shortcuts import render, get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.paginator import Paginator
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from collections import defaultdict

from django.db.models import Q, Sum, Count, F
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
import json
import uuid

from .models import GioHang, SanPhamGioHang, DonHang, ChiTietDonHang, ThanhToan, LichSuDonHang
from thuoc.models import Thuoc
from nguoidung.models import BenhNhan, NhanVien
from benhan.models import DonThuoc, ChiTietDonThuoc
from benhan.revenue_utils import (
    don_thuoc_co_doanh_q,
    loc_don_thuoc_theo_ky,
)
from .revenue_utils import loc_don_hang_theo_ky_doanh
from nguoidung.roles import la_nhan_vien_ban_thuoc
from .vnpay_utils import (
    build_payment_url,
    is_vnpay_portal_test_ipn,
    verify_vnpay_signature,
    vnpay_da_cau_hinh,
)
from .vnpay_notifications import gui_xac_nhan_thanh_toan_vnpay

logger_dh = logging.getLogger(__name__)

def _benh_nhan_tu_request(request):
    if hasattr(request.user, 'benh_nhan'):
        return request.user.benh_nhan
    return None

def _co_quyen_quan_ly_don_hang(request):
    return request.user.is_superuser or request.user.vai_tro in ['ADMIN', 'NHAN_VIEN']


def _co_quyen_ban_thuoc_tai_quay(request):
    """Chỉ nhân viên có chức vụ Bán thuốc (hoặc admin)."""
    return la_nhan_vien_ban_thuoc(request.user)


def _bac_si_tu_request(request):
    if getattr(request.user, 'vai_tro', None) == 'BAC_SI' and hasattr(request.user, 'bac_si'):
        return request.user.bac_si
    return None


def _kiem_tra_quyen_xem_don_bac_si(request, don_hang):
    bs = _bac_si_tu_request(request)
    if not bs:
        return False
    if don_hang.trang_thai_duyet_bs == DonHang.TrangThaiDuyetThuocDacThu.CHO_DUYET:
        return True
    return don_hang.bac_si_duyet_id == bs.id

def _kiem_tra_quyen_benh_nhan(request, benh_nhan):
    if _co_quyen_quan_ly_don_hang(request):
        return True
    my_bn = _benh_nhan_tu_request(request)
    return my_bn is not None and benh_nhan.pk == my_bn.pk

def _thuoc_ton_kho(thuoc):
    """Lấy tồn kho hiện tại của thuốc theo model thuoc."""
    try:
        return int(thuoc.ton_kho())
    except Exception:
        return 0

def _payload_hoa_don_tai_quay(don_hang):
    """Dữ liệu in hóa đơn tại quầy (theo toa / lẻ), kèm PTTT nếu đã có bản ghi thanh toán."""
    lines = []
    for item in don_hang.chi_tiet_don_hang.select_related('thuoc').all():
        lines.append(
            {
                'ten_thuoc': item.thuoc.ten_thuoc,
                'so_luong': item.so_luong,
                'don_gia': float(item.don_gia),
                'thanh_tien': float(item.thanh_tien()),
            }
        )
    bn = don_hang.benh_nhan
    nd = bn.nguoi_dung
    try:
        tt = don_hang.thanh_toan
    except ObjectDoesNotExist:
        tt = None
    phuong_thuc_ma = tt.phuong_thuc if tt else None
    phuong_thuc_display = tt.get_phuong_thuc_display() if tt else 'Chưa thanh toán'
    ngay_tt = tt.ngay_thanh_toan.isoformat() if tt else None
    return {
        'ma_don_hang': don_hang.ma_don_hang,
        'loai_ban': 'theo_toa' if don_hang.don_thuoc_id else 'ban_le',
        'ma_toa': don_hang.don_thuoc.ma_don if don_hang.don_thuoc_id else None,
        'benh_nhan': {
            'ma_benh_nhan': bn.ma_benh_nhan,
            'ho_ten': nd.ho_ten,
            'so_dien_thoai': nd.so_dien_thoai or '',
        },
        'dia_chi_giao_hang': don_hang.dia_chi_giao_hang,
        'ngay_tao': don_hang.ngay_tao.isoformat(),
        'chi_tiet': lines,
        'tong_tien': float(don_hang.tong_tien),
        'ghi_chu': don_hang.ghi_chu or '',
        'phuong_thuc': phuong_thuc_ma,
        'phuong_thuc_display': phuong_thuc_display,
        'ngay_thanh_toan': ngay_tt,
    }


def _dong_bo_don_thuoc_sau_thanh_toan_tai_quay(don_hang, phuong_thuc_thanh_toan):
    """
    Đơn tại quầy gắn toa bác sĩ: sau thanh toán đánh dấu đơn thuốc hoàn thành (bán xong tại quầy).
    """
    if not don_hang.don_thuoc_id or don_hang.loai_don != DonHang.LoaiDon.TAI_QUAY:
        return
    pt_tt = phuong_thuc_thanh_toan
    if pt_tt in (ThanhToan.PhuongThuc.TIEN_MAT, 'TIEN_MAT'):
        pt_dt = 'TIEN_MAT'
    elif pt_tt in (ThanhToan.PhuongThuc.VNPAY, 'VNPAY'):
        pt_dt = 'CHUYEN_KHOAN'
    else:
        pt_dt = 'TIEN_MAT'
    dt = DonThuoc.objects.get(pk=don_hang.don_thuoc_id)
    dt.da_thanh_toan = True
    dt.trang_thai = 'HOAN_THANH'
    dt.ngay_thanh_toan = timezone.now()
    dt.phuong_thuc_thanh_toan = pt_dt
    dt.save(
        update_fields=['da_thanh_toan', 'trang_thai', 'ngay_thanh_toan', 'phuong_thuc_thanh_toan', 'ngay_cap_nhat']
    )


def _giam_ton_kho_thuoc(thuoc, so_luong_can_tru):
    """
    Trừ tồn kho theo từng lô còn hạn (ưu tiên lô hết hạn sớm).
    Trả về True nếu trừ đủ, False nếu thiếu hàng.
    """
    con_lai = int(so_luong_can_tru or 0)
    if con_lai <= 0:
        return True

    ton_hien_tai = _thuoc_ton_kho(thuoc)
    if ton_hien_tai < con_lai:
        return False

    lo_hang = thuoc.kho_thuoc.filter(
        han_su_dung__gt=timezone.now().date(),
        so_luong__gt=0
    ).order_by('han_su_dung', 'ngay_nhap')

    for lo in lo_hang:
        if con_lai <= 0:
            break
        muc_tru = min(lo.so_luong, con_lai)
        lo.so_luong -= muc_tru
        lo.save(update_fields=['so_luong'])
        con_lai -= muc_tru

    return con_lai == 0


def _hoan_tra_ton_kho_thuoc(thuoc, so_luong_tra):
    """Hoàn số lượng vào kho (ghi vào lô nhập mới nhất còn hạn)."""
    sl = int(so_luong_tra or 0)
    if sl <= 0:
        return True
    lo = (
        thuoc.kho_thuoc.filter(han_su_dung__gt=timezone.now().date())
        .order_by('-ngay_nhap')
        .first()
    )
    if not lo:
        lo = thuoc.kho_thuoc.order_by('-ngay_nhap').first()
    if not lo:
        return False
    lo.so_luong += sl
    lo.save(update_fields=['so_luong'])
    return True


def _thuoc_duoc_ban_le_khong_toa(thuoc):
    """Thuốc chỉ bán khi có đơn / cần tư vấn BS — không dùng cho bán lẻ không toa."""
    if getattr(thuoc, 'can_don_thuoc', False):
        return False, 'Thuốc kê toa — không bán lẻ không toa'
    if getattr(thuoc, 'can_tu_van', False):
        return False, 'Thuốc cần tư vấn bác sĩ — không bán lẻ không toa'
    return True, None

# ==================== GIỎ HÀNG ====================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_gio_hang(request, benh_nhan_id):
    """Lấy thông tin giỏ hàng của bệnh nhân"""
    try:
        benh_nhan = get_object_or_404(BenhNhan, pk=benh_nhan_id)
        if not _kiem_tra_quyen_benh_nhan(request, benh_nhan):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền truy cập giỏ hàng này'}, status=403)

        gio_hang, _ = GioHang.objects.get_or_create(benh_nhan=benh_nhan)
        gio_hang = GioHang.objects.select_related('benh_nhan').prefetch_related(
            'san_pham_gio_hang__thuoc__don_vi'
        ).get(pk=gio_hang.pk)
        
        items = []
        for item in gio_hang.san_pham_gio_hang.all():
            don_gia = float(item.don_gia_tai_thoi_diem or item.thuoc.gia_ban)
            dv = getattr(item.thuoc, 'don_vi', None)
            items.append({
                'id': str(item.id),
                'thuoc_id': str(item.thuoc.id),
                'ten_thuoc': item.thuoc.ten_thuoc,
                'so_luong': item.so_luong,
                'don_gia': don_gia,
                'gia_ban': don_gia,
                'don_vi_ten': dv.ten_don_vi if dv else '',
                'thanh_tien': float(item.thanh_tien()),
                'ton_kho': _thuoc_ton_kho(item.thuoc),
                'hinh_anh': item.thuoc.hinh_anh.url if item.thuoc.hinh_anh else None
            })
        
        data = {
            'success': True,
            'data': {
                'id': str(gio_hang.id),
                'benh_nhan': {
                    'id': str(gio_hang.benh_nhan.pk),
                    'ma_benh_nhan': gio_hang.benh_nhan.ma_benh_nhan,
                    'ho_ten': gio_hang.benh_nhan.nguoi_dung.ho_ten
                },
                'items': items,
                'tong_tien': float(gio_hang.tong_tien()),
                'so_luong_san_pham': gio_hang.so_luong_san_pham(),
                'ngay_tao': gio_hang.ngay_tao.isoformat(),
                'ngay_cap_nhat': gio_hang.ngay_cap_nhat.isoformat()
            }
        }
        return JsonResponse(data)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_exempt
def them_vao_gio_hang(request):
    """Thêm sản phẩm vào giỏ hàng"""
    try:
        data = json.loads(request.body)
        benh_nhan_id = data.get('benh_nhan_id')
        thuoc_id = data.get('thuoc_id')
        so_luong = int(data.get('so_luong', 1))
        
        # Kiểm tra bệnh nhân
        benh_nhan = get_object_or_404(BenhNhan, pk=benh_nhan_id)
        if not _kiem_tra_quyen_benh_nhan(request, benh_nhan):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền thao tác giỏ hàng này'}, status=403)
        
        # Kiểm tra thuốc
        thuoc = get_object_or_404(Thuoc, id=thuoc_id)
        
        # Kiểm tra tồn kho
        ton_kho = _thuoc_ton_kho(thuoc)
        if so_luong > ton_kho:
            return JsonResponse({
                'success': False,
                'error': f'Số lượng vượt quá tồn kho ({ton_kho} sản phẩm)'
            }, status=400)
        
        # Lấy hoặc tạo giỏ hàng
        gio_hang, created = GioHang.objects.get_or_create(benh_nhan=benh_nhan)
        
        # Thêm sản phẩm vào giỏ
        item, item_created = SanPhamGioHang.objects.update_or_create(
            gio_hang=gio_hang,
            thuoc=thuoc,
            defaults={'so_luong': so_luong}
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Đã thêm vào giỏ hàng',
            'data': {
                'item_id': str(item.id),
                'so_luong': item.so_luong,
                'tong_tien_gio_hang': float(gio_hang.tong_tien())
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

@api_view(["PUT"])
@permission_classes([IsAuthenticated])
@csrf_exempt
def cap_nhat_gio_hang(request, item_id):
    """Cập nhật số lượng sản phẩm trong giỏ"""
    try:
        data = json.loads(request.body)
        so_luong = int(data.get('so_luong'))
        
        item = get_object_or_404(SanPhamGioHang, id=item_id)
        if not _kiem_tra_quyen_benh_nhan(request, item.gio_hang.benh_nhan):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền cập nhật giỏ hàng này'}, status=403)
        
        # Kiểm tra tồn kho
        ton_kho = _thuoc_ton_kho(item.thuoc)
        if so_luong > ton_kho:
            return JsonResponse({
                'success': False,
                'error': f'Số lượng vượt quá tồn kho ({ton_kho} sản phẩm)'
            }, status=400)
        
        if so_luong <= 0:
            item.delete()
            message = 'Đã xóa sản phẩm khỏi giỏ hàng'
        else:
            item.so_luong = so_luong
            item.save()
            message = 'Đã cập nhật số lượng'
        
        return JsonResponse({
            'success': True,
            'message': message,
            'data': {
                'tong_tien_gio_hang': float(item.gio_hang.tong_tien())
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def xoa_khoi_gio_hang(request, item_id):
    """Xóa sản phẩm khỏi giỏ hàng"""
    try:
        item = get_object_or_404(SanPhamGioHang, id=item_id)
        if not _kiem_tra_quyen_benh_nhan(request, item.gio_hang.benh_nhan):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền xóa sản phẩm này'}, status=403)
        gio_hang = item.gio_hang
        item.delete()
        
        return JsonResponse({
            'success': True,
            'message': 'Đã xóa sản phẩm khỏi giỏ hàng',
            'data': {
                'tong_tien_gio_hang': float(gio_hang.tong_tien())
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

# ==================== ĐƠN HÀNG ====================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_exempt
@transaction.atomic
def tao_don_hang(request):
    """Tạo đơn hàng mới từ giỏ hàng"""
    try:
        data = json.loads(request.body)
        benh_nhan_id = data.get('benh_nhan_id')
        loai_don = data.get('loai_don')
        
        # Thông tin người nhận
        ten_nguoi_nhan = data.get('ten_nguoi_nhan')
        so_dien_thoai_nhan = data.get('so_dien_thoai_nhan')
        email_nhan = data.get('email_nhan', '')
        dia_chi_giao_hang = data.get('dia_chi_giao_hang', '')
        
        # Thông tin tài chính
        phi_ship = float(data.get('phi_ship', 0))
        giam_gia = float(data.get('giam_gia', 0))
        
        # Ghi chú
        ghi_chu = data.get('ghi_chu', '')
        
        # Kiểm tra bệnh nhân
        benh_nhan = get_object_or_404(BenhNhan, pk=benh_nhan_id)
        if not _kiem_tra_quyen_benh_nhan(request, benh_nhan):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền tạo đơn cho bệnh nhân này'}, status=403)
        
        # Lấy giỏ hàng
        try:
            gio_hang = GioHang.objects.prefetch_related(
                'san_pham_gio_hang__thuoc'
            ).get(benh_nhan=benh_nhan)
        except GioHang.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Giỏ hàng trống'
            }, status=400)
        
        # Kiểm tra giỏ hàng có sản phẩm không
        if gio_hang.so_luong_san_pham() == 0:
            return JsonResponse({
                'success': False,
                'error': 'Giỏ hàng trống'
            }, status=400)
        
        # Kiểm tra tồn kho
        for item in gio_hang.san_pham_gio_hang.all():
            ton_kho = _thuoc_ton_kho(item.thuoc)
            if item.so_luong > ton_kho:
                return JsonResponse({
                    'success': False,
                    'error': f'Sản phẩm {item.thuoc.ten_thuoc} không đủ hàng (còn {ton_kho})'
                }, status=400)
        
        # Tạo mã đơn hàng
        ma_don_hang = f"DH{timezone.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:6].upper()}"
        
        # Tính tổng tiền
        tong_tien_hang = float(gio_hang.tong_tien())
        tong_tien = tong_tien_hang + phi_ship - giam_gia

        co_thuoc_dac_thu = any(
            sp.thuoc.can_don_thuoc or sp.thuoc.can_tu_van
            for sp in gio_hang.san_pham_gio_hang.all()
        )
        trang_duyet_bs = (
            DonHang.TrangThaiDuyetThuocDacThu.CHO_DUYET
            if co_thuoc_dac_thu
            else DonHang.TrangThaiDuyetThuocDacThu.KHONG_CAN
        )

        trang_thai_ban_dau = (
            DonHang.TrangThai.CHO_THANH_TOAN
            if loai_don == DonHang.LoaiDon.ONLINE
            else DonHang.TrangThai.MOI_TAO
        )

        # Tạo đơn hàng
        don_hang = DonHang.objects.create(
            ma_don_hang=ma_don_hang,
            benh_nhan=benh_nhan,
            loai_don=loai_don,
            ten_nguoi_nhan=ten_nguoi_nhan,
            so_dien_thoai_nhan=so_dien_thoai_nhan,
            email_nhan=email_nhan,
            dia_chi_giao_hang=dia_chi_giao_hang,
            tong_tien_hang=tong_tien_hang,
            phi_ship=phi_ship,
            giam_gia=giam_gia,
            tong_tien=tong_tien,
            ghi_chu=ghi_chu,
            trang_thai=trang_thai_ban_dau,
            trang_thai_duyet_bs=trang_duyet_bs,
        )
        
        # Tạo chi tiết đơn hàng và cập nhật tồn kho
        for item in gio_hang.san_pham_gio_hang.all():
            ChiTietDonHang.objects.create(
                don_hang=don_hang,
                thuoc=item.thuoc,
                so_luong=item.so_luong,
                don_gia=item.don_gia_tai_thoi_diem or item.thuoc.gia_ban
            )
            
            # Giảm tồn kho theo từng lô còn hạn
            if not _giam_ton_kho_thuoc(item.thuoc, item.so_luong):
                return JsonResponse({
                    'success': False,
                    'error': f'Sản phẩm {item.thuoc.ten_thuoc} không đủ hàng để trừ kho'
                }, status=400)
        
        # Xóa giỏ hàng
        gio_hang.delete()
        
        # Ghi lịch sử
        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu='',
            trang_thai_moi=trang_thai_ban_dau,
            nguoi_thay_doi=request.user,
            ghi_chu='Tạo đơn hàng mới'
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Tạo đơn hàng thành công',
            'data': {
                'don_hang_id': str(don_hang.id),
                'ma_don_hang': don_hang.ma_don_hang,
                'tong_tien': float(don_hang.tong_tien)
            }
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_don_hang(request, don_hang_id):
    """Lấy thông tin chi tiết đơn hàng"""
    try:
        don_hang = DonHang.objects.select_related(
            'benh_nhan',
            'nhan_vien_xu_ly',
            'bac_si_duyet__nguoi_dung',
            'don_thuoc',
            'thanh_toan',
        ).prefetch_related(
            'chi_tiet_don_hang__thuoc',
            'lich_su__nguoi_thay_doi'
        ).get(id=don_hang_id)
        ok_bn = _kiem_tra_quyen_benh_nhan(request, don_hang.benh_nhan)
        ok_bs = _kiem_tra_quyen_xem_don_bac_si(request, don_hang)
        ok_nv = _co_quyen_quan_ly_don_hang(request)
        ok_ban_quay = _co_quyen_ban_thuoc_tai_quay(request) and don_hang.loai_don == DonHang.LoaiDon.TAI_QUAY
        if not ok_bn and not ok_bs and not ok_nv and not ok_ban_quay:
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền xem đơn hàng này'}, status=403)
        
        # Chi tiết sản phẩm
        chi_tiet = []
        for item in don_hang.chi_tiet_don_hang.all():
            chi_tiet.append({
                'id': str(item.id),
                'thuoc_id': str(item.thuoc.id),
                'ten_thuoc': item.thuoc.ten_thuoc,
                'so_luong': item.so_luong,
                'don_gia': float(item.don_gia),
                'thanh_tien': float(item.thanh_tien()),
                'hinh_anh': item.thuoc.hinh_anh.url if item.thuoc.hinh_anh else None,
                'can_don_thuoc': item.thuoc.can_don_thuoc,
                'can_tu_van': item.thuoc.can_tu_van,
            })
        
        # Lịch sử đơn hàng
        lich_su = []
        for ls in don_hang.lich_su.all():
            lich_su.append({
                'trang_thai_cu': ls.trang_thai_cu,
                'trang_thai_moi': ls.trang_thai_moi,
                'nguoi_thay_doi': ls.nguoi_thay_doi.ho_ten if ls.nguoi_thay_doi else None,
                'ghi_chu': ls.ghi_chu,
                'thoi_gian': ls.thoi_gian.isoformat()
            })
        
        data = {
            'success': True,
            'data': {
                'id': str(don_hang.id),
                'ma_don_hang': don_hang.ma_don_hang,
                'benh_nhan': {
                    'id': str(don_hang.benh_nhan.pk),
                    'ma_benh_nhan': don_hang.benh_nhan.ma_benh_nhan,
                    'ho_ten': don_hang.benh_nhan.nguoi_dung.ho_ten,
                    'so_dien_thoai': don_hang.benh_nhan.nguoi_dung.so_dien_thoai
                },
                'thong_tin_nhan': {
                    'ten_nguoi_nhan': don_hang.ten_nguoi_nhan,
                    'so_dien_thoai_nhan': don_hang.so_dien_thoai_nhan,
                    'email_nhan': don_hang.email_nhan,
                    'dia_chi_giao_hang': don_hang.dia_chi_giao_hang
                },
                'thong_tin_don_hang': {
                    'loai_don': don_hang.get_loai_don_display(),
                    'loai_don_ma': don_hang.loai_don,
                    'ngay_tao': don_hang.ngay_tao.isoformat(),
                    'trang_thai': don_hang.trang_thai,
                    'trang_thai_display': don_hang.get_trang_thai_display(),
                    'trang_thai_quan_ly': don_hang.trang_thai_hien_thi_quan_ly(),
                    'nhan_vien_xu_ly': don_hang.nhan_vien_xu_ly.nguoi_dung.ho_ten if don_hang.nhan_vien_xu_ly else None,
                    'ngay_xu_ly': don_hang.ngay_xu_ly.isoformat() if don_hang.ngay_xu_ly else None
                },
                'thong_tin_tai_chinh': {
                    'tong_tien_hang': float(don_hang.tong_tien_hang),
                    'phi_ship': float(don_hang.phi_ship),
                    'giam_gia': float(don_hang.giam_gia),
                    'tong_tien': float(don_hang.tong_tien)
                },
                'ma_toa': don_hang.don_thuoc.ma_don if don_hang.don_thuoc_id else None,
                'hoa_don': _payload_hoa_don_tai_quay(don_hang),
                'chi_tiet': chi_tiet,
                'lich_su': lich_su,
                'ghi_chu': don_hang.ghi_chu,
                'ly_do_huy': don_hang.ly_do_huy,
                'trang_thai_duyet_bs': don_hang.trang_thai_duyet_bs,
                'ghi_chu_duyet_bs': don_hang.ghi_chu_duyet_bs,
                'ngay_duyet_bs': don_hang.ngay_duyet_bs.isoformat() if don_hang.ngay_duyet_bs else None,
                'bac_si_duyet': (
                    don_hang.bac_si_duyet.nguoi_dung.ho_ten if don_hang.bac_si_duyet else None
                ),
            }
        }
        return JsonResponse(data)
    except DonHang.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Không tìm thấy đơn hàng'
        }, status=404)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_don_hang(request):
    """Danh sách đơn hàng với phân trang và lọc"""
    try:
        # Lấy query params
        page = int(request.GET.get('page', 1))
        limit = int(request.GET.get('limit', 10))
        trang_thai = request.GET.get('trang_thai')
        loai_don = request.GET.get('loai_don')
        benh_nhan_id = request.GET.get('benh_nhan_id')
        tu_ngay = request.GET.get('tu_ngay') or request.GET.get('tu')
        den_ngay = request.GET.get('den_ngay') or request.GET.get('den')
        search = request.GET.get('search')
        
        # Query cơ bản
        queryset = DonHang.objects.select_related(
            'benh_nhan', 'nhan_vien_xu_ly', 'thanh_toan'
        ).prefetch_related('chi_tiet_don_hang')
        if not _co_quyen_quan_ly_don_hang(request):
            my_bn = _benh_nhan_tu_request(request)
            if not my_bn:
                return JsonResponse({'success': False, 'error': 'Chỉ bệnh nhân/nhân viên/admin được xem đơn hàng'}, status=403)
            queryset = queryset.filter(benh_nhan=my_bn)
        
        # Áp dụng filter
        if trang_thai:
            queryset = queryset.filter(trang_thai=trang_thai)
        if loai_don:
            queryset = queryset.filter(loai_don=loai_don)
        if benh_nhan_id:
            queryset = queryset.filter(benh_nhan_id=benh_nhan_id)
        # Lọc theo ngày (datetime theo TIME_ZONE — tránh lỗi so sánh chuỗi / __date trên MySQL)
        if tu_ngay or den_ngay:
            from datetime import datetime as _dt
            from phongkham.time_utils import bounds_for_local_days

            def _pd(s):
                return _dt.strptime(str(s)[:10], '%Y-%m-%d').date()

            try:
                if tu_ngay and den_ngay:
                    lo, hi = bounds_for_local_days(_pd(tu_ngay), _pd(den_ngay))
                    queryset = queryset.filter(ngay_tao__gte=lo, ngay_tao__lte=hi)
                elif tu_ngay:
                    lo, _ = bounds_for_local_days(_pd(tu_ngay), _pd(tu_ngay))
                    queryset = queryset.filter(ngay_tao__gte=lo)
                else:
                    _, hi = bounds_for_local_days(_pd(den_ngay), _pd(den_ngay))
                    queryset = queryset.filter(ngay_tao__lte=hi)
            except ValueError:
                return JsonResponse({'success': False, 'error': 'tu_ngay/den_ngay không đúng YYYY-MM-DD'}, status=400)
        if search:
            queryset = queryset.filter(
                Q(ma_don_hang__icontains=search) |
                Q(benh_nhan__nguoi_dung__ho_ten__icontains=search) |
                Q(benh_nhan__so_dien_thoai__icontains=search)
            )
        
        # Phân trang
        paginator = Paginator(queryset.order_by('-ngay_tao'), limit)
        don_hang_page = paginator.page(page)
        
        # Format dữ liệu
        items = []
        for dh in don_hang_page:
            try:
                tt = dh.thanh_toan
            except ObjectDoesNotExist:
                tt = None
            items.append({
                'id': str(dh.id),
                'ma_don_hang': dh.ma_don_hang,
                'benh_nhan': {
                    'id': str(dh.benh_nhan.pk),
                    'ho_ten': dh.benh_nhan.nguoi_dung.ho_ten,
                    'so_dien_thoai': dh.benh_nhan.nguoi_dung.so_dien_thoai
                },
                'ngay_tao': dh.ngay_tao.isoformat(),
                'tong_tien': float(dh.tong_tien),
                'trang_thai': dh.trang_thai,
                'trang_thai_display': dh.get_trang_thai_display(),
                'trang_thai_quan_ly': dh.trang_thai_hien_thi_quan_ly(),
                'loai_don': dh.get_loai_don_display(),
                'loai_don_ma': dh.loai_don,
                'phuong_thuc': tt.phuong_thuc if tt else None,
                'phuong_thuc_display': tt.get_phuong_thuc_display() if tt else 'Chưa thanh toán',
                'so_luong_san_pham': dh.chi_tiet_don_hang.count()
            })
        
        # Thống kê nhanh — doanh thu chỉ đơn đã hoàn thành (giao xong / nghiệm thu)
        thong_ke = DonHang.objects.aggregate(
            tong_don_hang=Count('id'),
            tong_doanh_thu=Sum('tong_tien', filter=Q(trang_thai=DonHang.TrangThai.HOAN_THANH)),
            don_huy=Count('id', filter=Q(trang_thai='DA_HUY')),
            don_hoan_thanh=Count('id', filter=Q(trang_thai='HOAN_THANH'))
        )
        
        return JsonResponse({
            'success': True,
            'data': {
                'items': items,
                'pagination': {
                    'current_page': page,
                    'total_pages': paginator.num_pages,
                    'total_items': paginator.count,
                    'has_next': don_hang_page.has_next(),
                    'has_previous': don_hang_page.has_previous()
                },
                'thong_ke': {
                    'tong_don_hang': thong_ke['tong_don_hang'],
                    'tong_doanh_thu': float(thong_ke['tong_doanh_thu'] or 0),
                    'don_huy': thong_ke['don_huy'],
                    'don_hoan_thanh': thong_ke['don_hoan_thanh'],
                    'ty_le_hoan_thanh': round(
                        (thong_ke['don_hoan_thanh'] / thong_ke['tong_don_hang'] * 100) 
                        if thong_ke['tong_don_hang'] > 0 else 0, 2
                    )
                }
            }
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

@api_view(["PUT", "POST"])
@permission_classes([IsAuthenticated])
@csrf_exempt
@transaction.atomic
def cap_nhat_trang_thai_don_hang(request, don_hang_id):
    """Cập nhật trạng thái đơn hàng"""
    try:
        if not _co_quyen_quan_ly_don_hang(request):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền cập nhật trạng thái đơn hàng'}, status=403)

        data = json.loads(request.body)
        trang_thai_moi = data.get('trang_thai')
        ghi_chu = data.get('ghi_chu', '')
        
        don_hang = get_object_or_404(DonHang, id=don_hang_id)
        trang_thai_cu = don_hang.trang_thai

        if trang_thai_cu == DonHang.TrangThai.HOAN_THANH:
            return JsonResponse(
                {
                    'success': False,
                    'error': 'Đơn đã hoàn thành, không thể cập nhật trạng thái.',
                },
                status=400,
            )

        # Kiểm tra valid chuyển trạng thái
        valid_transitions = {
            'MOI_TAO': ['CHO_THANH_TOAN', 'DA_HUY'],
            'CHO_THANH_TOAN': ['DA_THANH_TOAN', 'DA_HUY'],
            'DA_THANH_TOAN': ['DANG_CHUAN_BI', 'DA_HUY'],
            'DANG_CHUAN_BI': ['DANG_GIAO', 'DA_HUY'],
            'DANG_GIAO': ['HOAN_THANH', 'DA_HUY'],
            'HOAN_THANH': [],
            'DA_HUY': []
        }
        
        if trang_thai_moi not in valid_transitions.get(trang_thai_cu, []):
            return JsonResponse({
                'success': False,
                'error': f'Không thể chuyển từ {trang_thai_cu} sang {trang_thai_moi}'
            }, status=400)
        
        # Xử lý đặc biệt cho hủy đơn
        if trang_thai_moi == 'DA_HUY':
            ly_do_huy = data.get('ly_do_huy', '')
            don_hang.huy_don_hang(ly_do=ly_do_huy, nguoi_huy=request.user)
        else:
            don_hang.trang_thai = trang_thai_moi
            don_hang.ngay_xu_ly = timezone.now()
            nhan_vien = NhanVien.objects.filter(nguoi_dung=request.user).first()
            if nhan_vien:
                don_hang.nhan_vien_xu_ly = nhan_vien
            don_hang.save()
            
            # Ghi lịch sử
            LichSuDonHang.objects.create(
                don_hang=don_hang,
                trang_thai_cu=trang_thai_cu,
                trang_thai_moi=trang_thai_moi,
                nguoi_thay_doi=request.user,
                ghi_chu=ghi_chu
            )
        
        return JsonResponse({
            'success': True,
            'message': 'Cập nhật trạng thái thành công',
            'data': {
                'don_hang_id': str(don_hang.id),
                'trang_thai_cu': trang_thai_cu,
                'trang_thai_moi': don_hang.trang_thai
            }
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

# ==================== THANH TOÁN ====================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_exempt
@transaction.atomic
def thanh_toan_don_hang(request, don_hang_id):
    """Xử lý thanh toán cho đơn hàng"""
    try:
        data = json.loads(request.body)
        phuong_thuc = data.get('phuong_thuc')
        if phuong_thuc in ('COD', 'TIEN_MAT', 'TIEN MAT'):
            phuong_thuc = 'TIEN_MAT'
        elif phuong_thuc in ('VNPAY', 'VN_PAY'):
            phuong_thuc = 'VNPAY'
        ma_giao_dich = data.get('ma_giao_dich', '')
        noi_dung = data.get('noi_dung', '')
        valid_pt = {c[0] for c in ThanhToan.PhuongThuc.choices}
        if phuong_thuc not in valid_pt:
            return JsonResponse(
                {'success': False, 'error': f'Phương thức thanh toán không hợp lệ: {phuong_thuc}'},
                status=400,
            )
        if phuong_thuc == 'VNPAY':
            return JsonResponse(
                {
                    'success': False,
                    'error': 'VNPay: dùng POST /don-hang/<id>/vnpay-tao-url/ rồi thanh toán qua QR; IPN sẽ xác nhận.',
                },
                status=400,
            )

        don_hang = get_object_or_404(DonHang, id=don_hang_id)
        ok_bn = _kiem_tra_quyen_benh_nhan(request, don_hang.benh_nhan)
        ok_nv = _co_quyen_quan_ly_don_hang(request)
        ok_ban_quay = _co_quyen_ban_thuoc_tai_quay(request) and don_hang.loai_don == DonHang.LoaiDon.TAI_QUAY
        if not ok_bn and not ok_nv and not ok_ban_quay:
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền thanh toán đơn hàng này'}, status=403)

        # Đơn online: bệnh nhân không tự xác nhận thanh toán (COD ghi nhận khi giao hàng / quầy; VNPay qua IPN).
        if don_hang.loai_don == DonHang.LoaiDon.ONLINE and ok_bn and not ok_nv and not ok_ban_quay:
            return JsonResponse({
                'success': False,
                'error': 'Đơn mua online — COD được xác nhận khi nhận hàng; VNPay qua cổng thanh toán.',
            }, status=403)

        # Kiểm tra đơn hàng có thể thanh toán không
        if don_hang.trang_thai not in ['MOI_TAO', 'CHO_THANH_TOAN']:
            return JsonResponse({
                'success': False,
                'error': f'Đơn hàng ở trạng thái {don_hang.get_trang_thai_display()} không thể thanh toán'
            }, status=400)

        # Kiểm tra đã thanh toán chưa
        if hasattr(don_hang, 'thanh_toan'):
            return JsonResponse({
                'success': False,
                'error': 'Đơn hàng đã được thanh toán'
            }, status=400)

        # Snapshot trạng thái CŨ trước khi thay đổi
        trang_thai_cu = don_hang.trang_thai

        # Tạo thanh toán
        thanh_toan = ThanhToan.objects.create(
            don_hang=don_hang,
            so_tien=don_hang.tong_tien,
            phuong_thuc=phuong_thuc,
            trang_thai='THANH_CONG',
            ma_giao_dich=ma_giao_dich,
            noi_dung=noi_dung
        )

        # Tại quầy: thanh toán xong = hoàn thành (không có bước giao hàng). Online: đã thanh toán → chuẩn bị giao.
        if don_hang.loai_don == DonHang.LoaiDon.TAI_QUAY:
            don_hang.trang_thai = DonHang.TrangThai.HOAN_THANH
            trang_moi = DonHang.TrangThai.HOAN_THANH
        else:
            don_hang.trang_thai = DonHang.TrangThai.DA_THANH_TOAN
            trang_moi = DonHang.TrangThai.DA_THANH_TOAN
        don_hang.save()

        # Ghi lịch sử với trang_thai_cu chính xác
        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu=trang_thai_cu,
            trang_thai_moi=trang_moi,
            nguoi_thay_doi=request.user,
            ghi_chu=f"Thanh toán qua {phuong_thuc}"
        )

        _dong_bo_don_thuoc_sau_thanh_toan_tai_quay(don_hang, phuong_thuc)

        don_hang = DonHang.objects.select_related(
            'benh_nhan__nguoi_dung', 'don_thuoc', 'thanh_toan'
        ).prefetch_related('chi_tiet_don_hang__thuoc').get(pk=don_hang.pk)
        
        return JsonResponse({
            'success': True,
            'message': 'Thanh toán thành công',
            'data': {
                'thanh_toan_id': str(thanh_toan.id),
                'so_tien': float(thanh_toan.so_tien),
                'phuong_thuc': thanh_toan.get_phuong_thuc_display(),
                'ma_giao_dich': thanh_toan.ma_giao_dich,
                'ngay_thanh_toan': thanh_toan.ngay_thanh_toan.isoformat(),
                'hoa_don': _payload_hoa_don_tai_quay(don_hang),
            }
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_lich_su_thanh_toan(request, don_hang_id):
    """Lấy lịch sử thanh toán của đơn hàng"""
    try:
        don_hang = get_object_or_404(DonHang, id=don_hang_id)
        if not _kiem_tra_quyen_benh_nhan(request, don_hang.benh_nhan) and not _co_quyen_quan_ly_don_hang(request):
            return JsonResponse({'success': False, 'error': 'Bạn không có quyền xem lịch sử thanh toán này'}, status=403)
        
        if hasattr(don_hang, 'thanh_toan'):
            tt = don_hang.thanh_toan
            data = {
                'id': str(tt.id),
                'so_tien': float(tt.so_tien),
                'phuong_thuc': tt.get_phuong_thuc_display(),
                'trang_thai': tt.get_trang_thai_display(),
                'ma_giao_dich': tt.ma_giao_dich,
                'noi_dung': tt.noi_dung,
                'ngay_thanh_toan': tt.ngay_thanh_toan.isoformat()
            }
        else:
            data = None
        
        return JsonResponse({
            'success': True,
            'data': data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def don_tai_quay_ban_le_da_thanh_toan(request):
    """Đơn bán lẻ tại quầy (không toa) đã thanh toán — cho nhân viên xem / in lại."""
    if not _co_quyen_ban_thuoc_tai_quay(request):
        return JsonResponse(
            {'success': False, 'error': 'Chỉ nhân viên quầy bán thuốc xem được danh sách này'},
            status=403,
        )
    qs = (
        DonHang.objects.filter(
            loai_don=DonHang.LoaiDon.TAI_QUAY,
            don_thuoc__isnull=True,
            trang_thai__in=(DonHang.TrangThai.DA_THANH_TOAN, DonHang.TrangThai.HOAN_THANH),
        )
        .select_related('benh_nhan__nguoi_dung', 'thanh_toan')
        .order_by('-ngay_tao')[:300]
    )
    out = []
    for dh in qs:
        pt = ''
        if hasattr(dh, 'thanh_toan'):
            pt = dh.thanh_toan.get_phuong_thuc_display()
        out.append(
            {
                'loai': 'BAN_LE',
                'don_hang_id': str(dh.id),
                'ma_don_hang': dh.ma_don_hang,
                'ma_benh_nhan': dh.benh_nhan.ma_benh_nhan,
                'ten_benh_nhan': dh.benh_nhan.nguoi_dung.ho_ten,
                'ngay_tao': dh.ngay_tao.isoformat(),
                'tong_tien': float(dh.tong_tien),
                'phuong_thuc_thanh_toan': pt,
            }
        )
    return JsonResponse({'success': True, 'data': out})


# ==================== THỐNG KÊ ====================

def _merge_top_ban_thuoc(rows_dh, rows_dt):
    """Gộp top thuốc từ ChiTietDonHang + ChiTietDonThuoc (cùng key thuoc__id)."""
    merged = {}
    for row in list(rows_dh) + list(rows_dt):
        tid = row.get('thuoc__id')
        if not tid:
            continue
        if tid not in merged:
            merged[tid] = {
                'thuoc__id': tid,
                'thuoc__ten_thuoc': row.get('thuoc__ten_thuoc') or '',
                'so_luong_ban': 0,
                'doanh_thu': 0.0,
            }
        merged[tid]['so_luong_ban'] += int(row.get('so_luong_ban') or 0)
        merged[tid]['doanh_thu'] += float(row.get('doanh_thu') or 0)
    out = sorted(merged.values(), key=lambda x: (-x['so_luong_ban'], -x['doanh_thu']))
    return out[:10]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def thong_ke_don_hang(request):
    """Thống kê đơn hàng theo thời gian"""
    try:
        from decimal import Decimal
        from django.db.models import Value, DecimalField
        from django.db.models.functions import Coalesce

        # Lấy query params
        tu_ngay = request.GET.get('tu_ngay')
        den_ngay = request.GET.get('den_ngay')
        
        queryset = DonHang.objects.select_related('thanh_toan', 'benh_nhan').all()
        don_thuoc_qs = DonThuoc.objects.filter(don_thuoc_co_doanh_q())
        don_thuoc_qs = loc_don_thuoc_theo_ky(don_thuoc_qs, tu_ngay, den_ngay)
        if not _co_quyen_quan_ly_don_hang(request):
            my_bn = _benh_nhan_tu_request(request)
            if not my_bn:
                return JsonResponse({'success': False, 'error': 'Bạn không có quyền xem thống kê'}, status=403)
            queryset = queryset.filter(benh_nhan=my_bn)
            don_thuoc_qs = don_thuoc_qs.filter(benh_nhan=my_bn)

        # Theo ngày ghi nhận thanh toán (hoặc ngày tạo nếu chưa có TT) — khớp doanh thu thực tế
        queryset = loc_don_hang_theo_ky_doanh(queryset, tu_ngay, den_ngay)
        
        # Thống kê theo trạng thái
        theo_trang_thai = queryset.values('trang_thai').annotate(
            so_luong=Count('id'),
            tong_tien=Sum('tong_tien')
        ).order_by('trang_thai')
        
        # Thống kê theo loại đơn
        theo_loai_don = queryset.values('loai_don').annotate(
            so_luong=Count('id'),
            tong_tien=Sum('tong_tien')
        ).order_by('loai_don')
        
        # Thống kê theo ngày — không dùng .extra(raw date(...)): lệch SQLite/MySQL, dễ 400 → FE mất cả thống kê
        theo_ngay = [
            {
                'ngay': row['ngay_tao__date'],
                'ngay_tao__date': row['ngay_tao__date'],
                'so_luong': row['so_luong'],
                'tong_tien': row['tong_tien'],
            }
            for row in queryset.values('ngay_tao__date')
            .annotate(
                so_luong=Count('id'),
                tong_tien=Sum('tong_tien'),
            )
            .order_by('ngay_tao__date')
        ]
        
        # Đơn hàng đã phát sinh doanh thu: loại mới tạo / chờ TT / đã hủy (nhiều đơn quầy dừng ở DA_THANH_TOAN)
        _tt_chua_co_doanh = (
            DonHang.TrangThai.MOI_TAO,
            DonHang.TrangThai.CHO_THANH_TOAN,
            DonHang.TrangThai.DA_HUY,
        )
        queryset_don_co_doanh = queryset.exclude(trang_thai__in=_tt_chua_co_doanh)

        # Top sản phẩm — ChiTietDonHang + ChiTietDonThuoc (đơn toa không luôn có đơn hàng chi tiết)
        top_rows_dh = ChiTietDonHang.objects.filter(
            don_hang__in=queryset_don_co_doanh,
        ).values(
            'thuoc__id', 'thuoc__ten_thuoc'
        ).annotate(
            so_luong_ban=Sum('so_luong'),
            doanh_thu=Sum(F('don_gia') * F('so_luong') - F('chiet_khau'))
        )
        _zero_gia = Value(Decimal('0'), output_field=DecimalField(max_digits=12, decimal_places=2))
        top_rows_dt = (
            ChiTietDonThuoc.objects.filter(
                don_thuoc__in=don_thuoc_qs,
                thuoc__isnull=False,
                la_thuoc_mua_ngoai=False,
            )
            .values('thuoc__id', 'thuoc__ten_thuoc')
            .annotate(
                so_luong_ban=Sum('so_luong'),
                doanh_thu=Sum(F('so_luong') * Coalesce(F('don_gia_tai_thoi_diem'), _zero_gia)),
            )
        )
        top_san_pham = _merge_top_ban_thuoc(top_rows_dh, top_rows_dt)

        tong_dh = queryset_don_co_doanh.aggregate(s=Sum('tong_tien'))['s'] or 0
        tong_dt = don_thuoc_qs.aggregate(s=Sum('tong_tien'))['s'] or 0

        so_don_hang_co_doanh_thu = queryset_don_co_doanh.count()
        so_don_hang_hoan_thanh = queryset.filter(
            trang_thai=DonHang.TrangThai.HOAN_THANH
        ).count()
        so_don_thuoc_da_thanh_toan = don_thuoc_qs.count()

        return JsonResponse({
            'success': True,
            'data': {
                'tong_quan': {
                    'tong_don_hang': queryset.count(),
                    # Khớp doanh thu tháng: chỉ phiếu đã hoàn tất / đã thanh toán
                    'tong_so_giao_dich_thang': so_don_hang_co_doanh_thu + so_don_thuoc_da_thanh_toan,
                    'so_don_hang_co_doanh_thu': so_don_hang_co_doanh_thu,
                    'so_don_hang_hoan_thanh': so_don_hang_hoan_thanh,
                    'so_don_thuoc_da_thanh_toan': so_don_thuoc_da_thanh_toan,
                    'tong_doanh_thu': float(tong_dh) + float(tong_dt),
                    'tong_doanh_thu_don_hang': float(tong_dh),
                    'tong_doanh_thu_don_thuoc': float(tong_dt),
                    'don_huy': queryset.filter(trang_thai='DA_HUY').count(),
                    'don_hoan_thanh': queryset.filter(trang_thai='HOAN_THANH').count()
                },
                'theo_trang_thai': list(theo_trang_thai),
                'theo_loai_don': list(theo_loai_don),
                'theo_ngay': theo_ngay,
                'top_san_pham': list(top_san_pham)
            }
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_don_cho_duyet_thuoc_dac_thu(request):
    """Don hang cho bac si duyet thuoc dac thu."""
    if not _bac_si_tu_request(request):
        return JsonResponse({'success': False, 'error': 'Chi bac si duoc xem danh sach nay'}, status=403)
    try:
        page = int(request.GET.get('page', 1))
        limit = int(request.GET.get('limit', 20))
        qs = (
            DonHang.objects.filter(
                trang_thai_duyet_bs=DonHang.TrangThaiDuyetThuocDacThu.CHO_DUYET
            )
            .select_related('benh_nhan__nguoi_dung')
            .prefetch_related('chi_tiet_don_hang__thuoc')
            .order_by('-ngay_tao')
        )
        paginator = Paginator(qs, limit)
        page_obj = paginator.page(page)
        items = []
        for dh in page_obj:
            items.append(
                {
                    'id': str(dh.id),
                    'ma_don_hang': dh.ma_don_hang,
                    'ngay_tao': dh.ngay_tao.isoformat(),
                    'tong_tien': float(dh.tong_tien),
                    'trang_thai': dh.trang_thai,
                    'benh_nhan': {
                        'id': str(dh.benh_nhan.pk),
                        'ho_ten': dh.benh_nhan.nguoi_dung.ho_ten,
                        'ma_benh_nhan': dh.benh_nhan.ma_benh_nhan,
                    },
                    'so_dong_thuoc_dac_thu': sum(
                        1
                        for ct in dh.chi_tiet_don_hang.all()
                        if ct.thuoc.can_don_thuoc or ct.thuoc.can_tu_van
                    ),
                }
            )
        return JsonResponse(
            {
                'success': True,
                'data': {
                    'items': items,
                    'pagination': {
                        'current_page': page,
                        'total_pages': paginator.num_pages,
                        'total_items': paginator.count,
                        'has_next': page_obj.has_next(),
                        'has_previous': page_obj.has_previous(),
                    },
                },
            }
        )
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@csrf_exempt
def duyet_thuoc_dac_thu(request, don_hang_id):
    """Bac si duyet hoac tu choi."""
    bs = _bac_si_tu_request(request)
    if not bs:
        return JsonResponse({'success': False, 'error': 'Chi bac si duoc duyet'}, status=403)
    try:
        data = json.loads(request.body)
        ket_qua = data.get('ket_qua')
        if ket_qua not in (
            DonHang.TrangThaiDuyetThuocDacThu.DONG_Y,
            DonHang.TrangThaiDuyetThuocDacThu.TU_CHOI,
        ):
            return JsonResponse(
                {'success': False, 'error': 'ket_qua phải là DONG_Y hoặc TU_CHOI'},
                status=400,
            )
        don_hang = get_object_or_404(DonHang, id=don_hang_id)
        if don_hang.trang_thai_duyet_bs != DonHang.TrangThaiDuyetThuocDacThu.CHO_DUYET:
            return JsonResponse(
                {'success': False, 'error': 'Don khong o trang thai cho duyet bac si'},
                status=400,
            )
        ghi = data.get('ghi_chu', '')
        don_hang.trang_thai_duyet_bs = ket_qua
        don_hang.ghi_chu_duyet_bs = ghi
        don_hang.bac_si_duyet = bs
        don_hang.ngay_duyet_bs = timezone.now()
        don_hang.save(
            update_fields=[
                'trang_thai_duyet_bs',
                'ghi_chu_duyet_bs',
                'bac_si_duyet',
                'ngay_duyet_bs',
                'ngay_cap_nhat',
            ]
        )
        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu=don_hang.trang_thai,
            trang_thai_moi=don_hang.trang_thai,
            nguoi_thay_doi=request.user,
            ghi_chu=f'Duyet thuoc dac thu BS: {ket_qua}. {ghi}',
        )
        return JsonResponse(
            {
                'success': True,
                'message': 'Đã ghi nhận duyệt',
                'data': {'don_hang_id': str(don_hang.id), 'ket_qua': ket_qua},
            }
        )
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ==================== BÁN THUỐC TẠI QUẦY (theo toa / lẻ) ====================


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
@transaction.atomic
def ban_theo_toa(request):
    """Tạo đơn hàng tại quầy từ một phần toa bác sĩ — chỉ thuốc trong kho, SL ≤ dòng toa và ≤ tồn kho."""
    if not _co_quyen_ban_thuoc_tai_quay(request):
        return JsonResponse({'success': False, 'error': 'Chỉ nhân viên bán thuốc (chức vụ Bán thuốc) được thao tác'}, status=403)
    try:
        data = json.loads(request.body)
        ma_don = (data.get('ma_don') or '').strip()
        items = data.get('items') or []
        if not ma_don or not items:
            return JsonResponse({'success': False, 'error': 'Cần ma_don và danh sách items'}, status=400)

        don_thuoc = DonThuoc.objects.select_related('benh_nhan__nguoi_dung').prefetch_related(
            'chi_tiet_don_thuoc__thuoc'
        ).get(ma_don__iexact=ma_don)
        if don_thuoc.trang_thai == 'HOAN_THANH':
            return JsonResponse(
                {'success': False, 'error': 'Toa này đã hoàn thành tại quầy — không tạo thêm đơn bán theo toa.'},
                status=400,
            )
        benh_nhan = don_thuoc.benh_nhan

        ma_don_hang = f"DH{timezone.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:6].upper()}"
        nv = NhanVien.objects.filter(nguoi_dung=request.user).first()

        don_hang = DonHang.objects.create(
            ma_don_hang=ma_don_hang,
            benh_nhan=benh_nhan,
            loai_don=DonHang.LoaiDon.TAI_QUAY,
            ten_nguoi_nhan=benh_nhan.nguoi_dung.ho_ten,
            so_dien_thoai_nhan=benh_nhan.nguoi_dung.so_dien_thoai,
            email_nhan='',
            dia_chi_giao_hang='Mua tại quầy nhà thuốc',
            tong_tien_hang=0,
            phi_ship=0,
            giam_gia=0,
            tong_tien=0,
            trang_thai=DonHang.TrangThai.CHO_THANH_TOAN,
            trang_thai_duyet_bs=DonHang.TrangThaiDuyetThuocDacThu.KHONG_CAN,
            don_thuoc=don_thuoc,
            nhan_vien_xu_ly=nv,
            ghi_chu=data.get('ghi_chu', '') or '',
        )

        tong_hang = 0
        for raw in items:
            ct_id = raw.get('chi_tiet_don_thuoc_id')
            sl = int(raw.get('so_luong', 0))
            if not ct_id or sl <= 0:
                return JsonResponse({'success': False, 'error': 'Mỗi dòng cần chi_tiet_don_thuoc_id và so_luong > 0'}, status=400)
            ct = ChiTietDonThuoc.objects.filter(id=ct_id, don_thuoc=don_thuoc).select_related('thuoc').first()
            if not ct:
                return JsonResponse({'success': False, 'error': f'Dòng toa không hợp lệ: {ct_id}'}, status=400)
            if ct.la_thuoc_mua_ngoai or not ct.thuoc_id:
                return JsonResponse(
                    {'success': False, 'error': f'Dòng {ct_id} là thuốc mua ngoài — không bán tại quầy'},
                    status=400,
                )
            if sl > ct.so_luong:
                return JsonResponse(
                    {'success': False, 'error': f'Số lượng bán vượt số ghi trên toa ({ct.so_luong})'},
                    status=400,
                )
            ton = _thuoc_ton_kho(ct.thuoc)
            if sl > ton:
                return JsonResponse(
                    {
                        'success': False,
                        'error': f'{ct.thuoc.ten_thuoc}: không đủ tồn (còn {ton}, cần {sl})',
                    },
                    status=400,
                )
            don_gia = ct.thuoc.gia_ban
            ChiTietDonHang.objects.create(
                don_hang=don_hang,
                thuoc=ct.thuoc,
                chi_tiet_don_thuoc=ct,
                so_luong=sl,
                don_gia=don_gia,
            )
            if not _giam_ton_kho_thuoc(ct.thuoc, sl):
                return JsonResponse({'success': False, 'error': f'Không trừ được kho: {ct.thuoc.ten_thuoc}'}, status=400)
            tong_hang += float(don_gia) * sl

        don_hang.tong_tien_hang = tong_hang
        don_hang.tong_tien = tong_hang
        don_hang.save(update_fields=['tong_tien_hang', 'tong_tien', 'ngay_cap_nhat'])

        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu=DonHang.TrangThai.CHO_THANH_TOAN,
            trang_thai_moi=DonHang.TrangThai.CHO_THANH_TOAN,
            nguoi_thay_doi=request.user,
            ghi_chu='Bán theo toa tại quầy',
        )

        don_hang = DonHang.objects.prefetch_related('chi_tiet_don_hang__thuoc').get(pk=don_hang.pk)
        hoa_don = _payload_hoa_don_tai_quay(don_hang)

        return JsonResponse(
            {
                'success': True,
                'message': 'Đã tạo đơn — chờ thanh toán',
                'data': {
                    'don_hang_id': str(don_hang.id),
                    'ma_don_hang': don_hang.ma_don_hang,
                    'tong_tien': float(don_hang.tong_tien),
                    'ma_toa': don_thuoc.ma_don,
                    'hoa_don': hoa_don,
                },
            }
        )
    except DonThuoc.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Không tìm thấy toa'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
@transaction.atomic
def ban_thuoc_le(request):
    """Bán lẻ không cần toa — nhập benh_nhan_id + danh sách thuốc trong kho."""
    if not _co_quyen_ban_thuoc_tai_quay(request):
        return JsonResponse({'success': False, 'error': 'Chỉ nhân viên bán thuốc (chức vụ Bán thuốc) được thao tác'}, status=403)
    try:
        data = json.loads(request.body)
        benh_nhan_id = data.get('benh_nhan_id')
        items = data.get('items') or []
        if not benh_nhan_id or not items:
            return JsonResponse({'success': False, 'error': 'Cần benh_nhan_id và items'}, status=400)
        benh_nhan = get_object_or_404(BenhNhan, pk=benh_nhan_id)
        ma_don_hang = f"DH{timezone.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:6].upper()}"
        nv = NhanVien.objects.filter(nguoi_dung=request.user).first()

        don_hang = DonHang.objects.create(
            ma_don_hang=ma_don_hang,
            benh_nhan=benh_nhan,
            loai_don=DonHang.LoaiDon.TAI_QUAY,
            ten_nguoi_nhan=benh_nhan.nguoi_dung.ho_ten,
            so_dien_thoai_nhan=benh_nhan.nguoi_dung.so_dien_thoai,
            email_nhan='',
            dia_chi_giao_hang='Mua lẻ tại quầy',
            tong_tien_hang=0,
            phi_ship=0,
            giam_gia=0,
            tong_tien=0,
            trang_thai=DonHang.TrangThai.CHO_THANH_TOAN,
            trang_thai_duyet_bs=DonHang.TrangThaiDuyetThuocDacThu.KHONG_CAN,
            nhan_vien_xu_ly=nv,
            ghi_chu=data.get('ghi_chu', '') or '',
        )

        tong_hang = 0
        for raw in items:
            thuoc_id = raw.get('thuoc_id')
            sl = int(raw.get('so_luong', 0))
            if not thuoc_id or sl <= 0:
                return JsonResponse({'success': False, 'error': 'Mỗi dòng cần thuoc_id và so_luong > 0'}, status=400)
            thuoc = get_object_or_404(Thuoc, pk=thuoc_id)
            ok_th, err_th = _thuoc_duoc_ban_le_khong_toa(thuoc)
            if not ok_th:
                return JsonResponse({'success': False, 'error': f'{thuoc.ten_thuoc}: {err_th}'}, status=400)
            ton = _thuoc_ton_kho(thuoc)
            if sl > ton:
                return JsonResponse(
                    {'success': False, 'error': f'{thuoc.ten_thuoc}: không đủ tồn (còn {ton})'},
                    status=400,
                )
            don_gia = thuoc.gia_ban
            ChiTietDonHang.objects.create(
                don_hang=don_hang,
                thuoc=thuoc,
                so_luong=sl,
                don_gia=don_gia,
            )
            if not _giam_ton_kho_thuoc(thuoc, sl):
                return JsonResponse({'success': False, 'error': f'Không trừ được kho: {thuoc.ten_thuoc}'}, status=400)
            tong_hang += float(don_gia) * sl

        don_hang.tong_tien_hang = tong_hang
        don_hang.tong_tien = tong_hang
        don_hang.save(update_fields=['tong_tien_hang', 'tong_tien', 'ngay_cap_nhat'])

        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu=DonHang.TrangThai.CHO_THANH_TOAN,
            trang_thai_moi=DonHang.TrangThai.CHO_THANH_TOAN,
            nguoi_thay_doi=request.user,
            ghi_chu='Bán lẻ tại quầy',
        )

        don_hang = DonHang.objects.prefetch_related('chi_tiet_don_hang__thuoc').get(pk=don_hang.pk)

        return JsonResponse(
            {
                'success': True,
                'data': {
                    'don_hang_id': str(don_hang.id),
                    'ma_don_hang': don_hang.ma_don_hang,
                    'tong_tien': float(don_hang.tong_tien),
                    'hoa_don': _payload_hoa_don_tai_quay(don_hang),
                },
            }
        )
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
@transaction.atomic
def sua_ban_le_tai_quay(request, don_hang_id):
    """Sửa đơn bán lẻ không toa (tại quầy) — trước hoặc sau thanh toán; điều chỉnh tồn kho và số tiền thanh toán."""
    if not _co_quyen_ban_thuoc_tai_quay(request):
        return JsonResponse(
            {'success': False, 'error': 'Chỉ nhân viên bán thuốc (chức vụ Bán thuốc) được thao tác'},
            status=403,
        )
    try:
        data = json.loads(request.body)
        items = data.get('items') or []
        if not items:
            return JsonResponse({'success': False, 'error': 'Cần danh sách items'}, status=400)

        don_hang = (
            DonHang.objects.select_for_update()
            .select_related('thanh_toan')
            .prefetch_related('chi_tiet_don_hang__thuoc')
            .get(pk=don_hang_id)
        )
        if don_hang.don_thuoc_id:
            return JsonResponse({'success': False, 'error': 'Chỉ sửa đơn bán lẻ (không toa bác sĩ)'}, status=400)
        if don_hang.loai_don != DonHang.LoaiDon.TAI_QUAY:
            return JsonResponse({'success': False, 'error': 'Chỉ áp dụng đơn mua tại quầy'}, status=400)
        if don_hang.trang_thai not in (
            DonHang.TrangThai.CHO_THANH_TOAN,
            DonHang.TrangThai.DA_THANH_TOAN,
            DonHang.TrangThai.HOAN_THANH,
        ):
            return JsonResponse({'success': False, 'error': 'Trạng thái đơn không cho phép sửa'}, status=400)

        need = defaultdict(int)
        for raw in items:
            thuoc_id = raw.get('thuoc_id')
            sl = int(raw.get('so_luong', 0))
            if not thuoc_id or sl <= 0:
                return JsonResponse(
                    {'success': False, 'error': 'Mỗi dòng cần thuoc_id và so_luong > 0'},
                    status=400,
                )
            need[str(thuoc_id)] += sl

        old_lines = list(don_hang.chi_tiet_don_hang.select_related('thuoc').all())
        for line in old_lines:
            if not _hoan_tra_ton_kho_thuoc(line.thuoc, line.so_luong):
                transaction.set_rollback(True)
                return JsonResponse(
                    {'success': False, 'error': f'Không hoàn được kho: {line.thuoc.ten_thuoc}'},
                    status=400,
                )

        ChiTietDonHang.objects.filter(don_hang=don_hang).delete()

        tong_hang = 0.0
        for thuoc_id_str, sl in need.items():
            thuoc = get_object_or_404(Thuoc, pk=thuoc_id_str)
            ok_th, err_th = _thuoc_duoc_ban_le_khong_toa(thuoc)
            if not ok_th:
                transaction.set_rollback(True)
                return JsonResponse({'success': False, 'error': f'{thuoc.ten_thuoc}: {err_th}'}, status=400)
            ton = _thuoc_ton_kho(thuoc)
            if sl > ton:
                transaction.set_rollback(True)
                return JsonResponse(
                    {
                        'success': False,
                        'error': f'{thuoc.ten_thuoc}: không đủ tồn (còn {ton}, cần {sl})',
                    },
                    status=400,
                )
            don_gia = thuoc.gia_ban
            ChiTietDonHang.objects.create(
                don_hang=don_hang,
                thuoc=thuoc,
                so_luong=sl,
                don_gia=don_gia,
            )
            if not _giam_ton_kho_thuoc(thuoc, sl):
                transaction.set_rollback(True)
                return JsonResponse(
                    {'success': False, 'error': f'Không trừ được kho: {thuoc.ten_thuoc}'},
                    status=400,
                )
            tong_hang += float(don_gia) * sl

        don_hang.tong_tien_hang = tong_hang
        don_hang.tong_tien = tong_hang
        don_hang.save(update_fields=['tong_tien_hang', 'tong_tien', 'ngay_cap_nhat'])

        if hasattr(don_hang, 'thanh_toan'):
            tt = don_hang.thanh_toan
            tt.so_tien = don_hang.tong_tien
            tt.save(update_fields=['so_tien'])

        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu=don_hang.trang_thai,
            trang_thai_moi=don_hang.trang_thai,
            nguoi_thay_doi=request.user,
            ghi_chu='Cập nhật nội dung đơn bán lẻ tại quầy',
        )

        don_hang = DonHang.objects.prefetch_related('chi_tiet_don_hang__thuoc').get(pk=don_hang.pk)
        hoa_don = _payload_hoa_don_tai_quay(don_hang)

        return JsonResponse(
            {
                'success': True,
                'message': 'Đã cập nhật đơn bán lẻ',
                'data': {
                    'don_hang_id': str(don_hang.id),
                    'ma_don_hang': don_hang.ma_don_hang,
                    'tong_tien': float(don_hang.tong_tien),
                    'hoa_don': hoa_don,
                },
            }
        )
    except DonHang.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Không tìm thấy đơn hàng'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def vnpay_tao_url(request, don_hang_id):
    """Tạo URL thanh toán VNPay (đúng số tiền đơn). Cần cấu hình settings.VNPAY."""
    don_hang = get_object_or_404(DonHang, id=don_hang_id)
    ok_bn = _kiem_tra_quyen_benh_nhan(request, don_hang.benh_nhan)
    ok_nv = _co_quyen_quan_ly_don_hang(request)
    ok_ban = _co_quyen_ban_thuoc_tai_quay(request) and don_hang.loai_don == DonHang.LoaiDon.TAI_QUAY
    if not ok_bn and not ok_nv and not ok_ban:
        return JsonResponse({'success': False, 'error': 'Không có quyền'}, status=403)
    if don_hang.trang_thai not in ('MOI_TAO', 'CHO_THANH_TOAN'):
        return JsonResponse({'success': False, 'error': 'Đơn không ở trạng thái chờ thanh toán'}, status=400)
    if hasattr(don_hang, 'thanh_toan'):
        return JsonResponse({'success': False, 'error': 'Đơn đã thanh toán'}, status=400)
    if not vnpay_da_cau_hinh():
        return JsonResponse(
            {
                'success': False,
                'error': 'Chưa cấu hình VNPay trên server (VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_RETURN_URL).',
                'configured': False,
            },
            status=400,
        )
    ip = (
        request.META.get('HTTP_X_FORWARDED_FOR')
        or request.META.get('REMOTE_ADDR')
        or '127.0.0.1'
    )
    bill_email = (don_hang.email_nhan or '').strip()
    if not bill_email:
        try:
            bill_email = (don_hang.benh_nhan.nguoi_dung.email or '').strip()
        except Exception:
            bill_email = ''
    bill_mobile = (don_hang.so_dien_thoai_nhan or '').strip()
    url, err = build_payment_url(
        amount_vnd=don_hang.tong_tien,
        txn_ref=don_hang.ma_don_hang,
        order_info=f'Thanh toan {don_hang.ma_don_hang}',
        ip_addr=ip,
        bill_email=bill_email,
        bill_mobile=bill_mobile,
    )
    if err:
        return JsonResponse({'success': False, 'error': err, 'configured': False}, status=400)
    logger_dh.warning(
        'VNPay tao-url đơn %s amount=%s url_prefix=%s',
        don_hang.ma_don_hang,
        don_hang.tong_tien,
        (url or '')[:120],
    )
    return JsonResponse(
        {
            'success': True,
            'data': {'payment_url': url, 'txn_ref': don_hang.ma_don_hang, 'amount': float(don_hang.tong_tien)},
        }
    )


@csrf_exempt
def vnpay_ipn(request):
    """IPN VNPay — xác nhận thanh toán (không cần đăng nhập). Cổng có thể gửi GET hoặc POST."""
    flat = {}
    for k in request.GET:
        flat[k] = request.GET.get(k)
    for k in request.POST:
        flat[k] = request.POST.get(k)
    qs = request.META.get('QUERY_STRING', '') or ''
    if is_vnpay_portal_test_ipn(flat):
        logger_dh.info('VNPay IPN: Test call IPN cổng merchant (hash_test) — URL OK')
        return JsonResponse({'RspCode': '00', 'Message': 'Confirm Success'}, status=200)
    ok, msg = verify_vnpay_signature(flat, query_string=qs)
    if not ok:
        cfg_tmn = (getattr(settings, 'VNPAY', None) or {}).get('TMN_CODE', '')
        req_tmn = flat.get('vnp_TmnCode', '')
        logger_dh.warning(
            'VNPay IPN: xác minh chữ ký thất bại: %s | keys=%s | tmn_env=%s tmn_req=%s | txn=%s',
            msg,
            list(flat.keys()),
            cfg_tmn,
            req_tmn,
            flat.get('vnp_TxnRef', ''),
        )
        if cfg_tmn and req_tmn and cfg_tmn != req_tmn:
            msg = f'Sai chữ ký — TMN .env ({cfg_tmn}) khác TMN IPN ({req_tmn}). Kiểm tra VNPAY_HASH_SECRET trên cổng merchant.'
        return JsonResponse({'RspCode': '97', 'Message': msg or 'Invalid'}, status=200)
    rsp = flat.get('vnp_ResponseCode') or ''
    status_txn = flat.get('vnp_TransactionStatus') or ''
    txn_ref = flat.get('vnp_TxnRef') or ''
    ma_gd = flat.get('vnp_TransactionNo') or ''
    amount_raw = flat.get('vnp_Amount') or '0'
    try:
        amount_vnd = int(amount_raw) / 100.0
    except ValueError:
        amount_vnd = 0

    # Test IPN cổng merchant có thể thiếu vnp_TransactionStatus
    if rsp != '00' or (status_txn and status_txn != '00'):
        return JsonResponse({'RspCode': '00', 'Message': 'Ghi nhận — giao dịch không thành công'}, status=200)

    with transaction.atomic():
        try:
            don_hang = DonHang.objects.select_for_update().get(ma_don_hang=txn_ref)
        except DonHang.DoesNotExist:
            return JsonResponse({'RspCode': '01', 'Message': 'Order not found'}, status=200)
        if hasattr(don_hang, 'thanh_toan'):
            return JsonResponse({'RspCode': '00', 'Message': 'Confirm Success'}, status=200)
        if abs(float(don_hang.tong_tien) - float(amount_vnd)) > 0.01:
            return JsonResponse({'RspCode': '04', 'Message': 'Invalid amount'}, status=200)
        trang_thai_cu = don_hang.trang_thai
        ThanhToan.objects.create(
            don_hang=don_hang,
            so_tien=don_hang.tong_tien,
            phuong_thuc=ThanhToan.PhuongThuc.VNPAY,
            trang_thai=ThanhToan.TrangThai.THANH_CONG,
            ma_giao_dich=ma_gd,
            noi_dung='VNPay IPN',
        )
        if don_hang.loai_don == DonHang.LoaiDon.TAI_QUAY:
            don_hang.trang_thai = DonHang.TrangThai.HOAN_THANH
            trang_moi = DonHang.TrangThai.HOAN_THANH
        else:
            don_hang.trang_thai = DonHang.TrangThai.DA_THANH_TOAN
            trang_moi = DonHang.TrangThai.DA_THANH_TOAN
        don_hang.save(update_fields=['trang_thai', 'ngay_cap_nhat'])
        LichSuDonHang.objects.create(
            don_hang=don_hang,
            trang_thai_cu=trang_thai_cu,
            trang_thai_moi=trang_moi,
            nguoi_thay_doi=None,
            ghi_chu=f'Thanh toan VNPay IPN {ma_gd}',
        )
        _dong_bo_don_thuoc_sau_thanh_toan_tai_quay(don_hang, ThanhToan.PhuongThuc.VNPAY)
        if don_hang.loai_don == DonHang.LoaiDon.ONLINE:
            gui_xac_nhan_thanh_toan_vnpay(don_hang, ma_giao_dich=ma_gd)
        logger_dh.info(
            'VNPay IPN: đã thanh toán đơn %s → %s (GD %s)',
            txn_ref,
            trang_moi,
            ma_gd,
        )
    return JsonResponse({'RspCode': '00', 'Message': 'Confirm Success'}, status=200)


def vnpay_return(request):
    """
    Callback Return URL (GET) — kiểm tra HMAC trước khi render SPA.
    Lỗi cũ: verify dùng nhầm vnp_SecureHashType làm chữ ký khi thiếu vnp_SecureHash.
    """
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    flat = {k: request.GET.get(k) for k in request.GET}
    ok, err = verify_vnpay_signature(flat, query_string=request.META.get('QUERY_STRING', '') or '')
    if not ok:
        return HttpResponse(
            f'VNPay: {err or "Xác minh thất bại"}',
            status=400,
            content_type='text/plain; charset=utf-8',
        )
    return render(request, 'index.html')