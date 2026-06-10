/**
 * Module quản lý kho (nhúng trong dashboard kế toán) — tồn kho, nhập/xuất thuốc & vaccine, cảnh báo.
 */
const PageKhoDashboard = {
  _mainHostId: 'kho-main',

  _hostEl() {
    return document.getElementById(this._mainHostId || 'kho-main');
  },

  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  },

  _fmtVnd(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return `${v.toLocaleString('vi-VN')}₫`;
  },

  _tongTienNhapLot(r, loai) {
    if (r.tong_tien != null && r.tong_tien !== '') return Number(r.tong_tien);
    const dg = loai === 'vaccine' ? r.gia_nhap : r.don_gia_nhap;
    if (dg == null || dg === '') return null;
    return Number(dg) * Number(r.so_luong || 0);
  },

  _list(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.results)) return data.results;
    return [];
  },

  /** Gom lỗi DRF (detail / field errors) thành một chuỗi hiển thị toast. */
  _formatLoiApi(data) {
    if (data == null) return 'Gửi phiếu thất bại';
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data)) {
      const t = data.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
      return t || 'Gửi phiếu thất bại';
    }
    if (typeof data === 'object') {
      const parts = [];
      for (const [k, v] of Object.entries(data)) {
        if (v == null) continue;
        if (typeof v === 'string') parts.push(`${k}: ${v}`);
        else if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
        else if (typeof v === 'object') parts.push(`${k}: ${JSON.stringify(v)}`);
        else parts.push(`${k}: ${String(v)}`);
      }
      if (parts.length) return parts.join('; ');
    }
    return 'Gửi phiếu thất bại';
  },

  _setNavActive(tab) {
    document.querySelectorAll('[data-kho-nav]').forEach((b) => {
      const on = b.getAttribute('data-kho-nav') === tab;
      b.classList.toggle('active', on);
    });
  },

  async render() {
    this._mainHostId = 'kho-main';
    const { hoTen } = Auth.layThongTin();
    const navHtml = `
      <button type="button" class="nav-item" data-kho-nav="canh-bao" onclick="PageKhoDashboard.loadMain('canh-bao')"><i class="fas fa-exclamation-triangle"></i><span>Cảnh báo tồn</span></button>
      <button type="button" class="nav-item" data-kho-nav="thuoc" onclick="PageKhoDashboard.loadMain('thuoc')"><i class="fas fa-pills"></i><span>Kho thuốc</span></button>
      <button type="button" class="nav-item" data-kho-nav="vaccine" onclick="PageKhoDashboard.loadMain('vaccine')"><i class="fas fa-syringe"></i><span>Kho vaccine</span></button>
      <button type="button" class="nav-item" data-kho-nav="lich-su-nhap" onclick="PageKhoDashboard.loadMain('lich-su-nhap')"><i class="fas fa-history"></i><span>Lịch sử nhập kho</span></button>`;
    window.RoleDashboardShell.mount('app-root', {
      brandTitle: 'PhòngKhám+',
      brandAccent: 'Kho',
      brandIcon: 'fa-warehouse',
      navHtml,
      mainHostId: 'kho-main',
      userName: hoTen || 'Nhân viên',
      userRoleLabel: 'Quản lý kho thuốc & vaccine',
      contentMaxWidth: '1180px',
      headerActionsExtra: window.ThongBaoBell ? ThongBaoBell.htmlButton() : '',
    });
    if (window.ThongBaoBell) ThongBaoBell.init({ badgeId: 'pk-noti-badge' });
    await this.loadMain('canh-bao');
  },

  async loadMain(tab, opts = {}) {
    if (!opts.skipNav) this._setNavActive(tab);
    const host = this._hostEl();
    if (!host) return;
    host.innerHTML = '<p class="text-muted">Đang tải…</p>';
    if (tab === 'canh-bao') return this._canhBao(host);
    if (tab === 'thuoc') return this._bangKhoThuoc(host);
    if (tab === 'vaccine') return this._bangKhoVaccine(host);
    if (tab === 'lich-su-nhap') return this._lichSuNhapKho(host);
    return this._canhBao(host);
  },

  async _canhBao(host) {
    const res = await Http.layDanhSach('/thuoc/dashboard/canh_bao_ton_kho/');
    if (!res.ok || !res.data) {
      host.innerHTML = '<div class="card"><div class="card-body">Không tải được cảnh báo.</div></div>';
      return;
    }
    const d = res.data;
    const hangT = (d.thuoc_sap_het_hang || [])
      .map((x) => `<tr><td>${this._esc(x.thuoc)}</td><td>${x.ton_kho}</td></tr>`)
      .join('');
    const hangV = (d.vaccine_sap_het_hang || [])
      .map((x) => `<tr><td>${this._esc(x.vaccine)}</td><td>${x.ton_kho}</td></tr>`)
      .join('');
    const hetHanT = (d.thuoc_sap_het_han || [])
      .map(
        (r) =>
          `<tr><td>${this._esc(r.ten_thuoc)}</td><td>${this._esc(r.lo_sx || '')}</td><td>${r.so_luong}</td><td>${r.han_su_dung || ''}</td></tr>`
      )
      .join('');
    const hetHanV = (d.vaccine_sap_het_han || [])
      .map(
        (r) =>
          `<tr><td>${this._esc(r.ten_vaccine)}</td><td>${this._esc(r.lo_sx || '')}</td><td>${r.so_luong}</td><td>${r.han_su_dung || ''}</td></tr>`
      )
      .join('');
    host.innerHTML = `
      <div class="card mb-2"><div class="card-header"><strong>Cảnh báo sắp hết hàng (&lt; 10 đơn vị còn hạn)</strong></div>
        <div class="card-body">
          <p class="small text-muted">Thuốc</p>
          <table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Tên</th><th>Tồn</th></tr></thead><tbody>${hangT || '<tr><td colspan="2">Không có</td></tr>'}</tbody></table>
          <p class="small text-muted mt-3">Vaccine</p>
          <table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Tên</th><th>Tồn</th></tr></thead><tbody>${hangV || '<tr><td colspan="2">Không có</td></tr>'}</tbody></table>
        </div></div>
      <div class="card"><div class="card-header"><strong>Cảnh báo sắp hết hạn (90 ngày)</strong></div>
        <div class="card-body">
          <p class="small text-muted">Lô thuốc</p>
          <table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Thuốc</th><th>Lô</th><th>SL</th><th>Hạn</th></tr></thead><tbody>${hetHanT || '<tr><td colspan="4">Không có</td></tr>'}</tbody></table>
          <p class="small text-muted mt-3">Lô vaccine</p>
          <table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Vaccine</th><th>Lô</th><th>SL</th><th>Hạn</th></tr></thead><tbody>${hetHanV || '<tr><td colspan="4">Không có</td></tr>'}</tbody></table>
        </div></div>`;
  },

  async _bangKhoThuoc(host) {
    const res = await Http.layDanhSach('/thuoc/thuoc/?trang_thai=true&ordering=ma_thuoc&page_size=200');
    const rows = this._list(res.data);
    host.innerHTML = `
      <div class="card"><div class="card-header"><strong>Kho thuốc — theo danh mục</strong></div>
        <div class="card-body" style="overflow:auto">
          <table class="data-table" style="width:100%;font-size:13px">
            <thead><tr><th>Mã</th><th>Tên thuốc</th><th>Đơn vị</th><th>Tổng tồn</th><th>Hạn gần nhất</th><th></th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${this._esc(r.ma_thuoc || '')}</td>
                  <td>${this._esc(r.ten_thuoc || '')}</td>
                  <td>${this._esc(r.don_vi_ten || '')}</td>
                  <td>${r.ton_kho != null ? r.ton_kho : '—'}</td>
                  <td>${r.han_sd_gan_nhat || '—'}</td>
                  <td class="text-nowrap">
                    <button type="button" class="btn btn-primary btn-sm" onclick="PageKhoDashboard._moNhapThuoc('${r.id}')">Nhập kho</button>
                    <button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._moXuatLoThuoc('${r.id}')">Lô &amp; xuất</button>
                  </td>
                </tr>`
                )
                .join('') || '<tr><td colspan="6" class="text-muted">Chưa có thuốc trong danh mục.</td></tr>'}
            </tbody>
          </table>
        </div></div>`;
  },

  async _bangKhoVaccine(host) {
    const res = await Http.layDanhSach('/thuoc/vaccine/?trang_thai=true&ordering=ma_vaccine&page_size=200');
    const rows = this._list(res.data);
    host.innerHTML = `
      <div class="card"><div class="card-header"><strong>Kho vaccine — theo danh mục</strong></div>
        <div class="card-body" style="overflow:auto">
          <table class="data-table" style="width:100%;font-size:13px">
            <thead><tr><th>Mã</th><th>Tên vaccine</th><th>Tổng tồn</th><th>Hạn gần nhất</th><th></th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${this._esc(r.ma_vaccine || '')}</td>
                  <td>${this._esc(r.ten_vaccine || '')}</td>
                  <td>${r.ton_kho != null ? r.ton_kho : '—'}</td>
                  <td>${r.han_sd_gan_nhat || '—'}</td>
                  <td class="text-nowrap">
                    <button type="button" class="btn btn-primary btn-sm" onclick="PageKhoDashboard._moNhapVaccine('${r.id}')">Nhập kho</button>
                    <button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._moXuatLoVaccine('${r.id}')">Lô &amp; xuất</button>
                  </td>
                </tr>`
                )
                .join('') || '<tr><td colspan="5" class="text-muted">Chưa có vaccine trong danh mục.</td></tr>'}
            </tbody>
          </table>
        </div></div>`;
  },

  _dongOverlayXuatKho() {
    const el = document.getElementById('kho-overlay-xuat-lo');
    if (el) el.remove();
  },

  async _moXuatLoThuoc(thuocId) {
    const res = await Http.layDanhSach(
      `/thuoc/kho-thuoc/?thuoc=${encodeURIComponent(thuocId)}&ordering=han_su_dung&page_size=200`
    );
    const lots = this._list(res.data);
    const body =
      lots.length === 0
        ? '<p class="text-muted">Chưa có lô tồn cho thuốc này.</p>'
        : `<table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Lô</th><th>SL</th><th>Hạn</th><th></th></tr></thead><tbody>
            ${lots
              .map(
                (k) => `
              <tr>
                <td>${this._esc(k.lo_sx || '—')}</td>
                <td>${k.so_luong}</td>
                <td>${k.han_su_dung || ''}</td>
                <td><button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._xuatThuocLo('${k.id}')">Xuất</button></td>
              </tr>`
              )
              .join('')}
          </tbody></table>`;
    this._dongOverlayXuatKho();
    const ov = document.createElement('div');
    ov.id = 'kho-overlay-xuat-lo';
    ov.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    ov.innerHTML = `
      <div class="card" style="max-width:560px;width:100%;max-height:90vh;overflow:auto">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong>Lô kho — thuốc</strong>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-primary btn-sm" onclick="PageKhoDashboard._moNhapThuoc('${this._esc(thuocId)}')">Nhập thêm</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._dongOverlayXuatKho()">Đóng</button>
          </div>
        </div>
        <div class="card-body">${body}</div>
      </div>`;
    ov.onclick = (e) => {
      if (e.target === ov) this._dongOverlayXuatKho();
    };
    document.body.appendChild(ov);
  },

  async _moXuatLoVaccine(vaccineId) {
    const res = await Http.layDanhSach(
      `/thuoc/kho-vaccine/?vaccine=${encodeURIComponent(vaccineId)}&ordering=han_su_dung&page_size=200`
    );
    const lots = this._list(res.data);
    const body =
      lots.length === 0
        ? '<p class="text-muted">Chưa có lô tồn cho vaccine này.</p>'
        : `<table class="data-table" style="width:100%;font-size:13px"><thead><tr><th>Lô</th><th>SL</th><th>Hạn</th><th></th></tr></thead><tbody>
            ${lots
              .map(
                (k) => `
              <tr>
                <td>${this._esc(k.lo_sx || '—')}</td>
                <td>${k.so_luong}</td>
                <td>${k.han_su_dung || ''}</td>
                <td><button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._xuatVaccineLo('${k.id}')">Xuất</button></td>
              </tr>`
              )
              .join('')}
          </tbody></table>`;
    this._dongOverlayXuatKho();
    const ov = document.createElement('div');
    ov.id = 'kho-overlay-xuat-lo';
    ov.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    ov.innerHTML = `
      <div class="card" style="max-width:560px;width:100%;max-height:90vh;overflow:auto">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong>Lô kho — vaccine</strong>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-primary btn-sm" onclick="PageKhoDashboard._moNhapVaccine('${this._esc(vaccineId)}')">Nhập thêm</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._dongOverlayXuatKho()">Đóng</button>
          </div>
        </div>
        <div class="card-body">${body}</div>
      </div>`;
    ov.onclick = (e) => {
      if (e.target === ov) this._dongOverlayXuatKho();
    };
    document.body.appendChild(ov);
  },

  async _xuatThuocLo(id) {
    const sl = window.prompt('Số lượng xuất khỏi lô này?', '1');
    if (sl == null) return;
    const n = parseInt(sl, 10);
    if (!n || n < 1) return Toast.hien('Lỗi', 'Số lượng không hợp lệ', 'error');
    const res = await Http.tao(`/thuoc/kho-thuoc/${id}/xuat-sl/`, { so_luong: n });
    if (res.ok) {
      Toast.hien('Đã xuất kho', '', 'success');
      this._dongOverlayXuatKho();
      const host = this._hostEl();
      if (host) await this._bangKhoThuoc(host);
    } else Toast.hien('Lỗi', (res.data && res.data.error) || 'Xuất thất bại', 'error');
  },

  async _xuatVaccineLo(id) {
    const sl = window.prompt('Số lượng xuất khỏi lô này?', '1');
    if (sl == null) return;
    const n = parseInt(sl, 10);
    if (!n || n < 1) return Toast.hien('Lỗi', 'Số lượng không hợp lệ', 'error');
    const res = await Http.tao(`/thuoc/kho-vaccine/${id}/xuat-sl/`, { so_luong: n });
    if (res.ok) {
      Toast.hien('Đã xuất kho', '', 'success');
      this._dongOverlayXuatKho();
      const host = this._hostEl();
      if (host) await this._bangKhoVaccine(host);
    } else Toast.hien('Lỗi', (res.data && res.data.error) || 'Xuất thất bại', 'error');
  },

  _todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _defaultHanSD() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _dongOverlayNhapKho() {
    const el = document.getElementById('kho-overlay-nhap');
    if (el) el.remove();
  },

  _moNhapThuoc(thuocId) {
    this._moNhapKhoForm({
      loai: 'thuoc',
      id: thuocId,
      title: 'Nhập kho thuốc',
      api: '/thuoc/kho-thuoc/',
      fieldId: 'thuoc',
    });
  },

  _moNhapVaccine(vaccineId) {
    this._moNhapKhoForm({
      loai: 'vaccine',
      id: vaccineId,
      title: 'Nhập kho vaccine',
      api: '/thuoc/kho-vaccine/',
      fieldId: 'vaccine',
    });
  },

  async _moNhapKhoForm(opts) {
    const today = this._todayYMD();
    const defHan = this._defaultHanSD();
    let optionsHtml = '';
    let catalogById = {};
    try {
      const url = opts.loai === 'vaccine' ? '/thuoc/vaccine/?page_size=500' : '/thuoc/thuoc/?page_size=500';
      const res = await Http.layDanhSach(url);
      const list = this._list(res.data);
      if (!list.length) {
        return Toast.hien('Lỗi', `Chưa có ${opts.loai === 'vaccine' ? 'vaccine' : 'thuốc'} trong danh mục`, 'error');
      }
      list.forEach((x) => { catalogById[String(x.id)] = x; });
      optionsHtml = list
        .map((x) => {
          const id = x.id;
          const label =
            opts.loai === 'vaccine'
              ? `${x.ma_vaccine || ''} — ${x.ten_vaccine || ''}`
              : `${x.ma_thuoc || ''} — ${x.ten_thuoc || ''}`;
          const sel = String(id) === String(opts.id) ? ' selected' : '';
          return `<option value="${this._esc(id)}"${sel}>${this._esc(label)}</option>`;
        })
        .join('');
    } catch (e) {
      return Toast.hien('Lỗi', 'Không tải danh mục', 'error');
    }

    this._dongOverlayNhapKho();
    const ov = document.createElement('div');
    ov.id = 'kho-overlay-nhap';
    ov.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    ov.innerHTML = `
      <div class="card" style="max-width:440px;width:100%">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong>${this._esc(opts.title)}</strong>
          <button type="button" class="btn btn-outline btn-sm" onclick="PageKhoDashboard._dongOverlayNhapKho()">Đóng</button>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-3">Tồn kho cập nhật ngay sau khi lưu.</p>
          <div class="form-group">
            <label class="form-label">${opts.loai === 'vaccine' ? 'Vaccine' : 'Thuốc'} *</label>
            <select id="kho-nhap-id" class="form-control">${optionsHtml}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Số lượng *</label>
            <input type="number" id="kho-nhap-sl" class="form-control" min="1" step="1" value="1"/>
          </div>
          <div class="form-group">
            <label class="form-label">Ngày nhập *</label>
            <input type="date" id="kho-nhap-ngay" class="form-control" value="${today}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Hạn sử dụng *</label>
            <input type="date" id="kho-nhap-han" class="form-control" value="${defHan}"/>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Lô sản xuất</label>
            <input type="text" id="kho-nhap-lo" class="form-control" placeholder="VD: LOSX-2026-001"/>
          </div>
          <p id="kho-nhap-tong-preview" class="text-muted small" style="margin-top:12px"></p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-primary" id="kho-nhap-submit">Lưu nhập kho</button>
            <button type="button" class="btn btn-outline" onclick="PageKhoDashboard._dongOverlayNhapKho()">Hủy</button>
          </div>
        </div>
      </div>`;
    ov.onclick = (e) => {
      if (e.target === ov) this._dongOverlayNhapKho();
    };
    document.body.appendChild(ov);
    const btn = document.getElementById('kho-nhap-submit');
    if (btn) {
      btn.onclick = () =>
        this._guiNhapKhoTrucTiep({
          api: opts.api,
          fieldId: opts.fieldId,
          loai: opts.loai,
        });
    }
    this._bindNhapKhoTongPreview(catalogById, opts.loai);
  },

  _bindNhapKhoTongPreview(catalogById, loai) {
    const sel = document.getElementById('kho-nhap-id');
    const qty = document.getElementById('kho-nhap-sl');
    const preview = document.getElementById('kho-nhap-tong-preview');
    if (!sel || !qty || !preview) return;
    const refresh = () => {
      const row = catalogById[String(sel.value || '')] || {};
      const dg = loai === 'vaccine' ? row.gia_nhap : row.don_gia_nhap;
      const sl = parseInt(qty.value || '0', 10);
      const tong = dg != null && sl > 0 ? Number(dg) * sl : 0;
      preview.innerHTML =
        tong > 0
          ? `<strong>Tổng tiền nhập:</strong> ${this._fmtVnd(tong)} <span class="text-muted">(SL × ĐG ${this._fmtVnd(dg)})</span>`
          : '<span class="text-muted">Chưa có đơn giá nhập trên danh mục.</span>';
    };
    sel.addEventListener('change', refresh);
    qty.addEventListener('input', refresh);
    refresh();
  },

  async _guiNhapKhoTrucTiep(opts) {
    const idVal = document.getElementById('kho-nhap-id')?.value;
    const sl = parseInt(document.getElementById('kho-nhap-sl')?.value || '0', 10);
    const ngayNhap = document.getElementById('kho-nhap-ngay')?.value;
    const hanSd = document.getElementById('kho-nhap-han')?.value;
    const loSx = (document.getElementById('kho-nhap-lo')?.value || '').trim();
    if (!idVal || !sl || sl < 1 || !ngayNhap || !hanSd) {
      return Toast.hien('Lỗi', 'Nhập đủ số lượng, ngày nhập và hạn sử dụng', 'error');
    }
    if (hanSd <= ngayNhap) {
      return Toast.hien('Lỗi', 'Hạn sử dụng phải sau ngày nhập', 'error');
    }
    const payload = {
      [opts.fieldId]: idVal,
      so_luong: sl,
      ngay_nhap: ngayNhap,
      han_su_dung: hanSd,
      lo_sx: loSx,
    };
    const res = await Http.tao(opts.api, payload);
    if (!res.ok) {
      const msg =
        (res.data && (res.data.detail || res.data.error)) ||
        this._formatLoiApi(res.data) ||
        'Nhập kho thất bại';
      return Toast.hien('Lỗi', typeof msg === 'string' ? msg : 'Nhập kho thất bại', 'error');
    }
    Toast.hien('Đã nhập kho', 'Tồn kho đã được cập nhật.', 'success');
    this._dongOverlayNhapKho();
    this._dongOverlayXuatKho();
    const host = this._hostEl();
    if (!host) return;
    const activeNav = document.querySelector('[data-kho-nav].active')?.getAttribute('data-kho-nav');
    if (activeNav === 'lich-su-nhap') await this._lichSuNhapKho(host);
    else if (opts.loai === 'vaccine') await this._bangKhoVaccine(host);
    else await this._bangKhoThuoc(host);
  },

  async _lichSuNhapKho(host, loaiFilter) {
    const filter = loaiFilter || this._lichSuNhapFilter || 'all';
    this._lichSuNhapFilter = filter;
    host.innerHTML = `
      <div class="card">
        <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <strong>Lịch sử nhập kho</strong>
          <div class="d-flex gap-2 flex-wrap">
            <button type="button" class="btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}" onclick="PageKhoDashboard._lichSuNhapKho(PageKhoDashboard._hostEl(),'all')">Tất cả</button>
            <button type="button" class="btn btn-sm ${filter === 'thuoc' ? 'btn-primary' : 'btn-outline'}" onclick="PageKhoDashboard._lichSuNhapKho(PageKhoDashboard._hostEl(),'thuoc')">Thuốc</button>
            <button type="button" class="btn btn-sm ${filter === 'vaccine' ? 'btn-primary' : 'btn-outline'}" onclick="PageKhoDashboard._lichSuNhapKho(PageKhoDashboard._hostEl(),'vaccine')">Vaccine</button>
          </div>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-3">Mỗi lần bấm <strong>Nhập kho</strong> tạo một <strong>lô</strong> mới trong hệ thống (không dùng phiếu nhập).</p>
          <div id="kho-ls-nhap-body"><div class="page-loading"><div class="spinner"></div></div></div>
        </div>
      </div>`;

    const bodyEl = document.getElementById('kho-ls-nhap-body');
    if (!bodyEl) return;

    const rows = [];
    try {
      if (filter === 'all' || filter === 'thuoc') {
        const rt = await Http.layDanhSach('/thuoc/kho-thuoc/?ordering=-ngay_nhap,-id&page_size=200');
        this._list(rt.data).forEach((r) => {
          rows.push({
            loai: 'Thuốc',
            loaiKey: 'thuoc',
            ma: r.ma_thuoc || '',
            ten: r.ten_thuoc || '',
            ngay_nhap: r.ngay_nhap,
            so_luong: r.so_luong,
            don_gia: r.don_gia_nhap,
            tong_tien: this._tongTienNhapLot(r, 'thuoc'),
            han_su_dung: r.han_su_dung,
            lo_sx: r.lo_sx,
            sortKey: `${r.ngay_nhap || ''}-${r.id || ''}`,
          });
        });
      }
      if (filter === 'all' || filter === 'vaccine') {
        const rv = await Http.layDanhSach('/thuoc/kho-vaccine/?ordering=-ngay_nhap,-id&page_size=200');
        this._list(rv.data).forEach((r) => {
          rows.push({
            loai: 'Vaccine',
            loaiKey: 'vaccine',
            ma: r.ma_vaccine || '',
            ten: r.ten_vaccine || '',
            ngay_nhap: r.ngay_nhap,
            so_luong: r.so_luong,
            don_gia: r.gia_nhap,
            tong_tien: this._tongTienNhapLot(r, 'vaccine'),
            han_su_dung: r.han_su_dung,
            lo_sx: r.lo_sx,
            sortKey: `${r.ngay_nhap || ''}-${r.id || ''}`,
          });
        });
      }
    } catch (e) {
      bodyEl.innerHTML = '<p class="text-danger">Không tải được lịch sử nhập.</p>';
      return;
    }

    rows.sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));

    if (!rows.length) {
      bodyEl.innerHTML = '<p class="text-muted">Chưa có lô nhập kho nào. Dùng nút <strong>Nhập kho</strong> ở tab Kho thuốc / Kho vaccine.</p>';
      return;
    }

    bodyEl.innerHTML = `
      <div style="overflow:auto">
        <table class="data-table" style="width:100%;font-size:13px;min-width:900px">
          <thead>
            <tr>
              <th>Ngày nhập</th><th>Loại</th><th>Mã</th><th>Tên</th>
              <th style="text-align:right">SL lô</th>
              <th style="text-align:right">ĐG nhập</th>
              <th style="text-align:right">Tổng tiền nhập</th>
              <th>Hạn SD</th><th>Lô SX</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${this._esc(r.ngay_nhap || '—')}</td>
                <td>${this._esc(r.loai)}</td>
                <td>${this._esc(r.ma || '—')}</td>
                <td>${this._esc(r.ten || '—')}</td>
                <td style="text-align:right"><strong>${r.so_luong ?? '—'}</strong></td>
                <td style="text-align:right">${r.don_gia != null ? this._fmtVnd(r.don_gia) : '—'}</td>
                <td style="text-align:right"><strong>${r.tong_tien != null ? this._fmtVnd(r.tong_tien) : '—'}</strong></td>
                <td>${this._esc(r.han_su_dung || '—')}</td>
                <td>${this._esc(r.lo_sx || '—')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="text-muted small mt-2 mb-0">Hiển thị tối đa 200 lô gần nhất. Cột <em>SL lô</em> là số lượng còn trong lô (giảm khi xuất/bán/tiêm).</p>`;
  },

};

window.PageKhoDashboard = PageKhoDashboard;
