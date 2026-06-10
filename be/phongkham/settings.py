import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

FE_DIR = BASE_DIR.parent / "fe"


SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-your-secret-key-here-change-in-production')

DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() == 'true'

# ALLOWED_HOSTS = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]
ALLOWED_HOSTS = ['*']
# Application definition
INSTALLED_APPS = [
    'daphne',  # Đặt lên đầu cho WebSocket
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'channels',
    
    "django_filters",

    # Local apps
    'nguoidung',
    'benhan',
    'lichhen',
    'thuoc',
    'donhang',
    'trochuyen',
    'thongbao',
    'baocao',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'phongkham.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [FE_DIR],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'phongkham.wsgi.application'
ASGI_APPLICATION = 'phongkham.asgi.application'

# Database - MySQL
DATABASES = {
    'default': {
        'ENGINE': os.environ.get('DB_ENGINE', 'django.db.backends.mysql'),
        'NAME': os.environ.get('DB_NAME', 'phongkham'),
        'USER': os.environ.get('DB_USER', 'root'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        }
    }
}

# Custom User Model
AUTH_USER_MODEL = 'nguoidung.NguoiDung'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'vi-vn'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
# Thêm vào settings.py
STATICFILES_DIRS = [
    FE_DIR,
]



STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CSRF_COOKIE_HTTPONLY = False  # Quan trọng: Cho phép JavaScript đọc cookie
CSRF_COOKIE_SAMESITE = 'Lax'  # Hoặc 'None' nếu dùng cross-site
CSRF_TRUSTED_ORIGINS = [
    origin.strip() for origin in os.environ.get(
        'DJANGO_CSRF_TRUSTED_ORIGINS',
        'http://localhost:8000,http://127.0.0.1:8000,https://gumdrop-steering-tall.ngrok-free.dev'
    ).split(',') if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.environ.get(
        'DJANGO_CORS_ALLOWED_ORIGINS',
        'http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080'
    ).split(',') if origin.strip()
]

CORS_ALLOW_CREDENTIALS = True

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',  # JWT first
        'rest_framework.authentication.SessionAuthentication',  # Session fallback
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',  # Mặc định yêu cầu auth
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# Channels (WebSocket) - Redis
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}

# Celery Configuration
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# SMS (ESMS.vn) — bật trên server thật: SMS_ENABLED=true + khóa hợp lệ trong .env
SMS_ENABLED = os.environ.get('SMS_ENABLED', 'false').lower() == 'true'
SMS_API_KEY = os.environ.get('SMS_API_KEY', 'your-sms-api-key')
SMS_SECRET_KEY = os.environ.get('SMS_SECRET_KEY', 'your-sms-secret-key')
SMS_BRAND_NAME = os.environ.get('SMS_BRAND_NAME', 'PhongKham')

SESSION_COOKIE_HTTPONLY = False  # Cho phép JavaScript đọc session cookie

# URL gốc site (HTTPS khi production) — dùng ghép Return/IPN nếu không khai báo riêng
SITE_URL = (os.environ.get('SITE_URL') or '').strip().rstrip('/')

# VNPay — Merchant đăng ký trên https://vnpay.vn/
# Khai báo Return URL / IPN URL trên cổng merchant phải khớp tuyệt đối với .env
# Sandbox: VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
# Production: VNPAY_PAYMENT_URL=https://vnpayment.vn/paymentv2/vpcpay.html
_vnp_return = (
    os.environ.get('VNPAY_RETURN_URL')
    or os.environ.get('VNP_RETURN_URL')
    or (f'{SITE_URL}/payment/vnpay-return' if SITE_URL else '')
)
_vnp_ipn = (
    os.environ.get('VNPAY_IPN_URL')
    or (f'{SITE_URL}/api/don-hang/vnpay-ipn/' if SITE_URL else '')
)
VNPAY = {
    'TMN_CODE': os.environ.get('VNPAY_TMN_CODE', ''),
    'HASH_SECRET': os.environ.get('VNPAY_HASH_SECRET', ''),
    'PAYMENT_URL': os.environ.get(
        'VNPAY_PAYMENT_URL',
        'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    ),
    'RETURN_URL': _vnp_return,
    'IPN_URL': _vnp_ipn,
}

# Email xác nhận thanh toán VNPay (bệnh nhân mua online)
EMAIL_ENABLED = os.environ.get('EMAIL_ENABLED', 'false').lower() == 'true'
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.smtp.EmailBackend',
)
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'true').lower() == 'true'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get(
    'DEFAULT_FROM_EMAIL',
    EMAIL_HOST_USER or 'noreply@phongkham.local',
)
CLINIC_NAME = os.environ.get('CLINIC_NAME', 'PhòngKhám+')

LOGIN_URL = '/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/login/'