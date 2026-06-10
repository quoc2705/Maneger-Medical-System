// js/pages/register.js
console.log('register.js loaded');

function renderRegisterPage() {
    console.log('renderRegisterPage called');
    const app = document.getElementById('app');
    if (!app) {
        console.error('App element not found!');
        return;
    }
    
    console.log('Rendering register form');
    
    app.innerHTML = `
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-header">
                    <div class="logo">
                        <i class="fas fa-hospital-user"></i>
                    </div>
                    <h2>Đăng ký tài khoản</h2>
                    <p>Vui lòng điền đầy đủ thông tin bên dưới</p>
                </div>
                <div id="alert-container"></div>
                <form id="register-form">
                    <div class="form-group">
                        <label for="fullname">Họ và tên <span style="color: red;">*</span></label>
                        <input type="text" id="fullname" name="fullname" required 
                               placeholder="Nhập họ tên đầy đủ">
                    </div>
                    <div class="form-group">
                        <label for="username">Tên đăng nhập <span style="color: red;">*</span></label>
                        <input type="text" id="username" name="username" required 
                               placeholder="Tên đăng nhập (không dấu, không khoảng trắng)">
                        <small style="color: #666;">Dùng để đăng nhập, không thể thay đổi sau</small>
                    </div>
                    <div class="form-group">
                        <label for="email">Email <span style="color: red;">*</span></label>
                        <input type="email" id="email" name="email" required 
                               placeholder="example@email.com">
                    </div>
                    <div class="form-group">
                        <label for="phone">Số điện thoại <span style="color: red;">*</span></label>
                        <input type="tel" id="phone" name="phone" required 
                               placeholder="0xxxxxxxxx (10-11 số)" pattern="0[0-9]{9,10}">
                        <small style="color: #666;">Số điện thoại phải bắt đầu bằng 0 và có 10-11 số</small>
                    </div>
                    <div class="form-group">
                        <label for="ngay_sinh">Ngày sinh <span style="color: red;">*</span></label>
                        <input type="date" id="ngay_sinh" name="ngay_sinh" required>
                    </div>
                    <div class="form-group">
                        <label for="gioi_tinh">Giới tính <span style="color: red;">*</span></label>
                        <select id="gioi_tinh" name="gioi_tinh" required>
                            <option value="NAM">Nam</option>
                            <option value="NU">Nữ</option>
                            <option value="KHAC">Khác</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="dia_chi">Địa chỉ <span style="color: red;">*</span></label>
                        <input type="text" id="dia_chi" name="dia_chi" required 
                               placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành">
                    </div>
                    <div class="form-group">
                        <label for="password">Mật khẩu <span style="color: red;">*</span></label>
                        <input type="password" id="password" name="password" required 
                               placeholder="Mật khẩu (tối thiểu 8 ký tự)">
                        <small style="color: #666;">Mật khẩu phải có ít nhất 8 ký tự</small>
                    </div>
                    <div class="form-group">
                        <label for="password2">Xác nhận mật khẩu <span style="color: red;">*</span></label>
                        <input type="password" id="password2" name="password2" required 
                               placeholder="Nhập lại mật khẩu">
                    </div>
                    <button type="submit" class="btn btn-primary" id="register-btn">
                        Đăng ký
                    </button>
                </form>
                <div style="text-align: center; margin-top: 20px;">
                    <p>Đã có tài khoản? <a href="/login/">Đăng nhập ngay</a></p>
                </div>
            </div>
        </div>
    `;
    
    const form = document.getElementById('register-form');
    if (form) {
        console.log('Adding register form submit handler');
        form.addEventListener('submit', handleRegister);
    } else {
        console.error('Register form not found after rendering');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    console.log('handleRegister called');
    
    // Lấy các giá trị từ form
    const fullname = document.getElementById('fullname').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const ngaySinh = document.getElementById('ngay_sinh').value;
    const gioiTinh = (document.getElementById('gioi_tinh').value || 'KHAC').toUpperCase();
    const diaChi = document.getElementById('dia_chi').value.trim();
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password2').value;
    
    // Validate dữ liệu đầu vào
    const errors = [];
    
    if (!fullname) {
        errors.push('Họ và tên không được để trống');
    }
    
    if (!username) {
        errors.push('Tên đăng nhập không được để trống');
    } else if (username.length < 3) {
        errors.push('Tên đăng nhập phải có ít nhất 3 ký tự');
    } else if (/\s/.test(username)) {
        errors.push('Tên đăng nhập không được chứa khoảng trắng');
    }
    
    if (!email) {
        errors.push('Email không được để trống');
    } else if (!isValidEmail(email)) {
        errors.push('Email không hợp lệ');
    }
    
    if (!phone) {
        errors.push('Số điện thoại không được để trống');
    } else if (!isValidPhone(phone)) {
        errors.push('Số điện thoại phải bắt đầu bằng 0 và có 10-11 số');
    }

    if (!ngaySinh) {
        errors.push('Ngày sinh không được để trống');
    }

    if (!diaChi) {
        errors.push('Địa chỉ không được để trống');
    }
    
    if (!password) {
        errors.push('Mật khẩu không được để trống');
    } else if (password.length < 8) {
        errors.push('Mật khẩu phải có ít nhất 8 ký tự');
    } else {
        if (!/[A-Z]/.test(password)) errors.push('Mật khẩu phải có ít nhất 1 chữ hoa');
        if (!/\d/.test(password)) errors.push('Mật khẩu phải có ít nhất 1 chữ số');
        if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt');
    }
    
    if (password !== password2) {
        errors.push('Mật khẩu xác nhận không khớp');
    }
    
    if (errors.length > 0) {
        showAlert(errors.join('<br>'), 'error');
        return;
    }
    
    // Hiển thị loading
    const btn = document.getElementById('register-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;
    
    // Chuẩn bị dữ liệu gửi lên server
    const data = {
        ten_dang_nhap: username,
        ho_ten: fullname,
        email: email,
        so_dien_thoai: phone,
        ngay_sinh: ngaySinh,
        gioi_tinh: gioiTinh,
        dia_chi: diaChi,
        password: password,
        password2: password2,
        vai_tro: 'BENH_NHAN'
    };
    
    console.log('Sending register data:', { ...data, password: '***' });
    
    try {
        // Register route theo DRF router: /api/users/register/
        const response = await fetch('/api/users/register/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('Register response status:', response.status);
        console.log('Register response data:', result);
        
        if (response.ok) {
            showAlert('Đăng ký thành công! Vui lòng đăng nhập.', 'success');
            
            setTimeout(() => {
                window.location.href = '/login/';
            }, 2000);
        } else {
            const errorMessage = window.ApiErrors
                ? ApiErrors.format({ data: result }, 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.')
                : 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.';
            showAlert(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showAlert('Lỗi kết nối đến server. Vui lòng kiểm tra kết nối mạng.', 'error');
    } finally {
        // Khôi phục nút
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    if (!container) return;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = message;
    
    container.innerHTML = '';
    container.appendChild(alert);
    
    setTimeout(() => {
        if (alert.parentNode) alert.remove();
    }, 5000);
}

// Hàm kiểm tra email hợp lệ
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    return emailRegex.test(email);
}

// Hàm kiểm tra số điện thoại hợp lệ
function isValidPhone(phone) {
    const phoneRegex = /^0[0-9]{9,10}$/;
    return phoneRegex.test(phone);
}

// Export to global
window.renderRegisterPage = renderRegisterPage;
window.handleRegister = handleRegister;

console.log('register.js exports set:', typeof window.renderRegisterPage);