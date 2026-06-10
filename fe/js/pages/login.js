/**
 * Trang Đăng nhập / Đăng ký
 */
const PageDangNhap = {
  _rendered: false,
  render() {
    if (this._rendered) return;
    this._rendered = true;

    document.getElementById('app-root').innerHTML = `
      <div id="toast-container"></div>
      <div class="auth-page">
        <div class="auth-left">
          <div class="auth-brand">
            <div class="auth-brand-icon">🏥</div>
            <div>
              <h1 class="t-display">Phòng<span style="color:var(--c-mint)">Khám</span>+</h1>
              <p style="color:rgba(255,255,255,.5);font-size:13px;letter-spacing:1px">HỆ THỐNG QUẢN LÝ PHÒNG KHÁM</p>
            </div>
          </div>

          <ul class="auth-features">
            <li><span class="auth-feature-icon" style="background:rgba(0,201,167,.2)">📅</span>
                Đặt lịch khám và tiêm chủng trực tuyến</li>
            <li><span class="auth-feature-icon" style="background:rgba(59,130,246,.2)">💊</span>
                Mua thuốc online, giao tận nhà</li>
            <li><span class="auth-feature-icon" style="background:rgba(239,68,68,.2)">📱</span>
                Nhận SMS nhắc lịch tự động</li>
            <li><span class="auth-feature-icon" style="background:rgba(139,92,246,.2)">🔐</span>
                Bảo mật JWT, mã hóa dữ liệu</li>
          </ul>

          <div class="auth-footnote">
            Hệ thống quản lý phòng khám<br>
            REST API + WebSocket (TCP/IP)
          </div>
        </div>

        <div class="auth-right">
          <div class="auth-box">
            <!-- TABS -->
            <div class="auth-tabs">
              <button class="auth-tab active" id="tab-dang-nhap" onclick="PageDangNhap.doiTab('dang-nhap')">
                <i class="fas fa-sign-in-alt"></i> Đăng nhập
              </button>
              <button class="auth-tab" id="tab-dang-ky" onclick="PageDangNhap.doiTab('dang-ky')">
                <i class="fas fa-user-plus"></i> Đăng ký
              </button>
            </div>

            <!-- ─── FORM ĐĂNG NHẬP ─── -->
            <div id="form-dang-nhap">
              <h2 style="color:var(--c-navy);margin-bottom:6px">Chào mừng trở lại!</h2>
              <p class="text-muted mb-3">Đăng nhập để tiếp tục</p>

              <div class="form-alert error" id="loi-dang-nhap"></div>

              <div class="form-group">
                <label class="form-label">Tên tài khoản / Email</label>
                <div class="form-control-icon">
                  <i class="fas fa-user input-icon"></i>
                  <input id="dn-tai-khoan" type="text" class="form-control"
                         placeholder="ten_tai_khoan hoặc email"
                         onkeydown="if(event.key==='Enter')PageDangNhap.dangNhap()">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Mật khẩu</label>
                <div class="form-control-icon">
                  <i class="fas fa-lock input-icon"></i>
                  <input id="dn-mat-khau" type="password" class="form-control"
                         placeholder="Nhập mật khẩu"
                         onkeydown="if(event.key==='Enter')PageDangNhap.dangNhap()">
                  <i class="fas fa-eye input-icon-right" onclick="PageDangNhap.doiHienMatKhau('dn-mat-khau', this)"></i>
                </div>
                <div style="text-align:right;margin-top:6px">
                  <a href="#" class="auth-link" onclick="event.preventDefault();PageDangNhap.doiTab('quen-mk')">Quên mật khẩu?</a>
                </div>
              </div>

              <button class="btn btn-primary btn-lg btn-block mb-2" id="nut-dang-nhap"
                      onclick="PageDangNhap.dangNhap()">
                <i class="fas fa-sign-in-alt"></i> Đăng nhập
              </button>
            </div>

            <!-- ─── FORM QUÊN MẬT KHẨU ─── -->
            <div id="form-quen-mk" class="d-none">
              <h2 style="color:var(--c-navy);margin-bottom:6px">Quên mật khẩu</h2>
              <p class="text-muted mb-3">Nhập email đã đăng ký — chúng tôi sẽ gửi liên kết đặt lại mật khẩu</p>

              <div class="form-alert error" id="loi-quen-mk"></div>
              <div class="form-alert success" id="thanh-cong-quen-mk" style="display:none"></div>

              <div class="form-group">
                <label class="form-label">Email</label>
                <div class="form-control-icon">
                  <i class="fas fa-envelope input-icon"></i>
                  <input id="qm-email" type="email" class="form-control" placeholder="email@example.com"
                         onkeydown="if(event.key==='Enter')PageDangNhap.guiYeuCauQuenMk()">
                </div>
              </div>

              <button class="btn btn-primary btn-lg btn-block mb-2" id="nut-quen-mk"
                      onclick="PageDangNhap.guiYeuCauQuenMk()">
                <i class="fas fa-paper-plane"></i> Gửi liên kết
              </button>
              <button type="button" class="btn btn-ghost btn-block" onclick="PageDangNhap.doiTab('dang-nhap')">
                <i class="fas fa-arrow-left"></i> Quay lại đăng nhập
              </button>
            </div>

            <!-- ─── FORM ĐẶT LẠI MẬT KHẨU ─── -->
            <div id="form-dat-lai-mk" class="d-none">
              <h2 style="color:var(--c-navy);margin-bottom:6px">Đặt lại mật khẩu</h2>
              <p class="text-muted mb-3">Nhập mật khẩu mới cho tài khoản của bạn</p>

              <div class="form-alert error" id="loi-dat-lai-mk"></div>

              <div class="form-group">
                <label class="form-label">Mật khẩu mới *</label>
                <div class="form-control-icon">
                  <i class="fas fa-lock input-icon"></i>
                  <input id="dl-mat-khau" type="password" class="form-control" placeholder="••••••••">
                  <i class="fas fa-eye input-icon-right" onclick="PageDangNhap.doiHienMatKhau('dl-mat-khau', this)"></i>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Xác nhận mật khẩu *</label>
                <div class="form-control-icon">
                  <i class="fas fa-lock input-icon"></i>
                  <input id="dl-mat-khau2" type="password" class="form-control" placeholder="••••••••"
                         onkeydown="if(event.key==='Enter')PageDangNhap.datLaiMatKhau()">
                  <i class="fas fa-eye input-icon-right" onclick="PageDangNhap.doiHienMatKhau('dl-mat-khau2', this)"></i>
                </div>
              </div>

              <button class="btn btn-primary btn-lg btn-block mb-2" id="nut-dat-lai-mk"
                      onclick="PageDangNhap.datLaiMatKhau()">
                <i class="fas fa-key"></i> Đặt lại mật khẩu
              </button>
              <button type="button" class="btn btn-ghost btn-block" onclick="PageDangNhap.doiTab('dang-nhap')">
                <i class="fas fa-arrow-left"></i> Quay lại đăng nhập
              </button>
            </div>

            <!-- ─── FORM ĐĂNG KÝ ─── -->
            <div id="form-dang-ky" class="d-none">
              <h2 style="color:var(--c-navy);margin-bottom:6px">Tạo tài khoản mới</h2>
              <p class="text-muted mb-3">Đăng ký tài khoản bệnh nhân</p>

              <div class="form-alert error" id="loi-dang-ky"></div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Họ tên *</label>
                  <input id="dk-ho-ten" type="text" class="form-control" placeholder="Nguyễn Văn A">
                </div>
                <div class="form-group">
                  <label class="form-label">Ngày sinh</label>
                  <input id="dk-ngay-sinh" type="date" class="form-control">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Tên tài khoản *</label>
                  <input id="dk-tai-khoan" type="text" class="form-control" placeholder="ten_tai_khoan">
                </div>
                <div class="form-group">
                  <label class="form-label">Giới tính</label>
                  <select id="dk-gioi-tinh" class="form-control">
                    <option value="NAM">Nam</option>
                    <option value="NU">Nữ</option>
                    <option value="KHAC">Khác</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Email *</label>
                <div class="form-control-icon">
                  <i class="fas fa-envelope input-icon"></i>
                  <input id="dk-email" type="email" class="form-control" placeholder="email@example.com">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Địa chỉ *</label>
                <input id="dk-dia-chi" type="text" class="form-control" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành">
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Số điện thoại *</label>
                  <div class="form-control-icon">
                    <i class="fas fa-phone input-icon"></i>
                    <input id="dk-sdt" type="tel" class="form-control" placeholder="0901234567">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Mật khẩu * (≥6 ký tự)</label>
                  <div class="form-control-icon">
                    <i class="fas fa-lock input-icon"></i>
                    <input id="dk-mat-khau" type="password" class="form-control" placeholder="••••••••">
                    <i class="fas fa-eye input-icon-right" onclick="PageDangNhap.doiHienMatKhau('dk-mat-khau',this)"></i>
                  </div>
                </div>
              </div>

              <button class="btn btn-mint btn-lg btn-block" onclick="PageDangNhap.dangKy()">
                <i class="fas fa-user-plus"></i> Tạo tài khoản
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- auth styles: css/auth.css -->
    `;

    if (window.UIEnhance) window.UIEnhance.bindThemeToggles();

    const params = new URLSearchParams(window.location.search);
    const resetUid = params.get('reset');
    const resetToken = params.get('token');
    if (resetUid && resetToken) {
      this._resetUid = resetUid;
      this._resetToken = resetToken;
      setTimeout(() => this.doiTab('dat-lai-mk'), 50);
    } else {
      setTimeout(() => document.getElementById('dn-tai-khoan')?.focus(), 100);
    }
  },

  doiTab(tab) {
    const tabDangNhap = document.getElementById('tab-dang-nhap');
    const tabDangKy = document.getElementById('tab-dang-ky');
    const formDangNhap = document.getElementById('form-dang-nhap');
    const formDangKy = document.getElementById('form-dang-ky');
    const formQuenMk = document.getElementById('form-quen-mk');
    const formDatLaiMk = document.getElementById('form-dat-lai-mk');
    const authTabs = document.querySelector('.auth-tabs');

    const showTabs = tab === 'dang-nhap' || tab === 'dang-ky';
    if (authTabs) authTabs.style.display = showTabs ? '' : 'none';

    if (tabDangNhap) tabDangNhap.classList.toggle('active', tab === 'dang-nhap');
    if (tabDangKy) tabDangKy.classList.toggle('active', tab === 'dang-ky');
    if (formDangNhap) formDangNhap.classList.toggle('d-none', tab !== 'dang-nhap');
    if (formDangKy) formDangKy.classList.toggle('d-none', tab !== 'dang-ky');
    if (formQuenMk) formQuenMk.classList.toggle('d-none', tab !== 'quen-mk');
    if (formDatLaiMk) formDatLaiMk.classList.toggle('d-none', tab !== 'dat-lai-mk');

    if (tab === 'dang-nhap' && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  },

  doiHienMatKhau(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const dang = input.type === 'password';
    input.type = dang ? 'text' : 'password';
    icon.className = `fas fa-${dang ? 'eye-slash' : 'eye'} input-icon-right`;
  },

  _hienLoi(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  },

  _anLoi(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  async dangKy() {
        this._anLoi('loi-dang-ky');

        const flattenErrors = (obj, prefix = '') => {
            if (obj == null) return [];
            if (typeof obj === 'string') return [prefix ? `${prefix}: ${obj}` : obj];
            if (Array.isArray(obj)) return obj.flatMap((it) => flattenErrors(it, prefix));
            if (typeof obj === 'object') {
                return Object.entries(obj).flatMap(([k, v]) => flattenErrors(v, prefix ? `${prefix}.${k}` : k));
            }
            return [String(obj)];
        };

        let gioiTinh = (document.getElementById('dk-gioi-tinh')?.value || '').trim();
        // BE expects gioi_tinh in uppercase choices: NAM | NU | KHAC
        if (!gioiTinh) gioiTinh = 'KHAC';
        gioiTinh = gioiTinh.toUpperCase();

        const duLieu = {
            ten_dang_nhap: document.getElementById('dk-tai-khoan').value.trim(),
            ho_ten: document.getElementById('dk-ho-ten').value.trim(),
            email: document.getElementById('dk-email').value.trim(),
            so_dien_thoai: document.getElementById('dk-sdt').value.trim(),
            password: document.getElementById('dk-mat-khau').value,
            password2: document.getElementById('dk-mat-khau').value,  // Confirm password
            ngay_sinh: document.getElementById('dk-ngay-sinh').value || null,
            gioi_tinh: gioiTinh,
            dia_chi: document.getElementById('dk-dia-chi').value.trim(),
            vai_tro: 'BENH_NHAN'
        };

        // Validate
        if (!duLieu.ho_ten) {
            this._hienLoi('loi-dang-ky', 'Vui lòng nhập họ tên');
            return;
        }
        if (!duLieu.ten_dang_nhap) {
            this._hienLoi('loi-dang-ky', 'Vui lòng nhập tên đăng nhập');
            return;
        }
        if (!duLieu.email) {
            this._hienLoi('loi-dang-ky', 'Vui lòng nhập email');
            return;
        }
        if (!duLieu.so_dien_thoai) {
            this._hienLoi('loi-dang-ky', 'Vui lòng nhập số điện thoại');
            return;
        }
        if (!duLieu.ngay_sinh) {
            this._hienLoi('loi-dang-ky', 'Vui lòng nhập ngày sinh');
            return;
        }
        if (!duLieu.dia_chi) {
            this._hienLoi('loi-dang-ky', 'Vui lòng nhập địa chỉ');
            return;
        }
        if (duLieu.password.length < 8) {
            this._hienLoi('loi-dang-ky', 'Mật khẩu tối thiểu 8 ký tự');
            return;
        }
        if (!/[A-Z]/.test(duLieu.password) || !/\d/.test(duLieu.password) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(duLieu.password)) {
            this._hienLoi('loi-dang-ky', 'Mật khẩu cần ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt');
            return;
        }

        const btn = document.querySelector('#form-dang-ky button');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

        const { ok, data } = await Auth.dangKy(duLieu);

        btn.disabled = false;
        btn.innerHTML = originalText;

        if (ok) {
            Toast.ok('Đăng ký thành công!', `Chào mừng ${duLieu.ho_ten} đến với PhòngKhám+`);
            setTimeout(() => {
                if (typeof App !== 'undefined' && App.khoidong) {
                    App.khoidong();
                }
            }, 600);
        } else {
            const msg = flattenErrors(data || {}).join('. ') || 'Đăng ký thất bại';
            this._hienLoi('loi-dang-ky', msg);
        }
    },

  async dangNhap() {
    const ten = document.getElementById('dn-tai-khoan').value.trim();
    const mk = document.getElementById('dn-mat-khau').value;
    this._anLoi('loi-dang-nhap');

    if (!ten || !mk) {
      this._hienLoi('loi-dang-nhap', 'Vui lòng nhập tên đăng nhập và mật khẩu');
      return;
    }

    const btn = document.getElementById('nut-dang-nhap');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Đang đăng nhập...';
    }

    const { ok, data } = await Auth.dangNhap(ten, mk);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Đăng nhập';
    }

    if (ok && data) {
      Toast.ok('Đăng nhập thành công', `Xin chào, ${data.ho_ten || ten}!`);
      const role = (data.vai_tro || '').toUpperCase();
      if (role === 'ADMIN') {
        window.location.href = '/admin-dashboard/';
      } else {
        window.location.href = '/';
      }
      return;
    }

    const flat =
      data && typeof data === 'object'
        ? data.detail ||
          data.non_field_errors?.[0] ||
          (Array.isArray(data.password) ? data.password[0] : null) ||
          (Array.isArray(data.ten_dang_nhap) ? data.ten_dang_nhap[0] : null)
        : null;
    this._hienLoi('loi-dang-nhap', flat || 'Sai tên đăng nhập hoặc mật khẩu');
  },

  async guiYeuCauQuenMk() {
    this._anLoi('loi-quen-mk');
    const successEl = document.getElementById('thanh-cong-quen-mk');
    if (successEl) successEl.style.display = 'none';

    const email = document.getElementById('qm-email')?.value.trim();
    if (!email) {
      this._hienLoi('loi-quen-mk', 'Vui lòng nhập email');
      return;
    }

    const btn = document.getElementById('nut-quen-mk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
    }

    const { ok, data } = await Auth.quenMatKhau(email);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi liên kết';
    }

    if (ok) {
      const msg = data?.message || 'Đã gửi hướng dẫn đến email (nếu tồn tại trong hệ thống).';
      if (successEl) {
        successEl.textContent = msg;
        successEl.style.display = 'block';
      }
      if (data?.reset_url) {
        console.info('DEV reset link:', data.reset_url);
      }
      return;
    }

    const err =
      data?.email?.[0] ||
      data?.detail ||
      (typeof data === 'object' ? Object.values(data).flat()[0] : null);
    this._hienLoi('loi-quen-mk', err || 'Không gửi được yêu cầu');
  },

  async datLaiMatKhau() {
    this._anLoi('loi-dat-lai-mk');

    const mk = document.getElementById('dl-mat-khau')?.value || '';
    const mk2 = document.getElementById('dl-mat-khau2')?.value || '';

    if (!mk || !mk2) {
      this._hienLoi('loi-dat-lai-mk', 'Vui lòng nhập và xác nhận mật khẩu mới');
      return;
    }
    if (mk.length < 8) {
      this._hienLoi('loi-dat-lai-mk', 'Mật khẩu tối thiểu 8 ký tự');
      return;
    }
    if (!/[A-Z]/.test(mk) || !/\d/.test(mk) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(mk)) {
      this._hienLoi('loi-dat-lai-mk', 'Mật khẩu cần ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt');
      return;
    }
    if (mk !== mk2) {
      this._hienLoi('loi-dat-lai-mk', 'Mật khẩu xác nhận không khớp');
      return;
    }

    const btn = document.getElementById('nut-dat-lai-mk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    }

    const { ok, data } = await Auth.datLaiMatKhau(this._resetUid, this._resetToken, mk, mk2);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-key"></i> Đặt lại mật khẩu';
    }

    if (ok) {
      Toast.ok('Thành công', data?.message || 'Đặt lại mật khẩu thành công');
      this._resetUid = null;
      this._resetToken = null;
      this.doiTab('dang-nhap');
      return;
    }

    const err =
      data?.detail ||
      data?.new_password?.[0] ||
      (typeof data === 'object' ? Object.values(data).flat()[0] : null);
    this._hienLoi('loi-dat-lai-mk', err || 'Không đặt lại được mật khẩu');
  },
};

// Expose ra window để App.showLogin() nhìn thấy.
// Nếu không, App sẽ rơi về fallback login và bạn sẽ không thấy tab đăng ký + phần giới thiệu hệ thống.
window.PageDangNhap = PageDangNhap;