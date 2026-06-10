const PageBenhNhanDashboard = {
  _benhNhanId: null,

  _setNavActive(trang) {
    const map = {
      dashboard: 'dash',
      'ho-so': 'hs',
      'lich-hen': 'lh',
      'dat-lich': 'lh',
      'mua-thuoc': 'mt',
      'don-hang': 'dh',
    };
    const cur = map[trang] || 'dash';
    document.querySelectorAll('[data-bn-nav]').forEach((b) => {
      const on = b.getAttribute('data-bn-nav') === cur;
      b.classList.toggle('active', on);
    });
  },

  async render() {
    await this._ensureBenhNhanId();
    const { hoTen } = Auth.layThongTin();

    const navHtml = `
      <button type="button" class="nav-item" data-bn-nav="dash" onclick="PageBenhNhanDashboard.chuyenTrang('dashboard')"><i class="fas fa-chart-line"></i><span>Tổng quan</span></button>
      <button type="button" class="nav-item" data-bn-nav="hs" onclick="PageBenhNhanDashboard.chuyenTrang('ho-so')"><i class="fas fa-id-card"></i><span>Hồ sơ cá nhân</span></button>
      <button type="button" class="nav-item" data-bn-nav="lh" onclick="PageBenhNhanDashboard.chuyenTrang('lich-hen')"><i class="fas fa-calendar-check"></i><span>Lịch hẹn</span></button>
      <button type="button" class="nav-item" data-bn-nav="mt" onclick="PageBenhNhanDashboard.chuyenTrang('mua-thuoc')"><i class="fas fa-pills"></i><span>Mua thuốc</span></button>
      <button type="button" class="nav-item" data-bn-nav="dh" onclick="PageBenhNhanDashboard.chuyenTrang('don-hang')"><i class="fas fa-box"></i><span>Đơn hàng của tôi</span></button>`;
    const notifBtn = `
      <button type="button" class="notification-bell" onclick="PageThongBaoBenhNhan.togglePopup(event)" title="Thông báo" aria-label="Thông báo">
        <i class="fas fa-bell"></i>
        <span id="bn-noti-badge" class="badge" style="display:none">0</span>
      </button>`;
    window.RoleDashboardShell.mount('app-root', {
      brandTitle: 'PhòngKhám+',
      brandAccent: 'Bệnh nhân',
      brandIcon: 'fa-heart-pulse',
      navHtml,
      mainHostId: 'benh-nhan-main-content',
      userName: hoTen || 'Bệnh nhân',
      userRoleLabel: 'Cổng bệnh nhân',
      contentMaxWidth: '1280px',
      headerActionsExtra: notifBtn,
    });

    if (window.PageThongBaoBenhNhan && window.PageThongBaoBenhNhan.init) {
      window.PageThongBaoBenhNhan.init();
    }
    await this._renderTongQuan();
    this._setNavActive('dashboard');
  },

  async chuyenTrang(trang) {
    if (!document.getElementById('benh-nhan-main-content')) {
      await this.render();
    }

    if (trang === 'mua-thuoc') {
      if (typeof window.PageMuaThuoc !== 'undefined' && window.PageMuaThuoc.render) {
        await this._ensureBenhNhanId();
        await window.PageMuaThuoc.render({
          benhNhanId: this._benhNhanId,
          hostElementId: 'benh-nhan-main-content'
        });
        this._setNavActive('mua-thuoc');
        return;
      }
      this._setNavActive(trang);
      return Toast.loi('Thiếu trang mua thuốc', 'Không tìm thấy module mua-thuốc.js');
    }

    if (trang === 'ho-so' && window.PageHoSoBenhNhan?.render) {
      await window.PageHoSoBenhNhan.render({ benhNhanId: this._benhNhanId, hostElementId: 'benh-nhan-main-content' });
      this._setNavActive('ho-so');
      return;
    }
    if ((trang === 'lich-hen' || trang === 'dat-lich') && window.PageLichHenBenhNhan?.render) {
      await window.PageLichHenBenhNhan.render({ benhNhanId: this._benhNhanId, hostElementId: 'benh-nhan-main-content' });
      this._setNavActive('lich-hen');
      return;
    }
    if (trang === 'don-hang') {
      await this._renderDonHang();
      this._setNavActive('don-hang');
      return;
    }

    await this._renderTongQuan();
    this._setNavActive('dashboard');
  },

  async _renderTongQuan() {
    UI.render('benh-nhan-main-content', `
      <div class="stat-grid" id="bn-stat-grid"></div>
      <div class="grid-2 mt-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><div class="card-title-icon" style="background:#EFF6FF">📦</div>Đơn hàng gần đây</div>
            <button class="btn btn-outline btn-sm" onclick="PageBenhNhanDashboard.chuyenTrang('don-hang')">Xem tất cả</button>
          </div>
          <div class="card-body" id="bn-don-hang-gan">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title"><div class="card-title-icon" style="background:#FFF7ED">💊</div>Mua thuốc nhanh</div>
          </div>
          <div class="card-body">
            <p class="text-muted">Đặt mua thuốc online và theo dõi trạng thái đơn hàng.</p>
            <button class="btn btn-mint" onclick="PageBenhNhanDashboard.chuyenTrang('mua-thuoc')">
              <i class="fas fa-pills"></i> Đi đến mua thuốc
            </button>
          </div>
        </div>
      </div>
    `);

    await this._loadStat();
    await this._loadDonHangGan();
  },

  async _renderDonHang() {
    UI.render('benh-nhan-main-content', `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Đơn hàng của tôi</div>
          <button class="btn btn-outline btn-sm" onclick="PageBenhNhanDashboard.chuyenTrang('dashboard')">Quay lại</button>
        </div>
        <div class="card-body" id="bn-all-orders">
          <div class="page-loading"><div class="spinner"></div></div>
        </div>
      </div>
    `);

    const res = await Http.layDanhSach(`/don-hang/don-hang/?benh_nhan_id=${encodeURIComponent(this._benhNhanId || '')}&page=1&limit=20`);
    const items = res?.data?.data?.items || [];
    if (!items.length) {
      UI.render('bn-all-orders', '<p class="text-muted text-center" style="padding:20px">Bạn chưa có đơn hàng nào</p>');
      return;
    }

    UI.render('bn-all-orders', `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Mã đơn</th><th>Ngày</th><th>Tổng tiền</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            ${items.map(d => {
              const choTt = d.trang_thai === 'CHO_THANH_TOAN' && !d.phuong_thuc;
              return `
              <tr>
                <td>${this._esc(d.ma_don_hang || '—')}</td>
                <td>${UI.formatNgay(d.ngay_tao)}</td>
                <td>${UI.formatTien(d.tong_tien || 0)}</td>
                <td>${UI.badge(d.trang_thai_display || d.trang_thai || '')}</td>
                <td>${choTt ? `<button type="button" class="btn btn-primary btn-sm" onclick="PageBenhNhanDashboard.thanhToanVnpay('${d.id}')"><i class="fas fa-qrcode"></i> VNPay</button>` : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `);
  },

  async thanhToanVnpay(donHangId) {
    if (!donHangId) return Toast.loi('Lỗi', 'Không xác định được đơn hàng');
    const vnp = await Http.tao(`/don-hang/don-hang/${donHangId}/vnpay-tao-url/`, {});
    if (!vnp?.ok || !vnp?.data?.success) {
      return Toast.loi(
        'Không mở được VNPay',
        vnp?.data?.error || 'Kiểm tra cấu hình VNPAY_TMN_CODE, VNPAY_HASH_SECRET trên server'
      );
    }
    const payUrl = vnp.data?.data?.payment_url;
    const maDon = vnp.data?.data?.txn_ref || '—';
    if (!payUrl) return Toast.loi('VNPay', 'Không nhận được link thanh toán');
    Toast.canh('Chuyển đến cổng VNPay', `Đơn ${maDon} — hoàn tất thanh toán để xác nhận.`);
    window.location.href = payUrl;
  },

  async _loadStat() {
    const res = await Http.layDanhSach(`/don-hang/don-hang/?benh_nhan_id=${encodeURIComponent(this._benhNhanId || '')}&page=1&limit=50`);
    const items = res?.data?.data?.items || [];
    const cho = items.filter(i => ['MOI_TAO', 'CHO_XU_LY', 'CHO_THANH_TOAN'].includes(i.trang_thai)).length;
    const hoanTat = items.filter(i => ['HOAN_THANH', 'DA_THANH_TOAN'].includes(i.trang_thai)).length;
    const tongTien = items.reduce((sum, i) => sum + Number(i.tong_tien || 0), 0);

    UI.render('bn-stat-grid', [
      { icon: '📦', nhan: 'Tổng đơn', so: items.length, nen: '#EFF6FF', chu: '#1D4ED8' },
      { icon: '⏳', nhan: 'Đang xử lý', so: cho, nen: '#FFF7ED', chu: '#9A3412' },
      { icon: '✅', nhan: 'Hoàn tất', so: hoanTat, nen: '#ECFDF5', chu: '#065F46' },
      { icon: '💰', nhan: 'Đã chi', so: UI.formatTien(tongTien), nen: '#FAF5FF', chu: '#6B21A8' }
    ].map(s => `
      <div class="stat-card">
        <div class="stat-icon" style="background:${s.nen};color:${s.chu};font-size:22px">${s.icon}</div>
        <div class="stat-info">
          <div class="stat-value">${s.so}</div>
          <div class="stat-label">${s.nhan}</div>
        </div>
      </div>
    `).join(''));
  },

  async _loadDonHangGan() {
    const res = await Http.layDanhSach(`/don-hang/don-hang/?benh_nhan_id=${encodeURIComponent(this._benhNhanId || '')}&page=1&limit=5`);
    const items = res?.data?.data?.items || [];

    if (!items.length) {
      UI.render('bn-don-hang-gan', `
        <div class="page-empty" style="padding:24px">
          <div class="page-empty-icon" style="font-size:32px">🛒</div>
          <p class="text-muted">Bạn chưa có đơn hàng</p>
          <button class="btn btn-mint btn-sm mt-2" onclick="PageBenhNhanDashboard.chuyenTrang('mua-thuoc')">
            <i class="fas fa-pills"></i> Mua thuốc ngay
          </button>
        </div>
      `);
      return;
    }

    UI.render('bn-don-hang-gan', `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${items.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--c-bg);border-radius:var(--radius-md)">
            <div>
              <div style="font-weight:700;font-size:13px">${this._esc(d.ma_don_hang || '—')}</div>
              <div class="text-muted" style="font-size:12px">${UI.formatNgay(d.ngay_tao)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--c-navy-light)">${UI.formatTien(d.tong_tien || 0)}</div>
              <div>${UI.badge(d.trang_thai_display || d.trang_thai || '')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `);
  },

  async _ensureBenhNhanId() {
    if (this._benhNhanId) return this._benhNhanId;
    const userRaw = JSON.parse(localStorage.getItem('user_info') || '{}');
    const fromLocal = userRaw?.benh_nhan_id || userRaw?.role_data?.id || userRaw?.role_data?.nguoi_dung || userRaw?.id || null;
    if (fromLocal) {
      this._benhNhanId = fromLocal;
      return this._benhNhanId;
    }

    let benhNhanId = null;
    const meRes = await Http.layDanhSach('/users/me/');
    const bnMe = meRes?.data?.benh_nhan;
    benhNhanId =
      (bnMe && typeof bnMe === 'object' ? (bnMe.nguoi_dung ?? bnMe.id) : null) ||
      meRes?.data?.id ||
      null;
    if (!benhNhanId) {
      const userId = userRaw?.id || meRes?.data?.id;
      if (userId) {
        const bnRes = await Http.layDanhSach(`/benh-nhan/?nguoi_dung=${encodeURIComponent(userId)}`);
        const list = Array.isArray(bnRes?.data) ? bnRes.data : (bnRes?.data?.results || []);
        if (list.length > 0) benhNhanId = list[0].nguoi_dung ?? list[0].id ?? null;
      }
    }
    if (benhNhanId) {
      this._benhNhanId = benhNhanId;
      const merged = { ...userRaw, benh_nhan_id: benhNhanId, benh_nhan: meRes.data.benh_nhan };
      localStorage.setItem('user_info', JSON.stringify(merged));
    }
    return this._benhNhanId;
  },

  async _renderTaiKhoan() {
    const meRes = await Http.layDanhSach('/users/me/');
    const me = meRes?.data || {};
    const bn = me?.benh_nhan || {};

    UI.render('benh-nhan-main-content', `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Thông tin tài khoản</div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="PageBenhNhanDashboard.capNhatTaiKhoan()">
              <i class="fas fa-save"></i> Lưu thay đổi
            </button>
            <button class="btn btn-outline btn-sm" onclick="PageBenhNhanDashboard.chuyenTrang('dashboard')">Quay lại</button>
          </div>
        </div>
        <div class="card-body">
          <div class="grid-2">
            <div>
              <h4 style="margin-bottom:10px;color:var(--c-navy)">Tài khoản</h4>
              <p><strong>Tên đăng nhập:</strong> ${this._esc(me.ten_dang_nhap || '—')}</p>
              <div class="form-group">
                <label>Họ tên</label>
                <input type="text" id="bn-profile-name" class="form-control" value="${this._esc(me.ho_ten || '')}">
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="bn-profile-email" class="form-control" value="${this._esc(me.email || '')}">
              </div>
              <div class="form-group">
                <label>Số điện thoại</label>
                <input type="text" id="bn-profile-phone" class="form-control" value="${this._esc(me.so_dien_thoai || '')}">
              </div>
              <div class="form-group">
                <label>Địa chỉ</label>
                <textarea id="bn-profile-address" class="form-control" rows="2">${this._esc(me.dia_chi || '')}</textarea>
              </div>
            </div>
            <div>
              <h4 style="margin-bottom:10px;color:var(--c-navy)">Hồ sơ bệnh nhân</h4>
              <p><strong>Mã bệnh nhân:</strong> ${this._esc(bn.ma_benh_nhan || '—')}</p>
              <p><strong>Số bảo hiểm:</strong> ${this._esc(bn.so_bao_hiem || '—')}</p>
              <p><strong>Nhóm máu:</strong> ${this._esc(bn.nhom_mau || '—')}</p>
              <p><strong>Người thân:</strong> ${this._esc(bn.ho_ten_nguoi_than || '—')}</p>
              <p><strong>Quan hệ:</strong> ${this._esc(bn.quan_he_nguoi_than || '—')}</p>
              <p><strong>SĐT người thân:</strong> ${this._esc(bn.sdt_nguoi_than || '—')}</p>
              <p><strong>Giới tính:</strong> ${this._esc(me.gioi_tinh || '—')}</p>
              <p><strong>Ngày sinh:</strong> ${me.ngay_sinh ? UI.formatNgay(me.ngay_sinh) : '—'}</p>
            </div>
          </div>
        </div>
      </div>
    `);
  },

  async capNhatTaiKhoan() {
    const meRes = await Http.layDanhSach('/users/me/');
    const me = meRes?.data || {};
    const userId = me?.id;
    if (!userId) {
      return Toast.loi('Không thể cập nhật', 'Không xác định được người dùng hiện tại');
    }

    const payload = {
      ho_ten: (document.getElementById('bn-profile-name')?.value || '').trim(),
      email: (document.getElementById('bn-profile-email')?.value || '').trim(),
      so_dien_thoai: (document.getElementById('bn-profile-phone')?.value || '').trim(),
      dia_chi: (document.getElementById('bn-profile-address')?.value || '').trim()
    };

    if (!payload.ho_ten || !payload.so_dien_thoai) {
      return Toast.loi('Thiếu thông tin', 'Họ tên và số điện thoại là bắt buộc');
    }

    const updateRes = await Http.suaCuc(`/users/${userId}/`, payload);
    if (!updateRes?.ok) {
      return Toast.loi('Cập nhật thất bại', updateRes?.data?.detail || 'Vui lòng kiểm tra dữ liệu');
    }

    const merged = { ...(JSON.parse(localStorage.getItem('user_info') || '{}')), ...updateRes.data };
    localStorage.setItem('user_info', JSON.stringify(merged));
    Toast.ok('Đã lưu thông tin', 'Thông tin tài khoản đã được cập nhật');
    await this._renderTaiKhoan();
  },

  async _renderBenhAn() {
    const benhNhanId = await this._ensureBenhNhanId();
    UI.render('benh-nhan-main-content', `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Bệnh án của tôi</div>
          <button class="btn btn-outline btn-sm" onclick="PageBenhNhanDashboard.chuyenTrang('dashboard')">Quay lại</button>
        </div>
        <div class="card-body" id="bn-medical-records">
          <div class="page-loading"><div class="spinner"></div></div>
        </div>
      </div>
    `);

    if (!benhNhanId) {
      UI.render('bn-medical-records', '<p class="text-muted text-center" style="padding:20px">Không tìm thấy hồ sơ bệnh nhân.</p>');
      return;
    }

    const res = await Http.layDanhSach(`/benh-an/ho-so-benh-an/?benh_nhan=${encodeURIComponent(benhNhanId)}&ordering=-ngay_kham`);
    const items = Array.isArray(res?.data) ? res.data : (res?.data?.results || []);
    if (!items.length) {
      UI.render('bn-medical-records', '<p class="text-muted text-center" style="padding:20px">Chưa có dữ liệu bệnh án</p>');
      return;
    }

    UI.render('bn-medical-records', `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Mã hồ sơ</th>
              <th>Ngày khám</th>
              <th>Bác sĩ</th>
              <th>Loại khám</th>
              <th>Trạng thái</th>
              <th>Triệu chứng</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(hs => `
              <tr>
                <td>${this._esc(hs.ma_hs || '—')}</td>
                <td>${hs.ngay_kham ? UI.formatNgay(hs.ngay_kham) : '—'}</td>
                <td>${this._esc(hs.ten_bac_si || '—')}</td>
                <td>${this._esc(hs.loai_kham_display || hs.loai_kham || '—')}</td>
                <td>${UI.badge(hs.trang_thai_display || hs.trang_thai || '—')}</td>
                <td>${this._esc(hs.trieu_chung || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  },

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

window.PageBenhNhanDashboard = PageBenhNhanDashboard;
