"""Quy tắc phân quyền theo vai trò / chức vụ (tránh lặp chuỗi ở views)."""


def la_nhan_vien_ban_thuoc(user) -> bool:
    """Nhân viên quầy thuốc: vai_tro NHAN_VIEN và NhanVien.chuc_vu == BAN_THUOC."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'vai_tro', None) == 'ADMIN':
        return True
    if getattr(user, 'vai_tro', None) != 'NHAN_VIEN':
        return False
    nv = getattr(user, 'nhan_vien', None)
    return nv is not None and getattr(nv, 'chuc_vu', None) == 'BAN_THUOC'


def la_nhan_vien_quay_ban_thuoc(user) -> bool:
    """Chỉ nhân viên quầy bán thuốc (không tính admin/superuser) — dùng cho danh sách toa đã bán."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'vai_tro', None) != 'NHAN_VIEN':
        return False
    nv = getattr(user, 'nhan_vien', None)
    return nv is not None and getattr(nv, 'chuc_vu', None) == 'BAN_THUOC'


def la_ke_toan(user) -> bool:
    """Nhân viên kế toán: vai_tro NHAN_VIEN và NhanVien.chuc_vu == KE_TOAN."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'vai_tro', None) == 'ADMIN':
        return True
    if getattr(user, 'vai_tro', None) != 'NHAN_VIEN':
        return False
    nv = getattr(user, 'nhan_vien', None)
    return nv is not None and getattr(nv, 'chuc_vu', None) == 'KE_TOAN'


def la_duoc_thao_tac_kho(user) -> bool:
    """Kế toán hoặc admin — nhập / xuất / sửa lô tồn."""
    return la_ke_toan(user)


def la_admin_he_thong(user) -> bool:
    """Admin hoặc superuser (CRUD danh mục thuốc/vaccine trong admin panel)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return bool(getattr(user, 'is_superuser', False) or getattr(user, 'vai_tro', None) == 'ADMIN')


def la_xem_bao_cao_tai_chinh(user) -> bool:
    """Kế toán, admin hoặc nhân viên — xem / xuất báo cáo doanh thu."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    vt = getattr(user, 'vai_tro', None)
    return vt in ('ADMIN', 'NHAN_VIEN') or la_ke_toan(user)
