/**
 * Mua thuốc — giao diện kiểu nhà thuốc: danh mục, tìm kiếm, lưới sản phẩm có ảnh, giỏ hàng.
 * Vaccine: xem theo danh mục (chỉ hiển thị; đặt lịch tiêm qua Lịch hẹn).
 */
const PageMuaThuoc = {
  _benhNhanId: null,
  _userMe: null,
  _dsThuoc: [],
  _dsVaccine: [],
  _gio: [],
  _hostElementId: 'benh-nhan-main-content',
  _tab: 'thuoc',
  _loaiThuocId: '',
  _loaiVaccineId: '',
  _loaiThuocList: [],
  _loaiVaccineList: [],

  _apiBase() {
    return (typeof CFG !== 'undefined' && CFG.API_BASE) ? CFG.API_BASE.replace(/\/$/, '') : '';
  },

  _mediaUrl(hinhAnhUrl) {
    if (!hinhAnhUrl) return '';
    if (String(hinhAnhUrl).startsWith('http')) return hinhAnhUrl;
    const base = this._apiBase();
    const p = String(hinhAnhUrl).startsWith('/') ? hinhAnhUrl : `/${hinhAnhUrl}`;
    return base ? `${base}${p}` : p;
  },

  /** DRF: mảng thuần | { results } | bọc { data: { results } } */
  _extractApiList(res) {
    if (!res?.ok) return [];
    const d = res?.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.results)) return d.results;
    if (d && d.data && Array.isArray(d.data.results)) return d.data.results;
    if (d && d.data && Array.isArray(d.data)) return d.data;
    return [];
  },

  /** Giỏ hàng JsonResponse: { success, data: { items } } hoặc tương thích */
  _parseGioHangItems(body) {
    if (!body || typeof body !== 'object') return [];
    if (body.success === false) return null;
    const inner = body.data !== undefined ? body.data : body;
    if (inner && Array.isArray(inner.items)) return inner.items;
    if (Array.isArray(inner)) return inner;
    return [];
  },

  async render(options = {}) {
    this._benhNhanId = options?.benhNhanId || this._benhNhanId;
    this._hostElementId = options?.hostElementId || this._hostElementId;
    await this._ensureBenhNhanId();

    let loaiT = [];
    let loaiV = [];
    try {
      const [rt, rv] = await Promise.all([
        Http.layDanhSach('/thuoc/loai-thuoc/'),
        Http.layDanhSach('/thuoc/loai-vaccine/')
      ]);
      loaiT = this._extractApiList(rt);
      loaiV = this._extractApiList(rv);
    } catch (e) {
      console.warn('Loại thuốc/vaccine:', e);
    }
    this._loaiThuocList = loaiT;
    this._loaiVaccineList = loaiV;

    UI.render(this._hostElementId, `
      <style>
        .bn-shop-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        .bn-shop-bar{position:sticky;top:0;z-index:20;background:#fff;border-radius:14px;box-shadow:0 4px 20px rgba(15,35,66,.08);padding:12px 14px;margin-bottom:14px}
        .bn-shop-bar-inner{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .bn-shop-search{flex:1;min-width:200px;display:flex;gap:8px;align-items:center}
        .bn-shop-search input{flex:1;border:1px solid #e2e8f0;border-radius:999px;padding:11px 18px;font-size:14px;outline:none}
        .bn-shop-search input:focus{border-color:#00C9A7;box-shadow:0 0 0 3px rgba(0,201,167,.15)}
        .bn-cart-pill{position:relative;border:none;background:linear-gradient(135deg,#00C9A7,#0ea5e9);color:#fff;border-radius:999px;padding:11px 18px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:14px;white-space:nowrap}
        .bn-cart-pill .bn-cart-badge{position:absolute;top:-8px;right:-4px;background:#ef4444;color:#fff;border-radius:999px;font-size:11px;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:800}
        .bn-tabs{display:flex;gap:8px;margin-bottom:12px}
        .bn-tab{padding:8px 18px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-weight:600;font-size:14px;color:#475569}
        .bn-tab.active{background:#0A2342;color:#fff;border-color:#0A2342}
        .bn-layout{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
        @media(max-width:1024px){.bn-layout{grid-template-columns:1fr}}
        .bn-cats-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
        .bn-chip{padding:8px 14px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;font-size:13px;cursor:pointer;white-space:nowrap}
        .bn-chip.active{background:#E6F7F4;border-color:#00C9A7;color:#0A2342;font-weight:600}
        .bn-side-cats{background:#fff;border-radius:12px;border:1px solid #e8edf2;padding:10px 0;margin-bottom:14px}
        .bn-side-cats h4{margin:0 12px 10px;font-size:13px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
        .bn-cat-line{display:block;width:100%;text-align:left;padding:10px 14px;border:none;background:transparent;cursor:pointer;font-size:14px;color:#334155;border-left:3px solid transparent}
        .bn-cat-line:hover{background:#f8fafc}
        .bn-cat-line.active{background:#f0fdf9;border-left-color:#00C9A7;font-weight:600;color:#0A2342}
        .bn-main-grid{display:grid;grid-template-columns:200px 1fr;gap:16px}
        @media(max-width:900px){.bn-main-grid{grid-template-columns:1fr}.bn-side-desktop{display:none}}
        .bn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:14px}
        .bn-card{border:1px solid #e8edf2;border-radius:14px;overflow:hidden;background:#fff;display:flex;flex-direction:column;transition:box-shadow .2s}
        .bn-card:hover{box-shadow:0 8px 24px rgba(15,35,66,.1)}
        .bn-card-img{height:152px;background:linear-gradient(180deg,#f8fafc,#f1f5f9);display:flex;align-items:center;justify-content:center;padding:8px}
        .bn-card-img img{max-width:100%;max-height:136px;object-fit:contain}
        .bn-card-body{padding:10px 12px;flex:1}
        .bn-card-title{font-weight:700;font-size:13px;line-height:1.35;margin:0 0 6px;color:#0A2342;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}
        .bn-card-meta{font-size:11px;color:#64748b}
        .bn-card-price{color:#c02626;font-weight:800;font-size:15px;margin-top:8px}
        .bn-card-actions{padding:0 12px 12px}
        .bn-cart-card{border-radius:14px;border:1px solid #e8edf2;background:#fff;position:sticky;top:88px}
        .bn-cart-card .card-header{background:#f8fafc;border-bottom:1px solid #e8edf2;font-weight:800}
      </style>

      <div class="bn-shop-head">
        <div>
          <h2 style="font-size:22px;color:var(--c-navy);margin:0">Nhà thuốc trực tuyến</h2>
          <p class="text-muted" style="margin:4px 0 0;font-size:14px">Danh mục • Tìm kiếm • Giỏ hàng</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="PageBenhNhanDashboard.chuyenTrang('dashboard')">
          <i class="fas fa-arrow-left"></i> Về tổng quan
        </button>
      </div>

      <div class="bn-shop-bar">
        <div class="bn-shop-bar-inner">
          <div class="bn-shop-search">
            <i class="fas fa-search" style="color:#94a3b8"></i>
            <input type="search" id="bn-drug-search" placeholder="Tìm thuốc, hoạt chất, tên sản phẩm..." autocomplete="off">
            <button class="btn btn-primary btn-sm" type="button" onclick="PageMuaThuoc.taiSanPham()"><i class="fas fa-search"></i> Tìm</button>
          </div>
          <button type="button" class="bn-cart-pill" onclick="PageMuaThuoc._scrollToCart()" title="Giỏ hàng">
            <i class="fas fa-shopping-cart"></i> Giỏ hàng
            <span class="bn-cart-badge" id="bn-cart-badge" style="display:none">0</span>
          </button>
        </div>
      </div>

      <div class="bn-tabs" role="tablist">
        <button type="button" class="bn-tab active" id="bn-tab-thuoc" onclick="PageMuaThuoc.setTab('thuoc')">Thuốc</button>
        <button type="button" class="bn-tab" id="bn-tab-vaccine" onclick="PageMuaThuoc.setTab('vaccine')">Vaccine tiêm chủng</button>
      </div>

      <div class="bn-layout">
        <div>
          <div class="bn-cats-chips bn-cats-mobile-only" id="bn-cats-chips"></div>
          <div class="bn-main-grid">
            <aside class="bn-side-desktop">
              <div class="bn-side-cats" id="bn-side-cats"></div>
            </aside>
            <div>
              <div id="bn-product-list"><div class="page-loading"><div class="spinner"></div></div></div>
            </div>
          </div>
        </div>

        <aside class="bn-cart-card" id="bn-cart-aside">
          <div class="card-header" style="padding:12px 16px;border-radius:14px 14px 0 0">Giỏ hàng</div>
          <div class="card-body" id="bn-cart-list" style="padding:12px 16px;max-height:min(52vh,420px);overflow-y:auto"><p class="text-muted">Đang tải…</p></div>
          <div style="padding:12px 16px;border-top:1px solid #e8edf2;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div style="font-weight:800;color:var(--c-navy)" id="bn-cart-total">0đ</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <select id="bn-order-payment" class="form-control" style="min-width:120px;font-size:13px">
                <option value="COD">COD</option>
                <option value="VNPAY">VNPay</option>
              </select>
              <button class="btn btn-mint btn-sm" onclick="PageMuaThuoc.taoDonHang()"><i class="fas fa-check"></i> Đặt mua</button>
            </div>
          </div>
          <div class="card-body" style="border-top:1px dashed #e2e8f0;padding:12px 16px">
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:13px">Số điện thoại nhận *</label>
              <input type="text" id="bn-order-phone" class="form-control" placeholder="SĐT người nhận">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:13px">Email nhận xác nhận <span id="bn-email-required" class="text-muted">(bắt buộc khi VNPay)</span></label>
              <input type="email" id="bn-order-email" class="form-control" placeholder="Email tài khoản đã đăng ký">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:13px">Địa chỉ giao hàng *</label>
              <textarea id="bn-order-address" class="form-control" rows="2" placeholder="Số nhà, đường, phường..."></textarea>
            </div>
          </div>
        </aside>
      </div>
    `);

    document.getElementById('bn-drug-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.taiSanPham();
    });

    this._renderCategoryUi();
    await this.taiSanPham();
    await this.taiGioHang();
  },

  setTab(tab) {
    this._tab = tab === 'vaccine' ? 'vaccine' : 'thuoc';
    document.getElementById('bn-tab-thuoc')?.classList.toggle('active', this._tab === 'thuoc');
    document.getElementById('bn-tab-vaccine')?.classList.toggle('active', this._tab === 'vaccine');
    this._renderCategoryUi();
    this.taiSanPham();
  },

  _renderCategoryUi() {
    const side = document.getElementById('bn-side-cats');
    const chips = document.getElementById('bn-cats-chips');
    if (this._tab === 'thuoc') {
      const title = 'Danh mục thuốc';
      const list = this._loaiThuocList;
      const cur = this._loaiThuocId;
      const allBtn = `<button type="button" class="bn-cat-line ${!cur ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiThuoc('')">Tất cả</button>`;
      const rest = list.map((x) => `
        <button type="button" class="bn-cat-line ${String(cur) === String(x.id) ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiThuoc('${x.id}')">${this._esc(x.ten_loai)}</button>
      `).join('');
      if (side) side.innerHTML = `<h4>${title}</h4>${allBtn}${rest}`;

      const chipAll = `<button type="button" class="bn-chip ${!cur ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiThuoc('')">Tất cả</button>`;
      const chipRest = list.map((x) => `
        <button type="button" class="bn-chip ${String(cur) === String(x.id) ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiThuoc('${x.id}')">${this._esc(x.ten_loai)}</button>
      `).join('');
      if (chips) chips.innerHTML = chipAll + chipRest;
    } else {
      const title = 'Danh mục vaccine';
      const list = this._loaiVaccineList;
      const cur = this._loaiVaccineId;
      const allBtn = `<button type="button" class="bn-cat-line ${!cur ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiVaccine('')">Tất cả</button>`;
      const rest = list.map((x) => `
        <button type="button" class="bn-cat-line ${String(cur) === String(x.id) ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiVaccine('${x.id}')">${this._esc(x.ten_loai)}</button>
      `).join('');
      if (side) side.innerHTML = `<h4>${title}</h4>${allBtn}${rest}`;
      const chipAll = `<button type="button" class="bn-chip ${!cur ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiVaccine('')">Tất cả</button>`;
      const chipRest = list.map((x) => `
        <button type="button" class="bn-chip ${String(cur) === String(x.id) ? 'active' : ''}" onclick="PageMuaThuoc.setLoaiVaccine('${x.id}')">${this._esc(x.ten_loai)}</button>
      `).join('');
      if (chips) chips.innerHTML = chipAll + chipRest;
    }
  },

  setLoaiThuoc(id) {
    this._loaiThuocId = id || '';
    this._renderCategoryUi();
    this.taiSanPham();
  },

  setLoaiVaccine(id) {
    this._loaiVaccineId = id || '';
    this._renderCategoryUi();
    this.taiSanPham();
  },

  async taiSanPham() {
    const host = document.getElementById('bn-product-list');
    if (!host) return;
    host.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';

    const q = (document.getElementById('bn-drug-search')?.value || '').trim();

    if (this._tab === 'vaccine') {
      const params = new URLSearchParams();
      params.set('trang_thai', 'true');
      if (q) params.set('search', q);
      if (this._loaiVaccineId) params.set('loai_vaccine', this._loaiVaccineId);
      const res = await Http.layDanhSach(`/thuoc/vaccine/?${params.toString()}`);
      if (!res?.ok) {
        const err = res?.data?.detail || res?.data?.error || `HTTP ${res?.status || '?'}`;
        host.innerHTML = `<p class="text-danger text-center" style="padding:28px">Không tải được vaccine: ${this._esc(String(err))}</p>`;
        return;
      }
      const list = this._extractApiList(res);
      this._dsVaccine = list;
      if (!list.length) {
        host.innerHTML = '<p class="text-muted text-center" style="padding:28px">Không có vaccine phù hợp (chỉ hiển thị vaccine đang kinh doanh).</p>';
        return;
      }
      host.innerHTML = `
        <p class="text-muted" style="font-size:13px;margin:0 0 12px">Xem giá &amp; thông tin. Đặt lịch tiêm tại mục <strong>Lịch hẹn</strong>.</p>
        <div class="bn-grid">
          ${list.map((v) => this._cardVaccine(v)).join('')}
        </div>`;
      return;
    }

    const params = new URLSearchParams();
    /* BENH_NHAN: server trả toàn bộ bản ghi phù hợp (không phân trang); lọc thuốc không kê đơn + đang bán */
    params.set('trang_thai', 'true');
    if (q) params.set('search', q);
    if (this._loaiThuocId) params.set('loai_thuoc', this._loaiThuocId);

    const res = await Http.layDanhSach(`/thuoc/thuoc/?${params.toString()}`);
    if (!res?.ok) {
      const err = res?.data?.detail || res?.data?.error || `HTTP ${res?.status || '?'}`;
      host.innerHTML = `<p class="text-danger text-center" style="padding:28px">Không tải được thuốc: ${this._esc(String(err))}</p>`;
      return;
    }
    const list = this._extractApiList(res);
    this._dsThuoc = list;

    if (!list.length) {
      host.innerHTML = '<p class="text-muted text-center" style="padding:28px">Không có thuốc phù hợp. Cửa hàng chỉ bán thuốc <strong>không kê đơn</strong> và đang kinh doanh.</p>';
      return;
    }

    host.innerHTML = `<div class="bn-grid">${list.map((t) => this._cardThuoc(t)).join('')}</div>`;
  },

  _cardThuoc(t) {
    const img = this._mediaUrl(t.hinh_anh_url);
    const ton = t.ton_kho ?? 0;
    const disabled = ton <= 0;
    const loai = this._esc(t.loai_thuoc_ten || '');
    return `
      <div class="bn-card">
        <div class="bn-card-img">
          ${img
            ? `<img src="${this._esc(img)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML='<span style=font-size:52px>💊</span>'">`
            : '<span style="font-size:52px">💊</span>'}
        </div>
        <div class="bn-card-body">
          <div class="bn-card-title">${this._esc(t.ten_thuoc || '—')}</div>
          <div class="bn-card-meta">${loai ? loai + ' • ' : ''}${this._esc(t.don_vi_ten || '')} • Tồn: ${ton}</div>
          <div class="bn-card-price">${UI.formatTien(t.gia_ban || 0)}</div>
        </div>
        <div class="bn-card-actions">
          <button class="btn btn-primary btn-sm" style="width:100%" ${disabled ? 'disabled' : ''} onclick="PageMuaThuoc.themVaoGio('${t.id}')">
            <i class="fas fa-cart-plus"></i> ${disabled ? 'Hết hàng' : 'Thêm giỏ'}
          </button>
        </div>
      </div>`;
  },

  _cardVaccine(v) {
    const img = this._mediaUrl(v.hinh_anh_url);
    const loai = this._esc(v.loai_vaccine_ten || '');
    return `
      <div class="bn-card">
        <div class="bn-card-img">
          ${img
            ? `<img src="${this._esc(img)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML='<span style=font-size:52px>💉</span>'">`
            : '<span style="font-size:52px">💉</span>'}
        </div>
        <div class="bn-card-body">
          <div class="bn-card-title">${this._esc(v.ten_vaccine || '—')}</div>
          <div class="bn-card-meta">${loai ? loai + ' • ' : ''}${this._esc(v.phong_benh || '')}</div>
          <div class="bn-card-price">${UI.formatTien(v.gia_tiem || 0)} <span style="font-size:11px;font-weight:600;color:#64748b">/ mũi</span></div>
        </div>
        <div class="bn-card-actions">
          <button type="button" class="btn btn-outline btn-sm" style="width:100%" onclick="PageBenhNhanDashboard.chuyenTrang('lich-hen')">
            <i class="fas fa-calendar-check"></i> Đặt lịch tiêm
          </button>
        </div>
      </div>`;
  },

  _scrollToCart() {
    document.getElementById('bn-cart-aside')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _updateCartBadge() {
    const n = this._gio.reduce((s, i) => s + Number(i.so_luong || 0), 0);
    const el = document.getElementById('bn-cart-badge');
    if (el) {
      el.textContent = String(n);
      el.style.display = n > 0 ? 'flex' : 'none';
    }
  },

  async themVaoGio(id) {
    await this._ensureBenhNhanId();
    if (!this._benhNhanId) {
      return Toast.loi('Không thêm được vào giỏ', 'Chưa xác định hồ sơ bệnh nhân. Vui lòng đăng nhập lại.');
    }

    const thuoc = this._dsThuoc.find((x) => String(x.id) === String(id));
    if (!thuoc) return;

    const idx = this._gio.findIndex((x) => String(x.thuoc_id) === String(id));
    const soLuongHienTai = idx >= 0 ? Number(this._gio[idx].so_luong || 0) : 0;
    const soLuongMoi = soLuongHienTai + 1;
    if (soLuongMoi > Number(thuoc.ton_kho || 0)) {
      return Toast.canh('Quá tồn kho', 'Không thể thêm vượt số lượng tồn');
    }

    const addRes = await Http.tao('/don-hang/gio-hang/them/', {
      benh_nhan_id: this._benhNhanId,
      thuoc_id: id,
      so_luong: soLuongMoi
    });
    if (!addRes?.ok || !addRes?.data?.success) {
      return Toast.loi('Không thể thêm vào giỏ', addRes?.data?.error || 'Có lỗi xảy ra');
    }
    await this.taiGioHang();
    await this.taiSanPham();
  },

  async capNhatSoLuong(itemId, delta) {
    const idx = this._gio.findIndex((x) => String(x.id) === String(itemId));
    if (idx < 0) return;
    const next = Number(this._gio[idx].so_luong || 0) + delta;

    if (next <= 0) {
      const removeRes = await Http.xoa(`/don-hang/gio-hang/xoa/${itemId}/`);
      if (!removeRes?.ok || !removeRes?.data?.success) {
        return Toast.loi('Không thể xóa khỏi giỏ', removeRes?.data?.error || 'Có lỗi xảy ra');
      }
      await this.taiGioHang();
      await this.taiSanPham();
      return;
    }
    if (next > this._gio[idx].ton_kho) return Toast.canh('Quá tồn kho', 'Không thể thêm vượt số lượng tồn');

    const updateRes = await Http.capNhat(`/don-hang/gio-hang/cap-nhat/${itemId}/`, { so_luong: next });
    if (!updateRes?.ok || !updateRes?.data?.success) {
      return Toast.loi('Không thể cập nhật giỏ', updateRes?.data?.error || 'Có lỗi xảy ra');
    }
    await this.taiGioHang();
    await this.taiSanPham();
  },

  async taiGioHang() {
    await this._ensureBenhNhanId();
    if (!document.getElementById('bn-cart-list')) return;

    if (!this._benhNhanId) {
      this._gio = [];
      UI.render('bn-cart-list', '<p class="text-muted" style="text-align:center;padding:16px;font-size:13px">Cần hồ sơ bệnh nhân để xem giỏ. Vui lòng đăng nhập lại.</p>');
      this._updateCartBadge();
      return;
    }

    const gid = encodeURIComponent(String(this._benhNhanId).trim());
    const res = await Http.layDanhSach(`/don-hang/gio-hang/${gid}/`);
    const body = res?.data;

    if (!res?.ok || body == null) {
      this._gio = [];
      const err =
        (body && typeof body === 'object' && (body.error || body.detail)) ||
        `Không tải được giỏ (${res?.status || '?'})`;
      UI.render('bn-cart-list', `<div class="text-danger" style="padding:12px;font-size:13px;text-align:center">${this._esc(String(err))}</div>`);
      this._updateCartBadge();
      return;
    }

    const parsed = this._parseGioHangItems(body);
    if (parsed === null) {
      this._gio = [];
      UI.render('bn-cart-list', `<div class="text-danger" style="padding:12px;font-size:13px;">${this._esc(body.error || 'Không tải giỏ')}</div>`);
      this._updateCartBadge();
      return;
    }

    this._gio = parsed;
    this.renderGio();

    if (!this._userMe) {
      const meRes = await Http.layDanhSach('/users/me/');
      this._userMe = meRes?.data || null;
    }
    const phoneInput = document.getElementById('bn-order-phone');
    const emailInput = document.getElementById('bn-order-email');
    const addrInput = document.getElementById('bn-order-address');
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = this._userMe?.so_dien_thoai || '';
    }
    if (emailInput && !emailInput.value) {
      emailInput.value = this._userMe?.email || '';
    }
    if (addrInput && !addrInput.value) {
      addrInput.value = this._userMe?.dia_chi || '';
    }
  },

  renderGio() {
    const items = this._gio;
    const total = items.reduce((sum, i) => {
      const gia = Number(i.gia_ban ?? i.don_gia ?? 0);
      return sum + Number(i.so_luong || 0) * gia;
    }, 0);
    const totalEl = document.getElementById('bn-cart-total');
    if (totalEl) totalEl.textContent = UI.formatTien(total);
    this._updateCartBadge();

    if (!items.length) {
      UI.render('bn-cart-list', '<p class="text-muted" style="text-align:center;padding:16px">Giỏ hàng trống</p>');
      return;
    }

    UI.render('bn-cart-list', `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${items.map((i) => {
          const gia = Number(i.gia_ban ?? i.don_gia ?? 0);
          return `
          <div style="background:var(--c-bg,#f5f7fa);padding:10px;border-radius:10px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="min-width:0">
                <div style="font-weight:700;font-size:13px">${this._esc(i.ten_thuoc)}</div>
                <div class="text-muted" style="font-size:12px">${this._esc(i.don_vi_ten || '')} • ${UI.formatTien(gia)}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-weight:700;font-size:13px">${UI.formatTien(gia * i.so_luong)}</div>
                <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px">
                  <button type="button" class="btn btn-outline btn-sm" onclick="PageMuaThuoc.capNhatSoLuong('${i.id}', -1)">−</button>
                  <span style="min-width:26px;text-align:center;line-height:30px">${i.so_luong}</span>
                  <button type="button" class="btn btn-outline btn-sm" onclick="PageMuaThuoc.capNhatSoLuong('${i.id}', 1)">+</button>
                </div>
              </div>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `);
  },

  async taoDonHang() {
    await this._ensureBenhNhanId();
    if (!this._benhNhanId) return Toast.loi('Thiếu hồ sơ bệnh nhân', 'Không xác định được ID bệnh nhân');
    if (!this._gio.length) return Toast.canh('Giỏ hàng trống', 'Vui lòng thêm thuốc trước khi đặt');

    const userRaw = JSON.parse(localStorage.getItem('user_info') || '{}');
    const meRes = await Http.layDanhSach('/users/me/');
    const me = meRes?.data || {};

    const tenNguoiNhan = (me.ho_ten || userRaw.ho_ten || '').trim();
    const sdtNhan = (document.getElementById('bn-order-phone')?.value || '').trim();
    const emailNhan = (document.getElementById('bn-order-email')?.value || me.email || userRaw.email || '').trim();
    const diaChi = (document.getElementById('bn-order-address')?.value || '').trim();
    const paymentMethod = (document.getElementById('bn-order-payment')?.value || 'COD').toUpperCase();

    if (!tenNguoiNhan || !sdtNhan || !diaChi) {
      return Toast.loi('Thiếu thông tin nhận hàng', 'Cần họ tên, số điện thoại và địa chỉ giao hàng');
    }
    if (paymentMethod === 'VNPAY' && !emailNhan) {
      return Toast.loi('Thiếu email', 'VNPay cần email để gửi biên lai và xác nhận thanh toán');
    }

    const createRes = await Http.tao('/don-hang/don-hang/tao/', {
      benh_nhan_id: this._benhNhanId,
      loai_don: 'ONLINE',
      ten_nguoi_nhan: tenNguoiNhan,
      so_dien_thoai_nhan: sdtNhan,
      email_nhan: emailNhan,
      dia_chi_giao_hang: diaChi,
      phi_ship: 0,
      giam_gia: 0,
      ghi_chu: ''
    });

    if (!createRes?.ok || !createRes?.data?.success) {
      return Toast.loi('Tạo đơn thất bại', createRes?.data?.error || 'Có lỗi xảy ra');
    }

    const donHangId = createRes?.data?.data?.don_hang_id;
    const maDon = createRes?.data?.data?.ma_don_hang || '—';

    this._gio = [];
    this.renderGio();

    if (donHangId && paymentMethod === 'VNPAY') {
      const vnp = await Http.tao(`/don-hang/don-hang/${donHangId}/vnpay-tao-url/`, {});
      if (!vnp?.ok || !vnp?.data?.success) {
        Toast.canh(
          'Đã tạo đơn — chưa mở VNPay',
          vnp?.data?.error || 'Cấu hình server: VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_RETURN_URL, VNPAY_IPN_URL'
        );
        if (window.PageBenhNhanDashboard) await window.PageBenhNhanDashboard.chuyenTrang('don-hang');
        return;
      }
      const payUrl = vnp.data?.data?.payment_url;
      if (!payUrl) {
        Toast.loi('VNPay', 'Không nhận được link thanh toán');
        if (window.PageBenhNhanDashboard) await window.PageBenhNhanDashboard.chuyenTrang('don-hang');
        return;
      }
      Toast.canh('Chuyển đến cổng VNPay', `Đơn ${maDon} — hoàn tất thanh toán để xác nhận.`);
      window.location.href = payUrl;
      return;
    }

    Toast.ok(
      'Tạo đơn thành công',
      paymentMethod === 'COD'
        ? `Mã đơn: ${maDon} — Thanh toán COD khi nhận hàng`
        : `Mã đơn: ${maDon}`
    );
    if (window.PageBenhNhanDashboard) {
      await window.PageBenhNhanDashboard.chuyenTrang('don-hang');
    }
  },

  async _ensureBenhNhanId() {
    if (this._benhNhanId) return this._benhNhanId;

    if (window.PageBenhNhanDashboard && window.PageBenhNhanDashboard._ensureBenhNhanId) {
      const idFromDashboard = await window.PageBenhNhanDashboard._ensureBenhNhanId();
      if (idFromDashboard) {
        this._benhNhanId = idFromDashboard;
        return this._benhNhanId;
      }
    }

    const userRaw = JSON.parse(localStorage.getItem('user_info') || '{}');
    const fromLocal = userRaw?.benh_nhan_id || userRaw?.role_data?.id || userRaw?.role_data?.nguoi_dung || userRaw?.id || null;
    if (fromLocal) {
      this._benhNhanId = fromLocal;
      return this._benhNhanId;
    }

    const meRes = await Http.layDanhSach('/users/me/');
    const bnObj = meRes?.data?.benh_nhan;
    let fromMe =
      (bnObj && typeof bnObj === 'object' ? (bnObj.nguoi_dung ?? bnObj.id) : null) ||
      meRes?.data?.id ||
      null;
    if (!fromMe && userRaw?.id) {
      const bnRes = await Http.layDanhSach(`/benh-nhan/?nguoi_dung=${encodeURIComponent(userRaw.id)}`);
      const list = Array.isArray(bnRes?.data) ? bnRes.data : (bnRes?.data?.results || []);
      if (list.length) fromMe = list[0].nguoi_dung ?? list[0].id ?? null;
    }
    if (fromMe) {
      this._benhNhanId = fromMe;
      localStorage.setItem('user_info', JSON.stringify({
        ...userRaw,
        benh_nhan_id: fromMe,
        benh_nhan: meRes?.data?.benh_nhan || userRaw?.benh_nhan
      }));
    }
    return this._benhNhanId;
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

window.PageMuaThuoc = PageMuaThuoc;
