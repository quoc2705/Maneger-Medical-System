from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q, Sum, Count, F, Value, Min, DecimalField, DateTimeField
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from rest_framework import viewsets, status, generics, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from nguoidung.roles import (
    la_ke_toan,
    la_duoc_thao_tac_kho,
    la_admin_he_thong,
    la_xem_bao_cao_tai_chinh,
)
from .models import *
from .serializers import *
import logging

logger = logging.getLogger(__name__)


def _cap_nhat_kho_tu_phieu_nhap(phieu_nhap):
    """Tạo bản ghi tồn kho theo chi tiết phiếu nhập (một lần cho mỗi phiếu)."""
    if phieu_nhap.da_cap_nhat_kho:
        return
    if phieu_nhap.loai_nhap == 'THUOC':
        for chi_tiet in phieu_nhap.chi_tiet_thuoc.all():
            KhoThuoc.objects.create(
                thuoc=chi_tiet.thuoc,
                so_luong=chi_tiet.so_luong,
                ngay_nhap=phieu_nhap.ngay_chung_tu,
                han_su_dung=chi_tiet.han_su_dung,
                lo_sx=chi_tiet.lo_sx,
            )
    else:
        for chi_tiet in phieu_nhap.chi_tiet_vaccine.all():
            KhoVaccine.objects.create(
                vaccine=chi_tiet.vaccine,
                so_luong=chi_tiet.so_luong,
                ngay_nhap=phieu_nhap.ngay_chung_tu,
                han_su_dung=chi_tiet.han_su_dung,
                lo_sx=chi_tiet.lo_sx,
            )


class ThuocVaccineCatalogPagination(PageNumberPagination):
    """Cho phép client truyền ?page_size= (mặc định DRF chỉ trả 20 bản ghi, bỏ qua page_size)."""
    page_size = 60
    page_size_query_param = 'page_size'
    max_page_size = 200


# ==================== VIEWSETS CHO CÁC MODEL CƠ BẢN ====================

class LoaiThuocViewSet(viewsets.ModelViewSet):
    """API cho loại thuốc"""
    queryset = LoaiThuoc.objects.all()
    serializer_class = LoaiThuocSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['ten_loai', 'mo_ta']
    ordering_fields = ['ten_loai']

    def create(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại thuốc.')
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại thuốc.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại thuốc.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại thuốc.')
        return super().destroy(request, *args, **kwargs)

class DonViTinhViewSet(viewsets.ModelViewSet):
    """API cho đơn vị tính"""
    queryset = DonViTinh.objects.all()
    serializer_class = DonViTinhSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['ten_don_vi', 'ky_hieu']

class NhaCungCapViewSet(viewsets.ModelViewSet):
    """API cho nhà cung cấp"""
    queryset = NhaCungCap.objects.all()
    serializer_class = NhaCungCapSerializer
    pagination_class = ThuocVaccineCatalogPagination
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['trang_thai']
    search_fields = ['ma_ncc', 'ten_ncc', 'so_dien_thoai', 'email']
    ordering_fields = ['ten_ncc', 'created_at']

    def create(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thêm nhà cung cấp.')
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được sửa nhà cung cấp.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được sửa nhà cung cấp.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được xóa nhà cung cấp.')
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def thuoc_cung_cap(self, request, pk=None):
        """Lấy danh sách thuốc do nhà cung cấp này cung cấp"""
        nha_cung_cap = self.get_object()
        thuoc = nha_cung_cap.thuoc_set.all()
        page = self.paginate_queryset(thuoc)
        if page is not None:
            serializer = ThuocSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = ThuocSerializer(thuoc, many=True)
        return Response(serializer.data)

# ==================== VIEWSETS CHO THUỐC ====================

class ThuocViewSet(viewsets.ModelViewSet):
    """API cho thuốc"""
    queryset = Thuoc.objects.select_related('loai_thuoc', 'don_vi').prefetch_related(
        'kho_thuoc', 'nha_cung_cap', 'lich_su_gia'
    ).all()
    serializer_class = ThuocSerializer
    pagination_class = ThuocVaccineCatalogPagination
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['loai_thuoc', 'trang_thai', 'can_don_thuoc', 'can_tu_van', 'la_thuoc_ban_chay']
    search_fields = ['ma_thuoc', 'ten_thuoc', 'nha_san_xuat', 'thanh_phan']
    ordering_fields = ['ten_thuoc', 'gia_ban', 'created_at', 'ton_kho']

    def get_pagination_class(self):
        # Bệnh nhân cần danh sách đầy đủ trên cửa hàng (tránh cắt theo PAGE_SIZE / max_page_size).
        u = self.request.user
        if getattr(u, 'is_authenticated', False) and getattr(u, 'vai_tro', None) == 'BENH_NHAN':
            return None
        return ThuocVaccineCatalogPagination

    def get_queryset(self):
        """Custom queryset với filter đặc biệt"""
        queryset = super().get_queryset()
        # Bệnh nhân chỉ được xem thuốc đang kinh doanh và không cần kê đơn.
        if getattr(self.request.user, 'vai_tro', None) == 'BENH_NHAN':
            queryset = queryset.filter(trang_thai=True, can_don_thuoc=False)
        
        # Filter theo khoảng giá
        gia_tu = self.request.query_params.get('gia_tu')
        gia_den = self.request.query_params.get('gia_den')
        if gia_tu:
            queryset = queryset.filter(gia_ban__gte=gia_tu)
        if gia_den:
            queryset = queryset.filter(gia_ban__lte=gia_den)
        
        # Filter theo tồn kho
        ton_kho = self.request.query_params.get('ton_kho')
        if ton_kho == 'con_hang':
            # Lọc thuốc còn hàng (tồn kho > 0)
            thuoc_ids = [t.id for t in queryset if t.ton_kho() > 0]
            queryset = queryset.filter(id__in=thuoc_ids)
        elif ton_kho == 'het_hang':
            thuoc_ids = [t.id for t in queryset if t.ton_kho() == 0]
            queryset = queryset.filter(id__in=thuoc_ids)
        
        return queryset

    @action(detail=False, methods=['get'])
    def thong_ke(self, request):
        """Thống kê tổng quan về thuốc"""
        total = self.get_queryset().count()
        con_hang = sum(1 for t in self.get_queryset() if t.ton_kho() > 0)
        het_hang = total - con_hang
        sap_het_han = Thuoc.objects.filter(
            kho_thuoc__han_su_dung__lte=date.today() + timedelta(days=90),
            kho_thuoc__han_su_dung__gt=date.today()
        ).distinct().count()
        
        # Thống kê theo loại
        thong_ke_loai = LoaiThuoc.objects.annotate(
            so_luong=Count('thuoc')
        ).values('ten_loai', 'so_luong')
        
        return Response({
            'tong_thuoc': total,
            'con_hang': con_hang,
            'het_hang': het_hang,
            'sap_het_han': sap_het_han,
            'thong_ke_loai': thong_ke_loai
        })

    @action(detail=True, methods=['get'])
    def chi_tiet_ton_kho(self, request, pk=None):
        """Xem chi tiết tồn kho của thuốc"""
        thuoc = self.get_object()
        kho = thuoc.kho_thuoc.all().order_by('han_su_dung')
        
        # Tính toán thống kê
        tong_ton = sum(k.so_luong for k in kho)
        con_han = kho.filter(han_su_dung__gt=date.today())
        tong_con_han = sum(k.so_luong for k in con_han)
        het_han = kho.filter(han_su_dung__lte=date.today())
        tong_het_han = sum(k.so_luong for k in het_han)
        sap_het_han = kho.filter(
            han_su_dung__lte=date.today() + timedelta(days=90),
            han_su_dung__gt=date.today()
        )
        tong_sap_het_han = sum(k.so_luong for k in sap_het_han)
        
        serializer = KhoThuocSerializer(kho, many=True)
        
        return Response({
            'thuoc': ThuocSerializer(thuoc).data,
            'tong_ton': tong_ton,
            'con_han': tong_con_han,
            'het_han': tong_het_han,
            'sap_het_han': tong_sap_het_han,
            'chi_tiet': serializer.data
        })

    @action(detail=True, methods=['post'])
    def cap_nhat_gia(self, request, pk=None):
        """Cập nhật giá thuốc và lưu lịch sử (kế toán hoặc admin)."""
        if not (la_ke_toan(request.user) or la_admin_he_thong(request.user)):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được cập nhật giá bán.')
        thuoc = self.get_object()
        gia_moi = request.data.get('gia_moi')
        ly_do = request.data.get('ly_do', '')
        
        if not gia_moi:
            return Response(
                {'error': 'Vui lòng nhập giá mới'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Lưu lịch sử giá
        LichSuGiaThuoc.objects.create(
            thuoc=thuoc,
            gia_cu=thuoc.gia_ban,
            gia_moi=gia_moi,
            nguoi_thay_doi=getattr(request.user, 'ten_dang_nhap', '') or str(request.user.pk),
            ly_do=ly_do
        )
        
        # Cập nhật giá mới
        thuoc.gia_ban = gia_moi
        thuoc.save()
        
        return Response({
            'message': 'Cập nhật giá thành công',
            'gia_moi': float(gia_moi),
            'data': ThuocSerializer(thuoc).data,
        })

    @action(detail=False, methods=['get'])
    def tim_kiem_nang_cao(self, request):
        """Tìm kiếm thuốc nâng cao"""
        query = request.query_params.get('q', '')
        loai_thuoc = request.query_params.get('loai_thuoc')
        gia_toi_da = request.query_params.get('gia_toi_da')
        chi_dinh = request.query_params.get('chi_dinh')
        
        thuoc = self.get_queryset()
        
        if query:
            thuoc = thuoc.filter(
                Q(ma_thuoc__icontains=query) |
                Q(ten_thuoc__icontains=query) |
                Q(thanh_phan__icontains=query) |
                Q(nha_san_xuat__icontains=query)
            )
        
        if loai_thuoc:
            thuoc = thuoc.filter(loai_thuoc_id=loai_thuoc)
        
        if gia_toi_da:
            thuoc = thuoc.filter(gia_ban__lte=gia_toi_da)
        
        if chi_dinh:
            thuoc = thuoc.filter(chi_dinh__icontains=chi_dinh)
        
        serializer = self.get_serializer(thuoc, many=True)
        return Response(serializer.data)

class KhoThuocViewSet(viewsets.ModelViewSet):
    """API cho kho thuốc"""
    queryset = KhoThuoc.objects.select_related('thuoc').all()
    serializer_class = KhoThuocSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['thuoc', 'han_su_dung']
    search_fields = ['thuoc__ten_thuoc', 'thuoc__ma_thuoc', 'lo_sx']
    ordering_fields = ['ngay_nhap', 'han_su_dung', 'so_luong']

    def perform_create(self, serializer):
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được nhập kho.')
        serializer.save()

    def perform_update(self, serializer):
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được sửa lô kho.')
        serializer.save()

    def perform_destroy(self, instance):
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được xóa lô kho.')
        instance.delete()

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter theo trạng thái hạn
        trang_thai = self.request.query_params.get('trang_thai')
        if trang_thai == 'con_han':
            queryset = queryset.filter(han_su_dung__gt=date.today())
        elif trang_thai == 'het_han':
            queryset = queryset.filter(han_su_dung__lte=date.today())
        elif trang_thai == 'sap_het_han':
            queryset = queryset.filter(
                han_su_dung__lte=date.today() + timedelta(days=90),
                han_su_dung__gt=date.today()
            )
        
        return queryset

    @action(detail=True, methods=['post'], url_path='xuat-sl')
    def xuat_sl(self, request, pk=None):
        """Xuất kho theo lô (giảm số lượng)."""
        if not la_duoc_thao_tac_kho(request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được xuất kho.')
        kho = self.get_object()
        try:
            sl = int(request.data.get('so_luong', 0) or 0)
        except (TypeError, ValueError):
            sl = 0
        if sl <= 0:
            return Response({'error': 'Số lượng xuất phải lớn hơn 0'}, status=status.HTTP_400_BAD_REQUEST)
        if sl > kho.so_luong:
            return Response({'error': 'Số lượng xuất vượt tồn lô'}, status=status.HTTP_400_BAD_REQUEST)
        kho.so_luong -= sl
        kho.save(update_fields=['so_luong'])
        return Response(KhoThuocSerializer(kho).data)

    @action(detail=False, methods=['get'])
    def bao_cao_sap_het_han(self, request):
        """Báo cáo thuốc sắp hết hạn"""
        ngay_canh_bao = date.today() + timedelta(days=90)
        kho_sap_het_han = self.get_queryset().filter(
            han_su_dung__lte=ngay_canh_bao,
            han_su_dung__gt=date.today()
        ).order_by('han_su_dung')
        
        serializer = self.get_serializer(kho_sap_het_han, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def bao_cao_ton_kho(self, request):
        """Báo cáo tồn kho tổng hợp"""
        # Tồn kho theo thuốc
        ton_kho_theo_thuoc = KhoThuoc.objects.filter(
            han_su_dung__gt=date.today()
        ).values(
            'thuoc__ma_thuoc',
            'thuoc__ten_thuoc'
        ).annotate(
            tong_ton=Sum('so_luong'),
            so_lo=Count('id'),
            ngay_het_han_gan_nhat=Min('han_su_dung')
        ).order_by('-tong_ton')
        
        # Thống kê tổng quan
        tong_gia_tri_ton = KhoThuoc.objects.filter(
            han_su_dung__gt=date.today()
        ).aggregate(
            tong=Sum(F('so_luong') * F('thuoc__don_gia_nhap'))
        )['tong'] or 0
        
        return Response({
            'tong_gia_tri_ton': tong_gia_tri_ton,
            'chi_tiet': ton_kho_theo_thuoc
        })

# ==================== VIEWSETS CHO VACCINE ====================

class LoaiVaccineViewSet(viewsets.ModelViewSet):
    """API cho loại vaccine — CRUD danh mục: chỉ Admin."""
    queryset = LoaiVaccine.objects.all()
    serializer_class = LoaiVaccineSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['ten_loai', 'mo_ta']
    ordering_fields = ['ten_loai']

    def create(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại vaccine.')
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại vaccine.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại vaccine.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục loại vaccine.')
        return super().destroy(request, *args, **kwargs)

class VaccineViewSet(viewsets.ModelViewSet):
    """API cho vaccine"""
    queryset = Vaccine.objects.select_related('loai_vaccine', 'nha_cung_cap').prefetch_related(
        'kho_vaccine', 'lich_su_gia'
    ).all()
    serializer_class = VaccineSerializer
    pagination_class = ThuocVaccineCatalogPagination
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['loai_vaccine', 'trang_thai', 'so_mui']
    search_fields = ['ma_vaccine', 'ten_vaccine', 'nha_san_xuat', 'phong_benh']
    ordering_fields = ['ten_vaccine', 'gia_tiem', 'created_at']

    def get_pagination_class(self):
        u = self.request.user
        if getattr(u, 'is_authenticated', False) and getattr(u, 'vai_tro', None) == 'BENH_NHAN':
            return None
        return ThuocVaccineCatalogPagination

    def create(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục vaccine.')
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục vaccine.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục vaccine.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not la_admin_he_thong(request.user):
            raise PermissionDenied('Chỉ quản trị viên được thao tác danh mục vaccine.')
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def cap_nhat_gia(self, request, pk=None):
        """Cập nhật giá tiêm / giá nhập vaccine (kế toán hoặc admin)."""
        if not (la_ke_toan(request.user) or la_admin_he_thong(request.user)):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được cập nhật giá.')
        vaccine = self.get_object()
        gia_tiem_moi = request.data.get('gia_tiem_moi')
        gia_nhap_moi = request.data.get('gia_nhap_moi')
        ly_do = request.data.get('ly_do', '')
        if gia_tiem_moi is None and gia_nhap_moi is None:
            return Response(
                {'error': 'Vui lòng gửi gia_tiem_moi hoặc gia_nhap_moi'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if gia_tiem_moi is not None:
            LichSuGiaVaccine.objects.create(
                vaccine=vaccine,
                gia_cu=vaccine.gia_tiem,
                gia_moi=gia_tiem_moi,
                nguoi_thay_doi=getattr(request.user, 'ten_dang_nhap', '') or str(request.user.pk),
                ly_do=ly_do
            )
            vaccine.gia_tiem = gia_tiem_moi
        if gia_nhap_moi is not None:
            vaccine.gia_nhap = gia_nhap_moi
        vaccine.save()
        return Response({'message': 'Cập nhật giá thành công', 'data': VaccineSerializer(vaccine).data})

    @action(detail=True, methods=['get'])
    def lich_tiem(self, request, pk=None):
        """Xem lịch tiêm chi tiết của vaccine"""
        vaccine = self.get_object()
        lich_tiem = vaccine.get_lich_tiem()
        
        return Response({
            'ten_vaccine': vaccine.ten_vaccine,
            'so_mui': vaccine.so_mui,
            'lich_tiem': lich_tiem,
            'khoang_cach_mui': vaccine.khoang_cach_mui
        })

    @action(detail=False, methods=['get'])
    def thong_ke(self, request):
        """Thống kê vaccine"""
        total = self.get_queryset().count()
        
        # Thống kê theo loại
        thong_ke_loai = LoaiVaccine.objects.annotate(
            so_luong=Count('vaccine')
        ).values('ten_loai', 'so_luong')
        
        # Tồn kho
        tong_ton = KhoVaccine.objects.filter(
            han_su_dung__gt=date.today()
        ).aggregate(
            tong=Sum('so_luong')
        )['tong'] or 0
        
        return Response({
            'tong_vaccine': total,
            'tong_ton_kho': tong_ton,
            'thong_ke_loai': thong_ke_loai
        })

class KhoVaccineViewSet(viewsets.ModelViewSet):
    """API cho kho vaccine"""
    queryset = KhoVaccine.objects.select_related('vaccine').all()
    serializer_class = KhoVaccineSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['vaccine', 'han_su_dung']
    search_fields = ['vaccine__ten_vaccine', 'lo_sx']

    def perform_create(self, serializer):
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được nhập kho.')
        serializer.save()

    def perform_update(self, serializer):
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được sửa lô kho.')
        serializer.save()

    def perform_destroy(self, instance):
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được xóa lô kho.')
        instance.delete()

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter vaccine còn hạn
        con_han = self.request.query_params.get('con_han')
        if con_han == 'true':
            queryset = queryset.filter(han_su_dung__gt=date.today())
        
        return queryset

    @action(detail=True, methods=['post'], url_path='xuat-sl')
    def xuat_sl(self, request, pk=None):
        """Xuất kho vaccine theo lô."""
        if not la_duoc_thao_tac_kho(request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được xuất kho.')
        kho = self.get_object()
        try:
            sl = int(request.data.get('so_luong', 0) or 0)
        except (TypeError, ValueError):
            sl = 0
        if sl <= 0:
            return Response({'error': 'Số lượng xuất phải lớn hơn 0'}, status=status.HTTP_400_BAD_REQUEST)
        if sl > kho.so_luong:
            return Response({'error': 'Số lượng xuất vượt tồn lô'}, status=status.HTTP_400_BAD_REQUEST)
        kho.so_luong -= sl
        kho.save(update_fields=['so_luong'])
        return Response(KhoVaccineSerializer(kho).data)

# ==================== VIEWSETS CHO NHẬP KHO ====================

class PhieuNhapKhoViewSet(viewsets.ModelViewSet):
    """API cho phiếu nhập kho"""
    queryset = PhieuNhapKho.objects.select_related('nha_cung_cap').prefetch_related(
        'chi_tiet_thuoc', 'chi_tiet_vaccine'
    ).all()
    serializer_class = PhieuNhapKhoSerializer
    pagination_class = ThuocVaccineCatalogPagination
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['loai_nhap', 'nha_cung_cap', 'da_thanh_toan', 'da_duyet_chi', 'da_cap_nhat_kho']
    search_fields = ['ma_phieu', 'so_chung_tu', 'nha_cung_cap__ten_ncc']
    ordering_fields = ['ngay_nhap', 'tong_tien']

    def perform_create(self, serializer):
        """Tạo phiếu nhập (API) — cập nhật tồn kho ngay khi lưu."""
        if not la_duoc_thao_tac_kho(self.request.user):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được nhập kho.')
        serializer.save(nguoi_nhap=self.request.user.get_username())
        phieu = serializer.instance
        if phieu and not phieu.da_cap_nhat_kho:
            _cap_nhat_kho_tu_phieu_nhap(phieu)
            phieu.da_cap_nhat_kho = True
            phieu.da_duyet_chi = True
            phieu.nguoi_duyet_chi = getattr(self.request.user, 'ten_dang_nhap', '') or str(self.request.user.pk)
            phieu.ngay_duyet_chi = timezone.now()
            phieu.save(
                update_fields=[
                    'da_cap_nhat_kho', 'da_duyet_chi', 'nguoi_duyet_chi', 'ngay_duyet_chi',
                ]
            )

    @action(detail=True, methods=['post'])
    def xac_nhan_thanh_toan(self, request, pk=None):
        """Xác nhận đã thanh toán phiếu nhập"""
        if not (la_ke_toan(request.user) or la_admin_he_thong(request.user)):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được xác nhận thanh toán.')
        phieu_nhap = self.get_object()
        phieu_nhap.da_thanh_toan = True
        phieu_nhap.save()
        
        return Response({'message': 'Đã xác nhận thanh toán'})

    @action(detail=True, methods=['post'])
    def duyet_chi(self, request, pk=None):
        """Kế toán duyệt phiếu nhập: ghi nhận chi phí và cập nhật tồn kho."""
        if not (la_ke_toan(request.user) or la_admin_he_thong(request.user)):
            raise PermissionDenied('Chỉ kế toán hoặc quản trị viên được duyệt phiếu nhập.')
        with transaction.atomic():
            phieu_nhap = self.get_queryset().select_for_update().get(pk=pk)
            if phieu_nhap.da_duyet_chi:
                return Response({'detail': 'Phiếu đã được duyệt trước đó.'}, status=status.HTTP_400_BAD_REQUEST)
            _cap_nhat_kho_tu_phieu_nhap(phieu_nhap)
            phieu_nhap.da_cap_nhat_kho = True
            phieu_nhap.da_duyet_chi = True
            phieu_nhap.nguoi_duyet_chi = getattr(request.user, 'ten_dang_nhap', '') or str(request.user.pk)
            phieu_nhap.ngay_duyet_chi = timezone.now()
            phieu_nhap.save(
                update_fields=[
                    'da_cap_nhat_kho',
                    'da_duyet_chi',
                    'nguoi_duyet_chi',
                    'ngay_duyet_chi',
                ]
            )
        phieu_nhap = self.get_queryset().prefetch_related(
            'chi_tiet_thuoc', 'chi_tiet_vaccine'
        ).get(pk=pk)
        return Response(PhieuNhapKhoSerializer(phieu_nhap).data)

# ==================== VIEWSETS CHO TOA THUỐC MẪU ====================

class ToaThuocMauViewSet(viewsets.ModelViewSet):
    """API cho toa thuốc mẫu"""
    queryset = ToaThuocMau.objects.prefetch_related(
        'chi_tiet__thuoc'
    ).all()
    serializer_class = ToaThuocMauSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['ma_toa', 'ten_toa', 'chuan_doan']

    @action(detail=True, methods=['get'])
    def tinh_tien(self, request, pk=None):
        """Tính tổng tiền của toa thuốc mẫu"""
        toa_thuoc = self.get_object()
        tong_tien = 0
        chi_tiet = []
        
        for ct in toa_thuoc.chi_tiet.all():
            thanh_tien = ct.so_luong * ct.thuoc.gia_ban
            tong_tien += thanh_tien
            chi_tiet.append({
                'thuoc': ct.thuoc.ten_thuoc,
                'so_luong': ct.so_luong,
                'don_gia': float(ct.thuoc.gia_ban),
                'thanh_tien': float(thanh_tien)
            })
        
        return Response({
            'toa_thuoc': toa_thuoc.ten_toa,
            'tong_tien': float(tong_tien),
            'chi_tiet': chi_tiet
        })

# ==================== DASHBOARD API ====================

class DashboardViewSet(viewsets.ViewSet):
    """API cho dashboard tổng quan"""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def thong_ke_tong_quan(self, request):
        """Thống kê tổng quan cho dashboard"""
        today = date.today()
        
        # Thống kê thuốc
        tong_thuoc = Thuoc.objects.filter(trang_thai=True).count()
        thuoc_sap_het_han = KhoThuoc.objects.filter(
            han_su_dung__lte=today + timedelta(days=90),
            han_su_dung__gt=today
        ).values('thuoc').distinct().count()
        
        # Thống kê vaccine
        tong_vaccine = Vaccine.objects.filter(trang_thai=True).count()
        vaccine_sap_het_han = KhoVaccine.objects.filter(
            han_su_dung__lte=today + timedelta(days=90),
            han_su_dung__gt=today
        ).values('vaccine').distinct().count()
        
        # Giá trị tồn kho
        gia_tri_ton_thuoc = KhoThuoc.objects.filter(
            han_su_dung__gt=today
        ).aggregate(
            tong=Sum(F('so_luong') * F('thuoc__don_gia_nhap'))
        )['tong'] or 0
        
        gia_tri_ton_vaccine = KhoVaccine.objects.filter(
            han_su_dung__gt=today
        ).aggregate(
            tong=Sum(F('so_luong') * F('vaccine__gia_nhap'))
        )['tong'] or 0
        
        # Nhập kho gần đây: phiếu cũ + lô nhập trực tiếp
        nhap_kho_gan_day_phieu = list(
            PhieuNhapKho.objects.order_by('-ngay_nhap')[:10]
        )
        nhap_kho_gan_day_lo_thuoc = list(
            KhoThuoc.objects.select_related('thuoc').order_by('-ngay_nhap')[:10]
        )
        nhap_kho_gan_day_lo_vac = list(
            KhoVaccine.objects.select_related('vaccine').order_by('-ngay_nhap')[:10]
        )
        
        return Response({
            'thuoc': {
                'tong': tong_thuoc,
                'sap_het_han': thuoc_sap_het_han,
                'gia_tri_ton': gia_tri_ton_thuoc
            },
            'vaccine': {
                'tong': tong_vaccine,
                'sap_het_han': vaccine_sap_het_han,
                'gia_tri_ton': gia_tri_ton_vaccine
            },
            'nhap_kho_gan_day': PhieuNhapKhoSerializer(nhap_kho_gan_day_phieu, many=True).data,
            'nhap_kho_lo_thuoc': KhoThuocSerializer(nhap_kho_gan_day_lo_thuoc, many=True).data,
            'nhap_kho_lo_vaccine': KhoVaccineSerializer(nhap_kho_gan_day_lo_vac, many=True).data,
        })

    @action(detail=False, methods=['get'])
    def canh_bao_ton_kho(self, request):
        """Cảnh báo tồn kho (sắp hết, sắp hết hạn)"""
        today = date.today()
        ba_thang_toi = today + timedelta(days=90)
        
        # Thuốc sắp hết hạn
        thuoc_sap_het_han = KhoThuoc.objects.filter(
            han_su_dung__lte=ba_thang_toi,
            han_su_dung__gt=today,
            so_luong__gt=0
        ).select_related('thuoc').order_by('han_su_dung')
        
        # Thuốc sắp hết hàng (tồn < 10)
        thuoc_sap_het_hang = []
        for thuoc in Thuoc.objects.filter(trang_thai=True):
            ton = thuoc.ton_kho()
            if 0 < ton <= 10:
                thuoc_sap_het_hang.append({
                    'thuoc': thuoc.ten_thuoc,
                    'ton_kho': ton
                })
        
        # Vaccine sắp hết hạn
        vaccine_sap_het_han = KhoVaccine.objects.filter(
            han_su_dung__lte=ba_thang_toi,
            han_su_dung__gt=today,
            so_luong__gt=0
        ).select_related('vaccine').order_by('han_su_dung')

        vaccine_sap_het_hang = []
        for vc in Vaccine.objects.filter(trang_thai=True):
            ton = vc.ton_kho()
            if 0 < ton < 10:
                vaccine_sap_het_hang.append({
                    'vaccine': vc.ten_vaccine,
                    'ton_kho': ton
                })
        
        return Response({
            'thuoc_sap_het_han': KhoThuocSerializer(thuoc_sap_het_han, many=True).data,
            'thuoc_sap_het_hang': thuoc_sap_het_hang,
            'vaccine_sap_het_han': KhoVaccineSerializer(vaccine_sap_het_han, many=True).data,
            'vaccine_sap_het_hang': vaccine_sap_het_hang,
        })

    @action(detail=False, methods=['get'], url_path='ke-toan/tom-tat')
    def tom_tat_ke_toan(self, request):
        """Thống kê doanh thu & lợi nhuận (ước tính) cho kế toán / admin."""
        if not la_xem_bao_cao_tai_chinh(request.user):
            raise PermissionDenied('Không có quyền xem báo cáo tài chính.')
        from baocao.financial_service import BaoCaoTaiChinhService

        try:
            params = BaoCaoTaiChinhService.parse_query_params(request.query_params)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BaoCaoTaiChinhService.thong_ke(**params))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tai_chinh_xuat_download(request):
    """Xuất báo cáo tài chính — endpoint Django thuần (tránh DRF ép JSON)."""
    if not la_xem_bao_cao_tai_chinh(request.user):
        return Response(
            {'error': 'Không có quyền xuất báo cáo tài chính.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    from baocao.financial_service import BaoCaoTaiChinhService
    from baocao.exporters import export_financial

    fmt = (request.query_params.get('dinh_dang') or 'xlsx').lower()
    try:
        params = BaoCaoTaiChinhService.parse_query_params(request.query_params)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    data = BaoCaoTaiChinhService.thong_ke(**params)
    return export_financial(data, request, fmt)