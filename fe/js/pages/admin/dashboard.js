/**
 * Admin Dashboard - Quản lý hệ thống phòng khám
 */

// dashboard.js - Thêm flag ở đầu file
console.log('dashboard.js loaded');


const AdminDashboard = {
    currentPage: 'dashboard',
    _initialized: false,
    _medicineTab: 'thuoc',

    /** YYYY-MM-DD theo giờ máy (local). Không dùng toISOString() — bị lệch ngày so với VN (UTC). */
    _fmtLocalYMD(d) {
        const x = d instanceof Date ? d : new Date(d);
        const y = x.getFullYear();
        const m = String(x.getMonth() + 1).padStart(2, '0');
        const day = String(x.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // Khởi tạo dashboard
    async init() {
        // Tránh khởi tạo nhiều lần
        if (this._initialized) {
            console.log('AdminDashboard already initialized, refreshing data');
            await this.loadDashboard();
            return;
        }
        this._initialized = true;
        
        console.log('Admin Dashboard initializing...');
        this.renderLayout();
        await this.loadDashboard();
        this.initEventListeners();
    },
    
    // Render layout chính
    renderLayout() {
        const appRoot = document.getElementById('app-root');
        if (!appRoot) return;
        
        appRoot.innerHTML = `
            <div class="admin-dashboard">
                <!-- Sidebar -->
                <aside class="admin-sidebar" id="admin-sidebar">
                    <div class="sidebar-header">
                        <div class="logo">
                            <i class="fas fa-hospital-user"></i>
                            <span>Admin<span>Panel</span></span>
                        </div>
                    </div>
                    
                    <nav class="sidebar-nav">
                        <a href="#" class="nav-item active" data-page="dashboard">
                            <i class="fas fa-chart-line"></i>
                            <span>Tổng quan</span>
                        </a>
                        <a href="#" class="nav-item" data-page="doctors">
                            <i class="fas fa-user-md"></i>
                            <span>Bác sĩ</span>
                        </a>
                        <a href="#" class="nav-item" data-page="patients">
                            <i class="fas fa-users"></i>
                            <span>Bệnh nhân</span>
                        </a>
                        <a href="#" class="nav-item" data-page="staff">
                            <i class="fas fa-id-badge"></i>
                            <span>Nhân viên</span>
                        </a>
                        <a href="#" class="nav-item" data-page="medicines">
                            <i class="fas fa-pills"></i>
                            <span>Quản lý thuốc</span>
                        </a>
                        <a href="#" class="nav-item" data-page="notifications">
                            <i class="fas fa-bell"></i>
                            <span>Quản lý thông báo</span>
                        </a>
                        <a href="#" class="nav-item" data-page="settings">
                            <i class="fas fa-cog"></i>
                            <span>Cài đặt</span>
                        </a>
                    </nav>
                    
                    <div class="sidebar-footer">
                        <button class="btn-logout" onclick="AdminDashboard.logout()">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Đăng xuất</span>
                        </button>
                    </div>
                </aside>
                
                <!-- Main Content -->
                <main class="admin-main">
                    <header class="admin-header">
                        <button class="menu-toggle" id="menu-toggle">
                            <i class="fas fa-bars"></i>
                        </button>
                        
                        <div class="header-search">
                            <i class="fas fa-search"></i>
                            <input type="text" id="global-search" placeholder="Tìm kiếm bệnh nhân, bác sĩ, nhân viên...">
                            <div class="search-results" id="search-results"></div>
                        </div>
                        
                        <div class="header-actions">
                            ${(typeof UIEnhance !== 'undefined' && UIEnhance.themeToggleHtml) ? UIEnhance.themeToggleHtml() : ''}
                            <div class="notification-bell" id="notification-bell">
                                <i class="fas fa-bell"></i>
                                <span class="badge" id="notif-count">0</span>
                            </div>
                            
                            <div class="user-menu" id="user-menu">
                                <div class="user-avatar" id="user-avatar">AD</div>
                                <div class="user-info">
                                    <div class="user-name" id="user-name">Admin</div>
                                    <div class="user-role">Quản trị viên</div>
                                </div>
                                <i class="fas fa-chevron-down"></i>
                            </div>
                        </div>
                    </header>
                    
                    <div class="admin-content" id="admin-content">
                        <div class="loading-container">
                            <div class="spinner"></div>
                            <p>Đang tải dữ liệu...</p>
                        </div>
                    </div>
                </main>
            </div>
            
            <!-- Modal Container -->
            <div id="modal-container"></div>
            
            <!-- Toast Container -->
            <div id="toast-container"></div>
        `;
        
        // Thêm CSS
        this.injectStyles();
    },
    
    injectStyles() {
        /* Loaded via css/styles.css → admin-dashboard.css, layout-shell.css */
    },

    initEventListeners() {
        if (window.UIEnhance && window.UIEnhance.bindMobileSidebar) {
            window.UIEnhance.bindMobileSidebar('menu-toggle', 'admin-sidebar');
            window.UIEnhance.bindThemeToggles();
        } else {
            const menuToggle = document.getElementById('menu-toggle');
            const sidebar = document.getElementById('admin-sidebar');
            if (menuToggle && sidebar) {
                menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
            }
        }
        
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.switchPage(page);
            });
        });
        
        // Global search
        const searchInput = document.getElementById('global-search');
        const searchResults = document.getElementById('search-results');
        let searchTimeout;
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                const query = searchInput.value.trim();
                if (query.length < 2) {
                    searchResults.classList.remove('show');
                    return;
                }
                searchTimeout = setTimeout(() => this.globalSearch(query), 300);
            });
        }
        
        // Click outside search
        document.addEventListener('click', (e) => {
            if (searchInput && !searchInput.contains(e.target) && !searchResults?.contains(e.target)) {
                searchResults?.classList.remove('show');
            }
        });
        
        // Chuông: hộp thư cá nhân (popup). Menu sidebar: quản lý & gửi thông báo.
        if (window.ThongBaoBell) {
            ThongBaoBell.init({ badgeId: 'notif-count' });
            const notifBell = document.getElementById('notification-bell');
            if (notifBell) {
                notifBell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ThongBaoBell.togglePopup(e);
                });
            }
        }
        
        // User menu
        const userMenu = document.getElementById('user-menu');
        if (userMenu) {
            userMenu.addEventListener('click', () => this.showUserMenu());
        }
        
        // Load user info
        this.loadUserInfo();
    },
    
    // Chuyển trang
    async switchPage(page) {
        this.currentPage = page;
        
        // Update active nav
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-page') === page) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        await this.reloadCurrentPage();
    },

    /** Sau CRUD: tải lại đúng section đang mở (không cần F5). */
    async reloadCurrentPage() {
        const page = this.currentPage || 'dashboard';
        switch (page) {
            case 'doctors':
                await this.loadDoctors();
                break;
            case 'patients':
                await this.loadPatients();
                break;
            case 'staff':
                await this.loadStaff();
                break;
            case 'medicines':
                await this.loadMedicines();
                break;
            case 'notifications':
                await this.loadNotifications();
                break;
            case 'settings':
                await this.loadSettings();
                break;
            default:
                await this.loadDashboard();
                break;
        }
    },

    _isCrudOk(result) {
        if (result == null) return false;
        if (result.error) return false;
        if (result.success === false) return false;
        return true;
    },
    
    // Load user info
    loadUserInfo() {
        const userInfo = Auth.layThongTin ? Auth.layThongTin() : JSON.parse(localStorage.getItem('user_info') || '{}');
        const userName = document.getElementById('user-name');
        const userAvatar = document.getElementById('user-avatar');
        
        if (userName && userInfo.ho_ten) {
            userName.textContent = userInfo.ho_ten;
        }
        if (userAvatar && userInfo.ho_ten) {
            userAvatar.textContent = userInfo.ho_ten.charAt(0).toUpperCase();
        }
    },
    
    // Dashboard

    // dashboard.js - SỬA HÀM loadDashboard

    async loadDashboard() {
        const content = document.getElementById('admin-content');
        if (!content) return;

        // Đọc kỳ lọc TRƯỚC khi xóa DOM (spinner loading làm mất input adm-*)
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        let tuNgay = this._fmtLocalYMD(firstDayOfMonth);
        let denNgay = this._fmtLocalYMD(today);
        let tomTatQuery = `tu=${encodeURIComponent(tuNgay)}&den=${encodeURIComponent(denNgay)}&ky_loai=khoang&nhom=ngay`;
        if (typeof BaoCaoTaiChinh !== 'undefined') {
            const built = BaoCaoTaiChinh.buildQueryParams('adm');
            if (!built.error && built.tu && built.den) {
                tuNgay = built.tu;
                denNgay = built.den;
                tomTatQuery = new URLSearchParams(built).toString();
            }
        }

        content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Đang tải dữ liệu...</p></div>';
        
        try {
            const tomTatUrl = `/thuoc/dashboard/ke-toan/tom-tat/?${tomTatQuery}`;

            const [rStats, rDh, rTomTat, rKho, rList] = await Promise.all([
                this.safeApiGet('/admin/stats/'),
                this.safeApiGet(`/don-hang/thong-ke/don-hang/?tu_ngay=${tuNgay}&den_ngay=${denNgay}`),
                this.safeApiGet(tomTatUrl),
                this.safeApiGet('/thuoc/dashboard/canh_bao_ton_kho/'),
                this.safeApiGet('/don-hang/don-hang/?page=1&limit=8'),
            ]);

            const stats = rStats.ok ? rStats.body : null;
            const donHangData = this._unwrapThongKeDonHang(rDh.body);
            const tomTat = rTomTat.ok && rTomTat.body && typeof rTomTat.body === 'object' ? rTomTat.body : null;
            const canhBaoKhoRes = rKho.ok && rKho.body ? rKho.body : {};
            const donHangGanDayRaw = rList.ok ? rList.body : null;

            if (!stats) {
                console.error('Failed to load stats', rStats.status, rStats.body);
                content.innerHTML = `
                    <div class="card">
                        <div class="card-body">
                            <div class="alert alert-error" style="background: #fee2e2; color: #991b1b; padding: 16px; border-radius: 8px;">
                                <strong>Lỗi kết nối:</strong> Không thể tải dữ liệu. Vui lòng kiểm tra kết nối hoặc đăng nhập lại.
                            </div>
                            <button class="btn btn-primary mt-2" onclick="AdminDashboard.logout()">
                                <i class="fas fa-sign-out-alt"></i> Đăng nhập lại
                            </button>
                        </div>
                    </div>
                `;
                return;
            }

            const tongQuanDonHang = donHangData?.tong_quan || {};
            const thangStats = stats.thang_nay || {};
            /** Ưu tiên tom-tat (đủ đơn+toa+tiêm); fallback admin/stats — không dùng API don-hang (thiếu tiêm). */
            const doanhThuNguon = tomTat || thangStats;
            const soGiaoDichThang = Number(
                doanhThuNguon.so_giao_dich ?? thangStats.so_giao_dich ?? 0
            );
            const doanhThuThang = Number(
                doanhThuNguon.doanh_thu ?? 0
            );
            const doanhThuKyLabel = tomTat?.ky_bao_cao || thangStats.ky_bao_cao || `01/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} — hôm nay`;
            const doanhThuThangChiTiet = doanhThuNguon
                ? `Đơn ${this.formatMoney(doanhThuNguon.doanh_thu_don_hang || 0)} · Toa ${this.formatMoney(doanhThuNguon.doanh_thu_don_thuoc || 0)} · Tiêm ${this.formatMoney(doanhThuNguon.doanh_thu_tiem || 0)}`
                : '';
            if (!tomTat && rTomTat.status && rTomTat.status !== 200) {
                console.warn('[Admin] tom-tat', rTomTat.status, rTomTat.body);
            }
            const topSanPham = Array.isArray(donHangData?.top_san_pham) ? donHangData.top_san_pham : [];
            const thuocSapHetHang = Array.isArray(canhBaoKhoRes?.thuoc_sap_het_hang) ? canhBaoKhoRes.thuoc_sap_het_hang : [];
            const thuocSapHetHan = Array.isArray(canhBaoKhoRes?.thuoc_sap_het_han) ? canhBaoKhoRes.thuoc_sap_het_han : [];
            const thongBao = Array.isArray(stats.thong_bao_gan_day) ? stats.thong_bao_gan_day.slice(0, 5) : [];
            const donHangGanDay =
                (donHangGanDayRaw && donHangGanDayRaw.data && donHangGanDayRaw.data.items)
                || donHangGanDayRaw?.items
                || [];

            content.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#e0f2fe;color:#0369a1;"><i class="fas fa-users"></i></div></div>
                        <div class="stat-value">${stats.tong_quan?.tong_benh_nhan || 0}</div>
                        <div class="stat-label">Bệnh nhân</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#d1fae5;color:#065f46;"><i class="fas fa-user-md"></i></div></div>
                        <div class="stat-value">${stats.tong_quan?.tong_bac_si || 0}</div>
                        <div class="stat-label">Bác sĩ</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#fed7aa;color:#9a3412;"><i class="fas fa-id-badge"></i></div></div>
                        <div class="stat-value">${stats.tong_quan?.tong_nhan_vien || 0}</div>
                        <div class="stat-label">Nhân viên</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#fee2e2;color:#991b1b;"><i class="fas fa-money-bill-wave"></i></div></div>
                        <div class="stat-value">${this.formatMoney(stats.hom_nay?.doanh_thu || 0)}</div>
                        <div class="stat-label">Doanh thu hôm nay</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#ede9fe;color:#5b21b6;"><i class="fas fa-file-invoice"></i></div></div>
                        <div class="stat-value">${soGiaoDichThang}</div>
                        <div class="stat-label">Giao dịch có doanh thu (kỳ)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#cffafe;color:#0e7490;"><i class="fas fa-chart-line"></i></div></div>
                        <div class="stat-value">${this.formatMoney(doanhThuThang)}</div>
                        <div class="stat-label">Tổng doanh thu (kỳ)</div>
                        <div class="text-muted" style="font-size:11px;margin-top:2px;">${this.escapeHtml(doanhThuKyLabel)}</div>
                        ${doanhThuThangChiTiet ? `<div class="text-muted" style="font-size:11px;margin-top:4px;line-height:1.35;">${doanhThuThangChiTiet}</div>` : ''}
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#fef3c7;color:#92400e;"><i class="fas fa-triangle-exclamation"></i></div></div>
                        <div class="stat-value">${thuocSapHetHang.length}</div>
                        <div class="stat-label">Thuốc sắp hết hàng</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon" style="background:#ffedd5;color:#c2410c;"><i class="fas fa-hourglass-end"></i></div></div>
                        <div class="stat-value">${thuocSapHetHan.length}</div>
                        <div class="stat-label">Thuốc sắp hết hạn</div>
                    </div>
                </div>

                ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.filterBarHtml('adm', { onView: 'AdminDashboard.loadDashboard()', tu: tuNgay, den: denNgay }) : ''}
                ${typeof BaoCaoTaiChinh !== 'undefined' && tomTat ? BaoCaoTaiChinh.chartSectionHtml('adm') : ''}

                <div class="grid-2 mt-2">
                    <div class="card">
                        <div class="card-header"><div class="card-title">Top thuốc bán chạy</div></div>
                        <div class="card-body">
                            ${topSanPham.length ? `
                                <div class="table-wrapper">
                                    <table class="data-table">
                                        <thead><tr><th>Thuốc</th><th>Số lượng bán</th><th>Doanh thu</th></tr></thead>
                                        <tbody>
                                            ${topSanPham.slice(0, 8).map(sp => `
                                                <tr>
                                                    <td>${this.escapeHtml(sp.thuoc__ten_thuoc || '—')}</td>
                                                    <td>${sp.so_luong_ban || 0}</td>
                                                    <td>${this.formatMoney(sp.doanh_thu || 0)}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : '<p class="text-muted">Chưa có dữ liệu bán hàng.</p>'}
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><div class="card-title">Cảnh báo kho</div></div>
                        <div class="card-body">
                            <div style="margin-bottom:12px;">
                                <div style="font-weight:700;color:#92400e;">Sắp hết hàng (${thuocSapHetHang.length})</div>
                                ${thuocSapHetHang.slice(0, 5).map(t => `
                                    <div class="text-muted" style="font-size:13px;padding:2px 0;">
                                        • ${this.escapeHtml(t.thuoc || '—')} (${t.ton_kho || 0})
                                    </div>
                                `).join('') || '<div class="text-muted" style="font-size:13px;">Không có</div>'}
                            </div>
                            <div>
                                <div style="font-weight:700;color:#c2410c;">Sắp hết hạn (${thuocSapHetHan.length})</div>
                                ${thuocSapHetHan.slice(0, 5).map(t => `
                                    <div class="text-muted" style="font-size:13px;padding:2px 0;">
                                        • ${this.escapeHtml(t.ten_thuoc || t.thuoc || '—')} (HSD: ${this.formatDate(t.han_su_dung)})
                                    </div>
                                `).join('') || '<div class="text-muted" style="font-size:13px;">Không có</div>'}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mt-2">
                    <div class="card-header"><div class="card-title">Bill/Đơn mua gần đây</div></div>
                    <div class="card-body">
                        ${donHangGanDay.length ? `
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead><tr><th>Mã đơn</th><th>Loại đơn</th><th>PT thanh toán</th><th>Bệnh nhân</th><th>Tổng tiền</th><th>Trạng thái</th><th>Ngày tạo</th><th>Cập nhật trạng thái</th></tr></thead>
                                    <tbody>
                                        ${donHangGanDay.map(d => `
                                            <tr>
                                                <td>${this.escapeHtml(d.ma_don_hang || '—')}</td>
                                                <td>${this.escapeHtml(d.loai_don || '—')}</td>
                                                <td>${this.escapeHtml(d.phuong_thuc_display || '—')}</td>
                                                <td>${this.escapeHtml(d.benh_nhan?.ho_ten || '—')}</td>
                                                <td>${this.formatMoney(d.tong_tien || 0)}</td>
                                                <td>${this.escapeHtml(d.trang_thai_quan_ly || d.trang_thai_display || d.trang_thai || '—')}</td>
                                                <td>${this.formatDateTime(d.ngay_tao)}</td>
                                                <td>${this._renderOrderApproveAction(d)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<p class="text-muted">Chưa có đơn hàng nào.</p>'}
                    </div>
                </div>
            `;
            if (typeof BaoCaoTaiChinh !== 'undefined') {
                if (tomTat) BaoCaoTaiChinh.setChartData('adm', tomTat);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            content.innerHTML = `
                    <div class="card">
                        <div class="card-body">
                        <p class="text-muted">Lỗi tải dữ liệu: ${error.message}</p>
                        </div>
                    </div>
            `;
        }
    },

    // SỬA HÀM loadDoctors
    async loadDoctors() {
        const content = document.getElementById('admin-content');
        if (!content) return;
        
        content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Đang tải danh sách bác sĩ...</p></div>';
        
        try {
            const doctors = await this.apiGet('/admin/bac-si/');
            
            if (!doctors) {
                content.innerHTML = `
                    <div class="card">
                        <div class="card-body">
                            <p class="text-muted">Không thể tải danh sách bác sĩ. Vui lòng thử lại.</p>
                            <button class="btn btn-primary btn-sm" onclick="AdminDashboard.loadDoctors()">
                                <i class="fas fa-sync-alt"></i> Thử lại
                            </button>
                </div>
                    </div>
                `;
                return;
            }
                
            const doctorList = Array.isArray(doctors) ? doctors : (doctors.results || []);
            this._currentData.doctors = doctorList;
            
            content.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Danh sách bác sĩ (${doctorList.length})</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddDoctorModal()">
                            <i class="fas fa-plus"></i> Thêm bác sĩ
                        </button>
                    </div>
                    <div class="card-body">
                        ${doctorList.length === 0 ? `
                            <div class="text-center" style="padding: 40px;">
                                <p class="text-muted">Chưa có bác sĩ nào</p>
                            </div>
                        ` : `
                        <div class="table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                            <th>Mã BS</th>
                                            <th>Họ tên</th>
                                            <th>Chuyên khoa</th>
                                            <th>Trạng thái</th>
                                            <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                        ${doctorList.map(dr => {
                                            const pk = AdminDashboard._pkBacSi(dr);
                                            const ten = (dr.nguoi_dung && dr.nguoi_dung.ho_ten) || dr.ho_ten || '';
                                            return `
                                            <tr>
                                                <td>${dr.ma_bac_si}</td>
                                                <td>${dr.nguoi_dung?.ho_ten || dr.ho_ten}</td>
                                                <td>${dr.chuyen_khoa}</td>
                                                <td><span class="badge ${dr.is_working ? 'badge-success' : 'badge-danger'}">${dr.is_working ? 'Đang làm việc' : 'Đã nghỉ'}</span></td>
                                                <td>
                                                    <button class="btn btn-outline btn-sm" ${!pk ? 'disabled' : ''} onclick="AdminDashboard.editDoctor('${pk}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" ${!pk ? 'disabled' : ''} onclick="AdminDashboard.deleteDoctor('${pk}', '${String(ten).replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                        </tr>`;
                                        }).join('')}
                                </tbody>
                            </table>
                        </div>
                        `}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading doctors:', error);
            content.innerHTML = '<div class="card"><div class="card-body"><p class="text-muted">Lỗi tải dữ liệu</p></div></div>';
        }
    },
    
    // Thêm biến lưu current data để real-time update
    _currentData: {
        doctors: [],
        patients: [],
        staff: [],
        medicines: [],
        vaccines: []
    },

    _extractList(data) {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.items)) return data.items;
        if (data.data && Array.isArray(data.data.results)) return data.data.results;
        if (data.data && Array.isArray(data.data.items)) return data.data.items;
        if (data.data && Array.isArray(data.data)) return data.data;
        return [];
    },

    /** Gộp phiếu nhập (cũ) + lô nhập trực tiếp (kho-thuoc / kho-vaccine), mới nhất trước. */
    _mergeNhapKhoGanDay(phieuList, khoList, loai = 'thuoc', limit = 12) {
        const rows = [];
        (phieuList || []).forEach((p) => {
            const chiTiet = loai === 'vaccine' ? p.chi_tiet_vaccine : p.chi_tiet_thuoc;
            const soLuong = Array.isArray(chiTiet)
                ? chiTiet.reduce((sum, ct) => sum + Number(ct.so_luong || 0), 0)
                : 0;
            rows.push({
                nguon: 'Phiếu nhập',
                ma: p.ma_phieu || '—',
                ten: loai === 'vaccine' ? 'Vaccine (phiếu)' : 'Thuốc (phiếu)',
                ncc: p.ten_nha_cung_cap || '—',
                so_luong: soLuong,
                ngay: p.ngay_nhap,
                tong_tien: p.tong_tien,
                lo_sx: '—',
                han: '—',
                duyet: p.da_duyet_chi,
                sortAt: p.ngay_nhap ? new Date(p.ngay_nhap).getTime() : 0,
            });
        });
        (khoList || []).forEach((k) => {
            const ten = loai === 'vaccine' ? k.ten_vaccine : k.ten_thuoc;
            const ma = loai === 'vaccine' ? k.ma_vaccine : k.ma_thuoc;
            const donGia = loai === 'vaccine' ? k.gia_nhap : k.don_gia_nhap;
            let tongTien = k.tong_tien;
            if (tongTien == null && donGia != null) {
                tongTien = Number(donGia) * Number(k.so_luong || 0);
            }
            rows.push({
                nguon: 'Nhập trực tiếp',
                ma: ma || '—',
                ten: ten || '—',
                ncc: donGia != null ? `ĐG nhập: ${this.formatMoney(donGia)}` : '—',
                so_luong: k.so_luong ?? 0,
                ngay: k.ngay_nhap,
                tong_tien: tongTien,
                lo_sx: k.lo_sx || '—',
                han: k.han_su_dung,
                duyet: null,
                sortAt: k.ngay_nhap ? new Date(k.ngay_nhap).getTime() : 0,
            });
        });
        rows.sort((a, b) => (b.sortAt || 0) - (a.sortAt || 0));
        return rows.slice(0, limit);
    },

    _htmlNhapKhoGanDayTable(rows, loai = 'thuoc') {
        if (!rows.length) {
            return '<p class="text-muted">Chưa có dữ liệu nhập kho. Dùng nút <strong>Nhập kho</strong> để tạo lô mới.</p>';
        }
        const showDuyet = loai === 'vaccine';
        return `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nguồn</th>
                            <th>Mã phiếu / Mã hàng</th>
                            <th>Tên</th>
                            <th>NCC / Ghi chú</th>
                            <th>SL nhập</th>
                            <th>Ngày nhập</th>
                            <th>Tổng tiền</th>
                            <th>Lô</th>
                            <th>Hạn SD</th>
                            ${showDuyet ? '<th>Duyệt</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows
                            .map((r) => {
                                const ngayStr = r.ngay
                                    ? String(r.ngay).includes('T')
                                        ? this.formatDateTime(r.ngay)
                                        : this.formatDate(r.ngay)
                                    : '—';
                                const duyetCell =
                                    r.duyet === true
                                        ? '<span class="badge badge-success">Đã duyệt</span>'
                                        : r.duyet === false
                                          ? '<span class="badge badge-warning">Chờ</span>'
                                          : '—';
                                return `
                            <tr>
                                <td><span class="badge ${r.nguon === 'Nhập trực tiếp' ? 'badge-info' : 'badge-secondary'}">${this.escapeHtml(r.nguon)}</span></td>
                                <td>${this.escapeHtml(r.ma)}</td>
                                <td>${this.escapeHtml(r.ten)}</td>
                                <td>${this.escapeHtml(r.ncc)}</td>
                                <td><strong>${r.so_luong}</strong></td>
                                <td>${ngayStr}</td>
                                <td>${r.tong_tien != null ? this.formatMoney(r.tong_tien) : '—'}</td>
                                <td>${this.escapeHtml(r.lo_sx)}</td>
                                <td>${r.han ? this.formatDate(r.han) : '—'}</td>
                                ${showDuyet ? `<td>${duyetCell}</td>` : ''}
                            </tr>`;
                            })
                            .join('')}
                    </tbody>
                </table>
            </div>
            <p class="text-muted small mt-2 mb-0">Gồm phiếu nhập cũ và lô <strong>Nhập trực tiếp</strong> (kế toán). SL lô trực tiếp = số lượng tại thời điểm nhập (có thể giảm sau khi xuất/bán).</p>`;
    },

    _tableSearchBarHtml(inputId, placeholder = 'Tìm kiếm...') {
        return `
            <div class="card-table-search">
                <div class="header-search">
                    <i class="fas fa-search"></i>
                    <input type="search" id="${inputId}" class="admin-local-table-search" placeholder="${this.escapeHtml(placeholder)}" autocomplete="off"/>
                </div>
                <span class="text-muted small" id="${inputId}-hint"></span>
            </div>`;
    },

    _bindTableSearch(inputId) {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.bound === '1') return;
        input.dataset.bound = '1';
        const cardBody = input.closest('.card-body');
        const tbody = cardBody?.querySelector('table.data-table tbody');
        const hint = document.getElementById(`${inputId}-hint`);
        if (!tbody) return;
        const rows = [...tbody.querySelectorAll('tr')];
        const apply = () => {
            const q = (input.value || '').trim().toLowerCase();
            let shown = 0;
            rows.forEach((tr) => {
                const ok = !q || (tr.textContent || '').toLowerCase().includes(q);
                tr.style.display = ok ? '' : 'none';
                if (ok) shown += 1;
            });
            if (hint) {
                if (!q) hint.textContent = '';
                else if (!shown) hint.textContent = 'Không có dòng phù hợp';
                else hint.textContent = `Hiển thị ${shown}/${rows.length} dòng`;
            }
        };
        input.addEventListener('input', apply);
        input.addEventListener('search', apply);
    },

    _initMedicinePageSearches() {
        [
            'search-med-ncc',
            'search-med-loai-thuoc',
            'search-med-don-vi',
            'search-med-nhap-thuoc',
            'search-med-thuoc',
            'search-med-loai-vac',
            'search-med-nhap-vac',
            'search-med-vac',
        ].forEach((id) => this._bindTableSearch(id));
    },

    _API_FIELD_LABELS: {
        ten_dang_nhap: 'Tên đăng nhập',
        email: 'Email',
        so_dien_thoai: 'Số điện thoại',
        password: 'Mật khẩu',
        password2: 'Nhập lại mật khẩu',
        ho_ten: 'Họ tên',
        nguoi_dung: 'Tài khoản',
        ma_bac_si: 'Mã bác sĩ',
        ma_nhan_vien: 'Mã nhân viên',
        chuyen_khoa: 'Chuyên khoa',
        so_giay_phep: 'Số giấy phép',
        phong_ban: 'Phòng ban',
        ngay_sinh: 'Ngày sinh',
        dia_chi: 'Địa chỉ',
        gioi_tinh: 'Giới tính',
        non_field_errors: '',
    },

    _labelApiField(key) {
        return this._API_FIELD_LABELS[key] || key.replace(/_/g, ' ');
    },

    _collectApiErrors(payload, prefix = '') {
        if (payload == null) return [];
        if (typeof payload === 'string') return [prefix ? `${prefix}: ${payload}` : payload];
        if (Array.isArray(payload)) {
            return payload.flatMap((item) => this._collectApiErrors(item, prefix));
        }
        if (typeof payload === 'object') {
            return Object.entries(payload).flatMap(([key, value]) => {
                const label = this._labelApiField(key);
                const nextPrefix = prefix ? `${prefix} → ${label}` : label;
                return this._collectApiErrors(value, nextPrefix);
            });
        }
        return [prefix ? `${prefix}: ${String(payload)}` : String(payload)];
    },

    _formatApiError(result, fallback = 'Thao tác thất bại') {
        if (!result) return fallback;
        if (typeof result === 'string') return result;
        if (result.error && result.details) {
            const details = this._collectApiErrors(result.details).join('; ');
            return details ? `${result.error}: ${details}` : result.error;
        }
        if (result.error) return result.error;
        if (result.detail) {
            return typeof result.detail === 'string'
                ? result.detail
                : this._collectApiErrors(result.detail).join('; ');
        }
        const collected = this._collectApiErrors(result);
        if (collected.length) return collected.join('; ');
        if (result.message) return result.message;
        return fallback;
    },

    _setModalError(message) {
        const box = document.getElementById('modal-crud-alert');
        if (!box) return false;
        box.textContent = message;
        box.classList.remove('d-none');
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
    },

    _clearModalError() {
        const box = document.getElementById('modal-crud-alert');
        if (box) {
            box.textContent = '';
            box.classList.add('d-none');
        }
    },

    _reportCrudError(result, fallback = 'Thao tác thất bại') {
        const msg = this._formatApiError(result, fallback);
        this._setModalError(msg);
        Toast.error(msg);
        return msg;
    },

    _nextPatientCodeFromList(list = []) {
        const year = new Date().getFullYear().toString();
        const prefix = `BN${year}`;
        let maxSeq = 0;
        list.forEach((p) => {
            const code = String(p?.ma_benh_nhan || '');
            if (code.startsWith(prefix) && code.length >= prefix.length + 4) {
                const seq = parseInt(code.slice(-4), 10);
                if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
        });
        return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    },

    _nextStaffCodeFromList(list = []) {
        const year = new Date().getFullYear().toString();
        const prefix = `NV${year}`;
        let maxSeq = 0;
        list.forEach((s) => {
            const code = String(s?.ma_nhan_vien || '');
            if (code.startsWith(prefix) && code.length >= prefix.length + 4) {
                const seq = parseInt(code.slice(-4), 10);
                if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
        });
        return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    },

    _nextBacSiCodeFromList(list = []) {
        const year = new Date().getFullYear().toString();
        const prefix = `BS${year}`;
        let maxSeq = 0;
        list.forEach((d) => {
            const code = String(d?.ma_bac_si || '');
            if (code.startsWith(prefix) && code.length >= prefix.length + 4) {
                const seq = parseInt(code.slice(-4), 10);
                if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
        });
        return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    },

    _getPatientId(p) {
        if (!p) return '';
        if (typeof p.nguoi_dung === 'string') return p.nguoi_dung;
        if (p.nguoi_dung && typeof p.nguoi_dung === 'object' && p.nguoi_dung.id) return p.nguoi_dung.id;
        if (p.id) return p.id;
        return '';
    },

    async loadPatients() {
        const content = document.getElementById('admin-content');
        content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Đang tải danh sách bệnh nhân...</p></div>';
        
        try {
            const patientRes = await this.apiGet('/admin/benh-nhan/');
            let patients = this._extractList(patientRes);

            // Fallback: nhiều tài khoản có role BENH_NHAN nhưng chưa có hồ sơ BenhNhan.
            if (patients.length === 0) {
                const usersRes = await this.apiGet('/users/?vai_tro=BENH_NHAN');
                const users = this._extractList(usersRes);
                if (users.length > 0) {
                    patients = users.map(u => ({
                        id: u.id,
                        nguoi_dung: {
                            id: u.id,
                            ho_ten: u.ho_ten,
                            so_dien_thoai: u.so_dien_thoai,
                            email: u.email
                        },
                        ma_benh_nhan: u.ma_benh_nhan || '—',
                        gioi_tinh: u.gioi_tinh || '',
                        ngay_sinh: u.ngay_sinh || null,
                        dia_chi: u.dia_chi || '',
                        _user_only: true
                    }));
                }
            }
            
            if (patients.length === 0) {
            content.innerHTML = `
                <div class="card">
                    <div class="card-header">
                            <div class="card-title">Danh sách bệnh nhân</div>
                            <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddPatientModal()">
                                <i class="fas fa-plus"></i> Thêm bệnh nhân
                        </button>
                    </div>
                    <div class="card-body">
                            <div class="text-center" style="padding: 40px;">
                                <i class="fas fa-users" style="font-size: 48px; color: #cbd5e1;"></i>
                                <p class="text-muted mt-2">Chưa có bệnh nhân nào</p>
                                <button class="btn btn-primary btn-sm mt-2" onclick="AdminDashboard.showAddPatientModal()">
                                    Thêm bệnh nhân đầu tiên
                                                </button>
                        </div>
                    </div>
                </div>
            `;
                return;
            }
            
            // Lưu data
            this._currentData.patients = patients;
            
            // Render table
            content.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Danh sách bệnh nhân (${patients.length})</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddPatientModal()">
                            <i class="fas fa-plus"></i> Thêm bệnh nhân
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="table-wrapper">
                            <table class="data-table" id="patients-table">
                                <thead>
                                    <tr>
                                        <th>Mã BN</th>
                                        <th>Họ tên</th>
                                        <th>Số điện thoại</th>
                                        <th>Email</th>
                                        <th>Ngày sinh</th>
                                        <th>Giới tính</th>
                                        <th>Địa chỉ</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody id="patients-table-body">
                                    ${patients.map(p => this.renderPatientRow(p)).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('[DEBUG] Error loading patients:', error);
            content.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <p class="text-muted">Lỗi tải dữ liệu: ${error.message}</p>
                    </div>
                </div>
            `;
        }
    },

    // SỬA renderPatientRow - Handle đúng cấu trúc dữ liệu
    renderPatientRow(p) {
        console.log('[DEBUG] Rendering patient row:', p);
        
        // Lấy thông tin từ đúng cấu trúc
        const maBN = p.ma_benh_nhan || '—';
        const hoTen = p.nguoi_dung?.ho_ten || p.ho_ten || '—';
        const soDienThoai = p.nguoi_dung?.so_dien_thoai || p.so_dien_thoai || '—';
        const email = p.nguoi_dung?.email || p.email || '—';
        const ngaySinh = this.formatDate(p.ngay_sinh);
        const gioiTinh = p.gioi_tinh === 'NAM' ? 'Nam' : p.gioi_tinh === 'NU' ? 'Nữ' : (p.gioi_tinh || '—');
        const diaChi = p.dia_chi || '—';
        const patientId = this._getPatientId(p);
        const canAct = !!patientId;
        const actions = `
            ${p._user_only ? '<span class="badge badge-warning" style="margin-right: 6px;">Thiếu hồ sơ BN</span>' : ''}
            <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editPatient('${patientId}')" style="margin-right: 5px;" ${canAct ? '' : 'disabled'}>
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deletePatient('${patientId}', '${this.escapeHtml(hoTen).replace(/'/g, "\\'")}')" ${canAct ? '' : 'disabled'}>
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        return `
            <tr>
                <td><strong>${this.escapeHtml(maBN)}</strong></td>
                <td>${this.escapeHtml(hoTen)}</td>
                <td>${this.escapeHtml(soDienThoai)}</td>
                <td>${this.escapeHtml(email)}</td>
                <td>${ngaySinh}</td>
                <td>${this.escapeHtml(gioiTinh)}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(diaChi)}">${this.escapeHtml(diaChi)}</td>
                <td>
                    ${actions}
                </td>
            </tr>
        `;
    },

    // THÊM hàm escapeHtml để tránh XSS
    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },    
    

    // THÊM HÀM: Show modal thêm bệnh nhân
    showAddPatientModal() {
        const suggestedCode = this._nextPatientCodeFromList(this._currentData.patients || []);
        this.showModal('Thêm bệnh nhân mới', `
            <div class="form-row">
                <div class="form-group">
                    <label>Mã bệnh nhân</label>
                    <input type="text" id="patient-code" class="form-control" value="${suggestedCode}" readonly style="background:#f5f5f5;">
                    <small class="text-muted">Tự động sinh theo định dạng: BN + năm + số thứ tự</small>
                        </div>
                <div class="form-group">
                    <label>Họ tên *</label>
                    <input type="text" id="patient-name" class="form-control" placeholder="Nguyễn Văn A">
                    </div>
                </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tên đăng nhập *</label>
                    <input type="text" id="patient-username" class="form-control" placeholder="ten_dang_nhap">
                </div>
                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" id="patient-email" class="form-control" placeholder="email@example.com">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Số điện thoại *</label>
                    <input type="tel" id="patient-phone" class="form-control" placeholder="0901234567">
                </div>
                <div class="form-group">
                    <label>Mật khẩu *</label>
                    <input type="password" id="patient-password" class="form-control" placeholder="••••••••">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Ngày sinh *</label>
                    <input type="date" id="patient-birthday" class="form-control">
                </div>
                <div class="form-group">
                    <label>Giới tính *</label>
                    <select id="patient-gender" class="form-control">
                        <option value="NAM">Nam</option>
                        <option value="NU">Nữ</option>
                        <option value="KHAC">Khác</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Địa chỉ *</label>
                <input type="text" id="patient-address" class="form-control" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành">
            </div>
            <div class="form-group">
                <label>Số BHYT</label>
                <input type="text" id="patient-insurance" class="form-control" placeholder="Số thẻ bảo hiểm y tế">
            </div>
            <div class="form-group">
                <label>Người liên hệ khẩn cấp</label>
                <div class="form-row">
                    <input type="text" id="patient-emergency-name" class="form-control" placeholder="Họ tên" style="margin-right: 8px;">
                    <input type="text" id="patient-emergency-relation" class="form-control" placeholder="Quan hệ" style="margin-right: 8px;">
                    <input type="tel" id="patient-emergency-phone" class="form-control" placeholder="Số điện thoại">
                </div>
            </div>
        `, async () => {
            // Validate required fields
            const name = document.getElementById('patient-name').value.trim();
            const username = document.getElementById('patient-username').value.trim();
            const email = document.getElementById('patient-email').value.trim();
            const phone = document.getElementById('patient-phone').value.trim();
            const password = document.getElementById('patient-password').value;
            const birthday = document.getElementById('patient-birthday').value;
            const gender = document.getElementById('patient-gender').value;
            const address = document.getElementById('patient-address').value.trim();
            
            if (!name || !username || !email || !phone || !password || !birthday || !address) {
                return this._reportCrudError({ error: 'Vui lòng nhập đầy đủ thông tin bắt buộc' });
            }
            
            // Validate password strength
            if (password.length < 8) {
                return this._reportCrudError({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
            }
            if (!/[A-Z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
                return this._reportCrudError({ error: 'Mật khẩu cần có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt' });
            }
            
            const data = {
                nguoi_dung: {
                    ho_ten: name,
                    ten_dang_nhap: username,
                    email: email,
                    so_dien_thoai: phone,
                    password: password,
                    password2: password,
                    vai_tro: 'BENH_NHAN'
                },
                ngay_sinh: birthday,
                gioi_tinh: gender,
                dia_chi: address,
                so_bao_hiem: document.getElementById('patient-insurance').value.trim() || null,
                ho_ten_nguoi_than: document.getElementById('patient-emergency-name').value.trim(),
                quan_he_nguoi_than: document.getElementById('patient-emergency-relation').value.trim(),
                sdt_nguoi_than: document.getElementById('patient-emergency-phone').value.trim()
            };
            
            const result = await this.apiPost('/admin/benh-nhan/', data, { silent: true });
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm bệnh nhân thành công!');
                // Real-time update table
                await this.refreshPatientsTable();
            } else {
                this._reportCrudError(result, 'Thêm bệnh nhân thất bại');
            }
        });
    },

    // THÊM HÀM: Edit patient
    async editPatient(id) {
        if (!id || id === 'undefined' || id === 'null') {
            Toast.error('Không xác định được ID bệnh nhân');
            return;
        }
        // Lấy thông tin bệnh nhân
        const patient = await this.apiGet(`/admin/benh-nhan/${id}/`);
        if (!patient) return Toast.error('Không tải được thông tin bệnh nhân');
        
        const user = patient.nguoi_dung || {};
        
        this.showModal('Cập nhật bệnh nhân', `
            <div class="form-row">
                <div class="form-group">
                    <label>Mã bệnh nhân</label>
                    <input type="text" id="edit-patient-code" class="form-control" value="${patient.ma_benh_nhan || ''}" readonly style="background:#f5f5f5;">
                </div>
                <div class="form-group">
                    <label>Họ tên *</label>
                    <input type="text" id="edit-patient-name" class="form-control" value="${(user.ho_ten || '').replace(/"/g, '&quot;')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="edit-patient-email" class="form-control" value="${(user.email || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label>Số điện thoại</label>
                    <input type="tel" id="edit-patient-phone" class="form-control" value="${user.so_dien_thoai || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Ngày sinh</label>
                    <input type="date" id="edit-patient-birthday" class="form-control" value="${patient.ngay_sinh || ''}">
                </div>
                <div class="form-group">
                    <label>Giới tính</label>
                    <select id="edit-patient-gender" class="form-control">
                        <option value="NAM" ${patient.gioi_tinh === 'NAM' ? 'selected' : ''}>Nam</option>
                        <option value="NU" ${patient.gioi_tinh === 'NU' ? 'selected' : ''}>Nữ</option>
                        <option value="KHAC" ${patient.gioi_tinh === 'KHAC' ? 'selected' : ''}>Khác</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Địa chỉ</label>
                <input type="text" id="edit-patient-address" class="form-control" value="${(patient.dia_chi || '').replace(/"/g, '&quot;')}">
            </div>
            <div class="form-group">
                <label>Số BHYT</label>
                <input type="text" id="edit-patient-insurance" class="form-control" value="${patient.so_bao_hiem || ''}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Người liên hệ khẩn cấp</label>
                    <input type="text" id="edit-patient-emergency-name" class="form-control" value="${(patient.ho_ten_nguoi_than || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label>Quan hệ</label>
                    <input type="text" id="edit-patient-emergency-relation" class="form-control" value="${(patient.quan_he_nguoi_than || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label>Số điện thoại liên hệ</label>
                    <input type="text" id="edit-patient-emergency-phone" class="form-control" value="${(patient.sdt_nguoi_than || '').replace(/"/g, '&quot;')}">
                </div>
            </div>
            <div class="form-group">
                <label>Đổi mật khẩu (để trống nếu không đổi)</label>
                <input type="password" id="edit-patient-password" class="form-control" placeholder="Mật khẩu mới">
            </div>
        `, async () => {
            const updateData = {
                ngay_sinh: document.getElementById('edit-patient-birthday').value,
                gioi_tinh: document.getElementById('edit-patient-gender').value,
                dia_chi: document.getElementById('edit-patient-address').value.trim(),
                so_bao_hiem: document.getElementById('edit-patient-insurance').value.trim() || null,
                ho_ten_nguoi_than: document.getElementById('edit-patient-emergency-name').value.trim(),
                quan_he_nguoi_than: document.getElementById('edit-patient-emergency-relation').value.trim(),
                sdt_nguoi_than: document.getElementById('edit-patient-emergency-phone').value.trim()
            };
            
            // Update user info
            const userName = document.getElementById('edit-patient-name').value.trim();
            const userEmail = document.getElementById('edit-patient-email').value.trim();
            const userPhone = document.getElementById('edit-patient-phone').value.trim();
            const newPassword = document.getElementById('edit-patient-password').value;
            
            if (userName) updateData.ho_ten = userName;
            if (userEmail) updateData.email = userEmail;
            if (userPhone) updateData.so_dien_thoai = userPhone;
            if (newPassword && newPassword.length >= 8) {
                if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)) {
                    return this._reportCrudError({ error: 'Mật khẩu mới cần có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt' });
                }
                updateData.password = newPassword;
                updateData.password2 = newPassword;
            } else if (newPassword && newPassword.length < 8) {
                return this._reportCrudError({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
            }
            
            const result = await this.apiPut(`/admin/benh-nhan/${id}/`, updateData, { silent: true });
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật bệnh nhân thành công!');
                // Real-time update table
                await this.refreshPatientsTable();
            } else {
                this._reportCrudError(result, 'Cập nhật bệnh nhân thất bại');
            }
        });
    },

    // THÊM HÀM: Delete patient
    async deletePatient(id, name) {
        if (!id || id === 'undefined' || id === 'null') {
            Toast.error('Không xác định được ID bệnh nhân');
            return;
        }
        if (confirm(`Bạn có chắc muốn xóa bệnh nhân "${name}"?\nHành động này sẽ vô hiệu hóa tài khoản của bệnh nhân.`)) {
            const success = await this.apiDelete(`/admin/benh-nhan/${id}/`);
            if (success) {
                Toast.success('Đã vô hiệu hóa tài khoản bệnh nhân!');
                // Real-time update table - xóa dòng hoặc reload
                await this.refreshPatientsTable();
            }
        }
    },

    // THÊM HÀM: Refresh patients table real-time
    async refreshPatientsTable() {
        try {
            const patientRes = await this.apiGet('/admin/benh-nhan/');
            const patients = this._extractList(patientRes);
            this._currentData.patients = patients;
            const tbody = document.getElementById('patients-table-body');
            if (!tbody) {
                await this.loadPatients();
                return;
            }
            tbody.innerHTML = patients.map(p => this.renderPatientRow(p)).join('');
            const title = document.querySelector('#admin-content .card-title');
            if (title && String(title.textContent || '').includes('Danh sách bệnh nhân')) {
                title.textContent = `Danh sách bệnh nhân (${patients.length})`;
            }
        } catch (error) {
            console.error('Error refreshing patients:', error);
        }
    },
    
    // Load staff list
    renderStaffRow(s) {
        const pk = this._pkNhanVien(s);
        const ten = String(s.ho_ten || '').replace(/'/g, "\\'");
        return `
        <tr>
            <td>${this.escapeHtml(s.ma_nhan_vien || '')}</td>
            <td>${this.escapeHtml(s.ho_ten || '')}</td>
            <td>${this.escapeHtml(s.phong_ban || '')}</td>
            <td>${this.escapeHtml(s.chuc_vu_display || s.chuc_vu || '')}</td>
            <td>
                <span class="badge ${s.is_working ? 'badge-success' : 'badge-danger'}">
                    ${s.is_working ? 'Đang làm việc' : 'Đã nghỉ'}
                </span>
            </td>
            <td>
                <button class="btn btn-outline btn-sm" ${!pk ? 'disabled' : ''} onclick="AdminDashboard.editStaff('${pk}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" ${!pk ? 'disabled' : ''} onclick="AdminDashboard.deleteStaff('${pk}', '${ten}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    },

    async refreshStaffTable() {
        try {
            this.currentPage = 'staff';
            const staffRes = await this.apiGet('/admin/nhan-vien/');
            const staff = this._extractList(staffRes);
            this._currentData.staff = staff;
            const tbody = document.getElementById('staff-table-body');
            if (!tbody) {
                await this.loadStaff();
                return;
            }
            tbody.innerHTML = staff.map((s) => this.renderStaffRow(s)).join('');
            const title = document.querySelector('#admin-content .card-title');
            if (title && String(title.textContent || '').includes('Danh sách nhân viên')) {
                title.textContent = `Danh sách nhân viên (${staff.length})`;
            }
        } catch (error) {
            console.error('Error refreshing staff:', error);
            await this.loadStaff();
        }
    },

    async loadStaff() {
        const content = document.getElementById('admin-content');
        if (!content) return;
        this.currentPage = 'staff';
        content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Đang tải danh sách nhân viên...</p></div>';
        
        try {
            const staffRes = await this.apiGet('/admin/nhan-vien/');
            const staff = this._extractList(staffRes);
            this._currentData.staff = staff;
            
            content.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Danh sách nhân viên (${staff.length})</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddStaffModal()">
                            <i class="fas fa-plus"></i> Thêm nhân viên
                        </button>
                    </div>
                    <div class="card-body">
                        ${staff.length === 0 ? `
                            <div class="text-center" style="padding: 40px;">
                                <p class="text-muted">Chưa có nhân viên nào</p>
                                <button class="btn btn-primary btn-sm mt-2" onclick="AdminDashboard.showAddStaffModal()">Thêm nhân viên đầu tiên</button>
                            </div>
                        ` : `
                        <div class="table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Mã NV</th>
                                        <th>Họ tên</th>
                                        <th>Phòng ban</th>
                                        <th>Chức vụ</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody id="staff-table-body">
                                    ${staff.map((s) => this.renderStaffRow(s)).join('')}
                                </tbody>
                            </table>
                        </div>
                        `}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading staff:', error);
            content.innerHTML = '<div class="card"><div class="card-body"><p class="text-muted">Lỗi tải dữ liệu</p></div></div>';
        }
    },
    
    // Load medicines
    async loadMedicines() {
        const content = document.getElementById('admin-content');
        content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Đang tải danh sách thuốc...</p></div>';
        
        try {
            let medicines = [];
            let loaiThuoc = [];
            let donViTinh = [];
            let phieuNhapGanDay = [];
            let khoThuocGanDay = [];
            let loaiVaccine = [];
            let vaccines = [];
            let phieuNhapVacGanDay = [];
            let khoVaccineGanDay = [];
            let nhaCungCap = [];
            try {
                const [
                    thuocRes, loaiRes, donViRes, nccRes, phieuNhapRes, khoRes,
                    loaiVacRes, vacRes, phieuVacRes, khoVacRes
                ] = await Promise.all([
                    this.apiGet('/thuoc/thuoc/'),
                    this.apiGet('/thuoc/loai-thuoc/'),
                    this.apiGet('/thuoc/don-vi-tinh/'),
                    this.apiGet('/thuoc/nha-cung-cap/?page_size=200'),
                    this.apiGet('/thuoc/phieu-nhap/?loai_nhap=THUOC&ordering=-ngay_nhap'),
                    this.apiGet('/thuoc/kho-thuoc/?ordering=-ngay_nhap'),
                    this.apiGet('/thuoc/loai-vaccine/'),
                    this.apiGet('/thuoc/vaccine/'),
                    this.apiGet('/thuoc/phieu-nhap/?loai_nhap=VACCINE&ordering=-ngay_nhap'),
                    this.apiGet('/thuoc/kho-vaccine/?ordering=-ngay_nhap')
                ]);
                medicines = this._extractList(thuocRes);
                loaiThuoc = this._extractList(loaiRes);
                donViTinh = this._extractList(donViRes);
                nhaCungCap = this._extractList(nccRes);
                phieuNhapGanDay = this._extractList(phieuNhapRes).slice(0, 20);
                khoThuocGanDay = this._extractList(khoRes).slice(0, 50);
                loaiVaccine = this._extractList(loaiVacRes);
                vaccines = this._extractList(vacRes);
                phieuNhapVacGanDay = this._extractList(phieuVacRes).slice(0, 20);
                khoVaccineGanDay = this._extractList(khoVacRes).slice(0, 50);
            } catch (e) {
                console.warn('Thuoc app not available');
            }
            this._currentData.medicines = medicines;
            this._currentData.vaccines = vaccines;
            const nhapThuocMerged = this._mergeNhapKhoGanDay(phieuNhapGanDay, khoThuocGanDay, 'thuoc');
            const nhapVacMerged = this._mergeNhapKhoGanDay(phieuNhapVacGanDay, khoVaccineGanDay, 'vaccine');

            content.innerHTML = `
                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <div class="card-title">Nhà cung cấp (NCC)</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddNccModal()">
                            <i class="fas fa-plus"></i> Thêm NCC
                        </button>
                    </div>
                    <div class="card-body">
                        ${nhaCungCap.length ? `
                            ${this._tableSearchBarHtml('search-med-ncc', 'Tìm mã NCC, tên, điện thoại...')}
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Mã NCC</th>
                                            <th>Tên</th>
                                            <th>Điện thoại</th>
                                            <th>Trạng thái</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${nhaCungCap.map(item => `
                                            <tr>
                                                <td>${this.escapeHtml(item.ma_ncc || '')}</td>
                                                <td>${this.escapeHtml(item.ten_ncc || '')}</td>
                                                <td>${this.escapeHtml(item.so_dien_thoai || '—')}</td>
                                                <td>${item.trang_thai ? 'Hoạt động' : 'Ngừng'}</td>
                                                <td>
                                                    <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editNcc('${item.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deleteNcc('${item.id}', '${this.escapeHtml(item.ten_ncc || '').replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<p class="text-muted">Chưa có nhà cung cấp — thêm NCC để lập phiếu nhập kho.</p>'}
                    </div>
                </div>

                <div class="medicine-tabs" style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">
                    <span style="font-weight:600;color:#0A2342;">Danh mục:</span>
                    <button type="button" class="btn btn-primary btn-sm" id="tab-btn-thuoc" onclick="AdminDashboard.switchMedicineTab('thuoc')">Thuốc</button>
                    <button type="button" class="btn btn-outline btn-sm" id="tab-btn-vaccine" onclick="AdminDashboard.switchMedicineTab('vaccine')">Vaccine</button>
                </div>

                <div id="med-panel-thuoc">
                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <div class="card-title">Danh mục loại thuốc</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddLoaiThuocModal()">
                            <i class="fas fa-plus"></i> Thêm loại thuốc
                        </button>
                    </div>
                    <div class="card-body">
                        ${loaiThuoc.length ? `
                            ${this._tableSearchBarHtml('search-med-loai-thuoc', 'Tìm tên loại, mô tả...')}
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Tên loại</th>
                                            <th>Mô tả</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${loaiThuoc.map(item => `
                                            <tr>
                                                <td>${this.escapeHtml(item.ten_loai || '')}</td>
                                                <td>${this.escapeHtml(item.mo_ta || '—')}</td>
                                                <td>
                                                    <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editLoaiThuoc('${item.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deleteLoaiThuoc('${item.id}', '${this.escapeHtml(item.ten_loai || '').replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<p class="text-muted">Chưa có loại thuốc nào.</p>'}
                    </div>
                </div>

                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <div class="card-title">Danh mục đơn vị tính</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddDonViTinhModal()">
                            <i class="fas fa-plus"></i> Thêm đơn vị tính
                        </button>
                    </div>
                    <div class="card-body">
                        ${donViTinh.length ? `
                            ${this._tableSearchBarHtml('search-med-don-vi', 'Tìm tên đơn vị, ký hiệu...')}
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Tên đơn vị</th>
                                            <th>Ký hiệu</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${donViTinh.map(item => `
                                            <tr>
                                                <td>${this.escapeHtml(item.ten_don_vi || '')}</td>
                                                <td>${this.escapeHtml(item.ky_hieu || '—')}</td>
                                                <td>
                                                    <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editDonViTinh('${item.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deleteDonViTinh('${item.id}', '${this.escapeHtml(item.ten_don_vi || '').replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<p class="text-muted">Chưa có đơn vị tính nào.</p>'}
                    </div>
                </div>

                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <div class="card-title">Nhập kho gần đây</div>
                    </div>
                    <div class="card-body">
                        ${nhapThuocMerged.length ? this._tableSearchBarHtml('search-med-nhap-thuoc', 'Tìm mã, tên, NCC, lô...') : ''}
                        ${this._htmlNhapKhoGanDayTable(nhapThuocMerged, 'thuoc')}
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Danh sách thuốc</div>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-outline btn-sm" onclick="AdminDashboard.showNhapKhoModal()">
                                <i class="fas fa-boxes"></i> Nhập kho
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddMedicineModal()">
                                <i class="fas fa-plus"></i> Thêm thuốc
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${medicines.length > 0 ? `
                            ${this._tableSearchBarHtml('search-med-thuoc', 'Tìm mã, tên, NCC, hoạt chất...')}
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Mã thuốc</th>
                                            <th>Tên thuốc</th>
                                            <th>NCC</th>
                                            <th>Hoạt chất</th>
                                            <th>Đơn vị</th>
                                            <th>Số lượng</th>
                                            <th>Đơn giá</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${medicines.map(m => `
                                            <tr>
                                                <td>${m.ma_thuoc || '—'}</td>
                                                <td>
                                                    ${m.ten_thuoc || '—'}
                                                    ${m.can_don_thuoc ? '<span class="badge badge-warning" style="margin-left:6px;">Kê đơn</span>' : ''}
                                                </td>
                                                <td>${m.nha_cung_cap && m.nha_cung_cap[0] ? this.escapeHtml(m.nha_cung_cap[0].ten_ncc || '') : '—'}</td>
                                                <td>${m.thanh_phan || '—'}</td>
                                                <td>${m.don_vi_ten || '—'}</td>
                                                <td>${m.ton_kho || 0}</td>
                                                <td>${this.formatMoney(m.gia_ban || 0)}</td>
                                                <td>
                                                    <button class="btn btn-mint btn-sm" onclick="AdminDashboard.showNhapKhoModal('${m.id}')">
                                                        <i class="fas fa-boxes"></i>
                                                    </button>
                                                    <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editMedicine('${m.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deleteMedicine('${m.id}', '${(m.ten_thuoc || '').replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : `
                            <div class="text-center" style="padding: 40px;">
                                <i class="fas fa-pills" style="font-size: 48px; color: #cbd5e1;"></i>
                                <p class="text-muted mt-2">Chưa có dữ liệu thuốc</p>
                                <button class="btn btn-primary btn-sm mt-2" onclick="AdminDashboard.showAddMedicineModal()">
                                    Thêm thuốc mới
                                </button>
                            </div>
                        `}
                    </div>
                </div>
                </div>

                <div id="med-panel-vaccine" style="display:none;">
                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <div class="card-title">Danh mục loại vaccine</div>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddLoaiVaccineModal()">
                            <i class="fas fa-plus"></i> Thêm loại vaccine
                        </button>
                    </div>
                    <div class="card-body">
                        ${loaiVaccine.length ? `
                            ${this._tableSearchBarHtml('search-med-loai-vac', 'Tìm tên loại, mô tả...')}
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Tên loại</th>
                                            <th>Mô tả</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${loaiVaccine.map(item => `
                                            <tr>
                                                <td>${this.escapeHtml(item.ten_loai || '')}</td>
                                                <td>${this.escapeHtml(item.mo_ta || '—')}</td>
                                                <td>
                                                    <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editLoaiVaccine('${item.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deleteLoaiVaccine('${item.id}', '${this.escapeHtml(item.ten_loai || '').replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<p class="text-muted">Chưa có loại vaccine.</p>'}
                    </div>
                </div>

                <div class="card" style="margin-bottom: 16px;">
                    <div class="card-header">
                        <div class="card-title">Nhập kho vaccine gần đây</div>
                    </div>
                    <div class="card-body">
                        ${nhapVacMerged.length ? this._tableSearchBarHtml('search-med-nhap-vac', 'Tìm mã, tên, NCC, lô...') : ''}
                        ${this._htmlNhapKhoGanDayTable(nhapVacMerged, 'vaccine')}
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Danh sách vaccine</div>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-outline btn-sm" onclick="AdminDashboard.showNhapKhoVaccineModal()">
                                <i class="fas fa-boxes"></i> Nhập kho
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddVaccineModal()">
                                <i class="fas fa-plus"></i> Thêm vaccine
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${vaccines.length > 0 ? `
                            ${this._tableSearchBarHtml('search-med-vac', 'Tìm mã, tên, NCC, phòng bệnh...')}
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Mã</th>
                                            <th>Tên vaccine</th>
                                            <th>NCC</th>
                                            <th>Phòng bệnh</th>
                                            <th>Tồn</th>
                                            <th>Giá tiêm</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${vaccines.map(v => `
                                            <tr>
                                                <td>${v.ma_vaccine || '—'}</td>
                                                <td>${v.ten_vaccine || '—'}</td>
                                                <td>${this.escapeHtml(v.ten_nha_cung_cap || '—')}</td>
                                                <td>${v.phong_benh || '—'}</td>
                                                <td>${v.ton_kho != null ? v.ton_kho : 0}</td>
                                                <td>${this.formatMoney(v.gia_tiem || 0)}</td>
                                                <td>
                                                    <button class="btn btn-mint btn-sm" onclick="AdminDashboard.showNhapKhoVaccineModal('${v.id}')">
                                                        <i class="fas fa-boxes"></i>
                                                    </button>
                                                    <button class="btn btn-outline btn-sm" onclick="AdminDashboard.editVaccine('${v.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.deleteVaccine('${v.id}', '${(v.ten_vaccine || '').replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : `
                            <div class="text-center" style="padding: 40px;">
                                <i class="fas fa-syringe" style="font-size: 48px; color: #cbd5e1;"></i>
                                <p class="text-muted mt-2">Chưa có dữ liệu vaccine</p>
                                <button class="btn btn-primary btn-sm mt-2" onclick="AdminDashboard.showAddVaccineModal()">
                                    Thêm vaccine mới
                                </button>
                            </div>
                        `}
                    </div>
                </div>
                </div>
            `;
            this._initMedicinePageSearches();
            this.switchMedicineTab(this._medicineTab || 'thuoc');
        } catch (error) {
            console.error('Error loading medicines:', error);
            content.innerHTML = '<div class="card"><div class="card-body"><p class="text-muted">Lỗi tải dữ liệu</p></div></div>';
        }
    },

    switchMedicineTab(tab) {
        this._medicineTab = tab || 'thuoc';
        const pt = document.getElementById('med-panel-thuoc');
        const pv = document.getElementById('med-panel-vaccine');
        const bt = document.getElementById('tab-btn-thuoc');
        const bv = document.getElementById('tab-btn-vaccine');
        if (!pt || !pv) return;
        if (tab === 'vaccine') {
            pt.style.display = 'none';
            pv.style.display = 'block';
            if (bt) { bt.classList.remove('btn-primary'); bt.classList.add('btn-outline'); }
            if (bv) { bv.classList.add('btn-primary'); bv.classList.remove('btn-outline'); }
        } else {
            pt.style.display = 'block';
            pv.style.display = 'none';
            if (bt) { bt.classList.add('btn-primary'); bt.classList.remove('btn-outline'); }
            if (bv) { bv.classList.remove('btn-primary'); bv.classList.add('btn-outline'); }
        }
    },

    showAddLoaiVaccineModal() {
        this.showModal('Thêm loại vaccine', `
            <div class="form-group">
                <label>Tên loại *</label>
                <input type="text" id="loai-vac-name" class="form-control" placeholder="Viêm gan B">
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="loai-vac-desc" class="form-control" rows="3"></textarea>
            </div>
        `, async () => {
            const payload = {
                ten_loai: document.getElementById('loai-vac-name').value.trim(),
                mo_ta: document.getElementById('loai-vac-desc').value.trim()
            };
            if (!payload.ten_loai) return Toast.error('Tên loại là bắt buộc');
            const result = await this.apiPost('/thuoc/loai-vaccine/', payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm loại vaccine thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Thêm thất bại');
            }
        });
    },

    async editLoaiVaccine(id) {
        const item = await this.apiGet(`/thuoc/loai-vaccine/${id}/`);
        if (!item) return Toast.error('Không tải được loại vaccine');
        this.showModal('Sửa loại vaccine', `
            <div class="form-group">
                <label>Tên loại *</label>
                <input type="text" id="edit-loai-vac-name" class="form-control" value="${this.escapeHtml(item.ten_loai || '')}">
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="edit-loai-vac-desc" class="form-control" rows="3">${this.escapeHtml(item.mo_ta || '')}</textarea>
            </div>
        `, async () => {
            const payload = {
                ten_loai: document.getElementById('edit-loai-vac-name').value.trim(),
                mo_ta: document.getElementById('edit-loai-vac-desc').value.trim()
            };
            if (!payload.ten_loai) return Toast.error('Tên loại là bắt buộc');
            const result = await this.apiPut(`/thuoc/loai-vaccine/${id}/`, payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Cập nhật thất bại');
            }
        });
    },

    async deleteLoaiVaccine(id, ten) {
        if (!confirm(`Xóa loại vaccine "${ten}"?`)) return;
        const success = await this.apiDelete(`/thuoc/loai-vaccine/${id}/`);
        if (success) {
            Toast.success('Đã xóa');
            await this.reloadCurrentPage();
        } else Toast.error('Xóa thất bại');
    },

    async showAddVaccineModal() {
        let loai = [];
        let nhaCungCap = [];
        try {
            const [r, ncc] = await Promise.all([
                this.apiGet('/thuoc/loai-vaccine/'),
                this.apiGet('/thuoc/nha-cung-cap/?page_size=200'),
            ]);
            loai = this._extractList(r);
            nhaCungCap = this._extractList(ncc);
        } catch (e) {
            return Toast.error('Không tải được loại vaccine / NCC');
        }
        if (!loai.length) return Toast.error('Vui lòng thêm loại vaccine trước');
        if (!nhaCungCap.length) return Toast.error('Chưa có nhà cung cấp — thêm NCC trước khi thêm vaccine.');

        this.showModal('Thêm vaccine', `
            <div class="form-group">
                <label>Tên vaccine *</label>
                <input type="text" id="vac-name" class="form-control">
            </div>
            <div class="form-group">
                <label>Loại vaccine *</label>
                <select id="vac-loai" class="form-control">
                    ${loai.map(i => `<option value="${i.id}">${this.escapeHtml(i.ten_loai)}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Giá nhập *</label>
                    <input type="number" id="vac-gia-nhap" class="form-control" min="0" step="1">
                </div>
                <div class="form-group">
                    <label>Giá tiêm *</label>
                    <input type="number" id="vac-gia-tiem" class="form-control" min="0" step="1">
                </div>
            </div>
            <div class="form-group">
                <label>Phòng bệnh *</label>
                <input type="text" id="vac-phong-benh" class="form-control" placeholder="Viêm gan B">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Độ tuổi áp dụng *</label>
                    <input type="text" id="vac-do-tuoi" class="form-control" placeholder="Trẻ em, người lớn...">
                </div>
                <div class="form-group">
                    <label>Số mũi *</label>
                    <input type="number" id="vac-so-mui" class="form-control" value="1" min="1">
                </div>
            </div>
            <div class="form-group">
                <label>Nhà cung cấp *</label>
                <select id="vac-ncc" class="form-control">
                    <option value="">-- Chọn NCC --</option>
                    ${nhaCungCap.map((n) => `<option value="${n.id}">${this.escapeHtml(n.ma_ncc || '')} — ${this.escapeHtml(n.ten_ncc || '')}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="vac-mota" class="form-control" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>Ảnh vaccine</label>
                <input type="file" id="vac-image" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif">
            </div>
        `, async () => {
            const vacNcc = document.getElementById('vac-ncc')?.value || '';
            const data = {
                ten_vaccine: document.getElementById('vac-name').value.trim(),
                loai_vaccine: document.getElementById('vac-loai').value,
                gia_nhap: parseFloat(document.getElementById('vac-gia-nhap').value) || 0,
                gia_tiem: parseFloat(document.getElementById('vac-gia-tiem').value) || 0,
                phong_benh: document.getElementById('vac-phong-benh').value.trim(),
                do_tuoi_ap_dung: document.getElementById('vac-do-tuoi').value.trim(),
                so_mui: parseInt(document.getElementById('vac-so-mui').value, 10) || 1,
                nha_san_xuat: '',
                nuoc_san_xuat: '',
                nha_cung_cap: vacNcc,
                mo_ta: document.getElementById('vac-mota').value.trim(),
                trang_thai: true
            };
            if (!data.ten_vaccine || !data.loai_vaccine || !data.phong_benh ||
                !data.do_tuoi_ap_dung || !data.nha_cung_cap ||
                !data.gia_nhap || !data.gia_tiem) {
                return Toast.error('Vui lòng nhập đủ các trường bắt buộc (gồm nhà cung cấp)');
            }
            const file = document.getElementById('vac-image')?.files?.[0];
            let result;
            if (file) {
                const fd = new FormData();
                Object.entries(data).forEach(([k, v]) => {
                    if (typeof v === 'boolean') fd.append(k, v ? 'true' : 'false');
                    else fd.append(k, String(v));
                });
                fd.append('hinh_anh', file);
                result = await this.apiPostFormData('/thuoc/vaccine/', fd);
            } else {
                result = await this.apiPost('/thuoc/vaccine/', data);
            }
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm vaccine thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Thêm thất bại');
            }
        });
    },

    async editVaccine(id) {
        const v = await this.apiGet(`/thuoc/vaccine/${id}/`);
        if (!v) return Toast.error('Không tải được vaccine');
        let nhaCungCap = [];
        try {
            const ncc = await this.apiGet('/thuoc/nha-cung-cap/?page_size=200');
            nhaCungCap = this._extractList(ncc);
        } catch (e) {
            nhaCungCap = [];
        }
        const vacNccHienTai = v.nha_cung_cap ? String(v.nha_cung_cap) : '';
        const vimg = v.hinh_anh_url || '';
        this.showModal('Sửa vaccine', `
            ${vimg ? `<div class="form-group"><label>Ảnh hiện tại</label><br><img src="${this.escapeHtml(vimg)}" alt="" style="max-height:120px;border-radius:8px;object-fit:contain"></div>` : ''}
            <div class="form-group">
                <label>Đổi ảnh</label>
                <input type="file" id="edit-vac-image" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif">
            </div>
            <div class="form-group">
                <label>Tên vaccine</label>
                <input type="text" id="edit-vac-name" class="form-control" value="${this.escapeHtml(v.ten_vaccine || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Giá nhập</label>
                    <input type="number" id="edit-vac-gia-nhap" class="form-control" value="${v.gia_nhap || 0}">
                </div>
                <div class="form-group">
                    <label>Giá tiêm</label>
                    <input type="number" id="edit-vac-gia-tiem" class="form-control" value="${v.gia_tiem || 0}">
                </div>
            </div>
            <div class="form-group">
                <label>Phòng bệnh</label>
                <input type="text" id="edit-vac-phong-benh" class="form-control" value="${this.escapeHtml(v.phong_benh || '')}">
            </div>
            <div class="form-group">
                <label>Nhà cung cấp</label>
                <select id="edit-vac-ncc" class="form-control">
                    <option value="">-- Chọn NCC --</option>
                    ${nhaCungCap.map((n) => `<option value="${n.id}" ${String(n.id) === vacNccHienTai ? 'selected' : ''}>${this.escapeHtml(n.ma_ncc || '')} — ${this.escapeHtml(n.ten_ncc || '')}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="edit-vac-mota" class="form-control" rows="2">${this.escapeHtml(v.mo_ta || '')}</textarea>
            </div>
        `, async () => {
            const evNcc = (document.getElementById('edit-vac-ncc')?.value || '').trim();
            const payload = {
                ten_vaccine: document.getElementById('edit-vac-name').value.trim(),
                gia_nhap: parseFloat(document.getElementById('edit-vac-gia-nhap').value) || 0,
                gia_tiem: parseFloat(document.getElementById('edit-vac-gia-tiem').value) || 0,
                phong_benh: document.getElementById('edit-vac-phong-benh').value.trim(),
                mo_ta: document.getElementById('edit-vac-mota').value.trim(),
                nha_cung_cap: evNcc || null,
            };
            const file = document.getElementById('edit-vac-image')?.files?.[0];
            let result;
            if (file) {
                result = await this.apiPatch(`/thuoc/vaccine/${id}/`, payload);
                if (this._isCrudOk(result)) {
                    const fd = new FormData();
                    fd.append('hinh_anh', file);
                    result = await this.apiPatchFormData(`/thuoc/vaccine/${id}/`, fd);
                }
            } else {
                result = await this.apiPatch(`/thuoc/vaccine/${id}/`, payload);
            }
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật vaccine thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Cập nhật thất bại');
            }
        });
    },

    async deleteVaccine(id, name) {
        if (!confirm(`Xóa vaccine "${name}"?`)) return;
        const success = await this.apiDelete(`/thuoc/vaccine/${id}/`);
        if (success) {
            Toast.success('Đã xóa vaccine');
            await this.reloadCurrentPage();
        } else Toast.error('Xóa thất bại');
    },

    async showNhapKhoVaccineModal(defaultVacId = '') {
        let list = [];
        try {
            const res = await this.apiGet('/thuoc/vaccine/');
            list = this._extractList(res);
        } catch (e) {
            return Toast.error('Không tải danh sách vaccine');
        }
        if (!list.length) return Toast.error('Chưa có vaccine để nhập kho');

        const today = new Date().toISOString().slice(0, 10);
        const oneYearLater = new Date();
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        const defaultHan = oneYearLater.toISOString().slice(0, 10);

        this.showModal('Nhập kho vaccine (theo lô)', `
            <div class="form-group">
                <label>Vaccine *</label>
                <select id="nkv-vac" class="form-control">
                    ${list.map(t => `
                        <option value="${t.id}" ${String(defaultVacId) === String(t.id) ? 'selected' : ''}>
                            ${this.escapeHtml(t.ma_vaccine || '')} - ${this.escapeHtml(t.ten_vaccine || '')}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Số lượng *</label>
                <input type="number" id="nkv-sl" class="form-control" min="1" step="1">
            </div>
            <div class="form-group">
                <label>Ngày nhập *</label>
                <input type="date" id="nkv-ngay" class="form-control" value="${today}">
            </div>
            <div class="form-group">
                <label>Hạn sử dụng *</label>
                <input type="date" id="nkv-han" class="form-control" value="${defaultHan}">
            </div>
            <div class="form-group">
                <label>Lô SX</label>
                <input type="text" id="nkv-lo" class="form-control">
            </div>
            <p id="nkv-tong-preview" class="text-muted small" style="margin-top:12px"></p>
        `, async () => {
            const payload = {
                vaccine: document.getElementById('nkv-vac').value,
                so_luong: parseInt(document.getElementById('nkv-sl').value || '0', 10),
                ngay_nhap: document.getElementById('nkv-ngay').value,
                han_su_dung: document.getElementById('nkv-han').value,
                lo_sx: (document.getElementById('nkv-lo').value || '').trim()
            };
            if (!payload.vaccine || !payload.so_luong || payload.so_luong <= 0 || !payload.ngay_nhap || !payload.han_su_dung) {
                return Toast.error('Nhập đủ thông tin bắt buộc');
            }
            if (payload.han_su_dung <= payload.ngay_nhap) {
                return Toast.error('Hạn SD phải sau ngày nhập');
            }
            const result = await this.apiPost('/thuoc/kho-vaccine/', payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Nhập kho vaccine thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Nhập kho thất bại');
            }
        });
        const vacCatalog = {};
        list.forEach((v) => { vacCatalog[String(v.id)] = v; });
        setTimeout(
            () =>
                this._bindNhapKhoTongTienPreview(vacCatalog, {
                    selectId: 'nkv-vac',
                    qtyId: 'nkv-sl',
                    previewId: 'nkv-tong-preview',
                    loai: 'vaccine',
                }),
            0
        );
    },
    
    // ─── Quản lý thông báo (phát hành) ───
    _tbTodayISO() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    _buildTbHistoryQuery() {
        const q = new URLSearchParams({ page_size: '100' });
        const tu = document.getElementById('tb-ls-tu')?.value?.trim();
        const den = document.getElementById('tb-ls-den')?.value?.trim();
        const tim = document.getElementById('tb-ls-tim')?.value?.trim();
        const loai = document.getElementById('tb-ls-loai')?.value?.trim();
        const phamVi = document.getElementById('tb-ls-pham-vi')?.value?.trim();
        if (tu) q.set('tu_ngay', tu);
        if (den) q.set('den_ngay', den);
        if (tim) q.set('tim_kiem', tim);
        if (loai) q.set('loai_thong_bao', loai);
        if (phamVi) q.set('pham_vi', phamVi);
        return q.toString();
    },

    _tbResetHistoryFilter() {
        const today = this._tbTodayISO();
        const tu = document.getElementById('tb-ls-tu');
        const den = document.getElementById('tb-ls-den');
        const tim = document.getElementById('tb-ls-tim');
        const loai = document.getElementById('tb-ls-loai');
        const pv = document.getElementById('tb-ls-pham-vi');
        if (tu) tu.value = today;
        if (den) den.value = today;
        if (tim) tim.value = '';
        if (loai) loai.value = '';
        if (pv) pv.value = '';
        this.taiLichSuPhatHanh();
    },

    async taiLichSuPhatHanh(highlightId) {
        const tbody = document.getElementById('tb-ph-history-body');
        const countEl = document.getElementById('tb-ph-history-count');
        if (!tbody) return;

        tbody.innerHTML =
            '<tr><td colspan="6" class="text-center text-muted py-3"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Đang tải…</td></tr>';

        const wrap = await this.safeApiGet(`/thong-bao/phat-hanh/?${this._buildTbHistoryQuery()}`);
        if (!wrap.ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Không tải được lịch sử (HTTP ${wrap.status || '?'})</td></tr>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        const listRes = wrap.body;
        const rows = listRes?.results || (Array.isArray(listRes) ? listRes : []);
        const total = listRes?.count != null ? listRes.count : rows.length;

        if (countEl) {
            countEl.textContent = total ? `${total} bản ghi` : 'Không có bản ghi';
        }

        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="6" class="text-muted text-center py-4">Không có thông báo trong khoảng đã chọn</td></tr>';
            return;
        }

        tbody.innerHTML = rows
            .map((n) => this._rowThongBaoPhatHanh(n, highlightId && String(n.id) === String(highlightId)))
            .join('');

        if (highlightId) {
            const row = tbody.querySelector(`tr[data-tb-id="${highlightId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                setTimeout(() => row.classList.remove('tb-ph-row-new'), 2500);
            }
        }
    },

    async loadNotifications() {
        const content = document.getElementById('admin-content');
        content.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Đang tải quản lý thông báo...</p></div>';

        try {
            const optWrap = await this.safeApiGet('/thong-bao/phat-hanh/tuy-chon/');
            if (!optWrap.ok) {
                const st = optWrap.status;
                throw new Error(
                    st === 404
                        ? 'API phát hành thông báo chưa khớp URL — khởi động lại server Django sau khi cập nhật urls.py'
                        : `HTTP ${st || 'lỗi'}`
                );
            }
            this._tbPhatHanhOpts = optWrap.body || {};
            const opts = this._tbPhatHanhOpts;
            const today = this._tbTodayISO();
            const loaiFilterOpts = (opts.loai_thong_bao || [])
                .map((o) => `<option value="${this._escTb(o.value)}">${this._escTb(o.label)}</option>`)
                .join('');
            const phamViFilterOpts = (opts.pham_vi || [])
                .map((o) => `<option value="${this._escTb(o.value)}">${this._escTb(o.label)}</option>`)
                .join('');

            content.innerHTML = `
                <div class="card mb-3">
                    <div class="card-header" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px">
                        <div>
                            <div class="card-title"><i class="fas fa-bell"></i> Quản lý thông báo</div>
                            <p class="text-muted small mb-0">Tạo và gửi thông báo tới toàn hệ thống, theo vai trò/chức vụ hoặc một người dùng.</p>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" onclick="AdminDashboard.showCreateNotificationModal()">
                            <i class="fas fa-paper-plane"></i> Tạo &amp; gửi thông báo
                        </button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px">
                        <div class="card-title mb-0">Lịch sử phát hành</div>
                        <span id="tb-ph-history-count" class="text-muted small"></span>
                    </div>
                    <div class="card-body">
                        <div class="tb-ph-filter-bar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:16px;padding:12px;background:var(--c-bg-subtle, #f8fafc);border-radius:8px;border:1px solid var(--c-border, #e2e8f0)">
                            <div>
                                <label class="form-label small mb-1">Từ ngày</label>
                                <input type="date" id="tb-ls-tu" class="form-control form-control-sm" value="${today}"/>
                            </div>
                            <div>
                                <label class="form-label small mb-1">Đến ngày</label>
                                <input type="date" id="tb-ls-den" class="form-control form-control-sm" value="${today}"/>
                            </div>
                            <div style="min-width:160px">
                                <label class="form-label small mb-1">Tìm kiếm</label>
                                <input type="text" id="tb-ls-tim" class="form-control form-control-sm" placeholder="Tiêu đề, nội dung…"
                                    onkeydown="if(event.key==='Enter')AdminDashboard.taiLichSuPhatHanh()"/>
                            </div>
                            <div>
                                <label class="form-label small mb-1">Loại</label>
                                <select id="tb-ls-loai" class="form-control form-control-sm">
                                    <option value="">Tất cả</option>${loaiFilterOpts}
                                </select>
                            </div>
                            <div>
                                <label class="form-label small mb-1">Phạm vi</label>
                                <select id="tb-ls-pham-vi" class="form-control form-control-sm">
                                    <option value="">Tất cả</option>${phamViFilterOpts}
                                </select>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <button type="button" class="btn btn-primary btn-sm" onclick="AdminDashboard.taiLichSuPhatHanh()">
                                    <i class="fas fa-search"></i> Lọc
                                </button>
                                <button type="button" class="btn btn-outline btn-sm" onclick="AdminDashboard._tbResetHistoryFilter()">Hôm nay</button>
                            </div>
                        </div>
                        <div style="overflow:auto">
                            <table class="table table-sm admin-tb-table">
                                <thead>
                                    <tr>
                                        <th>Tiêu đề</th>
                                        <th>Loại</th>
                                        <th>Phạm vi</th>
                                        <th>Người gửi</th>
                                        <th>Thời gian gửi</th>
                                        <th class="text-center">Số BN nhận</th>
                                    </tr>
                                </thead>
                                <tbody id="tb-ph-history-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>`;

            await this.taiLichSuPhatHanh();
        } catch (error) {
            console.error('Error loading notifications:', error);
            content.innerHTML = '<div class="card"><div class="card-body"><p class="text-danger">Không tải được dữ liệu thông báo. Chạy migrate: python manage.py migrate thongbao</p></div></div>';
        }
    },

    _escTb(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _rowThongBaoPhatHanh(n, isNew) {
        const phamVi = this._moTaPhamViTb(n);
        const rowCls = isNew ? ' class="tb-ph-row-new"' : '';
        return `<tr data-tb-id="${this._escTb(n.id)}"${rowCls}>
            <td><strong>${this._escTb(n.tieu_de)}</strong><div class="text-muted small text-truncate" style="max-width:280px">${this._escTb((n.noi_dung || '').slice(0, 120))}${(n.noi_dung || '').length > 120 ? '…' : ''}</div></td>
            <td><span class="badge badge-info">${this._escTb(n.loai_thong_bao_display || n.loai_thong_bao)}</span></td>
            <td>${phamVi}</td>
            <td>${this._escTb(n.ten_nguoi_gui || '—')}</td>
            <td>${this._escTb(this.formatDateTime(n.thoi_gian_gui))}</td>
            <td class="text-center"><strong>${n.so_nguoi_nhan ?? 0}</strong></td>
        </tr>`;
    },

    _moTaPhamViTb(n) {
        if (n.pham_vi === 'TAT_CA') return '<span class="badge badge-mint">Toàn hệ thống</span>';
        if (n.pham_vi === 'VAI_TRO') return `<span class="badge badge-info">Vai trò: ${this._escTb(n.vai_tro_display || n.vai_tro)}</span>`;
        if (n.pham_vi === 'CHUC_VU') return `<span class="badge badge-warning">Chức vụ: ${this._escTb(n.chuc_vu_display || n.chuc_vu)}</span>`;
        if (n.pham_vi === 'NGUOI_DUNG') return `<span class="badge badge-muted">1 người: ${this._escTb(n.ten_nguoi_nhan || '')}</span>`;
        return this._escTb(n.pham_vi_display || n.pham_vi);
    },

    showCreateNotificationModal() {
        const opts = this._tbPhatHanhOpts || {};
        const loaiOpts = (opts.loai_thong_bao || []).map((o) =>
            `<option value="${this._escTb(o.value)}">${this._escTb(o.label)}</option>`
        ).join('');
        const phamViOpts = (opts.pham_vi || []).map((o) =>
            `<option value="${this._escTb(o.value)}">${this._escTb(o.label)}</option>`
        ).join('');
        const vaiTroOpts = (opts.vai_tro || []).map((o) =>
            `<option value="${this._escTb(o.value)}">${this._escTb(o.label)}</option>`
        ).join('');
        const chucVuOpts = (opts.chuc_vu || []).map((o) =>
            `<option value="${this._escTb(o.value)}">${this._escTb(o.label)}</option>`
        ).join('');

        this.showModal('Tạo &amp; gửi thông báo', `
            <div class="grid-2">
                <div style="grid-column:1/-1">
                    <label class="form-label">Tiêu đề *</label>
                    <input type="text" id="tb-ph-tieu-de" class="form-control" maxlength="255" placeholder="VD: Bảo trì hệ thống tối nay"/>
                </div>
                <div style="grid-column:1/-1">
                    <label class="form-label">Nội dung *</label>
                    <textarea id="tb-ph-noi-dung" class="form-control" rows="4" placeholder="Nội dung chi tiết gửi tới người nhận..."></textarea>
                </div>
                <div>
                    <label class="form-label">Loại thông báo *</label>
                    <select id="tb-ph-loai" class="form-control">${loaiOpts}</select>
                </div>
                <div>
                    <label class="form-label">Phạm vi gửi *</label>
                    <select id="tb-ph-pham-vi" class="form-control" onchange="AdminDashboard._tbDoiPhamVi()">${phamViOpts}</select>
                </div>
                <div id="tb-ph-wrap-vai-tro" class="d-none">
                    <label class="form-label">Vai trò *</label>
                    <select id="tb-ph-vai-tro" class="form-control" onchange="AdminDashboard._tbCapNhatDemNguoiNhan()">${vaiTroOpts}</select>
                </div>
                <div id="tb-ph-wrap-chuc-vu" class="d-none">
                    <label class="form-label">Chức vụ nhân viên *</label>
                    <select id="tb-ph-chuc-vu" class="form-control" onchange="AdminDashboard._tbCapNhatDemNguoiNhan()">${chucVuOpts}</select>
                </div>
                <div id="tb-ph-wrap-nguoi" class="d-none" style="grid-column:1/-1">
                    <label class="form-label">Người nhận *</label>
                    <input type="text" id="tb-ph-nguoi-q" class="form-control mb-1" placeholder="Tìm họ tên, email, tên đăng nhập..."
                        oninput="AdminDashboard._tbTimNguoiDung(this.value)"/>
                    <select id="tb-ph-nguoi-id" class="form-control" size="4" onchange="AdminDashboard._tbCapNhatDemNguoiNhan()"><option value="">— Tìm và chọn —</option></select>
                </div>
                <div style="grid-column:1/-1">
                    <p class="text-muted small mb-0" id="tb-ph-dem">Ước tính: — người nhận</p>
                </div>
            </div>
        `, () => this.submitCreateNotification());
        const btn = document.getElementById('modal-confirm-btn');
        if (btn) btn.textContent = 'Gửi thông báo';
        this._tbDoiPhamVi();
    },

    _tbDoiPhamVi() {
        const pv = document.getElementById('tb-ph-pham-vi')?.value || 'TAT_CA';
        const wVt = document.getElementById('tb-ph-wrap-vai-tro');
        const wCv = document.getElementById('tb-ph-wrap-chuc-vu');
        const wNd = document.getElementById('tb-ph-wrap-nguoi');
        if (wVt) wVt.classList.toggle('d-none', pv !== 'VAI_TRO');
        if (wCv) wCv.classList.toggle('d-none', pv !== 'CHUC_VU');
        if (wNd) wNd.classList.toggle('d-none', pv !== 'NGUOI_DUNG');
        this._tbCapNhatDemNguoiNhan();
    },

    async _tbCapNhatDemNguoiNhan() {
        const el = document.getElementById('tb-ph-dem');
        if (!el) return;
        const pv = document.getElementById('tb-ph-pham-vi')?.value || '';
        const q = new URLSearchParams({ pham_vi: pv });
        if (pv === 'VAI_TRO') q.set('vai_tro', document.getElementById('tb-ph-vai-tro')?.value || '');
        if (pv === 'CHUC_VU') q.set('chuc_vu', document.getElementById('tb-ph-chuc-vu')?.value || '');
        if (pv === 'NGUOI_DUNG') {
            const nid = document.getElementById('tb-ph-nguoi-id')?.value;
            if (nid) q.set('nguoi_nhan_id', nid);
            else { el.textContent = 'Chọn người nhận để xem số lượng'; return; }
        }
        const res = await this.apiGet(`/thong-bao/phat-hanh/dem-nguoi-nhan/?${q}`);
        const so = res?.so_nguoi_nhan ?? 0;
        el.textContent = `Ước tính: ${so} người sẽ nhận thông báo`;
    },

    _tbTimNguoiDungTimer: null,
    _tbTimNguoiDung(q) {
        clearTimeout(this._tbTimNguoiDungTimer);
        this._tbTimNguoiDungTimer = setTimeout(async () => {
            const sel = document.getElementById('tb-ph-nguoi-id');
            if (!sel) return;
            const term = (q || '').trim();
            if (term.length < 2) {
                sel.innerHTML = '<option value="">Nhập ít nhất 2 ký tự...</option>';
                return;
            }
            const res = await this.apiGet(`/users/?search=${encodeURIComponent(term)}&page_size=20`);
            const list = res?.results || (Array.isArray(res) ? res : []);
            sel.innerHTML = list.length
                ? list.map((u) => `<option value="${u.id}">${this._escTb(u.ho_ten)} — ${this._escTb(u.ten_dang_nhap)} (${this._escTb(u.vai_tro)})</option>`).join('')
                : '<option value="">Không tìm thấy</option>';
        }, 350);
    },

    async submitCreateNotification() {
        const tieuDe = document.getElementById('tb-ph-tieu-de')?.value?.trim();
        const noiDung = document.getElementById('tb-ph-noi-dung')?.value?.trim();
        const loai = document.getElementById('tb-ph-loai')?.value;
        const phamVi = document.getElementById('tb-ph-pham-vi')?.value;
        if (!tieuDe || !noiDung) {
            Toast.warning('Thiếu thông tin', 'Nhập tiêu đề và nội dung');
            return;
        }
        const body = {
            tieu_de: tieuDe,
            noi_dung: noiDung,
            loai_thong_bao: loai,
            pham_vi: phamVi,
        };
        if (phamVi === 'VAI_TRO') body.vai_tro = document.getElementById('tb-ph-vai-tro')?.value;
        if (phamVi === 'CHUC_VU') body.chuc_vu = document.getElementById('tb-ph-chuc-vu')?.value;
        if (phamVi === 'NGUOI_DUNG') {
            const nid = document.getElementById('tb-ph-nguoi-id')?.value;
            if (!nid) {
                Toast.warning('Chọn người nhận', '');
                return;
            }
            body.nguoi_nhan_id = nid;
        }
        const ok = window.Confirm
            ? await Confirm.hien({
                tieu: 'Gửi thông báo?',
                noi: document.getElementById('tb-ph-dem')?.textContent || 'Xác nhận gửi tới người nhận đã chọn.',
                ok: 'Gửi ngay',
                loai: 'default',
                icon: 'fa-paper-plane',
            })
            : window.confirm('Gửi thông báo?');
        if (!ok) return;

        const result = await this.apiPost('/thong-bao/phat-hanh/', body);
        if (this._isCrudOk(result)) {
            const so = result.so_nguoi_nhan ?? result.so_nguoi_nhan_thuc_te ?? 0;
            if (result.id || result.tieu_de || so > 0) {
                this.closeModal();
                Toast.success('Đã gửi', `Thông báo đã gửi tới ${so} người`);
                const today = this._tbTodayISO();
                const tuEl = document.getElementById('tb-ls-tu');
                const denEl = document.getElementById('tb-ls-den');
                if (tuEl) tuEl.value = today;
                if (denEl) denEl.value = today;
                if (document.getElementById('tb-ph-history-body')) {
                    await this.taiLichSuPhatHanh(result.id);
                } else {
                    await this.loadNotifications();
                }
                return;
            }
        }
        const msg = result?.error
            || (typeof result === 'object' ? this._formatApiErrorBody(result) : null)
            || 'Gửi thất bại — kiểm tra quyền Admin và đã migrate thongbao';
        Toast.error('Không gửi được', msg);
    },

    _formatApiErrorBody(body) {
        if (!body || typeof body !== 'object') return '';
        if (typeof body.detail === 'string') return body.detail;
        if (Array.isArray(body.detail)) return body.detail.join('; ');
        const parts = this._collectApiErrors(body);
        return parts.length ? parts.join('; ') : JSON.stringify(body);
    },
    
    addNotificationStyles() {
        /* notifications: css/admin-dashboard.css */
    },
    
    getNotificationIcon(loai) {
        const icons = {
            'HE_THONG': 'fa-server',
            'LICH_HEN': 'fa-calendar-alt',
            'DON_THUOC': 'fa-prescription-bottle',
            'TIEM_CHUNG': 'fa-syringe',
            'THANH_TOAN': 'fa-credit-card',
            'TAI_KHOAN': 'fa-user-circle'
        };
        return icons[loai] || 'fa-bell';
    },
    
    loadSettings() {
        const content = document.getElementById('admin-content');
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Cài đặt hệ thống</div>
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <label>Tên phòng khám</label>
                        <input type="text" class="form-control" id="clinic-name" value="PhòngKhám+">
                    </div>
                    <div class="form-group">
                        <label>Địa chỉ</label>
                        <input type="text" class="form-control" id="clinic-address" value="Số 123, Đường ABC, Quận XYZ, TP.HCM">
                    </div>
                    <div class="form-group">
                        <label>Số điện thoại</label>
                        <input type="text" class="form-control" id="clinic-phone" value="1900 1234">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" class="form-control" id="clinic-email" value="contact@phongkhamplus.vn">
                    </div>
                    <div class="form-group">
                        <label>Giờ làm việc mặc định</label>
                        <div class="form-row">
                            <input type="time" class="form-control" id="work-start" value="08:00">
                            <input type="time" class="form-control" id="work-end" value="17:00">
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="AdminDashboard.saveSettings()">
                        <i class="fas fa-save"></i> Lưu cài đặt
                    </button>
                </div>
            </div>
        `;
    },
    
    saveSettings() {
        Toast.success('Cài đặt đã được lưu');
    },
    
    // API calls
    // async apiGet(url) {
    //     const token = localStorage.getItem('access_token');
    //     try {
    //     // Đảm bảo url không bị trùng /api
    //     let apiUrl = url;
    //     if (url.startsWith('/api/')) {
    //         apiUrl = url; // Giữ nguyên nếu đã có /api
    //     } else if (url.startsWith('/')) {
    //         apiUrl = `/api${url}`; // Thêm /api nếu chưa có
    //     } else {
    //         apiUrl = `/api/${url}`;
    //     }
        
    //     const response = await fetch(apiUrl, {
    //         headers: {
    //             'Authorization': `Bearer ${token}`,
    //             'Content-Type': 'application/json'
    //         }
    //     });
    // }catch (error) {
    //         console.error('API error:', error);
    //         return null;
    //     }
    // },
    

    // async apiPost(url, data) {
    //     const token = localStorage.getItem('access_token');
    //     try {
    //         const response = await fetch(url, {
    //             method: 'POST',
    //             headers: {
    //                 'Authorization': `Bearer ${token}`,
    //                 'Content-Type': 'application/json'
    //             },
    //             body: JSON.stringify(data)
    //         });
    //         if (response.status === 401) {
    //             const refreshed = await this.refreshToken();
    //             if (refreshed) {
    //                 return this.apiPost(url, data);
    //             } else {
    //                 this.logout();
    //                 return null;
    //             }
    //         }
    //         return response.json();
    //     } catch (error) {
    //         console.error('API error:', error);
    //         return null;
    //     }
    // },

    // async apiPut(url, data) {
    //     const token = localStorage.getItem('access_token');
    //     try {
    //         const response = await fetch(url, {
    //             method: 'PUT',
    //             headers: {
    //                 'Authorization': `Bearer ${token}`,
    //                 'Content-Type': 'application/json'
    //             },
    //             body: JSON.stringify(data)
    //         });
    //         if (response.status === 401) {
    //             const refreshed = await this.refreshToken();
    //             if (refreshed) {
    //                 return this.apiPut(url, data);
    //             } else {
    //                 this.logout();
    //                 return null;
    //             }
    //         }
    //         return response.json();
    //     } catch (error) {
    //         console.error('API error:', error);
    //         return null;
    //     }
    // },
    
    // async apiDelete(url) {
    //     const token = localStorage.getItem('access_token');
    //     try {
    //         const response = await fetch(url, {
    //             method: 'DELETE',
    //             headers: {
    //                 'Authorization': `Bearer ${token}`,
    //                 'Content-Type': 'application/json'
    //             }
    //         });
    //         if (response.status === 401) {
    //             const refreshed = await this.refreshToken();
    //             if (refreshed) {
    //                 return this.apiDelete(url);
    //             } else {
    //                 this.logout();
    //                 return false;
    //             }
    //         }
    //         return response.ok;
    //     } catch (error) {
    //         console.error('API error:', error);
    //         return false;
    //     }
    // },
    

    // API calls
// async apiGet(url) {
//     const token = localStorage.getItem('access_token');
//     // Xử lý URL để tránh trùng /api
//     let apiUrl = url;
//     if (!url.startsWith('http') && !url.startsWith('/api/')) {
//         apiUrl = `/api${url.startsWith('/') ? url : '/' + url}`;
//     }
    
//     try {
//         const response = await fetch(apiUrl, {
//             headers: {
//                 'Authorization': `Bearer ${token}`,
//                 'Content-Type': 'application/json'
//             }
//         });
//         if (response.status === 401) {
//             const refreshed = await this.refreshToken();
//             if (refreshed) {
//                 return this.apiGet(url);
//             } else {
//                 this.logout();
//                 return null;
//             }
//         }
//         return response.json();
//     } catch (error) {
//         console.error('API error:', error);
//         return null;
//     }
// },

// dashboard.js - Sửa các hàm apiGet, apiPost, apiPut, apiDelete

    // dashboard.js - SỬA LẠI CÁC HÀM API

    _buildApiUrl(url) {
        if (!url) return '/api/';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/api/')) return url;
        if (url.startsWith('/')) return `/api${url}`;
        return `/api/${url}`;
    },

    /**
     * GET không nuốt lỗi: luôn trả { ok, status, body } để dashboard gộp từng phần.
     * (apiGet trả null khi HTTP != 2xx → Promise.all làm mất dữ liệu các API khác.)
     */
    async safeApiGet(url) {
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                console.error('[safeApiGet] HTML thay vì JSON:', apiUrl);
                return { ok: false, status: response.status, body: null };
            }
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) return this.safeApiGet(url);
                return { ok: false, status: 401, body: null };
            }
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                console.warn('[safeApiGet]', apiUrl, response.status, body);
            }
            return { ok: response.ok, status: response.status, body };
        } catch (e) {
            console.error('[safeApiGet] Error', apiUrl, e);
            return { ok: false, status: 0, body: null };
        }
    },

    /** Payload JsonResponse thống kê đơn: { success, data } hoặc chỉ data. */
    _unwrapThongKeDonHang(body) {
        if (!body || typeof body !== 'object') return {};
        if (body.success === false) return {};
        if (body.data && (body.data.tong_quan != null || Array.isArray(body.data.top_san_pham))) {
            return body.data;
        }
        if (body.tong_quan != null || Array.isArray(body.top_san_pham)) return body;
        return {};
    },

    async apiGet(url) {
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        const bustUrl = apiUrl + (apiUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
        
        console.log('[apiGet] Calling:', bustUrl);
        
        try {
            const response = await fetch(bustUrl, {
                cache: 'no-store',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('[apiGet] Response status:', response.status);
            
            // Nếu nhận HTML thay vì JSON thì endpoint có thể đang sai hoặc bị redirect
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                console.error('[apiGet] Received HTML instead of JSON');
                return null;
            }
            
            if (response.status === 401) {
                console.log('[apiGet] Token expired, trying refresh...');
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    console.log('[apiGet] Token refreshed, retrying...');
                    return this.apiGet(url);
                } else {
                    console.error('[apiGet] Refresh failed, logging out');
                    // this.logout();
                    return null;
                }
            }
            
            if (!response.ok) {
                const errBody = await response.json().catch(() => null);
                console.error('[apiGet] HTTP', response.status, errBody);
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            console.log('[apiGet] Success:', data);
            return data;
            
        } catch (error) {
            console.error('[apiGet] Error:', error);
            return null;
        }
    },

    async refreshToken() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            console.log('[refreshToken] No refresh token');
            return false;
        }
        
        try {
            console.log('[refreshToken] Refreshing token...');
            let response = await fetch('/api/token/refresh/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh: refreshToken })
            });
            if (!response.ok) {
                response = await fetch('/api/auth/lam-moi-token/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh: refreshToken })
                });
            }
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access);
                if (data.refresh) localStorage.setItem('refresh_token', data.refresh);
                console.log('[refreshToken] Success');
                return true;
            } else {
                console.log('[refreshToken] Failed:', response.status);
                return false;
            }
        } catch (error) {
            console.error('[refreshToken] Error:', error);
            return false;
        }
    },

    async logout() {
        const ok = window.Confirm
            ? await Confirm.dangXuat()
            : window.confirm('Bạn có chắc muốn đăng xuất?');
        if (!ok) return;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');
        window.location.href = '/login/';
    },
    
    async apiPost(url, data, options = {}) {
        const silent = options.silent === true;
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const text = await response.text();
            let result = {};
            if (text) {
                try {
                    result = JSON.parse(text);
                } catch(e) {
                    console.warn('Response not JSON:', text);
                }
            }
            
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    return this.apiPost(url, data, options);
                } else {
                    this.logout();
                    return null;
                }
            }
            
            if (!response.ok) {
                const detailMsgs = result.details ? this._collectApiErrors(result.details) : [];
                if (result.error && detailMsgs.length) {
                    throw new Error(`${result.error}: ${detailMsgs.join('; ')}`);
                }
                if (result.error) {
                    throw new Error(result.error);
                }
                if (result.detail) {
                    const detailText = typeof result.detail === 'string'
                        ? result.detail
                        : this._collectApiErrors(result.detail).join('; ');
                    throw new Error(detailText || String(result.detail));
                }
                const errorMessages = this._collectApiErrors(result);
                if (errorMessages.length) {
                    throw new Error(errorMessages.join('; '));
                }
                throw new Error(`Lỗi ${response.status}`);
            }
            
            return result;
        } catch (error) {
            console.error('API POST error:', error);
            if (!silent) Toast.error(error.message || 'Lỗi kết nối');
            return { error: error.message };
        }
    },

    /** POST multipart (upload ảnh thuốc/vaccine) — không set Content-Type để browser gửi boundary. */
    async apiPostFormData(url, formData) {
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            const text = await response.text();
            let result = {};
            if (text) {
                try { result = JSON.parse(text); } catch (e) { console.warn('Response not JSON:', text); }
            }
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) return this.apiPostFormData(url, formData);
                this.logout();
                return null;
            }
            if (!response.ok) {
                const msg = result.detail || result.error || (Array.isArray(result) ? JSON.stringify(result) : `HTTP ${response.status}`);
                Toast.error(typeof msg === 'string' ? msg : 'Lỗi tải lên');
                return { error: msg };
            }
            return result;
        } catch (error) {
            console.error('apiPostFormData:', error);
            Toast.error(error.message || 'Lỗi kết nối');
            return { error: error.message };
        }
    },

    async apiPatchFormData(url, formData) {
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        try {
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            const text = await response.text();
            let result = {};
            if (text) {
                try { result = JSON.parse(text); } catch (e) {}
            }
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) return this.apiPatchFormData(url, formData);
                this.logout();
                return null;
            }
            if (!response.ok) {
                const msg = result.detail || result.error || `HTTP ${response.status}`;
                Toast.error(typeof msg === 'string' ? msg : 'Lỗi cập nhật');
                return { error: msg };
            }
            return result;
        } catch (error) {
            console.error('apiPatchFormData:', error);
            Toast.error(error.message || 'Lỗi kết nối');
            return { error: error.message };
        }
    },

    // SỬA HÀM apiPut
    async apiPut(url, data, options = {}) {
        const silent = options.silent === true;
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        
        try {
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const text = await response.text();
            let result = {};
            if (text) {
                try {
                    result = JSON.parse(text);
                } catch(e) {}
            }
            
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    return this.apiPut(url, data, options);
                } else {
                    this.logout();
            return null;
                }
            }
            
            if (!response.ok) {
                const detailMsgs = result.details ? this._collectApiErrors(result.details) : [];
                if (result.error && detailMsgs.length) {
                    throw new Error(`${result.error}: ${detailMsgs.join('; ')}`);
                }
                if (result.error) throw new Error(result.error);
                if (result.detail) {
                    const detailText = typeof result.detail === 'string'
                        ? result.detail
                        : this._collectApiErrors(result.detail).join('; ');
                    throw new Error(detailText || String(result.detail));
                }
                const errorMessages = this._collectApiErrors(result);
                if (errorMessages.length) throw new Error(errorMessages.join('; '));
                throw new Error(`Lỗi ${response.status}`);
            }
            
            return result;
        } catch (error) {
            console.error('API PUT error:', error);
            if (!silent) Toast.error(error.message || 'Cập nhật thất bại');
            return { error: error.message };
        }
    },

    async apiPatch(url, data) {
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        
        try {
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const text = await response.text();
            let result = {};
            if (text) {
                try {
                    result = JSON.parse(text);
                } catch(e) {}
            }
            
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    return this.apiPatch(url, data);
                } else {
                    this.logout();
                    return null;
                }
            }
            
            if (!response.ok) {
                if (result.error) throw new Error(result.error);
                if (result.detail) throw new Error(result.detail);
                throw new Error(`Lỗi ${response.status}`);
            }
            
            return result;
        } catch (error) {
            console.error('API PATCH error:', error);
            Toast.error(error.message || 'Cập nhật thất bại');
            return { error: error.message };
        }
    },

    // SỬA HÀM apiDelete
    async apiDelete(url, options = {}) {
        const silent = options.silent === true;
        const token = localStorage.getItem('access_token');
        const apiUrl = this._buildApiUrl(url);
        
        try {
            const response = await fetch(apiUrl, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    return this.apiDelete(url, options);
                } else {
                    this.logout();
                    return false;
                }
            }

            if (!response.ok) {
                const text = await response.text();
                let result = {};
                if (text) {
                    try { result = JSON.parse(text); } catch (e) {}
                }
                const msg = this._formatApiError(result, 'Xóa thất bại');
                if (!silent) Toast.error(msg);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('API DELETE error:', error);
            if (!silent) Toast.error(error.message || 'Xóa thất bại');
            return false;
        }
    },
    
    // Global search
    async globalSearch(query) {
        const results = await this.apiGet(`/admin/search/?q=${encodeURIComponent(query)}`);
        const searchResults = document.getElementById('search-results');
        
        if (results && results.results?.length > 0) {
            searchResults.innerHTML = results.results.map(r => `
                <div class="search-result-item" onclick="AdminDashboard.navigateTo('${r.url}')">
                    <div class="search-result-type">
                        ${r.type === 'benh_nhan' ? 'Bệnh nhân' : r.type === 'bac_si' ? 'Bác sĩ' : 'Nhân viên'}
                    </div>
                    <div><strong>${r.ten}</strong> ${r.ma ? `(${r.ma})` : ''}</div>
                    ${r.chuyen_khoa ? `<div style="font-size: 11px; color: #64748b;">${r.chuyen_khoa}</div>` : ''}
                </div>
            `).join('');
            searchResults.classList.add('show');
        } else {
            searchResults.innerHTML = '<div class="search-result-item">Không tìm thấy kết quả</div>';
            searchResults.classList.add('show');
        }
    },
    
    navigateTo(url) {
        document.getElementById('search-results')?.classList.remove('show');
        document.getElementById('global-search').value = '';
        window.location.href = url;
    },
    
    // Modals
    showAddDoctorModal() {
        const suggestedCode = this._nextBacSiCodeFromList(this._currentData.doctors || []);
        this.showModal('Thêm bác sĩ mới', `
            <div class="form-group">
                <label>Họ tên *</label>
                <input type="text" id="doctor-name" class="form-control" placeholder="Nguyễn Văn A">
            </div>
            <div class="form-group">
                <label>Tên đăng nhập *</label>
                <input type="text" id="doctor-username" class="form-control" placeholder="ten_dang_nhap">
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" id="doctor-email" class="form-control" placeholder="email@example.com">
            </div>
            <div class="form-group">
                <label>Số điện thoại *</label>
                <input type="tel" id="doctor-phone" class="form-control" placeholder="0901234567">
            </div>
            <div class="form-group">
                <label>Mật khẩu *</label>
                <input type="password" id="doctor-password" class="form-control" placeholder="••••••••">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Mã bác sĩ (tự động)</label>
                    <input type="text" id="doctor-code" class="form-control" value="${suggestedCode}" readonly style="background:#f5f5f5;">
                    <p class="text-muted" style="font-size:12px;margin-top:4px;">Hệ thống cấp mã BS + năm + STT; nếu trùng sẽ tăng tiếp.</p>
                </div>
                <div class="form-group">
                    <label>Chuyên khoa *</label>
                    <input type="text" id="doctor-specialty" class="form-control" placeholder="Nội tổng quát">
                </div>
            </div>
            <div class="form-group">
                <label>Số giấy phép *</label>
                <input type="text" id="doctor-license" class="form-control" placeholder="123456789">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Trình độ</label>
                    <select id="doctor-degree" class="form-control">
                        <option value="BAC_SI">Bác sĩ</option>
                        <option value="BAC_SI_CK1">Bác sĩ chuyên khoa I</option>
                        <option value="BAC_SI_CK2">Bác sĩ chuyên khoa II</option>
                        <option value="THAC_SI">Thạc sĩ</option>
                        <option value="TIEN_SI">Tiến sĩ</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Chức vụ</label>
                    <select id="doctor-position" class="form-control">
                        <option value="">-- Chọn --</option>
                        <option value="BAC_SI_DIEU_TRI">Bác sĩ điều trị</option>
                        <option value="TRUONG_KHOA">Trưởng khoa</option>
                        <option value="PHO_KHOA">Phó khoa</option>
                    </select>
                </div>
            </div>
        `, async () => {
            const name = document.getElementById('doctor-name').value.trim();
            const username = document.getElementById('doctor-username').value.trim();
            const email = document.getElementById('doctor-email').value.trim();
            const phone = document.getElementById('doctor-phone').value.trim();
            const password = document.getElementById('doctor-password').value;
            const specialty = document.getElementById('doctor-specialty').value.trim();
            const license = document.getElementById('doctor-license').value.trim();

            if (!name || !username || !email || !phone || !password || !specialty || !license) {
                return this._reportCrudError({ error: 'Vui lòng nhập đầy đủ thông tin bắt buộc' });
            }
            if (password.length < 8) {
                return this._reportCrudError({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
            }
            if (!/[A-Z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
                return this._reportCrudError({ error: 'Mật khẩu cần có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt' });
            }

            const data = {
                nguoi_dung: {
                    ho_ten: name,
                    ten_dang_nhap: username,
                    email: email,
                    so_dien_thoai: phone,
                    password: password,
                    password2: password,
                    vai_tro: 'BAC_SI'
                },
                ma_bac_si: document.getElementById('doctor-code').value.trim(),
                chuyen_khoa: specialty,
                so_giay_phep: license,
                trinh_do: document.getElementById('doctor-degree').value,
                chuc_vu: document.getElementById('doctor-position').value
            };
            
            const result = await this.apiPost('/admin/bac-si/', data, { silent: true });
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm bác sĩ thành công!');
                await this.reloadCurrentPage();
            } else {
                this._reportCrudError(result, 'Thêm bác sĩ thất bại');
            }
        });
    },
    
    showAddStaffModal() {
        const suggestedCode = this._nextStaffCodeFromList(this._currentData.staff || []);
        this.showModal('Thêm nhân viên mới', `
            <div class="form-group">
                <label>Họ tên *</label>
                <input type="text" id="staff-name" class="form-control" placeholder="Nguyễn Văn A">
            </div>
            <div class="form-group">
                <label>Tên đăng nhập *</label>
                <input type="text" id="staff-username" class="form-control" placeholder="ten_dang_nhap">
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" id="staff-email" class="form-control" placeholder="email@example.com">
            </div>
            <div class="form-group">
                <label>Số điện thoại *</label>
                <input type="tel" id="staff-phone" class="form-control" placeholder="0901234567">
            </div>
            <div class="form-group">
                <label>Địa chỉ</label>
                <input type="text" id="staff-address" class="form-control" placeholder="Số nhà, đường, phường/xã...">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Ngày sinh</label>
                    <input type="date" id="staff-birth" class="form-control">
                </div>
                <div class="form-group">
                    <label>Giới tính</label>
                    <select id="staff-gender" class="form-control">
                        <option value="">-- Chọn --</option>
                        <option value="NAM">Nam</option>
                        <option value="NU">Nữ</option>
                        <option value="KHAC">Khác</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Mật khẩu *</label>
                <input type="password" id="staff-password" class="form-control" placeholder="••••••••">
            </div>
            <div class="form-group">
                <label>Nhập lại mật khẩu *</label>
                <input type="password" id="staff-password2" class="form-control" placeholder="••••••••">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Mã nhân viên *</label>
                    <input type="text" id="staff-code" class="form-control" value="${suggestedCode}" readonly style="background:#f5f5f5;">
                </div>
                <div class="form-group">
                    <label>Phòng ban *</label>
                    <input type="text" id="staff-department" class="form-control" placeholder="Lễ tân">
                </div>
            </div>
            <div class="form-group">
                <label>Chức vụ</label>
                <select id="staff-role" class="form-control">
                    <option value="LE_TAN">Lễ tân</option>
                    <option value="BAN_THUOC">Bán thuốc (quầy)</option>
                    <option value="KE_TOAN">Kế toán</option>
                </select>
            </div>
            <div class="form-group">
                <label>Ngày bắt đầu làm</label>
                <input type="date" id="staff-start-date" class="form-control">
            </div>
            <div class="form-group">
                <label>Mô tả công việc</label>
                <textarea id="staff-job-desc" class="form-control" rows="2" placeholder="(Tùy chọn)"></textarea>
            </div>
        `, async () => {
            const nd = {
                ho_ten: document.getElementById('staff-name').value.trim(),
                ten_dang_nhap: document.getElementById('staff-username').value.trim(),
                email: document.getElementById('staff-email').value.trim(),
                so_dien_thoai: this._normalizePhoneVN(document.getElementById('staff-phone').value),
                password: document.getElementById('staff-password').value,
                password2: document.getElementById('staff-password2').value,
                vai_tro: 'NHAN_VIEN'
            };
            const diaChi = document.getElementById('staff-address').value.trim();
            if (diaChi) nd.dia_chi = diaChi;
            const nsinh = document.getElementById('staff-birth').value;
            if (nsinh) nd.ngay_sinh = nsinh;
            const gen = document.getElementById('staff-gender').value;
            if (gen) nd.gioi_tinh = gen;

            const data = {
                nguoi_dung: nd,
                ma_nhan_vien: document.getElementById('staff-code').value.trim(),
                phong_ban: document.getElementById('staff-department').value.trim(),
                chuc_vu: document.getElementById('staff-role').value,
                ngay_bat_dau_lam: document.getElementById('staff-start-date').value || null,
                mo_ta_cong_viec: document.getElementById('staff-job-desc').value.trim()
            };

            if (!data.nguoi_dung.ho_ten || !data.nguoi_dung.ten_dang_nhap || !data.nguoi_dung.email ||
                !data.nguoi_dung.so_dien_thoai || !data.nguoi_dung.password || !data.nguoi_dung.password2 ||
                !data.ma_nhan_vien || !data.phong_ban) {
                return this._reportCrudError({ error: 'Vui lòng nhập đầy đủ thông tin bắt buộc' });
            }
            if (data.nguoi_dung.password !== data.nguoi_dung.password2) {
                return this._reportCrudError({ error: 'Mật khẩu nhập lại không khớp' });
            }
            if (data.nguoi_dung.password.length < 8) {
                return this._reportCrudError({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
            }
            if (!/[A-Z]/.test(data.nguoi_dung.password) || !/\d/.test(data.nguoi_dung.password) ||
                !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(data.nguoi_dung.password)) {
                return this._reportCrudError({ error: 'Mật khẩu cần có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt' });
            }
            
            const result = await this.apiPost('/admin/nhan-vien/', data, { silent: true });
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm nhân viên thành công!');
                await this.refreshStaffTable();
            } else {
                this._reportCrudError(result, 'Thêm nhân viên thất bại');
            }
        });
    },
    
    async showAddMedicineModal() {
        let loaiThuoc = [];
        let donViTinh = [];
        let nhaCungCap = [];
        try {
            const [lt, dv, ncc] = await Promise.all([
                this.apiGet('/thuoc/loai-thuoc/'),
                this.apiGet('/thuoc/don-vi-tinh/'),
                this.apiGet('/thuoc/nha-cung-cap/?page_size=200'),
            ]);
            loaiThuoc = this._extractList(lt);
            donViTinh = this._extractList(dv);
            nhaCungCap = this._extractList(ncc);
        } catch (e) {
            Toast.error('Không tải được danh mục loại thuốc/đơn vị tính/NCC');
            return;
        }
        if (!nhaCungCap.length) {
            Toast.error('Chưa có nhà cung cấp — vui lòng thêm NCC ở card phía trên trước khi thêm thuốc.');
            return;
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const defHanKho = new Date();
        defHanKho.setFullYear(defHanKho.getFullYear() + 1);
        const defHanStr = defHanKho.toISOString().slice(0, 10);

        this.showModal('Thêm thuốc mới', `
            <div class="form-group">
                <label>Tên thuốc *</label>
                <input type="text" id="medicine-name" class="form-control" placeholder="Paracetamol 500mg">
            </div>
            <div class="form-row">
            <div class="form-group">
                    <label>Loại thuốc *</label>
                    <select id="medicine-type" class="form-control">
                        <option value="">-- Chọn loại --</option>
                        ${loaiThuoc.length === 0 ? '<option value="" disabled>Chưa có dữ liệu loại thuốc</option>' : ''}
                        ${loaiThuoc.map(i => `<option value="${i.id}">${i.ten_loai}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Đơn vị tính *</label>
                    <select id="medicine-unit" class="form-control">
                        <option value="">-- Chọn đơn vị --</option>
                        ${donViTinh.length === 0 ? '<option value="" disabled>Chưa có dữ liệu đơn vị tính</option>' : ''}
                        ${donViTinh.map(i => `<option value="${i.id}">${i.ten_don_vi}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Giá nhập *</label>
                    <input type="number" id="medicine-import-price" class="form-control" placeholder="4000">
                </div>
                <div class="form-group">
                    <label>Giá bán *</label>
                    <input type="number" id="medicine-price" class="form-control" placeholder="5000">
                </div>
            </div>
            <div class="form-group">
                <label>Nhà cung cấp *</label>
                <select id="medicine-ncc" class="form-control">
                    <option value="">-- Chọn NCC --</option>
                    ${nhaCungCap.map((n) => `<option value="${n.id}">${this.escapeHtml(n.ma_ncc || '')} — ${this.escapeHtml(n.ten_ncc || '')}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Thành phần</label>
                <input type="text" id="medicine-ingredient" class="form-control" placeholder="Paracetamol">
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="medicine-desc" class="form-control" rows="3" placeholder="Mô tả về thuốc..."></textarea>
            </div>
            <div class="form-group">
                <label>Ảnh sản phẩm</label>
                <input type="file" id="medicine-image" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif">
                <p class="text-muted" style="font-size:12px;margin-top:4px;">JPG, PNG, WebP (tùy chọn)</p>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="medicine-prescription">
                    Là thuốc kê toa (cần đơn bác sĩ)
                </label>
            </div>
            <hr style="margin:16px 0;border:none;border-top:1px solid #e8eaed"/>
            <p class="text-muted" style="font-size:13px;margin-bottom:10px">
                <strong>Tồn kho đầu (tùy chọn)</strong> — nếu nhập, hệ thống tạo <strong>một lô</strong> với số lượng, ngày nhập kho và <strong>hạn sử dụng</strong> (theo model tồn kho).
            </p>
            <div class="form-row" style="display:flex;gap:12px;flex-wrap:wrap">
                <div class="form-group" style="min-width:120px">
                    <label>Số lượng lô đầu</label>
                    <input type="number" id="medicine-kho-sl" class="form-control" min="0" step="1" placeholder="Để trống hoặc 0"/>
                </div>
                <div class="form-group" style="min-width:140px">
                    <label>Ngày nhập kho</label>
                    <input type="date" id="medicine-kho-ngay" class="form-control" value="${todayStr}"/>
                </div>
                <div class="form-group" style="min-width:140px">
                    <label>Hạn sử dụng</label>
                    <input type="date" id="medicine-kho-han" class="form-control" value="${defHanStr}"/>
                </div>
            </div>
            <div class="form-group">
                <label>Số lô (lô SX)</label>
                <input type="text" id="medicine-kho-lo" class="form-control" placeholder="Tùy chọn"/>
            </div>
        `, async () => {
            const ksl = parseInt(document.getElementById('medicine-kho-sl')?.value || '0', 10) || 0;
            const kngay = document.getElementById('medicine-kho-ngay')?.value || '';
            const khan = document.getElementById('medicine-kho-han')?.value || '';
            const klo = (document.getElementById('medicine-kho-lo')?.value || '').trim();
            const coNhapKhoDau = ksl > 0 || !!kngay || !!khan || !!klo;
                if (coNhapKhoDau) {
                if (ksl < 1 || !kngay || !khan) {
                    Toast.error('Phần tồn đầu: nhập đủ số lượng (>0), ngày nhập kho và hạn sử dụng — hoặc để trống toàn bộ.');
                    return;
                }
                if (khan <= kngay) {
                    Toast.error('Hạn sử dụng phải sau ngày nhập kho.');
                    return;
                }
            }

            const nccId = document.getElementById('medicine-ncc')?.value || '';
            const data = {
                ten_thuoc: document.getElementById('medicine-name').value.trim(),
                loai_thuoc: document.getElementById('medicine-type').value,
                don_vi: document.getElementById('medicine-unit').value,
                don_gia_nhap: parseFloat(document.getElementById('medicine-import-price').value) || 0,
                gia_ban: parseFloat(document.getElementById('medicine-price').value) || 0,
                nha_san_xuat: '',
                nuoc_san_xuat: '',
                nha_cung_cap_id: nccId,
                thanh_phan: document.getElementById('medicine-ingredient').value.trim(),
                mo_ta: document.getElementById('medicine-desc').value.trim(),
                ty_le_ke_khai: 0,
                can_don_thuoc: !!document.getElementById('medicine-prescription')?.checked,
                trang_thai: true
            };

            if (!data.ten_thuoc || !data.loai_thuoc || !data.don_vi ||
                !data.don_gia_nhap || !data.gia_ban || !data.nha_cung_cap_id) {
                Toast.error('Vui lòng nhập đầy đủ các trường bắt buộc (gồm nhà cung cấp)');
                return;
            }
            
            try {
                const file = document.getElementById('medicine-image')?.files?.[0];
                let result;
                if (file) {
                    const fd = new FormData();
                    Object.entries(data).forEach(([k, v]) => {
                        if (typeof v === 'boolean') fd.append(k, v ? 'true' : 'false');
                        else fd.append(k, String(v));
                    });
                    fd.append('hinh_anh', file);
                    result = await this.apiPostFormData('/thuoc/thuoc/', fd);
                } else {
                    result = await this.apiPost('/thuoc/thuoc/', data);
                }
                if (this._isCrudOk(result)) {
                    const newId = result.id;
                    if (ksl > 0 && newId) {
                        const khoPayload = {
                            thuoc: newId,
                            so_luong: ksl,
                            ngay_nhap: kngay,
                            han_su_dung: khan,
                            lo_sx: klo,
                        };
                        const khoResult = await this.apiPost('/thuoc/kho-thuoc/', khoPayload);
                        if (khoResult && !khoResult.error) {
                            this.closeModal();
                            Toast.success('Đã thêm thuốc và tạo lô tồn đầu.');
                            await this.reloadCurrentPage();
                        } else {
                            this.closeModal();
                            Toast.hien('Thông báo', 'Đã lưu thuốc nhưng không tạo được lô kho — vui lòng nhập kho sau.', 'warning');
                            await this.reloadCurrentPage();
                        }
                    } else {
                        this.closeModal();
                        Toast.success('Thêm thuốc thành công!');
                        await this.reloadCurrentPage();
                    }
                } else {
                    Toast.error(result?.detail || result?.error || 'Thêm thuốc thất bại');
                }
            } catch (error) {
                Toast.error('Không thể thêm thuốc. Vui lòng thử lại.');
            }
        });
    },

    showAddLoaiThuocModal() {
        this.showModal('Thêm loại thuốc', `
            <div class="form-group">
                <label>Tên loại *</label>
                <input type="text" id="loai-thuoc-name" class="form-control" placeholder="Kháng sinh">
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="loai-thuoc-desc" class="form-control" rows="3" placeholder="Mô tả ngắn"></textarea>
            </div>
        `, async () => {
            const payload = {
                ten_loai: document.getElementById('loai-thuoc-name').value.trim(),
                mo_ta: document.getElementById('loai-thuoc-desc').value.trim()
            };
            if (!payload.ten_loai) return Toast.error('Tên loại thuốc là bắt buộc');
            const result = await this.apiPost('/thuoc/loai-thuoc/', payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm loại thuốc thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.error || 'Thêm loại thuốc thất bại');
            }
        });
    },

    async editLoaiThuoc(id) {
        const item = await this.apiGet(`/thuoc/loai-thuoc/${id}/`);
        if (!item) return Toast.error('Không tải được thông tin loại thuốc');
        this.showModal('Sửa loại thuốc', `
            <div class="form-group">
                <label>Tên loại *</label>
                <input type="text" id="edit-loai-thuoc-name" class="form-control" value="${this.escapeHtml(item.ten_loai || '')}">
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="edit-loai-thuoc-desc" class="form-control" rows="3">${this.escapeHtml(item.mo_ta || '')}</textarea>
            </div>
        `, async () => {
            const payload = {
                ten_loai: document.getElementById('edit-loai-thuoc-name').value.trim(),
                mo_ta: document.getElementById('edit-loai-thuoc-desc').value.trim()
            };
            if (!payload.ten_loai) return Toast.error('Tên loại thuốc là bắt buộc');
            const result = await this.apiPut(`/thuoc/loai-thuoc/${id}/`, payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật loại thuốc thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.error || 'Cập nhật loại thuốc thất bại');
            }
        });
    },

    async deleteLoaiThuoc(id, ten) {
        if (!confirm(`Bạn có chắc muốn xóa loại thuốc "${ten}"?`)) return;
        const success = await this.apiDelete(`/thuoc/loai-thuoc/${id}/`);
        if (success) {
            Toast.success('Đã xóa loại thuốc thành công!');
            await this.reloadCurrentPage();
        } else {
            Toast.error('Xóa loại thuốc thất bại');
        }
    },

    showAddDonViTinhModal() {
        this.showModal('Thêm đơn vị tính', `
            <div class="form-group">
                <label>Tên đơn vị *</label>
                <input type="text" id="don-vi-name" class="form-control" placeholder="Viên">
            </div>
            <div class="form-group">
                <label>Ký hiệu</label>
                <input type="text" id="don-vi-symbol" class="form-control" placeholder="v">
            </div>
        `, async () => {
            const payload = {
                ten_don_vi: document.getElementById('don-vi-name').value.trim(),
                ky_hieu: document.getElementById('don-vi-symbol').value.trim()
            };
            if (!payload.ten_don_vi) return Toast.error('Tên đơn vị tính là bắt buộc');
            const result = await this.apiPost('/thuoc/don-vi-tinh/', payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm đơn vị tính thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.error || 'Thêm đơn vị tính thất bại');
            }
        });
    },

    async editDonViTinh(id) {
        const item = await this.apiGet(`/thuoc/don-vi-tinh/${id}/`);
        if (!item) return Toast.error('Không tải được thông tin đơn vị tính');
        this.showModal('Sửa đơn vị tính', `
            <div class="form-group">
                <label>Tên đơn vị *</label>
                <input type="text" id="edit-don-vi-name" class="form-control" value="${this.escapeHtml(item.ten_don_vi || '')}">
            </div>
            <div class="form-group">
                <label>Ký hiệu</label>
                <input type="text" id="edit-don-vi-symbol" class="form-control" value="${this.escapeHtml(item.ky_hieu || '')}">
            </div>
        `, async () => {
            const payload = {
                ten_don_vi: document.getElementById('edit-don-vi-name').value.trim(),
                ky_hieu: document.getElementById('edit-don-vi-symbol').value.trim()
            };
            if (!payload.ten_don_vi) return Toast.error('Tên đơn vị tính là bắt buộc');
            const result = await this.apiPut(`/thuoc/don-vi-tinh/${id}/`, payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật đơn vị tính thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.error || 'Cập nhật đơn vị tính thất bại');
            }
        });
    },

    async deleteDonViTinh(id, ten) {
        if (!confirm(`Bạn có chắc muốn xóa đơn vị tính "${ten}"?`)) return;
        const success = await this.apiDelete(`/thuoc/don-vi-tinh/${id}/`);
        if (success) {
            Toast.success('Đã xóa đơn vị tính thành công!');
            await this.reloadCurrentPage();
        } else {
            Toast.error('Xóa đơn vị tính thất bại');
        }
    },

    showAddNccModal() {
        this.showModal('Thêm nhà cung cấp', `
            <div class="form-group">
                <label>Mã NCC *</label>
                <input type="text" id="ncc-ma" class="form-control" placeholder="VD: NCC001">
            </div>
            <div class="form-group">
                <label>Tên nhà cung cấp *</label>
                <input type="text" id="ncc-ten" class="form-control">
            </div>
            <div class="form-group">
                <label>Địa chỉ *</label>
                <textarea id="ncc-dc" class="form-control" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>Số điện thoại *</label>
                <input type="text" id="ncc-sdt" class="form-control">
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="ncc-email" class="form-control">
            </div>
            <div class="form-group">
                <label>Mã số thuế</label>
                <input type="text" id="ncc-mst" class="form-control">
            </div>
            <div class="form-group">
                <label>Người liên hệ</label>
                <input type="text" id="ncc-nlh" class="form-control">
            </div>
        `, async () => {
            const payload = {
                ma_ncc: document.getElementById('ncc-ma').value.trim(),
                ten_ncc: document.getElementById('ncc-ten').value.trim(),
                dia_chi: document.getElementById('ncc-dc').value.trim(),
                so_dien_thoai: document.getElementById('ncc-sdt').value.trim(),
                email: document.getElementById('ncc-email').value.trim(),
                ma_so_thue: document.getElementById('ncc-mst').value.trim(),
                nguoi_lien_he: document.getElementById('ncc-nlh').value.trim(),
                ghi_chu: '',
                trang_thai: true,
            };
            if (!payload.ma_ncc || !payload.ten_ncc || !payload.dia_chi || !payload.so_dien_thoai) {
                return Toast.error('Điền đủ mã, tên, địa chỉ và số điện thoại');
            }
            const result = await this.apiPost('/thuoc/nha-cung-cap/', payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Thêm nhà cung cấp thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Thêm NCC thất bại');
            }
        });
    },

    async editNcc(id) {
        const item = await this.apiGet(`/thuoc/nha-cung-cap/${id}/`);
        if (!item) return Toast.error('Không tải được thông tin NCC');
        this.showModal('Sửa nhà cung cấp', `
            <div class="form-group">
                <label>Mã NCC *</label>
                <input type="text" id="edit-ncc-ma" class="form-control" value="${this.escapeHtml(item.ma_ncc || '')}">
            </div>
            <div class="form-group">
                <label>Tên *</label>
                <input type="text" id="edit-ncc-ten" class="form-control" value="${this.escapeHtml(item.ten_ncc || '')}">
            </div>
            <div class="form-group">
                <label>Địa chỉ *</label>
                <textarea id="edit-ncc-dc" class="form-control" rows="2">${this.escapeHtml(item.dia_chi || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Số điện thoại *</label>
                <input type="text" id="edit-ncc-sdt" class="form-control" value="${this.escapeHtml(item.so_dien_thoai || '')}">
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="edit-ncc-email" class="form-control" value="${this.escapeHtml(item.email || '')}">
            </div>
            <div class="form-group">
                <label>Mã số thuế</label>
                <input type="text" id="edit-ncc-mst" class="form-control" value="${this.escapeHtml(item.ma_so_thue || '')}">
            </div>
            <div class="form-group">
                <label>Người liên hệ</label>
                <input type="text" id="edit-ncc-nlh" class="form-control" value="${this.escapeHtml(item.nguoi_lien_he || '')}">
            </div>
            <div class="form-group">
                <label><input type="checkbox" id="edit-ncc-tt" ${item.trang_thai ? 'checked' : ''}/> Đang hợp tác</label>
            </div>
        `, async () => {
            const payload = {
                ma_ncc: document.getElementById('edit-ncc-ma').value.trim(),
                ten_ncc: document.getElementById('edit-ncc-ten').value.trim(),
                dia_chi: document.getElementById('edit-ncc-dc').value.trim(),
                so_dien_thoai: document.getElementById('edit-ncc-sdt').value.trim(),
                email: document.getElementById('edit-ncc-email').value.trim(),
                ma_so_thue: document.getElementById('edit-ncc-mst').value.trim(),
                nguoi_lien_he: document.getElementById('edit-ncc-nlh').value.trim(),
                ghi_chu: item.ghi_chu || '',
                trang_thai: document.getElementById('edit-ncc-tt').checked,
            };
            if (!payload.ma_ncc || !payload.ten_ncc || !payload.dia_chi || !payload.so_dien_thoai) {
                return Toast.error('Điền đủ các trường bắt buộc');
            }
            const result = await this.apiPut(`/thuoc/nha-cung-cap/${id}/`, payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật NCC thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.detail || result?.error || 'Cập nhật thất bại');
            }
        });
    },

    async deleteNcc(id, ten) {
        if (!confirm(`Bạn có chắc muốn xóa nhà cung cấp "${ten}"?`)) return;
        const success = await this.apiDelete(`/thuoc/nha-cung-cap/${id}/`);
        if (success) {
            Toast.success('Đã xóa NCC thành công!');
            await this.reloadCurrentPage();
        } else {
            Toast.error('Xóa NCC thất bại');
        }
    },
    
    _tinhTongTienNhapPreview(soLuong, donGia) {
        const sl = parseInt(String(soLuong || '0'), 10);
        const dg = parseFloat(String(donGia || '0'));
        if (!sl || sl < 1 || !dg) return 0;
        return sl * dg;
    },

    _bindNhapKhoTongTienPreview(catalogById, opts = {}) {
        const { selectId, qtyId, previewId, loai = 'thuoc' } = opts;
        const sel = document.getElementById(selectId);
        const qty = document.getElementById(qtyId);
        const preview = document.getElementById(previewId);
        if (!sel || !qty || !preview) return;
        const refresh = () => {
            const row = catalogById[String(sel.value || '')] || {};
            const dg = loai === 'vaccine' ? row.gia_nhap : row.don_gia_nhap;
            const tong = this._tinhTongTienNhapPreview(qty.value, dg);
            const dgStr = dg != null && dg !== '' ? this.formatMoney(dg) : '—';
            preview.innerHTML =
                tong > 0
                    ? `<strong>Tổng tiền nhập (ước tính):</strong> ${this.formatMoney(tong)} <span class="text-muted">(SL × ĐG nhập ${dgStr})</span>`
                    : '<span class="text-muted">Chưa có đơn giá nhập trên danh mục — cập nhật giá thuốc/vaccine trước.</span>';
        };
        sel.addEventListener('change', refresh);
        qty.addEventListener('input', refresh);
        refresh();
    },

    showModal(title, body, onConfirm) {
        const modalContainer = document.getElementById('modal-container');
        const modalId = 'dynamic-modal-' + Date.now();
        
        modalContainer.innerHTML = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button type="button" class="btn btn-ghost" onclick="AdminDashboard.closeModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <div id="modal-crud-alert" class="form-alert error d-none" role="alert"></div>
                        ${body}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline" onclick="AdminDashboard.closeModal()">Hủy</button>
                        <button type="button" class="btn btn-primary" id="modal-confirm-btn">Xác nhận</button>
                    </div>
                </div>
            </div>
        `;
        
        const modal = document.getElementById(modalId);
        setTimeout(() => modal.classList.add('open'), 10);
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        confirmBtn.onclick = async () => {
            this._clearModalError();
            confirmBtn.disabled = true;
            const originalLabel = confirmBtn.textContent;
            confirmBtn.textContent = 'Đang xử lý...';
            try {
                await onConfirm();
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = originalLabel;
            }
        };
    },
    
    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) {
            modal.classList.remove('open');
            setTimeout(() => modal.remove(), 300);
        }
    },
    
    /** PK bác sĩ / nhân viên = UUID (nguoi_dung); API serialize FK thường là chuỗi, không có .id */
    _pkBacSi(dr) {
        if (!dr) return '';
        if (dr.nguoi_dung_id) return String(dr.nguoi_dung_id);
        const u = dr.nguoi_dung;
        if (typeof u === 'string') return u;
        if (u && typeof u === 'object' && u.id) return String(u.id);
        return '';
    },
    _pkNhanVien(nv) {
        if (!nv) return '';
        if (nv.nguoi_dung_id) return String(nv.nguoi_dung_id);
        const u = nv.nguoi_dung;
        if (typeof u === 'string') return u;
        if (u && typeof u === 'object' && u.id) return String(u.id);
        return '';
    },

    /** Chuẩn hóa SĐT VN (0 + 9–10 số) — khớp validator backend, tránh 400 khi thiếu số 0 hoặc +84 */
    _normalizePhoneVN(s) {
        let d = String(s || '').replace(/\D/g, '');
        if (d.startsWith('84') && d.length >= 11 && d[2] === '9') {
            d = '0' + d.slice(2);
            if (d.length > 11) d = d.slice(0, 11);
        } else if (d.length === 9 && d[0] === '9') {
            d = '0' + d;
        }
        return d;
    },

    // Actions
    async deleteDoctor(ma, ten) {
        if (!ma || ma === 'undefined' || ma === 'null') {
            Toast.error('Không xác định được ID bác sĩ (UUID).');
            return;
        }
        if (confirm(`Bạn có chắc muốn xóa bác sĩ "${ten}"?`)) {
            const success = await this.apiDelete(`/admin/bac-si/${ma}/`);
            if (success) {
                Toast.success('Xóa bác sĩ thành công!');
                await this.reloadCurrentPage();
            }
        }
    },
    
    async deleteStaff(ma, ten) {
        if (!ma || ma === 'undefined' || ma === 'null') {
            Toast.error('Không xác định được ID nhân viên (UUID).');
            return;
        }
        if (confirm(`Bạn có chắc muốn xóa nhân viên "${ten}"?`)) {
            const success = await this.apiDelete(`/admin/nhan-vien/${ma}/`);
            if (success) {
                Toast.success('Xóa nhân viên thành công!');
                await this.refreshStaffTable();
            }
        }
    },
    
    viewPatient(id) {
        window.location.href = `/admin/benh-nhan/${id}`;
    },
    
    async editDoctor(ma) {
        if (!ma || ma === 'undefined' || ma === 'null') {
            return Toast.error('Không xác định ID bác sĩ (UUID).');
        }
        const dr = await this.apiGet(`/admin/bac-si/${ma}/`);
        if (!dr) return Toast.error('Không tải được thông tin bác sĩ');
        const userId = this._pkBacSi(dr) || (typeof dr.nguoi_dung === 'string' ? dr.nguoi_dung : '');
        const userDetail = userId ? await this.apiGet(`/users/${userId}/`) : null;
        const profile = userDetail && !userDetail.error ? userDetail : {};
        const td = dr.trinh_do || 'BAC_SI';
        const cv = dr.chuc_vu || '';

        this.showModal('Cập nhật bác sĩ', `
            <div class="form-group">
                <label>Họ tên *</label>
                <input type="text" id="edit-doctor-name" class="form-control" value="${this.escapeHtml(profile.ho_ten || dr.ho_ten || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" id="edit-doctor-email" class="form-control" value="${this.escapeHtml(profile.email || dr.email || '')}">
                </div>
                <div class="form-group">
                    <label>Số điện thoại *</label>
                    <input type="tel" id="edit-doctor-phone" class="form-control" value="${this.escapeHtml(profile.so_dien_thoai || dr.so_dien_thoai || '')}">
                </div>
            </div>
            <div class="form-group">
                <label>Địa chỉ</label>
                <input type="text" id="edit-doctor-address" class="form-control" value="${this.escapeHtml(profile.dia_chi || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Ngày sinh</label>
                    <input type="date" id="edit-doctor-birth" class="form-control" value="${(profile.ngay_sinh || '').slice(0, 10)}">
                </div>
                <div class="form-group">
                    <label>Giới tính</label>
                    <select id="edit-doctor-gender" class="form-control">
                        <option value="" ${(profile.gioi_tinh || '') === '' ? 'selected' : ''}>-- Chọn --</option>
                        <option value="NAM" ${(profile.gioi_tinh || '') === 'NAM' ? 'selected' : ''}>Nam</option>
                        <option value="NU" ${(profile.gioi_tinh || '') === 'NU' ? 'selected' : ''}>Nữ</option>
                        <option value="KHAC" ${(profile.gioi_tinh || '') === 'KHAC' ? 'selected' : ''}>Khác</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Chuyên khoa *</label>
                <input type="text" id="edit-doctor-specialty" class="form-control" value="${this.escapeHtml(dr.chuyen_khoa || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Trình độ</label>
                    <select id="edit-doctor-degree" class="form-control">
                        <option value="Y_SI" ${td === 'Y_SI' ? 'selected' : ''}>Y sĩ</option>
                        <option value="BAC_SI" ${td === 'BAC_SI' ? 'selected' : ''}>Bác sĩ</option>
                        <option value="BAC_SI_CK1" ${td === 'BAC_SI_CK1' ? 'selected' : ''}>Bác sĩ chuyên khoa I</option>
                        <option value="BAC_SI_CK2" ${td === 'BAC_SI_CK2' ? 'selected' : ''}>Bác sĩ chuyên khoa II</option>
                        <option value="THAC_SI" ${td === 'THAC_SI' ? 'selected' : ''}>Thạc sĩ</option>
                        <option value="TIEN_SI" ${td === 'TIEN_SI' ? 'selected' : ''}>Tiến sĩ</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Chức vụ</label>
                    <select id="edit-doctor-position" class="form-control">
                        <option value="" ${cv === '' ? 'selected' : ''}>-- Chọn --</option>
                        <option value="TRUONG_KHOA" ${cv === 'TRUONG_KHOA' ? 'selected' : ''}>Trưởng khoa</option>
                        <option value="PHO_KHOA" ${cv === 'PHO_KHOA' ? 'selected' : ''}>Phó khoa</option>
                        <option value="BAC_SI_CHU_NHIEM" ${cv === 'BAC_SI_CHU_NHIEM' ? 'selected' : ''}>Bác sĩ chủ nhiệm</option>
                        <option value="BAC_SI_DIEU_TRI" ${cv === 'BAC_SI_DIEU_TRI' ? 'selected' : ''}>Bác sĩ điều trị</option>
                        <option value="BAC_SI_NOI_TRU" ${cv === 'BAC_SI_NOI_TRU' ? 'selected' : ''}>Bác sĩ nội trú</option>
                        <option value="THUC_TAP_SINH" ${cv === 'THUC_TAP_SINH' ? 'selected' : ''}>Thực tập sinh</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Trạng thái làm việc</label>
                <select id="edit-doctor-working" class="form-control">
                    <option value="true" ${dr.is_working ? 'selected' : ''}>Đang làm việc</option>
                    <option value="false" ${!dr.is_working ? 'selected' : ''}>Đã nghỉ</option>
                </select>
            </div>
        `, async () => {
            const payload = {
                nguoi_dung: {
                    ho_ten: document.getElementById('edit-doctor-name').value.trim(),
                    email: document.getElementById('edit-doctor-email').value.trim(),
                    so_dien_thoai: document.getElementById('edit-doctor-phone').value.trim(),
                    dia_chi: document.getElementById('edit-doctor-address').value.trim(),
                    ngay_sinh: document.getElementById('edit-doctor-birth').value || null,
                    gioi_tinh: document.getElementById('edit-doctor-gender').value || ''
                },
                chuyen_khoa: document.getElementById('edit-doctor-specialty').value.trim(),
                trinh_do: document.getElementById('edit-doctor-degree').value.trim(),
                chuc_vu: document.getElementById('edit-doctor-position').value.trim(),
                is_working: document.getElementById('edit-doctor-working').value === 'true'
            };
            if (!payload.nguoi_dung.ho_ten || !payload.nguoi_dung.email || !payload.nguoi_dung.so_dien_thoai || !payload.chuyen_khoa) {
                return this._reportCrudError({ error: 'Vui lòng nhập đầy đủ họ tên, email, số điện thoại và chuyên khoa' });
            }
            const result = await this.apiPut(`/admin/bac-si/${ma}/`, payload, { silent: true });
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật bác sĩ thành công!');
                await this.reloadCurrentPage();
            } else {
                this._reportCrudError(result, 'Cập nhật bác sĩ thất bại');
            }
        });
    },
    
    async editStaff(ma) {
        if (!ma || ma === 'undefined' || ma === 'null') {
            return Toast.error('Không xác định ID nhân viên (UUID).');
        }
        const nv = await this.apiGet(`/admin/nhan-vien/${ma}/`);
        if (!nv) return Toast.error('Không tải được thông tin nhân viên');
        const userId = this._pkNhanVien(nv) || (typeof nv.nguoi_dung === 'string' ? nv.nguoi_dung : '');
        const userDetail = userId ? await this.apiGet(`/users/${userId}/`) : null;
        const profile = userDetail && !userDetail.error ? userDetail : {};

        this.showModal('Cập nhật nhân viên', `
            <div class="form-group">
                <label>Họ tên *</label>
                <input type="text" id="edit-staff-name" class="form-control" value="${this.escapeHtml(profile.ho_ten || nv.ho_ten || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" id="edit-staff-email" class="form-control" value="${this.escapeHtml(profile.email || nv.email || '')}">
                </div>
                <div class="form-group">
                    <label>Số điện thoại *</label>
                    <input type="tel" id="edit-staff-phone" class="form-control" value="${this.escapeHtml(profile.so_dien_thoai || nv.so_dien_thoai || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Ngày sinh</label>
                    <input type="date" id="edit-staff-birth" class="form-control" value="${(profile.ngay_sinh || '').slice(0, 10)}">
                </div>
                <div class="form-group">
                    <label>Giới tính</label>
                    <select id="edit-staff-gender" class="form-control">
                        <option value="" ${(profile.gioi_tinh || '') === '' ? 'selected' : ''}>-- Chọn --</option>
                        <option value="NAM" ${(profile.gioi_tinh || '') === 'NAM' ? 'selected' : ''}>Nam</option>
                        <option value="NU" ${(profile.gioi_tinh || '') === 'NU' ? 'selected' : ''}>Nữ</option>
                        <option value="KHAC" ${(profile.gioi_tinh || '') === 'KHAC' ? 'selected' : ''}>Khác</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Địa chỉ</label>
                <input type="text" id="edit-staff-address" class="form-control" value="${this.escapeHtml(profile.dia_chi || '')}">
            </div>
            <div class="form-group">
                <label>Phòng ban</label>
                <input type="text" id="edit-staff-department" class="form-control" value="${nv.phong_ban || ''}">
            </div>
            <div class="form-group">
                <label>Chức vụ</label>
                <select id="edit-staff-role" class="form-control">
                    <option value="LE_TAN" ${(nv.chuc_vu || '') === 'LE_TAN' ? 'selected' : ''}>Lễ tân</option>
                    <option value="BAN_THUOC" ${(nv.chuc_vu || '') === 'BAN_THUOC' ? 'selected' : ''}>Bán thuốc (quầy)</option>
                    <option value="KE_TOAN" ${(nv.chuc_vu || '') === 'KE_TOAN' ? 'selected' : ''}>Kế toán</option>
                </select>
            </div>
            <div class="form-group">
                <label>Ngày bắt đầu làm</label>
                <input type="date" id="edit-staff-start-date" class="form-control" value="${(nv.ngay_bat_dau_lam || '').slice(0, 10)}">
            </div>
            <div class="form-group">
                <label>Mô tả công việc</label>
                <textarea id="edit-staff-job-desc" class="form-control" rows="2">${this.escapeHtml(nv.mo_ta_cong_viec || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Trạng thái làm việc</label>
                <select id="edit-staff-working" class="form-control">
                    <option value="true" ${nv.is_working ? 'selected' : ''}>Đang làm việc</option>
                    <option value="false" ${!nv.is_working ? 'selected' : ''}>Đã nghỉ</option>
                </select>
            </div>
        `, async () => {
            const payload = {
                nguoi_dung: {
                    ho_ten: document.getElementById('edit-staff-name').value.trim(),
                    email: document.getElementById('edit-staff-email').value.trim(),
                    so_dien_thoai: document.getElementById('edit-staff-phone').value.trim(),
                    dia_chi: document.getElementById('edit-staff-address').value.trim(),
                    ngay_sinh: document.getElementById('edit-staff-birth').value || null,
                    gioi_tinh: document.getElementById('edit-staff-gender').value || ''
                },
                phong_ban: document.getElementById('edit-staff-department').value.trim(),
                chuc_vu: document.getElementById('edit-staff-role').value.trim(),
                ngay_bat_dau_lam: document.getElementById('edit-staff-start-date').value || null,
                mo_ta_cong_viec: document.getElementById('edit-staff-job-desc').value.trim(),
                is_working: document.getElementById('edit-staff-working').value === 'true'
            };
            if (!payload.nguoi_dung.ho_ten || !payload.nguoi_dung.email || !payload.nguoi_dung.so_dien_thoai || !payload.phong_ban) {
                return this._reportCrudError({ error: 'Vui lòng nhập đầy đủ họ tên, email, số điện thoại và phòng ban' });
            }
            const result = await this.apiPut(`/admin/nhan-vien/${ma}/`, payload, { silent: true });
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật nhân viên thành công!');
                await this.refreshStaffTable();
            } else {
                this._reportCrudError(result, 'Cập nhật nhân viên thất bại');
            }
        });
    },
    
    async editMedicine(id) {
        const med = await this.apiGet(`/thuoc/thuoc/${id}/`);
        if (!med) return Toast.error('Không tải được thông tin thuốc');
        let loaiThuoc = [];
        let nhaCungCap = [];
        try {
            const [lt, ncc] = await Promise.all([
                this.apiGet('/thuoc/loai-thuoc/'),
                this.apiGet('/thuoc/nha-cung-cap/?page_size=200'),
            ]);
            loaiThuoc = this._extractList(lt);
            nhaCungCap = this._extractList(ncc);
        } catch (e) {
            loaiThuoc = [];
        }
        const loaiHienTai = String(med.loai_thuoc || '');
        const nccHienTai = Array.isArray(med.nha_cung_cap) && med.nha_cung_cap[0] ? String(med.nha_cung_cap[0].id) : '';
        const imgUrl = med.hinh_anh_url || '';
        this.showModal('Cập nhật thuốc', `
            ${imgUrl ? `<div class="form-group"><label>Ảnh hiện tại</label><br><img src="${this.escapeHtml(imgUrl)}" alt="" style="max-height:120px;border-radius:8px;object-fit:contain"></div>` : ''}
            <div class="form-group">
                <label>Đổi ảnh</label>
                <input type="file" id="edit-med-image" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif">
            </div>
            <div class="form-group">
                <label>Tên thuốc</label>
                <input type="text" id="edit-med-name" class="form-control" value="${med.ten_thuoc || ''}">
            </div>
            <div class="form-group">
                <label>Loại thuốc</label>
                <select id="edit-med-type" class="form-control">
                    <option value="">-- Chọn loại --</option>
                    ${loaiThuoc.map(i => `<option value="${i.id}" ${String(i.id) === loaiHienTai ? 'selected' : ''}>${this.escapeHtml(i.ten_loai || '')}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Nhà cung cấp</label>
                <select id="edit-med-ncc" class="form-control">
                    <option value="">-- Chọn NCC --</option>
                    ${nhaCungCap.map((n) => `<option value="${n.id}" ${String(n.id) === nccHienTai ? 'selected' : ''}>${this.escapeHtml(n.ma_ncc || '')} — ${this.escapeHtml(n.ten_ncc || '')}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Giá bán</label>
                <input type="number" id="edit-med-price" class="form-control" value="${med.gia_ban || 0}">
            </div>
            <div class="form-group">
                <label>Thành phần</label>
                <input type="text" id="edit-med-ingredient" class="form-control" value="${med.thanh_phan || ''}">
            </div>
            <div class="form-group">
                <label>Mô tả</label>
                <textarea id="edit-med-desc" class="form-control" rows="3">${med.mo_ta || ''}</textarea>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="edit-med-prescription" ${med.can_don_thuoc ? 'checked' : ''}>
                    Là thuốc kê toa (cần đơn bác sĩ)
                </label>
            </div>
        `, async () => {
            const nid = (document.getElementById('edit-med-ncc')?.value || '').trim();
            const payload = {
                ten_thuoc: document.getElementById('edit-med-name').value.trim(),
                loai_thuoc: document.getElementById('edit-med-type')?.value || med.loai_thuoc,
                gia_ban: parseFloat(document.getElementById('edit-med-price').value) || 0,
                thanh_phan: document.getElementById('edit-med-ingredient').value.trim(),
                mo_ta: document.getElementById('edit-med-desc').value.trim(),
                can_don_thuoc: !!document.getElementById('edit-med-prescription')?.checked,
                nha_cung_cap_id: nid || null,
            };
            const file = document.getElementById('edit-med-image')?.files?.[0];
            let result;
            if (file) {
                result = await this.apiPatch(`/thuoc/thuoc/${id}/`, payload);
                if (this._isCrudOk(result)) {
                    const fd = new FormData();
                    fd.append('hinh_anh', file);
                    result = await this.apiPatchFormData(`/thuoc/thuoc/${id}/`, fd);
                }
            } else {
                result = await this.apiPatch(`/thuoc/thuoc/${id}/`, payload);
            }
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Cập nhật thuốc thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.error || 'Cập nhật thất bại');
            }
        });
    },

    async showNhapKhoModal(defaultThuocId = '') {
        let thuocList = [];
        try {
            const res = await this.apiGet('/thuoc/thuoc/');
            thuocList = this._extractList(res);
        } catch (e) {
            return Toast.error('Không tải được danh sách thuốc');
        }

        if (!thuocList.length) {
            Toast.error('Chưa có thuốc để nhập kho');
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const oneYearLater = new Date();
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        const defaultHan = oneYearLater.toISOString().slice(0, 10);

        this.showModal('Nhập kho thuốc', `
            <div class="form-group">
                <label>Thuốc *</label>
                <select id="nk-thuoc" class="form-control">
                    ${thuocList.map(t => `
                        <option value="${t.id}" ${String(defaultThuocId) === String(t.id) ? 'selected' : ''}>
                            ${this.escapeHtml(t.ma_thuoc || '')} - ${this.escapeHtml(t.ten_thuoc || '')}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Số lượng nhập *</label>
                <input type="number" id="nk-so-luong" class="form-control" min="1" step="1" placeholder="VD: 100">
            </div>
            <div class="form-group">
                <label>Ngày nhập *</label>
                <input type="date" id="nk-ngay-nhap" class="form-control" value="${today}">
            </div>
            <div class="form-group">
                <label>Hạn sử dụng *</label>
                <input type="date" id="nk-han-su-dung" class="form-control" value="${defaultHan}">
            </div>
            <div class="form-group">
                <label>Lô sản xuất</label>
                <input type="text" id="nk-lo-sx" class="form-control" placeholder="VD: LOSX-2026-001">
            </div>
            <p id="nk-tong-preview" class="text-muted small" style="margin-top:12px"></p>
        `, async () => {
            const payload = {
                thuoc: document.getElementById('nk-thuoc')?.value,
                so_luong: parseInt(document.getElementById('nk-so-luong')?.value || '0', 10),
                ngay_nhap: document.getElementById('nk-ngay-nhap')?.value,
                han_su_dung: document.getElementById('nk-han-su-dung')?.value,
                lo_sx: (document.getElementById('nk-lo-sx')?.value || '').trim()
            };

            if (!payload.thuoc || !payload.so_luong || payload.so_luong <= 0 || !payload.ngay_nhap || !payload.han_su_dung) {
                return Toast.error('Vui lòng nhập đầy đủ thông tin bắt buộc');
            }
            if (payload.han_su_dung <= payload.ngay_nhap) {
                return Toast.error('Hạn sử dụng phải lớn hơn ngày nhập');
            }

            const result = await this.apiPost('/thuoc/kho-thuoc/', payload);
            if (this._isCrudOk(result)) {
                this.closeModal();
                Toast.success('Nhập kho thành công!');
                await this.reloadCurrentPage();
            } else {
                Toast.error(result?.error || result?.detail || 'Nhập kho thất bại');
            }
        });
        const thuocCatalog = {};
        thuocList.forEach((t) => { thuocCatalog[String(t.id)] = t; });
        setTimeout(
            () =>
                this._bindNhapKhoTongTienPreview(thuocCatalog, {
                    selectId: 'nk-thuoc',
                    qtyId: 'nk-so-luong',
                    previewId: 'nk-tong-preview',
                    loai: 'thuoc',
                }),
            0
        );
    },

    async deleteMedicine(id, name) {
        if (!confirm(`Bạn có chắc muốn xóa thuốc "${name}"?`)) return;
        const success = await this.apiDelete(`/thuoc/thuoc/${id}/`);
        if (success) {
            Toast.success('Đã xóa thuốc thành công!');
            await this.reloadCurrentPage();
        } else {
            Toast.error('Xóa thuốc thất bại');
        }
    },
    
    viewNotification(id) {
        Toast.info('Tính năng đang phát triển');
    },
    
    showAllNotifications() {
        this.switchPage('notifications');
    },
    
    async markAllNotificationsRead() {
        if (window.ThongBaoBell) {
            await ThongBaoBell.danhDauTatCa();
        } else {
            const res = await Http.tao('/thong-bao/mark_all_as_read/', {});
            if (!res?.ok) {
                Toast.error('Không đánh dấu được thông báo');
                return;
            }
            if (this.currentPage === 'notifications') await this.loadNotifications();
        }
        Toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
    },
    
    showNotifications() {
        if (window.ThongBaoBell) {
            ThongBaoBell.togglePopup();
            return;
        }
        this.switchPage('notifications');
    },
    
    showUserMenu() {
        // Toggle user menu dropdown
        Toast.info('Menu người dùng');
    },
    
    // Helper functions
    formatMoney(amount) {
        if (!amount && amount !== 0) return '0₫';
        return amount.toLocaleString('vi-VN') + '₫';
    },
    
    formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleDateString('vi-VN');
        } catch {
            return '—';
        }
    },
    
    formatDateTime(dateStr) {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleString('vi-VN');
        } catch {
            return '—';
        }
    },

    _orderStatusLabels() {
        return {
            CHO_THANH_TOAN: 'Chờ thanh toán',
            DA_THANH_TOAN: 'Đã thanh toán',
            DANG_CHUAN_BI: 'Đang chuẩn bị',
            DANG_GIAO: 'Đang giao hàng',
            HOAN_THANH: 'Hoàn thành',
            DA_HUY: 'Hủy đơn'
        };
    },

    _validOrderNextStatuses(trangThai) {
        const valid = {
            MOI_TAO: ['CHO_THANH_TOAN', 'DA_HUY'],
            CHO_THANH_TOAN: ['DA_THANH_TOAN', 'DA_HUY'],
            DA_THANH_TOAN: ['DANG_CHUAN_BI', 'DA_HUY'],
            DANG_CHUAN_BI: ['DANG_GIAO', 'DA_HUY'],
            DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
            HOAN_THANH: [],
            DA_HUY: []
        };
        return valid[trangThai] || [];
    },

    _renderOrderApproveAction(donHang) {
        const id = donHang?.id;
        const tt = donHang?.trang_thai;
        if (!id || !tt) return '<span class="text-muted">—</span>';
        const nextCodes = this._validOrderNextStatuses(tt);
        if (!nextCodes.length) {
            return '<span class="text-muted">—</span>';
        }
        const labels = this._orderStatusLabels();
        const opts = nextCodes
            .map((c) => `<option value="${c}">${this.escapeHtml(labels[c] || c)}</option>`)
            .join('');
        return `
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:320px;">
                <select id="order-st-${id}" style="padding:6px 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;flex:1;min-width:140px;">
                    <option value="">— Chọn trạng thái —</option>
                    ${opts}
                </select>
                <button type="button" class="btn btn-primary btn-sm" onclick="AdminDashboard.applyOrderStatusPick('${id}')">Cập nhật</button>
            </div>`;
    },

    applyOrderStatusPick(orderId) {
        const sel = document.getElementById(`order-st-${orderId}`);
        const next = sel && sel.value ? sel.value.trim() : '';
        if (!next) {
            if (typeof Toast !== 'undefined' && Toast.canh) Toast.canh('Chọn trạng thái mới');
            return;
        }
        if (next === 'DA_HUY') {
            const ly = window.prompt('Lý do hủy đơn (tuỳ chọn):', '');
            this.approveOrder(orderId, next, (ly || '').trim());
            return;
        }
        this.approveOrder(orderId, next);
    },

    async approveOrder(orderId, nextStatus, lyDoHuy) {
        const payload = {
            trang_thai: nextStatus,
            ghi_chu: 'Cập nhật từ dashboard admin'
        };
        if (nextStatus === 'DA_HUY' && lyDoHuy) {
            payload.ly_do_huy = lyDoHuy;
        }
        const result = await this.apiPut(`/don-hang/don-hang/${orderId}/cap-nhat-trang-thai/`, payload);
        if (!result || result.error) {
            return;
        }
        if (result.success !== false) {
            Toast.success('Cập nhật trạng thái đơn thành công');
            await this.loadDashboard();
            return;
        }
        Toast.error(result?.error || result?.detail || 'Cập nhật đơn thất bại');
    },
    
};

// Export for global use
window.AdminDashboard = AdminDashboard;
console.log('AdminDashboard registered globally');

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    const normalizePath = (p) => {
        if (!p) return '/';
        if (p !== '/' && p.endsWith('/')) return p.slice(0, -1);
        return p;
    };
    const currentPath = normalizePath(window.location.pathname);

    // Script này được include chung cho nhiều trang, nên chỉ chạy khi đang ở admin dashboard.
    if (currentPath !== '/admin-dashboard') return;

    // Check if user is logged in and is admin
    const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    
    if (!token) {
        window.location.href = '/login/';
        return;
    }
    
    // Check if user is admin (vai_tro = 'ADMIN')
    if (userInfo.vai_tro !== 'ADMIN' && userInfo.vai_tro !== 'admin') {
        // If not admin, redirect to user dashboard
        if (typeof App !== 'undefined' && App.loadDashboard) {
            App.loadDashboard();
        } else {
            window.location.href = '/';
        }
        return;
    }
    
    // Initialize admin dashboard
    AdminDashboard.init();
});

