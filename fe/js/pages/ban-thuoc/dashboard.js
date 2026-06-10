/**
 * Nhân viên bán thuốc — tra cứu toa, bán một phần toa, bán lẻ, thanh toán tiền mặt / VNPay.
 */
const PageBanThuocDashboard = {
  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  },

  /** BenhNhan dùng OneToOne nguoi_dung làm PK — API không có field `id`, chỉ có `nguoi_dung`. */
  _benhNhanPk(b) {
    if (!b) return '';
    const nd = b.nguoi_dung;
    if (typeof nd === 'string' && nd) return nd;
    if (nd && typeof nd === 'object' && nd.id) return String(nd.id);
    if (b.id) return String(b.id);
    return '';
  },

  _setNavActive(t) {
    document.querySelectorAll('[data-bt-nav]').forEach((b) => {
      const on = b.getAttribute('data-bt-nav') === t;
      b.classList.toggle('active', on);
    });
  },

  async render() {
    const { hoTen } = Auth.layThongTin();
    const navHtml = `
      <button type="button" class="nav-item" data-bt-nav="theo-toa" onclick="PageBanThuocDashboard.chuyenTrang('theo-toa')"><i class="fas fa-file-prescription"></i><span>Bán theo toa</span></button>
      <button type="button" class="nav-item" data-bt-nav="ban-le" onclick="PageBanThuocDashboard.chuyenTrang('ban-le')"><i class="fas fa-shopping-basket"></i><span>Bán lẻ</span></button>
      <button type="button" class="nav-item" data-bt-nav="toa-xong" onclick="PageBanThuocDashboard.chuyenTrang('toa-xong')"><i class="fas fa-check-double"></i><span>Đơn đã hoàn thành</span></button>`;
    window.RoleDashboardShell.mount('app-root', {
      brandTitle: 'PhòngKhám+',
      brandAccent: 'Nhà thuốc',
      brandIcon: 'fa-pills',
      navHtml,
      mainHostId: 'ban-thuoc-main',
      userName: hoTen || 'Nhân viên',
      userRoleLabel: 'Bán thuốc — Quầy',
      contentMaxWidth: '1100px',
      headerActionsExtra: window.ThongBaoBell ? ThongBaoBell.htmlButton() : '',
    });
    if (window.ThongBaoBell) ThongBaoBell.init({ badgeId: 'pk-noti-badge' });
    await this.chuyenTrang('theo-toa');
  },

  async chuyenTrang(t) {
    this._setNavActive(t);
    const host = 'ban-thuoc-main';
    if (t === 'theo-toa') return this._theoToa(host);
    if (t === 'ban-le') return this._banLe(host);
    if (t === 'toa-xong') return this._toaDaHoanThanh(host);
    return this._theoToa(host);
  },

  /** Hóa đơn in từ payload backend (hoặc data.hoa_don từ GET đơn hàng). */
  _showHoaDon(hd) {
    if (!hd || !hd.ma_don_hang) return;
    const rows = (hd.chi_tiet || [])
      .map(
        (r) =>
          `<tr><td>${this._esc(r.ten_thuoc)}</td><td style="text-align:center">${r.so_luong}</td><td style="text-align:right">${Number(r.don_gia).toLocaleString('vi-VN')}</td><td style="text-align:right">${Number(r.thanh_tien).toLocaleString('vi-VN')}</td></tr>`
      )
      .join('');
    const loaiBan =
      hd.loai_ban === 'ban_le'
        ? '<p><strong>Loại:</strong> Bán lẻ (không toa)</p>'
        : hd.ma_toa
          ? `<p><strong>Loại:</strong> Bán theo toa bác sĩ</p><p><strong>Mã toa BS:</strong> ${this._esc(hd.ma_toa)}</p>`
          : '<p><strong>Loại:</strong> Bán tại quầy</p>';
    const pt = hd.phuong_thuc_display
      ? `<p><strong>Phương thức thanh toán:</strong> ${this._esc(hd.phuong_thuc_display)}${
          hd.ngay_thanh_toan ? ` — ${this._esc(hd.ngay_thanh_toan)}` : ''
        }</p>`
      : '';
    const bn = hd.benh_nhan || {};
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Hóa đơn ${this._esc(hd.ma_don_hang)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;padding:20px;max-width:720px;margin:0 auto;color:#111}
h1{font-size:18px;margin:0 0 12px} table{width:100%;border-collapse:collapse;margin:12px 0} th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px} th{background:#f0f0f0;text-align:left}.tong{font-weight:700;font-size:15px;margin-top:12px} .muted{color:#555;font-size:12px}</style></head><body>
<h1>Hóa đơn bán tại quầy</h1>
<p class="muted">Phòng khám+ / Nhà thuốc</p>
<p><strong>Mã đơn hàng:</strong> ${this._esc(hd.ma_don_hang)}</p>
${loaiBan}
<p><strong>Bệnh nhân:</strong> ${this._esc(bn.ma_benh_nhan || '')} — ${this._esc(bn.ho_ten || '')}</p>
<p><strong>SĐT:</strong> ${this._esc(bn.so_dien_thoai || '')}</p>
<p><strong>Thời gian lập đơn:</strong> ${this._esc(hd.ngay_tao || '')}</p>
${pt}
<table><thead><tr><th>Thuốc</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
<p class="tong">Tổng thanh toán: ${Number(hd.tong_tien || 0).toLocaleString('vi-VN')} đ</p>
${hd.ghi_chu ? `<p class="muted">Ghi chú: ${this._esc(hd.ghi_chu)}</p>` : ''}
<p class="muted" style="margin-top:24px">— Cảm ơn quý khách —</p>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  },

  async _taiDanhSachToaXong() {
    const box = document.getElementById('bt-list-xong');
    if (!box) return;
    box.innerHTML = '<p class="text-muted">Đang tải…</p>';
    const [rToa, rLe] = await Promise.all([
      Http.layDanhSach('/benh-an/don-thuoc/toa-da-hoan-thanh/'),
      Http.layDanhSach('/don-hang/don-hang/don-ban-le-da-thanh-toan/'),
    ]);
    const listToa = rToa.ok && Array.isArray(rToa.data) ? rToa.data : [];
    const listLe =
      rLe.ok && rLe.data?.success && Array.isArray(rLe.data?.data) ? rLe.data.data : [];
    if (!rToa.ok && !rLe.ok) {
      box.innerHTML = `<p class="text-danger">Không tải được danh sách (toa: ${rToa.status || '—'}, bán lẻ: ${rLe.status || '—'}).</p>`;
      return;
    }
    const merged = [
      ...listToa.map((r) => ({
        sort: Date.parse(r.ngay_cap_nhat || '') || 0,
        html: (() => {
          const dhid = r.don_hang_id ? `'${r.don_hang_id}'` : 'null';
          const btn = r.don_hang_id
            ? `<button type="button" class="btn btn-sm btn-outline-primary" onclick="PageBanThuocDashboard._inLaiHoaDon(${dhid})">In hóa đơn</button>`
            : '—';
          const pt = r.phuong_thuc_thanh_toan
            ? this._esc(r.phuong_thuc_thanh_toan)
            : '—';
          return `<tr><td><span class="badge bg-primary">Theo toa</span></td><td>${this._esc(r.ma_don)}</td><td><code>${this._esc(r.ma_don_hang || '—')}</code></td><td>${this._esc(r.ten_benh_nhan || '')} <span class="text-muted">(${this._esc(r.ma_benh_nhan || '')})</span></td><td>${pt}</td><td>${btn}</td></tr>`;
        })(),
      })),
      ...listLe.map((r) => ({
        sort: Date.parse(r.ngay_tao || '') || 0,
        html: (() => {
          const dhid = r.don_hang_id ? `'${r.don_hang_id}'` : 'null';
          const pt = r.phuong_thuc_thanh_toan
            ? this._esc(r.phuong_thuc_thanh_toan)
            : '—';
          return `<tr><td><span class="badge bg-secondary">Bán lẻ</span></td><td>—</td><td><code>${this._esc(r.ma_don_hang)}</code></td><td>${this._esc(r.ten_benh_nhan || '')} <span class="text-muted">(${this._esc(r.ma_benh_nhan || '')})</span></td><td>${pt}</td><td><button type="button" class="btn btn-sm btn-outline-primary" onclick="PageBanThuocDashboard._inLaiHoaDon(${dhid})">In hóa đơn</button> <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBanThuocDashboard._suaBanLeTuHoanThanh(${dhid})">Sửa đơn</button></td></tr>`;
        })(),
      })),
    ];
    merged.sort((a, b) => b.sort - a.sort);
    if (!merged.length) {
      box.innerHTML = '<p class="text-muted">Chưa có đơn hoàn thành.</p>';
      return;
    }
    box.innerHTML = `<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Loại</th><th>Mã toa</th><th>Mã ĐH</th><th>Bệnh nhân</th><th>Thanh toán</th><th></th></tr></thead><tbody>
      ${merged.map((m) => m.html).join('')}
    </tbody></table></div>`;
  },

  async _lamMoiSauThanhToan() {
    const ma = document.getElementById('bt-ma-toa')?.value?.trim();
    if (ma) await this._loadToa();
    await this._taiDanhSachToaXong();
  },

  async _toaDaHoanThanh(host) {
    UI.render(
      host,
      `<div class="card mb-3">
        <div class="card-header"><div class="card-title">Đơn tại quầy đã hoàn thành</div></div>
        <div class="card-body">
          <p class="small text-muted">Theo toa bác sĩ và bán lẻ đã thanh toán — in lại hóa đơn (có phương thức thanh toán).</p>
          <div id="bt-list-xong"></div>
        </div>
      </div>`
    );
    await this._taiDanhSachToaXong();
  },

  async _inLaiHoaDon(donHangId) {
    if (!donHangId) return;
    const res = await Http.layDanhSach(`/don-hang/don-hang/${donHangId}/`);
    if (!res.ok || !res.data?.success || !res.data.data?.hoa_don) {
      return Toast.loi('Không tải được đơn hàng', res.data?.error || '', 'error');
    }
    this._showHoaDon(res.data.data.hoa_don);
  },

  async _theoToa(host) {
    UI.render(host, `
      <div class="card mb-3">
        <div class="card-header"><div class="card-title">Tra cứu toa bác sĩ</div></div>
        <div class="card-body">
          <div class="input-group mb-2" style="max-width:400px">
            <input id="bt-ma-toa" class="form-control" placeholder="Mã toa (VD: DT2026040001)"/>
            <button type="button" class="btn btn-primary" onclick="PageBanThuocDashboard._loadToa()">Xem toa</button>
          </div>
          <div id="bt-toa-chi-tiet"></div>
        </div>
      </div>
      <div class="card" id="bt-ban-wrap" style="display:none">
        <div class="card-header"><div class="card-title">Chọn thuốc bán (chỉ thuốc trong kho)</div></div>
        <div class="card-body">
          <p class="small text-muted">Tick chọn dòng, chỉnh số lượng bán ≤ số trên toa và ≤ tồn kho.</p>
          <div id="bt-chon-ban"></div>
          <button type="button" class="btn btn-success mt-2" onclick="PageBanThuocDashboard._taoDonBan()">Tạo hóa đơn</button>
        </div>
      </div>
      <div class="card mt-3" id="bt-tt-wrap" style="display:none">
        <div class="card-header"><div class="card-title">Thanh toán</div></div>
        <div class="card-body">
          <p>Mã đơn hàng: <code id="bt-dh-ma"></code> — Tổng: <strong id="bt-dh-tien"></strong> đ</p>
          <p class="mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBanThuocDashboard._inHoaDonGanNhat()">Xem / in lại hóa đơn</button></p>
          <div class="btn-group">
            <button type="button" class="btn btn-primary" onclick="PageBanThuocDashboard._thanhToan('TIEN_MAT')">Tiền mặt (COD)</button>
            <button type="button" class="btn btn-info text-white" onclick="PageBanThuocDashboard._thanhToanVnpay()">VNPay (QR)</button>
          </div>
          <p id="bt-vnp-msg" class="small text-muted mt-2"></p>
        </div>
      </div>`);
    this._toaData = null;
    this._donHangId = null;
    this._hoaDonGanNhat = null;
  },

  async _loadToa() {
    const ma = document.getElementById('bt-ma-toa')?.value?.trim();
    const el = document.getElementById('bt-toa-chi-tiet');
    if (!ma || !el) return;
    const res = await Http.layDanhSach(`/benh-an/don-thuoc/theo-ma/?ma_don=${encodeURIComponent(ma)}`);
    if (!res.ok || !res.data) {
      el.innerHTML = '<p class="text-danger">Không tìm thấy toa.</p>';
      document.getElementById('bt-ban-wrap').style.display = 'none';
      return;
    }
    this._toaData = res.data;
    const chi = res.data.chi_tiet || [];
    const canBanReal = res.data.trang_thai !== 'HOAN_THANH';
    const warnHoanThanh =
      !canBanReal
        ? '<div class="alert alert-warning py-2 mb-2">Toa đã hoàn thành tại quầy — không tạo thêm đơn bán theo toa này. Dùng mục <strong>Toa đã hoàn thành</strong> để in lại hóa đơn.</div>'
        : '';
    el.innerHTML = `
      ${warnHoanThanh}
      <p><strong>${this._esc(res.data.ma_don)}</strong> — BN: ${this._esc(res.data.ma_benh_nhan || '')} — ${this._esc(res.data.ten_benh_nhan || '')}</p>
      <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Thuốc</th><th>SL toa</th><th>Liều / cách</th><th>Tồn kho</th><th>Ghi chú</th></tr></thead><tbody>
      ${chi
        .map((c) => {
          const ten = c.ten_thuoc || c.ten_thuoc_tu_do || '—';
          const loai = c.duoc_ban_tai_quay ? '' : '<span class="badge bg-warning text-dark">Mua ngoài</span>';
          return `<tr>
          <td>${loai} ${this._esc(ten)}</td>
          <td>${c.so_luong}</td>
          <td class="small">${this._esc(c.lieu_dung || '')} — ${this._esc(c.tan_suat || c.thoi_diem_display || '')}</td>
          <td>${c.ton_kho != null ? c.ton_kho : '—'}</td>
          <td class="small">${this._esc(c.ghi_chu_loai || '')}</td>
        </tr>`;
        })
        .join('')}
      </tbody></table></div>`;

    const chon = document.getElementById('bt-chon-ban');
    const banWrap = document.getElementById('bt-ban-wrap');
    const ttWrap = document.getElementById('bt-tt-wrap');
    ttWrap.style.display = 'none';
    chon.innerHTML = chi
      .filter((c) => c.duoc_ban_tai_quay && c.id)
      .map(
        (c) => `<div class="form-check border rounded p-2 mb-2">
        <input class="form-check-input bt-chk" type="checkbox" value="${c.id}" id="chk-${c.id}" data-max="${Math.min(c.so_luong, c.ton_kho || 0)}"/>
        <label class="form-check-label w-100" for="chk-${c.id}">
          ${this._esc(c.ten_thuoc)} — tối đa <strong>${Math.min(c.so_luong, c.ton_kho || 0)}</strong>
          <div class="mt-1"><label class="small">SL bán</label>
          <input type="number" class="form-control form-control-sm bt-sl" style="max-width:100px;display:inline-block" data-id="${c.id}" min="1" value="${Math.min(c.so_luong, c.ton_kho || 0)}" disabled/></div>
        </label>
      </div>`
      )
      .join('');
    document.querySelectorAll('.bt-chk').forEach((chk) => {
      chk.addEventListener('change', () => {
        const sl = document.querySelector(`.bt-sl[data-id="${chk.value}"]`);
        if (sl) sl.disabled = !chk.checked;
      });
    });
    banWrap.style.display = chon.innerHTML && canBanReal ? 'block' : 'none';
    if (!canBanReal) {
      banWrap.style.display = 'none';
      document.getElementById('bt-tt-wrap').style.display = 'none';
    }
    if (!chon.innerHTML) {
      chon.innerHTML = '<p class="text-muted">Không có thuốc nào trong kho trên toa này.</p>';
    }
  },

  async _taoDonBan() {
    if (!this._toaData) return;
    const ma = this._toaData.ma_don;
    const items = [];
    document.querySelectorAll('.bt-chk:checked').forEach((chk) => {
      const id = chk.value;
      const max = parseInt(chk.getAttribute('data-max') || '0', 10);
      const slInp = document.querySelector(`.bt-sl[data-id="${id}"]`);
      let sl = parseInt(slInp?.value || '0', 10);
      if (sl < 1) return;
      if (sl > max) sl = max;
      items.push({ chi_tiet_don_thuoc_id: id, so_luong: sl });
    });
    if (!items.length) return Toast.loi('Chọn ít nhất một thuốc', '', 'error');
    const res = await Http.tao('/don-hang/don-hang/ban-theo-toa/', { ma_don: ma, items });
    if (!res.ok || !res.data?.success) {
      return Toast.loi('Không tạo được đơn', res.data?.error || '', 'error');
    }
    this._donHangId = res.data.data.don_hang_id;
    this._hoaDonGanNhat = res.data.data.hoa_don || null;
    document.getElementById('bt-dh-ma').textContent = res.data.data.ma_don_hang;
    document.getElementById('bt-dh-tien').textContent = String(res.data.data.tong_tien);
    document.getElementById('bt-tt-wrap').style.display = 'block';
    if (this._hoaDonGanNhat) this._showHoaDon(this._hoaDonGanNhat);
    Toast.hien('Đã tạo hóa đơn', 'Đã mở cửa sổ in — chọn thanh toán bên dưới', 'success');
  },

  _inHoaDonGanNhat() {
    if (this._hoaDonGanNhat) this._showHoaDon(this._hoaDonGanNhat);
    else Toast.loi('Chưa có dữ liệu hóa đơn', '', 'error');
  },

  async _thanhToan(code) {
    if (!this._donHangId) return;
    if (code === 'TIEN_MAT') {
      const ok = window.confirm(
        'Xác nhận khách đã thanh toán tiền mặt (COD) tại quầy?\nSau khi xác nhận, toa sẽ được đánh dấu hoàn thành.'
      );
      if (!ok) return;
    }
    const res = await Http.tao(`/don-hang/don-hang/${this._donHangId}/thanh-toan/`, {
      phuong_thuc: code,
      noi_dung: 'Thanh toán tại quầy',
    });
    if (res.ok && res.data?.success) {
      if (res.data.data?.hoa_don) {
        this._hoaDonGanNhat = res.data.data.hoa_don;
        this._showHoaDon(this._hoaDonGanNhat);
      }
      Toast.hien('Đã thanh toán', 'Toa đã được đánh dấu hoàn thành', 'success');
      document.getElementById('bt-tt-wrap').style.display = 'none';
      this._hoaDonGanNhat = null;
      this._donHangId = null;
      await this._lamMoiSauThanhToan();
    } else Toast.loi('Lỗi', res.data?.error || '', 'error');
  },

  async _thanhToanVnpay() {
    if (!this._donHangId) return;
    const res = await Http.tao(`/don-hang/don-hang/${this._donHangId}/vnpay-tao-url/`, {});
    const msg = document.getElementById('bt-vnp-msg');
    if (!res.ok || !res.data?.success) {
      if (msg) msg.textContent = res.data?.error || 'Không tạo được link (kiểm tra cấu hình VNPAY trên server).';
      return;
    }
    const url = res.data.data?.payment_url;
    if (msg) msg.textContent = 'Đang mở trang thanh toán VNPay…';
    if (url) window.open(url, '_blank');
  },

  _blKhoaTaoDon(choThanhToan) {
    const btn = document.getElementById('bt-bl-btn-tao');
    const note = document.getElementById('bt-bl-cho-tt-note');
    const ma = document.getElementById('bt-bl-ma');
    if (btn) {
      btn.disabled = !!choThanhToan;
      btn.title = choThanhToan
        ? 'Chọn thanh toán tiền mặt (Bước 2) hoặc VNPay; sau VNPay có thể tạo đơn khác'
        : '';
    }
    if (note) {
      if (choThanhToan) {
        note.className = 'alert alert-warning py-2 small mb-3';
        note.style.display = 'block';
        note.innerHTML = `Đang chờ <strong>thanh toán</strong> đơn <code id="bt-bl-wait-ma"></code>. Ở <strong>Bước 2</strong>: chọn <strong>Tiền mặt / COD</strong> (xác nhận) để hoàn tất ngay và lưu vào <strong>Đơn đã hoàn thành</strong>, hoặc <strong>VNPay</strong> (QR) — đơn hoàn tất khi ngân hàng xác nhận.`;
        const w = document.getElementById('bt-bl-wait-ma');
        if (w && ma) w.textContent = ma.textContent || '';
      } else {
        note.style.display = 'none';
      }
    }
  },

  /** Sau khi mở link VNPay: mở khóa tạo đơn mới, giữ thông báo đơn chờ VNPay. */
  _blSauMoVnpay() {
    const btn = document.getElementById('bt-bl-btn-tao');
    if (btn) {
      btn.disabled = false;
      btn.title = '';
    }
    const note = document.getElementById('bt-bl-cho-tt-note');
    const ma = document.getElementById('bt-bl-ma')?.textContent || '';
    if (note) {
      note.className = 'alert alert-info py-2 small mb-3';
      note.style.display = 'block';
      note.innerHTML = `Đơn <code>${this._esc(ma)}</code> đang chờ thanh toán VNPay — khi khách thanh toán xong, đơn sẽ vào <strong>Đơn đã hoàn thành</strong>. Bạn có thể <strong>Tạo hóa đơn</strong> để bán cho khách khác.`;
    }
  },

  async _banLe(host) {
    UI.render(host, `
      <div class="card mb-3 border-secondary" id="bt-bl-step1">
        <div class="card-header"><div class="card-title">Bước 1 — Lập đơn bán lẻ</div></div>
        <div class="card-body">
          <div id="bt-bl-cho-tt-note" class="alert alert-warning py-2 small mb-3" style="display:none">
            Đang chờ <strong>thanh toán</strong> đơn <code id="bt-bl-wait-ma"></code>.
            Hoàn tất ở <strong>Bước 2</strong> (tiền mặt hoặc VNPay) để đơn được lưu vào <strong>Đơn đã hoàn thành</strong>.
          </div>
          <p class="small text-muted mb-2">Tìm bệnh nhân theo mã BN hoặc SĐT</p>
          <div class="input-group mb-2" style="max-width:420px">
            <input id="bt-bl-q" class="form-control" placeholder="Mã BN / SĐT"/>
            <button type="button" class="btn btn-outline-primary" onclick="PageBanThuocDashboard._timBn()">Tìm</button>
          </div>
          <div id="bt-bl-bn" class="mb-3"></div>
          <input type="hidden" id="bt-bl-bnid"/>
          <p class="small fw-semibold mb-2">Thuốc — gõ tên, bấm Tìm (chỉ thuốc <strong>không yêu cầu kê đơn</strong>, còn tồn)</p>
          <div id="bt-bl-sua-paid-note" class="alert alert-info py-2 small mb-2" style="display:none">
            Đơn <strong>đã thanh toán</strong> — cập nhật sẽ điều chỉnh tồn kho và số tiền ghi nhận trên hệ thống.
          </div>
          <div id="bt-bl-lines"></div>
          <button type="button" class="btn btn-sm btn-outline-secondary mb-2" onclick="PageBanThuocDashboard._blThemDong()">+ Thêm dòng thuốc</button>
          <button type="button" id="bt-bl-btn-tao" class="btn btn-primary" onclick="PageBanThuocDashboard._blTaoHoacCapNhat()">Tạo hóa đơn</button>
        </div>
      </div>
      <div class="card border-primary" id="bt-bl-tt-wrap" style="display:none">
        <div class="card-header bg-primary text-white"><div class="card-title mb-0">Bước 2 — Chọn phương thức thanh toán để hoàn tất đơn</div></div>
        <div class="card-body">
          <p class="small text-muted mb-2">Đơn chỉ được ghi vào <strong>Đơn đã hoàn thành</strong> sau khi thanh toán xong (tiền mặt: xác nhận ngay; VNPay: khi hệ thống nhận xác nhận từ ngân hàng).</p>
          <p class="mb-2">Mã đơn: <code id="bt-bl-ma"></code> — Tổng: <strong id="bt-bl-tien"></strong> đ</p>
          <p class="mb-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="PageBanThuocDashboard._blInHoaDonGanNhat()">Xem / in lại hóa đơn</button>
            <button type="button" class="btn btn-sm btn-outline-dark" onclick="PageBanThuocDashboard._blMoSuaTruocTt()">Sửa danh sách thuốc</button>
          </p>
          <div class="d-flex flex-wrap gap-2 align-items-start mb-2">
            <div>
              <button type="button" class="btn btn-primary" onclick="PageBanThuocDashboard._blTt('TIEN_MAT')">Tiền mặt / COD</button>
              <p class="small text-muted mb-0 mt-1">Xác nhận khách đã trả tiền tại quầy → đơn hoàn tất ngay.</p>
            </div>
            <div>
              <button type="button" class="btn btn-info text-white" onclick="PageBanThuocDashboard._blTtVnpay()">VNPay (quét QR / chuyển khoản)</button>
              <p class="small text-muted mb-0 mt-1">Mở trang thanh toán VNPay; khách quét QR trên màn hình hoặc app NH.</p>
            </div>
          </div>
          <div id="bt-bl-vnp-qr" class="mb-2"></div>
          <p id="bt-bl-vnp-msg" class="small text-muted mb-0"></p>
        </div>
      </div>`);
    this._blDonId = null;
    this._blHoaDon = null;
    this._blCapNhatMode = false;
    this._blSauThanhToan = false;
    this._blTimCache = {};
    this._blRows = [
      { thuoc_id: '', ten_thuoc: '', queryText: '', so_luong: 1, ton_kho: null, gia_ban: null, don_vi_ten: '' },
    ];
    this._blVeDong();
    const pending = this._pendingBlSuaFromList;
    this._pendingBlSuaFromList = null;
    if (pending) await this._blLoadDonDeSua(pending);
  },

  _suaBanLeTuHoanThanh(donHangId) {
    if (!donHangId) return;
    this._pendingBlSuaFromList = donHangId;
    this.chuyenTrang('ban-le');
  },

  async _timBn() {
    const q = document.getElementById('bt-bl-q')?.value?.trim();
    const box = document.getElementById('bt-bl-bn');
    if (!q || !box) return;
    const res = await Http.layDanhSach(`/benh-nhan/?search=${encodeURIComponent(q)}&page_size=10`);
    const rows = res.data?.results || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      box.innerHTML = '<p class="text-danger">Không tìm thấy.</p>';
      return;
    }
    const b = list[0];
    const pk = this._benhNhanPk(b);
    if (!pk) {
      box.innerHTML = '<p class="text-danger">Dữ liệu bệnh nhân thiếu mã — không bán được.</p>';
      return;
    }
    document.getElementById('bt-bl-bnid').value = pk;
    box.innerHTML = `<p class="mb-0">Đang bán cho: <strong>${this._esc(b.ma_benh_nhan)}</strong> — ${this._esc(b.ho_ten || '')}</p>`;
  },

  _blVeDong() {
    const host = document.getElementById('bt-bl-lines');
    if (!host) return;
    host.innerHTML = this._blRows
      .map((r, i) => {
        const qVal = r.queryText != null && r.queryText !== '' ? r.queryText : r.ten_thuoc || '';
        const picked =
          r.thuoc_id &&
          `<p class="small text-success mb-1">Đã chọn: <strong>${this._esc(r.ten_thuoc)}</strong> — Tồn: <strong>${r.ton_kho ?? '—'}</strong> — ${Number(r.gia_ban || 0).toLocaleString('vi-VN')}đ${r.don_vi_ten ? ` / ${this._esc(r.don_vi_ten)}` : ''}</p>`;
        return `<div class="border rounded p-2 mb-2" data-bl-row="${i}">
      <div class="row g-2 align-items-start">
      <div class="col-md-6">
        <div class="input-group input-group-sm mb-1">
          <input class="form-control bt-bl-q" data-i="${i}" placeholder="Nhập tên thuốc…" value="${this._esc(qVal)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();PageBanThuocDashboard._blTimThuoc(${i});}"/>
          <button type="button" class="btn btn-outline-primary" onclick="PageBanThuocDashboard._blTimThuoc(${i})">Tìm</button>
        </div>
        <div id="bt-bl-kq-${i}" class="small"></div>
        ${picked || ''}
      </div>
      <div class="col-md-3"><label class="small text-muted">Số lượng</label><input type="number" min="1" ${r.ton_kho != null ? `max="${r.ton_kho}"` : ''} class="form-control form-control-sm bt-bl-sl" data-i="${i}" value="${r.so_luong}"/></div>
      <div class="col-md-2 pt-3"><button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="PageBanThuocDashboard._blXoa(${i})">Xóa dòng</button></div>
    </div></div>`;
      })
      .join('');
    document.querySelectorAll('.bt-bl-q').forEach((inp) => {
      inp.oninput = (e) => {
        const i = parseInt(e.target.getAttribute('data-i'), 10);
        this._blRows[i].queryText = e.target.value;
      };
    });
    document.querySelectorAll('.bt-bl-sl').forEach((inp) => {
      inp.onchange = (e) => {
        const i = parseInt(e.target.getAttribute('data-i'), 10);
        this._blRows[i].so_luong = parseInt(e.target.value, 10) || 1;
      };
    });
  },

  async _blTimThuoc(i) {
    const inp = document.querySelector(`.bt-bl-q[data-i="${i}"]`);
    const box = document.getElementById(`bt-bl-kq-${i}`);
    if (!inp || !box) return;
    const q = inp.value.trim();
    if (!q) {
      box.innerHTML = '<span class="text-warning">Nhập tên hoặc mã thuốc.</span>';
      return;
    }
    box.innerHTML = '<span class="text-muted">Đang tìm…</span>';
    const res = await Http.layDanhSach(
      `/thuoc/thuoc/?search=${encodeURIComponent(q)}&ton_kho=con_hang&page_size=20&can_don_thuoc=false&can_tu_van=false`
    );
    const rows = res.data?.results || res.data || [];
    const list = Array.isArray(rows) ? rows : [];
    if (!res.ok || !list.length) {
      box.innerHTML =
        '<span class="text-danger">Không có thuốc còn tồn phù hợp — thử từ khóa khác.</span>';
      return;
    }
    this._blTimCache[i] = list;
    box.innerHTML = `<div class="list-group list-group-flush border rounded">${list
      .map(
        (t, j) =>
          `<button type="button" class="list-group-item list-group-item-action py-1 px-2 text-start" onclick="PageBanThuocDashboard._blChonThuoc(${i},${j})">
            <span class="fw-semibold">${this._esc(t.ten_thuoc)}</span>
            <span class="text-muted small">(${this._esc(t.ma_thuoc || '')})</span>
            <span class="small"> — Tồn ${t.ton_kho ?? 0} — ${Number(t.gia_ban || 0).toLocaleString('vi-VN')}đ</span>
          </button>`
      )
      .join('')}</div>`;
  },

  _blChonThuoc(i, j) {
    const list = this._blTimCache[i];
    const t = list && list[j];
    if (!t) return;
    const tid = t.id != null ? t.id : t.pk;
    if (!tid) return;
    this._blRows[i] = {
      ...this._blRows[i],
      thuoc_id: String(tid),
      ten_thuoc: t.ten_thuoc,
      queryText: t.ten_thuoc,
      ton_kho: t.ton_kho,
      gia_ban: t.gia_ban,
      don_vi_ten: t.don_vi_ten || '',
    };
    const box = document.getElementById(`bt-bl-kq-${i}`);
    if (box) box.innerHTML = '';
    this._blVeDong();
  },

  _blThemDong() {
    this._blRows.push({
      thuoc_id: '',
      ten_thuoc: '',
      queryText: '',
      so_luong: 1,
      ton_kho: null,
      gia_ban: null,
      don_vi_ten: '',
    });
    this._blVeDong();
  },

  _blXoa(i) {
    this._blRows.splice(i, 1);
    if (!this._blRows.length)
      this._blRows = [
        {
          thuoc_id: '',
          ten_thuoc: '',
          queryText: '',
          so_luong: 1,
          ton_kho: null,
          gia_ban: null,
          don_vi_ten: '',
        },
      ];
    this._blTimCache = {};
    this._blVeDong();
  },

  _blThuTuDongHopLe() {
    const items = [];
    for (const r of this._blRows) {
      const tid = String(r.thuoc_id || '').trim();
      if (!tid || tid === 'undefined' || tid === 'null') continue;
      let sl = parseInt(r.so_luong, 10) || 1;
      if (r.ton_kho != null && sl > r.ton_kho) {
        Toast.loi('Số lượng vượt tồn', `${r.ten_thuoc}: tối đa ${r.ton_kho}`, 'error');
        return null;
      }
      items.push({ thuoc_id: tid, so_luong: sl });
    }
    if (!items.length) {
      Toast.loi('Chưa chọn thuốc', 'Tìm theo tên và chọn thuốc trong danh sách cho mỗi dòng.', 'error');
      return null;
    }
    return items;
  },

  async _blTaoHoacCapNhat() {
    if (this._blDonId && this._blCapNhatMode) return this._blCapNhatDon();
    return this._blTaoDon();
  },

  async _blLoadDonDeSua(donHangId, opts) {
    const hidePayment = !!(opts && opts.hidePayment);
    const res = await Http.layDanhSach(`/don-hang/don-hang/${donHangId}/`);
    if (!res.ok || !res.data?.success) {
      return Toast.loi('Không tải được đơn', res.data?.error || '', 'error');
    }
    const d = res.data.data;
    const hd = d.hoa_don;
    if (hd && hd.loai_ban !== 'ban_le') {
      return Toast.loi('Chỉ sửa được đơn bán lẻ (không toa)', '', 'error');
    }
    const bnId = d.benh_nhan?.id;
    if (bnId) {
      const el = document.getElementById('bt-bl-bnid');
      if (el) el.value = bnId;
      const box = document.getElementById('bt-bl-bn');
      if (box) {
        box.innerHTML = `<p class="mb-0">Đang bán cho: <strong>${this._esc(d.benh_nhan.ma_benh_nhan)}</strong> — ${this._esc(d.benh_nhan.ho_ten || '')}</p>`;
      }
    }
    const ct = d.chi_tiet || [];
    this._blRows = ct.map((x) => ({
      thuoc_id: String(x.thuoc_id),
      ten_thuoc: x.ten_thuoc,
      queryText: x.ten_thuoc,
      so_luong: x.so_luong,
      ton_kho: null,
      gia_ban: x.don_gia,
      don_vi_ten: '',
    }));
    if (!this._blRows.length) {
      this._blRows = [
        {
          thuoc_id: '',
          ten_thuoc: '',
          queryText: '',
          so_luong: 1,
          ton_kho: null,
          gia_ban: null,
          don_vi_ten: '',
        },
      ];
    }
    this._blDonId = donHangId;
    this._blCapNhatMode = true;
    const trangThai = d.thong_tin_don_hang?.trang_thai || '';
    this._blSauThanhToan = trangThai === 'DA_THANH_TOAN';
    this._blHoaDon = hd;
    this._blTimCache = {};
    this._blVeDong();
    const paidNote = document.getElementById('bt-bl-sua-paid-note');
    if (paidNote) paidNote.style.display = this._blSauThanhToan ? 'block' : 'none';
    const tt = document.getElementById('bt-bl-tt-wrap');
    if (tt) {
      if (hidePayment || this._blSauThanhToan) tt.style.display = 'none';
      else tt.style.display = 'block';
    }
    const btn = document.getElementById('bt-bl-btn-tao');
    if (btn) {
      btn.textContent = 'Cập nhật đơn';
      btn.disabled = false;
    }
    if (!hidePayment && !this._blSauThanhToan) {
      const ma = document.getElementById('bt-bl-ma');
      const tien = document.getElementById('bt-bl-tien');
      if (ma) ma.textContent = d.ma_don_hang || '';
      if (tien) tien.textContent = String(d.thong_tin_tai_chinh?.tong_tien ?? '');
    }
    document.getElementById('bt-bl-step1')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  async _blMoSuaTruocTt() {
    if (!this._blDonId) return;
    await this._blLoadDonDeSua(this._blDonId, { hidePayment: true });
  },

  async _blCapNhatDon() {
    const items = this._blThuTuDongHopLe();
    if (!items) return;
    if (this._blSauThanhToan) {
      const ok = window.confirm(
        'Đơn đã thanh toán. Cập nhật sẽ chỉnh lại tồn kho và số tiền ghi nhận. Tiếp tục?'
      );
      if (!ok) return;
    }
    const res = await Http.tao(`/don-hang/don-hang/${this._blDonId}/sua-ban-le-tai-quay/`, { items });
    if (!res.ok || !res.data?.success) return Toast.loi('Lỗi', res.data?.error || '', 'error');
    this._blHoaDon = res.data.data.hoa_don || null;
    const ma = document.getElementById('bt-bl-ma');
    const tien = document.getElementById('bt-bl-tien');
    if (ma) ma.textContent = res.data.data.ma_don_hang;
    if (tien) tien.textContent = String(res.data.data.tong_tien);
    this._blCapNhatMode = false;
    const btn = document.getElementById('bt-bl-btn-tao');
    if (btn) btn.textContent = 'Tạo hóa đơn';
    if (this._blHoaDon) this._showHoaDon(this._blHoaDon);
    if (!this._blSauThanhToan) {
      const tt = document.getElementById('bt-bl-tt-wrap');
      if (tt) tt.style.display = 'block';
      this._blKhoaTaoDon(true);
      tt?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      Toast.hien('Đã cập nhật đơn', 'Chọn phương thức thanh toán ở Bước 2 (nếu chưa trả).', 'success');
    } else {
      Toast.hien('Đã cập nhật đơn', 'Tồn kho và số tiền đã được điều chỉnh.', 'success');
      this._blResetBanLeForm();
    }
  },

  _blResetBanLeForm() {
    this._blDonId = null;
    this._blCapNhatMode = false;
    this._blSauThanhToan = false;
    this._blHoaDon = null;
    this._blTimCache = {};
    this._blRows = [
      { thuoc_id: '', ten_thuoc: '', queryText: '', so_luong: 1, ton_kho: null, gia_ban: null, don_vi_ten: '' },
    ];
    this._blVeDong();
    const bn = document.getElementById('bt-bl-bnid');
    if (bn) bn.value = '';
    const bbox = document.getElementById('bt-bl-bn');
    if (bbox) bbox.innerHTML = '';
    const paidNote = document.getElementById('bt-bl-sua-paid-note');
    if (paidNote) paidNote.style.display = 'none';
    const tt = document.getElementById('bt-bl-tt-wrap');
    if (tt) tt.style.display = 'none';
    const btn = document.getElementById('bt-bl-btn-tao');
    if (btn) {
      btn.textContent = 'Tạo hóa đơn';
      btn.disabled = false;
    }
    this._blKhoaTaoDon(false);
  },

  async _blTaoDon() {
    if (this._blDonId && !this._blCapNhatMode) {
      return Toast.loi(
        'Đang có đơn chờ thanh toán',
        'Dùng «Sửa danh sách thuốc» (Bước 2) hoặc thanh toán xong trước khi tạo đơn mới.',
        'warning'
      );
    }
    let bn = document.getElementById('bt-bl-bnid')?.value?.trim();
    if (bn === 'undefined' || bn === 'null') bn = '';
    if (!bn) return Toast.loi('Chọn / tìm bệnh nhân trước', '', 'error');
    const items = this._blThuTuDongHopLe();
    if (!items) return;
    const res = await Http.tao('/don-hang/don-hang/ban-thuoc-le/', { benh_nhan_id: bn, items });
    if (!res.ok || !res.data?.success) return Toast.loi('Lỗi', res.data?.error || '', 'error');
    this._blDonId = res.data.data.don_hang_id;
    this._blHoaDon = res.data.data.hoa_don || null;
    this._blCapNhatMode = false;
    this._blSauThanhToan = false;
    const paidNote = document.getElementById('bt-bl-sua-paid-note');
    if (paidNote) paidNote.style.display = 'none';
    document.getElementById('bt-bl-ma').textContent = res.data.data.ma_don_hang;
    document.getElementById('bt-bl-tien').textContent = String(res.data.data.tong_tien);
    const tt = document.getElementById('bt-bl-tt-wrap');
    if (tt) tt.style.display = 'block';
    const vnp = document.getElementById('bt-bl-vnp-msg');
    const vnpQr = document.getElementById('bt-bl-vnp-qr');
    if (vnp) vnp.textContent = '';
    if (vnpQr) vnpQr.innerHTML = '';
    this._blKhoaTaoDon(true);
    if (this._blHoaDon) this._showHoaDon(this._blHoaDon);
    tt?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    Toast.hien(
      'Đã tạo hóa đơn',
      'Chọn Tiền mặt (COD) hoặc VNPay ở Bước 2 để hoàn tất đơn.',
      'success'
    );
  },

  _blInHoaDonGanNhat() {
    if (this._blHoaDon) this._showHoaDon(this._blHoaDon);
    else Toast.loi('Chưa có dữ liệu hóa đơn', 'Tạo đơn trước hoặc thanh toán xong.', 'error');
  },

  async _blTt(code) {
    if (!this._blDonId) return;
    if (code === 'TIEN_MAT') {
      const ok = window.confirm(
        'Xác nhận khách đã trả đủ tiền mặt (COD) tại quầy?\n\nSau khi xác nhận:\n• Đơn được đánh dấu đã thanh toán\n• Đơn xuất hiện trong mục «Đơn đã hoàn thành»'
      );
      if (!ok) return;
    }
    const res = await Http.tao(`/don-hang/don-hang/${this._blDonId}/thanh-toan/`, {
      phuong_thuc: code,
      noi_dung: 'Thanh toán tại quầy (bán lẻ)',
    });
    if (res.ok && res.data?.success) {
      if (res.data.data?.hoa_don) {
        this._blHoaDon = res.data.data.hoa_don;
        this._showHoaDon(this._blHoaDon);
      }
      Toast.hien('Đã hoàn tất', 'Đơn bán lẻ đã thanh toán và lưu vào «Đơn đã hoàn thành»', 'success');
      const tt = document.getElementById('bt-bl-tt-wrap');
      if (tt) tt.style.display = 'none';
      this._blHoaDon = null;
      this._blDonId = null;
      this._blKhoaTaoDon(false);
      this._blResetBanLeForm();
      await this._taiDanhSachToaXong();
    } else Toast.loi('Lỗi', res.data?.error || '', 'error');
  },

  async _blTtVnpay() {
    if (!this._blDonId) return;
    const msg = document.getElementById('bt-bl-vnp-msg');
    const qrBox = document.getElementById('bt-bl-vnp-qr');
    if (qrBox) qrBox.innerHTML = '';
    const res = await Http.tao(`/don-hang/don-hang/${this._blDonId}/vnpay-tao-url/`, {});
    if (!res.ok || !res.data?.success) {
      if (msg)
        msg.textContent =
          res.data?.error || 'Không tạo được link (kiểm tra cấu hình VNPAY trên server).';
      return;
    }
    const url = res.data.data?.payment_url;
    if (msg)
      msg.innerHTML =
        '<strong>Đã tạo link thanh toán.</strong> Đơn sẽ chuyển sang hoàn tất khi VNPay xác nhận (thường vài phút sau khi khách thanh toán). Có thể bấm «In hóa đơn» sau khi thanh toán xong.';
    if (url) {
      window.open(url, '_blank');
      if (qrBox) {
        const enc = encodeURIComponent(url);
        qrBox.innerHTML = `<p class="small fw-semibold mb-1">QR thanh toán (quét bằng app ngân hàng)</p>
          <img alt="QR VNPay" width="180" height="180" style="max-width:100%;border:1px solid #ddd;border-radius:8px"
            src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${enc}" />`;
      }
      this._blSauMoVnpay();
    }
  },
};

window.PageBanThuocDashboard = PageBanThuocDashboard;
