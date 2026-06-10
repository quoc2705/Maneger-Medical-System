/**
 * Lễ tân — chỉ dùng tại quầy (offline): đăng ký BN, tiếp nhận (có hẹn / chưa hẹn lấy số / hàng chờ phòng), xem lịch trong ngày.
 */
const PageLeTanDashboard = {
  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  },

  /** Nhận diện UUID (khóa bệnh nhân) — còn lại coi là mã bệnh nhân */
  _laUuid(s) {
    const t = String(s || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
  },

  /** Ngày theo giờ máy (quầy VN) — không dùng toISOString() (UTC) để khớp lọc ngày trên server */
  _ngayLocalISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _layNgayTiepNhan() {
    return document.getElementById('lt-tn-ngay')?.value?.trim() || this._ngayLocalISO();
  },

  _layCaTiepNhan() {
    const sel = document.getElementById('lt-tn-ca')?.value?.trim();
    if (sel === 'SANG' || sel === 'CHIEU' || sel === 'TOI') return sel;
    return this._caHienTai();
  },

  _msgApiLoi(res) {
    const d = res && res.data;
    if (d == null) return res?.status ? `HTTP ${res.status}` : 'Không có phản hồi';
    if (typeof d === 'object' && d.error != null) {
      return typeof d.error === 'string' ? d.error : JSON.stringify(d.error);
    }
    if (d.detail) return String(d.detail);
    if (d.goi_y) return String(d.goi_y);
    return JSON.stringify(d);
  },

  _ltFormatGio(iso) {
    if (!iso) return '—';
    const s = String(iso).replace('T', ' ');
    return s.slice(0, 16);
  },

  _ltBadgeTrangThai(tt, display) {
    const label = display || tt || '—';
    const map = {
      CHO_XAC_NHAN: 'lt-badge--wait',
      DA_DAT: 'lt-badge--wait',
      DA_XAC_NHAN: 'lt-badge--info',
      CHECKED_IN: 'lt-badge--info',
      DANG_KHAM: 'lt-badge--wait',
      HOAN_THANH: 'lt-badge--ok',
      DA_HUY: 'lt-badge--muted',
      QUA_HAN: 'lt-badge--muted',
    };
    const cls = map[tt] || 'lt-badge--muted';
    return `<span class="lt-badge ${cls}">${this._esc(label)}</span>`;
  },

  _ltBadgeLoai(loai, display) {
    const label = display || loai || '—';
    const cls = loai === 'TIEM_CHUNG' ? 'lt-badge--tiem' : 'lt-badge--kham';
    return `<span class="lt-badge ${cls}">${this._esc(label)}</span>`;
  },

  _ltEmpty(icon, text) {
    return `<div class="lt-empty"><i class="fas ${this._esc(icon || 'fa-inbox')}"></i><p>${this._esc(text)}</p></div>`;
  },

  _htmlBangBsTiepNhan(rankRes) {
    if (!rankRes?.ok) {
      return `<p class="text-danger small">Không tải danh sách bác sĩ: ${this._esc(this._msgApiLoi(rankRes))}</p>`;
    }
    const bsItems = rankRes.data?.items || [];
    const caLbl = rankRes.data?.ca_lam_display || this._nhanCa(this._layCaTiepNhan());
    const ngayLbl = rankRes.data?.ngay || this._layNgayTiepNhan();
    const goiY = rankRes.data?.goi_y || '';
    const tongKhacCa = rankRes.data?.tong_dang_ky_trong_ngay;
    if (!bsItems.length) {
      let extra = goiY ? `<p class="text-warning small mb-2">${this._esc(goiY)}</p>` : '';
      if (tongKhacCa > 0) {
        extra += `<p class="text-muted small mb-0">Có ${tongKhacCa} đăng ký ca trong ngày ${this._esc(ngayLbl)} nhưng không đúng ca <strong>${this._esc(caLbl)}</strong> — đổi ca hoặc ngày.</p>`;
      }
      return `${this._ltEmpty('fa-user-md', `Chưa có bác sĩ đăng ký ${caLbl} — ${ngayLbl}`)}${extra}`;
    }
    return `<div class="lt-bs-rank">
      ${bsItems
        .map((x, i) => {
          const rankCls = i === 0 ? '' : i === 1 ? ' lt-rank-2' : ' lt-rank-3';
          const cas = (x.cac_ca_trong_ngay || []).map((c) => this._esc(this._nhanCa(c))).join(' · ') || '—';
          return `<div class="lt-bs-rank-item">
            <span class="lt-bs-rank-rank${rankCls}">${i + 1}</span>
            <div>
              <div class="lt-bs-rank-name">${this._esc(x.ho_ten)}</div>
              <div class="lt-bs-rank-meta">${this._esc(x.ma_bac_si || '')}${x.chuyen_khoa ? ' · ' + this._esc(x.chuyen_khoa) : ''}</div>
              <div class="lt-bs-rank-meta">${cas}</div>
            </div>
            <span class="lt-bs-rank-count" title="BN trong ngày">${x.so_benh_nhan_trong_ngay}</span>
          </div>`;
        })
        .join('')}
    </div>`;
  },

  async _taiLaiBsTiepNhan() {
    const tab = window.__ltTiepNhanTab || 'co-lich';
    await this._tiepNhanTab(tab);
  },

  _setNavActive(trang) {
    const map = {
      'tong-quan': 'tq',
      'dang-ky': 'dk',
      'tiep-nhan': 'tn',
      'danh-sach': 'ds',
      'dat-lich': 'tn',
      'check-in': 'tn',
      'dieu-phoi': 'tn',
    };
    const cur = map[trang] || 'tq';
    document.querySelectorAll('[data-lt-nav]').forEach((b) => {
      const on = b.getAttribute('data-lt-nav') === cur;
      b.classList.toggle('active', on);
    });
  },

  async render() {
    const { hoTen } = Auth.layThongTin();
    const navHtml = `
      <button type="button" class="nav-item" data-lt-nav="tq" onclick="PageLeTanDashboard.chuyenTrang('tong-quan')"><i class="fas fa-chart-pie"></i><span>Trang chủ</span></button>
      <button type="button" class="nav-item" data-lt-nav="dk" onclick="PageLeTanDashboard.chuyenTrang('dang-ky')"><i class="fas fa-user-plus"></i><span>Đăng ký bệnh nhân</span></button>
      <button type="button" class="nav-item" data-lt-nav="tn" onclick="PageLeTanDashboard.chuyenTrang('tiep-nhan')"><i class="fas fa-ticket-alt"></i><span>Tiếp nhận &amp; lấy số</span></button>
      <button type="button" class="nav-item" data-lt-nav="ds" onclick="PageLeTanDashboard.chuyenTrang('danh-sach')"><i class="fas fa-calendar-day"></i><span>Lịch trong ngày</span></button>`;
    window.RoleDashboardShell.mount('app-root', {
      brandTitle: 'PhòngKhám+',
      brandAccent: 'Lễ tân',
      brandIcon: 'fa-calendar-check',
      navHtml,
      mainHostId: 'le-tan-main',
      userName: hoTen || 'Nhân viên',
      userRoleLabel: 'Lễ tân — Tiếp nhận',
      contentMaxWidth: '1320px',
      headerActionsExtra: window.ThongBaoBell ? ThongBaoBell.htmlButton() : '',
    });
    if (window.ThongBaoBell) ThongBaoBell.init({ badgeId: 'pk-noti-badge' });
    await this.chuyenTrang('tong-quan');
  },

  async chuyenTrang(trang) {
    this._setNavActive(trang);
    const host = 'le-tan-main';
    if (trang === 'tong-quan') return this._tongQuan(host);
    if (trang === 'dang-ky') return this._dangKy(host);
    if (trang === 'tiep-nhan') return this._tiepNhan(host);
    if (trang === 'danh-sach') return this._danhSachLich(host);
    /* Tên cũ / liên kết ngoài → cùng màn tiếp nhận tại quầy */
    if (['dat-lich', 'check-in', 'dieu-phoi'].includes(trang)) return this._tiepNhan(host);
    return this._tongQuan(host);
  },

  async _tongQuan(host) {
    const today = this._ngayLocalISO();
    const caLbl = this._nhanCa(this._caHienTai());
    const [resHomNay, resCho, resDp] = await Promise.all([
      Http.layDanhSach(`/lich-hen/lich-hen/?hom_nay=true&page_size=200`),
      Http.layDanhSach(`/lich-hen/lich-hen/hom_nay_letan/?chua_check_in=true&page_size=200`),
      Http.layDanhSach(`/lich-hen/lich-hen/dieu_phoi_hom_nay/?page_size=200`),
    ]);
    const list = resHomNay.data?.results || [];
    const choArr = resCho.data?.results || resCho.data || [];
    const choList = Array.isArray(choArr) ? choArr : [];
    const dpArr = resDp.data?.results || resDp.data || [];
    const dpList = Array.isArray(dpArr) ? dpArr : [];
    const tong = list.length;
    const choCheckin = choList.length;
    const daTiepNhan = dpList.length;
    const hoanThanh = list.filter((l) => l.trang_thai === 'HOAN_THANH').length;
    UI.render(host, `
      <div class="lt-page">
        <header class="lt-hero">
          <div>
            <h1 class="lt-hero-title"><i class="fas fa-hospital-user"></i> Quầy lễ tân</h1>
            <p class="lt-hero-desc">Tổng quan hoạt động tiếp nhận trong ngày — check-in bệnh nhân có hẹn, cấp số thứ tự walk-in và theo dõi hàng chờ theo bác sĩ.</p>
            <p class="lt-hero-meta"><i class="fas fa-calendar-day"></i> ${this._esc(today)} · ${this._esc(caLbl)}</p>
          </div>
          <div class="lt-hero-actions">
            <button type="button" class="btn lt-btn-hero-light" onclick="PageLeTanDashboard.chuyenTrang('danh-sach')"><i class="fas fa-list"></i> Lịch ngày</button>
            <button type="button" class="btn btn-primary" onclick="PageLeTanDashboard.chuyenTrang('tiep-nhan')"><i class="fas fa-ticket-alt"></i> Mở tiếp nhận</button>
          </div>
        </header>

        <div class="lt-stats">
          <div class="lt-stat lt-stat--blue">
            <div class="lt-stat-icon"><i class="fas fa-calendar-check"></i></div>
            <div>
              <div class="lt-stat-value">${tong}</div>
              <div class="lt-stat-label">Lịch hẹn hôm nay</div>
            </div>
          </div>
          <div class="lt-stat lt-stat--amber">
            <div class="lt-stat-icon"><i class="fas fa-clock"></i></div>
            <div>
              <div class="lt-stat-value">${choCheckin}</div>
              <div class="lt-stat-label">Chờ check-in</div>
            </div>
          </div>
          <div class="lt-stat lt-stat--green">
            <div class="lt-stat-icon"><i class="fas fa-user-check"></i></div>
            <div>
              <div class="lt-stat-value">${daTiepNhan}</div>
              <div class="lt-stat-label">Đã tiếp nhận / hàng chờ</div>
            </div>
          </div>
          <div class="lt-stat lt-stat--violet">
            <div class="lt-stat-icon"><i class="fas fa-check-circle"></i></div>
            <div>
              <div class="lt-stat-value">${hoanThanh}</div>
              <div class="lt-stat-label">Hoàn thành khám</div>
            </div>
          </div>
        </div>

        <div class="lt-quick-grid">
          <button type="button" class="lt-quick-card" onclick="PageLeTanDashboard.chuyenTrang('tiep-nhan')">
            <i class="fas fa-clipboard-check"></i>
            <strong>Tiếp nhận &amp; lấy số</strong>
            <span>Check-in có hẹn, walk-in khám / tiêm, gán phòng</span>
          </button>
          <button type="button" class="lt-quick-card" onclick="PageLeTanDashboard.chuyenTrang('dang-ky')">
            <i class="fas fa-user-plus"></i>
            <strong>Đăng ký bệnh nhân</strong>
            <span>Tạo tài khoản BN mới tại quầy</span>
          </button>
          <button type="button" class="lt-quick-card" onclick="PageLeTanDashboard.chuyenTrang('danh-sach')">
            <i class="fas fa-calendar-alt"></i>
            <strong>Lịch trong ngày</strong>
            <span>Tra cứu toàn bộ lịch theo khoảng ngày</span>
          </button>
        </div>
      </div>`);
  },

  async _dangKy(host) {
    UI.render(host, `
      <div class="card">
        <div class="card-header"><div class="card-title">Đăng ký tài khoản bệnh nhân (tại quầy)</div></div>
        <div class="card-body">
          <p class="text-muted small mb-3">Tài khoản luôn là vai trò <strong>Bệnh nhân</strong>. Mật khẩu: tối thiểu 8 ký tự, có chữ hoa, số và ký tự đặc biệt (theo quy định hệ thống).</p>
          <div class="grid-2">
            <div><label class="form-label">Tên đăng nhập *</label>
              <input id="lt-dk-user" class="form-control" autocomplete="off"/></div>
            <div><label class="form-label">Mật khẩu *</label>
              <input id="lt-dk-pw1" type="password" class="form-control"/></div>
            <div><label class="form-label">Nhập lại mật khẩu *</label>
              <input id="lt-dk-pw2" type="password" class="form-control"/></div>
            <div><label class="form-label">Họ tên *</label>
              <input id="lt-dk-hoten" class="form-control"/></div>
            <div><label class="form-label">Email *</label>
              <input id="lt-dk-email" type="email" class="form-control"/></div>
            <div><label class="form-label">Số điện thoại *</label>
              <input id="lt-dk-sdt" class="form-control" placeholder="0xxxxxxxxx"/></div>
            <div><label class="form-label">Ngày sinh *</label>
              <input id="lt-dk-ns" type="date" class="form-control"/></div>
            <div><label class="form-label">Giới tính *</label>
              <select id="lt-dk-gt" class="form-control">
                <option value="NAM">Nam</option><option value="NU">Nữ</option><option value="KHAC">Khác</option>
              </select></div>
            <div style="grid-column:1/-1"><label class="form-label">Địa chỉ *</label>
              <input id="lt-dk-dc" class="form-control"/></div>
          </div>
          <button type="button" class="btn btn-primary mt-3" onclick="PageLeTanDashboard._submitDangKy()">Tạo tài khoản</button>
        </div>
      </div>`);
  },

  async _submitDangKy() {
    const pw1 = document.getElementById('lt-dk-pw1')?.value || '';
    const pw2 = document.getElementById('lt-dk-pw2')?.value || '';
    if (pw1 !== pw2) {
      Toast.loi('Mật khẩu không khớp', '', 'error');
      return;
    }
    const body = {
      nguoi_dung: {
        ten_dang_nhap: document.getElementById('lt-dk-user')?.value?.trim(),
        password: pw1,
        password2: pw2,
        ho_ten: document.getElementById('lt-dk-hoten')?.value?.trim(),
        email: document.getElementById('lt-dk-email')?.value?.trim(),
        so_dien_thoai: document.getElementById('lt-dk-sdt')?.value?.trim(),
        ngay_sinh: document.getElementById('lt-dk-ns')?.value,
        gioi_tinh: document.getElementById('lt-dk-gt')?.value,
        dia_chi: document.getElementById('lt-dk-dc')?.value?.trim(),
      },
      ngay_sinh: document.getElementById('lt-dk-ns')?.value,
      gioi_tinh: document.getElementById('lt-dk-gt')?.value,
      dia_chi: document.getElementById('lt-dk-dc')?.value?.trim(),
    };
    const res = await Http.tao('/admin/benh-nhan/', body);
    if (res.ok) {
      Toast.hien('Thành công', `Mã BN: ${res.data?.ma_benh_nhan || ''}`, 'success');
      ['lt-dk-user', 'lt-dk-pw1', 'lt-dk-pw2', 'lt-dk-hoten', 'lt-dk-email', 'lt-dk-sdt', 'lt-dk-ns', 'lt-dk-dc'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const gt = document.getElementById('lt-dk-gt');
      if (gt) gt.value = 'NAM';
    } else Toast.loi('Lỗi', this._msgApiLoi(res), 'error');
  },

  _caTuGioHen(iso) {
    if (!iso) return this._caHienTai();
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return this._caHienTai();
    const h = d.getHours();
    if (h < 12) return 'SANG';
    if (h < 18) return 'CHIEU';
    return 'TOI';
  },

  _caHienTai() {
    const h = new Date().getHours();
    if (h < 12) return 'SANG';
    if (h < 18) return 'CHIEU';
    return 'TOI';
  },

  _nhanCa(ca) {
    return { SANG: 'Ca sáng', CHIEU: 'Ca chiều', TOI: 'Ca tối' }[ca] || ca;
  },

  _bsChoCa(bsItems, ca) {
    const list = Array.isArray(bsItems) ? bsItems : [];
    if (!ca) return list;
    return list.filter((x) => (x.cac_ca_trong_ngay || []).includes(ca));
  },

  async _taiBacSiXepHang(ngay, caLam) {
    const base = '/lich-hen/lich-hen/bac_si_xep_hang/';
    const q = [];
    const ngayQ = ngay || this._layNgayTiepNhan();
    const ca = caLam || this._layCaTiepNhan();
    q.push(`ngay=${encodeURIComponent(ngayQ)}`);
    q.push(`ca_lam=${encodeURIComponent(ca)}`);
    return Http.layDanhSach(`${base}?${q.join('&')}`);
  },

  /** Màn hình chính: có hẹn | chưa hẹn lấy số | hàng chờ phòng */
  async _tiepNhan(host) {
    const ngayMacDinh = this._ngayLocalISO();
    const caMacDinh = this._caHienTai();
    UI.render(host, `
      <div class="lt-page">
        <header class="lt-hero">
          <div>
            <h1 class="lt-hero-title"><i class="fas fa-concierge-bell"></i> Tiếp nhận &amp; lấy số</h1>
            <p class="lt-hero-desc">Check-in bệnh nhân có hẹn, cấp số walk-in theo bác sĩ đăng ký ca, quản lý hàng chờ và phòng khám.</p>
          </div>
        </header>

        <div class="lt-panel-shell">
          <div class="lt-toolbar">
            <div class="lt-toolbar-fields">
              <div class="lt-toolbar-field">
                <label>Ngày</label>
                <input type="date" id="lt-tn-ngay" class="form-control" value="${this._esc(ngayMacDinh)}"
                  onchange="PageLeTanDashboard._taiLaiBsTiepNhan()"/>
              </div>
              <div class="lt-toolbar-field">
                <label>Ca làm</label>
                <select id="lt-tn-ca" class="form-control" onchange="PageLeTanDashboard._taiLaiBsTiepNhan()">
                  <option value="SANG" ${caMacDinh === 'SANG' ? 'selected' : ''}>Ca sáng</option>
                  <option value="CHIEU" ${caMacDinh === 'CHIEU' ? 'selected' : ''}>Ca chiều</option>
                  <option value="TOI" ${caMacDinh === 'TOI' ? 'selected' : ''}>Ca tối</option>
                </select>
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="PageLeTanDashboard._taiLaiBsTiepNhan()">
              <i class="fas fa-sync-alt"></i> Tải lại BS
            </button>
          </div>
          <nav class="lt-tabs" role="tablist">
            <button type="button" class="lt-tab" id="lt-ci-tab-a" data-lt-tab="co-lich" onclick="PageLeTanDashboard._tiepNhanTab('co-lich')">
              <span class="lt-tab-num">1</span> Có hẹn — check-in
            </button>
            <button type="button" class="lt-tab" id="lt-ci-tab-b" data-lt-tab="lay-so" onclick="PageLeTanDashboard._tiepNhanTab('lay-so')">
              <span class="lt-tab-num">2</span> Lấy số walk-in
            </button>
            <button type="button" class="lt-tab" id="lt-ci-tab-c" data-lt-tab="hang-cho" onclick="PageLeTanDashboard._tiepNhanTab('hang-cho')">
              <span class="lt-tab-num">3</span> Hàng chờ &amp; phòng
            </button>
          </nav>
        </div>
        <div id="lt-ci-panel"></div>
      </div>`);
    await this._tiepNhanTab('co-lich');
  },

  async _tiepNhanTab(which) {
    window.__ltTiepNhanTab = which;
    document.querySelectorAll('[data-lt-tab]').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-lt-tab') === which);
    });
    if (which === 'lay-so') return this._panelLaySo('lt-ci-panel');
    if (which === 'hang-cho') return this._panelHangCho('lt-ci-panel');
    return this._panelCoHen('lt-ci-panel');
  },

  async _panelCoHen(panelId) {
    const res = await Http.layDanhSach(
      `/lich-hen/lich-hen/hom_nay_letan/?chua_check_in=true&page_size=200`
    );
    const list = res.data?.results || res.data || [];
    const arr = Array.isArray(list) ? list : [];
    const rankRes = await this._taiBacSiXepHang();
    const bsAll = rankRes.data?.items || [];
    const caLbl = rankRes.data?.ca_lam_display || '';
    const host = document.getElementById(panelId);
    if (!host) return;
    const cards = arr.length
      ? arr
          .map((l) => {
            const selId = `lt-pc-bs-${l.id}`;
            const caHen = this._caTuGioHen(l.ngay_gio_hen);
            const bsItems = this._bsChoCa(bsAll, caHen);
            return `<article class="lt-appt-card">
              <div class="lt-appt-top">
                <div>
                  <div class="lt-appt-time">${this._esc(this._ltFormatGio(l.ngay_gio_hen))}
                    <small>${this._esc(this._nhanCa(caHen))}</small>
                  </div>
                  <div class="lt-appt-sub">${this._esc(l.ma_lich_hen || '')}</div>
                </div>
                <div>${this._ltBadgeTrangThai(l.trang_thai, l.trang_thai_display)}</div>
              </div>
              <div class="lt-appt-patient">${this._esc(l.ten_benh_nhan || '')}</div>
              <div class="lt-appt-sub">${this._esc(l.ma_benh_nhan || '')} · BS: ${this._esc(l.ten_bac_si || '—')}</div>
              <div class="lt-appt-actions">
                <button type="button" class="btn btn-sm btn-primary" onclick="PageLeTanDashboard._doCheckIn('${l.id}')">
                  <i class="fas fa-check"></i> Check-in
                </button>
                <select id="${selId}" class="form-control form-control-sm">
                  <option value="">Gán BS (${this._esc(this._nhanCa(caHen))})</option>
                  ${bsItems
                    .map(
                      (x) =>
                        `<option value="${this._esc(x.id)}">${this._esc(x.ho_ten)} (${x.so_benh_nhan_trong_ngay})</option>`
                    )
                    .join('')}
                </select>
                <button type="button" class="btn btn-sm btn-outline" onclick="PageLeTanDashboard._doPhanCong('${l.id}','${selId}')">Gán</button>
              </div>
            </article>`;
          })
          .join('')
      : this._ltEmpty('fa-calendar-times', 'Không có lịch chờ check-in hôm nay');
    host.innerHTML = `
      <div class="lt-panel-shell">
        <div class="lt-panel-head">
          <h2 class="lt-panel-title"><i class="fas fa-calendar-check"></i> Bệnh nhân có hẹn — chưa check-in</h2>
          <span class="lt-badge lt-badge--info">${arr.length} lịch</span>
        </div>
        <div class="lt-panel-body lt-panel-body--scroll">
          <p class="text-muted small mb-3">Ca quầy: <strong>${this._esc(caLbl)}</strong>. Chỉ gán bác sĩ đã đăng ký ca trùng giờ hẹn.</p>
          ${cards}
        </div>
      </div>`;
  },

  async _panelLaySo(panelId) {
    const rankRes = await this._taiBacSiXepHang();
    const bsItems = rankRes.ok ? rankRes.data?.items || [] : [];
    const caLbl = rankRes.data?.ca_lam_display || this._nhanCa(this._layCaTiepNhan());
    const ngayLbl = rankRes.data?.ngay || this._layNgayTiepNhan();
    window.__ltBsXepHang = bsItems;
    const host = document.getElementById(panelId);
    if (!host) return;
    host.innerHTML = `
      <div class="lt-walk-grid">
        <div class="lt-panel-shell">
          <div class="lt-panel-head">
            <h2 class="lt-panel-title"><i class="fas fa-user-md"></i> Bác sĩ trực ca</h2>
            <span class="lt-badge lt-badge--info">${this._esc(caLbl)} · ${this._esc(ngayLbl)}</span>
          </div>
          <div class="lt-panel-body">
            <p class="text-muted small mb-2">Ưu tiên bác sĩ ít bệnh nhân nhất khi bật tự chọn.</p>
            ${this._htmlBangBsTiepNhan(rankRes)}
          </div>
        </div>

        <div class="lt-panel-shell">
          <div class="lt-panel-head">
            <h2 class="lt-panel-title"><i class="fas fa-ticket-alt"></i> Lấy số walk-in</h2>
          </div>
          <div class="lt-panel-body">
            <div class="lt-form-section">
              <div class="lt-form-section-title">Bệnh nhân</div>
              <label class="form-label">Mã bệnh nhân *</label>
              <input id="lt-wi-bn" class="form-control" placeholder="VD: BN20260411001"/>
            </div>

            <div class="lt-form-section">
              <div class="lt-form-section-title">Loại tiếp nhận</div>
              <div class="lt-loai-pills">
                <label class="lt-loai-pill">
                  <input type="radio" name="lt-wi-loai" id="lt-wi-loai-kham" value="KHAM_BENH" checked onchange="PageLeTanDashboard._toggleLoaiWalkIn()"/>
                  <span class="lt-loai-pill-inner"><i class="fas fa-stethoscope"></i> Khám bệnh</span>
                </label>
                <label class="lt-loai-pill">
                  <input type="radio" name="lt-wi-loai" id="lt-wi-loai-tiem" value="TIEM_CHUNG" onchange="PageLeTanDashboard._toggleLoaiWalkIn()"/>
                  <span class="lt-loai-pill-inner"><i class="fas fa-syringe"></i> Tiêm chủng</span>
                </label>
              </div>
            </div>

            <div id="lt-wi-vaccine-wrap" class="lt-form-section" style="display:none">
              <div class="lt-form-section-title">Vaccine</div>
              <select id="lt-wi-vaccine" class="form-control">
                <option value="">Đang tải vaccine...</option>
              </select>
            </div>

            <div class="lt-form-section">
              <div class="lt-form-section-title">Phân công bác sĩ</div>
              <label class="form-label d-block mb-2">
                <input type="checkbox" id="lt-wi-auto" checked/> Tự chọn BS (ít BN nhất)
              </label>
              <select id="lt-wi-bs" class="form-control" disabled>
                <option value="">— Chọn thủ công khi tắt tự chọn —</option>
                ${bsItems.map((x) => `<option value="${this._esc(x.id)}">${this._esc(x.ho_ten)} (${x.so_benh_nhan_trong_ngay} BN)</option>`).join('')}
              </select>
            </div>

            <div class="lt-form-section">
              <div class="lt-form-section-title">Phòng (tuỳ chọn)</div>
              <div class="grid-2">
                <div><label class="form-label">Mã phòng</label>
                  <input id="lt-wi-mp" class="form-control" placeholder="P01"/></div>
                <div><label class="form-label">Tên phòng</label>
                  <input id="lt-wi-tp" class="form-control"/></div>
              </div>
              <label class="form-label mt-2">Ghi chú</label>
              <input id="lt-wi-gc" class="form-control"/>
            </div>

            <button type="button" class="lt-btn-primary-lg" style="width:100%" onclick="PageLeTanDashboard._submitLaySo()">
              <i class="fas fa-check-circle"></i> Xác nhận &amp; lấy số
            </button>
          </div>
        </div>
      </div>`;
    const autoCb = document.getElementById('lt-wi-auto');
    const bsSel = document.getElementById('lt-wi-bs');
    const syncBsSel = () => {
      if (bsSel && autoCb) {
        const on = autoCb.checked;
        bsSel.disabled = on;
        if (on) bsSel.value = '';
      }
    };
    if (autoCb) autoCb.addEventListener('change', syncBsSel);
    syncBsSel();
    await this._taiVaccineWalkIn();
    this._toggleLoaiWalkIn();
  },

  _layLoaiWalkIn() {
    return document.getElementById('lt-wi-loai-tiem')?.checked ? 'TIEM_CHUNG' : 'KHAM_BENH';
  },

  _toggleLoaiWalkIn() {
    const wrap = document.getElementById('lt-wi-vaccine-wrap');
    if (!wrap) return;
    const isTiem = this._layLoaiWalkIn() === 'TIEM_CHUNG';
    wrap.style.display = isTiem ? '' : 'none';
  },

  async _taiVaccineWalkIn() {
    const sel = document.getElementById('lt-wi-vaccine');
    if (!sel) return;
    const res = await Http.layDanhSach('/thuoc/vaccine/?trang_thai=true&ordering=ten_vaccine&page_size=200');
    const rows = res.data?.results || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    if (!res.ok || !list.length) {
      sel.innerHTML = '<option value="">Không có vaccine khả dụng</option>';
      return;
    }
    sel.innerHTML =
      '<option value="">-- Chọn vaccine --</option>' +
      list
        .map((v) => {
          const label = `${v.ma_vaccine || ''} — ${v.ten_vaccine || ''}`;
          return `<option value="${this._esc(v.id)}">${this._esc(label)}</option>`;
        })
        .join('');
  },

  async _submitLaySo() {
    const maOrUuid = document.getElementById('lt-wi-bn')?.value?.trim();
    if (!maOrUuid) return Toast.loi('Nhập mã bệnh nhân', '', 'error');
    const loaiLich = this._layLoaiWalkIn();
    if (loaiLich === 'TIEM_CHUNG') {
      const vc = document.getElementById('lt-wi-vaccine')?.value?.trim();
      if (!vc) return Toast.loi('Chọn vaccine', 'Tiêm chủng bắt buộc chọn loại vaccine.', 'error');
    }
    const auto = document.getElementById('lt-wi-auto')?.checked;
    const bs = document.getElementById('lt-wi-bs')?.value?.trim();
    const body = {
      tu_dong_chon_bac_si: !!auto,
      loai_lich: loaiLich,
      ma_phong: document.getElementById('lt-wi-mp')?.value?.trim() || '',
      ten_phong: document.getElementById('lt-wi-tp')?.value?.trim() || '',
      ghi_chu: document.getElementById('lt-wi-gc')?.value?.trim() || '',
    };
    if (loaiLich === 'TIEM_CHUNG') {
      body.vaccine = document.getElementById('lt-wi-vaccine')?.value?.trim();
    }
    if (this._laUuid(maOrUuid)) body.benh_nhan = maOrUuid;
    else body.ma_benh_nhan = maOrUuid;
    if (!auto && bs) body.bac_si = bs;
    const res = await Http.tao('/lich-hen/lich-hen/walk_in/', body);
    if (res.ok) {
      const d = res.data || {};
      const loaiLabel = loaiLich === 'TIEM_CHUNG' ? 'Tiêm chủng' : 'Khám bệnh';
      Toast.hien('Đã lấy số', `${loaiLabel} — STT ${d.stt_trong_ngay ?? '—'} — ${d.ma_lich_hen || ''}`, 'success');
      await this._tiepNhanTab('hang-cho');
    } else {
      Toast.loi('Không lấy số được', this._msgApiLoi(res), 'error');
    }
  },

  async _panelHangCho(panelId) {
    const res = await Http.layDanhSach(
      `/lich-hen/lich-hen/dieu_phoi_hom_nay/?page_size=200`
    );
    const raw = res.data?.results || res.data || [];
    const list = Array.isArray(raw) ? raw : [];
    const rankRes = await this._taiBacSiXepHang();
    const bsItems = rankRes.data?.items || [];
    const host = document.getElementById(panelId);
    if (!host) return;
    const cards = list.length
      ? list
          .map((l) => {
            const selId = `lt-dp-bs-${l.id}`;
            const mid = `lt-dp-mp-${l.id}`;
            const tid = `lt-dp-tp-${l.id}`;
            const stt = l.stt_trong_ngay != null ? String(l.stt_trong_ngay) : '—';
            return `<article class="lt-queue-card">
              <div class="lt-queue-stt">${this._esc(stt)}</div>
              <div class="lt-queue-main">
                <div class="lt-appt-patient">${this._esc(l.ten_benh_nhan || '')}</div>
                <div class="lt-appt-sub">${this._esc(l.ma_benh_nhan || '')} · ${this._esc(l.ma_lich_hen || '')}</div>
                <div class="mt-2">${this._ltBadgeLoai(l.loai_lich, l.loai_lich_display)} ${this._ltBadgeTrangThai(l.trang_thai, l.trang_thai_display)}</div>
                <div class="lt-appt-sub mt-1"><i class="fas fa-clock"></i> ${this._esc(this._ltFormatGio(l.ngay_gio_hen))} · BS: ${this._esc(l.ten_bac_si || '—')}</div>
              </div>
              <div class="lt-queue-side">
                <input id="${mid}" class="form-control form-control-sm" placeholder="Mã phòng" value="${this._esc(l.ma_phong || '')}"/>
                <input id="${tid}" class="form-control form-control-sm" placeholder="Tên phòng" value="${this._esc(l.ten_phong || '')}"/>
                <select id="${selId}" class="form-control form-control-sm">
                  <option value="">Đổi bác sĩ</option>
                  ${bsItems.map((x) => `<option value="${this._esc(x.id)}">${this._esc(x.ho_ten)}</option>`).join('')}
                </select>
                <button type="button" class="btn btn-sm btn-outline" onclick="PageLeTanDashboard._doPhanCongDp('${this._esc(l.id)}','${selId}')">Gán BS</button>
                <button type="button" class="btn btn-sm btn-primary" onclick="PageLeTanDashboard._savePhong('${this._esc(l.id)}','${mid}','${tid}')">Lưu phòng</button>
              </div>
            </article>`;
          })
          .join('')
      : this._ltEmpty('fa-users', 'Chưa có bệnh nhân đã check-in');
    host.innerHTML = `
      <div class="lt-panel-shell">
        <div class="lt-panel-head">
          <h2 class="lt-panel-title"><i class="fas fa-list-ol"></i> Hàng chờ &amp; phòng khám</h2>
          <span class="lt-badge lt-badge--ok">${list.length} BN</span>
        </div>
        <div class="lt-panel-body lt-panel-body--scroll">
          ${cards}
        </div>
      </div>`;
  },

  async _doCheckIn(lichId) {
    const res = await Http.tao(`/lich-hen/lich-hen/${lichId}/check_in/`, {});
    if (res.ok) Toast.hien('Check-in', 'Đã tiếp nhận', 'success');
    else Toast.loi('Lỗi', this._msgApiLoi(res), 'error');
    if (document.getElementById('lt-ci-panel')) {
      await this._tiepNhanTab(window.__ltTiepNhanTab || 'co-lich');
    } else {
      await this.chuyenTrang('tiep-nhan');
    }
  },

  async _doPhanCong(lichId, selectId) {
    const sel = document.getElementById(selectId);
    const bacSi = sel?.value?.trim();
    if (!bacSi) return Toast.canh('Chọn bác sĩ', '');
    const res = await Http.tao(`/lich-hen/lich-hen/${lichId}/phan_cong_bac_si/`, { bac_si: bacSi });
    if (res.ok) Toast.hien('Đã phân công', '', 'success');
    else Toast.loi('Lỗi', this._msgApiLoi(res), 'error');
    if (document.getElementById('lt-ci-panel')) {
      await this._tiepNhanTab(window.__ltTiepNhanTab || 'co-lich');
    } else {
      await this.chuyenTrang('tiep-nhan');
    }
  },

  async _doPhanCongDp(lichId, selectId) {
    const sel = document.getElementById(selectId);
    const bacSi = sel?.value?.trim();
    if (!bacSi) return Toast.canh('Chọn bác sĩ', '');
    const res = await Http.tao(`/lich-hen/lich-hen/${lichId}/phan_cong_bac_si/`, { bac_si: bacSi });
    if (res.ok) Toast.hien('Đã phân công BS', '', 'success');
    else Toast.loi('Lỗi', this._msgApiLoi(res), 'error');
    await this._tiepNhanTab('hang-cho');
  },

  async _savePhong(lichId, mid, tid) {
    const ma = document.getElementById(mid)?.value?.trim();
    const ten = document.getElementById(tid)?.value?.trim() || '';
    if (!ma) return Toast.loi('Nhập mã phòng', '', 'error');
    const res = await Http.tao(`/lich-hen/lich-hen/${lichId}/phan_cong_phong/`, {
      ma_phong: ma,
      ten_phong: ten,
    });
    if (res.ok) Toast.hien('Đã cập nhật phòng', '', 'success');
    else Toast.loi('Lỗi', this._msgApiLoi(res), 'error');
    await this._tiepNhanTab('hang-cho');
  },

  async _danhSachLich(host) {
    const today = this._ngayLocalISO();
    UI.render(host, `
      <div class="lt-page">
        <header class="lt-hero">
          <div>
            <h1 class="lt-hero-title"><i class="fas fa-calendar-day"></i> Lịch trong ngày</h1>
            <p class="lt-hero-desc">Tra cứu toàn bộ lịch hẹn theo khoảng ngày — theo dõi trạng thái và phân công bác sĩ.</p>
          </div>
        </header>

        <div class="lt-panel-shell">
          <div class="lt-panel-body">
            <div class="lt-filter-bar">
              <div class="lt-toolbar-field">
                <label>Từ ngày</label>
                <input id="lt-ls-tu" type="date" class="form-control" value="${today}"/>
              </div>
              <div class="lt-toolbar-field">
                <label>Đến ngày</label>
                <input id="lt-ls-den" type="date" class="form-control" value="${today}"/>
              </div>
              <button type="button" class="btn btn-primary" onclick="PageLeTanDashboard._taiDanhSachLich()">
                <i class="fas fa-search"></i> Tải danh sách
              </button>
            </div>
            <div id="lt-ls-body" class="lt-panel-body--scroll"></div>
          </div>
        </div>
      </div>`);
    await this._taiDanhSachLich();
  },

  async _taiDanhSachLich() {
    const tu = document.getElementById('lt-ls-tu')?.value || this._ngayLocalISO();
    const den = document.getElementById('lt-ls-den')?.value || tu;
    const res = await Http.layDanhSach(
      `/lich-hen/lich-hen/?tu_ngay=${encodeURIComponent(tu)}&den_ngay=${encodeURIComponent(den)}&ordering=-ngay_gio_hen&page_size=200`
    );
    const list = res.data?.results || [];
    const box = document.getElementById('lt-ls-body');
    if (!box) return;
    if (!res.ok) {
      box.innerHTML = '<p class="text-danger">Không tải được dữ liệu.</p>';
      return;
    }
    if (!list.length) {
      box.innerHTML = this._ltEmpty('fa-calendar', 'Không có lịch trong khoảng ngày đã chọn');
      return;
    }
    box.innerHTML = `
      <table class="lt-table-pro">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Mã lịch</th>
            <th>Loại</th>
            <th>Bệnh nhân</th>
            <th>Bác sĩ</th>
            <th>STT</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (l) => `<tr>
            <td><strong>${this._esc(this._ltFormatGio(l.ngay_gio_hen))}</strong></td>
            <td><code class="small">${this._esc(l.ma_lich_hen || '')}</code></td>
            <td>${this._ltBadgeLoai(l.loai_lich, l.loai_lich_display)}</td>
            <td>
              <div>${this._esc(l.ten_benh_nhan || '')}</div>
              <div class="text-muted small">${this._esc(l.ma_benh_nhan || '')}</div>
            </td>
            <td>${this._esc(l.ten_bac_si || '—')}</td>
            <td>${l.stt_trong_ngay != null ? `<strong>${this._esc(String(l.stt_trong_ngay))}</strong>` : '—'}</td>
            <td>${this._ltBadgeTrangThai(l.trang_thai, l.trang_thai_display)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  },
};

window.PageLeTanDashboard = PageLeTanDashboard;
