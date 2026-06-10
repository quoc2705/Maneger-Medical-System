from django.urls import path
from . import views

urlpatterns = [
    # Giỏ hàng
    path('gio-hang/<uuid:benh_nhan_id>/', views.get_gio_hang, name='get_gio_hang'),
    path('gio-hang/them/', views.them_vao_gio_hang, name='them_vao_gio_hang'),
    path('gio-hang/cap-nhat/<uuid:item_id>/', views.cap_nhat_gio_hang, name='cap_nhat_gio_hang'),
    path('gio-hang/xoa/<uuid:item_id>/', views.xoa_khoi_gio_hang, name='xoa_khoi_gio_hang'),
    
    # Đơn hàng — các path cụ thể phải đứng TRƯỚC don-hang/<uuid>/ (chi tiết)
    path('don-hang/tao/', views.tao_don_hang, name='tao_don_hang'),
    path(
        'don-hang/cho-duyet-thuoc-dac-thu/',
        views.list_don_cho_duyet_thuoc_dac_thu,
        name='list_don_cho_duyet_thuoc_dac_thu',
    ),
    path('don-hang/ban-theo-toa/', views.ban_theo_toa, name='ban_theo_toa'),
    path('don-hang/ban-thuoc-le/', views.ban_thuoc_le, name='ban_thuoc_le'),
    path(
        'don-hang/don-ban-le-da-thanh-toan/',
        views.don_tai_quay_ban_le_da_thanh_toan,
        name='don_ban_le_da_thanh_toan',
    ),
    path(
        'don-hang/<uuid:don_hang_id>/duyet-thuoc-dac-thu/',
        views.duyet_thuoc_dac_thu,
        name='duyet_thuoc_dac_thu',
    ),
    path(
        'don-hang/<uuid:don_hang_id>/cap-nhat-trang-thai/',
        views.cap_nhat_trang_thai_don_hang,
        name='cap_nhat_trang_thai',
    ),
    path(
        'don-hang/<uuid:don_hang_id>/sua-ban-le-tai-quay/',
        views.sua_ban_le_tai_quay,
        name='sua_ban_le_tai_quay',
    ),
    path(
        'don-hang/<uuid:don_hang_id>/vnpay-tao-url/',
        views.vnpay_tao_url,
        name='vnpay_tao_url',
    ),
    path(
        'don-hang/<uuid:don_hang_id>/thanh-toan/',
        views.thanh_toan_don_hang,
        name='thanh_toan_don_hang',
    ),
    path(
        'don-hang/<uuid:don_hang_id>/lich-su-thanh-toan/',
        views.get_lich_su_thanh_toan,
        name='lich_su_thanh_toan',
    ),
    path('don-hang/', views.list_don_hang, name='list_don_hang'),
    path('don-hang/<uuid:don_hang_id>/', views.get_don_hang, name='get_don_hang'),

    # IPN VNPay (không có prefix don-hang/)
    path('vnpay-ipn/', views.vnpay_ipn, name='vnpay_ipn'),
    path('vnpay-mock/', views.vnpay_mock, name='vnpay_mock'),
    path('vnpay-mock/confirm/', views.vnpay_mock_confirm, name='vnpay_mock_confirm'),

    # Thống kê
    path('thong-ke/don-hang/', views.thong_ke_don_hang, name='thong_ke_don_hang'),
]
