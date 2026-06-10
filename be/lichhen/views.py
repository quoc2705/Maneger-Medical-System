from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q, Count, Sum, Avg, Max
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import date, timedelta, datetime, time
from rest_framework import viewsets, status, filters
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import *
from .serializers import *
from .reminder_services import dong_bo_nhac_cho_lich_hen
from .overdue_services import huy_lich_hen_qua_ngay
from nguoidung.models import BacSi, BenhNhan
from nguoidung.doctor_schedule import (
    phan_ca_tu_thoi_diem,
    bac_si_id_co_ca_trong_ngay,
    cac_ca_bac_si_trong_ngay,
    CA_LABEL,
)
import logging


def _ngay_local_hien_tai():
    """Ngày hôm nay theo TIME_ZONE (VN)."""
    return timezone.localdate()


def _khoang_ngay_trong_tz(ngay_date):
    """
    Khoảng [start, end) tương ứng cả ngày lịch `ngay_date` theo TIME_ZONE.
    Trên MySQL + USE_TZ, lookup `ngay_gio_hen__date=` thường không khớp — dùng khoảng thời gian thay thế.
    """
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(ngay_date, time.min), tz)
    end = start + timedelta(days=1)
    return start, end


def _stt_ke_tiep_trong_ngay(ngay_date):
    start, end = _khoang_ngay_trong_tz(ngay_date)
    agg = LichHen.objects.filter(
        ngay_gio_hen__gte=start, ngay_gio_hen__lt=end
    ).aggregate(m=Max('stt_trong_ngay'))
    return (agg['m'] or 0) + 1


def _filter_lich_trong_ngay(queryset, ngay_date):
    """Lịch thuộc ngày: theo giờ hẹn hoặc giờ check-in (hàng chờ lễ tân phân)."""
    h0, h1 = _khoang_ngay_trong_tz(ngay_date)
    return queryset.filter(
        Q(ngay_gio_hen__gte=h0, ngay_gio_hen__lt=h1)
        | Q(thoi_gian_den__gte=h0, thoi_gian_den__lt=h1)
    )


TRANG_THAI_DANG_CHO_KHAM = ('CHECKED_IN', 'DANG_KHAM')


def _loi_benh_nhan_dang_cho_kham(benh_nhan, exclude_lich_id=None):
    """
    Bệnh nhân đã có lịch chờ khám (CHECKED_IN) hoặc đang khám (DANG_KHAM) —
    không tiếp nhận / gán thêm lịch khác.
    """
    qs = LichHen.objects.filter(
        benh_nhan=benh_nhan,
        trang_thai__in=TRANG_THAI_DANG_CHO_KHAM,
    )
    if exclude_lich_id:
        qs = qs.exclude(pk=exclude_lich_id)
    existing = qs.select_related('bac_si__nguoi_dung').order_by('-ngay_cap_nhat').first()
    if not existing:
        return None
    stt = existing.stt_trong_ngay if existing.stt_trong_ngay is not None else '—'
    tt = existing.get_trang_thai_display()
    ma = existing.ma_lich_hen or str(existing.pk)
    extra = ''
    if existing.bac_si_id and existing.bac_si.nguoi_dung:
        extra = f', BS {existing.bac_si.nguoi_dung.ho_ten}'
    return (
        f'Bệnh nhân đang có lịch {ma} (STT {stt}, {tt}{extra}). '
        f'Hoàn tất lượt khám hiện tại trước khi tiếp nhận hoặc gán lịch mới.'
    )


def _loi_bac_si_khong_co_ca(bac_si, ngay_gio_hen):
    """Trả về chuỗi lỗi nếu BS không đăng ký ca; None nếu hợp lệ."""
    local = timezone.localtime(ngay_gio_hen) if timezone.is_aware(ngay_gio_hen) else ngay_gio_hen
    ngay = local.date() if hasattr(local, 'date') else ngay_gio_hen
    ca = phan_ca_tu_thoi_diem(ngay_gio_hen)
    if bac_si.pk not in bac_si_id_co_ca_trong_ngay(ngay, ca):
        return (
            f'Bác sĩ {bac_si.nguoi_dung.ho_ten} chưa đăng ký ca '
            f'{CA_LABEL.get(ca, ca)} ngày {ngay.strftime("%d/%m/%Y")}.'
        )
    return None


def _bac_si_it_lich_nhat(ngay_date, ca_lam=None):
    """Chọn BS đang làm việc, có đăng ký ca, ít lịch trong ngày nhất."""
    if ca_lam is None:
        ca_lam = phan_ca_tu_thoi_diem(timezone.now())
    ids_ca = bac_si_id_co_ca_trong_ngay(ngay_date, ca_lam)
    if not ids_ca:
        return None
    trang_dem = [
        'CHO_XAC_NHAN', 'DA_DAT', 'DA_XAC_NHAN', 'CHECKED_IN', 'DANG_KHAM',
    ]
    start, end = _khoang_ngay_trong_tz(ngay_date)
    return (
        BacSi.objects.filter(is_working=True, pk__in=ids_ca)
        .select_related('nguoi_dung')
        .annotate(
            so_hen=Count(
                'lich_hen_schedule',
                filter=Q(
                    lich_hen_schedule__ngay_gio_hen__gte=start,
                    lich_hen_schedule__ngay_gio_hen__lt=end,
                    lich_hen_schedule__trang_thai__in=trang_dem,
                ),
            )
        )
        .order_by('so_hen', 'ma_bac_si')
        .first()
    )


def _tao_ma_lich_hen():
    import datetime

    today = datetime.datetime.now()
    prefix = f"LH{today.strftime('%y%m')}"
    last_lich = LichHen.objects.filter(ma_lich_hen__startswith=prefix).aggregate(
        m=Max('ma_lich_hen')
    )['m']
    if last_lich:
        new_number = int(last_lich[-4:]) + 1
    else:
        new_number = 1
    return f"{prefix}{new_number:04d}"

logger = logging.getLogger(__name__)


class LichHenPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 200


# ==================== VIEWSETS CHO LỊCH HẸN ====================

class LichHenViewSet(viewsets.ModelViewSet):
    """API cho lịch hẹn"""
    queryset = LichHen.objects.select_related(
        'benh_nhan__nguoi_dung', 'bac_si__nguoi_dung', 'nhan_vien_tao__nguoi_dung'
    ).prefetch_related(
        'lich_su', 'nhac_nho'
    ).all()
    serializer_class = LichHenSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = LichHenPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['loai_lich', 'trang_thai', 'bac_si', 'benh_nhan', 'da_thanh_toan']
    search_fields = [
        'ma_lich_hen', 'benh_nhan__nguoi_dung__ho_ten', 
        'benh_nhan__ma_benh_nhan', 'ghi_chu'
    ]
    ordering_fields = ['ngay_gio_hen', 'ngay_tao', 'trang_thai', 'stt_trong_ngay']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return LichHenDetailSerializer
        elif self.action == 'create':
            return LichHenCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return LichHenUpdateSerializer
        return LichHenSerializer

    def list(self, request, *args, **kwargs):
        huy_lich_hen_qua_ngay(limit=200)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        # Filter theo ngày
        tu_ngay = self.request.query_params.get('tu_ngay')
        den_ngay = self.request.query_params.get('den_ngay')
        if tu_ngay:
            td = parse_date(tu_ngay) if isinstance(tu_ngay, str) else tu_ngay
            if td:
                sta, _ = _khoang_ngay_trong_tz(td)
                queryset = queryset.filter(ngay_gio_hen__gte=sta)
        if den_ngay:
            dd = parse_date(den_ngay) if isinstance(den_ngay, str) else den_ngay
            if dd:
                _, en = _khoang_ngay_trong_tz(dd)
                queryset = queryset.filter(ngay_gio_hen__lt=en)

        # Filter theo hôm nay (giờ hẹn hoặc giờ check-in)
        hom_nay = self.request.query_params.get('hom_nay')
        if hom_nay == 'true':
            queryset = _filter_lich_trong_ngay(queryset, _ngay_local_hien_tai())

        cho_kham = self.request.query_params.get('cho_kham')
        if cho_kham == 'true':
            queryset = queryset.filter(
                trang_thai__in=['CHECKED_IN', 'DANG_KHAM', 'DA_XAC_NHAN', 'DA_DAT']
            )

        # Filter theo tuần này
        tuan_nay = self.request.query_params.get('tuan_nay')
        if tuan_nay == 'true':
            d0 = _ngay_local_hien_tai()
            start_week = d0 - timedelta(days=d0.weekday())
            w0, w1 = _khoang_ngay_trong_tz(start_week)
            _, w_end = _khoang_ngay_trong_tz(start_week + timedelta(days=7))
            queryset = queryset.filter(ngay_gio_hen__gte=w0, ngay_gio_hen__lt=w_end)

        # Filter theo quyền user
        if user.vai_tro == 'BENH_NHAN' and hasattr(user, 'benh_nhan'):
            queryset = queryset.filter(benh_nhan=user.benh_nhan)
        elif user.vai_tro == 'BAC_SI' and hasattr(user, 'bac_si'):
            bs = user.bac_si
            queryset = queryset.filter(
                Q(bac_si=bs)
                | Q(lich_kham__bac_si=bs)
                | Q(lich_kham__ho_so_benh_an__bac_si=bs)
                | Q(bac_si__isnull=True, trang_thai='CHECKED_IN')
            ).distinct()
        # NHAN_VIEN / ADMIN: xem toàn bộ (không lọc)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if user.vai_tro == 'BENH_NHAN' and hasattr(user, 'benh_nhan'):
            lich_hen = serializer.save(benh_nhan=user.benh_nhan, nhan_vien_tao=None)
        elif hasattr(user, 'nhan_vien'):
            lich_hen = serializer.save(nhan_vien_tao=user.nhan_vien)
        else:
            lich_hen = serializer.save(nhan_vien_tao=None)

        dong_bo_nhac_cho_lich_hen(lich_hen)

    def perform_update(self, serializer):
        lich_hen = serializer.save()
        dong_bo_nhac_cho_lich_hen(lich_hen)

    @action(detail=True, methods=['post'], url_path='xac_nhan')
    def xac_nhan(self, request, pk=None):
        """Xác nhận lịch hẹn"""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN']:
            return Response({'error': 'Bạn không có quyền xác nhận lịch hẹn'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()
        
        if lich_hen.trang_thai != 'DA_DAT':
            return Response(
                {'error': f'Không thể xác nhận lịch hẹn ở trạng thái {lich_hen.get_trang_thai_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        lich_hen.xac_nhan(request.user)
        
        # Gửi thông báo cho bệnh nhân
        self._tao_thong_bao(
            lich_hen.benh_nhan.nguoi_dung,
            'Lịch hẹn đã được xác nhận',
            f'Lịch {lich_hen.get_loai_lich_display()} của bạn vào {lich_hen.ngay_gio_hen.strftime("%H:%M %d/%m/%Y")} đã được xác nhận.'
        )
        
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'], url_path='bat_dau')
    def bat_dau(self, request, pk=None):
        """Bắt đầu khám/tiêm"""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN']:
            return Response({'error': 'Bạn không có quyền bắt đầu lịch hẹn'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()
        
        if lich_hen.trang_thai not in ['DA_XAC_NHAN', 'DA_DAT', 'CHECKED_IN']:
            return Response(
                {'error': 'Không thể bắt đầu lịch hẹn ở trạng thái này'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        lich_hen.bat_dau(request.user)
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'], url_path='hoan_thanh')
    def hoan_thanh(self, request, pk=None):
        """Hoàn thành lịch hẹn"""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN']:
            return Response({'error': 'Bạn không có quyền hoàn thành lịch hẹn'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()

        # Đã check-in nhưng chưa "bắt đầu khám" (ví dụ mở hồ sơ từ tìm kiếm): tự chuyển DANG_KHAM rồi mới hoàn thành.
        if lich_hen.trang_thai == 'CHECKED_IN':
            lich_hen.bat_dau(request.user)
        elif lich_hen.trang_thai != 'DANG_KHAM':
            return Response(
                {'error': 'Chỉ có thể hoàn thành lịch hẹn đang khám hoặc đã check-in chờ khám'},
                status=status.HTTP_400_BAD_REQUEST
            )

        lich_hen.hoan_thanh(request.user)
        lich_hen.refresh_from_db()
        dong_bo_nhac_cho_lich_hen(lich_hen)
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'])
    def huy(self, request, pk=None):
        """Hủy lịch hẹn"""
        lich_hen = self.get_object()
        if request.user.vai_tro == 'BENH_NHAN':
            if not hasattr(request.user, 'benh_nhan') or lich_hen.benh_nhan_id != request.user.benh_nhan.pk:
                return Response({'error': 'Bạn không có quyền hủy lịch hẹn này'}, status=status.HTTP_403_FORBIDDEN)
        serializer = LichHenActionSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        if lich_hen.trang_thai in ['HOAN_THANH', 'DA_HUY']:
            return Response(
                {'error': 'Không thể hủy lịch hẹn đã hoàn thành hoặc đã hủy'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        lich_hen.huy(
            ly_do=serializer.validated_data.get('ly_do', ''),
            nguoi_huy=request.user
        )
        lich_hen.refresh_from_db()
        dong_bo_nhac_cho_lich_hen(lich_hen)

        # Gửi thông báo
        self._tao_thong_bao(
            lich_hen.benh_nhan.nguoi_dung,
            'Lịch hẹn đã bị hủy',
            f'Lịch {lich_hen.get_loai_lich_display()} của bạn vào {lich_hen.ngay_gio_hen.strftime("%H:%M %d/%m/%Y")} đã bị hủy. Lý do: {serializer.validated_data.get("ly_do", "Không có lý do")}'
        )
        
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'], url_path='khach_den')
    def khach_den(self, request, pk=None):
        """Ghi nhận bệnh nhân đến"""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN']:
            return Response({'error': 'Bạn không có quyền cập nhật trạng thái đến'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()
        lich_hen.khach_den()
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'], url_path='check_in')
    def check_in(self, request, pk=None):
        """Check-in bệnh nhân có lịch trước: ghi nhận giờ đến → trạng thái CHECKED_IN."""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN'] and not request.user.is_superuser:
            return Response({'error': 'Không có quyền check-in'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()
        loi_cho = _loi_benh_nhan_dang_cho_kham(lich_hen.benh_nhan, exclude_lich_id=lich_hen.pk)
        if loi_cho:
            return Response({'error': loi_cho}, status=status.HTTP_400_BAD_REQUEST)
        if lich_hen.trang_thai in ('HOAN_THANH', 'DA_HUY', 'VANG_MAT', 'DANG_KHAM', 'CHECKED_IN'):
            return Response(
                {'error': f'Lịch đang ở trạng thái {lich_hen.trang_thai}, không thể check-in'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tt_cu = lich_hen.trang_thai
        if tt_cu not in ('CHO_XAC_NHAN', 'DA_DAT', 'DA_XAC_NHAN', 'QUA_HAN'):
            return Response(
                {'error': f'Không check-in được từ trạng thái {tt_cu}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        lich_hen.thoi_gian_den = now
        lich_hen.trang_thai = 'CHECKED_IN'
        if lich_hen.stt_trong_ngay is None:
            lich_hen.stt_trong_ngay = _stt_ke_tiep_trong_ngay(timezone.localdate(now))
        lich_hen.save(update_fields=['thoi_gian_den', 'trang_thai', 'stt_trong_ngay', 'ngay_cap_nhat'])
        LichSuLichHen.objects.create(
            lich_hen=lich_hen,
            trang_thai_cu=tt_cu,
            trang_thai_moi='CHECKED_IN',
            nguoi_thay_doi=request.user,
        )
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'], url_path='mo_ho_so_benh_an')
    def mo_ho_so_benh_an(self, request, pk=None):
        """Bác sĩ mở hồ sơ từ lịch đã check-in: tạo/khôi phục HoSoBenhAn, gắn LichKham, bắt đầu khám nếu cần."""
        if not hasattr(request.user, 'bac_si'):
            return Response({'error': 'Chỉ bác sĩ'}, status=status.HTTP_403_FORBIDDEN)
        from benhan.models import HoSoBenhAn
        from benhan.serializers import HoSoBenhAnSerializer

        lich_hen = self.get_object()
        if lich_hen.trang_thai not in ('CHECKED_IN', 'DANG_KHAM'):
            return Response(
                {'error': f'Lịch phải ở trạng thái đã check-in hoặc đang khám (hiện: {lich_hen.trang_thai})'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        my_bs_pk = request.user.bac_si.pk
        if lich_hen.bac_si_id and lich_hen.bac_si_id != my_bs_pk:
            return Response({'error': 'Lịch không thuộc bác sĩ đang đăng nhập'}, status=status.HTTP_403_FORBIDDEN)
        if lich_hen.loai_lich not in ('KHAM_BENH', 'TAI_KHAM', 'TU_VAN', 'TIEM_CHUNG'):
            return Response(
                {'error': 'Chỉ áp dụng lịch khám bệnh, tái khám, tư vấn hoặc tiêm chủng'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not lich_hen.bac_si_id:
            lich_hen.bac_si = request.user.bac_si
            lich_hen.save(update_fields=['bac_si', 'ngay_cap_nhat'])

        ly_do = (lich_hen.ghi_chu or '').strip() or f'Khám theo lịch {lich_hen.ma_lich_hen or lich_hen.id}'

        lk = LichKham.objects.filter(lich_hen=lich_hen).first()

        if lk and lk.ho_so_benh_an_id:
            ho_so = lk.ho_so_benh_an
            if lich_hen.trang_thai == 'CHECKED_IN':
                lich_hen.bat_dau(request.user)
            lich_hen.refresh_from_db()
            return Response({
                'ho_so': HoSoBenhAnSerializer(ho_so).data,
                'lich_hen': LichHenDetailSerializer(lich_hen).data,
                'tao_moi': False,
            })

        with transaction.atomic():
            ho_so = HoSoBenhAn.objects.create(
                benh_nhan=lich_hen.benh_nhan,
                bac_si=request.user.bac_si,
                ly_do_kham=ly_do,
                trieu_chung='',
                ket_qua_kham_lam_sang='',
            )
            if lk:
                lk.ho_so_benh_an = ho_so
                lk.ly_do_kham = ly_do
                lk.bac_si = request.user.bac_si
                lk.save(update_fields=['ho_so_benh_an', 'ly_do_kham', 'bac_si'])
            else:
                LichKham.objects.create(
                    lich_hen=lich_hen,
                    bac_si=request.user.bac_si,
                    ly_do_kham=ly_do,
                    trieu_chung='',
                    ho_so_benh_an=ho_so,
                )
            if lich_hen.trang_thai == 'CHECKED_IN':
                lich_hen.bat_dau(request.user)
        lich_hen.refresh_from_db()
        return Response({
            'ho_so': HoSoBenhAnSerializer(ho_so).data,
            'lich_hen': LichHenDetailSerializer(lich_hen).data,
            'tao_moi': True,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='phan_cong_bac_si')
    def phan_cong_bac_si(self, request, pk=None):
        """Điều phối: gán / đổi bác sĩ cho lịch (tránh trùng giờ)."""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN'] and not request.user.is_superuser:
            return Response({'error': 'Không có quyền phân công'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()
        loi_cho = _loi_benh_nhan_dang_cho_kham(lich_hen.benh_nhan, exclude_lich_id=lich_hen.pk)
        if loi_cho:
            return Response({'error': loi_cho}, status=status.HTTP_400_BAD_REQUEST)
        ser = PhanCongBacSiSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        bs_id = ser.validated_data['bac_si']
        bac_si = get_object_or_404(BacSi.objects.filter(is_working=True), pk=bs_id)
        loi_ca = _loi_bac_si_khong_co_ca(bac_si, lich_hen.ngay_gio_hen)
        if loi_ca:
            return Response({'error': loi_ca}, status=status.HTTP_400_BAD_REQUEST)

        ngay_gio_hen = lich_hen.ngay_gio_hen
        ngay_gio_ket_thuc = lich_hen.ngay_gio_ket_thuc or (ngay_gio_hen + timedelta(minutes=30))
        # Không chặn theo CHECKED_IN (hàng chờ theo STT, không theo slot cố định)
        trung = LichHen.objects.filter(
            bac_si=bac_si,
            ngay_gio_hen__lt=ngay_gio_ket_thuc,
            ngay_gio_ket_thuc__gt=ngay_gio_hen,
            trang_thai__in=['DA_DAT', 'DA_XAC_NHAN', 'DANG_KHAM'],
        ).exclude(pk=lich_hen.pk)
        if trung.exists():
            return Response(
                {'error': 'Bác sĩ đã có lịch trùng khung giờ này'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lich_hen.bac_si = bac_si
        lich_hen.save(update_fields=['bac_si', 'ngay_cap_nhat'])
        return Response(LichHenDetailSerializer(lich_hen).data)

    @action(detail=True, methods=['post'], url_path='phan_cong_phong')
    def phan_cong_phong(self, request, pk=None):
        """Gán / cập nhật phòng khám cho lịch (thường dùng sau check-in)."""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN'] and not request.user.is_superuser:
            return Response({'error': 'Không có quyền phân công phòng'}, status=status.HTTP_403_FORBIDDEN)
        lich_hen = self.get_object()
        loi_cho = _loi_benh_nhan_dang_cho_kham(lich_hen.benh_nhan, exclude_lich_id=lich_hen.pk)
        if loi_cho:
            return Response({'error': loi_cho}, status=status.HTTP_400_BAD_REQUEST)
        ser = PhanCongPhongSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        lich_hen.ma_phong = ser.validated_data['ma_phong'].strip()
        lich_hen.ten_phong = (ser.validated_data.get('ten_phong') or '').strip()
        lich_hen.save(update_fields=['ma_phong', 'ten_phong', 'ngay_cap_nhat'])
        return Response(LichHenDetailSerializer(lich_hen).data)

    def _noi_dung_nhac_letan(self, lich_hen, loai, custom=''):
        """Soạn tiêu đề + nội dung thông báo nhắc BN theo mẫu lễ tân."""
        bn_ten = lich_hen.benh_nhan.nguoi_dung.ho_ten
        ma = lich_hen.ma_lich_hen or str(lich_hen.pk)[:8]
        stt = lich_hen.stt_trong_ngay
        phong = (lich_hen.ten_phong or lich_hen.ma_phong or '').strip()
        bs = ''
        if lich_hen.bac_si_id and getattr(lich_hen.bac_si, 'nguoi_dung', None):
            bs = lich_hen.bac_si.nguoi_dung.ho_ten
        gio = ''
        if lich_hen.ngay_gio_hen:
            gio = timezone.localtime(lich_hen.ngay_gio_hen).strftime('%H:%M %d/%m/%Y')

        if loai == 'NHAC_CO_HEN':
            tieu_de = 'Nhắc lịch hẹn tại phòng khám'
            noi_dung = (
                f'Kính gửi {bn_ten}, bạn có lịch {lich_hen.get_loai_lich_display()} '
                f'lúc {gio} (mã {ma}). Vui lòng đến quầy lễ tân để check-in.'
            )
        elif loai == 'SAP_DEN_LUOT':
            tieu_de = 'Sắp đến lượt khám'
            stt_txt = f' STT {stt}.' if stt is not None else ''
            noi_dung = f'Kính gửi {bn_ten},{stt_txt} bạn sắp đến lượt. Vui lòng chờ tại khu vực chờ.'
        elif loai == 'MOI_VAO_PHONG':
            tieu_de = 'Mời vào phòng khám'
            phong_txt = f' {phong}' if phong else ''
            noi_dung = f'Kính gửi {bn_ten}, mời bạn vào phòng{phong_txt}.'
            if bs:
                noi_dung += f' Bác sĩ: {bs}.'
        elif loai == 'CHO_DOI':
            tieu_de = 'Nhắc chờ khám'
            noi_dung = (
                f'Kính gửi {bn_ten}, lịch {ma} đang trong hàng chờ. '
                f'Vui lòng chờ đến khi được gọi.'
            )
        else:
            tieu_de = 'Thông báo từ quầy lễ tân'
            noi_dung = custom or f'Kính gửi {bn_ten}, vui lòng liên hệ quầy lễ tân (lịch {ma}).'

        if custom and loai != 'TU_CHON':
            noi_dung = f'{noi_dung} Ghi chú: {custom}'
        return tieu_de, noi_dung

    @action(detail=True, methods=['post'], url_path='gui_nhac_benh_nhan')
    def gui_nhac_benh_nhan(self, request, pk=None):
        """Gửi thông báo in-app nhắc bệnh nhân (lễ tân tại quầy)."""
        if request.user.vai_tro not in ['NHAN_VIEN', 'BAC_SI', 'ADMIN'] and not request.user.is_superuser:
            return Response({'error': 'Không có quyền gửi nhắc'}, status=status.HTTP_403_FORBIDDEN)

        lich_hen = self.get_object()
        ser = GuiNhacBenhNhanSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        loai = ser.validated_data.get('loai') or 'TU_CHON'
        custom = (ser.validated_data.get('noi_dung') or '').strip()
        if loai == 'TU_CHON' and not custom:
            return Response(
                {'noi_dung': 'Vui lòng nhập nội dung khi chọn tùy chỉnh'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tieu_de, noi_dung = self._noi_dung_nhac_letan(lich_hen, loai, custom)
        nguoi_nhan = lich_hen.benh_nhan.nguoi_dung
        now = timezone.now()

        self._tao_thong_bao(
            nguoi_nhan,
            tieu_de,
            noi_dung,
            du_lieu_lien_quan={
                'lich_hen_id': str(lich_hen.pk),
                'ma_lich_hen': lich_hen.ma_lich_hen,
                'loai_nhac': loai,
                'nguoi_gui_id': str(request.user.pk),
                'nguoi_gui_ten': request.user.ho_ten,
            },
        )
        NhacNhoLichHen.objects.create(
            lich_hen=lich_hen,
            loai_nhac='PUSH',
            thoi_gian_nhac=now,
            noi_dung=noi_dung,
            trang_thai='DA_GUI',
            sent_at=now,
            chi_tiet_phan_hoi={
                'loai': loai,
                'gui_boi': str(request.user.pk),
                'tieu_de': tieu_de,
            },
        )
        lich_hen.da_nhac_nho = True
        lich_hen.ngay_nhac_nho = now
        lich_hen.save(update_fields=['da_nhac_nho', 'ngay_nhac_nho', 'ngay_cap_nhat'])

        return Response({
            'success': True,
            'message': 'Đã gửi thông báo cho bệnh nhân',
            'tieu_de': tieu_de,
            'noi_dung': noi_dung,
        })

    @action(detail=False, methods=['post'], url_path='walk_in')
    def walk_in(self, request):
        """Walk-in: tạo lịch mới CHECKED_IN, STT trong ngày; BS theo tải nhẹ nhất nếu bật tự động."""
        user = request.user
        if user.vai_tro not in ['NHAN_VIEN', 'ADMIN'] and not user.is_superuser:
            return Response({'error': 'Chỉ nhân viên / admin được tạo walk-in'}, status=status.HTTP_403_FORBIDDEN)
        ser = WalkInLichHenSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        bn = get_object_or_404(BenhNhan.objects.select_related('nguoi_dung'), pk=ser.validated_data['benh_nhan'])
        loi_cho = _loi_benh_nhan_dang_cho_kham(bn)
        if loi_cho:
            return Response({'error': loi_cho}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        ngay = timezone.localdate(now)
        tu_dong = ser.validated_data.get('tu_dong_chon_bac_si', True)
        ca_lam = phan_ca_tu_thoi_diem(now)
        bac_si = None
        bs_id = ser.validated_data.get('bac_si')
        if bs_id:
            bac_si = get_object_or_404(BacSi.objects.filter(is_working=True), pk=bs_id)
            loi_ca = _loi_bac_si_khong_co_ca(bac_si, now)
            if loi_ca:
                return Response({'error': loi_ca}, status=status.HTTP_400_BAD_REQUEST)
        elif tu_dong:
            bac_si = _bac_si_it_lich_nhat(ngay, ca_lam=ca_lam)
            if bac_si is None:
                return Response(
                    {
                        'error': (
                            f'Không có bác sĩ đăng ký ca '
                            f'{CA_LABEL.get(ca_lam, ca_lam)} ngày {ngay.strftime("%d/%m/%Y")}.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        stt = _stt_ke_tiep_trong_ngay(ngay)
        ma_lich = _tao_ma_lich_hen()
        nhan_vien_tao = getattr(user, 'nhan_vien', None) if hasattr(user, 'nhan_vien') else None
        loai_lich = ser.validated_data.get('loai_lich') or 'KHAM_BENH'
        vaccine = ser.validated_data.get('vaccine')
        ghi_chu = (ser.validated_data.get('ghi_chu') or '').strip()

        with transaction.atomic():
            lich_hen = LichHen.objects.create(
                ma_lich_hen=ma_lich,
                benh_nhan=bn,
                bac_si=bac_si,
                nhan_vien_tao=nhan_vien_tao,
                loai_lich=loai_lich,
                ngay_gio_hen=now,
                ngay_gio_ket_thuc=now + timedelta(minutes=30),
                trang_thai='CHECKED_IN',
                thoi_gian_den=now,
                stt_trong_ngay=stt,
                ma_phong=(ser.validated_data.get('ma_phong') or '').strip(),
                ten_phong=(ser.validated_data.get('ten_phong') or '').strip(),
                ghi_chu=ghi_chu,
            )
            if loai_lich == 'TIEM_CHUNG' and vaccine:
                LichTiem.objects.create(
                    lich_hen=lich_hen,
                    vaccine=vaccine,
                    so_mui=1,
                    ghi_chu=ghi_chu or 'Tiếp nhận walk-in tại quầy — tiêm chủng',
                )
            LichSuLichHen.objects.create(
                lich_hen=lich_hen,
                trang_thai_cu='CHO_XAC_NHAN',
                trang_thai_moi='CHECKED_IN',
                ghi_chu='Walk-in tại quầy',
                nguoi_thay_doi=user,
            )
        return Response(LichHenDetailSerializer(lich_hen).data, status=status.HTTP_201_CREATED)

    def _qs_letan_hom_nay(self, request, ngay):
        """Queryset lịch trong ngày (giờ hẹn hoặc giờ check-in)."""
        qs = LichHen.objects.select_related(
            'benh_nhan__nguoi_dung', 'bac_si__nguoi_dung', 'nhan_vien_tao__nguoi_dung'
        )
        qs = _filter_lich_trong_ngay(qs, ngay)
        user = request.user
        if user.vai_tro == 'BENH_NHAN' and hasattr(user, 'benh_nhan'):
            qs = qs.filter(benh_nhan=user.benh_nhan)
        elif user.vai_tro == 'BAC_SI' and hasattr(user, 'bac_si'):
            bs = user.bac_si
            qs = qs.filter(
                Q(bac_si=bs)
                | Q(lich_kham__bac_si=bs)
                | Q(lich_kham__ho_so_benh_an__bac_si=bs)
                | Q(bac_si__isnull=True, trang_thai='CHECKED_IN')
            ).distinct()
        return qs

    @action(detail=False, methods=['get'], url_path='hom_nay_letan')
    def hom_nay_letan(self, request):
        """Danh sách lịch trong ngày để lễ tân thao tác nhanh (check-in, xem STT, phòng)."""
        huy_lich_hen_qua_ngay(limit=200)
        user = request.user
        if user.vai_tro not in ['NHAN_VIEN', 'ADMIN', 'BAC_SI'] and not user.is_superuser:
            return Response({'error': 'Không có quyền xem'}, status=status.HTTP_403_FORBIDDEN)
        ngay_raw = request.query_params.get('ngay') or _ngay_local_hien_tai().isoformat()
        ngay = parse_date(ngay_raw) if ngay_raw else _ngay_local_hien_tai()
        if not ngay:
            ngay = _ngay_local_hien_tai()
        qs = self._qs_letan_hom_nay(request, ngay)
        if request.query_params.get('chua_check_in') == 'true':
            qs = qs.filter(trang_thai__in=['CHO_XAC_NHAN', 'DA_DAT', 'DA_XAC_NHAN', 'QUA_HAN'])
        qs = qs.order_by('ngay_gio_hen', 'ma_lich_hen')
        page = self.paginate_queryset(qs)
        ser = LichHenSerializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response({'ngay': ngay.isoformat(), 'results': ser.data})

    @action(detail=False, methods=['get'], url_path='dieu_phoi_hom_nay')
    def dieu_phoi_hom_nay(self, request):
        """BN đã CHECKED_IN trong ngày + phòng (điều phối)."""
        user = request.user
        if user.vai_tro not in ['NHAN_VIEN', 'ADMIN', 'BAC_SI'] and not user.is_superuser:
            return Response({'error': 'Không có quyền xem'}, status=status.HTTP_403_FORBIDDEN)
        ngay_raw = request.query_params.get('ngay') or _ngay_local_hien_tai().isoformat()
        ngay = parse_date(ngay_raw) if ngay_raw else _ngay_local_hien_tai()
        if not ngay:
            ngay = _ngay_local_hien_tai()
        qs = self._qs_letan_hom_nay(request, ngay)
        if user.vai_tro == 'BAC_SI' and hasattr(user, 'bac_si'):
            qs = qs.filter(trang_thai__in=['CHECKED_IN', 'DANG_KHAM'])
        else:
            qs = qs.filter(trang_thai='CHECKED_IN')
        qs = qs.order_by('stt_trong_ngay', 'ngay_gio_hen', 'ma_lich_hen')
        page = self.paginate_queryset(qs)
        ser = LichHenSerializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response({'ngay': ngay.isoformat(), 'results': ser.data})

    @action(detail=False, methods=['get'], url_path='bac_si_xep_hang')
    def bac_si_xep_hang(self, request):
        """Danh sách bác sĩ theo số lượng lịch trong ngày (ít → nhiều) để điều phối."""
        user = request.user
        if user.vai_tro not in ['NHAN_VIEN', 'ADMIN', 'BAC_SI'] and not user.is_superuser:
            return Response({'error': 'Không có quyền xem'}, status=status.HTTP_403_FORBIDDEN)
        ngay_raw = request.query_params.get('ngay') or _ngay_local_hien_tai().isoformat()
        ngay_parsed = parse_date(ngay_raw) if ngay_raw else _ngay_local_hien_tai()
        if not ngay_parsed:
            ngay_parsed = _ngay_local_hien_tai()

        d0, d1 = _khoang_ngay_trong_tz(ngay_parsed)
        ca_raw = (request.query_params.get('ca_lam') or '').strip().upper()
        ca_lam = ca_raw if ca_raw in ('SANG', 'CHIEU', 'TOI') else phan_ca_tu_thoi_diem(timezone.now())
        try:
            ids_ca = bac_si_id_co_ca_trong_ngay(ngay_parsed, ca_lam)
            ca_map = cac_ca_bac_si_trong_ngay(ngay_parsed)
        except Exception as exc:
            logger.exception('bac_si_xep_hang: lỗi đọc doctor_schedule')
            return Response(
                {
                    'error': (
                        'Không đọc được lịch ca bác sĩ. Chạy migration nguoidung 0003 '
                        '(collation doctor_schedule) rồi khởi động lại server.'
                    ),
                    'detail': str(exc),
                    'ngay': ngay_parsed.isoformat(),
                    'ca_lam': ca_lam,
                    'items': [],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not ids_ca:
            from nguoidung.models import DoctorSchedule
            tong_ngay = DoctorSchedule.objects.filter(ngay_lam=ngay_parsed).count()
            return Response({
                'ngay': ngay_parsed.isoformat(),
                'ca_lam': ca_lam,
                'ca_lam_display': CA_LABEL.get(ca_lam, ca_lam),
                'items': [],
                'goi_y': (
                    f'Không có bác sĩ đăng ký {CA_LABEL.get(ca_lam, ca_lam)} '
                    f'ngày {ngay_parsed.strftime("%d/%m/%Y")}. '
                    'Bác sĩ vào menu Đăng ký ca làm, chọn đúng ngày và ca.'
                ),
                'tong_dang_ky_trong_ngay': tong_ngay,
            })

        qs = (
            BacSi.objects.filter(is_working=True, pk__in=ids_ca)
            .select_related('nguoi_dung')
            .annotate(
                so_benh_nhan_trong_ngay=Count(
                    'lich_hen_schedule',
                    filter=Q(
                        lich_hen_schedule__ngay_gio_hen__gte=d0,
                        lich_hen_schedule__ngay_gio_hen__lt=d1,
                        lich_hen_schedule__trang_thai__in=[
                            'CHO_XAC_NHAN', 'DA_DAT', 'DA_XAC_NHAN', 'CHECKED_IN', 'DANG_KHAM',
                        ],
                    ),
                )
            )
            .order_by('so_benh_nhan_trong_ngay', 'ma_bac_si')
        )
        data = [
            {
                'id': str(b.pk),
                'ma_bac_si': b.ma_bac_si,
                'ho_ten': b.nguoi_dung.ho_ten,
                'chuyen_khoa': b.chuyen_khoa,
                'so_benh_nhan_trong_ngay': b.so_benh_nhan_trong_ngay,
                'cac_ca_trong_ngay': ca_map.get(b.pk, []),
                'ca_lam_loc': ca_lam,
                'ca_lam_display': CA_LABEL.get(ca_lam, ca_lam),
            }
            for b in qs
        ]
        return Response({
            'ngay': ngay_parsed.isoformat(),
            'ca_lam': ca_lam,
            'ca_lam_display': CA_LABEL.get(ca_lam, ca_lam),
            'items': data,
        })

    @action(detail=True, methods=['get'], url_path='lich_su')
    def lich_su(self, request, pk=None):
        """Xem lịch sử thay đổi"""
        lich_hen = self.get_object()
        lich_su = lich_hen.lich_su.all()
        serializer = LichSuLichHenSerializer(lich_su, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='thong_ke')
    def thong_ke(self, request):
        """Thống kê lịch hẹn"""
        queryset = self.get_queryset()
        
        # Thống kê theo trạng thái
        theo_trang_thai = queryset.values('trang_thai').annotate(
            so_luong=Count('id')
        )
        
        # Thống kê theo loại
        theo_loai = queryset.values('loai_lich').annotate(
            so_luong=Count('id')
        )
        
        # Thống kê theo bác sĩ
        theo_bac_si = queryset.values(
            'bac_si__ma_bac_si', 'bac_si__nguoi_dung__ho_ten'
        ).annotate(
            so_luong=Count('id')
        ).order_by('-so_luong')[:10]
        
        # Lịch hẹn hôm nay
        n0 = _ngay_local_hien_tai()
        h_start, h_end = _khoang_ngay_trong_tz(n0)
        hom_nay = queryset.filter(ngay_gio_hen__gte=h_start, ngay_gio_hen__lt=h_end).count()
        
        # Lịch hẹn sắp tới (từ hôm nay đến hết ngày thứ 7)
        _, week_until = _khoang_ngay_trong_tz(n0 + timedelta(days=7))
        sap_toi = queryset.filter(
            ngay_gio_hen__gte=h_start,
            ngay_gio_hen__lt=week_until,
            trang_thai__in=['DA_DAT', 'DA_XAC_NHAN']
        ).count()
        
        return Response({
            'tong_so': queryset.count(),
            'theo_trang_thai': theo_trang_thai,
            'theo_loai': theo_loai,
            'theo_bac_si': theo_bac_si,
            'hom_nay': hom_nay,
            'sap_toi': sap_toi
        })

    @action(detail=False, methods=['get'], url_path='bao_cao')
    def bao_cao(self, request):
        """Báo cáo lịch hẹn theo thời gian"""
        tu_ngay = request.query_params.get('tu_ngay')
        den_ngay = request.query_params.get('den_ngay')
        
        if not tu_ngay or not den_ngay:
            return Response(
                {'error': 'Vui lòng cung cấp tu_ngay và den_ngay'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tu_d = parse_date(tu_ngay)
        den_d = parse_date(den_ngay)
        if not tu_d or not den_d:
            return Response(
                {'error': 'tu_ngay / den_ngay không hợp lệ'},
                status=status.HTTP_400_BAD_REQUEST
            )
        t_start, _ = _khoang_ngay_trong_tz(tu_d)
        _, den_end = _khoang_ngay_trong_tz(den_d)
        queryset = self.get_queryset().filter(
            ngay_gio_hen__gte=t_start, ngay_gio_hen__lt=den_end
        )
        
        tong = queryset.count()
        hoan_thanh = queryset.filter(trang_thai='HOAN_THANH').count()
        huy = queryset.filter(trang_thai='DA_HUY').count()
        vang_mat = queryset.filter(trang_thai='VANG_MAT').count()
        
        # Thời gian chờ trung bình
        thoi_gian_cho = []
        for lh in queryset.filter(thoi_gian_den__isnull=False, thoi_gian_bat_dau__isnull=False):
            tg = (lh.thoi_gian_bat_dau - lh.thoi_gian_den).total_seconds() / 60
            if tg > 0:
                thoi_gian_cho.append(tg)
        
        tg_trung_binh = sum(thoi_gian_cho) / len(thoi_gian_cho) if thoi_gian_cho else 0
        
        # Đánh giá trung bình
        danh_gia = DanhGiaDichVu.objects.filter(
            lich_hen__in=queryset
        ).aggregate(avg=Avg('diem'))['avg'] or 0
        
        return Response({
            'tu_ngay': tu_ngay,
            'den_ngay': den_ngay,
            'tong_lich_hen': tong,
            'ty_le_hoan_thanh': (hoan_thanh / tong * 100) if tong > 0 else 0,
            'ty_le_huy': (huy / tong * 100) if tong > 0 else 0,
            'ty_le_vang_mat': (vang_mat / tong * 100) if tong > 0 else 0,
            'thoi_gian_cho_trung_binh': round(tg_trung_binh, 2),
            'danh_gia_trung_binh': round(danh_gia, 2)
        })

    def _tao_thong_bao(self, nguoi_nhan, tieu_de, noi_dung, du_lieu_lien_quan=None):
        """Tạo thông báo trong tài khoản (API /thong-bao/)."""
        from nguoidung.models import ThongBao
        ThongBao.objects.create(
            nguoi_nhan=nguoi_nhan,
            loai='LICH_HEN',
            tieu_de=tieu_de,
            noi_dung=noi_dung,
            du_lieu_lien_quan=du_lieu_lien_quan or {},
        )

# ==================== VIEWSETS CHO LỊCH KHÁM ====================

class LichKhamViewSet(viewsets.ModelViewSet):
    """API cho lịch khám"""
    queryset = LichKham.objects.select_related('lich_hen', 'bac_si').all()
    serializer_class = LichKhamSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['bac_si', 'ho_so_benh_an']
    search_fields = ['lich_hen__ma_lich_hen', 'ly_do_kham', 'trieu_chung']

    def get_serializer_class(self):
        if self.action == 'create':
            return LichKhamCreateSerializer
        return LichKhamSerializer

    def perform_create(self, serializer):
        lich_kham = serializer.save()
        
        # Cập nhật trạng thái lịch hẹn
        lich_kham.lich_hen.bat_dau(self.request.user)

# ==================== VIEWSETS CHO LỊCH TIÊM ====================

class LichTiemViewSet(viewsets.ModelViewSet):
    """API cho lịch tiêm"""
    queryset = LichTiem.objects.select_related(
        'lich_hen', 'vaccine', 'nguoi_tiem'
    ).all()
    serializer_class = LichTiemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['vaccine', 'trang_thai_tiem']
    search_fields = ['lich_hen__ma_lich_hen', 'lo_vaccine']

    def get_serializer_class(self):
        if self.action == 'create':
            return LichTiemCreateSerializer
        return LichTiemSerializer

    def perform_create(self, serializer):
        lich_tiem = serializer.save()
        
        # Cập nhật trạng thái lịch hẹn
        lich_tiem.lich_hen.bat_dau(self.request.user)

    @action(detail=True, methods=['post'])
    def thuc_hien_tiem(self, request, pk=None):
        """Thực hiện tiêm"""
        lich_tiem = self.get_object()
        serializer = LichTiemThucHienSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        if lich_tiem.trang_thai_tiem != 'CHUA_TIEM':
            return Response(
                {'error': 'Lịch tiêm này đã được thực hiện'},
                status=status.HTTP_400_BAD_REQUEST
            )

        lo_vaccine = serializer.validated_data['lo_vaccine']
        han_su_dung = serializer.validated_data['han_su_dung']

        from thuoc.stock import VaccineHetTonError, tru_ton_vaccine_mot_lieu

        try:
            with transaction.atomic():
                lot = tru_ton_vaccine_mot_lieu(
                    lich_tiem.vaccine,
                    lo_sx=lo_vaccine,
                    han_su_dung=han_su_dung,
                )
                lich_tiem.thuc_hien_tiem(
                    nguoi_tiem=request.user.bac_si,
                    lo_vaccine=lot['lo_sx'] or lo_vaccine,
                    han_su_dung=lot['han_su_dung'],
                )
                lich_tiem.phan_ung_sau_tiem = serializer.validated_data.get('phan_ung_sau_tiem', '')
                lich_tiem.xu_tri_phan_ung = serializer.validated_data.get('xu_tri_phan_ung', '')
                lich_tiem.save(update_fields=['phan_ung_sau_tiem', 'xu_tri_phan_ung', 'updated_at'])
        except VaccineHetTonError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(LichTiemSerializer(lich_tiem).data)

# ==================== VIEWSETS CHO NHẮC NHỞ ====================

class NhacNhoLichHenViewSet(viewsets.ModelViewSet):
    """API cho nhắc nhở lịch hẹn"""
    queryset = NhacNhoLichHen.objects.select_related('lich_hen').all()
    serializer_class = NhacNhoLichHenSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['loai_nhac', 'trang_thai', 'lich_hen']

    def get_serializer_class(self):
        if self.action == 'create':
            return NhacNhoCreateSerializer
        return NhacNhoLichHenSerializer

    @action(detail=False, methods=['get'])
    def can_gui(self, request):
        """Lấy danh sách nhắc nhở cần gửi"""
        now = timezone.now()
        can_gui = self.get_queryset().filter(
            thoi_gian_nhac__lte=now,
            trang_thai='CHO_GUI'
        )
        serializer = self.get_serializer(can_gui, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def danh_dau_da_gui(self, request, pk=None):
        """Đánh dấu đã gửi nhắc nhở"""
        nhac_nho = self.get_object()
        nhac_nho.trang_thai = 'DA_GUI'
        nhac_nho.sent_at = timezone.now()
        nhac_nho.chi_tiet_phan_hoi = request.data.get('chi_tiet', {})
        nhac_nho.save()
        
        # Cập nhật lịch hẹn
        nhac_nho.lich_hen.da_nhac_nho = True
        nhac_nho.lich_hen.ngay_nhac_nho = timezone.now()
        nhac_nho.lich_hen.save()
        
        return Response(NhacNhoLichHenSerializer(nhac_nho).data)

# ==================== VIEWSETS CHO ĐÁNH GIÁ ====================

class DanhGiaDichVuViewSet(viewsets.ModelViewSet):
    """API cho đánh giá dịch vụ"""
    queryset = DanhGiaDichVu.objects.select_related('lich_hen').all()
    serializer_class = DanhGiaDichVuSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['lich_hen', 'diem']
    ordering_fields = ['created_at']

    def perform_create(self, serializer):
        danh_gia = serializer.save()
        
        # Ghi nhật ký
        logger.info(f"Đánh giá mới cho lịch hẹn {danh_gia.lich_hen.ma_lich_hen}: {danh_gia.diem}/5")

    @action(detail=False, methods=['get'])
    def thong_ke(self, request):
        """Thống kê đánh giá"""
        tu_ngay = request.query_params.get('tu_ngay')
        den_ngay = request.query_params.get('den_ngay')
        
        queryset = self.get_queryset()
        if tu_ngay:
            queryset = queryset.filter(created_at__date__gte=tu_ngay)
        if den_ngay:
            queryset = queryset.filter(created_at__date__lte=den_ngay)
        
        tong = queryset.count()
        if tong == 0:
            return Response({'message': 'Chưa có đánh giá'})
        
        thong_ke = {
            'tong_danh_gia': tong,
            'diem_trung_binh': queryset.aggregate(Avg('diem'))['diem__avg'],
            'phan_bo_diem': queryset.values('diem').annotate(count=Count('id')).order_by('diem'),
            'danh_gia_gan_day': DanhGiaDichVuSerializer(queryset.order_by('-created_at')[:10], many=True).data
        }
        
        return Response(thong_ke)

# ==================== VIEWSETS CHO LỊCH SỬ ====================

class LichSuLichHenViewSet(viewsets.ReadOnlyModelViewSet):
    """API cho lịch sử lịch hẹn (chỉ đọc)"""
    queryset = LichSuLichHen.objects.select_related('lich_hen', 'nguoi_thay_doi').all()
    serializer_class = LichSuLichHenSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['lich_hen']
    ordering_fields = ['-created_at']

# ==================== DASHBOARD VIEWSET ====================

class LichHenDashboardViewSet(viewsets.ViewSet):
    """API cho dashboard lịch hẹn"""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def tong_quan(self, request):
        """Tổng quan lịch hẹn"""
        today = _ngay_local_hien_tai()
        d0, d1 = _khoang_ngay_trong_tz(today)
        
        # Lịch hẹn hôm nay
        hom_nay = LichHen.objects.filter(ngay_gio_hen__gte=d0, ngay_gio_hen__lt=d1)
        
        # Thống kê nhanh
        _, sap_end = _khoang_ngay_trong_tz(today + timedelta(days=7))
        data = {
            'hom_nay': {
                'tong': hom_nay.count(),
                'cho_xac_nhan': hom_nay.filter(trang_thai='CHO_XAC_NHAN').count(),
                'da_xac_nhan': hom_nay.filter(trang_thai='DA_XAC_NHAN').count(),
                'dang_kham': hom_nay.filter(trang_thai='DANG_KHAM').count(),
                'hoan_thanh': hom_nay.filter(trang_thai='HOAN_THANH').count(),
                'da_huy': hom_nay.filter(trang_thai='DA_HUY').count(),
                'vang_mat': hom_nay.filter(trang_thai='VANG_MAT').count(),
            },
            'sap_toi': LichHen.objects.filter(
                ngay_gio_hen__gte=d1,
                ngay_gio_hen__lt=sap_end,
                trang_thai__in=['CHO_XAC_NHAN', 'DA_DAT', 'DA_XAC_NHAN']
            ).count(),
            'ty_le_hoan_thanh_tuan': self._tinh_ty_le_hoan_thanh(today - timedelta(days=7), today),
        }
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def lich_lam_viec(self, request):
        """Xem lịch làm việc theo ngày"""
        ngay_raw = request.query_params.get('ngay')
        if ngay_raw:
            ngay = parse_date(ngay_raw) if isinstance(ngay_raw, str) else ngay_raw
        else:
            ngay = _ngay_local_hien_tai()
        if not ngay:
            ngay = _ngay_local_hien_tai()
        n0, n1 = _khoang_ngay_trong_tz(ngay)
        bac_si_id = request.query_params.get('bac_si')
        
        lich = LichHen.objects.filter(ngay_gio_hen__gte=n0, ngay_gio_hen__lt=n1)
        if bac_si_id:
            lich = lich.filter(bac_si_id=bac_si_id)
        
        # Nhóm theo giờ
        lich_theo_gio = {}
        for l in lich.order_by('ngay_gio_hen'):
            gio = l.ngay_gio_hen.strftime('%H:%M')
            if gio not in lich_theo_gio:
                lich_theo_gio[gio] = []
            lich_theo_gio[gio].append({
                'id': l.id,
                'ma_lich_hen': l.ma_lich_hen,
                'benh_nhan': l.benh_nhan.nguoi_dung.ho_ten,
                'loai_lich': l.get_loai_lich_display(),
                'trang_thai': l.get_trang_thai_display()
            })
        
        return Response(lich_theo_gio)

    def _tinh_ty_le_hoan_thanh(self, tu_ngay, den_ngay):
        """Tính tỷ lệ hoàn thành"""
        t_start, _ = _khoang_ngay_trong_tz(tu_ngay)
        _, den_exc = _khoang_ngay_trong_tz(den_ngay)
        lich = LichHen.objects.filter(
            ngay_gio_hen__gte=t_start, ngay_gio_hen__lt=den_exc
        )
        tong = lich.count()
        if tong == 0:
            return 0
        hoan_thanh = lich.filter(trang_thai='HOAN_THANH').count()
        return round(hoan_thanh / tong * 100, 2)