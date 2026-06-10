/**
 * Nhân viên kế toán — giá bán, doanh thu / lợi nhuận, hóa đơn, quản lý kho.
 */
const PageKeToanDashboard = {
  _khoSubTab: 'canh-bao',

  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  },

  _list(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.results)) return data.results;
    if (data.data && Array.isArray(data.data.items)) return data.data.items;
    return [];
  },

  _setNavActive(tab) {
    document.querySelectorAll('[data-kt-nav]').forEach((b) => {
      const on = b.getAttribute('data-kt-nav') === tab;
      b.classList.toggle('active', on);
    });
  },

  async render() {
    const { hoTen } = Auth.layThongTin();
    const navHtml = `
      <button type="button" class="nav-item" data-kt-nav="tom-tat" onclick="PageKeToanDashboard.loadMain('tom-tat')"><i class="fas fa-chart-pie"></i><span>Doanh thu / Lợi nhuận</span></button>
      <button type="button" class="nav-item" data-kt-nav="gia" onclick="PageKeToanDashboard.loadMain('gia')"><i class="fas fa-tags"></i><span>Cập nhật giá</span></button>
      <button type="button" class="nav-item" data-kt-nav="hoa-don" onclick="PageKeToanDashboard.loadMain('hoa-don')"><i class="fas fa-file-invoice-dollar"></i><span>Hóa đơn / Đơn hàng</span></button>
      <button type="button" class="nav-item" data-kt-nav="quan-ly-kho" onclick="PageKeToanDashboard.loadMain('quan-ly-kho')"><i class="fas fa-warehouse"></i><span>Quản lý kho</span></button>`;
    window.RoleDashboardShell.mount('app-root', {
      brandTitle: 'PhòngKhám+',
      brandAccent: 'Kế toán',
      brandIcon: 'fa-calculator',
      navHtml,
      mainHostId: 'ketoan-main',
      userName: hoTen || 'Nhân viên',
      userRoleLabel: 'Kế toán — Giá, doanh thu & kho',
      contentMaxWidth: '1180px',
      headerActionsExtra: window.ThongBaoBell ? ThongBaoBell.htmlButton() : '',
    });
    if (window.ThongBaoBell) ThongBaoBell.init({ badgeId: 'pk-noti-badge' });
    await this.loadMain('tom-tat');
  },

  async loadMain(tab) {
    this._setNavActive(tab);
    const host = document.getElementById('ketoan-main');
    if (!host) return;
    host.innerHTML = '<p class="text-muted">Đang tải…</p>';
    if (tab === 'tom-tat') return this._tomTat(host);
    if (tab === 'gia') return this._capNhatGia(host);
    if (tab === 'hoa-don') return this._hoaDon(host);
    if (tab === 'quan-ly-kho') return this._quanLyKho(host);
    return this._tomTat(host);
  },

  _khoSubTabs() {
    return [
      { id: 'canh-bao', label: 'Cảnh báo tồn', icon: 'fa-exclamation-triangle' },
      { id: 'thuoc', label: 'Kho thuốc', icon: 'fa-pills' },
      { id: 'vaccine', label: 'Kho vaccine', icon: 'fa-syringe' },
      { id: 'lich-su-nhap', label: 'Lịch sử nhập', icon: 'fa-history' },
    ];
  },

  async _quanLyKho(host) {
    const cur = this._khoSubTab || 'canh-bao';
    host.innerHTML = `
      <div class="kt-kho-shell">
        <div class="card mb-3">
          <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
            <strong><i class="fas fa-warehouse"></i> Quản lý kho</strong>
            <span class="text-muted small">Tồn kho, nhập/xuất thuốc &amp; vaccine</span>
          </div>
          <div class="card-body py-2">
            <div class="kt-kho-subnav">
              ${this._khoSubTabs()
                .map(
                  (t) => `<button type="button" class="btn btn-sm ${cur === t.id ? 'btn-primary' : 'btn-outline-secondary'}"
                    data-kt-kho-sub="${t.id}" onclick="PageKeToanDashboard._khoSubNav('${t.id}')">
                    <i class="fas ${t.icon}"></i> ${t.label}
                  </button>`
                )
                .join('')}
            </div>
          </div>
        </div>
        <div id="kt-kho-content"></div>
      </div>`;
    if (window.PageKhoDashboard) {
      PageKhoDashboard._mainHostId = 'kt-kho-content';
      await PageKhoDashboard.loadMain(cur, { skipNav: true });
    } else {
      document.getElementById('kt-kho-content').innerHTML =
        '<p class="text-danger">Chưa tải module quản lý kho.</p>';
    }
  },

  async _khoSubNav(subTab) {
    this._khoSubTab = subTab;
    document.querySelectorAll('[data-kt-kho-sub]').forEach((b) => {
      const on = b.getAttribute('data-kt-kho-sub') === subTab;
      b.classList.toggle('btn-primary', on);
      b.classList.toggle('btn-outline-secondary', !on);
    });
    const content = document.getElementById('kt-kho-content');
    if (!content || !window.PageKhoDashboard) return;
    PageKhoDashboard._mainHostId = 'kt-kho-content';
    await PageKhoDashboard.loadMain(subTab, { skipNav: true });
  },

  /** YYYY-MM-DD theo giờ máy (không dùng toISOString — lệch ngày so với VN). */
  _fmtLocalYMD(d) {
    const x = d instanceof Date ? d : new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _firstDayOfMonth() {
    const d = new Date();
    return this._fmtLocalYMD(new Date(d.getFullYear(), d.getMonth(), 1));
  },

  _today() {
    return this._fmtLocalYMD(new Date());
  },

  async _tomTat(host) {
    host.innerHTML = `
      <div class="card"><div class="card-header"><strong>Tổng hợp tài chính</strong></div>
        <div class="card-body">
          ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.filterBarHtml('kt', { onView: 'PageKeToanDashboard._fetchTomTat()' }) : '<p class="text-muted">Đang tải module báo cáo…</p>'}
          <div id="kt-tomtat-body"><p class="text-muted">Chọn kỳ báo cáo và bấm Xem.</p></div>
        </div></div>`;
    await this._fetchTomTat();
  },

  _fmtMoney(n) {
    return `${Number(n || 0).toLocaleString('vi-VN')} đ`;
  },

  _orderStatusLabels() {
    return {
      MOI_TAO: 'Mới tạo',
      CHO_THANH_TOAN: 'Chờ thanh toán',
      DA_THANH_TOAN: 'Đã thanh toán',
      DANG_CHUAN_BI: 'Đang chuẩn bị',
      DANG_GIAO: 'Đang giao hàng',
      HOAN_THANH: 'Hoàn thành',
      DA_HUY: 'Đã hủy',
    };
  },

  _validOrderNextStatuses(trangThai) {
    // Bám chính xác transition trong be/donhang/views.py -> cap_nhat_trang_thai_don_hang
    const valid = {
      MOI_TAO: ['CHO_THANH_TOAN', 'DA_HUY'],
      CHO_THANH_TOAN: ['DA_THANH_TOAN', 'DA_HUY'],
      DA_THANH_TOAN: ['DANG_CHUAN_BI', 'DA_HUY'],
      DANG_CHUAN_BI: ['DANG_GIAO', 'DA_HUY'],
      DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
      HOAN_THANH: [],
      DA_HUY: [],
    };
    return valid[trangThai] || [];
  },

  _renderOrderApproveAction(donHang) {
    const id = donHang?.id;
    const tt = donHang?.trang_thai;
    if (!id || !tt) return '<span class="text-muted">—</span>';
    const nextCodes = this._validOrderNextStatuses(tt);
    if (!nextCodes.length) return '<span class="text-muted">—</span>';
    const labels = this._orderStatusLabels();
    const opts = nextCodes
      .map((c) => `<option value="${c}">${this._esc(labels[c] || c)}</option>`)
      .join('');
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:320px;">
        <select id="kt-order-st-${id}" class="form-control" style="padding:6px 8px;font-size:12px;flex:1;min-width:140px;">
          <option value="">— Chọn trạng thái —</option>
          ${opts}
        </select>
        <button type="button" class="btn btn-primary btn-sm" onclick="PageKeToanDashboard.applyOrderStatusPick('${id}')">Cập nhật</button>
      </div>`;
  },

  applyOrderStatusPick(orderId) {
    const sel = document.getElementById(`kt-order-st-${orderId}`);
    const next = sel && sel.value ? sel.value.trim() : '';
    if (!next) {
      Toast.hien('Thiếu thông tin', 'Vui lòng chọn trạng thái mới', 'warning');
      return;
    }
    if (next === 'DA_HUY') {
      const ly = window.prompt('Lý do hủy đơn (tuỳ chọn):', '');
      this._updateOrderStatus(orderId, next, (ly || '').trim());
      return;
    }
    this._updateOrderStatus(orderId, next);
  },

  async _updateOrderStatus(orderId, nextStatus, lyDoHuy = '') {
    const payload = {
      trang_thai: nextStatus,
      ghi_chu: 'Cập nhật từ dashboard kế toán',
    };
    if (nextStatus === 'DA_HUY' && lyDoHuy) {
      payload.ly_do_huy = lyDoHuy;
    }
    const res = await Http.capNhat(`/don-hang/don-hang/${orderId}/cap-nhat-trang-thai/`, payload);
    if (!res?.ok) {
      return Toast.hien('Lỗi', (res?.data?.error || res?.data?.detail || 'Cập nhật trạng thái thất bại'), 'error');
    }
    Toast.hien('Thành công', 'Đã cập nhật trạng thái đơn hàng', 'success');
    await this._fetchHoaDon();
  },

  async _fetchTomTat() {
    const box = document.getElementById('kt-tomtat-body');
    if (!box) return;
    let tu = '';
    let den = '';
    let tomTatPath = '';
    if (typeof BaoCaoTaiChinh !== 'undefined') {
      const built = BaoCaoTaiChinh.tomTatUrl('kt');
      if (built.error) {
        box.innerHTML = `<p class="text-warning">${BaoCaoTaiChinh._esc(built.error)}</p>`;
        return;
      }
      tu = built.params.tu;
      den = built.params.den;
      tomTatPath = built.url;
    } else {
      tu = document.getElementById('kt-tu')?.value;
      den = document.getElementById('kt-den')?.value;
      if (!tu || !den) return;
      tomTatPath = `/thuoc/dashboard/ke-toan/tom-tat/?tu=${encodeURIComponent(tu)}&den=${encodeURIComponent(den)}`;
    }
    const [res, statsRes] = await Promise.all([
      Http.layDanhSach(tomTatPath),
      Http.layDanhSach(`/don-hang/thong-ke/don-hang/?tu_ngay=${encodeURIComponent(tu)}&den_ngay=${encodeURIComponent(den)}`),
    ]);
    if ((!res.ok || !res.data) && (!statsRes.ok || !statsRes.data)) {
      const err =
        (res.data && (res.data.error || res.data.detail)) ||
        (statsRes.data && (statsRes.data.error || statsRes.data.detail)) ||
        (res.status === 403 ? 'Không có quyền xem báo cáo (chỉ kế toán / quản trị).' : '');
      box.innerHTML = `<p class="text-danger">${this._esc(err || 'Không tải được dữ liệu.')}</p>`;
      return;
    }
    const d = res?.data || {};
    const thongKe = statsRes?.data?.data || {};
    const tongQuanThongKe = thongKe.tong_quan || {};
    /** Báo cáo chính: API tom-tat (đơn hàng + toa + tiêm). API don-hang chỉ đơn/toa, không có tiêm. */
    const tomTatOk = !!(res.ok && res.data && typeof res.data === 'object');
    const recentRes = await Http.layDanhSach('/don-hang/don-hang/?limit=10&page=1');
    const recentRoot = recentRes?.data || {};
    const recentBills = (recentRoot.data && recentRoot.data.items) || recentRoot.items || [];
    const days = Array.isArray(d.theo_ngay) && d.theo_ngay.length
      ? d.theo_ngay
      : (Array.isArray(thongKe.theo_ngay) ? thongKe.theo_ngay : []);
    const maxBar = Math.max(
      Number(d.bieu_do_max || 0),
      ...days.map((x) => Number(x.tong_doanh_thu ?? x.tong_tien ?? 0)),
      1
    );
    const rowsNgay = days
      .map((r) => {
        const tong = Number(r.tong_doanh_thu ?? r.tong_tien ?? 0);
        const pct = Math.min(100, Math.round((tong / maxBar) * 100));
        const dtDonHang = Number(r.doanh_thu_don_hang ?? 0);
        const dtDonToa = Number(r.doanh_thu_don_thuoc ?? 0);
        const dtTiem = Number(r.doanh_thu_tiem ?? 0);
        return `<tr>
          <td>${this._esc(r.ngay || r.ngay_tao__date || '')}</td>
          <td style="text-align:right">${this._fmtMoney(dtDonHang)}</td>
          <td style="text-align:right">${this._fmtMoney(dtDonToa)}</td>
          <td style="text-align:right">${this._fmtMoney(dtTiem)}</td>
          <td style="text-align:right;font-weight:600">${this._fmtMoney(tong)}</td>
          <td style="width:120px"><div title="${tong}" style="height:10px;background:#e2e8f0;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:#1a365d;max-width:100%"></div>
          </div></td>
        </tr>`;
      })
      .join('');

    const topDh = (
      (tomTatOk && d.top_thuoc_don_hang && d.top_thuoc_don_hang.length
        ? d.top_thuoc_don_hang
        : thongKe.top_san_pham) || []
    )
      .map(
        (x) =>
          `<tr><td>${this._esc(x.ten_thuoc || x.thuoc__ten_thuoc || '')}</td><td style="text-align:right">${x.so_luong ?? x.so_luong_ban ?? ''}</td><td style="text-align:right">${this._fmtMoney(x.doanh_thu)}</td></tr>`
      )
      .join('');
    const topToa = (d.top_thuoc_theo_toa || [])
      .map(
        (x) =>
          `<tr><td>${this._esc(x.ten_thuoc)}</td><td style="text-align:right">${x.so_luong ?? ''}</td><td style="text-align:right">${this._fmtMoney(x.doanh_thu)}</td></tr>`
      )
      .join('');

    const doanhThuTong = tomTatOk
      ? Number(d.doanh_thu ?? 0)
      : Number(tongQuanThongKe.tong_doanh_thu ?? 0);
    const doanhThuDonHang = tomTatOk
      ? Number(d.doanh_thu_don_hang ?? 0)
      : Number(tongQuanThongKe.tong_doanh_thu_don_hang ?? 0);
    const doanhThuDonThuoc = tomTatOk
      ? Number(d.doanh_thu_don_thuoc ?? 0)
      : Number(tongQuanThongKe.tong_doanh_thu_don_thuoc ?? 0);
    const soDonHang = tomTatOk
      ? Number(d.so_don_hang ?? 0)
      : Number(tongQuanThongKe.so_don_hang_co_doanh_thu ?? 0);
    const soDonToa = tomTatOk
      ? Number(d.so_don_thuoc ?? 0)
      : Number(tongQuanThongKe.so_don_thuoc_da_thanh_toan ?? 0);
    const soGiaoDich = tomTatOk
      ? Number(d.so_giao_dich ?? 0)
      : Number(tongQuanThongKe.tong_so_giao_dich_thang ?? 0);
    const recentBillRows = recentBills
      .map(
        (r) => `<tr>
          <td>${this._esc(r.ma_don_hang || '—')}</td>
          <td>${this._esc((r.benh_nhan && r.benh_nhan.ho_ten) || '')}</td>
          <td>${(r.ngay_tao || '').slice(0, 10)}</td>
          <td style="text-align:right">${Number(r.tong_tien || 0).toLocaleString('vi-VN')}</td>
          <td>${this._esc(r.trang_thai_quan_ly || r.trang_thai_display || r.trang_thai || '')}</td>
          <td><button type="button" class="btn btn-outline btn-sm" onclick="PageKeToanDashboard._xemChiTietBill('${r.id}')">Chi tiết</button></td>
        </tr>`
      )
      .join('');

    box.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
        <div class="card" style="margin:0"><div class="card-body" style="padding:12px">
          <div class="small text-muted">Tổng doanh thu</div>
          <div style="font-size:20px;font-weight:800">${this._fmtMoney(doanhThuTong)}</div>
        </div></div>
        <div class="card" style="margin:0"><div class="card-body" style="padding:12px">
          <div class="small text-muted">Đơn hàng (app / quầy)</div>
          <div style="font-size:18px;font-weight:700">${this._fmtMoney(doanhThuDonHang)}</div>
          <div class="small text-muted">${soDonHang} đơn</div>
        </div></div>
        <div class="card" style="margin:0"><div class="card-body" style="padding:12px">
          <div class="small text-muted">Đơn thuốc theo toa (đã TT)</div>
          <div style="font-size:18px;font-weight:700">${this._fmtMoney(doanhThuDonThuoc)}</div>
          <div class="small text-muted">${soDonToa} đơn</div>
        </div></div>
        <div class="card" style="margin:0"><div class="card-body" style="padding:12px">
          <div class="small text-muted">Tiêm chủng (đã tiêm)</div>
          <div style="font-size:18px;font-weight:700">${this._fmtMoney(d.doanh_thu_tiem)}</div>
          <div class="small text-muted">${d.so_lan_tiem ?? 0} lượt</div>
        </div></div>
        <div class="card" style="margin:0"><div class="card-body" style="padding:12px">
          <div class="small text-muted">Lợi nhuận ước tính</div>
          <div style="font-size:20px;font-weight:800;color:#0a7">${this._fmtMoney(d.loi_nhuan_uoc_tinh)}</div>
        </div></div>
      </div>

      <table class="data-table" style="max-width:720px;font-size:14px;margin-bottom:16px">
        <tbody>
          <tr><td>Giá vốn — đơn hàng</td><td style="text-align:right">${this._fmtMoney(d.gia_von_don_hang)}</td></tr>
          <tr><td>Giá vốn — đơn toa</td><td style="text-align:right">${this._fmtMoney(d.gia_von_don_thuoc)}</td></tr>
          <tr><td>Giá vốn — tiêm chủng</td><td style="text-align:right">${this._fmtMoney(d.gia_von_tiem)}</td></tr>
          <tr><td><strong>Tổng giá vốn (ước tính)</strong></td><td style="text-align:right;font-weight:700">${this._fmtMoney(d.gia_von_uoc_tinh)}</td></tr>
          <tr><td>Giao dịch</td><td style="text-align:right">${soGiaoDich}</td></tr>
        </tbody>
      </table>
      <p class="text-muted small" style="margin:-8px 0 16px">Giá vốn thuốc/vaccine lấy theo <strong>đơn giá nhập trên danh mục</strong> × số lượng (chưa theo từng lô kho).</p>

      ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.chartSectionHtml('kt') : ''}
      ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.detailTableHtml(d, 'ngay') : ''}
      ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.detailTableHtml(d, 'thang') : ''}
      ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.detailTableHtml(d, 'nam') : ''}
      ${typeof BaoCaoTaiChinh !== 'undefined' ? BaoCaoTaiChinh.detailTableHtml(d, 'bac_si') : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px">
        <div class="card" style="margin:0"><div class="card-header"><strong>Top thuốc — qua đơn hàng</strong></div>
          <div class="card-body" style="overflow:auto;padding:0">
            <table class="data-table" style="width:100%;font-size:13px">
              <thead><tr><th>Tên</th><th style="text-align:right">SL</th><th style="text-align:right">DT</th></tr></thead>
              <tbody>${topDh || '<tr><td colspan="3" class="text-muted">Không có</td></tr>'}</tbody>
            </table>
          </div></div>
        <div class="card" style="margin:0"><div class="card-header"><strong>Top thuốc — theo toa</strong></div>
          <div class="card-body" style="overflow:auto;padding:0">
            <table class="data-table" style="width:100%;font-size:13px">
              <thead><tr><th>Tên</th><th style="text-align:right">SL</th><th style="text-align:right">DT</th></tr></thead>
              <tbody>${topToa || '<tr><td colspan="3" class="text-muted">Không có</td></tr>'}</tbody>
            </table>
          </div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><strong>Bill/Đơn mua gần đây</strong></div>
        <div class="card-body" style="overflow:auto;padding:0">
          <table class="data-table" style="width:100%;font-size:13px;min-width:640px">
            <thead><tr><th>Mã đơn</th><th>Bệnh nhân</th><th>Ngày lập</th><th style="text-align:right">Tổng tiền</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>${recentBillRows || '<tr><td colspan="6" class="text-muted">Không có dữ liệu bill gần đây.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      `;
    if (typeof BaoCaoTaiChinh !== 'undefined' && tomTatOk) {
      BaoCaoTaiChinh.setChartData('kt', d);
    }
  },

  async _capNhatGia(host) {
    let thuoc = [];
    let vac = [];
    try {
      const [rt, rv] = await Promise.all([
        Http.layDanhSach('/thuoc/thuoc/?page_size=300'),
        Http.layDanhSach('/thuoc/vaccine/?page_size=300'),
      ]);
      thuoc = this._list(rt.data);
      vac = this._list(rv.data);
    } catch (e) {
      host.innerHTML = '<div class="card"><div class="card-body">Lỗi tải danh mục.</div></div>';
      return;
    }
    host.innerHTML = `
      <div class="card mb-3"><div class="card-header"><strong>Giá bán thuốc</strong></div>
        <div class="card-body">
          <div class="form-group"><label>Thuốc</label>
            <select id="kg-thuoc" class="form-control">${thuoc.map((t) => `<option value="${t.id}">${this._esc(t.ma_thuoc)} — ${this._esc(t.ten_thuoc)} (${Number(t.gia_ban || 0).toLocaleString('vi-VN')}đ)</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Giá bán mới</label><input type="number" id="kg-gia-thuoc" class="form-control" min="0" step="1"/></div>
          <button type="button" class="btn btn-primary btn-sm" onclick="PageKeToanDashboard._postGiaThuoc()">Lưu</button>
        </div></div>
      <div class="card"><div class="card-header"><strong>Giá tiêm vaccine</strong></div>
        <div class="card-body">
          <div class="form-group"><label>Vaccine</label>
            <select id="kg-vac" class="form-control">${vac.map((t) => `<option value="${t.id}">${this._esc(t.ma_vaccine)} — ${this._esc(t.ten_vaccine)} (${Number(t.gia_tiem || 0).toLocaleString('vi-VN')}đ)</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Giá tiêm mới</label><input type="number" id="kg-gia-vac" class="form-control" min="0" step="1"/></div>
          <button type="button" class="btn btn-primary btn-sm" onclick="PageKeToanDashboard._postGiaVac()">Lưu</button>
        </div></div>`;
  },

  async _postGiaThuoc() {
    const id = document.getElementById('kg-thuoc').value;
    const gia_moi = parseFloat(String(document.getElementById('kg-gia-thuoc').value || ''), 10);
    if (!id || !gia_moi) return Toast.hien('Lỗi', 'Chọn thuốc và nhập giá', 'error');
    const res = await Http.tao(`/thuoc/thuoc/${id}/cap_nhat_gia/`, { gia_moi, ly_do: 'Ke toan cap nhat' });
    if (res.ok) {
      Toast.hien('Đã cập nhật', 'Giá bán thuốc', 'success');
      const host = document.getElementById('ketoan-main');
      if (host) await this._capNhatGia(host);
    } else Toast.hien('Lỗi', (res.data && res.data.error) || 'Thất bại', 'error');
  },

  async _postGiaVac() {
    const id = document.getElementById('kg-vac').value;
    const gia_tiem_moi = parseFloat(String(document.getElementById('kg-gia-vac').value || ''), 10);
    if (!id || !gia_tiem_moi) return Toast.hien('Lỗi', 'Chọn vaccine và nhập giá', 'error');
    const res = await Http.tao(`/thuoc/vaccine/${id}/cap_nhat_gia/`, { gia_tiem_moi, ly_do: 'Ke toan cap nhat' });
    if (res.ok) {
      Toast.hien('Đã cập nhật', 'Giá tiêm vaccine', 'success');
      const host = document.getElementById('ketoan-main');
      if (host) await this._capNhatGia(host);
    } else Toast.hien('Lỗi', (res.data && res.data.error) || 'Thất bại', 'error');
  },

  async _hoaDon(host) {
    const tu = this._firstDayOfMonth();
    const den = this._today();
    const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    host.innerHTML = `
      <div class="card mb-3"><div class="card-header"><strong>Tra cứu hóa đơn / đơn bán</strong></div>
        <div class="card-body">
          <div class="form-row form-row--inline" style="margin-bottom:10px">
            <div class="form-group"><label class="form-label">Từ ngày</label><input type="date" id="kt-hd-tu" class="form-control" value="${tu}"/></div>
            <div class="form-group"><label class="form-label">Đến ngày</label><input type="date" id="kt-hd-den" class="form-control" value="${den}"/></div>
            <div class="form-group"><label class="form-label">Hoặc chọn tháng</label><input type="month" id="kt-hd-thang" class="form-control" value="${ym}" onchange="PageKeToanDashboard._fromMonthHoaDon()"/></div>
            <div class="form-group" style="min-width:200px"><label class="form-label">Tìm mã / tên / SĐT</label>
              <input type="text" id="kt-hd-search" class="form-control" placeholder="Mã đơn, tên BN…"/></div>
            <div class="form-group">
              <label class="form-label form-label--spacer" aria-hidden="true">&nbsp;</label>
              <button type="button" class="btn btn-primary" onclick="PageKeToanDashboard._fetchHoaDon()">Tra cứu</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <button type="button" class="btn btn-outline btn-sm" onclick="PageKeToanDashboard._presetHoaDon('today')">Hôm nay</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="PageKeToanDashboard._presetHoaDon('month')">Tháng này</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="PageKeToanDashboard._presetHoaDon('prevmonth')">Tháng trước</button>
          </div>
          <div id="kt-hd-tables"><p class="text-muted">Đang tải…</p></div>
        </div></div>`;
    await this._fetchHoaDon();
  },

  _fromMonthHoaDon() {
    const v = document.getElementById('kt-hd-thang')?.value;
    if (!v || !/^\d{4}-\d{2}$/.test(v)) return;
    const [y, m] = v.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const tu = document.getElementById('kt-hd-tu');
    const den = document.getElementById('kt-hd-den');
    if (tu) tu.value = this._fmtLocalYMD(first);
    if (den) den.value = this._fmtLocalYMD(last);
    this._fetchHoaDon();
  },

  _presetHoaDon(which) {
    const now = new Date();
    const tu = document.getElementById('kt-hd-tu');
    const den = document.getElementById('kt-hd-den');
    const th = document.getElementById('kt-hd-thang');
    if (!tu || !den) return;
    if (which === 'today') {
      const s = this._fmtLocalYMD(now);
      tu.value = s;
      den.value = s;
      if (th) th.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else if (which === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      tu.value = this._fmtLocalYMD(first);
      den.value = this._fmtLocalYMD(now);
      if (th) th.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else if (which === 'prevmonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      tu.value = this._fmtLocalYMD(first);
      den.value = this._fmtLocalYMD(last);
      if (th) th.value = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
    }
    this._fetchHoaDon();
  },

  async _fetchHoaDon() {
    const box = document.getElementById('kt-hd-tables');
    if (!box) return;
    const tu = document.getElementById('kt-hd-tu')?.value;
    const den = document.getElementById('kt-hd-den')?.value;
    const search = (document.getElementById('kt-hd-search')?.value || '').trim();
    if (!tu || !den) {
      box.innerHTML = '<p class="text-danger">Chọn từ ngày và đến ngày.</p>';
      return;
    }
    box.innerHTML = '<p class="text-muted">Đang tải…</p>';
    const q1 = new URLSearchParams({ limit: 100, page: 1, tu_ngay: tu, den_ngay: den });
    if (search) q1.set('search', search);
    const q2 = new URLSearchParams({
      page_size: 50,
      page: 1,
      tu_ngay: tu,
      den_ngay: den,
      ordering: '-ngay_tao',
    });
    if (search) q2.set('search', search);
    const [r1, r2] = await Promise.all([
      Http.layDanhSach(`/don-hang/don-hang/?${q1}`),
      Http.layDanhSach(`/benh-an/don-thuoc/?${q2}`),
    ]);
    const root = r1.data || {};
    const itemsDh = (root.data && root.data.items) || root.items || [];
    const pag = (root.data && root.data.pagination) || {};
    const dtRows = Array.isArray(r2.data?.results)
      ? r2.data.results
      : this._list(r2.data);
    const err = (!r1.ok && (r1.data?.error || r1.data?.detail)) || (!r2.ok && (r2.data?.detail || r2.data?.error));
    if (err && !itemsDh.length && !dtRows.length) {
      box.innerHTML = `<p class="text-danger">${this._esc(err || 'Không tải được dữ liệu.')}</p>`;
      return;
    }
    const rowsDh =
      itemsDh
        .map(
          (r) => `
      <tr>
        <td>${this._esc(r.ma_don_hang)}</td>
        <td>${this._esc((r.benh_nhan && r.benh_nhan.ho_ten) || '')}</td>
        <td>${(r.ngay_tao || '').slice(0, 10)}</td>
        <td style="text-align:right">${Number(r.tong_tien || 0).toLocaleString('vi-VN')}</td>
        <td>${this._esc(r.trang_thai_quan_ly || r.trang_thai_display || r.trang_thai || '')}</td>
        <td>${this._esc(r.loai_don || r.loai_don_ma || '')}</td>
        <td><button type="button" class="btn btn-outline btn-sm" onclick="PageKeToanDashboard._xemChiTietBill('${r.id}')">Chi tiết</button></td>
        <td>${this._renderOrderApproveAction(r)}</td>
      </tr>`
        )
        .join('') || '<tr><td colspan="8" class="text-muted">Không có đơn hàng trong khoảng đã chọn.</td></tr>';
    const rowsDt =
      dtRows
        .map(
          (r) => `
      <tr>
        <td>${this._esc(r.ma_don || '')}</td>
        <td>${this._esc(r.ten_benh_nhan || '')}</td>
        <td>${(r.ngay_tao || '').slice(0, 10)}</td>
        <td style="text-align:right">${Number(r.tong_tien || 0).toLocaleString('vi-VN')}</td>
        <td>${this._esc(r.trang_thai_display || r.trang_thai || '')}</td>
        <td>${r.da_thanh_toan ? 'Đã TT' : ''}</td>
      </tr>`
        )
        .join('') || '<tr><td colspan="6" class="text-muted">Không có đơn thuốc trong khoảng đã chọn.</td></tr>';
    box.innerHTML = `
      <p class="small text-muted mb-2">Kỳ: <strong>${this._esc(tu)}</strong> → <strong>${this._esc(den)}</strong>
        ${pag.total_items != null ? ` — Đơn hàng: ${pag.total_items} bản ghi` : ''}
        ${r2.data?.count != null ? ` · Đơn thuốc (trang 1): ${r2.data.count} bản ghi` : ''}
      </p>
      <div class="card mb-3" style="margin:0"><div class="card-header"><strong>Đơn hàng (app / quầy)</strong></div>
        <div class="card-body" style="overflow:auto;padding:0">
          <table class="data-table" style="width:100%;font-size:13px;min-width:560px">
            <thead><tr><th>Mã ĐH</th><th>Khách</th><th>Ngày lập</th><th style="text-align:right">Tổng tiền</th><th>Trạng thái</th><th>Loại</th><th></th><th>Cập nhật trạng thái</th></tr></thead>
            <tbody>${rowsDh}</tbody>
          </table>
        </div></div>
      <div class="card" style="margin:0"><div class="card-header"><strong>Đơn thuốc (toa)</strong></div>
        <div class="card-body" style="overflow:auto;padding:0">
          <table class="data-table" style="width:100%;font-size:13px;min-width:560px">
            <thead><tr><th>Mã toa</th><th>Bệnh nhân</th><th>Ngày lập</th><th style="text-align:right">Tổng tiền</th><th>Trạng thái</th><th>TT</th></tr></thead>
            <tbody>${rowsDt}</tbody>
          </table>
        </div></div>`;
  },

  async _xemChiTietBill(id) {
    if (!id) return;
    const res = await Http.layDanhSach(`/don-hang/don-hang/${id}/`);
    if (!res?.ok || !res?.data?.data) {
      return Toast.hien('Lỗi', (res?.data?.error || res?.data?.detail || 'Không tải được chi tiết bill'), 'error');
    }
    const d = res.data.data;
    const info = d.thong_tin_don_hang || {};
    const finance = d.thong_tin_tai_chinh || {};
    const details = Array.isArray(d.chi_tiet) ? d.chi_tiet : [];
    const history = Array.isArray(d.lich_su) ? d.lich_su : [];

    const detailRows =
      details
        .map(
          (x) => `<tr>
            <td>${this._esc(x.ten_thuoc || '')}</td>
            <td style="text-align:right">${Number(x.so_luong || 0).toLocaleString('vi-VN')}</td>
            <td style="text-align:right">${this._fmtMoney(x.don_gia_nhapnhap)}</td>
            <td style="text-align:right">${this._fmtMoney(x.thanh_tien)}</td>
          </tr>`
        )
        .join('') || '<tr><td colspan="4" class="text-muted">Không có chi tiết thuốc.</td></tr>';

    const historyRows =
      history
        .map(
          (x) => `<tr>
            <td>${(x.thoi_gian || '').replace('T', ' ').slice(0, 16)}</td>
            <td>${this._esc(x.trang_thai_cu || '')}</td>
            <td>${this._esc(x.trang_thai_moi || '')}</td>
            <td>${this._esc(x.nguoi_thay_doi || '')}</td>
          </tr>`
        )
        .join('') || '<tr><td colspan="4" class="text-muted">Không có lịch sử trạng thái.</td></tr>';

    Modal.tao({
      id: 'kt-bill-detail',
      tieu: `Chi tiết bill ${this._esc(d.ma_don_hang || '')}`,
      lon: true,
      noi: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px">
          <div><div class="text-muted small">Bệnh nhân</div><div>${this._esc(d.benh_nhan?.ho_ten || '')}</div></div>
          <div><div class="text-muted small">Ngày lập</div><div>${(info.ngay_tao || '').replace('T', ' ').slice(0, 16)}</div></div>
          <div><div class="text-muted small">Trạng thái</div><div>${this._esc(info.trang_thai_quan_ly || info.trang_thai_display || info.trang_thai || '')}</div></div>
          <div><div class="text-muted small">Loại đơn</div><div>${this._esc(info.loai_don || info.loai_don_ma || '')}</div></div>
        </div>

        <table class="data-table" style="width:100%;font-size:13px;margin-bottom:12px">
          <tbody>
            <tr><td>Tổng tiền hàng</td><td style="text-align:right">${this._fmtMoney(finance.tong_tien_hang)}</td></tr>
            <tr><td>Phí ship</td><td style="text-align:right">${this._fmtMoney(finance.phi_ship)}</td></tr>
            <tr><td>Giảm giá</td><td style="text-align:right">${this._fmtMoney(finance.giam_gia)}</td></tr>
            <tr><td><strong>Tổng thanh toán</strong></td><td style="text-align:right;font-weight:700">${this._fmtMoney(finance.tong_tien)}</td></tr>
          </tbody>
        </table>

        <h4 style="font-size:14px;margin:8px 0">Danh sách thuốc</h4>
        <div style="overflow:auto;max-height:220px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px">
          <table class="data-table" style="width:100%;font-size:13px;min-width:520px">
            <thead><tr><th>Thuốc</th><th style="text-align:right">SL</th><th style="text-align:right">Đơn giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </div>

        <h4 style="font-size:14px;margin:8px 0">Lịch sử trạng thái</h4>
        <div style="overflow:auto;max-height:200px;border:1px solid #e2e8f0;border-radius:8px">
          <table class="data-table" style="width:100%;font-size:13px;min-width:520px">
            <thead><tr><th>Thời gian</th><th>Trạng thái cũ</th><th>Trạng thái mới</th><th>Người cập nhật</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      `,
      chan: `<button type="button" class="btn btn-outline btn-sm" onclick="Modal.dong('kt-bill-detail')">Đóng</button>`,
    });
  },
};

window.PageKeToanDashboard = PageKeToanDashboard;
