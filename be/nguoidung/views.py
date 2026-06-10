from django.conf import settings
from django.shortcuts import get_object_or_404, redirect
from django.db import transaction, IntegrityError
from django.db.models import Q, Count, Avg, Sum
from django.utils import timezone
from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend

from .permissions import LaAdmin, LaBenhNhan, LaAdminHoacNhanVien
from .models import *
from .serializers import *
import logging
from .models import NhatKyHoatDong
from .serializers import ThongBaoSerializer
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from rest_framework.decorators import api_view, permission_classes
from django.views.generic import TemplateView
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator

from rest_framework.permissions import BasePermission
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from .password_reset import FORGOT_PASSWORD_MSG, build_reset_link, gui_email_dat_lai_mat_khau
# views.py - Thêm vào cuối file
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework.views import APIView
# Nếu chưa có refresh endpoint, thêm vào urls.py của project
logger = logging.getLogger(__name__)

# Import từ app khác an toàn
try:
    from benhan.serializers import HoSoBenhAnSerializer, LichSuTiemChungSerializer
    BENHAN_AVAILABLE = True
except ImportError:
    BENHAN_AVAILABLE = False
    logger.warning("App 'benhan' chưa được cài đặt hoặc chưa có serializers")
    HoSoBenhAnSerializer = None
    LichSuTiemChungSerializer = None

# Đầu file views.py, thêm:
try:
    from .models import NhatKyHoatDong
except ImportError:
    NhatKyHoatDong = None

# ==================== VIEWSETS CHO NGƯỜI DÙNG ====================

class NguoiDungViewSet(viewsets.ModelViewSet):
    """API cho người dùng"""
    queryset = NguoiDung.objects.filter(is_active=True).order_by('-ngay_tao')
    serializer_class = NguoiDungSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['vai_tro', 'gioi_tinh', 'is_verified']
    search_fields = ['ho_ten', 'email', 'so_dien_thoai', 'ten_dang_nhap']
    ordering_fields = ['ngay_tao', 'ho_ten', 'last_login']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        # BENH_NHAN chỉ được xem/cập nhật hồ sơ của chính mình.
        if not user.is_superuser and user.vai_tro not in ['ADMIN', 'NHAN_VIEN']:
            return queryset.filter(id=user.id)
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return NguoiDungCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return NguoiDungUpdateSerializer
        return NguoiDungSerializer
    
    def get_permissions(self):
        """Override permissions based on action"""
        if self.action in ('register', 'login', 'forgot_password', 'reset_password'):
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def register(self, request):
        """Đăng ký tài khoản bệnh nhân mới"""
        payload = {
            'nguoi_dung': {
                'ten_dang_nhap': request.data.get('ten_dang_nhap'),
                'password': request.data.get('password'),
                'password2': request.data.get('password2'),
                'ho_ten': request.data.get('ho_ten'),
                'email': request.data.get('email'),
                'so_dien_thoai': request.data.get('so_dien_thoai'),
                'vai_tro': 'BENH_NHAN',
                'ngay_sinh': request.data.get('ngay_sinh'),
                'gioi_tinh': request.data.get('gioi_tinh'),
                'dia_chi': request.data.get('dia_chi'),
            },
            'ngay_sinh': request.data.get('ngay_sinh'),
            'gioi_tinh': request.data.get('gioi_tinh'),
            'dia_chi': request.data.get('dia_chi'),
            'so_bao_hiem': request.data.get('so_bao_hiem'),
            'nhom_mau': request.data.get('nhom_mau', 'CHUA_XAC_DINH'),
        }

        serializer = BenhNhanCreateSerializer(data=payload)
        if serializer.is_valid():
            benh_nhan = serializer.save()
            user = benh_nhan.nguoi_dung
            refresh = RefreshToken.for_user(user)

            try:
                NhatKyHoatDong.objects.create(
                    nguoi_dung=user,
                    hanh_dong='THEM',
                    doi_tuong='BenhNhan',
                    du_lieu_moi={'ma_benh_nhan': benh_nhan.ma_benh_nhan}
                )
            except:
                pass

            return Response({
                'user': NguoiDungSerializer(user).data,
                'role_data': BenhNhanSerializer(benh_nhan).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(
            {'error': 'Dữ liệu đăng ký không hợp lệ', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def login(self, request):
        """Đăng nhập"""
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']

            user.record_login(request)
            refresh = RefreshToken.for_user(user)

            try:
                NhatKyHoatDong.objects.create(
                    nguoi_dung=user,
                    hanh_dong='DANG_NHAP',
                    doi_tuong='NguoiDung',
                    ip_address=user.last_login_ip,
                    user_agent=request.META.get('HTTP_USER_AGENT', '')
                )
            except:
                pass

            user_data = NguoiDungSerializer(user).data
            role_data = {}
            
            if user.vai_tro == 'BENH_NHAN' and hasattr(user, 'benh_nhan'):
                role_data = BenhNhanSerializer(user.benh_nhan).data
            elif user.vai_tro == 'BAC_SI' and hasattr(user, 'bac_si'):
                role_data = BacSiSerializer(user.bac_si).data
            elif user.vai_tro == 'NHAN_VIEN' and hasattr(user, 'nhan_vien'):
                role_data = NhanVienSerializer(user.nhan_vien).data

            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': user_data,
                'role_data': role_data,
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def logout(self, request):
        """Đăng xuất — blacklist refresh token"""
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'error': 'Vui lòng cung cấp refresh token'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            try:
                NhatKyHoatDong.objects.create(
                    nguoi_dung=request.user,
                    hanh_dong='DANG_XUAT',
                    doi_tuong='NguoiDung'
                )
            except:
                pass
            return Response({'message': 'Đăng xuất thành công'})
        except Exception:
            return Response({'error': 'Token không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def me(self, request):
        """Lấy thông tin người dùng hiện tại"""
        serializer = NguoiDungSerializer(request.user)
        
        # Lấy thông tin chi tiết theo vai trò
        data = serializer.data
        if request.user.vai_tro == 'BENH_NHAN' and hasattr(request.user, 'benh_nhan'):
            data['benh_nhan'] = BenhNhanSerializer(request.user.benh_nhan).data
        elif request.user.vai_tro == 'BAC_SI' and hasattr(request.user, 'bac_si'):
            data['bac_si'] = BacSiSerializer(request.user.bac_si).data
        elif request.user.vai_tro == 'NHAN_VIEN' and hasattr(request.user, 'nhan_vien'):
            data['nhan_vien'] = NhanVienSerializer(request.user.nhan_vien).data
        
        return Response(data)

    @action(detail=False, methods=['patch'])
    def update_me(self, request):
        """Cập nhật hồ sơ cá nhân của user hiện tại."""
        serializer = NguoiDungUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(NguoiDungSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def forgot_password(self, request):
        """Gửi email đặt lại mật khẩu (không tiết lộ email có tồn tại hay không)."""
        serializer = ForgotPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        user = NguoiDung.objects.filter(
            email__iexact=email,
            is_active=True,
            deleted_at__isnull=True,
        ).first()

        payload = {'message': FORGOT_PASSWORD_MSG}
        if user and not user.is_locked:
            reset_url = build_reset_link(user)
            gui_email_dat_lai_mat_khau(user, reset_url=reset_url)
            if settings.DEBUG:
                payload['reset_url'] = reset_url

        return Response(payload)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def reset_password(self, request):
        """Đặt mật khẩu mới từ liên kết trong email."""
        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            uid = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
            user = NguoiDung.objects.get(pk=uid, is_active=True, deleted_at__isnull=True)
        except (TypeError, ValueError, OverflowError, NguoiDung.DoesNotExist):
            return Response(
                {'detail': 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data['token']
        if not default_token_generator.check_token(user, token):
            return Response(
                {'detail': 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.password_changed_at = timezone.now()
        user.login_attempts = 0
        if user.is_locked:
            user.unlock_account()
        user.save()

        try:
            NhatKyHoatDong.objects.create(
                nguoi_dung=user,
                hanh_dong='SUA',
                doi_tuong='NguoiDung',
                du_lieu_moi={'password_reset': True},
            )
        except Exception:
            pass

        return Response({'message': 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập ngay.'})

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Đổi mật khẩu"""
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            
            if not user.check_password(serializer.validated_data['old_password']):
                return Response(
                    {'old_password': 'Mật khẩu cũ không đúng'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            user.set_password(serializer.validated_data['new_password'])
            user.password_changed_at = timezone.now()
            user.save()
            
            # Ghi nhật ký
            NhatKyHoatDong.objects.create(
                nguoi_dung=user,
                hanh_dong='SUA',
                doi_tuong='NguoiDung',
                du_lieu_moi={'password_changed': True}
            )
            
            return Response({'message': 'Đổi mật khẩu thành công'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ==================== VIEWSETS CHO BỆNH NHÂN ====================

class CanManageBenhNhan(BasePermission):
    """Chỉ nhân viên/admin mới được quản lý bệnh nhân"""
    def has_permission(self, request, view):
        if view.action in ['create', 'update', 'partial_update', 'destroy']:
            return request.user.is_authenticated and request.user.vai_tro in ['NHAN_VIEN', 'ADMIN']
        return request.user.is_authenticated  # Xem thì ai cũng được


class BenhNhanViewSet(viewsets.ModelViewSet):
    """API cho bệnh nhân"""
    queryset = BenhNhan.objects.select_related('nguoi_dung').all()
    serializer_class = BenhNhanSerializer
    permission_classes = [IsAuthenticated, CanManageBenhNhan]
    pagination_class = PageNumberPagination
    page_size = 20
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['gioi_tinh', 'nhom_mau', 'nghe_nghiep']
    search_fields = ['ma_benh_nhan', 'nguoi_dung__ho_ten', 'nguoi_dung__so_dien_thoai', 'so_bao_hiem']
    ordering_fields = ['ngay_sinh', 'created_at']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return BenhNhanDetailSerializer
        elif self.action == 'create':
            return BenhNhanCreateSerializer
        return BenhNhanSerializer

    @action(detail=False, methods=['patch'], permission_classes=[IsAuthenticated])
    def cap_nhat_ho_so_cua_toi(self, request):
        """Cho phép BENH_NHAN tự cập nhật hồ sơ bệnh nhân của chính mình."""
        if request.user.vai_tro != 'BENH_NHAN' or not hasattr(request.user, 'benh_nhan'):
            return Response({'error': 'Chỉ bệnh nhân mới được cập nhật hồ sơ cá nhân'}, status=status.HTTP_403_FORBIDDEN)

        benh_nhan = request.user.benh_nhan
        benh_nhan_data = request.data.copy()
        # Tách payload tài khoản để tránh validate sai field OneToOne 'nguoi_dung' của BenhNhanSerializer.
        nguoi_dung_data = benh_nhan_data.pop('nguoi_dung', None)

        benh_nhan_serializer = BenhNhanSerializer(benh_nhan, data=benh_nhan_data, partial=True)
        nguoi_dung_serializer = NguoiDungUpdateSerializer(
            request.user,
            data=nguoi_dung_data or {},
            partial=True
        )

        if not benh_nhan_serializer.is_valid():
            return Response({'benh_nhan': benh_nhan_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        if nguoi_dung_data is not None and not nguoi_dung_serializer.is_valid():
            return Response({'nguoi_dung': nguoi_dung_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        benh_nhan_serializer.save()
        if nguoi_dung_data is not None:
            nguoi_dung_serializer.save()

        data = BenhNhanDetailSerializer(benh_nhan).data
        data['nguoi_dung'] = NguoiDungSerializer(request.user).data
        return Response(data)

    @action(detail=True, methods=['get'])
    def lich_su_kham(self, request, pk=None):
        """Lấy lịch sử khám bệnh của bệnh nhân"""
        benh_nhan = self.get_object()
        if not BENHAN_AVAILABLE or not HoSoBenhAnSerializer:
            return Response({
                'error': 'Module bệnh án chưa được cài đặt'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        lich_su = benh_nhan.ho_so.all().order_by('-ngay_kham')
        
        # Phân trang
        page = self.paginate_queryset(lich_su)
        if page is not None:
            serializer = HoSoBenhAnSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = HoSoBenhAnSerializer(lich_su, many=True)
        return Response(serializer.data)
    

    @action(detail=True, methods=['get'])
    def lich_su_tiem(self, request, pk=None):
        """Lấy lịch sử tiêm chủng của bệnh nhân"""
        benh_nhan = self.get_object()
        
        if not BENHAN_AVAILABLE or not LichSuTiemChungSerializer:
            return Response({
                'error': 'Module bệnh án chưa được cài đặt'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
        
        lich_su = benh_nhan.lich_su_tiem.all().order_by('-ngay_tiem')
        
        page = self.paginate_queryset(lich_su)
        if page is not None:
             serializer = LichSuTiemChungSerializer(page, many=True)
             return self.get_paginated_response(serializer.data)
        serializer = LichSuTiemChungSerializer(lich_su, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def thong_ke(self, request):
        """Thống kê bệnh nhân"""
        total = self.get_queryset().count()
        
        # Thống kê theo giới tính
        theo_gioi_tinh = self.get_queryset().values('gioi_tinh').annotate(
            so_luong=Count('id')
        )
        
        # Thống kê theo nhóm máu
        theo_nhom_mau = self.get_queryset().values('nhom_mau').annotate(
            so_luong=Count('id')
        )
        
        # Thống kê theo độ tuổi
        today = date.today()
        duoi_18 = 0
        tu_18_40 = 0
        tu_40_60 = 0
        tren_60 = 0
        
        for bn in self.get_queryset():
            tuoi = bn.tuoi()
            if tuoi < 18:
                duoi_18 += 1
            elif tuoi < 40:
                tu_18_40 += 1
            elif tuoi < 60:
                tu_40_60 += 1
            else:
                tren_60 += 1
        
        return Response({
            'tong_benh_nhan': total,
            'theo_gioi_tinh': theo_gioi_tinh,
            'theo_nhom_mau': theo_nhom_mau,
            'theo_do_tuoi': {
                'duoi_18': duoi_18,
                '18_40': tu_18_40,
                '40_60': tu_40_60,
                'tren_60': tren_60
            }
        })
    
    def get_queryset(self):
        """Filter queryset dựa trên vai trò"""
        queryset = super().get_queryset()
        user = self.request.user
        
        # Bệnh nhân chỉ xem được thông tin của mình
        if user.vai_tro == 'BENH_NHAN':
            queryset = queryset.filter(nguoi_dung=user)
        
        # Bác sĩ xem được tất cả bệnh nhân (phục vụ khám)
        elif user.vai_tro == 'BAC_SI':
            # Có thể thêm filter theo khoa/phòng
            pass
        
        return queryset
    
    def perform_create(self, serializer):
        """Chỉ nhân viên/admin mới được tạo"""
        if self.request.user.vai_tro not in ['NHAN_VIEN', 'ADMIN']:
            raise PermissionDenied("Không có quyền tạo bệnh nhân mới")
        
        benh_nhan = serializer.save()
        
        # Ghi nhật ký
        NhatKyHoatDong.objects.create(
            nguoi_dung=self.request.user,
            hanh_dong='THEM',
            doi_tuong='BenhNhan',
            doi_tuong_id=str(benh_nhan.nguoi_dung_id),
            du_lieu_moi={'ma_benh_nhan': benh_nhan.ma_benh_nhan}
        )
    
    def perform_update(self, serializer):
        """Ghi nhật ký khi sửa"""
        instance = self.get_object()
        old_data = BenhNhanSerializer(instance).data
        
        benh_nhan = serializer.save()
        
        # Ghi nhật ký
        NhatKyHoatDong.objects.create(
            nguoi_dung=self.request.user,
            hanh_dong='SUA',
            doi_tuong='BenhNhan',
            doi_tuong_id=str(benh_nhan.nguoi_dung_id),
            du_lieu_cu=old_data,
            du_lieu_moi=BenhNhanSerializer(benh_nhan).data
        )

# ==================== VIEWSETS CHO BÁC SĨ ====================

class BacSiViewSet(viewsets.ModelViewSet):
    """API cho bác sĩ"""
    queryset = BacSi.objects.select_related('nguoi_dung').prefetch_related('danh_gia').all()
    serializer_class = BacSiSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['chuyen_khoa', 'trinh_do', 'chuc_vu', 'is_working']
    search_fields = ['ma_bac_si', 'nguoi_dung__ho_ten', 'chuyen_khoa']
    ordering_fields = ['ngay_bat_dau_cong_tac', 'created_at']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return BacSiDetailSerializer
        elif self.action == 'create':
            return BacSiCreateSerializer
        return BacSiSerializer

    @action(detail=True, methods=['get'])
    def danh_gia(self, request, pk=None):
        """Lấy danh sách đánh giá của bác sĩ"""
        bac_si = self.get_object()
        danh_gia = bac_si.danh_gia.all().order_by('-created_at')
        serializer = DanhGiaBacSiSerializer(danh_gia, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def lich_lam_viec(self, request, pk=None):
        """Lấy lịch làm việc của bác sĩ"""
        bac_si = self.get_object()
        tu_ngay = request.query_params.get('tu_ngay')
        den_ngay = request.query_params.get('den_ngay')
        
        lich = LichLamViec.objects.filter(nguoi_dung=bac_si.nguoi_dung)
        if tu_ngay:
            lich = lich.filter(ngay__gte=tu_ngay)
        if den_ngay:
            lich = lich.filter(ngay__lte=den_ngay)
        
        serializer = LichLamViecSerializer(lich.order_by('ngay', 'gio_bat_dau'), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def top_bac_si(self, request):
        """Top bác sĩ được đánh giá cao"""
        top = self.get_queryset().annotate(
            avg_rating=Avg('danh_gia__diem')
        ).filter(
            avg_rating__isnull=False
        ).order_by('-avg_rating')[:10]
        
        serializer = self.get_serializer(top, many=True)
        return Response(serializer.data)

# ==================== VIEWSETS CHO NHÂN VIÊN ====================

class NhanVienViewSet(viewsets.ModelViewSet):
    """API cho nhân viên"""
    queryset = NhanVien.objects.select_related('nguoi_dung').all()
    serializer_class = NhanVienSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['phong_ban', 'chuc_vu', 'is_working']
    search_fields = ['ma_nhan_vien', 'nguoi_dung__ho_ten', 'phong_ban']
    ordering_fields = ['ngay_bat_dau_lam', 'created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return NhanVienCreateSerializer
        return NhanVienSerializer

# ==================== VIEWSETS CHO CÁC MODEL KHÁC ====================

class DanhGiaBacSiViewSet(viewsets.ModelViewSet):
    """API cho đánh giá bác sĩ"""
    queryset = DanhGiaBacSi.objects.select_related('benh_nhan', 'bac_si').all()
    serializer_class = DanhGiaBacSiSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['bac_si', 'diem']
    ordering_fields = ['created_at']

    def perform_create(self, serializer):
        danh_gia = serializer.save()
        
        # Ghi nhật ký
        NhatKyHoatDong.objects.create(
            nguoi_dung=self.request.user,
            hanh_dong='THEM',
            doi_tuong='DanhGiaBacSi',
            du_lieu_moi={'diem': danh_gia.diem}
        )

class ThongBaoViewSet(viewsets.ModelViewSet):
    """API cho thông báo"""
    serializer_class = ThongBaoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['loai', 'da_xem']
    ordering_fields = ['created_at']

    def get_queryset(self):
        u = self.request.user
        nid = self.request.query_params.get('nguoi_nhan')
        if nid and (
            u.is_superuser or getattr(u, 'vai_tro', None) in ('BAC_SI', 'NHAN_VIEN', 'ADMIN')
        ):
            return ThongBao.objects.filter(nguoi_nhan_id=nid).order_by('-created_at')
        return ThongBao.objects.filter(nguoi_nhan=u).order_by('-created_at')

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        """Đánh dấu đã đọc thông báo"""
        thong_bao = self.get_object()
        thong_bao.mark_as_read()
        return Response({'message': 'Đã đánh dấu đã đọc'})

    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):
        """Đánh dấu tất cả đã đọc"""
        self.get_queryset().filter(da_xem=False).update(
            da_xem=True, ngay_xem=timezone.now()
        )
        return Response({'message': 'Đã đánh dấu tất cả đã đọc'})

class DoctorScheduleViewSet(viewsets.ModelViewSet):
    """Đăng ký ca làm bác sĩ — lưu bảng doctor_schedule."""
    queryset = DoctorSchedule.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['bac_si', 'ngay_lam', 'ca_lam']
    ordering_fields = ['ngay_lam', 'ca_lam', 'created_at']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return DoctorScheduleCreateSerializer
        return DoctorScheduleSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        tu = self.request.query_params.get('tu_ngay')
        den = self.request.query_params.get('den_ngay')
        if tu:
            qs = qs.filter(ngay_lam__gte=tu)
        if den:
            qs = qs.filter(ngay_lam__lte=den)
        if self.request.query_params.get('my') == 'true':
            if getattr(user, 'vai_tro', None) == 'BAC_SI':
                return qs.filter(bac_si_id=user.pk)
            return qs.none()
        if user.is_superuser or getattr(user, 'vai_tro', None) in ('ADMIN', 'NHAN_VIEN'):
            return qs
        if getattr(user, 'vai_tro', None) == 'BAC_SI':
            return qs.filter(bac_si_id=user.pk)
        return qs.none()

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, 'vai_tro', None) != 'BAC_SI':
            raise PermissionDenied('Chỉ bác sĩ được đăng ký ca làm')
        serializer.save(bac_si_id=user.pk)

    def perform_update(self, serializer):
        if not hasattr(self.request.user, 'bac_si') or serializer.instance.bac_si_id != self.request.user.bac_si.pk:
            if self.request.user.vai_tro not in ('ADMIN',) and not self.request.user.is_superuser:
                raise PermissionDenied('Không được sửa ca làm của bác sĩ khác')
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if hasattr(user, 'bac_si') and instance.bac_si_id == user.bac_si.pk:
            instance.delete()
            return
        if user.is_superuser or getattr(user, 'vai_tro', None) == 'ADMIN':
            instance.delete()
            return
        raise PermissionDenied('Không được xóa ca làm của bác sĩ khác')

    @action(detail=False, methods=['post'], url_path='dang_ky_nhieu')
    def dang_ky_nhieu(self, request):
        """Đăng ký nhiều ca trong một ngày: {ngay_lam, ca_lam: ['SANG','CHIEU'], ghi_chu?}."""
        if getattr(request.user, 'vai_tro', None) != 'BAC_SI':
            return Response({'error': 'Chỉ bác sĩ đăng ký được'}, status=status.HTTP_403_FORBIDDEN)
        ngay = request.data.get('ngay_lam')
        ca_list = request.data.get('ca_lam') or request.data.get('cac_ca') or []
        if not ngay or not ca_list:
            return Response(
                {'error': 'Cần ngay_lam và danh sách ca_lam (SANG/CHIEU/TOI)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ghi_chu = (request.data.get('ghi_chu') or '').strip()
        created = []
        errors = []
        for ca in ca_list:
            ser = DoctorScheduleCreateSerializer(
                data={'ngay_lam': ngay, 'ca_lam': ca, 'ghi_chu': ghi_chu},
            )
            if not ser.is_valid():
                errors.append({ca: ser.errors})
                continue
            obj, was_created = DoctorSchedule.objects.get_or_create(
                bac_si_id=request.user.pk,
                ngay_lam=ser.validated_data['ngay_lam'],
                ca_lam=ser.validated_data['ca_lam'],
                defaults={'ghi_chu': ghi_chu},
            )
            if not was_created and ghi_chu:
                obj.ghi_chu = ghi_chu
                obj.save(update_fields=['ghi_chu', 'updated_at'])
            created.append(DoctorScheduleSerializer(obj).data)
        return Response(
            {'created': created, 'errors': errors},
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )


class LichLamViecViewSet(viewsets.ModelViewSet):
    """API cho lịch làm việc"""
    queryset = LichLamViec.objects.select_related('nguoi_dung', 'benh_nhan').all()
    serializer_class = LichLamViecSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['nguoi_dung', 'trang_thai']
    ordering_fields = ['ngay', 'gio_bat_dau']

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter theo ngày
        ngay = self.request.query_params.get('ngay')
        if ngay:
            queryset = queryset.filter(ngay=ngay)
        
        # Filter theo người dùng hiện tại
        my_schedule = self.request.query_params.get('my_schedule')
        if my_schedule == 'true':
            queryset = queryset.filter(nguoi_dung=self.request.user)
        
        return queryset

class NhatKyHoatDongViewSet(viewsets.ReadOnlyModelViewSet):
    """API cho nhật ký hoạt động (chỉ đọc)"""
    serializer_class = NhatKyHoatDongSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['hanh_dong', 'doi_tuong']
    ordering_fields = ['created_at']

    def get_queryset(self):
        # Admin có thể xem tất cả, nhân viên chỉ xem của mình
        if self.request.user.is_superuser or self.request.user.vai_tro == 'ADMIN':
            return NhatKyHoatDong.objects.all()
        return NhatKyHoatDong.objects.filter(nguoi_dung=self.request.user)

# ==================== DASHBOARD VIEWSET ====================

class DashboardViewSet(viewsets.ViewSet):
    """API cho dashboard tổng quan"""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def tong_quan(self, request):
        """Thống kê tổng quan"""
        today = date.today()
        
        # Số lượng
        tong_benh_nhan = BenhNhan.objects.count()
        tong_bac_si = BacSi.objects.filter(is_working=True).count()
        tong_nhan_vien = NhanVien.objects.filter(is_working=True).count()
        
        # Bệnh nhân mới hôm nay
        benh_nhan_moi = BenhNhan.objects.filter(
            created_at__date=today
        ).count()
        
        # Lịch hẹn hôm nay
        lich_hen_hom_nay = LichLamViec.objects.filter(
            ngay=today,
            trang_thai='RANH'
        ).count()
        
        # Thông báo chưa đọc
        thong_bao_chua_doc = ThongBao.objects.filter(
            nguoi_nhan=request.user,
            da_xem=False
        ).count()
        
        return Response({
            'tong_benh_nhan': tong_benh_nhan,
            'tong_bac_si': tong_bac_si,
            'tong_nhan_vien': tong_nhan_vien,
            'benh_nhan_moi_hom_nay': benh_nhan_moi,
            'lich_hen_hom_nay': lich_hen_hom_nay,
            'thong_bao_chua_doc': thong_bao_chua_doc
        })
        

# Thêm vào cuối file views.py
__all__ = [
    'NguoiDungViewSet',
    'BenhNhanViewSet', 
    'BacSiViewSet',
    'NhanVienViewSet',
    'DanhGiaBacSiViewSet',
    'ThongBaoViewSet',
    'DoctorScheduleViewSet',
    'LichLamViecViewSet',
    'NhatKyHoatDongViewSet',
    'DashboardViewSet',
]



# ==================== ADMIN DASHBOARD VIEWS ====================

class AdminDashboardView(TemplateView):
    """Trang admin dashboard"""
    template_name = 'admin/dashboard.html'
    
    def dispatch(self, request, *args, **kwargs):
        # Kiểm tra JWT token trước
        if not request.user.is_authenticated:
            return redirect('/login/')
        
        # Kiểm tra role
        if request.user.vai_tro not in ['ADMIN', 'NHAN_VIEN'] and not request.user.is_superuser:
            return redirect('/')
        
        return super().dispatch(request, *args, **kwargs)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['page_title'] = 'Admin Dashboard'
        return context


@api_view(['GET'])
@permission_classes([IsAuthenticated, LaAdminHoacNhanVien])
def admin_stats_api(request):
    """API lấy thống kê cho admin dashboard"""
    user = request.user

    if user.vai_tro not in ['ADMIN', 'NHAN_VIEN'] and not user.is_superuser:
        return Response({'error': 'Không có quyền truy cập'}, status=status.HTTP_403_FORBIDDEN)
    
    today = timezone.now().date()
    start_of_week = today - timedelta(days=today.weekday())
    start_of_month = today.replace(day=1)
    
    # Thống kê người dùng
    tong_nguoi_dung = NguoiDung.objects.filter(is_active=True, deleted_at__isnull=True).count()
    benh_nhan_users_qs = NguoiDung.objects.filter(
        vai_tro='BENH_NHAN',
        is_active=True,
        deleted_at__isnull=True
    )
    tong_benh_nhan = benh_nhan_users_qs.count()
    tong_bac_si = BacSi.objects.filter(is_working=True).count()
    tong_nhan_vien = NhanVien.objects.filter(is_working=True).count()
    
    # Bệnh nhân mới theo thời gian
    benh_nhan_hom_nay = benh_nhan_users_qs.filter(ngay_tao__date=today).count()
    benh_nhan_tuan_nay = benh_nhan_users_qs.filter(ngay_tao__date__gte=start_of_week).count()
    benh_nhan_thang_nay = benh_nhan_users_qs.filter(ngay_tao__date__gte=start_of_month).count()
    
    # Thống kê lịch hẹn (nếu có app lichhen)
    try:
        from lichhen.models import LichHen
        tong_lich_hen = LichHen.objects.count()
        lich_hen_hom_nay = LichHen.objects.filter(ngay_gio_hen__date=today).count()
        lich_hen_da_kham = LichHen.objects.filter(trang_thai='hoan_thanh').count()
        lich_hen_cho_xac_nhan = LichHen.objects.filter(trang_thai='cho_xac_nhan').count()
    except ImportError:
        tong_lich_hen = lich_hen_hom_nay = lich_hen_da_kham = lich_hen_cho_xac_nhan = 0
    
    # Đơn thuốc + đơn hàng — khớp thong_ke_don_hang: đơn hàng đã thu (không chỉ HOAN_THANH)
    tong_don_thuoc = 0
    doanh_thu_hom_nay = 0
    try:
        from benhan.models import DonThuoc, LichSuTiemChung
        from benhan.revenue_utils import don_thuoc_co_doanh_q, loc_don_thuoc_ngay
        from donhang.models import DonHang
        from donhang.revenue_utils import loc_don_hang_hom_nay, loc_don_hang_thang

        _dh_chua_co_doanh = (
            DonHang.TrangThai.MOI_TAO,
            DonHang.TrangThai.CHO_THANH_TOAN,
            DonHang.TrangThai.DA_HUY,
        )
        tong_don_thuoc = DonThuoc.objects.count()
        dt_hn = (
            loc_don_thuoc_ngay(
                DonThuoc.objects.filter(don_thuoc_co_doanh_q()),
                today,
            ).aggregate(tong=Sum('tong_tien'))['tong']
            or 0
        )
        dh_hn = (
            loc_don_hang_hom_nay(
                DonHang.objects.select_related('thanh_toan'),
                today,
            )
            .exclude(trang_thai__in=_dh_chua_co_doanh)
            .aggregate(tong=Sum('tong_tien'))['tong']
            or 0
        )
        tc_hn = (
            LichSuTiemChung.objects.filter(
                trang_thai='DA_TIEM',
                ngay_tiem=today,
            ).aggregate(
                tong=Sum('vaccine__gia_tiem')
            )['tong']
            or 0
        )
        doanh_thu_hom_nay = float(dt_hn) + float(dh_hn) + float(tc_hn)

        # Doanh thu tháng hiện tại — khớp BaoCaoTaiChinhService (đơn + toa + tiêm)
        doanh_thu_thang_nay = 0.0
        so_giao_dich_thang_nay = 0
        doanh_thu_thang_don_hang = 0.0
        doanh_thu_thang_don_thuoc = 0.0
        doanh_thu_thang_tiem = 0.0
        try:
            from baocao.financial_service import BaoCaoTaiChinhService

            _tk_params = BaoCaoTaiChinhService.parse_query_params({
                'tu': start_of_month.isoformat(),
                'den': today.isoformat(),
                'ky_loai': 'khoang',
                'nhom': 'ngay',
            })
            _tk = BaoCaoTaiChinhService.thong_ke(**_tk_params)
            doanh_thu_thang_nay = float(_tk.get('doanh_thu') or 0)
            so_giao_dich_thang_nay = int(_tk.get('so_giao_dich') or 0)
            doanh_thu_thang_don_hang = float(_tk.get('doanh_thu_don_hang') or 0)
            doanh_thu_thang_don_thuoc = float(_tk.get('doanh_thu_don_thuoc') or 0)
            doanh_thu_thang_tiem = float(_tk.get('doanh_thu_tiem') or 0)
        except Exception:
            pass
    except ImportError:
        tong_don_thuoc = doanh_thu_hom_nay = 0
        doanh_thu_thang_nay = 0.0
        so_giao_dich_thang_nay = 0
        doanh_thu_thang_don_hang = 0.0
        doanh_thu_thang_don_thuoc = 0.0
        doanh_thu_thang_tiem = 0.0
    
    # Thống kê thuốc sắp hết (nếu có app thuoc)
    try:
        from thuoc.models import Thuoc
        
        thuoc_sap_het = 0
        thuoc_het_hang = 0
        
        for thuoc in Thuoc.objects.filter(trang_thai=True):
            ton = thuoc.ton_kho()
            if 0 < ton <= 10:
                thuoc_sap_het += 1
            elif ton == 0:
                thuoc_het_hang += 1
                
    except ImportError:
        thuoc_sap_het = thuoc_het_hang = 0
    
    # Biểu đồ: doanh thu theo tháng — Sum theo year/month trên ngay_tao (không dùng TruncMonth:
    # MySQL + USE_TZ dễ lỗi "invalid datetime / time zone definitions" nếu chưa nạp mysql.time_zone_name).
    doanh_thu_nam = today.year
    doanh_thu_theo_thang = []
    try:
        from benhan.models import DonThuoc, LichSuTiemChung
        from benhan.revenue_utils import don_thuoc_co_doanh_q, loc_don_thuoc_thang
        from donhang.models import DonHang
        from donhang.revenue_utils import loc_don_hang_thang

        _dh_chua_co_doanh = (
            DonHang.TrangThai.MOI_TAO,
            DonHang.TrangThai.CHO_THANH_TOAN,
            DonHang.TrangThai.DA_HUY,
        )
        for m in range(1, 13):
            dh = (
                loc_don_hang_thang(
                    DonHang.objects.select_related('thanh_toan').exclude(
                        trang_thai__in=_dh_chua_co_doanh
                    ),
                    doanh_thu_nam,
                    m,
                ).aggregate(t=Sum('tong_tien'))['t']
                or 0
            )
            dt = (
                loc_don_thuoc_thang(
                    DonThuoc.objects.filter(don_thuoc_co_doanh_q()),
                    doanh_thu_nam,
                    m,
                ).aggregate(t=Sum('tong_tien'))['t']
                or 0
            )
            doanh_thu_theo_thang.append(
                {
                    'thang': f'{m:02d}/{doanh_thu_nam}',
                    'doanh_thu': float(dh)
                    + float(dt)
                    + float(
                        LichSuTiemChung.objects.filter(
                            trang_thai='DA_TIEM',
                            ngay_tiem__year=doanh_thu_nam,
                            ngay_tiem__month=m,
                        ).aggregate(t=Sum('vaccine__gia_tiem'))['t']
                        or 0
                    ),
                }
            )
    except ImportError:
        doanh_thu_theo_thang = [
            {'thang': f'{m:02d}/{doanh_thu_nam}', 'doanh_thu': 0.0} for m in range(1, 13)
        ]
    
    phan_bo_gioi_tinh = list(
        benh_nhan_users_qs.exclude(gioi_tinh='').values('gioi_tinh').annotate(so_luong=Count('id'))
    )
    
    # Phân bố bác sĩ theo chuyên khoa (đếm bản ghi bác sĩ / nhóm)
    phan_bo_chuyen_khoa = list(
        BacSi.objects.filter(is_working=True)
        .values('chuyen_khoa')
        .annotate(so_luong=Count('ma_bac_si'))[:10]
    )
    
    # Thông báo gần đây: gộp thông báo cá nhân (nguoidung_thong_bao) và
    # thông báo app (thong_bao_app — đơn hàng, v.v.). Trước đây chỉ lọc theo
    # nguoi_nhan=admin nên gần như luôn rỗng vì đơn tạo TB cho bệnh nhân.
    thong_bao_merged = []
    for tb in ThongBao.objects.filter(nguoi_nhan=user).order_by('-created_at')[:25]:
        thong_bao_merged.append({
            'id': str(tb.id),
            'tieu_de': tb.tieu_de,
            'noi_dung': tb.noi_dung,
            'loai': tb.loai,
            'da_xem': tb.da_xem,
            'created_at': tb.created_at,
        })
    try:
        from thongbao.models import ThongBao as ThongBaoApp

        for tb in ThongBaoApp.objects.select_related('nguoi_nhan').order_by('-ngay_tao')[:40]:
            ten = (tb.nguoi_nhan.ho_ten or '').strip() if getattr(tb, 'nguoi_nhan_id', None) else ''
            nd = tb.noi_dung or ''
            if ten:
                nd = f'{nd} (Khách: {ten})' if nd else f'Khách: {ten}'
            thong_bao_merged.append({
                'id': str(tb.id),
                'tieu_de': tb.tieu_de,
                'noi_dung': nd,
                'loai': tb.loai_thong_bao,
                'da_xem': tb.da_doc_luc is not None,
                'created_at': tb.ngay_tao,
            })
    except ImportError:
        pass

    def _thong_bao_sort_key(item):
        dt = item.get('created_at')
        if not dt:
            return 0.0
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt.timestamp()

    thong_bao_merged.sort(key=_thong_bao_sort_key, reverse=True)
    thong_bao_data = thong_bao_merged[:10]

    return Response({
        'tong_quan': {
            'tong_nguoi_dung': tong_nguoi_dung,
            'tong_benh_nhan': tong_benh_nhan,
            'tong_bac_si': tong_bac_si,
            'tong_nhan_vien': tong_nhan_vien,
            'tong_lich_hen': tong_lich_hen,
            'tong_don_thuoc': tong_don_thuoc,
        },
        'hom_nay': {
            'benh_nhan_moi': benh_nhan_hom_nay,
            'lich_hen': lich_hen_hom_nay,
            'doanh_thu': doanh_thu_hom_nay,
        },
        'tuan_nay': {
            'benh_nhan_moi': benh_nhan_tuan_nay,
        },
        'thang_nay': {
            'benh_nhan_moi': benh_nhan_thang_nay,
            'doanh_thu': doanh_thu_thang_nay,
            'so_giao_dich': so_giao_dich_thang_nay,
            'doanh_thu_don_hang': doanh_thu_thang_don_hang,
            'doanh_thu_don_thuoc': doanh_thu_thang_don_thuoc,
            'doanh_thu_tiem': doanh_thu_thang_tiem,
            'ky_bao_cao': f'{start_of_month.strftime("%d/%m/%Y")} — {today.strftime("%d/%m/%Y")}',
        },
        'lich_hen': {
            'da_kham': lich_hen_da_kham,
            'cho_xac_nhan': lich_hen_cho_xac_nhan,
        },
        'kho_thuoc': {
            'sap_het': thuoc_sap_het,
            'het_hang': thuoc_het_hang,
        },
        'bieu_do': {
            'doanh_thu_nam': doanh_thu_nam,
            'doanh_thu_theo_thang': doanh_thu_theo_thang,
            'phan_bo_gioi_tinh': phan_bo_gioi_tinh,
            'phan_bo_chuyen_khoa': phan_bo_chuyen_khoa,
        },
        'thong_bao_gan_day': thong_bao_data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, LaAdmin])
def admin_search_api(request):
    """API tìm kiếm toàn cục cho admin"""
    user = request.user
    
    if user.vai_tro not in ['ADMIN', 'NHAN_VIEN'] and not user.is_superuser:
        return Response({'error': 'Không có quyền truy cập'}, status=status.HTTP_403_FORBIDDEN)
    
    query = request.query_params.get('q', '').strip()
    
    if not query or len(query) < 2:
        return Response({'results': []})
    
    results = []
    
    # Tìm bệnh nhân
    benh_nhan_list = BenhNhan.objects.select_related('nguoi_dung').filter(
        Q(ma_benh_nhan__icontains=query) |
        Q(nguoi_dung__ho_ten__icontains=query) |
        Q(nguoi_dung__so_dien_thoai__icontains=query) |
        Q(so_bao_hiem__icontains=query)
    )[:10]
    
    for bn in benh_nhan_list:
        results.append({
            'type': 'benh_nhan',
            'id': str(bn.nguoi_dung.id),
            'ma': bn.ma_benh_nhan,
            'ten': bn.nguoi_dung.ho_ten,
            'so_dien_thoai': bn.nguoi_dung.so_dien_thoai,
            'url': f'/admin/benh-nhan/{bn.nguoi_dung.id}'
        })
    
    # Tìm bác sĩ
    bac_si_list = BacSi.objects.select_related('nguoi_dung').filter(
        Q(ma_bac_si__icontains=query) |
        Q(nguoi_dung__ho_ten__icontains=query) |
        Q(chuyen_khoa__icontains=query)
    )[:10]
    
    for bs in bac_si_list:
        results.append({
            'type': 'bac_si',
            'id': str(bs.nguoi_dung.id),
            'ma': bs.ma_bac_si,
            'ten': bs.nguoi_dung.ho_ten,
            'chuyen_khoa': bs.chuyen_khoa,
            'url': f'/admin/bac-si/{bs.nguoi_dung.id}'
        })
    
    # Tìm nhân viên
    nhan_vien_list = NhanVien.objects.select_related('nguoi_dung').filter(
        Q(ma_nhan_vien__icontains=query) |
        Q(nguoi_dung__ho_ten__icontains=query) |
        Q(phong_ban__icontains=query)
    )[:10]
    
    for nv in nhan_vien_list:
        results.append({
            'type': 'nhan_vien',
            'id': str(nv.nguoi_dung.id),
            'ma': nv.ma_nhan_vien,
            'ten': nv.nguoi_dung.ho_ten,
            'phong_ban': nv.phong_ban,
            'url': f'/admin/nhan-vien/{nv.nguoi_dung.id}'
        })
    
    return Response({'results': results, 'query': query})


# API quản lý bác sĩ
@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated, LaAdmin])
def admin_bac_si_api(request, pk=None):
    """API quản lý bác sĩ cho admin"""
    user = request.user
    
    # if user.vai_tro not in ['ADMIN', 'NHAN_VIEN'] and not user.is_superuser:
    #     return Response({'error': 'Không có quyền truy cập'}, status=status.HTTP_403_FORBIDDEN)
    
    if pk is not None and str(pk).strip().lower() in ('', 'undefined', 'null'):
        return Response({'error': 'ID bác sĩ không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
    
    if request.method == 'GET':
        if pk:
            try:
                bac_si = BacSi.objects.select_related('nguoi_dung').get(pk=pk)
                serializer = BacSiDetailSerializer(bac_si)
                return Response(serializer.data)
            except BacSi.DoesNotExist:
                return Response({'error': 'Không tìm thấy bác sĩ'}, status=status.HTTP_404_NOT_FOUND)
        else:
            bac_si_list = BacSi.objects.select_related('nguoi_dung').all()
            serializer = BacSiSerializer(bac_si_list, many=True)
            return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = BacSiCreateSerializer(data=request.data)
        if serializer.is_valid():
            bac_si = serializer.save()
            return Response(BacSiSerializer(bac_si).data, status=status.HTTP_201_CREATED)
        return Response(
            {'error': 'Dữ liệu bác sĩ không hợp lệ', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    elif request.method == 'PUT':
        try:
            bac_si = BacSi.objects.select_related('nguoi_dung').get(pk=pk)
            payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            nguoi_dung_payload = payload.pop('nguoi_dung', None)

            serializer = BacSiSerializer(bac_si, data=payload, partial=True)
            if not serializer.is_valid():
                return Response(
                    {'error': 'Dữ liệu bác sĩ không hợp lệ', 'details': serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST
                )

            user_serializer = None
            if nguoi_dung_payload is not None and not isinstance(nguoi_dung_payload, dict):
                return Response(
                    {'error': 'Trường nguoi_dung phải là object JSON'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if isinstance(nguoi_dung_payload, dict):
                user_serializer = NguoiDungUpdateSerializer(
                    bac_si.nguoi_dung,
                    data=nguoi_dung_payload,
                    partial=True
                )
                if not user_serializer.is_valid():
                    return Response(
                        {'error': 'Dữ liệu người dùng không hợp lệ', 'details': user_serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            with transaction.atomic():
                serializer.save()
                if user_serializer is not None:
                    user_serializer.save()
                bac_si.refresh_from_db()
                bac_si.nguoi_dung.refresh_from_db()

            return Response(BacSiSerializer(bac_si).data)
        except BacSi.DoesNotExist:
            return Response({'error': 'Không tìm thấy bác sĩ'}, status=status.HTTP_404_NOT_FOUND)
    
    elif request.method == 'DELETE':
        try:
            bac_si = BacSi.objects.get(pk=pk)
            bac_si.is_working = False
            bac_si.nguoi_dung.is_active = False
            bac_si.nguoi_dung.save()
            bac_si.save()
            return Response({'message': 'Đã xóa bác sĩ'})
        except BacSi.DoesNotExist:
            return Response({'error': 'Không tìm thấy bác sĩ'}, status=status.HTTP_404_NOT_FOUND)


# API quản lý bệnh nhân
# views.py - Sửa hàm admin_benh_nhan_api để hỗ trợ POST

@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated, LaAdminHoacNhanVien])
def admin_benh_nhan_api(request, pk=None):
    """API quản lý bệnh nhân cho admin và nhân viên (lễ tân tạo BN tại quầy)."""
    user = request.user
    
    print(f"[DEBUG] admin_benh_nhan_api called - Method: {request.method}, PK: {pk}")
    print(f"[DEBUG] User: {user}, Role: {user.vai_tro}")
    
    if user.vai_tro not in ['ADMIN', 'NHAN_VIEN'] and not user.is_superuser:
        print("[DEBUG] Permission denied")
        return Response({'error': 'Không có quyền truy cập'}, status=status.HTTP_403_FORBIDDEN)

    if pk in ['undefined', 'null', '']:
        return Response({'error': 'ID bệnh nhân không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
    
    if request.method == 'GET':
        if pk:
            try:
                benh_nhan = BenhNhan.objects.select_related('nguoi_dung').get(pk=pk)
                serializer = BenhNhanDetailSerializer(benh_nhan)
                return Response(serializer.data)
            except DjangoValidationError:
                return Response({'error': 'ID bệnh nhân không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
            except BenhNhan.DoesNotExist:
                # Fallback: một số tài khoản có role BENH_NHAN nhưng chưa tạo hồ sơ BenhNhan
                try:
                    u = NguoiDung.objects.get(pk=pk, vai_tro='BENH_NHAN')
                    return Response({
                        'id': str(u.id),
                        'ma_benh_nhan': '',
                        'ngay_sinh': None,
                        'gioi_tinh': u.gioi_tinh,
                        'dia_chi': '',
                        '_user_only': True,
                        'nguoi_dung': {
                            'id': str(u.id),
                            'ho_ten': u.ho_ten,
                            'email': u.email,
                            'so_dien_thoai': u.so_dien_thoai
                        }
                    })
                except NguoiDung.DoesNotExist:
                    return Response({'error': 'Không tìm thấy bệnh nhân'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Lấy tất cả bệnh nhân
            benh_nhan_list = BenhNhan.objects.select_related('nguoi_dung').all().order_by('-created_at')
            
            print(f"[DEBUG] Total patients found: {benh_nhan_list.count()}")
            
            # Debug từng bệnh nhân
            for bn in benh_nhan_list[:5]:
                print(f"[DEBUG] Patient: {bn.ma_benh_nhan} - {bn.nguoi_dung.ho_ten}")
            
            serializer = BenhNhanSerializer(benh_nhan_list, many=True)
            benh_nhan_data = list(serializer.data)

            # Bổ sung các user role BENH_NHAN chưa có profile BenhNhan
            benh_nhan_users = NguoiDung.objects.filter(
                vai_tro='BENH_NHAN',
                is_active=True,
                deleted_at__isnull=True
            ).order_by('-ngay_tao')

            benh_nhan_profile_ids = {str(bn.nguoi_dung_id) for bn in benh_nhan_list}
            fallback_data = [{
                'id': str(u.id),
                'ma_benh_nhan': '',
                'ngay_sinh': None,
                'gioi_tinh': u.gioi_tinh,
                'dia_chi': '',
                '_user_only': True,
                'nguoi_dung': {
                    'id': str(u.id),
                    'ho_ten': u.ho_ten,
                    'email': u.email,
                    'so_dien_thoai': u.so_dien_thoai
                }
            } for u in benh_nhan_users if str(u.id) not in benh_nhan_profile_ids]

            merged_data = benh_nhan_data + fallback_data
            print(f"[DEBUG] Serialized data length: {len(benh_nhan_data)}, fallback: {len(fallback_data)}")
            return Response(merged_data)
    
    # THÊM METHOD POST
    elif request.method == 'POST':
        serializer = BenhNhanCreateSerializer(data=request.data)
        if serializer.is_valid():
            benh_nhan = serializer.save()
            
            # Ghi nhật ký
            NhatKyHoatDong.objects.create(
                nguoi_dung=user,
                hanh_dong='THEM',
                doi_tuong='BenhNhan',
                doi_tuong_id=str(benh_nhan.nguoi_dung.id),
                du_lieu_moi={'ma_benh_nhan': benh_nhan.ma_benh_nhan}
            )
            
            # Tạo thông báo welcome
            ThongBao.objects.create(
                nguoi_nhan=benh_nhan.nguoi_dung,
                loai='TAI_KHOAN',
                tieu_de='Chào mừng đến với PhòngKhám+',
                noi_dung=f'Chào mừng {benh_nhan.nguoi_dung.ho_ten} đã đăng ký thành công tài khoản bệnh nhân tại PhòngKhám+.'
            )
            
            return Response(BenhNhanSerializer(benh_nhan).data, status=status.HTTP_201_CREATED)
        return Response(
            {'error': 'Dữ liệu bệnh nhân không hợp lệ', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    elif request.method == 'PUT':
        try:
            benh_nhan = BenhNhan.objects.select_related('nguoi_dung').get(pk=pk)
            
            # Cập nhật thông tin BenhNhan
            benh_nhan_data = {}
            for field in ['ngay_sinh', 'gioi_tinh', 'dia_chi', 'so_bao_hiem', 'nhom_mau',
                         'chieu_cao', 'can_nang', 'tien_su_benh', 'tien_su_di_ung',
                         'ho_ten_nguoi_than', 'quan_he_nguoi_than', 'sdt_nguoi_than']:
                if field in request.data:
                    value = request.data[field]

                    # Chuẩn hóa dữ liệu để tránh lỗi clean() khi FE gửi string rỗng
                    if field == 'ngay_sinh' and isinstance(value, str):
                        value = value.strip()
                        if not value:
                            continue
                        try:
                            value = datetime.strptime(value, '%Y-%m-%d').date()
                        except ValueError:
                            return Response({'error': 'Định dạng ngày sinh không hợp lệ (YYYY-MM-DD)'},
                                            status=status.HTTP_400_BAD_REQUEST)

                    if field in ['chieu_cao', 'can_nang'] and isinstance(value, str):
                        value = value.strip()
                        if not value:
                            value = None
                        else:
                            try:
                                value = Decimal(value)
                            except (InvalidOperation, ValueError):
                                return Response({'error': f'Giá trị {field} không hợp lệ'},
                                                status=status.HTTP_400_BAD_REQUEST)

                    if field in ['gioi_tinh', 'nhom_mau'] and isinstance(value, str) and not value.strip():
                        continue

                    if field in ['so_bao_hiem', 'ho_ten_nguoi_than', 'quan_he_nguoi_than', 'sdt_nguoi_than',
                                 'tien_su_benh', 'tien_su_di_ung', 'dia_chi'] and isinstance(value, str):
                        value = value.strip()
                        if field == 'so_bao_hiem' and not value:
                            value = None

                    benh_nhan_data[field] = value
            
            for key, value in benh_nhan_data.items():
                setattr(benh_nhan, key, value)
            
            # Cập nhật thông tin NguoiDung
            nguoi_dung = benh_nhan.nguoi_dung
            for field in ['ho_ten', 'email', 'so_dien_thoai']:
                if field in request.data and request.data[field]:
                    setattr(nguoi_dung, field, request.data[field])
            
            # Đổi mật khẩu nếu có
            if 'password' in request.data and request.data['password']:
                if len(request.data['password']) >= 8:
                    nguoi_dung.set_password(request.data['password'])
                else:
                    return Response({'error': 'Mật khẩu phải có ít nhất 8 ký tự'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
            
            try:
                nguoi_dung.save()
                benh_nhan.save()
            except IntegrityError:
                return Response(
                    {'error': 'Email hoặc số điện thoại đã được sử dụng'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Ghi nhật ký
            NhatKyHoatDong.objects.create(
                nguoi_dung=user,
                hanh_dong='SUA',
                doi_tuong='BenhNhan',
                doi_tuong_id=str(benh_nhan.nguoi_dung.id)
            )
            
            serializer = BenhNhanSerializer(benh_nhan)
            return Response(serializer.data)
            
        except DjangoValidationError as e:
            details = getattr(e, 'message_dict', None) or {'non_field_errors': [str(e)]}
            return Response({'error': 'Dữ liệu không hợp lệ', 'details': details}, status=status.HTTP_400_BAD_REQUEST)
        except BenhNhan.DoesNotExist:
            try:
                nguoi_dung = NguoiDung.objects.get(pk=pk, vai_tro='BENH_NHAN', deleted_at__isnull=True)
                for field in ['ho_ten', 'email', 'so_dien_thoai']:
                    if field in request.data and request.data[field]:
                        setattr(nguoi_dung, field, request.data[field])

                if 'password' in request.data and request.data['password']:
                    if len(request.data['password']) >= 8:
                        nguoi_dung.set_password(request.data['password'])
                    else:
                        return Response({'error': 'Mật khẩu phải có ít nhất 8 ký tự'},
                                      status=status.HTTP_400_BAD_REQUEST)

                nguoi_dung.save()
                return Response({
                    'id': str(nguoi_dung.id),
                    'ma_benh_nhan': '',
                    '_user_only': True,
                    'nguoi_dung': {
                        'id': str(nguoi_dung.id),
                        'ho_ten': nguoi_dung.ho_ten,
                        'email': nguoi_dung.email,
                        'so_dien_thoai': nguoi_dung.so_dien_thoai
                    }
                })
            except NguoiDung.DoesNotExist:
                return Response({'error': 'Không tìm thấy bệnh nhân'}, status=status.HTTP_404_NOT_FOUND)
    
    elif request.method == 'DELETE':
        try:
            benh_nhan = BenhNhan.objects.get(pk=pk)
            nguoi_dung = benh_nhan.nguoi_dung
            nguoi_dung.soft_delete()  # Soft delete
            
            # Ghi nhật ký
            NhatKyHoatDong.objects.create(
                nguoi_dung=user,
                hanh_dong='XOA',
                doi_tuong='BenhNhan',
                doi_tuong_id=str(nguoi_dung.id)
            )
            
            return Response({'message': 'Đã xóa bệnh nhân'})
        except DjangoValidationError:
            return Response({'error': 'ID bệnh nhân không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
        except BenhNhan.DoesNotExist:
            try:
                nguoi_dung = NguoiDung.objects.get(pk=pk, vai_tro='BENH_NHAN', deleted_at__isnull=True)
                nguoi_dung.soft_delete()
                return Response({'message': 'Đã xóa bệnh nhân'})
            except NguoiDung.DoesNotExist:
                return Response({'error': 'Không tìm thấy bệnh nhân'}, status=status.HTTP_404_NOT_FOUND)

# API quản lý nhân viên
@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated, LaAdmin])
def admin_nhan_vien_api(request, pk=None):
    """API quản lý nhân viên cho admin"""
    user = request.user
    
    if user.vai_tro != 'ADMIN' and not user.is_superuser:
        return Response({'error': 'Chỉ Admin mới có quyền'}, status=status.HTTP_403_FORBIDDEN)
    
    if pk is not None and str(pk).strip().lower() in ('', 'undefined', 'null'):
        return Response({'error': 'ID nhân viên không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
    
    if request.method == 'GET':
        if pk:
            try:
                nhan_vien = NhanVien.objects.select_related('nguoi_dung').get(pk=pk)
                serializer = NhanVienDetailSerializer(nhan_vien)
                return Response(serializer.data)
            except NhanVien.DoesNotExist:
                return Response({'error': 'Không tìm thấy nhân viên'}, status=status.HTTP_404_NOT_FOUND)
        else:
            nhan_vien_list = NhanVien.objects.select_related('nguoi_dung').all()
            serializer = NhanVienSerializer(nhan_vien_list, many=True)
            return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = NhanVienCreateSerializer(data=request.data)
        if serializer.is_valid():
            nhan_vien = serializer.save()
            return Response(NhanVienSerializer(nhan_vien).data, status=status.HTTP_201_CREATED)
        return Response(
            {
                'error': 'Dữ liệu nhân viên không hợp lệ',
                'details': serializer.errors
            },
            status=status.HTTP_400_BAD_REQUEST
        )
    
    elif request.method == 'PUT':
        try:
            nhan_vien = NhanVien.objects.select_related('nguoi_dung').get(pk=pk)
            payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            nguoi_dung_payload = payload.pop('nguoi_dung', None)

            nv_serializer = NhanVienSerializer(nhan_vien, data=payload, partial=True)
            if not nv_serializer.is_valid():
                return Response(
                    {'error': 'Dữ liệu nhân viên không hợp lệ', 'details': nv_serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST
                )

            user_serializer = None
            if nguoi_dung_payload is not None and not isinstance(nguoi_dung_payload, dict):
                return Response(
                    {'error': 'Trường nguoi_dung phải là object JSON'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if isinstance(nguoi_dung_payload, dict):
                user_serializer = NguoiDungUpdateSerializer(
                    nhan_vien.nguoi_dung,
                    data=nguoi_dung_payload,
                    partial=True
                )
                if not user_serializer.is_valid():
                    return Response(
                        {'error': 'Dữ liệu người dùng không hợp lệ', 'details': user_serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            with transaction.atomic():
                nv_serializer.save()
                if user_serializer is not None:
                    user_serializer.save()
                nhan_vien.refresh_from_db()
                nhan_vien.nguoi_dung.refresh_from_db()

            return Response(NhanVienSerializer(nhan_vien).data)
        except DjangoValidationError:
            return Response({'error': 'ID nhân viên không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
        except NhanVien.DoesNotExist:
            return Response({'error': 'Không tìm thấy nhân viên'}, status=status.HTTP_404_NOT_FOUND)
    
    elif request.method == 'DELETE':
        try:
            nhan_vien = NhanVien.objects.get(pk=pk)
            nhan_vien.is_working = False
            nhan_vien.nguoi_dung.is_active = False
            nhan_vien.nguoi_dung.save()
            nhan_vien.save()
            return Response({'message': 'Đã xóa nhân viên'})
        except NhanVien.DoesNotExist:
            return Response({'error': 'Không tìm thấy nhân viên'}, status=status.HTTP_404_NOT_FOUND)
        
        
class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        data = {
            'id': user.id,
            'ho_ten': user.ho_ten,
            'email': user.email,
            'so_dien_thoai': user.so_dien_thoai,
            'ten_dang_nhap': user.ten_dang_nhap,
            'vai_tro': user.vai_tro,
        }
        return Response(data)