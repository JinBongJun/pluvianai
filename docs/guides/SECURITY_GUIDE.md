# 🔒 AgentGuard 보안 가이드

> **목표**: 암호화, 토큰 관리, 시크릿 관리, 규정 준수 등 보안에 필요한 모든 정보

---

## 📋 목차

1. [인증/인가](#1-인증인가)
2. [암호화](#2-암호화)
3. [토큰 관리](#3-토큰-관리)
4. [시크릿 관리](#4-시크릿-관리)
5. [입력 검증 및 방어](#5-입력-검증-및-방어)
6. [보안 헤더](#6-보안-헤더)
7. [규정 준수](#7-규정-준수)
8. [보안 모니터링](#8-보안-모니터링)

---

## 1. 인증/인가

### 1.1 JWT 기반 인증

**JWT 구조**:
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "user_id": 1,
    "email": "user@example.com",
    "exp": 1640995200,
    "iat": 1640908800
  },
  "signature": "..."
}
```

**JWT 생성**:
```python
# backend/app/core/security.py
import jwt
from datetime import datetime, timedelta
from app.core.config import settings

def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```

**JWT 검증**:
```python
def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### 1.2 Password Hashing

**bcrypt 사용**:
```python
# backend/app/core/security.py
import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)  # 12 rounds (권장)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
```

**bcrypt Rounds**: 12 (권장, 보안과 성능의 균형)

### 1.3 Refresh Token Rotation

**Refresh Token 생성**:
```python
def create_refresh_token(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```

**Refresh Token Rotation**:
```python
def rotate_refresh_token(old_token: str, user_id: int) -> tuple[str, str]:
    # 기존 토큰 검증
    payload = verify_token(old_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    
    # 새 토큰 생성
    new_access_token = create_access_token(user_id, payload["email"])
    new_refresh_token = create_refresh_token(user_id)
    
    # 기존 토큰 무효화 (Redis에 블랙리스트 추가)
    blacklist_token(old_token)
    
    return new_access_token, new_refresh_token
```

### 1.4 RBAC (Role-Based Access Control)

**역할 정의**:
```python
# backend/app/core/permissions.py
from enum import Enum

class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"

class Permission(str, Enum):
    PROJECT_CREATE = "project:create"
    PROJECT_READ = "project:read"
    PROJECT_UPDATE = "project:update"
    PROJECT_DELETE = "project:delete"
    FIREWALL_MANAGE = "firewall:manage"
```

**권한 매핑**:
```python
ROLE_PERMISSIONS = {
    Role.OWNER: [
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.PROJECT_UPDATE,
        Permission.PROJECT_DELETE,
        Permission.FIREWALL_MANAGE,
    ],
    Role.ADMIN: [
        Permission.PROJECT_READ,
        Permission.PROJECT_UPDATE,
        Permission.FIREWALL_MANAGE,
    ],
    Role.MEMBER: [
        Permission.PROJECT_READ,
    ],
}
```

### 1.5 테넌트 격리

**project_id 필수 체크**:
```python
# backend/app/core/permissions.py
def check_project_access(
    project_id: int,
    user: User,
    db: Session,
    required_roles: List[Role] = None
) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # 소유자 확인
    if project.owner_id == user.id:
        return project
    
    # 조직 멤버 확인
    org_member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == project.organization_id,
        OrganizationMember.user_id == user.id
    ).first()
    
    if not org_member:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if required_roles and org_member.role not in required_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    return project
```

---

## 2. 암호화

### 2.1 데이터 암호화

**암호화 알고리즘**: AES-256-GCM

**구현**:
```python
# backend/app/core/encryption.py
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

class EncryptionService:
    def __init__(self, key: bytes):
        self.key = key
        self.aesgcm = AESGCM(key)
    
    def encrypt(self, plaintext: str) -> bytes:
        nonce = os.urandom(12)  # 96-bit nonce
        ciphertext = self.aesgcm.encrypt(nonce, plaintext.encode(), None)
        return nonce + ciphertext
    
    def decrypt(self, ciphertext: bytes) -> str:
        nonce = ciphertext[:12]
        encrypted_data = ciphertext[12:]
        plaintext = self.aesgcm.decrypt(nonce, encrypted_data, None)
        return plaintext.decode()
```

### 2.2 전송 암호화

**TLS 1.3 사용**:
- 최소 TLS 버전: 1.2
- 권장 TLS 버전: 1.3
- 강력한 암호화 스위트만 허용

**HTTPS 강제**:
```python
# backend/app/middleware/security_middleware.py
from fastapi import Request
from fastapi.responses import RedirectResponse

async def force_https(request: Request, call_next):
    if request.url.scheme != "https" and settings.ENVIRONMENT == "production":
        return RedirectResponse(
            url=str(request.url).replace("http://", "https://"),
            status_code=301
        )
    return await call_next(request)
```

---

## 3. 토큰 관리

### 3.1 토큰 만료 시간

**Access Token**: 60분
**Refresh Token**: 30일

**설정**:
```python
# backend/app/core/config.py
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60
JWT_REFRESH_TOKEN_EXPIRE_DAYS = 30
```

### 3.2 토큰 저장 방식

**Access Token**: 메모리 (클라이언트)
**Refresh Token**: HttpOnly Cookie

**구현**:
```python
# backend/app/api/v1/endpoints/auth.py
from fastapi import Response

@router.post("/login")
async def login(response: Response, credentials: LoginDTO):
    # ... 인증 로직 ...
    
    # Refresh Token을 HttpOnly Cookie로 설정
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,  # HTTPS만
        samesite="strict",
        max_age=30 * 24 * 60 * 60  # 30일
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600
    }
```

### 3.3 토큰 무효화

**블랙리스트 관리**:
```python
# backend/app/core/security.py
import redis

redis_client = redis.from_url(settings.REDIS_URL)

def blacklist_token(token: str, expire_seconds: int = 3600):
    """토큰을 블랙리스트에 추가"""
    redis_client.setex(f"blacklist:{token}", expire_seconds, "1")

def is_token_blacklisted(token: str) -> bool:
    """토큰이 블랙리스트에 있는지 확인"""
    return redis_client.exists(f"blacklist:{token}") > 0
```

---

## 4. 시크릿 관리

### 4.1 시크릿 저장소

**AWS Secrets Manager 사용**:
```python
# backend/app/core/secrets.py
import boto3
import json

secrets_client = boto3.client('secretsmanager', region_name='us-east-1')

def get_secret(secret_name: str) -> dict:
    response = secrets_client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])
```

**로컬 개발**: `.env` 파일 사용

### 4.2 시크릿 로테이션

**로테이션 주기**:
- JWT Secret: 90일
- API Keys: 180일
- 데이터베이스 비밀번호: 365일

**자동 로테이션**:
```python
# backend/app/services/secret_rotation_service.py
class SecretRotationService:
    def rotate_jwt_secret(self):
        # 새 시크릿 생성
        new_secret = generate_secret()
        
        # AWS Secrets Manager에 업데이트
        update_secret("jwt_secret", new_secret)
        
        # 기존 토큰은 유효하지만, 새 토큰은 새 시크릿으로 생성
        # 점진적 마이그레이션
```

### 4.3 API Key Rotation

**API Key 생성**:
```python
# backend/app/services/api_key_service.py
import secrets

def generate_api_key() -> str:
    return f"ag_{secrets.token_urlsafe(32)}"

def create_api_key(user_id: int, name: str) -> str:
    api_key = generate_api_key()
    hashed_key = hash_password(api_key)  # bcrypt로 해시
    
    # DB에 해시된 키 저장
    db_api_key = APIKey(
        user_id=user_id,
        name=name,
        hashed_key=hashed_key
    )
    db.add(db_api_key)
    db.commit()
    
    # 원본 키는 한 번만 반환 (재조회 불가)
    return api_key
```

---

## 5. 입력 검증 및 방어

### 5.1 SQL Injection 방어

**SQLAlchemy ORM 사용**:
```python
# ✅ 안전
project = db.query(Project).filter(Project.id == project_id).first()

# ❌ 위험 (절대 사용하지 않음)
db.execute(f"SELECT * FROM projects WHERE id = {project_id}")
```

### 5.2 XSS 방어

**CSP 헤더**:
```python
# backend/app/middleware/security_middleware.py
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:;"
    )
    return response
```

### 5.3 CSRF 방어

**SameSite Cookie**:
```python
response.set_cookie(
    key="session",
    value=session_id,
    samesite="strict",  # CSRF 방어
    secure=True,
    httponly=True
)
```

### 5.4 SSRF 방어

**프록시 요청 검증**:
```python
# backend/app/services/proxy_service.py
ALLOWED_HOSTS = [
    "api.openai.com",
    "api.anthropic.com",
    # ... 허용된 호스트만
]

def validate_upstream_url(url: str):
    parsed = urlparse(url)
    if parsed.hostname not in ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="Forbidden host")
```

---

## 6. 보안 헤더

### 6.1 보안 헤더 설정

**구현**:
```python
# backend/app/middleware/security_middleware.py
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # HSTS
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # X-Frame-Options
    response.headers["X-Frame-Options"] = "DENY"
    
    # X-Content-Type-Options
    response.headers["X-Content-Type-Options"] = "nosniff"
    
    # Referrer-Policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # CSP
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    
    return response
```

### 6.2 CORS 설정

**프로덕션 환경별 Origin 제한**:
```python
# backend/app/core/config.py
CORS_ORIGINS = {
    "production": [
        "https://app.agentguard.ai",
        "https://agentguard.ai"
    ],
    "staging": [
        "https://staging.agentguard.ai"
    ],
    "development": ["*"]
}
```

---

## 7. 규정 준수

### 7.1 GDPR 준수

**데이터 처리 법적 근거**:
- 계약 이행 (서비스 제공)
- 합법적 이익 (서비스 개선)
- 동의 (마케팅)

**사용자 권리 구현**:
- 접근 권리: 데이터 Export 기능
- 삭제 권리: 계정 삭제 시 모든 데이터 삭제
- 수정 권리: 프로필 수정 기능
- 이전 권리: 데이터 Export (JSON/CSV)

**데이터 삭제 요청 처리**:
```python
# backend/app/services/gdpr_service.py
class GDPRService:
    def delete_user_data(self, user_id: int):
        # 1. 사용자 데이터 삭제
        db.query(Snapshot).filter(Snapshot.project_id.in_(
            db.query(Project.id).filter(Project.owner_id == user_id)
        )).delete()
        
        # 2. 사용자 계정 삭제
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
```

### 7.2 SOC2 준수

**SOC2 Type 1 준비 (6개월)**:
- 보안 정책 문서화
- 액세스 제어 프로세스 구축
- 모니터링 시스템 구축

**SOC2 Type 1 인증 (12개월)**:
- 외부 감사 진행
- 보안 정책 검증
- 액세스 제어 검증

**SOC2 Type 2 인증 (18개월)**:
- 연속 모니터링 구축
- 정기적 감사
- 지속적 개선

### 7.3 CCPA 준수

**캘리포니아 주민 권리**:
- 데이터 판매 금지
- 데이터 삭제 권리
- 데이터 접근 권리
- 선택적 동의

---

## 8. 보안 모니터링

### 8.1 보안 이벤트 로깅

**로깅 대상**:
- 로그인 시도 (성공/실패)
- 권한 변경
- 중요한 설정 변경
- API Key 생성/삭제

**구현**:
```python
# backend/app/core/audit.py
def log_security_event(
    user_id: int,
    event_type: str,
    details: dict
):
    audit_log = AuditLog(
        user_id=user_id,
        action_type=event_type,
        action_description=f"Security event: {event_type}",
        activity_data=details
    )
    db.add(audit_log)
    db.commit()
```

### 8.2 침입 탐지

**의심스러운 활동 감지**:
- 비정상적인 로그인 시도
- 권한 상승 시도
- 대량 데이터 접근

**알림**:
- 즉시 관리자에게 알림
- 자동 차단 (필요시)

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**참고**: [../DETAILED_DESIGN.md](../DETAILED_DESIGN.md) - 메인 아키텍처 문서
