/**
 * api.js — Trung tâm gọi API REST + quản lý WebSocket
 * Hệ thống Quản lý Phòng khám
 */

// api.js - Thêm vào đầu file
console.log('api.js loaded');
// Hàm lấy CSRF token từ cookie
function getCSRFToken() {
    const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrftoken='));
    return cookieValue ? cookieValue.split('=')[1] : '';
}

// Hàm gọi API với CSRF token
async function apiCall(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken(),  // Thêm CSRF token vào header
        },
        credentials: 'include',  // Quan trọng: gửi kèm cookies
    };
    
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        }
    };
    
    try {
        const response = await fetch(url, mergedOptions);
        const data = await response.json();
        return { response, data };
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}


// ══════════════════════════════════════════
// CẤU HÌNH
// ══════════════════════════════════════════
const CFG = {
  // Dùng cùng host đang truy cập để client LAN tự động gọi đúng server IP.
  API_BASE: window.location.origin,
  WS_BASE: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`,
};

/** Gom lỗi validation API (nested details) thành chuỗi đọc được. */
const ApiErrors = {
  FIELD_LABELS: {
    ten_dang_nhap: 'Tên đăng nhập',
    email: 'Email',
    so_dien_thoai: 'Số điện thoại',
    password: 'Mật khẩu',
    password2: 'Nhập lại mật khẩu',
    ho_ten: 'Họ tên',
    nguoi_dung: 'Tài khoản',
    ma_bac_si: 'Mã bác sĩ',
    ma_nhan_vien: 'Mã nhân viên',
    ma_benh_nhan: 'Mã bệnh nhân',
    chuyen_khoa: 'Chuyên khoa',
    so_giay_phep: 'Số giấy phép',
    phong_ban: 'Phòng ban',
    ngay_sinh: 'Ngày sinh',
    dia_chi: 'Địa chỉ',
    gioi_tinh: 'Giới tính',
    chuc_vu: 'Chức vụ',
    non_field_errors: '',
  },

  _label(key) {
    return this.FIELD_LABELS[key] || String(key).replace(/_/g, ' ');
  },

  collect(payload, prefix = '') {
    if (payload == null) return [];
    if (typeof payload === 'string') return [prefix ? `${prefix}: ${payload}` : payload];
    if (Array.isArray(payload)) {
      return payload.flatMap((item) => this.collect(item, prefix));
    }
    if (typeof payload === 'object') {
      return Object.entries(payload).flatMap(([key, value]) => {
        const label = this._label(key);
        const nextPrefix = prefix ? `${prefix} → ${label}` : label;
        return this.collect(value, nextPrefix);
      });
    }
    return [prefix ? `${prefix}: ${String(payload)}` : String(payload)];
  },

  /** @param {{ok?:boolean,status?:number,data?:object}|object|null} res */
  format(res, fallback = 'Thao tác thất bại') {
    const d = res && typeof res === 'object' && 'data' in res ? res.data : res;
    if (d == null) {
      if (res && res.status) return `HTTP ${res.status}`;
      return fallback;
    }
    if (typeof d === 'string') return d;
    if (d.error && d.details) {
      const details = this.collect(d.details).join('; ');
      return details ? `${d.error}: ${details}` : String(d.error);
    }
    if (d.error) return String(d.error);
    if (d.detail) {
      return typeof d.detail === 'string' ? d.detail : this.collect(d.detail).join('; ');
    }
    if (d.non_field_errors) {
      const nf = this.collect(d.non_field_errors).join('; ');
      if (nf) return nf;
    }
    const collected = this.collect(d);
    return collected.length ? collected.join('; ') : fallback;
  },

  validateMatKhau(pw) {
    if (!pw || pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
    if (!/[A-Z]/.test(pw)) return 'Mật khẩu cần ít nhất 1 chữ hoa';
    if (!/\d/.test(pw)) return 'Mật khẩu cần ít nhất 1 số';
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pw)) {
      return 'Mật khẩu cần ít nhất 1 ký tự đặc biệt';
    }
    return null;
  },

  normalizePhoneVN(s) {
    let d = String(s || '').replace(/\D/g, '');
    if (d.startsWith('84') && d.length >= 11 && d[2] === '9') {
      d = '0' + d.slice(2);
      if (d.length > 11) d = d.slice(0, 11);
    } else if (d.length === 9 && d[0] === '9') {
      d = '0' + d;
    }
    return d;
  },
};
window.ApiErrors = ApiErrors;

// ══════════════════════════════════════════
// LƯU TRỮ PHIÊN (localStorage)
// ══════════════════════════════════════════
const Phien = {
  lay: (key)         => localStorage.getItem(key),
  luu: (key, val) => {
    // Lưu cả 2 chuẩn key để tránh mismatch giữa các đoạn code.
    localStorage.setItem(key, val);
    if (key === 'accessToken') localStorage.setItem('access_token', val);
    if (key === 'refreshToken') localStorage.setItem('refresh_token', val);
    if (key === 'vaiTro') localStorage.setItem('vai_tro', val);
    if (key === 'hoTen') localStorage.setItem('ho_ten', val);
    if (key === 'userId') localStorage.setItem('user_id', val);
    if (key === 'access_token') localStorage.setItem('accessToken', val);
    if (key === 'refresh_token') localStorage.setItem('refreshToken', val);
    if (key === 'vai_tro') localStorage.setItem('vaiTro', val);
    if (key === 'ho_ten') localStorage.setItem('hoTen', val);
    if (key === 'user_id') localStorage.setItem('userId', val);
  },
  xoa: (key) => {
    localStorage.removeItem(key);
    if (key === 'accessToken') localStorage.removeItem('access_token');
    if (key === 'refreshToken') localStorage.removeItem('refresh_token');
    if (key === 'vaiTro') localStorage.removeItem('vai_tro');
    if (key === 'hoTen') localStorage.removeItem('ho_ten');
    if (key === 'userId') localStorage.removeItem('user_id');
    if (key === 'access_token') localStorage.removeItem('accessToken');
    if (key === 'refresh_token') localStorage.removeItem('refreshToken');
    if (key === 'vai_tro') localStorage.removeItem('vaiTro');
    if (key === 'ho_ten') localStorage.removeItem('hoTen');
    if (key === 'user_id') localStorage.removeItem('userId');
  },
  xoaTat: ()         => {
    [
      'accessToken','refreshToken','vaiTro','hoTen','userId',
      'access_token','refresh_token','vai_tro','ho_ten','user_id',
    ].forEach(k => localStorage.removeItem(k));
  },
  layTatCa: () => ({
    accessToken:  localStorage.getItem('accessToken')  || localStorage.getItem('access_token')  || '',
    refreshToken: localStorage.getItem('refreshToken') || localStorage.getItem('refresh_token') || '',
    vaiTro:        localStorage.getItem('vaiTro')      || localStorage.getItem('vai_tro')       || '',
    hoTen:         localStorage.getItem('hoTen')       || localStorage.getItem('ho_ten')        || '',
    userId:        localStorage.getItem('userId')      || localStorage.getItem('user_id')       || '',
  }),
};

// ══════════════════════════════════════════
// HTTP CLIENT
// ══════════════════════════════════════════
const Http = {
  /**
   * Gọi REST API
   * @param {string} duongDan   - Đường dẫn VD: '/lich-hen/'
   * @param {string} phuong    - GET | POST | PUT | PATCH | DELETE
   * @param {object|null} body - Dữ liệu gửi đi
   * @param {boolean} canToken - Có cần JWT token?
   * @returns {object} { ok, status, data }
   */

  async goi(duongDan, phuong = 'GET', body = null, canToken = true) {
    // KHÔNG thêm /api vào đây nếu duongDan đã có /api
    let url = duongDan;
    if (!url.startsWith('http') && !url.startsWith('/api/') && !url.startsWith('/')) {
        url = `/api/${url}`;
    } else if (!url.startsWith('http') && !url.startsWith('/api/') && url.startsWith('/')) {
        // Nếu đã bắt đầu bằng / nhưng không phải /api/, thì thêm /api
        if (!url.startsWith('/api/')) {
            url = `/api${url}`;
        }
    }
    
    const headers = { 'Content-Type': 'application/json' };
    const { accessToken } = Phien.layTatCa();

    if (canToken && accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = { method: phuong, headers };
    if (body) config.body = JSON.stringify(body);

    let fetchUrl = `${CFG.API_BASE}${url}`;
    if (phuong === 'GET') {
        config.cache = 'no-store';
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
    }

    try {
        let res = await fetch(fetchUrl, config);

        // Token hết hạn → thử làm mới
        if (res.status === 401 && canToken) {
            const laMoi = await Http.lamMoiToken();
            if (laMoi) {
                headers['Authorization'] = `Bearer ${Phien.lay('accessToken')}`;
                res = await fetch(fetchUrl, { ...config, headers });
            } else {
                Auth.dangXuat();
                return { ok: false, status: 401, data: null };
            }
        }

        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await res.json();
        }

        return { ok: res.ok, status: res.status, data };
    } catch (loi) {
        console.error('[Http] Lỗi kết nối:', loi);
        Toast.hien('Lỗi kết nối', 'Không thể kết nối đến máy chủ', 'error');
        return { ok: false, status: 0, data: null };
    }
},

  async layDanhSach(duongDan) { return Http.goi(duongDan, 'GET'); },
  async tao(duongDan, body)   { return Http.goi(duongDan, 'POST', body); },
  async capNhat(duongDan, body) { return Http.goi(duongDan, 'PUT', body); },
  async suaCuc(duongDan, body) { return Http.goi(duongDan, 'PATCH', body); },
  async xoa(duongDan)         { return Http.goi(duongDan, 'DELETE'); },

  /**
   * Tải file đính kèm (PDF, Excel, …) — trả true nếu thành công.
   */
  async taiFile(url) {
    let apiUrl = url;
    if (!apiUrl.startsWith('http')) {
      if (!apiUrl.startsWith('/')) apiUrl = `/${apiUrl}`;
      if (!apiUrl.startsWith('/api/')) apiUrl = `/api${apiUrl}`;
    }
    const qIdx = apiUrl.indexOf('?');
    if (qIdx > -1) {
      const pathPart = apiUrl.slice(0, qIdx);
      const queryPart = apiUrl.slice(qIdx);
      if (!pathPart.endsWith('/')) apiUrl = `${pathPart}/${queryPart}`;
    } else if (!apiUrl.endsWith('/')) {
      apiUrl += '/';
    }

    const { accessToken } = Phien.layTatCa();
    const headers = { Accept: '*/*' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    try {
      let res = await fetch(`${CFG.API_BASE}${apiUrl}`, { method: 'GET', headers });
      if (res.status === 401 && accessToken) {
        const laMoi = await Http.lamMoiToken();
        if (laMoi) {
          headers['Authorization'] = `Bearer ${Phien.lay('accessToken')}`;
          res = await fetch(`${CFG.API_BASE}${apiUrl}`, { method: 'GET', headers });
        } else {
          Auth.dangXuat();
          return false;
        }
      }
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        let msg = `Không xuất được file (HTTP ${res.status})`;
        if (ct.includes('application/json')) {
          const err = await res.json().catch(() => ({}));
          msg = err.error || err.detail || msg;
        } else {
          const txt = await res.text().catch(() => '');
          if (txt && txt.length < 300) msg = txt;
        }
        Toast.hien('Lỗi xuất file', msg, 'error');
        return false;
      }
      const blob = await res.blob();
      let filename = 'bao-cao';
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^";\n]+)"?/);
      if (m) filename = m[1];
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      return true;
    } catch (loi) {
      console.error('[Http.taiFile]', loi);
      Toast.hien('Lỗi kết nối', 'Không thể tải file báo cáo', 'error');
      return false;
    }
  },

  async lamMoiToken() {
    const { refreshToken } = Phien.layTatCa();
    if (!refreshToken) return false;
    try {
      let res = await fetch(`${CFG.API_BASE}/api/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!res.ok) {
        res = await fetch(`${CFG.API_BASE}/auth/lam-moi-token/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        });
      }
      if (res.ok) {
        const d = await res.json();
        Phien.luu('accessToken', d.access);
        if (d.refresh) Phien.luu('refreshToken', d.refresh);
        return true;
      }
      return false;
    } catch { return false; }
  },
};

// ══════════════════════════════════════════
// AUTH MODULE
// ══════════════════════════════════════════
// Giả sử trong api.js có class Auth
const Auth = {
  // Lấy base URL từ config
  baseURL: '',  // Vì Django template render cùng domain
  
  async dangNhap(tenDangNhap, matKhau) {
      try {
          const response = await fetch('/api/users/login/', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'X-CSRFToken': getCSRFToken(),
              },
              credentials: 'same-origin',
              body: JSON.stringify({
                  ten_dang_nhap: tenDangNhap,
                  password: matKhau
              })
          });

          const raw = await response.text();
          let data = {};
          try {
              data = raw ? JSON.parse(raw) : {};
          } catch {
              return {
                  ok: false,
                  data: { detail: raw ? raw.slice(0, 200) : 'Phản hồi không hợp lệ từ máy chủ' },
              };
          }

          if (!response.ok) {
              console.error('Login failed:', data);
              return { ok: false, data };
          }

          if (!data.access) {
              return { ok: false, data: data.detail ? data : { ...data, detail: 'Thiếu token đăng nhập' } };
          }

          localStorage.setItem('access_token', data.access);
          localStorage.setItem('refresh_token', data.refresh || '');
          if (typeof Phien !== 'undefined' && Phien.luu) {
              Phien.luu('accessToken', data.access);
              if (data.refresh) Phien.luu('refreshToken', data.refresh);
          }

          const userData = { ...(data.user || {}) };
          if (data.role_data && typeof data.role_data === 'object') {
              userData.role_data = data.role_data;
              if (data.role_data.id) {
                  const vr = (userData.vai_tro || '').toUpperCase();
                  if (vr === 'BENH_NHAN') userData.benh_nhan_id = data.role_data.id;
                  if (vr === 'BAC_SI') userData.bac_si_id = data.role_data.id;
              } else if (data.role_data.nguoi_dung) {
                  userData.benh_nhan_id = data.role_data.nguoi_dung;
              }
              if (data.role_data.chuc_vu) userData.chuc_vu = data.role_data.chuc_vu;
          }
          if (!userData.vai_tro && data.role_data) {
              if (data.role_data.ma_bac_si) userData.vai_tro = 'BAC_SI';
              else if (data.role_data.ma_nhan_vien) userData.vai_tro = 'NHAN_VIEN';
              else if (data.role_data.ma_benh_nhan) userData.vai_tro = 'BENH_NHAN';
              else userData.vai_tro = 'BENH_NHAN';
          }

          localStorage.setItem('user_info', JSON.stringify(userData));
          return { ok: true, data: userData };
      } catch (error) {
          console.error('Login error:', error);
          return { ok: false, data: { detail: 'Lỗi kết nối server' } };
      }
  }, 
  
  async quenMatKhau(email) {
    try {
      const response = await fetch('/api/users/forgot_password/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data };
    } catch (error) {
      console.error('Forgot password error:', error);
      return { ok: false, data: { detail: 'Lỗi kết nối server' } };
    }
  },

  async datLaiMatKhau(uid, token, newPassword, newPassword2) {
    try {
      const response = await fetch('/api/users/reset_password/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          uid,
          token,
          new_password: newPassword,
          new_password2: newPassword2,
        }),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data };
    } catch (error) {
      console.error('Reset password error:', error);
      return { ok: false, data: { detail: 'Lỗi kết nối server' } };
    }
  },

  async dangKy(userData) {
    try {
      // Register route theo DRF router: /api/users/register/
      const response = await fetch('/api/users/register/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Lưu token sau khi đăng ký
        if (data.access) {
          
          localStorage.setItem('access_token', data.access);
          localStorage.setItem('refresh_token', data.refresh);
          localStorage.setItem('user_info', JSON.stringify(data.user));
        }
        return { ok: true, data: data.user };
      }
      console.error('Register failed:', data);
      return { ok: false, data: data };
    } catch (error) {
      console.error('Register error:', error);
      return { ok: false, data: { detail: 'Lỗi kết nối server' } };
    }
  },
  
  laDaDangNhap() {
    const token = localStorage.getItem('access_token');
    return !!token;
  },
  
  layThongTin() {
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      const user = JSON.parse(userInfo);
      const rd = user.role_data || {};
      return {
        hoTen: user.ho_ten,
        vaiTro: user.vai_tro?.toLowerCase(),
        chucVu: rd.chuc_vu || user.chuc_vu || '',
        email: user.email,
        soDienThoai: user.so_dien_thoai
      };
    }
    return { hoTen: '', vaiTro: '', chucVu: '', email: '', soDienThoai: '' };
  },
  
  getToken() {
    return localStorage.getItem('access_token');
  },

  dangXuat() {
    try {
      if (WsManager && WsManager.dongTat) WsManager.dongTat();
    } catch {}
    // Xóa theo cả 2 chuẩn key để chắc chắn không còn token
    try {
      if (Phien && Phien.xoaTat) Phien.xoaTat();
    } catch {}
    localStorage.removeItem('user_info');
    window.location.href = '/login/';
  }
};

// ══════════════════════════════════════════
// WEBSOCKET MANAGER
// ══════════════════════════════════════════
const WsManager = {
  _connections: {},

  /**
   * Mở WebSocket kết nối
   * @param {string} ten   - Tên định danh ('thong-bao' | 'chat-123')
   * @param {string} path  - Path VD: '/ws/thong-bao/'
   * @param {object} handlers - { onOpen, onMessage, onClose, onError }
   */
  mo(ten, path, handlers = {}) {
    const { accessToken } = Phien.layTatCa();
    const url = `${CFG.WS_BASE}${path}?token=${accessToken}`;

    if (this._connections[ten]) {
      this._connections[ten].close();
    }

    try {
      const ws = new WebSocket(url);

      ws.onopen    = () => handlers.onOpen && handlers.onOpen(ws);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onMessage && handlers.onMessage(data);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };
      ws.onclose   = (e) => {
        console.log(`[WS:${ten}] Closed:`, e.code);
        handlers.onClose && handlers.onClose(e);
      };
      ws.onerror   = (e) => {
        console.warn(`[WS:${ten}] Lỗi kết nối`, e);
        handlers.onError && handlers.onError(e);
      };

      this._connections[ten] = ws;
      return ws;
    } catch (e) {
      console.warn(`[WS:${ten}] WebSocket không khả dụng:`, e);
      return null;
    }
  },

  gui(ten, data) {
    const ws = this._connections[ten];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  },

  dong(ten) {
    if (this._connections[ten]) {
      this._connections[ten].close();
      delete this._connections[ten];
    }
  },

  dongTat() {
    Object.keys(this._connections).forEach(k => this.dong(k));
  },

  trangThai(ten) {
    const ws = this._connections[ten];
    if (!ws) return 'DISCONNECTED';
    return ['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState] || 'UNKNOWN';
  },
};

// ══════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════
const Toast = {
  _container: null,

  _layContainer() {
    if (!this._container) {
      this._container = document.getElementById('toast-container');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'toast-container';
        document.body.appendChild(this._container);
      }
    }
    return this._container;
  },

  /**
   * @param {string} tieu - Tiêu đề
   * @param {string} noi  - Nội dung
   * @param {string} loai - 'success' | 'error' | 'warning' | 'info'
   * @param {number} thoiGian - ms (default 4000)
   */
  hien(tieu, noi = '', loai = 'info', thoiGian = 4000) {
    const container = this._layContainer();
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info',
    };
    const el = document.createElement('div');
    el.className = `toast ${loai}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span class="toast-icon"><i class="fas ${icons[loai] || 'fa-bell'}"></i></span>
      <div class="toast-body">
        <div class="toast-title">${tieu}</div>
        ${noi ? `<div class="toast-msg">${noi}</div>` : ''}
      </div>
      <button type="button" class="toast-close" aria-label="Đóng" onclick="this.closest('.toast').remove()"><i class="fas fa-xmark"></i></button>
    `;
    container.appendChild(el);
    if (thoiGian > 0) {
      setTimeout(() => {
        el.style.transition = 'opacity 0.28s ease, transform 0.28s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        setTimeout(() => el.remove(), 280);
      }, thoiGian);
    }
    return el;
  },

  ok(tieu, noi = '')   { return this.hien(tieu, noi, 'success'); },
  loi(tieu, noi = '')  { return this.hien(tieu, noi, 'error'); },
  canh(tieu, noi = '') { return this.hien(tieu, noi, 'warning'); },
};

// ══════════════════════════════════════════
// MODAL HELPER
// ══════════════════════════════════════════
const Modal = {
  mo(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  },
  dong(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  },
  tao({ id, tieu, noi, chan = '', lon = false }) {
    // Xoá modal cũ nếu có
    const cu = document.getElementById(id);
    if (cu) cu.remove();

    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = id;
    el.innerHTML = `
      <div class="modal ${lon ? 'modal-lg' : ''}">
        <div class="modal-header">
          <h3 class="modal-title">${tieu}</h3>
          <button class="modal-close" onclick="Modal.dong('${id}')">✕</button>
        </div>
        <div class="modal-body">${noi}</div>
        ${chan ? `<div class="modal-footer">${chan}</div>` : ''}
      </div>
    `;
    // Đóng khi click overlay
    el.addEventListener('click', e => { if (e.target === el) Modal.dong(id); });
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    return el;
  },
};

// ══════════════════════════════════════════
// CONFIRM DIALOG (thay window.confirm)
// ══════════════════════════════════════════
const Confirm = {
  _idMacDinh: 'pk-confirm-dialog',

  hien(opts = {}) {
    return new Promise((resolve) => {
      const id = opts.id || this._idMacDinh;
      const cu = document.getElementById(id);
      if (cu) cu.remove();

      const tieu = opts.tieu || 'Xác nhận';
      const noi = opts.noi || '';
      const nutHuy = opts.huy || 'Huỷ';
      const nutOk = opts.ok || 'Đồng ý';
      const loai = opts.loai || 'default';
      const icon = opts.icon || 'fa-circle-question';

      const el = document.createElement('div');
      el.className = 'modal-overlay pk-confirm-overlay';
      el.id = id;
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', `${id}-title`);

      const dong = (result) => {
        document.removeEventListener('keydown', onKey);
        el.classList.remove('open');
        setTimeout(() => {
          el.remove();
          resolve(!!result);
        }, 220);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') dong(false);
        if (e.key === 'Enter') dong(true);
      };

      el.innerHTML = `
        <div class="pk-confirm pk-confirm--${loai}">
          <div class="pk-confirm-icon" aria-hidden="true"><i class="fas ${icon}"></i></div>
          <h3 class="pk-confirm-title" id="${id}-title">${tieu}</h3>
          ${noi ? `<p class="pk-confirm-desc">${noi}</p>` : ''}
          <div class="pk-confirm-actions">
            <button type="button" class="pk-confirm-btn pk-confirm-btn--ghost" data-act="cancel">${nutHuy}</button>
            <button type="button" class="pk-confirm-btn pk-confirm-btn--ok" data-act="ok">${nutOk}</button>
          </div>
        </div>`;

      el.querySelector('[data-act="cancel"]').addEventListener('click', () => dong(false));
      el.querySelector('[data-act="ok"]').addEventListener('click', () => dong(true));
      el.addEventListener('click', (e) => {
        if (e.target === el) dong(false);
      });

      document.body.appendChild(el);
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(() => {
        el.classList.add('open');
        el.querySelector('[data-act="ok"]')?.focus();
      });
    });
  },

  dangXuat() {
    return this.hien({
      tieu: 'Đăng xuất khỏi hệ thống?',
      noi: 'Phiên làm việc hiện tại sẽ kết thúc. Bạn cần đăng nhập lại để tiếp tục sử dụng PhòngKhám+.',
      ok: '<i class="fas fa-right-from-bracket"></i> Đăng xuất',
      huy: 'Ở lại',
      loai: 'logout',
      icon: 'fa-right-from-bracket',
    });
  },
};

// ══════════════════════════════════════════
// ROUTER (Hash-based SPA)
// ══════════════════════════════════════════
const Router = {
  _routes: {},

  dangKy(path, handler) {
    this._routes[path] = handler;
  },

  diDen(path, params = {}) {
    window.location.hash = '#/' + path;
    // Truyền params qua history state
    history.replaceState(params, '', window.location.href);
  },

  xuLy() {
    const hash   = window.location.hash.replace('#/', '') || 'dang-nhap';
    const [path] = hash.split('?');
    const handler = this._routes[path];
    if (handler) handler();
    else if (this._routes['404']) this._routes['404']();
  },

  layParams() {
    return history.state || {};
  },

  batDau() {
    window.addEventListener('hashchange', () => this.xuLy());
    this.xuLy();
  },
};

// ══════════════════════════════════════════
// TIỆN ÍCH GIAO DIỆN
// ══════════════════════════════════════════
const UI = {
  /** Render vào container */
  render(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  },

  /** Hiện loading spinner */
  loading(id) {
    this.render(id, `<div class="page-loading"><div class="spinner"></div><p>Đang tải...</p></div>`);
  },

  /** Trang trống */
  rong(id, icon, tieu, moTa, nutHtml = '') {
    this.render(id, `
      <div class="page-empty">
        <div class="page-empty-icon"><i class="fas ${icon}"></i></div>
        <h3>${tieu}</h3>
        <p class="text-muted">${moTa}</p>
        ${nutHtml ? `<div style="margin-top:14px">${nutHtml}</div>` : ''}
      </div>
    `);
  },

  /** Hiện/ẩn element */
  hien(id)  { const e = document.getElementById(id); if (e) e.classList.remove('d-none'); },
  an(id)    { const e = document.getElementById(id); if (e) e.classList.add('d-none'); },

  /** Lấy giá trị form */
  layForm(ids) {
    const kq = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) kq[id] = el.value;
    });
    return kq;
  },

  /** Format ngày */
  formatNgay(str) {
    if (!str) return '—';
    try {
      return new Date(str).toLocaleDateString('vi-VN');
    } catch {
      return '—';
    }
  },

  formatNgayGio(str) {
    if (!str) return '—';
    try {
      return new Date(str).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  },

  formatTien(so) {
    if (so === undefined || so === null) return '0₫';
    return Number(so).toLocaleString('vi-VN') + '₫';
  },

  /** Lấy chữ cái đầu để làm avatar */
  kyTuDau(ten) {
    if (!ten) return '?';
    return ten.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  },

  /** Badge trạng thái */
  badge(trangThai) {
    // BE trả trạng thái theo UPPERCASE (ví dụ: CHO_XAC_NHAN). FE trước đó đang dùng lowercase
    // nên badge có thể sai. Ở đây normalize để map được cả 2 kiểu.
    const k = (trangThai ?? '').toString();
    const kUpper = k.toUpperCase();
    const kLower = k.toLowerCase();

    const banDo = {
      // LichHen
      CHO_XAC_NHAN: ['badge-pending', 'Chờ xác nhận'],
      DA_XAC_NHAN: ['badge-confirmed', 'Đã xác nhận'],
      DA_DAT: ['badge-info', 'Đã đặt'],
      DANG_KHAM: ['badge-info', 'Đang khám'],
      HOAN_THANH: ['badge-done', 'Hoàn thành'],
      DA_HUY: ['badge-cancelled', 'Đã hủy'],
      VANG_MAT: ['badge-cancelled', 'Vắng mặt'],
      QUA_HAN: ['badge-cancelled', 'Quá hạn'],

      // DonThuoc
      CHO_THANH_TOAN: ['badge-pending', 'Chờ thanh toán'],
      DA_THANH_TOAN: ['badge-confirmed', 'Đã thanh toán'],
      DANG_XU_LY: ['badge-info', 'Đang xử lý'],
      DA_XUAT_THUOC: ['badge-done', 'Đã xuất thuốc'],

      // DonHang (nếu dùng)
      MOI_TAO: ['badge-pending', 'Mới tạo'],
      CHO_THANH_TOAN: ['badge-pending', 'Chờ thanh toán'],
      DANG_CHUAN_BI: ['badge-info', 'Đang chuẩn bị'],
      DANG_GIAO: ['badge-info', 'Đang giao hàng'],
      HOAN_THANH_DONHANG: ['badge-done', 'Hoàn thành'],
    };

    // Hỗ trợ mapping cũ (lowercase FE)
    const banDoLower = {
      cho_xac_nhan: banDo.CHO_XAC_NHAN,
      da_xac_nhan: banDo.DA_XAC_NHAN,
      hoan_thanh: banDo.HOAN_THANH,
      da_huy: banDo.DA_HUY,
      moi: ['badge-pending', 'Mới'],
      benh_nhan_xac_nhan: ['badge-confirmed', 'BN xác nhận'],
      da_mua: ['badge-done', 'Đã mua'],
      tu_choi: ['badge-cancelled', 'Từ chối'],
    };

    const entry =
      banDo[kUpper] ||
      banDoLower[kLower] ||
      banDo[k] ||
      banDoLower[k] ||
      null;

    const [cls, nhan] = entry || ['badge-info', k || '—'];
    return `<span class="badge ${cls}">${nhan}</span>`;
  },
};


// Admin API endpoints
const AdminAPI = {
    async getStats() {
        // Backend routes: /api/ (root) + /api/admin/... (nguoidung.urls)
        return Http.goi('/api/admin/stats/', 'GET');
    },
    
    async getDoctors() {
        return Http.goi('/api/admin/bac-si/', 'GET');
    },
    
    async createDoctor(data) {
        return Http.goi('/api/admin/bac-si/', 'POST', data);
    },
    
    async updateDoctor(id, data) {
        return Http.goi(`/api/admin/bac-si/${id}/`, 'PUT', data);
    },
    
    async deleteDoctor(id) {
        return Http.goi(`/api/admin/bac-si/${id}/`, 'DELETE');
    },
    
    async getPatients() {
        return Http.goi('/api/admin/benh-nhan/', 'GET');
    },
    
    async getStaff() {
        return Http.goi('/api/admin/nhan-vien/', 'GET');
    },
    
    async createStaff(data) {
        return Http.goi('/api/admin/nhan-vien/', 'POST', data);
    },
    
    async updateStaff(id, data) {
        return Http.goi(`/api/admin/nhan-vien/${id}/`, 'PUT', data);
    },
    
    async deleteStaff(id) {
        return Http.goi(`/api/admin/nhan-vien/${id}/`, 'DELETE');
    },
    
    async globalSearch(query) {
        return Http.goi(`/api/admin/search/?q=${encodeURIComponent(query)}`, 'GET');
    }
};

// Thêm App object vào cuối file api.js, trước phần export

// Thay thế toàn bộ App object trong api.js bằng code này

const App = {
    currentPage: 'dashboard',
    _initialized: false,

    /** Sau khi VNPay redirect về (Return URL), URL có query vnp_* — hiển thị toast và xóa query khỏi thanh địa chỉ. */
    xuLyThamSoVnpayTraVe() {
        try {
            const p = new URLSearchParams(window.location.search);
            if (!p.has('vnp_ResponseCode')) return;
            const code = p.get('vnp_ResponseCode') || '';
            const txn = p.get('vnp_TxnRef') || '';
            const schedule = () => {
                if (typeof Toast !== 'undefined') {
                    if (code === '00') {
                        Toast.ok(
                            'Thanh toán VNPay',
                            txn
                                ? `Mã đơn ${txn}. Hệ thống xác nhận qua IPN — kiểm tra email và mục Đơn hàng.`
                                : 'Giao dịch thành công.'
                        );
                    } else {
                        Toast.loi(
                            'Thanh toán chưa hoàn tất',
                            `Mã ${code}. Đơn vẫn chờ thanh toán — vào «Đơn hàng của tôi» để thử lại VNPay.`
                        );
                    }
                }
                const u = new URL(window.location.href);
                u.search = '';
                const hasToken = !!(localStorage.getItem('access_token') || localStorage.getItem('accessToken'));
                if (hasToken && typeof window.PageBenhNhanDashboard !== 'undefined') {
                    u.pathname = '/';
                    u.hash = '';
                    window.history.replaceState({}, document.title, u.pathname);
                    window.setTimeout(() => {
                        if (window.App && window.App.loadDashboard) window.App.loadDashboard();
                        if (window.PageBenhNhanDashboard?.chuyenTrang) {
                            window.PageBenhNhanDashboard.chuyenTrang('don-hang');
                        }
                    }, 300);
                } else {
                    window.history.replaceState({}, document.title, u.pathname + u.hash);
                }
            };
            window.setTimeout(schedule, 200);
        } catch (e) {
            console.warn('xuLyThamSoVnpayTraVe:', e);
        }
    },
    
    async khoidong() {
        if (this._initialized) {
            console.log('App already initialized, re-running routing');
        }
        this._initialized = true;
        
        console.log('App.khoidong started');
        this.xuLyThamSoVnpayTraVe();
        
        const token =
            localStorage.getItem('access_token') ||
            localStorage.getItem('accessToken');
        const userInfoStr = localStorage.getItem('user_info');
        const currentPath = window.location.pathname;
        const normalizePath = (p) => {
            if (!p) return '/';
            if (p !== '/' && p.endsWith('/')) return p.slice(0, -1);
            return p;
        };
        const currentPathNorm = normalizePath(currentPath);
        
        console.log('Current path:', currentPath);
        console.log('Token exists:', !!token);
        console.log('User info exists:', !!userInfoStr);
        
        // TRƯỜNG HỢP 1: Đang ở trang login
        if (currentPathNorm === '/login') {
            console.log('On login page');
            
            // Nếu đã có token, chuyển hướng về trang chủ
            if (token && userInfoStr) {
                try {
                    const userInfo = JSON.parse(userInfoStr);
                    console.log('User role:', userInfo.vai_tro);

                    // Xác thực nhanh token trước khi redirect để tránh vòng lỗi phải F5
                    const me = await Http.layDanhSach('/api/users/me/');
                    if (me && me.ok) {
                        if (userInfo.vai_tro === 'ADMIN' || userInfo.vai_tro === 'admin') {
                            window.location.href = '/admin-dashboard/';
                        } else {
                            window.location.href = '/';
                        }
                        return;
                    }

                    console.warn('Token/user_info cũ không hợp lệ, stay on login');
                    this.clearAuthData();
                } catch(e) {
                    console.error('Parse error:', e);
                    this.clearAuthData();
                }
            }
            
            // Chưa có token, hiển thị form login
            this.showLogin();
            return;
        }
        
        // TRƯỜNG HỢP 2: Đang ở admin dashboard
        if (currentPathNorm === '/admin-dashboard') {
            console.log('On admin dashboard');
            
            if (!token || !userInfoStr) {
                console.log('No token, redirect to login');
                window.location.href = '/login/';
                return;
            }
            
            try {
                const userInfo = JSON.parse(userInfoStr);
                if (userInfo.vai_tro === 'ADMIN' || userInfo.vai_tro === 'admin') {
                    if (typeof AdminDashboard !== 'undefined') {
                        AdminDashboard.init();
                        return;
                    }
                    // Trường hợp script dashboard load chậm hơn App ở lần vào đầu tiên
                    setTimeout(() => {
                        if (typeof AdminDashboard !== 'undefined' && AdminDashboard.init) {
                            AdminDashboard.init();
                        }
                    }, 150);
                    return;
                }
            } catch(e) {}
            
            // Không phải admin, về trang chủ
            window.location.href = '/';
            return;
        }
        
        // TRƯỜNG HỢP 3: Trang chủ hoặc các trang khác
        console.log('On home page or other');

        // Nếu không có token, chuyển đến login
        if (!token || !userInfoStr) {
            console.log('No token, redirect to login');
            window.location.href = '/login/';
            return;
        }

        // Có token, kiểm tra user info
        let userInfo;
        try {
            userInfo = JSON.parse(userInfoStr);
            console.log('[DEBUG] User info on home page:', userInfo);
        } catch(e) {
            console.error('Parse error:', e);
            this.clearAuthData();
            window.location.href = '/login/';
            return;
        }

        // Có token — admin luôn vào panel quản trị, không dùng trang chủ fallback
        if (userInfo.vai_tro === 'ADMIN' || userInfo.vai_tro === 'admin') {
            window.location.href = '/admin-dashboard/';
            return;
        }

        console.log('User is logged in, showing dashboard');
        await this.loadDashboard();
    },

    async chuyenTrang(pageName) {
        this.currentPage = pageName || 'dashboard';
        const { vaiTro, chucVu } = Auth.layThongTin();

        if (vaiTro === 'benh_nhan' && typeof window.PageBenhNhanDashboard !== 'undefined') {
            return window.PageBenhNhanDashboard.chuyenTrang(this.currentPage);
        }

        if (
            vaiTro === 'nhan_vien' &&
            chucVu === 'LE_TAN' &&
            typeof window.PageLeTanDashboard !== 'undefined' &&
            window.PageLeTanDashboard.chuyenTrang
        ) {
            const p = this.currentPage === 'dashboard' ? 'tong-quan' : this.currentPage;
            return window.PageLeTanDashboard.chuyenTrang(p);
        }

        if (typeof window.PageTongQuan !== 'undefined' && window.PageTongQuan.chuyenTrang) {
            return window.PageTongQuan.chuyenTrang(this.currentPage);
        }
        return this.loadDashboard();
    },
    
    showLogin(retryCount = 0) {
        console.log('Showing login page');
        const appRoot = document.getElementById('app-root');
        if (!appRoot) {
            console.error('app-root element not found');
            return;
        }
        
        // Kiểm tra nếu có PageDangNhap thì dùng
        if (typeof window.PageDangNhap !== 'undefined' && window.PageDangNhap.render) {
            window.PageDangNhap.render();
            return;
        }

        // Tránh rơi ngay vào fallback khi script trang login load chậm vài tick đầu.
        if (retryCount < 20) {
            setTimeout(() => this.showLogin(retryCount + 1), 80);
            return;
        }
        appRoot.innerHTML = `
            <div style="min-height: 100vh; display:flex; align-items:center; justify-content:center; color:#0A2342;">
                <div style="text-align:center;">
                    <div class="spinner" style="margin:0 auto 12px"></div>
                    <p>Đang tải trang đăng nhập...</p>
                </div>
            </div>
        `;
    },
    
    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        
        if (!username || !password) {
            if (errorEl) {
                errorEl.textContent = 'Vui lòng nhập tên đăng nhập và mật khẩu';
                errorEl.style.display = 'block';
            }
            return;
        }
        
        // Disable button để tránh click nhiều lần
        const loginBtn = document.querySelector('button[onclick="App.handleLogin()"]');
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Đang đăng nhập...';
        }
        
        try {
            // Login theo DRF route đúng: /api/users/login/
            const response = await fetch('/api/users/login/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ten_dang_nhap: username,
                    password: password
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.access) {
                // Lưu token
                localStorage.setItem('access_token', data.access);
                localStorage.setItem('refresh_token', data.refresh);
                const userData = data.user || {};
                if (data.role_data && typeof data.role_data === 'object') {
                    userData.role_data = data.role_data;
                    if (data.role_data.id) userData.benh_nhan_id = data.role_data.id;
                    else if (data.role_data.nguoi_dung) userData.benh_nhan_id = data.role_data.nguoi_dung;
                    if (data.role_data.chuc_vu) userData.chuc_vu = data.role_data.chuc_vu;
                }
                localStorage.setItem('user_info', JSON.stringify(userData));
                
                // Chuyển hướng
                if (userData.vai_tro === 'ADMIN' || userData.vai_tro === 'admin') {
                window.location.href = '/admin-dashboard/';
                } else {
                    window.location.href = '/';
                }
            } else {
                if (errorEl) {
                    errorEl.textContent = data.detail || data.message || 'Đăng nhập thất bại';
                    errorEl.style.display = 'block';
                }
                // Enable lại button
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Đăng nhập';
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            if (errorEl) {
                errorEl.textContent = 'Lỗi kết nối server. Vui lòng kiểm tra lại.';
                errorEl.style.display = 'block';
            }
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Đăng nhập';
            }
        }
    },
  
    async loadDashboard() {
        console.log('Loading user dashboard');
        const appRoot = document.getElementById('app-root');
        if (!appRoot) {
            console.error('app-root not found');
            return;
        }
        
        const userInfoStr = localStorage.getItem('user_info');
        let userInfo = null;
        let userName = 'User';
        let userRole = '';
        
        if (userInfoStr) {
            try {
                userInfo = JSON.parse(userInfoStr);
                userName = userInfo.ho_ten || 'User';
                userRole = userInfo.vai_tro || '';
                console.log('[DEBUG] User role in loadDashboard:', userRole);
            } catch(e) {
                console.error('Parse error:', e);
            }
        }

        if (userInfo) {
            try {
                const meRes = await Http.layDanhSach('/api/users/me/');
                if (meRes.ok && meRes.data) {
                    const m = meRes.data;
                    userInfo = { ...userInfo, ...m };
                    if (m.nhan_vien) {
                        userInfo.role_data = { ...(userInfo.role_data || {}), ...m.nhan_vien };
                        if (m.nhan_vien.chuc_vu) userInfo.chuc_vu = m.nhan_vien.chuc_vu;
                    }
                    if (m.benh_nhan) {
                        userInfo.role_data = { ...(userInfo.role_data || {}), ...m.benh_nhan };
                    }
                    if (m.bac_si) {
                        userInfo.role_data = { ...(userInfo.role_data || {}), ...m.bac_si };
                    }
                    localStorage.setItem('user_info', JSON.stringify(userInfo));
                    userName = userInfo.ho_ten || userName;
                    userRole = userInfo.vai_tro || userRole;
                }
            } catch (e) {
                console.warn('loadDashboard /me merge:', e);
            }
        }
        
        if ((userRole || '').toUpperCase() === 'ADMIN') {
            window.location.href = '/admin-dashboard/';
            return;
        }

        if ((userRole || '').toLowerCase() === 'benh_nhan' && typeof window.PageBenhNhanDashboard !== 'undefined') {
            console.log('Using PageBenhNhanDashboard.render()');
            window.PageBenhNhanDashboard.render();
            return;
        }

        if ((userRole || '').toUpperCase() === 'BAC_SI' && typeof window.PageBacSiDashboard !== 'undefined') {
            window.PageBacSiDashboard.render();
            return;
        }

        try {
            const rd = userInfo.role_data || userInfo.nhan_vien || {};
            const chucNv = rd.chuc_vu || userInfo.chuc_vu || '';
            if (
                (userRole || '').toLowerCase() === 'nhan_vien' &&
                chucNv === 'BAN_THUOC' &&
                typeof window.PageBanThuocDashboard !== 'undefined' &&
                window.PageBanThuocDashboard.render
            ) {
                window.PageBanThuocDashboard.render();
                return;
            }
            if (
                (userRole || '').toLowerCase() === 'nhan_vien' &&
                chucNv === 'KE_TOAN' &&
                typeof window.PageKeToanDashboard !== 'undefined' &&
                window.PageKeToanDashboard.render
            ) {
                window.PageKeToanDashboard.render();
                return;
            }
            if (
                (userRole || '').toLowerCase() === 'nhan_vien' &&
                chucNv === 'LE_TAN' &&
                typeof window.PageLeTanDashboard !== 'undefined' &&
                window.PageLeTanDashboard.render
            ) {
                window.PageLeTanDashboard.render();
                return;
            }
        } catch (e) {
            console.warn('Nhan vien dashboard routing:', e);
        }

        // NẾU CÓ PageTongQuan, DÙNG NÓ (vai trò khác)
        if (typeof window.PageTongQuan !== 'undefined' && window.PageTongQuan.render) {
            console.log('Using PageTongQuan.render()');
            window.PageTongQuan.render();
            return;
        }
        
        // FALLBACK: HIỂN THỊ DASHBOARD ĐƠN GIẢN
        console.log('Using fallback dashboard');
        appRoot.innerHTML = `
            <div style="min-height: 100vh; background: #f5f7fa;">
                <header style="background: #0A2342; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 20px; font-weight: bold;">🏥 PhòngKhám+</div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span>Xin chào, ${userName}</span>
                        <span style="background: #1B6CA8; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
                            ${userRole || 'Thành viên'}
                        </span>
                        <button onclick="App.logout()" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer;">
                            Đăng xuất
                        </button>
                    </div>
                </header>
                <main style="padding: 20px; max-width: 1200px; margin: 0 auto;">
                    <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                        <h2 style="color: #0A2342;">Đăng nhập thành công!</h2>
                        <p style="color: #666;">Chào mừng bạn đến với PhòngKhám+</p>
                        <p style="color: #666; margin-top: 10px;">Vai trò: <strong>${userRole || 'Thành viên'}</strong></p>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
                        <div style="background: white; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer;" onclick="alert('Đang phát triển')">
                            <div style="font-size: 48px;">📅</div>
                            <h3>Đặt lịch khám</h3>
                        </div>
                        <div style="background: white; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer;" onclick="alert('Đang phát triển')">
                            <div style="font-size: 48px;">💊</div>
                            <h3>Mua thuốc</h3>
                        </div>
                    </div>
                </main>
            </div>
        `;
    },
    
    escapeHtml(str) {
      if (!str) return '';
      return str.replace(/[&<>]/g, function(m) {
          if (m === '&') return '&amp;';
          if (m === '<') return '&lt;';
          if (m === '>') return '&gt;';
          return m;
      });
    },

    clearAuthData() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');
        // Xóa các key cũ từ Phien
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('vaiTro');
        localStorage.removeItem('hoTen');
        localStorage.removeItem('userId');
    },
    
    async logout() {
        const ok = await Confirm.dangXuat();
        if (!ok) return;
        this.clearAuthData();
        window.location.href = '/login/';
    },
};

// Thêm App vào window
window.App = App;

// Khởi tạo tự động khi DOM load - CHỈ MỘT LẦN
let isAppStarted = false;

function startApp() {
    if (isAppStarted) return;
    isAppStarted = true;
    
    if (window.App && window.App.khoidong) {
        window.App.khoidong();
    } else {
        console.error('App not found');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // Delay 1 tick để các script trang (login/admin/benh-nhan) đăng ký xong trước khi App boot.
    setTimeout(startApp, 0);
}

console.log('App registered and ready');

window.AdminAPI = AdminAPI;

// ══════════════════════════════════════════
// XUẤT TOÀN CỤC
// ══════════════════════════════════════════
window.CFG     = CFG;
window.Phien   = Phien;
window.Http    = Http;
window.Auth    = Auth;
window.WsManager = WsManager;
window.Toast   = Toast;
window.Modal   = Modal;
window.Confirm = Confirm;
window.Router  = Router;
window.UI      = UI;