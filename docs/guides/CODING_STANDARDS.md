# 📝 AgentGuard 코딩 표준

> **목표**: 모든 코드가 문서 요구사항을 준수하도록 보장하는 코딩 가이드라인

---

## 📋 목차

1. [API 응답 형식](#1-api-응답-형식)
2. [에러 처리](#2-에러-처리)
3. [로깅](#3-로깅)
4. [입력 검증](#4-입력-검증)
5. [인증/인가](#5-인증인가)
6. [코드 구조](#6-코드-구조)

---

## 1. API 응답 형식

### 1.1 표준 응답 형식 (필수)

**모든 API 응답은 다음 형식을 따라야 합니다:**

```python
from app.core.responses import success_response, error_response, paginated_response

# 성공 응답
return success_response(data=result)

# 페이지네이션 응답
return paginated_response(data=items, page=1, per_page=20, total=100)

# 에러 응답 (예외 핸들러에서 자동 처리)
raise HTTPException(status_code=404, detail="Resource not found")
```

**응답 구조:**
```json
{
  "data": {...},
  "meta": {...}  // 페이지네이션 정보 (선택)
}
```

### 1.2 response_model 제거

**표준 응답 형식을 사용할 때는 `response_model`을 제거합니다:**

```python
# ❌ 잘못된 예
@router.get("/items", response_model=List[ItemResponse])
async def get_items():
    return success_response(data=items)

# ✅ 올바른 예
@router.get("/items")
async def get_items():
    return success_response(data=items)
```

---

## 2. 에러 처리

### 2.1 @handle_errors 데코레이터 (필수)

**모든 엔드포인트에 `@handle_errors` 데코레이터를 추가합니다:**

```python
from app.core.decorators import handle_errors

@router.get("/items")
@handle_errors  # 필수
async def get_items():
    ...
```

### 2.2 에러 응답 형식

**에러는 자동으로 표준 형식으로 변환됩니다:**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {...},
    "origin": "Proxy"  // Proxy, Upstream, Network
  }
}
```

### 2.3 HTTPException 사용

```python
from fastapi import HTTPException, status

# 표준 HTTPException 사용
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Resource not found"
)
```

---

## 3. 로깅

### 3.1 요청 시작 로깅 (필수)

**모든 엔드포인트의 시작 부분에 로깅을 추가합니다:**

```python
from app.core.logging_config import logger

@router.get("/items")
@handle_errors
async def get_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logger.info(
        f"User {current_user.id} requested items",
        extra={"user_id": current_user.id}
    )
    ...
```

### 3.2 요청 완료 로깅 (권장)

**중요한 작업 완료 시 로깅을 추가합니다:**

```python
logger.info(
    f"Items retrieved for user {current_user.id}: {len(items)} items",
    extra={"user_id": current_user.id, "item_count": len(items)}
)
```

### 3.3 로깅 extra 필드

**항상 관련 컨텍스트를 `extra` 필드에 포함합니다:**

```python
logger.info(
    f"User {current_user.id} created project {project_id}",
    extra={
        "user_id": current_user.id,
        "project_id": project_id,
        "project_name": project.name,
    }
)
```

---

## 4. 입력 검증

### 4.1 Pydantic Validator 사용 (필수)

**입력 검증은 Pydantic `@validator`를 사용합니다:**

```python
from pydantic import BaseModel, Field, validator

class ModelValidationRequest(BaseModel):
    new_model: str = Field(..., min_length=1, max_length=100)
    provider: str = Field("openai")
    
    @validator('provider')
    def validate_provider(cls, v):
        allowed = ["openai", "anthropic", "google"]
        if v not in allowed:
            raise ValueError(f"Provider must be one of {allowed}")
        return v
    
    @validator('new_model')
    def validate_model(cls, v, values):
        provider = values.get('provider', 'openai')
        allowed_models = {
            "openai": ["gpt-3.5-turbo", "gpt-4"],
            "anthropic": ["claude-3-opus"],
        }
        if v not in allowed_models.get(provider, []):
            raise ValueError(f"Model '{v}' not allowed for provider '{provider}'")
        return v
```

### 4.2 SQL Injection 방어

**항상 SQLAlchemy ORM을 사용합니다 (SECURITY_GUIDE.md):**

```python
# ✅ 안전
project = db.query(Project).filter(Project.id == project_id).first()

# ❌ 절대 사용하지 않음
db.execute(f"SELECT * FROM projects WHERE id = {project_id}")
```

---

## 5. 인증/인가

### 5.1 인증 체크 (필수)

**모든 보호된 엔드포인트에 `get_current_user`를 사용합니다:**

```python
from app.core.security import get_current_user

@router.get("/items")
@handle_errors
async def get_items(
    current_user: User = Depends(get_current_user),  # 필수
    db: Session = Depends(get_db),
):
    ...
```

### 5.2 프로젝트 접근 체크 (필수)

**프로젝트 관련 엔드포인트에는 `check_project_access`를 사용합니다:**

```python
from app.core.permissions import check_project_access

@router.get("/projects/{project_id}/items")
@handle_errors
async def get_project_items(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 프로젝트 접근 권한 체크
    project = check_project_access(project_id, current_user, db)
    ...
```

### 5.3 기능 접근 체크 (Pro/Enterprise 기능)

**Pro/Enterprise 기능에는 `check_feature_access`를 사용합니다:**

```python
from app.core.feature_access import check_feature_access

@router.get("/advanced-feature")
@handle_errors
async def get_advanced_feature(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="advanced_feature",
        required_plan="pro",
        message="This feature requires Pro plan or higher."
    )
    ...
```

---

## 6. 코드 구조

### 6.1 엔드포인트 구조 (표준 순서)

```python
@router.get("/items")
@handle_errors  # 1. 데코레이터
async def get_items(
    # 2. 파라미터 (의존성 주입)
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    엔드포인트 설명
    Following API_REFERENCE.md: Returns standard response format
    """
    # 3. 로깅 (요청 시작)
    logger.info(...)
    
    # 4. 인증/인가 체크
    check_project_access(...)
    check_feature_access(...)
    
    # 5. 비즈니스 로직
    items = service.get_items(...)
    
    # 6. 로깅 (완료)
    logger.info(...)
    
    # 7. 표준 응답 반환
    return success_response(data=items)
```

### 6.2 Import 순서

```python
# 1. 표준 라이브러리
from typing import List, Optional
from datetime import datetime

# 2. 서드파티 라이브러리
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, validator

# 3. 앱 내부 모듈 (core)
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response

# 4. 앱 내부 모듈 (기타)
from app.core.permissions import check_project_access
from app.core.feature_access import check_feature_access
from app.models.user import User
from app.services.item_service import ItemService
```

---

## 7. 체크리스트

새 엔드포인트 작성 시 다음을 확인하세요:

- [ ] `@handle_errors` 데코레이터 추가
- [ ] `get_current_user` 또는 인증 체크 추가
- [ ] 프로젝트 관련 엔드포인트에 `check_project_access` 추가
- [ ] Pro/Enterprise 기능에 `check_feature_access` 추가
- [ ] 요청 시작 로깅 추가
- [ ] 요청 완료 로깅 추가 (중요한 작업)
- [ ] `success_response` 또는 `paginated_response` 사용
- [ ] `response_model` 제거 (표준 응답 형식 사용 시)
- [ ] Pydantic `@validator`로 입력 검증
- [ ] SQLAlchemy ORM 사용 (SQL Injection 방어)
- [ ] Docstring에 "Following API_REFERENCE.md" 명시

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**참고**: 
- [API_REFERENCE.md](./API_REFERENCE.md) - API 응답 형식
- [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) - 보안 가이드라인
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - 구현 가이드
