/**
 * Dashboard bác sĩ — hồ sơ BN (tab), chẩn đoán theo lần khám, đơn thuốc, tiêm chủng.
 */
const PageBacSiDashboard = {
  _hoSoId: null,
  _benhNhanId: null,
  _benhNhanNguoiDungId: null,
  _lichHenId: null,
  /** Lịch đang mở: KHAM_BENH | TIEM_CHUNG | … */
  _loaiLichHen: null,
  /** Vaccine từ lịch TIEM_CHUNG (UUID) */
  _vaccineLichHenId: null,
  /** Snapshot lịch tiêm (ghi chú đặt lịch, trạng thái lịch) */
  _lichTiemSnapshot: null,
  _chanDoanDaLuu: false,
  /** Giữ thông tin BN đang khám khi chuyển tab (API không lồng nguoi_dung đầy đủ — dùng ho_ten từ serializer) */
  _patientSnapshot: null,
  /** true = xem hồ sơ từ Tìm kiếm (chỉ đọc CD + toa), không bật strip Đang khám */
  _hoSoXemChiTietTraCuu: false,

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /** API đôi khi trả benh_nhan là object — query cần UUID string */
  _idStr(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && v.id != null) return String(v.id);
    return '';
  },

  /** Chuỗi lỗi đọc được khi API trả non-JSON hoặc { detail } thay vì { error } */
  _msgApiLoi(res) {
    const d = res && res.data;
    if (d == null) {
      const st = res && res.status;
      if (st === 401) return 'Phiên đăng nhập hết hạn — vui lòng đăng nhập lại.';
      if (st === 403) return 'Không có quyền thực hiện (HTTP 403).';
      if (st === 404) return 'Không tìm thấy lịch — có thể lịch đã kết thúc hoặc không thuộc tài khoản bác sĩ.';
      if (st === 400 || st === 405) return 'Yêu cầu không hợp lệ — thử làm mới trang hoặc mở lại hồ sơ từ lịch hẹn.';
      if (st === 0) return 'Không kết nối được máy chủ.';
      return st ? `Lỗi HTTP ${st} (máy chủ không trả JSON chi tiết).` : 'Không có phản hồi từ máy chủ.';
    }
    if (typeof d === 'object' && d !== null) {
      if (d.error != null) return typeof d.error === 'string' ? d.error : JSON.stringify(d.error);
      if (d.detail != null) return typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
      const keys = Object.keys(d);
      if (keys.length) return JSON.stringify(d);
    }
    return String(d);
  },

  _bacSiId() {
    const u = Auth.layThongTin() || {};
    return u.bac_si_id || (u.role_data && u.role_data.id) || null;
  },

  _formatDateYMD(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  /** Cập nhật snapshot từ object hồ sơ (retrieve hoặc mo-ho-so) */
  _setPatientSnapshotFromHoSo(h, lichHenId) {
    if (!h || !h.id) return;
    const bn = h.benh_nhan && typeof h.benh_nhan === 'object' ? h.benh_nhan : null;
    const ten =
      (bn && (bn.ho_ten || bn.nguoi_dung?.ho_ten)) || h.ten_benh_nhan || '';
    const maBn = (bn && bn.ma_benh_nhan) || h.ma_benh_nhan || '';
    const sdt = (bn && (bn.so_dien_thoai || bn.nguoi_dung?.so_dien_thoai)) || '';
    this._patientSnapshot = {
      maHs: h.ma_hs || '',
      tenBn: ten,
      maBn,
      sdt,
      hoSoId: h.id,
      lichHenId: lichHenId != null ? lichHenId : this._lichHenId,
    };
  },

  _refreshPatientStrip() {
    const el = document.getElementById('bs-patient-strip');
    if (!el) return;
    if (this._hoSoXemChiTietTraCuu) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    const s = this._patientSnapshot;
    const has = !!(this._hoSoId && s && s.hoSoId);
    if (!has) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const lich = s.lichHenId ? ` • Lịch: ${this._esc(String(s.lichHenId).slice(0, 8))}…` : '';
    el.innerHTML = `
      <div class="card-body py-2 px-3" style="background:linear-gradient(90deg,#e8f4fc 0%,#fff 100%);border-left:4px solid var(--c-navy,#0a2342)">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="small">
            <strong>Đang khám:</strong>
            <span class="text-dark">${this._esc(s.tenBn || '—')}</span>
            <span class="text-muted"> — Mã BN ${this._esc(s.maBn || '—')}</span>
            ${s.sdt ? `<span class="text-muted"> — ${this._esc(s.sdt)}</span>` : ''}
            <span class="text-muted"> — Hồ sơ <code>${this._esc(s.maHs || '')}</code>${lich}</span>
          </div>
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-primary" onclick="PageBacSiDashboard._moVeHoSoChiTiet()">Mở / làm mới hồ sơ</button>
            <button type="button" class="btn btn-success" onclick="PageBacSiDashboard._hoanTatKham()">Hoàn tất khám (nhảy hàng chờ)</button>
          </div>
        </div>
      </div>`;
  },

  async _moVeHoSoChiTiet() {
    if (!this._hoSoId) return;
    this._hoSoXemChiTietTraCuu = false;
    await this.chuyenTrang('ho-so');
    await this._loadChiTietHoSo(this._hoSoId, { traCuu: false });
  },

  async _hoanTatKham() {
    if (!this._hoSoId) {
      Toast.loi('Chưa có hồ sơ đang mở', '', 'error');
      return;
    }
    const hasLich = !!this._lichHenId;
    const ok = confirm(
      hasLich
        ? 'Kết thúc lịch hẹn (hoàn thành khám) và nhảy bệnh nhân khỏi hàng đang khám?\nChỉ làm sau khi đã chẩn đoán / kê đơn xong.'
        : 'Không có lịch gắn — chỉ đóng phiên xem hồ sơ trên màn hình bác sĩ. Tiếp tục?'
    );
    if (!ok) return;
    if (hasLich) {
      const res = await Http.tao(`/lich-hen/lich-hen/${this._lichHenId}/hoan_thanh/`, {});
      if (!res.ok) {
        Toast.loi('Không kết thúc được lịch', this._msgApiLoi(res), 'error');
        return;
      }
    }
    this._hoSoId = null;
    this._benhNhanId = null;
    this._benhNhanNguoiDungId = null;
    this._lichHenId = null;
    this._loaiLichHen = null;
    this._vaccineLichHenId = null;
    this._lichTiemSnapshot = null;
    this._patientSnapshot = null;
    this._chanDoanDaLuu = false;
    this._refreshPatientStrip();
    Toast.hien('Đã hoàn tất', hasLich ? 'Lịch chuyển sang Hoàn thành.' : 'Đã đóng phiên làm việc.', 'success');
    await this.chuyenTrang('tong-quan');
  },

  /**
   * Danh sách hồ sơ: tìm theo mã BN / họ tên / SĐT và/hoặc khoảng ngày khám (tu_ngay, den_ngay).
   */
  async _dsHoSoTimKiem(q, tuNgay, denNgay) {
    const raw = (q || '').trim();
    const tu = (tuNgay || '').trim();
    const den = (denNgay || '').trim();
    if (!raw && !tu && !den) return { ok: false, list: [] };
    const params = new URLSearchParams({
      ordering: '-ngay_kham',
      page_size: '100',
    });
    if (raw) params.set('tim_kiem', raw);
    if (tu) params.set('tu_ngay', tu);
    if (den) params.set('den_ngay', den);
    const res = await Http.layDanhSach(`/benh-an/ho-so-benh-an/?${params}`);
    const rows = (res.data && res.data.results) || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    return { ok: res.ok, list };
  },

  _layBoLocTimHoSo() {
    const q = document.getElementById('bs-tim-bn')?.value?.trim() || '';
    const tuNgay = document.getElementById('bs-hs-tu-ngay')?.value?.trim() || '';
    const denNgay = document.getElementById('bs-hs-den-ngay')?.value?.trim() || '';
    return { q, tuNgay, denNgay };
  },

  _hsPresetHomNay() {
    const t = this._formatDateYMD(new Date());
    const elTu = document.getElementById('bs-hs-tu-ngay');
    const elDen = document.getElementById('bs-hs-den-ngay');
    if (elTu) elTu.value = t;
    if (elDen) elDen.value = t;
  },

  _hsPresetThangNay() {
    const d = new Date();
    const tu = this._formatDateYMD(new Date(d.getFullYear(), d.getMonth(), 1));
    const den = this._formatDateYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const elTu = document.getElementById('bs-hs-tu-ngay');
    const elDen = document.getElementById('bs-hs-den-ngay');
    if (elTu) elTu.value = tu;
    if (elDen) elDen.value = den;
  },

  _hsXoaLocNgay() {
    const elTu = document.getElementById('bs-hs-tu-ngay');
    const elDen = document.getElementById('bs-hs-den-ngay');
    if (elTu) elTu.value = '';
    if (elDen) elDen.value = '';
  },

  async render() {
    const { hoTen, vaiTro } = Auth.layThongTin();
    const navHtml = `
      <button type="button" class="nav-item" data-bs-nav="tq" onclick="PageBacSiDashboard.chuyenTrang('tong-quan')"><i class="fas fa-chart-line"></i><span>Tổng quan</span></button>
      <button type="button" class="nav-item" data-bs-nav="hs" onclick="PageBacSiDashboard.chuyenTrang('ho-so')"><i class="fas fa-folder-open"></i><span>Hồ sơ bệnh nhân</span></button>
      <button type="button" class="nav-item" data-bs-nav="cd" onclick="PageBacSiDashboard.chuyenTrang('chan-doan')"><i class="fas fa-stethoscope"></i><span>Chẩn đoán</span></button>
      <button type="button" class="nav-item" data-bs-nav="dt" onclick="PageBacSiDashboard.chuyenTrang('don-thuoc')"><i class="fas fa-prescription"></i><span>Kê đơn</span></button>
      <button type="button" class="nav-item" data-bs-nav="cd2" onclick="PageBacSiDashboard.chuyenTrang('chi-dinh')"><i class="fas fa-syringe"></i><span>Tiêm chủng</span></button>
      <button type="button" class="nav-item" data-bs-nav="llv" onclick="PageBacSiDashboard.chuyenTrang('lich-lam')"><i class="fas fa-calendar-plus"></i><span>Đăng ký ca làm</span></button>`;
    const strip = `
      <div id="bs-patient-strip-wrap" class="mb-3">
        <div id="bs-patient-strip" class="card border-primary shadow-sm" style="display:none"></div>
      </div>`;
    window.RoleDashboardShell.mount('app-root', {
      brandTitle: 'PhòngKhám+',
      brandAccent: 'Bác sĩ',
      brandIcon: 'fa-user-md',
      navHtml,
      mainHostId: 'bac-si-main',
      userName: hoTen || 'Bác sĩ',
      userRoleLabel: vaiTro ? String(vaiTro).replace(/_/g, ' ') : 'Bác sĩ',
      contentMaxWidth: '1280px',
      aboveMainContent: strip,
      headerActionsExtra: window.ThongBaoBell ? ThongBaoBell.htmlButton() : '',
    });
    if (window.ThongBaoBell) ThongBaoBell.init({ badgeId: 'pk-noti-badge' });
    await this.chuyenTrang('tong-quan');
  },

  _setNavActive(trang) {
    const map = {
      'tong-quan': 'tq',
      'ho-so': 'hs',
      'chan-doan': 'cd',
      'don-thuoc': 'dt',
      'chi-dinh': 'cd2',
      'lich-lam': 'llv',
    };
    const cur = map[trang];
    document.querySelectorAll('[data-bs-nav]').forEach((b) => {
      const on = b.getAttribute('data-bs-nav') === cur;
      b.classList.toggle('active', on);
    });
  },

  async chuyenTrang(trang) {
    this._setNavActive(trang);
    const host = 'bac-si-main';
    if (trang === 'tong-quan') await this._tongQuan(host);
    else if (trang === 'ho-so') await this._hoSoList(host);
    else if (trang === 'chan-doan') await this._formChanDoan(host);
    else if (trang === 'don-thuoc') await this._formDonThuoc(host);
    else if (trang === 'chi-dinh') await this._chiDinh(host);
    else if (trang === 'lich-lam') await this._lichLamViec(host);
    else await this._tongQuan(host);
    this._refreshPatientStrip();
  },

  async _tongQuan(host) {
    const res = await Http.layDanhSach('/lich-hen/lich-hen/dieu_phoi_hom_nay/');
    const results = (res.data && res.data.results) || [];
    UI.render(host, `
      <div class="card mb-3">
        <div class="card-header"><div class="card-title">Hàng chờ hôm nay (đã check-in)</div></div>
        <div class="card-body" id="bs-hang-cho"></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Gợi ý</div></div>
        <div class="card-body">
          <p class="text-muted small mb-0">Chọn bệnh nhân đã check-in để mở hồ sơ lần khám — không cần nhập mã BN. Hoặc vào <strong>Hồ sơ bệnh nhân</strong> để tìm theo mã, tên hoặc số điện thoại.</p>
        </div>
      </div>`);
    const el = document.getElementById('bs-hang-cho');
    if (!res.ok) {
      el.innerHTML = '<p class="text-danger">Không tải được danh sách.</p>';
      return;
    }
    el.innerHTML = results.length
      ? `<table class="table table-sm"><thead><tr><th>STT</th><th>Giờ</th><th>Bệnh nhân</th><th>Mã BN</th><th>Phòng</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${results
          .map(
            (l) => {
              const isDang = l.trang_thai === 'DANG_KHAM';
              const gio = (l.thoi_gian_den || l.ngay_gio_hen || '').toString().slice(11, 16);
              const btnLabel = isDang ? 'Tiếp tục khám' : 'Mở hồ sơ khám';
              const btnClass = isDang ? 'btn-outline-primary' : 'btn-primary';
              return `<tr>
          <td>${this._esc(l.stt_trong_ngay ?? '—')}</td>
          <td>${this._esc(gio)}</td>
          <td>${this._esc(l.ten_benh_nhan || '')}</td>
          <td>${this._esc(l.ma_benh_nhan || '')}</td>
          <td>${this._esc(l.ma_phong || l.ten_phong || '—')}</td>
          <td><span class="badge ${isDang ? 'bg-warning text-dark' : 'bg-light text-dark border'}">${this._esc(this._trangThaiLich(l.trang_thai))}</span></td>
          <td>
            <button type="button" class="btn btn-sm ${btnClass}" onclick="PageBacSiDashboard._moHoSoTuLich('${l.id}')">${btnLabel}</button>
          </td>
        </tr>`;
            }
          )
          .join('')}
        </tbody></table>`
      : '<p class="text-muted">Chưa có bệnh nhân đã check-in hôm nay.</p>';
  },

  _loaiLichLabel(loai) {
    const m = {
      KHAM_BENH: 'Khám bệnh',
      TIEM_CHUNG: 'Tiêm chủng',
      TAI_KHAM: 'Tái khám',
      TU_VAN: 'Tư vấn',
    };
    return m[loai] || loai || '—';
  },

  _trangThaiTiemChungLs(tt) {
    const m = {
      DA_TIEM: 'Đã tiêm',
      HEN_TIEM: 'Hẹn tiêm',
      BO_QUA: 'Bỏ qua',
      CHONG_CHI_DINH: 'Chống chỉ định / không đạt',
      HOAN: 'Hoãn tiêm',
    };
    return m[tt] || tt || '—';
  },

  _trangThaiLichTiemLt(tt) {
    const m = {
      CHUA_TIEM: 'Chưa tiêm',
      DA_TIEM: 'Đã tiêm',
      TAM_HOAN: 'Tạm hoãn',
      CHONG_CHI_DINH: 'Chống chỉ định / không đạt',
    };
    return m[tt] || tt || '—';
  },

  /** Lịch hẹn + lịch sử tiêm gắn hồ sơ (tra cứu / phân loại tiêm chủng). */
  async _layThongTinHoSoTiem(h) {
    const hoSoId = h && h.id;
    const bnId = this._idStr(h && h.benh_nhan);
    let loaiLich = null;
    let lichHenId = null;
    let lichTiem = null;
    let maLichHen = '';

    if (hoSoId) {
      const lkRes = await Http.layDanhSach(
        `/lich-hen/lich-kham/?ho_so_benh_an=${encodeURIComponent(hoSoId)}`
      );
      if (lkRes.ok && lkRes.data != null) {
        const raw = lkRes.data;
        const rows = Array.isArray(raw) ? raw : raw.results || [];
        const row = rows[0];
        if (row && row.lich_hen != null && row.lich_hen !== '') {
          lichHenId =
            typeof row.lich_hen === 'object' && row.lich_hen !== null
              ? row.lich_hen.id
              : row.lich_hen;
        }
      }
      if (lichHenId) {
        const lhRes = await Http.layDanhSach(`/lich-hen/lich-hen/${lichHenId}/`);
        if (lhRes.ok && lhRes.data) {
          loaiLich = lhRes.data.loai_lich || null;
          maLichHen = lhRes.data.ma_lich_hen || '';
        }
        if (loaiLich === 'TIEM_CHUNG') {
          const ltRes = await Http.layDanhSach(`/lich-hen/lich-tiem/${lichHenId}/`);
          if (ltRes.ok && ltRes.data) lichTiem = ltRes.data;
        }
      }
    }

    let danhSachTiem = [];
    if (bnId) {
      const tcRes = await Http.layDanhSach(
        `/benh-an/lich-su-tiem-chung/?benh_nhan=${encodeURIComponent(bnId)}&ordering=-ngay_tiem&page_size=40`
      );
      const rows = (tcRes.data && tcRes.data.results) || tcRes.data || [];
      const all = Array.isArray(rows) ? rows : [];
      const ngayHs = (h.ngay_kham || '').toString().slice(0, 10);
      danhSachTiem = ngayHs
        ? all.filter((t) => (t.ngay_tiem || '').toString().slice(0, 10) === ngayHs)
        : [];
      if (!danhSachTiem.length && all.length) danhSachTiem = [all[0]];
    }

    const lyDo = ((h && h.ly_do_kham) || '').toLowerCase();
    const isTiemChung =
      loaiLich === 'TIEM_CHUNG' ||
      danhSachTiem.length > 0 ||
      lyDo.includes('tiêm chủng') ||
      lyDo.includes('tiem chung');

    return { isTiemChung, loaiLich, lichHenId, lichTiem, danhSachTiem, maLichHen };
  },

  /** Trạng thái + ghi chú ưu tiên bản ghi trên hồ sơ (sau khi bác sĩ lưu), không chỉ lịch "Chưa tiêm". */
  _trangThaiTiemTomTat(meta) {
    const list = Array.isArray(meta?.danhSachTiem) ? meta.danhSachTiem : [];
    if (list.length) {
      const t = list[0];
      return {
        trangThai: this._trangThaiTiemChungLs(t.trang_thai),
        ghiChuHs: (t.ghi_chu || '').trim(),
        coHoSo: true,
      };
    }
    const lt = meta?.lichTiem;
    if (lt) {
      return {
        trangThai: this._trangThaiLichTiemLt(lt.trang_thai_tiem),
        ghiChuHs: '',
        ghiChuDatLich: (lt.ghi_chu || '').trim(),
        coHoSo: false,
      };
    }
    return { trangThai: '—', ghiChuHs: '', ghiChuDatLich: '', coHoSo: false };
  },

  _badgeTrangThaiTiem(text) {
    const t = (text || '').toLowerCase();
    let cls = 'bg-light text-dark border';
    if (t.includes('đã tiêm')) cls = 'bg-success text-white';
    else if (t.includes('chống') || t.includes('hủy') || t.includes('bỏ')) cls = 'bg-danger text-white';
    else if (t.includes('chưa tiêm') || t.includes('hẹn')) cls = 'bg-warning text-dark';
    return `<span class="badge ${cls}">${this._esc(text)}</span>`;
  },

  _renderTiemChungDocHtml(meta, h) {
    const m = meta || {};
    const tom = this._trangThaiTiemTomTat(m);
    const parts = [];

    parts.push(
      `<div class="bs-hs-tiem-status mb-3 p-2 rounded border" style="background:#f0fdfa">
        <div class="small text-muted mb-1">Trạng thái tiêm${tom.coHoSo ? ' (trên hồ sơ)' : ' (lịch hẹn)'}</div>
        <div class="mb-2">${this._badgeTrangThaiTiem(tom.trangThai)}</div>
        ${!tom.coHoSo && tom.trangThai.includes('Chưa tiêm') ? '<p class="small text-muted mb-0">BN đã check-in — chờ bác sĩ ghi tiêm trên màn <strong>Tiêm chủng</strong>.</p>' : ''}
      </div>`
    );

    const ghiChuBlocks = [];
    if (tom.ghiChuDatLich) {
      ghiChuBlocks.push(
        `<div class="mb-2"><span class="small text-muted d-block">Ghi chú khi đặt lịch</span><p class="small mb-0">${this._esc(this._shortText(tom.ghiChuDatLich, 500))}</p></div>`
      );
    }
    if (tom.ghiChuHs) {
      ghiChuBlocks.push(
        `<div class="mb-2"><span class="small text-muted d-block">Ghi chú điều trị / sau tiêm</span><p class="small mb-0 fw-semibold">${this._esc(this._shortText(tom.ghiChuHs, 500))}</p></div>`
      );
    }
    if (!ghiChuBlocks.length) {
      ghiChuBlocks.push('<p class="bs-hs-dd-muted small mb-0">Chưa có ghi chú tiêm chủng.</p>');
    }
    parts.push(
      `<div class="bs-hs-readonly-section mb-3"><h5 class="small fw-bold text-secondary mb-2">Ghi chú</h5>${ghiChuBlocks.join('')}</div>`
    );

    if (m.maLichHen || m.loaiLich) {
      parts.push(
        `<p class="small mb-2"><strong>Lịch hẹn:</strong> ${this._esc(m.maLichHen || '—')}${
          m.loaiLich ? ` · ${this._esc(this._loaiLichLabel(m.loaiLich))}` : ''
        }</p>`
      );
    }
    if (h && h.ly_do_kham) {
      parts.push(`<p class="small mb-2"><strong>Lý do:</strong> ${this._esc(this._shortText(h.ly_do_kham, 500))}</p>`);
    }
    const lt = m.lichTiem;
    if (lt) {
      const tenVc =
        lt.ten_vaccine ||
        (lt.vaccine && typeof lt.vaccine === 'object' ? lt.vaccine.ten_vaccine : '') ||
        '';
      parts.push(`<dl class="bs-hs-dl">
        <dt>Vaccine (lịch)</dt><dd>${this._esc(tenVc || '—')}</dd>
        <dt>Mũi</dt><dd>${lt.so_mui != null ? this._esc(String(lt.so_mui)) : '—'}</dd>
      </dl>`);
    }
    const list = Array.isArray(m.danhSachTiem) ? m.danhSachTiem : [];
    if (list.length) {
      parts.push(`<div class="table-responsive mt-2"><table class="table table-sm table-bordered mb-0 small">
        <thead><tr><th>Mã</th><th>Vaccine</th><th>Ngày tiêm</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead><tbody>
        ${list
          .map(
            (t) => `<tr>
            <td>${this._esc(t.ma_lich || '')}</td>
            <td>${this._esc(t.ten_vaccine || '')}</td>
            <td>${this._esc(t.ngay_tiem || '')}</td>
            <td>${this._esc(t.trang_thai_display || this._trangThaiTiemChungLs(t.trang_thai))}</td>
            <td>${this._esc(this._shortText(t.ghi_chu, 120) || '—')}</td>
          </tr>`
          )
          .join('')}
        </tbody></table></div>`);
    } else if (!lt) {
      parts.push(
        '<p class="bs-hs-dd-muted small mb-0">Chưa có bản ghi tiêm chủng trên hồ sơ lần này.</p>'
      );
    }
    return parts.join('') || '<p class="bs-hs-dd-muted small mb-0">Không có thông tin tiêm chủng.</p>';
  },

  async _napVaccineTuLichTiem(lichId) {
    this._vaccineLichHenId = null;
    this._lichTiemSnapshot = null;
    const res = await Http.layDanhSach(`/lich-hen/lich-tiem/${lichId}/`);
    if (res.ok && res.data) {
      this._lichTiemSnapshot = res.data;
      this._vaccineLichHenId = this._idStr(res.data.vaccine) || null;
    }
  },

  _dienGhiChuTiemForm() {
    const el = document.getElementById('ti-ghi-chu');
    if (!el) return;
    const datLich = (this._lichTiemSnapshot?.ghi_chu || '').trim();
    if (datLich) {
      el.placeholder = `Ghi chú lúc tiêm (đặt lịch: ${datLich.slice(0, 80)}${datLich.length > 80 ? '…' : ''})`;
    } else {
      el.placeholder = 'Ghi chú: phản ứng sau tiêm, lưu ý theo dõi, mũi tiếp theo…';
    }
  },

  async _moHoSoTuLich(lichId) {
    const res = await Http.tao(`/lich-hen/lich-hen/${lichId}/mo_ho_so_benh_an/`, {});
    if (!res.ok || !res.data || !res.data.ho_so) {
      Toast.loi('Không mở được hồ sơ', (res.data && res.data.error) || '', 'error');
      return;
    }
    const ho = res.data.ho_so;
    const lich = res.data.lich_hen || {};
    this._lichHenId = lichId;
    this._loaiLichHen = lich.loai_lich || null;
    this._hoSoId = ho.id;
    this._benhNhanId = this._idStr(ho.benh_nhan) || this._benhNhanId;
    this._chanDoanDaLuu = false;
    this._hoSoXemChiTietTraCuu = false;
    this._setPatientSnapshotFromHoSo(ho, lichId);
    Toast.hien('Đã mở hồ sơ', ho.ma_hs || '', 'success');

    if (this._loaiLichHen === 'TIEM_CHUNG') {
      await this._napVaccineTuLichTiem(lichId);
      await this.chuyenTrang('chi-dinh');
      return;
    }

    this._vaccineLichHenId = null;
    await this.chuyenTrang('ho-so');
    await this._loadChiTietHoSo(this._hoSoId, { traCuu: false });
  },

  _trangThaiLich(tt) {
    const m = {
      CHO_XAC_NHAN: 'Chờ xác nhận',
      DA_DAT: 'Đã đặt',
      DA_XAC_NHAN: 'Đã xác nhận',
      CHECKED_IN: 'Đã check-in',
      DANG_KHAM: 'Đang khám',
      HOAN_THANH: 'Hoàn thành',
      DA_HUY: 'Đã hủy',
      VANG_MAT: 'Vắng mặt',
      QUA_HAN: 'Quá hạn',
    };
    return m[tt] || tt || '—';
  },

  async _loadDsLichHomNay() {
    const el = document.getElementById('bs-ds-hom-nay');
    if (!el) return;
    const res = await Http.layDanhSach(
      '/lich-hen/lich-hen/?hom_nay=true&cho_kham=true&ordering=stt_trong_ngay,ngay_gio_hen&page_size=100'
    );
    const rows = (res.data && res.data.results) || [];
    if (!res.ok) {
      el.innerHTML = `<p class="text-danger small mb-0 p-3">Không tải được danh sách lịch: ${this._esc(this._msgApiLoi(res))}</p>`;
      return;
    }
    const list = (Array.isArray(rows) ? rows : []).filter(
      (l) => l.trang_thai !== 'HOAN_THANH' && l.trang_thai !== 'DA_HUY'
    );
    if (!list.length) {
      el.innerHTML =
        '<p class="text-muted small mb-0 p-3">Không còn lịch cần khám hôm nay. Bệnh nhân đã check-in sẽ hiện sau khi lễ tân phân bác sĩ / lấy số.</p>';
      return;
    }
    el.innerHTML = `<div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">
      <thead><tr><th>STT</th><th>Giờ</th><th>Bệnh nhân</th><th>Mã BN</th><th>Loại</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${list
        .map((l) => {
          const isTiem = l.loai_lich === 'TIEM_CHUNG';
          const isDang = l.trang_thai === 'DANG_KHAM';
          const isCurrent = this._lichHenId && String(l.id) === String(this._lichHenId);
          const btnLabel = isTiem ? (isDang ? 'Tiếp tục tiêm' : 'Tiêm chủng') : isDang ? 'Tiếp tục khám' : 'Mở hồ sơ khám';
          const btnClass = isTiem ? 'btn-info text-white' : isDang ? 'btn-outline-primary' : 'btn-primary';
          const loaiBadge = isTiem
            ? '<span class="badge bg-info text-white">Tiêm chủng</span>'
            : `<span class="badge bg-light text-dark border">${this._esc(l.loai_lich_display || this._loaiLichLabel(l.loai_lich))}</span>`;
          const stt = l.stt_trong_ngay != null ? String(l.stt_trong_ngay) : '—';
          const gio = (l.thoi_gian_den || l.ngay_gio_hen || '').toString().slice(11, 16);
          const rowCls = isCurrent ? 'table-primary' : '';
          return `<tr class="${rowCls}">
        <td>${this._esc(stt)}</td>
        <td>${this._esc(gio)}</td>
        <td>${this._esc(l.ten_benh_nhan || '')}</td>
        <td>${this._esc(l.ma_benh_nhan || '')}</td>
        <td>${loaiBadge}</td>
        <td><span class="badge ${isDang ? 'bg-warning text-dark' : 'bg-light text-dark border'}">${this._esc(this._trangThaiLich(l.trang_thai))}</span></td>
        <td class="text-end">
          <button type="button" class="btn btn-sm ${btnClass}" onclick="PageBacSiDashboard._moHoSoTuLich('${l.id}')">${btnLabel}</button>
        </td>
      </tr>`;
        })
        .join('')}
      </tbody></table></div>
      <p class="text-muted small mt-2 mb-0 px-3 pb-2">Gồm BN <strong>chờ khám</strong> và <strong>đang khám</strong> (do lễ tân phân). Dòng xanh = BN đang mở hồ sơ.</p>`;
  },

  async _hoSoList(host) {
    const qVal = this._esc((await this._guessTimTuBn()) || '');
    UI.render(host, `
      <div class="card mb-3">
        <div class="card-header"><div class="card-title">Lịch hôm nay (do lễ tân / hệ thống xếp)</div></div>
        <div class="card-body p-0" id="bs-ds-hom-nay"><p class="text-muted small p-3 mb-0">Đang tải…</p></div>
      </div>
      <div class="card bs-hs-card mb-0">
        <div class="card-header"><div class="card-title">Tìm hồ sơ bệnh nhân</div></div>
        <div class="card-body">
          <p class="bs-hs-intro">Nhập <strong>mã BN</strong>, <strong>họ tên</strong>, <strong>số điện thoại</strong> và/hoặc chọn <strong>ngày khám</strong> (từ — đến) rồi bấm Tìm.</p>
          <div class="bs-hs-search-row">
            <div class="bs-hs-input-wrap">
              <i class="fas fa-search bs-hs-input-icon" aria-hidden="true"></i>
              <input id="bs-tim-bn" class="form-control w-full" placeholder="VD: BN2024001, họ tên, số điện thoại…" value="${qVal}" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();PageBacSiDashboard._timHoSo();}"/>
            </div>
            <button type="button" class="bs-hs-btn-search" onclick="PageBacSiDashboard._timHoSo()"><i class="fas fa-search" aria-hidden="true"></i> Tìm</button>
          </div>
          <div class="bs-hs-date-row">
            <div class="bs-hs-date-field">
              <label class="bs-hs-date-label" for="bs-hs-tu-ngay">Từ ngày</label>
              <input type="date" id="bs-hs-tu-ngay" class="form-control bs-hs-date-input" onkeydown="if(event.key==='Enter'){event.preventDefault();PageBacSiDashboard._timHoSo();}"/>
            </div>
            <div class="bs-hs-date-field">
              <label class="bs-hs-date-label" for="bs-hs-den-ngay">Đến ngày</label>
              <input type="date" id="bs-hs-den-ngay" class="form-control bs-hs-date-input" onkeydown="if(event.key==='Enter'){event.preventDefault();PageBacSiDashboard._timHoSo();}"/>
            </div>
            <div class="bs-hs-date-presets">
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBacSiDashboard._hsPresetHomNay()">Hôm nay</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBacSiDashboard._hsPresetThangNay()">Tháng này</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBacSiDashboard._hsXoaLocNgay()">Xóa ngày</button>
            </div>
          </div>
          <p class="bs-hs-hint">Có thể chỉ chọn ngày (không cần nhập tên) hoặc kết hợp cả hai. Danh sách kết quả có thanh cuộn khi nhiều lần khám.</p>
          <div id="bs-hs-pick" class="bs-hs-results"></div>
          <div id="bs-hs-detail"></div>
        </div>
      </div>`);
    await this._loadDsLichHomNay();
    if (qVal) await this._timHoSo();
    if (this._hoSoId && !this._hoSoXemChiTietTraCuu) {
      await this._loadChiTietHoSo(this._hoSoId, { traCuu: false });
    }
  },

  async _guessTimTuBn() {
    if (this._patientSnapshot?.maBn) return this._patientSnapshot.maBn;
    if (!this._benhNhanId) return '';
    const res = await Http.layDanhSach(`/benh-nhan/${this._benhNhanId}/`);
    if (res.ok && res.data && res.data.ma_benh_nhan) return res.data.ma_benh_nhan;
    return '';
  },

  _renderHsPickList(list) {
    const rows = list
      .map(
        (h) => `<tr>
          <td><span class="bs-hs-code">${this._esc(h.ma_hs || '—')}</span></td>
          <td>${this._fmtNgayKhamDisplay(h.ngay_kham)}</td>
          <td><span class="bs-hs-patient">${this._esc(h.ten_benh_nhan || '—')}</span></td>
          <td><span class="bs-hs-code">${this._esc(h.ma_benh_nhan || '—')}</span></td>
          <td class="bs-hs-td-action">
            <button type="button" class="bs-hs-btn-view" onclick="PageBacSiDashboard._chonVaXemHoSo('${h.id}','${this._idStr(h.benh_nhan)}')">Xem hồ sơ</button>
          </td>
        </tr>`
      )
      .join('');
    return `
      <div class="bs-hs-results-head">
        <span class="bs-hs-results-title">Kết quả tìm kiếm</span>
        <span class="bs-hs-badge">${list.length} lần khám</span>
      </div>
      <div class="bs-hs-results-scroll" tabindex="0" aria-label="Danh sách lần khám">
        <div class="bs-hs-table-wrap">
          <table class="bs-hs-table">
            <thead>
              <tr>
                <th scope="col">Mã hồ sơ</th>
                <th scope="col">Ngày khám</th>
                <th scope="col">Bệnh nhân</th>
                <th scope="col">Mã BN</th>
                <th scope="col" class="bs-hs-th-action">Thao tác</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  },

  async _timHoSo() {
    let { q, tuNgay, denNgay } = this._layBoLocTimHoSo();
    if (!q && !tuNgay && !denNgay) {
      return Toast.loi('Nhập mã BN / tên / SĐT hoặc chọn ngày khám', '', 'error');
    }
    if (tuNgay && !denNgay) denNgay = tuNgay;
    if (denNgay && !tuNgay) tuNgay = denNgay;
    if (tuNgay && denNgay && tuNgay > denNgay) {
      return Toast.loi('Từ ngày không được sau đến ngày', '', 'error');
    }
    const box = document.getElementById('bs-hs-pick');
    if (!box) return;
    box.innerHTML = '<p class="text-muted small py-3 mb-0 text-center">Đang tải…</p>';
    const { ok, list } = await this._dsHoSoTimKiem(q, tuNgay, denNgay);
    if (!ok) {
      box.innerHTML = `<div class="bs-hs-error" role="alert">
        <i class="fas fa-exclamation-circle" style="font-size:22px;margin-bottom:10px;opacity:.9" aria-hidden="true"></i>
        <span>Không tải được danh sách. Kiểm tra kết nối hoặc thử lại sau.</span>
      </div>`;
      return;
    }
    if (!list.length) {
      box.innerHTML = `<div class="bs-hs-empty">
        <i class="fas fa-folder-open" style="font-size:32px;margin-bottom:10px;opacity:.25" aria-hidden="true"></i>
        <span style="font-weight:600;color:var(--c-text-secondary)">Không có hồ sơ phù hợp</span>
        <span style="font-size:12px;margin-top:6px;max-width:320px">Thử từ khóa khác hoặc đổi khoảng ngày khám.</span>
      </div>`;
      return;
    }
    if (list[0].benh_nhan) this._benhNhanId = this._idStr(list[0].benh_nhan);
    box.innerHTML = this._renderHsPickList(list);
  },

  _chonVaXemHoSo(hoSoId, benhNhanId) {
    this._hoSoXemChiTietTraCuu = true;
    this._refreshPatientStrip();
    this._loadChiTietHoSo(hoSoId, { traCuu: true });
  },

  _dongChiTietTraCuu() {
    this._hoSoXemChiTietTraCuu = false;
    const d = document.getElementById('bs-hs-detail');
    if (d) d.innerHTML = '';
    this._refreshPatientStrip();
  },

  _chonHoSo(hoSoId, benhNhanId) {
    this._hoSoId = hoSoId;
    if (benhNhanId) this._benhNhanId = this._idStr(benhNhanId);
  },

  async _loadChiTietHoSo(hoSoId, opts = {}) {
    const traCuu = !!opts.traCuu;
    const id = (hoSoId || '').trim();
    if (!id) return Toast.loi('Thiếu hồ sơ', '', 'error');
    const res = await Http.layDanhSach(`/benh-an/ho-so-benh-an/${id}/`);
    const d = document.getElementById('bs-hs-detail');
    if (!d) return;
    if (!res.ok || !res.data) {
      d.innerHTML = '<p class="text-danger">Không đọc được hồ sơ.</p>';
      return;
    }
    const h = res.data;

    if (traCuu) {
      this._hoSoXemChiTietTraCuu = true;
      const metaTiem = await this._layThongTinHoSoTiem(h);
      d.innerHTML = this._renderHoSoTomTatTraCuu(h, metaTiem);
      this._refreshPatientStrip();
      try {
        d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {
        d.scrollIntoView();
      }
      return;
    }

    this._hoSoXemChiTietTraCuu = false;
    this._hoSoId = id;
    if (h.benh_nhan && typeof h.benh_nhan === 'object') {
      this._benhNhanId = this._idStr(h.benh_nhan.id || h.benh_nhan);
      const nd = h.benh_nhan.nguoi_dung;
      this._benhNhanNguoiDungId =
        typeof nd === 'object' && nd && nd.id ? nd.id : nd || h.benh_nhan.nguoi_dung_id || null;
    } else if (h.benh_nhan) {
      this._benhNhanId = this._idStr(h.benh_nhan);
      this._benhNhanNguoiDungId = null;
    }
    await this._dongBoLichHenTuHoSo(id);
    this._setPatientSnapshotFromHoSo(h, this._lichHenId);
    this._refreshPatientStrip();
    d.innerHTML = this._renderHoSoTomTat(h);
  },

  /** Gắn đúng lịch hẹn với hồ sơ đang mở (tránh ID lịch cũ / nhầm BN sau khi tìm kiếm). */
  async _dongBoLichHenTuHoSo(hoSoId) {
    const lkRes = await Http.layDanhSach(
      `/lich-hen/lich-kham/?ho_so_benh_an=${encodeURIComponent(hoSoId)}`
    );
    let lhId = null;
    if (lkRes.ok && lkRes.data != null) {
      const raw = lkRes.data;
      const rows = Array.isArray(raw) ? raw : raw.results || [];
      const row = rows[0];
      if (row && row.lich_hen != null && row.lich_hen !== '') {
        lhId = typeof row.lich_hen === 'object' && row.lich_hen !== null ? row.lich_hen.id : row.lich_hen;
      }
    }
    this._lichHenId = lhId;
    if (lhId) {
      const lhRes = await Http.layDanhSach(`/lich-hen/lich-hen/${lhId}/`);
      if (lhRes.ok && lhRes.data) {
        this._loaiLichHen = lhRes.data.loai_lich || null;
        if (this._loaiLichHen === 'TIEM_CHUNG') {
          await this._napVaccineTuLichTiem(lhId);
        } else {
          this._vaccineLichHenId = null;
        }
      }
    } else {
      this._loaiLichHen = null;
      this._vaccineLichHenId = null;
    }
  },

  _fmtNgayKhamDisplay(s) {
    const t = (s == null ? '' : String(s)).trim();
    if (!t) return '—';
    return this._esc(t.replace('T', ' ').slice(0, 16));
  },

  _shortText(s, max) {
    const t = (s == null ? '' : String(s)).trim();
    if (!t) return '';
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  },

  _tomTatChanDoan(chan) {
    if (!chan) return '';
    if (typeof chan === 'string') return this._shortText(chan, 280);
    const o = chan;
    const parts = [
      o.mo_ta,
      o.mo_ta_chan_doan,
      o.benh_chinh,
      o.chan_doan_chinh,
      o.ma_icd10,
      o.icd10,
    ].filter((x) => x != null && String(x).trim() !== '');
    if (parts.length) return this._shortText(parts.map(String).join(' · '), 280);
    try {
      return this._shortText(JSON.stringify(chan), 280);
    } catch (e) {
      return '';
    }
  },

  _renderChanDoanDocHtml(chan) {
    if (!chan) {
      return '<p class="bs-hs-dd-muted small mb-0">Chưa có chẩn đoán trên hồ sơ này.</p>';
    }
    if (typeof chan === 'string') {
      return `<p class="small mb-0">${this._esc(chan)}</p>`;
    }
    const pairs = [
      ['Tên bệnh', chan.ten_benh],
      ['Mã ICD-10', chan.ma_icd10],
      ['Mô tả', chan.mo_ta],
      ['Kết luận', chan.ket_luan],
      ['Phương pháp điều trị', chan.phuong_phap_dieu_tri],
      ['Ghi chú', chan.ghi_chu],
    ].filter(([, v]) => v != null && String(v).trim() !== '');
    if (!pairs.length) {
      const fallback = this._tomTatChanDoan(chan);
      return fallback
        ? `<p class="small mb-0">${this._esc(fallback)}</p>`
        : '<p class="bs-hs-dd-muted small mb-0">Chưa có chẩn đoán.</p>';
    }
    return `<dl class="bs-hs-dl">${pairs
      .map(
        ([k, v]) =>
          `<dt>${this._esc(k)}</dt><dd>${this._esc(this._shortText(String(v), 800))}</dd>`
      )
      .join('')}</dl>`;
  },

  _renderToaThuocDocHtml(h) {
    const dons = Array.isArray(h.don_thuoc) ? h.don_thuoc : [];
    if (!dons.length) {
      return '<p class="bs-hs-dd-muted small mb-0">Chưa có toa thuốc trên hồ sơ này.</p>';
    }
    return dons
      .map((don) => {
        const ma = this._esc(don.ma_don || '');
        const chuan = don.chuan_doan ? this._esc(this._shortText(don.chuan_doan, 200)) : '';
        const cts = Array.isArray(don.chi_tiet) ? don.chi_tiet : [];
        const body = cts.length
          ? `<table class="table table-sm table-bordered mb-0 small"><thead><tr><th>Thuốc</th><th>SL</th><th>Liều / cách dùng</th></tr></thead><tbody>${cts
              .map((ct) => {
                const ten = this._esc(ct.ten_thuoc || ct.ten_thuoc_tu_do || '');
                const sl = ct.so_luong != null ? this._esc(String(ct.so_luong)) : '—';
                const lieu = (ct.lieu_dung || '').trim();
                const cach = (ct.cach_dung_display || ct.cach_dung || '').toString().trim();
                const thoi = (ct.thoi_diem_display || ct.thoi_diem || '').toString().trim();
                const cdRaw = [lieu, cach, thoi].filter(Boolean).join(' · ');
                return `<tr><td>${ten}</td><td>${sl}</td><td>${cdRaw ? this._esc(cdRaw) : '—'}</td></tr>`;
              })
              .join('')}</tbody></table>`
          : '<p class="text-muted small mb-0">Đơn chưa có dòng thuốc.</p>';
        return `<div class="bs-hs-toa-block"><div class="small fw-semibold mb-1">Toa ${ma}${chuan ? ` <span class="text-muted fw-normal">— ${chuan}</span>` : ''}</div>${body}</div>`;
      })
      .join('');
  },

  _renderHoSoTomTatTraCuu(h, metaTiem) {
    const meta = metaTiem || { isTiemChung: false };
    const bn = typeof h.benh_nhan === 'object' ? h.benh_nhan : null;
    const tenBn = (bn && (bn.ho_ten || bn.nguoi_dung?.ho_ten)) || h.ten_benh_nhan || '';
    const maBn = (bn && bn.ma_benh_nhan) || h.ma_benh_nhan || '';
    const sdt = (bn && (bn.so_dien_thoai || bn.nguoi_dung?.so_dien_thoai)) || '';
    const initial = this._esc(((tenBn || '?').trim().charAt(0) || '?').toUpperCase());
    const ngayStr = this._fmtNgayKhamDisplay(h.ngay_kham);
    const chips = [];
    if (maBn) chips.push(`<span class="bs-hs-chip">Mã BN · ${this._esc(maBn)}</span>`);
    if (sdt) chips.push(`<span class="bs-hs-chip">ĐT · ${this._esc(sdt)}</span>`);
    if (bn && (bn.ngay_sinh || bn.gioi_tinh)) {
      chips.push(
        `<span class="bs-hs-chip">${this._esc([bn.ngay_sinh, bn.gioi_tinh].filter(Boolean).join(' · '))}</span>`
      );
    }
    const badgeLoai = meta.isTiemChung
      ? '<span class="bs-hs-badge-readonly" style="background:#cffafe;color:#0e7490">Tiêm chủng</span>'
      : '<span class="bs-hs-badge-readonly">Chỉ xem — tra cứu</span>';

    const bodyTiem = meta.isTiemChung
      ? `<section class="bs-hs-readonly-section">
            <h4 class="bs-hs-readonly-title"><i class="fas fa-syringe"></i> Tiêm chủng</h4>
            ${this._renderTiemChungDocHtml(meta, h)}
          </section>`
      : `<section class="bs-hs-readonly-section">
            <h4 class="bs-hs-readonly-title">Chẩn đoán</h4>
            ${this._renderChanDoanDocHtml(h.chan_doan)}
          </section>
          <section class="bs-hs-readonly-section">
            <h4 class="bs-hs-readonly-title">Toa thuốc đã kê</h4>
            ${this._renderToaThuocDocHtml(h)}
          </section>`;

    return `
      <div class="bs-hs-detail bs-hs-detail--readonly">
        <div class="bs-hs-detail-head">
          <div class="bs-hs-detail-identity">
            <div class="bs-hs-detail-avatar" aria-hidden="true">${initial}</div>
            <div class="bs-hs-detail-meta">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="bs-hs-detail-ma">${this._esc(h.ma_hs || '')}</div>
                ${badgeLoai}
              </div>
              <div class="bs-hs-detail-name">${this._esc(tenBn || '—')}</div>
              <div class="bs-hs-detail-chips">${chips.join('')}</div>
              <div class="text-muted small mt-1">Ngày khám: ${ngayStr}</div>
            </div>
          </div>
          <div class="bs-hs-detail-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBacSiDashboard._dongChiTietTraCuu()">Tắt</button>
          </div>
        </div>
        <div class="bs-hs-detail-body">${bodyTiem}</div>
      </div>`;
  },

  _renderHoSoTomTat(h) {
    const bn = typeof h.benh_nhan === 'object' ? h.benh_nhan : null;
    const tenBn = (bn && (bn.ho_ten || bn.nguoi_dung?.ho_ten)) || h.ten_benh_nhan || '';
    const maBn = (bn && bn.ma_benh_nhan) || h.ma_benh_nhan || '';
    const sdt = (bn && (bn.so_dien_thoai || bn.nguoi_dung?.so_dien_thoai)) || '';
    const chanLine = this._tomTatChanDoan(h.chan_doan);
    const donN = Array.isArray(h.don_thuoc) ? h.don_thuoc.length : 0;
    const initial = this._esc(((tenBn || '?').trim().charAt(0) || '?').toUpperCase());
    const ngayStr = this._fmtNgayKhamDisplay(h.ngay_kham);
    const chips = [];
    if (maBn) chips.push(`<span class="bs-hs-chip">Mã BN · ${this._esc(maBn)}</span>`);
    if (sdt) chips.push(`<span class="bs-hs-chip">Điện thoại · ${this._esc(sdt)}</span>`);
    if (bn && (bn.ngay_sinh || bn.gioi_tinh)) {
      chips.push(
        `<span class="bs-hs-chip">${this._esc([bn.ngay_sinh, bn.gioi_tinh].filter(Boolean).join(' · '))}</span>`
      );
    }

    return `
      <div class="bs-hs-detail">
        <div class="bs-hs-detail-head">
          <div class="bs-hs-detail-identity">
            <div class="bs-hs-detail-avatar" aria-hidden="true">${initial}</div>
            <div class="bs-hs-detail-meta">
              <div class="bs-hs-detail-ma">${this._esc(h.ma_hs || '')}</div>
              <div class="bs-hs-detail-name">${this._esc(tenBn || '—')}</div>
              <div class="bs-hs-detail-chips">${chips.join('')}</div>
            </div>
          </div>
          <div class="bs-hs-detail-actions">
            <button type="button" class="btn btn-primary" onclick="PageBacSiDashboard._chuyenNhapChanDoan()">Nhập chẩn đoán</button>
            <button type="button" class="btn btn-outline-primary" onclick="PageBacSiDashboard.chuyenTrang('don-thuoc')">Kê đơn</button>
            <button type="button" class="btn btn-outline-primary" onclick="PageBacSiDashboard.chuyenTrang('chi-dinh')">Tiêm chủng</button>
            <button type="button" class="btn btn-outline-danger" onclick="PageBacSiDashboard._hoanTatKham()">Hoàn tất khám</button>
          </div>
        </div>
        <div class="bs-hs-detail-body">
          <dl class="bs-hs-dl">
            <dt>Ngày khám</dt><dd>${ngayStr}</dd>
            <dt>Lý do khám</dt><dd>${this._esc(this._shortText(h.ly_do_kham, 400) || '—')}</dd>
            <dt>Triệu chứng</dt><dd>${this._esc(this._shortText(h.trieu_chung, 400) || '—')}</dd>
            <dt>KQ khám lâm sàng</dt><dd>${this._esc(this._shortText(h.ket_qua_kham_lam_sang, 400) || '—')}</dd>
            <dt>Chẩn đoán</dt><dd>${chanLine ? this._esc(chanLine) : '<span class="bs-hs-dd-muted">Chưa ghi chẩn đoán</span>'}</dd>
            <dt>Đơn thuốc</dt><dd>${donN ? `${donN} đơn` : '<span class="bs-hs-dd-muted">Chưa có</span>'}</dd>
          </dl>
          ${bn && bn.dia_chi ? `<div class="bs-hs-detail-footer"><strong>Địa chỉ</strong> — ${this._esc(this._shortText(bn.dia_chi, 300))}</div>` : ''}
        </div>
      </div>`;
  },

  async _chuyenNhapChanDoan() {
    if (!this._hoSoId) {
      Toast.loi('Chưa mở hồ sơ', '', 'error');
      return;
    }
    await this.chuyenTrang('chan-doan');
  },

  async _formChanDoan(host) {
    const hid = this._esc(this._hoSoId || '');
    const ps = this._patientSnapshot;
    const hasHoSo = !!this._hoSoId;
    const hdr =
      ps && ps.tenBn
        ? `<p class="small fw-semibold text-primary mb-2">${this._esc(ps.tenBn)} — Mã BN ${this._esc(ps.maBn)} — HS ${this._esc(ps.maHs)}</p>`
        : '';
    const khoiTimKiem =
      hasHoSo && hid
        ? `<div class="alert alert-light border py-2 mb-3 small mb-2">
            <div class="mt-1">Mã hồ sơ: <code id="bs-cd-hsid" class="user-select-all">${hid}</code>
            ${ps?.maBn ? ` — Mã BN: <strong>${this._esc(ps.maBn)}</strong>` : ''}
            </div>
            <input type="hidden" id="cd-hsid-fixed" value="${this._esc(this._hoSoId)}" />
            <details class="mb-3"><summary class="small text-muted" style="cursor:pointer">Tìm hồ sơ bệnh nhân khác (đổi BN)</summary>
              <div class="pt-2">
                <label class="small">Mã BN, tên hoặc SĐT</label>
                <div class="input-group input-group-sm mb-2">
                  <input id="cd-q" class="form-control" placeholder="Tìm..."/>
                  <button type="button" class="btn btn-outline-primary" onclick="PageBacSiDashboard._cdTimHoSo()">Tải</button>
                </div>
                <label class="small">Chọn lần khám</label>
                <select id="cd-hsid" class="form-control form-control-sm"></select>
              </div>
            </details>`
        : `<p class="small text-muted mb-2">Chưa có hồ sơ — mở từ <strong>Tổng quan</strong> hoặc tìm bên dưới. Hồ sơ: <code id="bs-cd-hsid">${hid || '—'}</code></p>
            <div class="mb-2">
              <label class="small">Tìm hồ sơ (mã BN, tên, SĐT)</label>
              <div class="input-group input-group-sm">
                <input id="cd-q" class="form-control" placeholder="Mã BN, tên, SĐT"/>
                <button type="button" class="btn btn-outline-primary" onclick="PageBacSiDashboard._cdTimHoSo()">Tải hồ sơ</button>
              </div>
            </div>
            <div class="mb-2">
              <label class="small">Hồ sơ lần khám</label>
              <select id="cd-hsid" class="form-control form-control-sm"></select>
            </div>`;
    UI.render(host, `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;align-items:start">
        <div class="card">
          <div class="card-header"><div class="card-title">Lịch đã check-in (hôm nay)</div></div>
          <div class="card-body" id="bs-cd-lich"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Chẩn đoán (gắn lần khám hiện tại)</div></div>
          <div class="card-body">
            ${hdr}
            ${khoiTimKiem}
            <label class="small">Triệu chứng</label>
            <textarea id="cd-tc" class="form-control form-control-sm mb-2" rows="2" placeholder="Triệu chứng"></textarea>
            <label class="small">Kết quả khám lâm sàng</label>
            <textarea id="cd-kqls" class="form-control form-control-sm mb-2" rows="2" placeholder="Kết quả khám lâm sàng"></textarea>
            <label class="small">Mã ICD-10 (tuỳ chọn)</label>
            <input id="cd-icd" class="form-control form-control-sm mb-2" placeholder="VD: J00"/>
            <label class="small">Tên bệnh</label>
            <input id="cd-ten" class="form-control form-control-sm mb-2" placeholder="Bắt buộc"/>
            <label class="small">Mô tả</label>
            <textarea id="cd-mo" class="form-control form-control-sm mb-2" rows="2"></textarea>
            <label class="small">Kết luận</label>
            <textarea id="cd-kl" class="form-control form-control-sm mb-2" rows="2"></textarea>
            <button type="button" class="btn btn-primary" onclick="PageBacSiDashboard._guiChanDoan()">Lưu chẩn đoán</button>
            <div id="bs-cd-next" class="mt-3 pt-3 border-top" style="display:none">
              <div class="small text-muted mb-2">Thao tác tiếp theo</div>
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-success" onclick="PageBacSiDashboard.chuyenTrang('don-thuoc')">Kê đơn thuốc</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBacSiDashboard._boQuaKeDon()">Không kê đơn</button>
              </div>
            </div>
            <pre id="cd-out" class="mt-3 small text-muted" style="white-space:pre-wrap"></pre>
          </div>
        </div>
      </div>`);
    await this._cdLoadLichCheckIn();
    await this._cdSyncSelectHoSo();
  },

  async _cdLoadLichCheckIn() {
    const el = document.getElementById('bs-cd-lich');
    if (!el) return;
    const res = await Http.layDanhSach('/lich-hen/lich-hen/dieu_phoi_hom_nay/');
    const results = (res.data && res.data.results) || [];
    el.innerHTML = res.ok && results.length
      ? `<ul class="list-group list-group-flush small">${results
          .map(
            (l) => `<li class="list-group-item px-0 d-flex justify-content-between gap-2 align-items-start">
          <span>${this._esc(l.ten_benh_nhan)} — <span class="text-muted">${this._esc(l.ma_benh_nhan)}</span><br/><span class="text-muted">STT ${this._esc(String(l.stt_trong_ngay ?? '—'))}</span></span>
          <button type="button" class="btn btn-sm btn-primary" onclick="PageBacSiDashboard._moHoSoTuLichChanDoan('${l.id}')">Mở hồ sơ</button>
        </li>`
          )
          .join('')}</ul>`
      : '<p class="text-muted small mb-0">Không có lịch check-in.</p>';
  },

  async _moHoSoTuLichChanDoan(lichId) {
    await this._moHoSoTuLich(lichId);
    await this.chuyenTrang('chan-doan');
    await this._cdSyncSelectHoSo();
  },

  async _cdTimHoSo() {
    const q = document.getElementById('cd-q')?.value?.trim();
    if (!q) return Toast.loi('Nhập mã BN, tên hoặc SĐT', '', 'error');
    const { ok, list } = await this._dsHoSoTimKiem(q);
    const sel = document.getElementById('cd-hsid');
    if (!sel) return;
    if (!ok || !list.length) {
      sel.innerHTML = '<option value="">Không có hồ sơ</option>';
      return Toast.loi('Không tìm thấy hồ sơ', '', 'error');
    }
    if (list[0].benh_nhan) this._benhNhanId = this._idStr(list[0].benh_nhan);
    sel.innerHTML = list
      .map(
        (h) =>
          `<option value="${this._esc(h.id)}">${this._esc(h.ma_hs)} — ${this._esc((h.ngay_kham || '').toString().slice(0, 16))}</option>`
      )
      .join('');
    sel.value = list[0].id;
    this._hoSoId = list[0].id;
    const hsl = document.getElementById('bs-cd-hsid');
    if (hsl) hsl.textContent = this._hoSoId;
    const fx = document.getElementById('cd-hsid-fixed');
    if (fx) fx.value = this._hoSoId;
    await this._cdFillTuHoSo();
  },

  async _cdSyncSelectHoSo() {
    this._benhNhanId = this._idStr(this._benhNhanId);
    const bnId = this._benhNhanId;
    const sel = document.getElementById('cd-hsid');
    if (!sel) return;

    const bindChange = () => {
      sel.onchange = () => {
        this._hoSoId = sel.value || null;
        const hsl = document.getElementById('bs-cd-hsid');
        if (hsl) hsl.textContent = this._hoSoId || '—';
        const fx = document.getElementById('cd-hsid-fixed');
        if (fx && this._hoSoId) fx.value = this._hoSoId;
        this._cdFillTuHoSo();
      };
    };

    if (!bnId && this._hoSoId) {
      sel.innerHTML = `<option value="${this._esc(this._hoSoId)}">Hồ sơ đang mở</option>`;
      sel.value = this._hoSoId;
      bindChange();
      const hsl = document.getElementById('bs-cd-hsid');
      if (hsl) hsl.textContent = this._hoSoId || '—';
      await this._cdFillTuHoSo();
      return;
    }

    if (!bnId) {
      sel.innerHTML = '<option value="">— Chọn hồ sơ —</option>';
      bindChange();
      return;
    }

    const res = await Http.layDanhSach(
      `/benh-an/ho-so-benh-an/?benh_nhan=${encodeURIComponent(bnId)}&ordering=-ngay_kham&page_size=50`
    );
    const rows = (res.data && res.data.results) || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    sel.innerHTML =
      '<option value="">— Chọn —</option>' +
      list.map((h) => `<option value="${h.id}">${this._esc(h.ma_hs)} — ${this._esc((h.ngay_kham || '').toString().slice(0, 16))}</option>`).join('');
    if (this._hoSoId) {
      sel.value = this._hoSoId;
      if (sel.value !== this._hoSoId) sel.appendChild(new Option(`Hồ sơ ${this._hoSoId}`, this._hoSoId, true, true));
    }
    bindChange();
    const hsl2 = document.getElementById('bs-cd-hsid');
    if (hsl2) hsl2.textContent = this._hoSoId || '—';
    await this._cdFillTuHoSo();
  },

  async _cdFillTuHoSo() {
    if (!this._hoSoId) return;
    const res = await Http.layDanhSach(`/benh-an/ho-so-benh-an/${this._hoSoId}/`);
    if (!res.ok || !res.data) return;
    const h = res.data;
    this._setPatientSnapshotFromHoSo(h, this._lichHenId);
    this._refreshPatientStrip();
    const cd = h.chan_doan;
    const tc = document.getElementById('cd-tc');
    const kqls = document.getElementById('cd-kqls');
    const icd = document.getElementById('cd-icd');
    const ten = document.getElementById('cd-ten');
    const mo = document.getElementById('cd-mo');
    const kl = document.getElementById('cd-kl');
    if (tc) tc.value = h.trieu_chung || '';
    if (kqls) kqls.value = h.ket_qua_kham_lam_sang || '';
    if (cd) {
      if (icd) icd.value = cd.ma_icd10 || '';
      if (ten) ten.value = cd.ten_benh || '';
      if (mo) mo.value = cd.mo_ta || '';
      if (kl) kl.value = cd.ket_luan || '';
      const nx = document.getElementById('bs-cd-next');
      if (nx && (cd.ten_benh || '').trim()) nx.style.display = 'block';
    }
  },

  async _guiChanDoan() {
    const fixed = document.getElementById('cd-hsid-fixed');
    const sel = document.getElementById('cd-hsid');
    let hoSoId = (fixed?.value || sel?.value || '').trim() || this._hoSoId;
    if (!hoSoId) return Toast.loi('Chưa chọn hồ sơ lần khám', '', 'error');
    this._hoSoId = hoSoId;
    const body = {
      trieu_chung: document.getElementById('cd-tc')?.value ?? '',
      ket_qua_kham_lam_sang: document.getElementById('cd-kqls')?.value ?? '',
      ma_icd10: (document.getElementById('cd-icd')?.value || '').trim(),
      ten_benh: (document.getElementById('cd-ten')?.value || '').trim(),
      mo_ta: (document.getElementById('cd-mo')?.value || '').trim() || '—',
      ket_luan: (document.getElementById('cd-kl')?.value || '').trim() || '—',
    };
    if (!body.ten_benh) return Toast.loi('Nhập tên bệnh', '', 'error');
    const res = await Http.tao(`/benh-an/ho-so-benh-an/${hoSoId}/nhap_chan_doan/`, body);
    const out = document.getElementById('cd-out');
    //if (out) out.textContent = res.ok ? JSON.stringify(res.data, null, 2) : JSON.stringify(res.data || {}, null, 2);
    if (res.ok) {
      Toast.hien('Đã lưu', 'Chẩn đoán đã ghi vào hồ sơ lần khám', 'success');
      this._chanDoanDaLuu = true;
      if (res.data && res.data.ho_so) this._setPatientSnapshotFromHoSo(res.data.ho_so, this._lichHenId);
      this._refreshPatientStrip();
      const nx = document.getElementById('bs-cd-next');
      if (nx) nx.style.display = 'block';
      if (this._hoSoId) await this._loadChiTietHoSo(this._hoSoId, { traCuu: false });
    } else Toast.loi('Lỗi lưu', (res.data && (res.data.detail || res.data.error)) || '', 'error');
  },

  _dtLines: [],
  _dtLastList: [],
  _dtPendingThuoc: null,

  async _boQuaKeDon() {
    if (!this._hoSoId) {
      Toast.loi('Chưa có hồ sơ lần khám', 'Mở hồ sơ từ lịch hoặc chẩn đoán trước.', 'error');
      return;
    }
    const ok = confirm(
      'Không kê đơn thuốc cho lần khám này?\n\nBạn vẫn có thể bấm Hoàn tất khám khi xong.'
    );
    if (!ok) return;
    Toast.hien('Đã bỏ qua kê đơn', 'Không tạo toa thuốc cho lần khám này.', 'success');
    if (this._hoSoId) {
      await this.chuyenTrang('ho-so');
      await this._loadChiTietHoSo(this._hoSoId, { traCuu: false });
    }
  },

  async _formDonThuoc(host) {
    const hs = this._esc(this._hoSoId || '');
    const ps = this._patientSnapshot;
    const bnLine = ps
      ? `${this._esc(ps.tenBn)} — Mã BN ${this._esc(ps.maBn)} — HS ${this._esc(ps.maHs)}`
      : '—';
    this._dtLines = [];
    this._dtPendingThuoc = null;
    UI.render(host, `
      <div class="bs-dt-page">
        <div class="bs-dt-hero">
          <div class="bs-dt-hero-icon" aria-hidden="true"><i class="fas fa-prescription-bottle-alt"></i></div>
          <div>
            <h2 class="bs-dt-hero-title">Kê đơn thuốc</h2>
            <p class="bs-dt-hero-sub">Thêm thuốc trong kho hoặc mua ngoài — có thể bỏ qua nếu không cần kê toa.</p>
          </div>
        </div>
        <div class="bs-dt-grid">
          <aside class="bs-dt-aside card">
            <div class="card-body">
              <div class="bs-dt-patient-name">${bnLine}</div>
              <p class="bs-dt-meta">Hồ sơ <code id="dt-hs-lbl">${hs || '—'}</code></p>
              <input id="dt-hs" type="hidden" value="${hs}"/>
              <div id="dt-cd-banner" class="bs-dt-banner bs-dt-banner--warn" style="display:none"></div>
              <label class="bs-dt-label" for="dt-chuan">Chẩn đoán trên toa</label>
              <input id="dt-chuan" class="form-control bs-dt-input" placeholder="Tóm tắt hiển thị trên đơn thuốc"/>
              <button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-3" onclick="PageBacSiDashboard._boQuaKeDon()">
                <i class="fas fa-forward"></i> Không kê đơn thuốc
              </button>
            </div>
          </aside>
          <div class="bs-dt-main">
            <section class="bs-dt-panel card">
              <div class="card-header bs-dt-panel-head"><i class="fas fa-search"></i> Tìm thuốc trong danh mục</div>
              <div class="card-body">
                <div class="bs-dt-search-row">
                  <input id="dt-tim-thuoc" class="form-control" placeholder="Tên hoặc mã thuốc…"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();PageBacSiDashboard._dtTimThuoc();}"/>
                  <button type="button" class="btn btn-primary" onclick="PageBacSiDashboard._dtTimThuoc()">Tìm</button>
                </div>
                <div id="dt-kq-tim" class="bs-dt-search-results"></div>
                <div id="dt-them-form" class="bs-dt-add-form" style="display:none"></div>
              </div>
            </section>
            <section class="bs-dt-panel card">
              <div class="card-header bs-dt-panel-head"><i class="fas fa-store"></i> Thuốc mua ngoài</div>
              <div class="card-body">
                <div class="bs-dt-ngoai-grid">
                  <input id="dt-ngoai-ten" class="form-control" placeholder="Tên thuốc"/>
                  <input id="dt-ngoai-sl" type="number" min="1" class="form-control" placeholder="SL"/>
                  <input id="dt-ngoai-lieu" class="form-control" placeholder="Liều (VD: 1 viên)"/>
                  <input id="dt-ngoai-cach" class="form-control" placeholder="Cách dùng / ghi chú"/>
                </div>
                <button type="button" class="btn btn-outline-primary btn-sm mt-2" onclick="PageBacSiDashboard._dtThemNgoai()">
                  <i class="fas fa-plus"></i> Thêm vào toa
                </button>
              </div>
            </section>
            <section class="bs-dt-panel card">
              <div class="card-header bs-dt-panel-head d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span><i class="fas fa-list"></i> Toa đang soạn</span>
                <span id="dt-count" class="bs-dt-count">0 thuốc</span>
              </div>
              <div class="card-body p-0">
                <div id="dt-bang" class="bs-dt-table-wrap"><p class="text-muted small p-3 mb-0">Chưa có thuốc — tìm trong danh mục hoặc thêm mua ngoài.</p></div>
              </div>
            </section>
            <div class="bs-dt-actions">
              <button type="button" class="btn btn-outline-secondary" onclick="PageBacSiDashboard._boQuaKeDon()">Không kê đơn</button>
              <button type="button" class="btn btn-primary bs-dt-btn-save" onclick="PageBacSiDashboard._guiDonThuoc()">
                <i class="fas fa-save"></i> Lưu toa thuốc
              </button>
            </div>
          </div>
        </div>
      </div>`);
    await this._dtLoadChanDoanTuHoSo();
  },

  async _dtLoadChanDoanTuHoSo() {
    const id = document.getElementById('dt-hs')?.value?.trim() || this._hoSoId;
    const banner = document.getElementById('dt-cd-banner');
    const chuan = document.getElementById('dt-chuan');
    if (!id) {
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML =
          '<i class="fas fa-info-circle"></i> Chưa chọn hồ sơ — mở từ <strong>Lịch hôm nay</strong> hoặc lưu chẩn đoán trước.';
      }
      return;
    }
    const res = await Http.layDanhSach(`/benh-an/ho-so-benh-an/${id}/`);
    if (!res.ok || !res.data) return;
    const h = res.data;
    const cd = h.chan_doan;
    if (chuan) {
      const ten = cd && cd.ten_benh ? cd.ten_benh : '';
      const kl = cd && cd.ket_luan ? cd.ket_luan : '';
      chuan.value = (chuan.value || '').trim() || [ten, kl].filter(Boolean).join(' — ');
    }
    if (banner) {
      if (cd && (cd.ten_benh || cd.ket_luan)) {
        banner.className = 'bs-dt-banner bs-dt-banner--ok';
        banner.style.display = 'block';
        banner.innerHTML = `<i class="fas fa-check-circle"></i> Đã có chẩn đoán: <strong>${this._esc(cd.ten_benh || '')}</strong>${cd.ma_icd10 ? ` (${this._esc(cd.ma_icd10)})` : ''}`;
      } else {
        banner.className = 'bs-dt-banner bs-dt-banner--warn';
        banner.style.display = 'block';
        banner.innerHTML =
          '<i class="fas fa-exclamation-triangle"></i> Chưa ghi chẩn đoán — nên lưu chẩn đoán trước hoặc bấm <strong>Không kê đơn</strong>.';
      }
    }
  },

  async _dtTimThuoc() {
    const q = document.getElementById('dt-tim-thuoc')?.value?.trim();
    const box = document.getElementById('dt-kq-tim');
    const formEl = document.getElementById('dt-them-form');
    if (formEl) {
      formEl.style.display = 'none';
      formEl.innerHTML = '';
    }
    this._dtPendingThuoc = null;
    if (!q || !box) return;
    box.innerHTML = '<p class="text-muted small mb-0"><span class="spinner-border spinner-border-sm"></span> Đang tìm…</p>';
    const res = await Http.layDanhSach(`/thuoc/thuoc/?search=${encodeURIComponent(q)}&page_size=15`);
    const rows = res.data?.results || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    if (!res.ok || !list.length) {
      box.innerHTML =
        '<p class="bs-dt-empty-hint"><i class="fas fa-info-circle"></i> Không tìm thấy — thử từ khóa khác hoặc thêm <strong>thuốc mua ngoài</strong>.</p>';
      return;
    }
    this._dtLastList = list;
    box.innerHTML = `<div class="bs-dt-pick-list">${list
      .map(
        (t, i) => `<button type="button" class="bs-dt-pick-item" onclick="PageBacSiDashboard._dtMoFormThem(${i})">
          <span class="bs-dt-pick-name">${this._esc(t.ten_thuoc)}</span>
          <span class="bs-dt-pick-code">${this._esc(t.ma_thuoc || '')}</span>
        </button>`
      )
      .join('')}</div>`;
  },

  _dtMoFormThem(i) {
    const t = this._dtLastList[i];
    if (!t) return;
    this._dtPendingThuoc = t;
    const formEl = document.getElementById('dt-them-form');
    if (!formEl) return;
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="bs-dt-add-form-inner">
        <div class="bs-dt-add-form-title">Thêm: <strong>${this._esc(t.ten_thuoc)}</strong></div>
        <div class="bs-dt-add-fields">
          <div><label class="bs-dt-label">Số lượng</label><input id="dt-add-sl" type="number" min="1" class="form-control" value="10"/></div>
          <div><label class="bs-dt-label">Liều dùng</label><input id="dt-add-lieu" class="form-control" value="1 viên"/></div>
          <div><label class="bs-dt-label">Cách dùng / ghi chú</label><input id="dt-add-cach" class="form-control" value="Sáng, sau ăn"/></div>
        </div>
        <div class="bs-dt-add-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBacSiDashboard._dtDongFormThem()">Hủy</button>
          <button type="button" class="btn btn-sm btn-primary" onclick="PageBacSiDashboard._dtXacNhanThem()"><i class="fas fa-plus"></i> Thêm vào toa</button>
        </div>
      </div>`;
    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _dtDongFormThem() {
    this._dtPendingThuoc = null;
    const formEl = document.getElementById('dt-them-form');
    if (formEl) {
      formEl.style.display = 'none';
      formEl.innerHTML = '';
    }
  },

  _dtXacNhanThem() {
    const t = this._dtPendingThuoc;
    if (!t) return;
    const sl = parseInt(document.getElementById('dt-add-sl')?.value || '0', 10);
    const lieu = document.getElementById('dt-add-lieu')?.value?.trim() || '1 viên';
    const cach = document.getElementById('dt-add-cach')?.value?.trim() || '';
    if (!sl || sl < 1) return Toast.loi('Nhập số lượng hợp lệ', '', 'error');
    this._dtLines.push({
      loai: 'trong_kho',
      thuoc: t.id,
      ten: t.ten_thuoc,
      so_luong: sl,
      lieu_dung: lieu,
      cach_dung: 'UONG',
      thoi_diem: 'SANG',
      so_ngay_dung: 5,
      tan_suat: cach,
    });
    this._dtDongFormThem();
    this._dtVeBang();
    Toast.hien('Đã thêm', t.ten_thuoc, 'success');
  },

  _dtThemNgoai() {
    const ten = document.getElementById('dt-ngoai-ten')?.value?.trim();
    const sl = parseInt(document.getElementById('dt-ngoai-sl')?.value || '0', 10);
    const lieu = document.getElementById('dt-ngoai-lieu')?.value?.trim() || '—';
    const cach = document.getElementById('dt-ngoai-cach')?.value?.trim() || '';
    if (!ten || sl < 1) return Toast.loi('Nhập tên thuốc và số lượng', '', 'error');
    this._dtLines.push({
      loai: 'ngoai',
      la_thuoc_mua_ngoai: true,
      ten_thuoc_tu_do: ten,
      so_luong: sl,
      lieu_dung: lieu,
      cach_dung: 'UONG',
      thoi_diem: 'SANG',
      so_ngay_dung: 5,
      tan_suat: cach,
    });
    document.getElementById('dt-ngoai-ten').value = '';
    document.getElementById('dt-ngoai-sl').value = '';
    document.getElementById('dt-ngoai-lieu').value = '';
    document.getElementById('dt-ngoai-cach').value = '';
    this._dtVeBang();
  },

  _dtXoa(i) {
    this._dtLines.splice(i, 1);
    this._dtVeBang();
  },

  _dtVeBang() {
    const el = document.getElementById('dt-bang');
    const cnt = document.getElementById('dt-count');
    if (cnt) cnt.textContent = `${this._dtLines.length} thuốc`;
    if (!el) return;
    if (!this._dtLines.length) {
      el.innerHTML =
        '<p class="text-muted small p-3 mb-0">Chưa có thuốc — tìm trong danh mục hoặc thêm mua ngoài.</p>';
      return;
    }
    el.innerHTML = `<table class="table bs-dt-table mb-0"><thead><tr>
      <th>Loại</th><th>Tên thuốc</th><th class="text-center">SL</th><th>Liều</th><th>Cách dùng</th><th></th>
    </tr></thead><tbody>
      ${this._dtLines
        .map((r, i) => {
          const loai =
            r.loai === 'ngoai'
              ? '<span class="bs-dt-badge bs-dt-badge--ngoai">Mua ngoài</span>'
              : '<span class="bs-dt-badge bs-dt-badge--kho">Trong kho</span>';
          const ten = r.loai === 'ngoai' ? r.ten_thuoc_tu_do : r.ten;
          return `<tr>
            <td>${loai}</td>
            <td class="fw-semibold">${this._esc(ten)}</td>
            <td class="text-center">${r.so_luong}</td>
            <td>${this._esc(r.lieu_dung)}</td>
            <td class="small text-muted">${this._esc(r.tan_suat || '—')}</td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger" onclick="PageBacSiDashboard._dtXoa(${i})" title="Xóa"><i class="fas fa-trash-alt"></i></button></td>
          </tr>`;
        })
        .join('')}
    </tbody></table>`;
  },

  async _guiDonThuoc() {
    let id = document.getElementById('dt-hs')?.value?.trim() || this._hoSoId;
    if (!id) return Toast.loi('Chưa có hồ sơ — mở từ lịch hoặc Hồ sơ BN', '', 'error');
    if (!this._dtLines.length) return Toast.loi('Chưa có thuốc trên toa', '', 'error');
    const chuan_doan = document.getElementById('dt-chuan')?.value?.trim() || '';
    const chi_tiet = this._dtLines.map((r) => {
      if (r.loai === 'ngoai') {
        return {
          la_thuoc_mua_ngoai: true,
          ten_thuoc_tu_do: r.ten_thuoc_tu_do,
          so_luong: r.so_luong,
          lieu_dung: r.lieu_dung,
          cach_dung: r.cach_dung,
          thoi_diem: r.thoi_diem,
          so_ngay_dung: r.so_ngay_dung,
          tan_suat: r.tan_suat,
        };
      }
      return {
        thuoc: r.thuoc,
        so_luong: r.so_luong,
        lieu_dung: r.lieu_dung,
        cach_dung: r.cach_dung,
        thoi_diem: r.thoi_diem,
        so_ngay_dung: r.so_ngay_dung,
        tan_suat: r.tan_suat,
      };
    });
    const res = await Http.tao(`/benh-an/ho-so-benh-an/${id}/tao_don_thuoc/`, { chuan_doan, chi_tiet });
    if (res.ok) {
      Toast.hien('Đã tạo toa', res.data?.ma_don ? `Mã: ${res.data.ma_don}` : '', 'success');
      this._dtLines = [];
      this._dtVeBang();
      if (this._hoSoId) await this._loadChiTietHoSo(this._hoSoId, { traCuu: false });
    } else Toast.loi('Không tạo được toa', (res.data && (res.data.detail || JSON.stringify(res.data))) || '', 'error');
  },

  async _chiDinh(host) {
    const hs = this._esc(this._hoSoId || '');
    const ps = this._patientSnapshot;
    const ngayMacDinh = this._formatDateYMD(new Date());
    const showHuyTiem = this._loaiLichHen === 'TIEM_CHUNG' && !!this._lichHenId;
    const bnLine = ps
      ? `<p class="small fw-semibold text-primary mb-2">${this._esc(ps.tenBn)} — Mã BN ${this._esc(ps.maBn)} — HS ${this._esc(ps.maHs)}</p>`
      : '';
    const alertLich = this._loaiLichHen === 'TIEM_CHUNG'
      ? `<div class="alert alert-info py-2 small mb-3"><i class="fas fa-syringe"></i> Lịch hẹn <strong>tiêm chủng</strong> — chọn vaccine (đã gợi ý từ lịch), bấm lưu để ghi hồ sơ, <strong>trừ 1 liều tồn kho</strong> (lô còn hạn, nhập trước) và kết thúc lịch. Nếu bệnh nhân <strong>không đạt yêu cầu</strong>, bấm <strong>Huỷ tiêm</strong> (không trừ kho).</div>`
      : !hs
        ? '<div class="alert alert-warning py-2 small mb-3">Chưa có hồ sơ — mở từ <strong>Lịch hôm nay</strong> hoặc hàng chờ check-in trước.</div>'
        : '';
    const btnLuu = this._loaiLichHen === 'TIEM_CHUNG'
      ? 'Lưu tiêm chủng &amp; hoàn tất lịch'
      : 'Lưu tiêm chủng vào hồ sơ';
    UI.render(host, `
      <div class="card"><div class="card-header"><div class="card-title">Tiêm chủng</div></div><div class="card-body">
        ${bnLine}
        ${alertLich}
        <p class="small text-muted mb-2">Hồ sơ: <code>${hs || '—'}</code></p>
        <input id="ti-hs" type="hidden" value="${hs}"/>
        <label class="small fw-semibold">Vaccine</label>
        <select id="ti-vc" class="form-control mb-2"></select>
        <label class="small fw-semibold">Ngày tiêm</label>
        <input id="ti-ngay" class="form-control mb-2" type="date" value="${this._esc(ngayMacDinh)}"/>
        <label class="small fw-semibold" for="ti-ghi-chu">Ghi chú tiêm chủng</label>
        <textarea id="ti-ghi-chu" class="form-control mb-3" rows="3" placeholder="Ghi chú sau khám / sau tiêm…"></textarea>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button type="button" class="btn btn-primary" onclick="PageBacSiDashboard._guiTiem()">${btnLuu}</button>
          ${showHuyTiem ? `<button type="button" class="btn btn-outline-danger" onclick="PageBacSiDashboard._huyTiemChungKhongDat()"><i class="fas fa-ban"></i> Huỷ tiêm — không đạt yêu cầu</button>` : ''}
          ${this._loaiLichHen === 'TIEM_CHUNG' ? '' : '<button type="button" class="btn btn-outline-secondary" onclick="PageBacSiDashboard.chuyenTrang(\'ho-so\')">Quay hồ sơ</button>'}
        </div>
        <p id="ti-msg" class="small text-muted mt-2 mb-0"></p>
      </div></div>`);
    await this._taiDanhSachVaccineTiem();
    this._dienGhiChuTiemForm();
  },

  async _huyTiemChungKhongDat() {
    const hoSoId = document.getElementById('ti-hs')?.value?.trim() || this._hoSoId;
    const lichId = this._lichHenId;
    if (!hoSoId && !lichId) {
      return Toast.loi('Chưa có hồ sơ / lịch', 'Mở lịch tiêm chủng trước.', 'error');
    }
    const lyDo = window.prompt(
      'Lý do bệnh nhân không đạt yêu cầu tiêm chủng (bắt buộc):',
      'Chống chỉ định / chưa đủ điều kiện tiêm'
    );
    if (lyDo == null) return;
    const reason = lyDo.trim();
    if (!reason) return Toast.loi('Nhập lý do huỷ', '', 'error');
    if (!window.confirm('Xác nhận huỷ tiêm chủng cho lần khám này?\nLịch sẽ chuyển sang đã huỷ.')) {
      return;
    }

    const vaccineId =
      (document.getElementById('ti-vc')?.value || '').trim() || this._vaccineLichHenId;
    const ngayTiem = document.getElementById('ti-ngay')?.value || this._formatDateYMD(new Date());
    const ghiChuForm = (document.getElementById('ti-ghi-chu')?.value || '').trim();
    const ghiChuLuu = ghiChuForm || reason;

    if (lichId) {
      await Http.suaCuc(`/lich-hen/lich-tiem/${lichId}/`, {
        trang_thai_tiem: 'CHONG_CHI_DINH',
        ghi_chu: ghiChuLuu,
      });
      const huyRes = await Http.tao(`/lich-hen/lich-hen/${lichId}/huy/`, { ly_do: reason });
      if (!huyRes.ok) {
        return Toast.loi('Không huỷ được lịch', this._msgApiLoi(huyRes), 'error');
      }
    }

    if (hoSoId && vaccineId) {
      await Http.tao(`/benh-an/ho-so-benh-an/${hoSoId}/chi_dinh_tiem/`, {
        vaccine: vaccineId,
        ngay_tiem: ngayTiem,
        trang_thai: 'CHONG_CHI_DINH',
        ghi_chu: ghiChuLuu,
      });
    } else if (hoSoId && !vaccineId) {
      Toast.hien('Đã huỷ lịch', 'Chưa ghi hồ sơ tiêm (thiếu vaccine trên form).', 'warning');
    }

    this._hoSoId = null;
    this._benhNhanId = null;
    this._lichHenId = null;
    this._loaiLichHen = null;
    this._vaccineLichHenId = null;
    this._lichTiemSnapshot = null;
    this._patientSnapshot = null;
    this._refreshPatientStrip();
    Toast.hien('Đã huỷ tiêm chủng', reason, 'success');
    await this.chuyenTrang('ho-so');
    const el = document.getElementById('bs-ds-hom-nay');
    if (el) await this._loadDsLichHomNay();
  },

  async _guiTiem() {
    let id = document.getElementById('ti-hs')?.value?.trim() || this._hoSoId;
    if (!id) return Toast.loi('Chưa có hồ sơ', 'Mở lịch tiêm chủng hoặc hồ sơ bệnh nhân trước.', 'error');
    const vaccineId = (document.getElementById('ti-vc')?.value || '').trim();
    if (!vaccineId) return Toast.loi('Chọn vaccine trước khi lưu', '', 'error');
    const ngayTiem = document.getElementById('ti-ngay')?.value || this._formatDateYMD(new Date());
    const ghiChu = (document.getElementById('ti-ghi-chu')?.value || '').trim();
    const body = {
      vaccine: vaccineId,
      ngay_tiem: ngayTiem,
      trang_thai: 'DA_TIEM',
      ghi_chu: ghiChu,
    };
    const res = await Http.tao(`/benh-an/ho-so-benh-an/${id}/chi_dinh_tiem/`, body);
    const msgEl = document.getElementById('ti-msg');
    if (!res.ok) {
      if (msgEl) msgEl.textContent = '';
      return Toast.loi('Không lưu được', this._msgApiLoi(res), 'error');
    }

    const lichId = this._lichHenId;
    if (lichId) {
      await Http.suaCuc(`/lich-hen/lich-tiem/${lichId}/`, {
        trang_thai_tiem: 'DA_TIEM',
        ghi_chu: ghiChu || this._lichTiemSnapshot?.ghi_chu || '',
      });
      const ht = await Http.tao(`/lich-hen/lich-hen/${lichId}/hoan_thanh/`, {});
      if (!ht.ok) {
        Toast.hien('Đã ghi tiêm vào hồ sơ', `Chưa kết thúc lịch: ${this._msgApiLoi(ht)}`, 'warning');
        if (msgEl) msgEl.textContent = 'Đã lưu tiêm — vui lòng hoàn tất lịch thủ công.';
        return;
      }
    }

    const daHoanTatLich = !!this._lichHenId;
    this._hoSoId = null;
    this._benhNhanId = null;
    this._lichHenId = null;
    this._loaiLichHen = null;
    this._vaccineLichHenId = null;
    this._lichTiemSnapshot = null;
    this._patientSnapshot = null;
    this._refreshPatientStrip();
    Toast.hien(
      'Đã lưu tiêm chủng',
      daHoanTatLich ? 'Hồ sơ đã cập nhật, lịch đã hoàn thành.' : 'Đã ghi vào hồ sơ lần khám.',
      'success'
    );
    await this.chuyenTrang('ho-so');
    const el = document.getElementById('bs-ds-hom-nay');
    if (el) await this._loadDsLichHomNay();
  },

  _formatNgayVN(ymd) {
    if (!ymd) return '—';
    const p = String(ymd).split('-');
    if (p.length !== 3) return ymd;
    return `${p[2]}/${p[1]}/${p[0]}`;
  },

  _llvBadgeClass(ca) {
    if (ca === 'SANG') return 'bs-llv-badge bs-llv-badge--sang';
    if (ca === 'CHIEU') return 'bs-llv-badge bs-llv-badge--chieu';
    if (ca === 'TOI') return 'bs-llv-badge bs-llv-badge--toi';
    return 'bs-llv-badge';
  },

  _homNayYMD() {
    return (window.UIEnhance && UIEnhance.ngayHomNayYMD)
      ? UIEnhance.ngayHomNayYMD()
      : this._formatDateYMD(new Date());
  },

  _laNgayQuaKhu(ymd) {
    if (window.UIEnhance && UIEnhance.laNgayQuaKhu) return UIEnhance.laNgayQuaKhu(ymd, this._homNayYMD());
    return ymd && ymd < this._homNayYMD();
  },

  _apDungMinNgayLlv() {
    const today = this._homNayYMD();
    const el = document.getElementById('bs-llv-ngay');
    if (!el) return;
    el.min = today;
    if (el.value && el.value < today) el.value = today;
    if (!el.dataset.minBound) {
      el.dataset.minBound = '1';
      el.addEventListener('change', () => this._kiemTraNgayLlvInput());
    }
  },

  _kiemTraNgayLlvInput() {
    const el = document.getElementById('bs-llv-ngay');
    if (!el || !el.value) return;
    const today = this._homNayYMD();
    if (el.value < today) {
      el.value = today;
      Toast.loi('Ngày không hợp lệ', 'Không chọn ngày trong quá khứ', 'error');
    }
  },

  _chonNgayLlvPreset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(0, offsetDays || 0));
    const el = document.getElementById('bs-llv-ngay');
    if (el) el.value = this._formatDateYMD(d);
    const ymd = this._formatDateYMD(d);
    if (this._llvCalYear != null) {
      this._llvCalYear = d.getFullYear();
      this._llvCalMonth = d.getMonth();
      this._llvCalSelected = ymd;
      this._renderLlvCalendar();
    }
  },

  _llvCalYmd(y, m, day) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  },

  _llvCalMapFromList(list) {
    const map = {};
    (list || []).forEach((r) => {
      const k = r.ngay_lam || '';
      if (!k) return;
      if (!map[k]) map[k] = { cas: [], rows: [] };
      map[k].cas.push(r.ca_lam);
      map[k].rows.push(r);
    });
    return map;
  },

  _llvCalInitState() {
    const t = new Date();
    this._llvCalYear = t.getFullYear();
    this._llvCalMonth = t.getMonth();
    this._llvCalSelected = this._formatDateYMD(t);
    this._llvScheduleList = [];
    this._llvViewMode = 'cal';
  },

  _llvCalPrev() {
    this._llvCalMonth -= 1;
    if (this._llvCalMonth < 0) {
      this._llvCalMonth = 11;
      this._llvCalYear -= 1;
    }
    this._renderLlvCalendar();
  },

  _llvCalNext() {
    this._llvCalMonth += 1;
    if (this._llvCalMonth > 11) {
      this._llvCalMonth = 0;
      this._llvCalYear += 1;
    }
    this._renderLlvCalendar();
  },

  _llvCalToday() {
    const t = new Date();
    this._llvCalYear = t.getFullYear();
    this._llvCalMonth = t.getMonth();
    this._llvCalSelected = this._formatDateYMD(t);
    const el = document.getElementById('bs-llv-ngay');
    if (el) el.value = this._llvCalSelected;
    this._renderLlvCalendar();
  },

  _llvChonNgayTuLich(ymd) {
    if (!ymd) return;
    this._llvCalSelected = ymd;
    const isPast = this._laNgayQuaKhu(ymd);
    const el = document.getElementById('bs-llv-ngay');
    if (el && !isPast) el.value = ymd;
    const p = ymd.split('-');
    if (p.length === 3) {
      this._llvCalYear = parseInt(p[0], 10);
      this._llvCalMonth = parseInt(p[1], 10) - 1;
    }
    this._renderLlvCalendar();
    if (!isPast) {
      const form = document.querySelector('.bs-llv-form-card');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  _llvSetView(mode) {
    this._llvViewMode = mode === 'list' ? 'list' : 'cal';
    const calWrap = document.getElementById('bs-llv-schedule-layout');
    const side = document.getElementById('bs-llv-side-panel');
    const btnCal = document.getElementById('bs-llv-tab-cal');
    const btnList = document.getElementById('bs-llv-tab-list');
    if (btnCal) btnCal.classList.toggle('is-active', this._llvViewMode === 'cal');
    if (btnList) btnList.classList.toggle('is-active', this._llvViewMode === 'list');
    if (calWrap) calWrap.classList.toggle('bs-llv-schedule-layout--list-only', this._llvViewMode === 'list');
    if (side) side.classList.toggle('bs-llv-side-panel--hidden', this._llvViewMode === 'cal');
    const calCard = document.getElementById('bs-llv-cal-card');
    if (calCard) calCard.classList.toggle('bs-llv-cal-card--full', this._llvViewMode === 'list');
  },

  _llvCaLabelShort(ca) {
    return { SANG: 'S', CHIEU: 'C', TOI: 'T' }[ca] || ca;
  },

  _renderLlvCalendar() {
    const gridEl = document.getElementById('bs-llv-cal-grid');
    const detailEl = document.getElementById('bs-llv-cal-detail');
    const titleEl = document.getElementById('bs-llv-cal-month-title');
    if (!gridEl || this._llvCalYear == null) return;

    const y = this._llvCalYear;
    const m = this._llvCalMonth;
    const today = this._homNayYMD();
    const map = this._llvCalMapFromList(this._llvScheduleList || []);

    if (titleEl) {
      const label = new Date(y, m, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
      titleEl.textContent = label;
    }

    const firstDow = new Date(y, m, 1).getDay();
    const startPad = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysPrev = new Date(y, m, 0).getDate();

    const cells = [];
    for (let i = 0; i < startPad; i++) {
      const d = daysPrev - startPad + i + 1;
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      cells.push({ pad: true, day: d, ymd: this._llvCalYmd(prevY, prevM, d) });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ pad: false, day: d, ymd: this._llvCalYmd(y, m, d) });
    }
    while (cells.length % 7 !== 0) {
      const d = cells.length - startPad - daysInMonth + 1;
      const nextM = m === 11 ? 0 : m + 1;
      const nextY = m === 11 ? y + 1 : y;
      cells.push({ pad: true, day: d, ymd: this._llvCalYmd(nextY, nextM, d) });
    }

    const order = ['SANG', 'CHIEU', 'TOI'];
    gridEl.innerHTML = cells
      .map((c) => {
        if (c.pad) {
          return `<div class="bs-llv-cal-day bs-llv-cal-day--pad"><span class="bs-llv-cal-day-num">${c.day}</span></div>`;
        }
        const info = map[c.ymd];
        const has = info && info.cas.length;
        const isToday = c.ymd === today;
        const isPast = c.ymd < today;
        const isSel = c.ymd === this._llvCalSelected;
        const dots = has
          ? order
              .filter((ca) => info.cas.includes(ca))
              .map(
                (ca) =>
                  `<span class="bs-llv-cal-dot bs-llv-cal-dot--${ca.toLowerCase()}" title="${this._esc(this._llvCaTen(ca))}">${this._llvCaLabelShort(ca)}</span>`
              )
              .join('')
          : '';
        return `<button type="button" class="bs-llv-cal-day${has ? ' bs-llv-cal-day--has' : ''}${isToday ? ' bs-llv-cal-day--today' : ''}${isPast ? ' bs-llv-cal-day--past' : ''}${isSel ? ' bs-llv-cal-day--selected' : ''}"
          onclick="PageBacSiDashboard._llvChonNgayTuLich('${this._esc(c.ymd)}')" aria-label="Ngày ${c.day}">
          <span class="bs-llv-cal-day-num">${c.day}</span>
          <div class="bs-llv-cal-day-dots">${dots}</div>
        </button>`;
      })
      .join('');

    if (detailEl) {
      const sel = this._llvCalSelected;
      const info = map[sel];
      const isPastSel = sel && sel < today;
      if (!sel) {
        detailEl.innerHTML = '';
        detailEl.style.display = 'none';
      } else if (!info || !info.rows.length) {
        detailEl.style.display = '';
        detailEl.innerHTML = isPastSel
          ? `<div><strong>${this._esc(this._formatNgayVN(sel))}</strong> — ngày đã qua, không đăng ký ca mới.</div>`
          : `
          <div><strong>${this._esc(this._formatNgayVN(sel))}</strong> — chưa đăng ký ca.</div>
          <div class="bs-llv-cal-detail-actions">
            <button type="button" class="btn btn-sm btn-primary" onclick="PageBacSiDashboard._llvChonNgayTuLich('${this._esc(sel)}')">Đăng ký ca ngày này</button>
          </div>`;
      } else {
        detailEl.style.display = '';
        detailEl.innerHTML = `
          <div><strong>${this._esc(this._formatNgayVN(sel))}</strong> — ${info.rows.length} ca đã đăng ký:</div>
          <div class="d-flex flex-wrap gap-2 mt-2 mb-2">
            ${info.rows.map((r) => `<span class="${this._llvBadgeClass(r.ca_lam)}">${this._esc(r.ca_lam_display || r.ca_lam)}</span>`).join('')}
          </div>
          ${info.rows.map((r) => r.ghi_chu ? `<div class="text-muted small">${this._esc(r.ghi_chu)}</div>` : '').join('')}
          ${isPastSel ? '<p class="text-muted small mb-0 mt-2">Ngày đã qua — chỉ xem, không thêm ca mới.</p>' : `
          <div class="bs-llv-cal-detail-actions">
            <button type="button" class="btn btn-sm btn-outline" onclick="PageBacSiDashboard._llvChonNgayTuLich('${this._esc(sel)}')">Sửa / thêm ca</button>
          </div>`}`;
      }
    }
  },

  _llvCaTen(ca) {
    return { SANG: 'Ca sáng', CHIEU: 'Ca chiều', TOI: 'Ca tối' }[ca] || ca;
  },

  async _lichLamViec(host) {
    this._llvCalInitState();
    const today = this._homNayYMD();
    UI.render(host, `
      <div class="bs-llv-page">
        <div class="bs-llv-hero">
          <h2 class="bs-llv-hero-title"><i class="fas fa-calendar-check"></i> Đăng ký ca làm</h2>
          <p class="bs-llv-hero-desc">Đăng ký ngày và ca trực để lễ tân có thể gán bệnh nhân / lấy số đúng bác sĩ. Mỗi ca một lần đăng ký; có thể chọn nhiều ca trong cùng một ngày.</p>
        </div>

        <div class="bs-llv-form-card card">
          <div class="card-header"><div class="card-title">Đăng ký ca mới</div></div>
          <div class="bs-llv-form-body">
            <div class="mb-4">
              <span class="bs-llv-field-label">Ngày làm</span>
              <div class="bs-llv-date-row">
                <input type="date" id="bs-llv-ngay" class="form-control" value="${this._esc(today)}" min="${this._esc(today)}"/>
                <div class="bs-llv-date-presets">
                  <button type="button" class="btn btn-outline btn-sm" onclick="PageBacSiDashboard._chonNgayLlvPreset(0)">Hôm nay</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="PageBacSiDashboard._chonNgayLlvPreset(1)">Ngày mai</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="PageBacSiDashboard._chonNgayLlvPreset(7)">+7 ngày</button>
                </div>
              </div>
            </div>

            <div class="mb-4">
              <span class="bs-llv-field-label">Chọn ca (ít nhất một)</span>
              <div class="bs-llv-ca-grid">
                <label class="bs-llv-ca-card bs-llv-ca-card--sang">
                  <input type="checkbox" id="bs-llv-sang" value="SANG" checked/>
                  <span class="bs-llv-ca-check" aria-hidden="true"></span>
                  <span class="bs-llv-ca-icon"><i class="fas fa-sun"></i></span>
                  <span class="bs-llv-ca-name">Ca sáng</span>
                  <span class="bs-llv-ca-time">06:00 – 11:59</span>
                </label>
                <label class="bs-llv-ca-card bs-llv-ca-card--chieu">
                  <input type="checkbox" id="bs-llv-chieu" value="CHIEU"/>
                  <span class="bs-llv-ca-check" aria-hidden="true"></span>
                  <span class="bs-llv-ca-icon"><i class="fas fa-cloud-sun"></i></span>
                  <span class="bs-llv-ca-name">Ca chiều</span>
                  <span class="bs-llv-ca-time">12:00 – 17:59</span>
                </label>
                <label class="bs-llv-ca-card bs-llv-ca-card--toi">
                  <input type="checkbox" id="bs-llv-toi" value="TOI"/>
                  <span class="bs-llv-ca-check" aria-hidden="true"></span>
                  <span class="bs-llv-ca-icon"><i class="fas fa-moon"></i></span>
                  <span class="bs-llv-ca-name">Ca tối</span>
                  <span class="bs-llv-ca-time">18:00 – 21:59</span>
                </label>
              </div>
            </div>

            <div class="bs-llv-note mb-0">
              <span class="bs-llv-field-label">Ghi chú (tuỳ chọn)</span>
              <input type="text" id="bs-llv-ghi-chu" class="form-control" placeholder="VD: Trực phòng khám A, nghỉ giữa ca…"/>
            </div>

            <div class="bs-llv-actions">
              <button type="button" class="bs-llv-btn-save" onclick="PageBacSiDashboard._dangKyCaLam()">
                <i class="fas fa-check"></i> Lưu đăng ký ca
              </button>
              <span class="text-muted small">Lễ tân chỉ thấy bác sĩ đã đăng ký đúng ngày &amp; ca.</span>
            </div>
          </div>
        </div>

        <div class="bs-llv-schedule-layout" id="bs-llv-schedule-layout">
          <div class="bs-llv-cal-card" id="bs-llv-cal-card">
            <div class="bs-llv-cal-toolbar">
              <div class="bs-llv-cal-nav">
                <button type="button" class="btn btn-outline btn-sm" onclick="PageBacSiDashboard._llvCalPrev()" aria-label="Tháng trước"><i class="fas fa-chevron-left"></i></button>
                <span class="bs-llv-cal-month-title" id="bs-llv-cal-month-title">—</span>
                <button type="button" class="btn btn-outline btn-sm" onclick="PageBacSiDashboard._llvCalNext()" aria-label="Tháng sau"><i class="fas fa-chevron-right"></i></button>
                <button type="button" class="btn btn-outline btn-sm" onclick="PageBacSiDashboard._llvCalToday()">Hôm nay</button>
              </div>
              <div class="bs-llv-cal-legend">
                <span><i class="leg-sang"></i> Sáng</span>
                <span><i class="leg-chieu"></i> Chiều</span>
                <span><i class="leg-toi"></i> Tối</span>
              </div>
            </div>
            <div class="bs-llv-cal-body">
              <div class="bs-llv-cal-weekdays">
                <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
              </div>
              <div class="bs-llv-cal-grid" id="bs-llv-cal-grid"></div>
              <div class="bs-llv-cal-detail" id="bs-llv-cal-detail"></div>
            </div>
          </div>

          <div class="bs-llv-side-panel" id="bs-llv-side-panel">
            <div class="bs-llv-list-head">
              <h3 class="bs-llv-list-title">Chi tiết</h3>
              <div class="d-flex align-items-center gap-2">
                <span class="bs-llv-list-count" id="bs-llv-count">…</span>
                <div class="bs-llv-view-tabs">
                  <button type="button" id="bs-llv-tab-cal" class="is-active" onclick="PageBacSiDashboard._llvSetView('cal')">Lịch</button>
                  <button type="button" id="bs-llv-tab-list" onclick="PageBacSiDashboard._llvSetView('list')">Danh sách</button>
                </div>
              </div>
            </div>
            <div class="bs-llv-list-body" id="bs-llv-list">
              <div class="page-loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
      </div>`);
    this._apDungMinNgayLlv();
    await this._taiDanhSachCaLam();
  },

  async _taiDanhSachCaLam() {
    const el = document.getElementById('bs-llv-list');
    const countEl = document.getElementById('bs-llv-count');
    if (!el) return;
    const res = await Http.layDanhSach('/doctor-schedule/?my=true&page_size=200&ordering=-ngay_lam,ca_lam');
    const rows = res.data?.results || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    this._llvScheduleList = list;
    if (countEl) countEl.textContent = res.ok ? `${list.length} ca` : '—';
    this._renderLlvCalendar();
    if (!res.ok) {
      const chiTiet = this._msgApiLoi(res);
      const errHtml = `<div class="bs-llv-empty bs-llv-error"><i class="fas fa-exclamation-circle"></i><p>Không tải được lịch ca.${chiTiet ? ` ${this._esc(chiTiet)}` : ''}</p></div>`;
      el.innerHTML = errHtml;
      const gridEl = document.getElementById('bs-llv-cal-grid');
      if (gridEl) gridEl.innerHTML = errHtml;
      return;
    }
    if (!list.length) {
      el.innerHTML = `
        <div class="bs-llv-empty">
          <i class="fas fa-calendar-plus"></i>
          <p>Chưa có ca nào. Chọn ngày và ca phía trên rồi bấm <strong>Lưu đăng ký ca</strong>.</p>
        </div>`;
      return;
    }
    const byNgay = {};
    list.forEach((r) => {
      const k = r.ngay_lam || '';
      if (!byNgay[k]) byNgay[k] = [];
      byNgay[k].push(r);
    });
    const ngayKeys = Object.keys(byNgay).sort((a, b) => b.localeCompare(a));
    el.innerHTML = ngayKeys
      .map((ngay) => {
        const items = byNgay[ngay]
          .map(
            (r) => `
          <div class="bs-llv-item">
            <div class="bs-llv-item-main">
              <span class="${this._llvBadgeClass(r.ca_lam)}">${this._esc(r.ca_lam_display || r.ca_lam || '')}</span>
              ${r.ghi_chu ? `<span class="bs-llv-item-note" title="${this._esc(r.ghi_chu)}">${this._esc(r.ghi_chu)}</span>` : ''}
            </div>
            <button type="button" class="bs-llv-btn-del" onclick="PageBacSiDashboard._xoaCaLam('${this._esc(r.id)}')">
              <i class="fas fa-trash-alt"></i> Xóa
            </button>
          </div>`
          )
          .join('');
        return `
        <div class="bs-llv-group">
          <div class="bs-llv-group-date">${this._esc(this._formatNgayVN(ngay))}</div>
          ${items}
        </div>`;
      })
      .join('');
  },

  async _dangKyCaLam() {
    this._kiemTraNgayLlvInput();
    const ngay = document.getElementById('bs-llv-ngay')?.value;
    const ca = [];
    if (document.getElementById('bs-llv-sang')?.checked) ca.push('SANG');
    if (document.getElementById('bs-llv-chieu')?.checked) ca.push('CHIEU');
    if (document.getElementById('bs-llv-toi')?.checked) ca.push('TOI');
    if (!ngay || !ca.length) return Toast.loi('Chọn ngày và ít nhất một ca', '', 'error');
    if (this._laNgayQuaKhu(ngay)) {
      return Toast.loi('Ngày không hợp lệ', 'Không đăng ký ca cho ngày trong quá khứ', 'error');
    }
    const ghiChu = (document.getElementById('bs-llv-ghi-chu')?.value || '').trim();
    const res = await Http.tao('/doctor-schedule/dang_ky_nhieu/', {
      ngay_lam: ngay,
      ca_lam: ca,
      ghi_chu: ghiChu,
    });
    if (!res.ok) {
      const err = res.data?.error || (res.data?.errors && JSON.stringify(res.data.errors)) || this._msgApiLoi(res);
      return Toast.loi('Không đăng ký được', err, 'error');
    }
    Toast.hien('Đã đăng ký ca', `${ca.length} ca ngày ${ngay}`, 'success');
    await this._taiDanhSachCaLam();
  },

  async _xoaCaLam(id) {
    if (!id || !window.confirm('Xóa đăng ký ca này?')) return;
    const res = await Http.xoa(`/doctor-schedule/${id}/`);
    if (!res.ok) return Toast.loi('Không xóa được', this._msgApiLoi(res), 'error');
    Toast.hien('Đã xóa', '', 'success');
    await this._taiDanhSachCaLam();
  },

  async _taiDanhSachVaccineTiem() {
    const sel = document.getElementById('ti-vc');
    if (!sel) return;
    sel.innerHTML = '<option value="">Đang tải vaccine...</option>';
    const res = await Http.layDanhSach('/thuoc/vaccine/?trang_thai=true&ordering=ten_vaccine&page_size=500');
    const rows = (res.data && res.data.results) || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    if (!res.ok || !list.length) {
      sel.innerHTML = '<option value="">Không có vaccine khả dụng</option>';
      return;
    }
    sel.innerHTML =
      '<option value="">-- Chọn vaccine --</option>' +
      list
        .map((v) => {
          const label = `${v.ma_vaccine || ''} - ${v.ten_vaccine || ''}${v.ton_kho != null ? ` (Tồn: ${v.ton_kho})` : ''}`;
          return `<option value="${this._esc(v.id)}">${this._esc(label)}</option>`;
        })
        .join('');
    if (this._vaccineLichHenId) {
      sel.value = this._vaccineLichHenId;
      if (sel.value !== this._vaccineLichHenId) {
        sel.appendChild(
          new Option(`Vaccine lịch (${this._vaccineLichHenId.slice(0, 8)}…)`, this._vaccineLichHenId, true, true)
        );
      }
    }
  },

};

window.PageBacSiDashboard = PageBacSiDashboard;
