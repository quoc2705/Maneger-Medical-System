/**
 * Trang Tổng quan — Dashboard theo vai trò
 */
const PageTongQuan = {
  _benhNhanThuoc: [],
  _benhNhanCart: [],
  _benhNhanSearch: '',

  async render() {
    const { vaiTro } = Auth.layThongTin();
    if (vaiTro === 'benh_nhan')   return this._renderBenhNhan();
    if (vaiTro === 'bac_si')      return this._renderBacSi();
    if (vaiTro === 'nhan_vien')   return this._renderNhanVien();
    return this._renderBenhNhan();
  },

  async chuyenTrang(trang) {
    const { vaiTro } = Auth.layThongTin();
    if (vaiTro === 'benh_nhan' && trang === 'mua-thuoc') {
      return this._renderMuaThuoc();
    }
    if (trang === 'tong-quan' || trang === 'dashboard') {
      return this.render();
    }
    Toast.info('Chức năng đang phát triển');
    return this.render();
  },

  // ──────────────────────────────
  // BỆNH NHÂN
  // ──────────────────────────────
  async _renderBenhNhan() {
    const { hoTen } = Auth.layThongTin();

    UI.render('main-content', `
      <div class="mb-4">
        <h2 style="font-size:22px;color:var(--c-navy)">
          Xin chào, <span style="color:var(--c-navy-light)">${hoTen}</span> 👋
        </h2>
        <p class="text-muted">Theo dõi sức khỏe và các dịch vụ y tế của bạn</p>
      </div>

      <!-- Thẻ nhanh -->
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)" id="stat-bn"></div>

      <!-- Lịch hẹn sắp tới + Thông báo -->
      <div class="grid-2 mt-2">
        <div class="card" id="card-lich-hen-sap">
          <div class="card-header">
            <div class="card-title">
              <div class="card-title-icon" style="background:#EFF6FF">📅</div>
              Lịch hẹn sắp tới
            </div>
            <button class="btn btn-outline btn-sm" onclick="App.chuyenTrang('lich-hen')">Xem tất cả</button>
          </div>
          <div class="card-body" id="lich-hen-sap">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <div class="card-title-icon" style="background:#ECFDF5">💊</div>
              Đơn hàng gần đây
            </div>
            <button class="btn btn-outline btn-sm" onclick="App.chuyenTrang('don-hang')">Xem tất cả</button>
          </div>
          <div class="card-body" id="don-hang-gan">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- Nút hành động nhanh -->
      <div class="card mt-2">
        <div class="card-body">
          <h4 style="margin-bottom:16px;color:var(--c-navy)">Dịch vụ nhanh</h4>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            ${[
              { icon:'📅', nhan:'Đặt lịch khám',  trang:'dat-lich',  mau:'#EFF6FF', chu:'#1D4ED8' },
              { icon:'💉', nhan:'Đặt lịch tiêm',  trang:'dat-lich',  mau:'#F0FDF4', chu:'#065F46' },
              { icon:'💊', nhan:'Mua thuốc',       trang:'mua-thuoc', mau:'#FFF7ED', chu:'#9A3412' },
            ].map(d => `
              <button class="btn btn-outline" style="flex-direction:column;gap:8px;height:80px;
                       background:${d.mau};border-color:transparent;color:${d.chu}"
                      onclick="App.chuyenTrang('${d.trang}')">
                <span style="font-size:24px">${d.icon}</span>
                <span style="font-size:12px;font-weight:700">${d.nhan}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `);

    await this._loadStatBenhNhan();
    await this._loadLichHenSap();
    await this._loadDonHangGan();
  },

  async _loadStatBenhNhan() {
    const { data } = await Http.layDanhSach('/lich-hen/lich-hen/?page_size=100');
    const danhSach = data?.results || [];
    const sapToi = danhSach.filter(l => l.trang_thai === 'DA_XAC_NHAN').length;
    const choXN  = danhSach.filter(l => l.trang_thai === 'CHO_XAC_NHAN').length;
    const hoanThanh = danhSach.filter(l => l.trang_thai === 'HOAN_THANH').length;

    UI.render('stat-bn', [
      { icon:'📅', nen:'#EFF6FF', so: sapToi, nhan:'Lịch hẹn sắp tới', chu:'#1D4ED8' },
      { icon:'⏳', nen:'#FFF7ED', so: choXN,  nhan:'Chờ xác nhận', chu:'#9A3412' },
      { icon:'✅', nen:'#ECFDF5', so: hoanThanh, nhan:'Đã khám xong', chu:'#065F46' },
    ].map(s => `
      <div class="stat-card">
        <div class="stat-icon" style="background:${s.nen};color:${s.chu};font-size:22px">${s.icon}</div>
        <div class="stat-info">
          <div class="stat-value" style="color:var(--c-navy)">${s.so}</div>
          <div class="stat-label">${s.nhan}</div>
        </div>
      </div>
    `).join(''));
  },

  async _loadLichHenSap() {
    const { data } = await Http.layDanhSach('/lich-hen/lich-hen/?trang_thai=DA_XAC_NHAN&page_size=5');
    const list = data?.results || [];

    if (list.length === 0) {
      UI.render('lich-hen-sap', `
        <div class="page-empty" style="padding:24px">
          <div class="page-empty-icon" style="font-size:32px">📭</div>
          <p class="text-muted">Chưa có lịch hẹn sắp tới</p>
          <button class="btn btn-primary btn-sm mt-2" onclick="App.chuyenTrang('dat-lich')">
            <i class="fas fa-plus"></i> Đặt lịch ngay
          </button>
        </div>
      `);
      return;
    }

    UI.render('lich-hen-sap', `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${list.map(lh => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;
                      background:var(--c-bg);border-radius:var(--radius-md)">
            <div style="width:44px;height:44px;border-radius:12px;background:#EFF6FF;
                        display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">
              <span style="font-size:13px;font-weight:800;color:#1D4ED8;line-height:1">
                ${new Date(lh.ngay_gio_hen).getDate()}
              </span>
              <span style="font-size:10px;color:#1D4ED8">
                Th${new Date(lh.ngay_gio_hen).getMonth()+1}
              </span>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">
                ${lh.loai_lich === 'TIEM_CHUNG' ? '💉' : '🩺'} ${lh.loai_lich_display || lh.loai_lich}
              </div>
              <div class="text-muted" style="font-size:12px">
                ${lh.ten_bac_si || 'Chưa phân công'} •
                ${new Date(lh.ngay_gio_hen).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
            ${UI.badge(lh.trang_thai)}
          </div>
        `).join('')}
      </div>
    `);
  },

  async _loadDonHangGan() {
    // donhang là view thường (JsonResponse), không theo DRF pagination "results"
    const { data } = await Http.layDanhSach('/don-hang/don-hang/?page=1&limit=3');
    const list = data?.data?.items || [];

    if (list.length === 0) {
      UI.render('don-hang-gan', `
        <div class="page-empty" style="padding:24px">
          <div class="page-empty-icon" style="font-size:32px">🛒</div>
          <p class="text-muted">Chưa có đơn hàng</p>
          <button class="btn btn-mint btn-sm mt-2" onclick="App.chuyenTrang('mua-thuoc')">
            <i class="fas fa-pills"></i> Mua thuốc ngay
          </button>
        </div>
      `);
      return;
    }

    UI.render('don-hang-gan', `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${list.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:12px;background:var(--c-bg);border-radius:var(--radius-md)">
            <div>
              <div style="font-weight:700;font-size:13px">${d.ma_don_hang ? `DH${d.ma_don_hang}` : 'DH—'}</div>
              <div class="text-muted" style="font-size:12px">${UI.formatNgay(d.ngay_tao)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--c-navy-light)">${UI.formatTien(d.tong_tien)}</div>
              <div>${UI.badge(d.trang_thai)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `);
  },

  async _renderMuaThuoc() {
    const userRaw = JSON.parse(localStorage.getItem('user_info') || '{}');
    const benhNhanId = userRaw?.id;

    UI.render('main-content', `
      <div class="mb-4" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div>
          <h2 style="font-size:22px;color:var(--c-navy)">Mua thuốc trực tuyến 💊</h2>
          <p class="text-muted">Chọn thuốc, thêm giỏ hàng và tạo đơn mua</p>
        </div>
        <button class="btn btn-outline" onclick="PageTongQuan.render()">
          <i class="fas fa-arrow-left"></i> Quay lại tổng quan
        </button>
      </div>

      <div class="card mb-3">
        <div class="card-body" style="display:grid;grid-template-columns:2fr 1fr auto;gap:10px;align-items:end">
          <div class="form-group" style="margin:0">
            <label class="form-label">Tìm thuốc</label>
            <input id="bn-thuoc-search" class="form-control" placeholder="Tên thuốc, mã thuốc, thành phần...">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Số lượng hiển thị</label>
            <select id="bn-thuoc-limit" class="form-control">
              <option value="20">20</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="PageTongQuan.taiLaiDanhSachThuoc()">
            <i class="fas fa-search"></i> Tìm
          </button>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Danh sách thuốc</div>
          </div>
          <div class="card-body" id="bn-thuoc-list">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Giỏ hàng của bạn</div>
          </div>
          <div class="card-body" id="bn-thuoc-cart">
            <div class="text-muted">Giỏ hàng trống</div>
          </div>
          <div class="card-footer" style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
            <div><strong id="bn-cart-total">0đ</strong></div>
            <button class="btn btn-mint" onclick="PageTongQuan.datMuaThuoc()" ${benhNhanId ? '' : 'disabled'}>
              <i class="fas fa-shopping-cart"></i> Tạo đơn mua
            </button>
          </div>
        </div>
      </div>
    `);

    document.getElementById('bn-thuoc-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.taiLaiDanhSachThuoc();
    });

    await this.taiLaiDanhSachThuoc();
    this.renderGioHangThuoc();
  },

  async taiLaiDanhSachThuoc() {
    const q = (document.getElementById('bn-thuoc-search')?.value || '').trim();
    const limit = document.getElementById('bn-thuoc-limit')?.value || '50';
    const query = new URLSearchParams();
    if (q) query.set('search', q);
    query.set('page_size', limit);

    const { data } = await Http.layDanhSach(`/thuoc/thuoc/?${query.toString()}`);
    const list = Array.isArray(data) ? data : (data?.results || []);
    this._benhNhanThuoc = list;

    if (!list.length) {
      UI.render('bn-thuoc-list', '<p class="text-muted text-center" style="padding:20px">Không có thuốc phù hợp</p>');
      return;
    }

    UI.render('bn-thuoc-list', `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên thuốc</th>
              <th>Đơn vị</th>
              <th>Tồn kho</th>
              <th>Giá bán</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(t => `
              <tr>
                <td>${t.ma_thuoc || '—'}</td>
                <td>
                  <div style="font-weight:700">${t.ten_thuoc || '—'}</div>
                  <div class="text-muted" style="font-size:12px">${t.thanh_phan || ''}</div>
                </td>
                <td>${t.don_vi_ten || '—'}</td>
                <td>${t.ton_kho ?? 0}</td>
                <td>${UI.formatTien(t.gia_ban || 0)}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="PageTongQuan.themThuocVaoGio('${t.id}')" ${(t.ton_kho || 0) <= 0 ? 'disabled' : ''}>
                    <i class="fas fa-plus"></i> Thêm
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  },

  themThuocVaoGio(thuocId) {
    const thuoc = this._benhNhanThuoc.find(t => String(t.id) === String(thuocId));
    if (!thuoc) return;

    const idx = this._benhNhanCart.findIndex(i => String(i.id) === String(thuoc.id));
    if (idx >= 0) {
      const nextQty = this._benhNhanCart[idx].so_luong + 1;
      if (nextQty > (thuoc.ton_kho || 0)) return Toast.warn('Số lượng vượt tồn kho');
      this._benhNhanCart[idx].so_luong = nextQty;
    } else {
      this._benhNhanCart.push({
        id: thuoc.id,
        ten_thuoc: thuoc.ten_thuoc,
        don_vi_ten: thuoc.don_vi_ten,
        gia_ban: Number(thuoc.gia_ban || 0),
        ton_kho: Number(thuoc.ton_kho || 0),
        so_luong: 1
      });
    }
    this.renderGioHangThuoc();
  },

  capNhatSoLuongGio(thuocId, delta) {
    const idx = this._benhNhanCart.findIndex(i => String(i.id) === String(thuocId));
    if (idx < 0) return;
    const nextQty = this._benhNhanCart[idx].so_luong + delta;
    if (nextQty <= 0) {
      this._benhNhanCart.splice(idx, 1);
    } else if (nextQty > this._benhNhanCart[idx].ton_kho) {
      Toast.warn('Số lượng vượt tồn kho');
      return;
    } else {
      this._benhNhanCart[idx].so_luong = nextQty;
    }
    this.renderGioHangThuoc();
  },

  renderGioHangThuoc() {
    const cart = this._benhNhanCart;
    const total = cart.reduce((s, i) => s + (i.so_luong * i.gia_ban), 0);

    if (!cart.length) {
      UI.render('bn-thuoc-cart', '<div class="text-muted">Giỏ hàng trống</div>');
      const totalEl = document.getElementById('bn-cart-total');
      if (totalEl) totalEl.textContent = UI.formatTien(0);
      return;
    }

    UI.render('bn-thuoc-cart', `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${cart.map(i => `
          <div style="background:var(--c-bg);padding:10px;border-radius:10px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div>
                <div style="font-weight:700">${i.ten_thuoc}</div>
                <div class="text-muted" style="font-size:12px">${i.don_vi_ten || ''} • ${UI.formatTien(i.gia_ban)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700">${UI.formatTien(i.so_luong * i.gia_ban)}</div>
                <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px">
                  <button class="btn btn-outline btn-sm" onclick="PageTongQuan.capNhatSoLuongGio('${i.id}', -1)">-</button>
                  <span style="min-width:26px;text-align:center;line-height:30px">${i.so_luong}</span>
                  <button class="btn btn-outline btn-sm" onclick="PageTongQuan.capNhatSoLuongGio('${i.id}', 1)">+</button>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `);

    const totalEl = document.getElementById('bn-cart-total');
    if (totalEl) totalEl.textContent = UI.formatTien(total);
  },

  async datMuaThuoc() {
    const userRaw = JSON.parse(localStorage.getItem('user_info') || '{}');
    const benhNhanId = userRaw?.id;
    if (!benhNhanId) return Toast.error('Không xác định được bệnh nhân hiện tại');
    if (!this._benhNhanCart.length) return Toast.warn('Giỏ hàng đang trống');

    const tenNguoiNhan = userRaw.ho_ten || '';
    const soDienThoaiNhan = userRaw.so_dien_thoai || '';
    const diaChi = userRaw.dia_chi || '';
    if (!tenNguoiNhan || !soDienThoaiNhan || !diaChi) {
      return Toast.error('Vui lòng cập nhật đủ họ tên, số điện thoại và địa chỉ trước khi đặt mua');
    }

    // Đồng bộ cart lên server
    for (const item of this._benhNhanCart) {
      const r = await Http.tao('/don-hang/gio-hang/them/', {
        benh_nhan_id: benhNhanId,
        thuoc_id: item.id,
        so_luong: item.so_luong
      });
      if (!r?.ok || !r?.data?.success) {
        return Toast.error(r?.data?.error || 'Không thể thêm vào giỏ hàng máy chủ');
      }
    }

    const payload = {
      benh_nhan_id: benhNhanId,
      loai_don: 'ONLINE',
      ten_nguoi_nhan: tenNguoiNhan,
      so_dien_thoai_nhan: soDienThoaiNhan,
      email_nhan: userRaw.email || '',
      dia_chi_giao_hang: diaChi,
      phi_ship: 0,
      giam_gia: 0,
      ghi_chu: ''
    };
    const result = await Http.tao('/don-hang/don-hang/tao/', payload);
    if (!result?.ok || !result?.data?.success) {
      return Toast.error(result?.data?.error || 'Tạo đơn hàng thất bại');
    }

    this._benhNhanCart = [];
    this.renderGioHangThuoc();
    Toast.ok('Đặt mua thành công', `Mã đơn: ${result.data.data?.ma_don_hang || '—'}`);
    await this._loadDonHangGan();
  },

  // ──────────────────────────────
  // BÁC SĨ
  // ──────────────────────────────
  async _renderBacSi() {
    const { hoTen } = Auth.layThongTin();
    const homNay = new Date().toLocaleDateString('vi-VN', {weekday:'long',day:'numeric',month:'long'});

    UI.render('main-content', `
      <div class="mb-4">
        <h2 style="font-size:22px;color:var(--c-navy)">Xin chào, BS. <span style="color:var(--c-navy-light)">${hoTen}</span> 👨‍⚕️</h2>
        <p class="text-muted">${homNay}</p>
      </div>

      <div class="stat-grid" id="stat-bs"></div>

      <div class="grid-2 mt-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><div class="card-title-icon" style="background:#EFF6FF">📋</div>Lịch hẹn hôm nay</div>
            <button class="btn btn-outline btn-sm" onclick="App.chuyenTrang('lich-hen')">Xem đầy đủ</button>
          </div>
          <div class="card-body" id="lich-hom-nay">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><div class="card-title-icon" style="background:#FFF7ED">💊</div>Đơn thuốc chờ xác nhận BN</div>
          </div>
          <div class="card-body" id="don-cho-xn">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `);

    await this._loadStatBacSi();
    await this._loadLichHomNay();
    await this._loadDonChoXacNhan();
  },

  async _loadStatBacSi() {
    const { data: dataLich } = await Http.layDanhSach('/lich-hen/lich-hen/?page_size=200');
    const all = dataLich?.results || [];
    const homNay = new Date().toDateString();
    const lichHomNay = all.filter(l => new Date(l.ngay_gio_hen).toDateString() === homNay);

    // Lấy tổng số bệnh nhân từ API
    const { data: dataBN } = await Http.layDanhSach('/benh-nhan/?page_size=1');
    const tongBenhNhan = dataBN?.count || 0;

    UI.render('stat-bs', [
      { icon:'📋', nen:'#EFF6FF', so: lichHomNay.filter(l=>l.trang_thai==='DA_XAC_NHAN').length, nhan:'Lịch hôm nay', chu:'#1D4ED8' },
      { icon:'⏳', nen:'#FFF7ED', so: lichHomNay.filter(l=>l.trang_thai==='CHO_XAC_NHAN').length, nhan:'Chờ xác nhận', chu:'#9A3412' },
      { icon:'✅', nen:'#ECFDF5', so: all.filter(l=>l.trang_thai==='HOAN_THANH').length, nhan:'Đã hoàn thành', chu:'#065F46' },
      { icon:'👥', nen:'#FAF5FF', so: tongBenhNhan, nhan:'Tổng bệnh nhân', chu:'#6B21A8' },
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

  async _loadLichHomNay() {
    const { data } = await Http.layDanhSach('/lich-hen/lich-hen/?page_size=20');
    const list = (data?.results || []).filter(l => {
      const ngay = new Date(l.ngay_gio_hen).toDateString();
      return ngay === new Date().toDateString();
    });

    if (list.length === 0) {
      UI.render('lich-hom-nay', '<p class="text-muted text-center" style="padding:24px">Không có lịch hẹn hôm nay</p>');
      return;
    }
    UI.render('lich-hom-nay', `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Giờ</th><th>Bệnh nhân</th><th>Loại</th><th>TT</th><th></th></tr></thead>
          <tbody>
            ${list.map(lh => `
              <tr>
                <td><strong>${new Date(lh.ngay_gio_hen).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</strong></td>
                <td>${lh.ten_benh_nhan || '—'}</td>
                <td>${lh.loai_lich === 'TIEM_CHUNG' ? '💉' : '🩺'} ${lh.loai_lich_display || lh.loai_lich}</td>
                <td>${UI.badge(lh.trang_thai)}</td>
                <td>
                  ${lh.trang_thai === 'DA_XAC_NHAN' ? `
                    <button class="btn btn-mint btn-sm" onclick="PageKhamBenh.batDauKham(${lh.benh_nhan}, '${(lh.ten_benh_nhan || '').replace(/'/g, "\\'")}')">
                      Khám
                    </button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  },

  async _loadDonChoXacNhan() {
    const { data } = await Http.layDanhSach('/benh-an/don-thuoc/?trang_thai=CHO_XAC_NHAN&page_size=5');
    const list = data?.results || [];
    if (list.length === 0) {
      UI.render('don-cho-xn', '<p class="text-muted text-center" style="padding:24px">Không có đơn chờ</p>');
      return;
    }
    UI.render('don-cho-xn', `
      ${list.map(d => `
        <div style="background:var(--c-bg);border-radius:var(--radius-md);padding:12px;margin-bottom:10px;
                    display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:13px">${d.ten_benh_nhan || 'Bệnh nhân'}</div>
            <div class="text-muted" style="font-size:12px">${d.chi_tiet?.length || 0} loại thuốc • ${UI.formatNgay(d.ngay_tao)}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="App.chuyenTrang('ke-don')">Chi tiết</button>
          </div>
        </div>
      `).join('')}
    `);
  },

  // ──────────────────────────────
  // NHÂN VIÊN
  // ──────────────────────────────
  async _renderNhanVien() {
    const { hoTen } = Auth.layThongTin();

    UI.render('main-content', `
      <div class="mb-4">
        <h2 style="font-size:22px;color:var(--c-navy)">Xin chào, <span style="color:var(--c-navy-light)">${hoTen}</span> 🏥</h2>
        <p class="text-muted">Báo cáo hôm nay — ${new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>

      <div class="stat-grid" id="stat-nv"></div>

      <div class="grid-2 mt-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><div class="card-title-icon" style="background:#FEF9C3">💰</div>Đơn thuốc chờ thanh toán</div>
            <button class="btn btn-outline btn-sm" onclick="App.chuyenTrang('ban-hang')">Xem tất cả</button>
          </div>
          <div class="card-body" id="don-cho-tt">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><div class="card-title-icon" style="background:#FEF2F2">⚠️</div>Thuốc sắp hết hàng</div>
          </div>
          <div class="card-body" id="thuoc-sap-het">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `);

    await this._loadStatNhanVien();
    await this._loadDonChoThanhToan();
    await this._loadThuocSapHet();
  },

  async _loadStatNhanVien() {
    // Lấy số đơn chờ thanh toán
    const { data: dataDon } = await Http.layDanhSach('/benh-an/don-thuoc/?trang_thai=CHO_THANH_TOAN&da_thanh_toan=false&page_size=1');
    const soDonCho = dataDon?.count || 0;
    
    // Lấy số thuốc sắp hết
    const { data: dataThuoc } = await Http.layDanhSach('/thuoc/dashboard/canh_bao_ton_kho/');
    const soThuocSapHet = dataThuoc?.thuoc_sap_het_hang?.length || 0;
    
    // Lấy doanh thu hôm nay
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: dataDoanhThu } = await Http.layDanhSach(
      `/don-hang/thong-ke/don-hang/?tu_ngay=${todayStr}&den_ngay=${todayStr}/`
    );
    const doanhThuHomNay = dataDoanhThu?.data?.tong_quan?.tong_doanh_thu || 0;

    UI.render('stat-nv', [
      { icon:'💰', nen:'#FEF9C3', so: soDonCho, nhan:'Đơn chờ TT', chu:'#92400E', change:'' },
      { icon:'📦', nen:'#ECFDF5', so: '—', nhan:'Đơn hàng tháng này', chu:'#065F46', change:'' },
      { icon:'⚠️', nen:'#FEF2F2', so: soThuocSapHet, nhan:'Thuốc sắp hết hàng', chu:'#991B1B', change:'' },
      { icon:'💵', nen:'#EFF6FF', so: UI.formatTien(doanhThuHomNay), nhan:'Doanh thu hôm nay', chu:'#1D4ED8', change:'' },
    ].map(s => `
      <div class="stat-card">
        <div class="stat-icon" style="background:${s.nen};color:${s.chu};font-size:22px">${s.icon}</div>
        <div class="stat-info">
          <div class="stat-value">${s.so}</div>
          <div class="stat-label">${s.nhan}</div>
          ${s.change ? `<div class="stat-change up"><i class="fas fa-arrow-up"></i> ${s.change}</div>` : ''}
        </div>
      </div>
    `).join(''));
  },

  async _loadDonChoThanhToan() {
    const { data } = await Http.layDanhSach('/benh-an/don-thuoc/?trang_thai=CHO_THANH_TOAN&da_thanh_toan=false&page_size=5');
    const list = data?.results || [];
    if (list.length === 0) {
      UI.render('don-cho-tt', '<p class="text-muted text-center" style="padding:24px">Không có đơn chờ thanh toán</p>');
      return;
    }
    UI.render('don-cho-tt', `
      ${list.map(d => `
        <div style="background:var(--c-bg);border-radius:var(--radius-md);padding:12px;margin-bottom:10px;
                    display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:13px">${d.ten_benh_nhan || '—'} <span style="font-size:11px;color:var(--c-muted)">${d.ma_benh_nhan || ''}</span></div>
            <div style="color:var(--c-navy-light);font-weight:700">${UI.formatTien(d.tong_tien)}</div>
          </div>
          <button class="btn btn-mint btn-sm" onclick="App.chuyenTrang('ban-hang')">Thanh toán</button>
        </div>
      `).join('')}
    `);
  },

  async _loadThuocSapHet() {
    const { data } = await Http.layDanhSach('/thuoc/dashboard/canh_bao_ton_kho/');
    const list = (data?.thuoc_sap_het_hang || []).slice(0, 5);
    if (list.length === 0) {
      UI.render('thuoc-sap-het', '<p class="text-muted text-center" style="padding:24px" style="color:var(--c-success)">✅ Kho hàng ổn định</p>');
      return;
    }
    UI.render('thuoc-sap-het', `
      ${list.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 12px;background:#FEF2F2;border-radius:var(--radius-sm);margin-bottom:8px">
          <div style="font-weight:600;font-size:13px">${t.thuoc || '—'}</div>
          <span style="font-weight:800;color:var(--c-danger)">${t.ton_kho ?? 0}</span>
        </div>
      `).join('')}
    `);
  },
};

window.PageTongQuan = PageTongQuan;