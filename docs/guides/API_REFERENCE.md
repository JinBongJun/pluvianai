# 📡 AgentGuard API Reference

> **목표**: 완전한 API 문서, Swagger/OpenAPI 스펙, 에러 처리, 검증 규칙

---

## 📋 목차

1. [API 개요](#1-api-개요)
2. [인증](#2-인증)
3. [핵심 엔드포인트](#3-핵심-엔드포인트)
4. [에러 처리](#4-에러-처리)
5. [검증 규칙](#5-검증-규칙)
6. [Rate Limiting](#6-rate-limiting)
7. [API 버저닝](#7-api-버저닝)
8. [OpenAPI/Swagger 스펙](#8-openapiswagger-스펙)

---

## 1. API 개요

### 1.1 Base URL

```
Production: https://api.agentguard.ai
Staging: https://api-staging.agentguard.ai
Development: http://localhost:8000
```

### 1.2 RESTful API 원칙

- **리소스 중심 URL 설계**: `/api/v1/projects/{id}` 형식
- **HTTP 메서드 적절히 사용**: GET, POST, PUT, DELETE
- **일관된 응답 형식**: 모든 응답은 동일한 구조

### 1.3 응답 형식

**성공 응답**:
```json
{
  "data": {
    "id": 1,
    "name": "My Project",
    "description": "Project description"
  },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}
```

**에러 응답**:
```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found",
    "details": {
      "project_id": 123
    },
    "origin": "Proxy"  // Proxy, Upstream, Network
  }
}
```

### 1.4 Content-Type

- **요청**: `application/json`
- **응답**: `application/json`

---

## 2. 인증

### 2.1 JWT 인증

**헤더**:
```
Authorization: Bearer <access_token>
```

**토큰 획득**:
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**응답**:
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600
  }
}
```

### 2.2 Refresh Token

**토큰 갱신**:
```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2.3 API Key 인증 (SDK용)

**헤더**:
```
X-API-Key: <api_key>
```

**API Key 생성**:
```bash
POST /api/v1/api-keys
Authorization: Bearer <access_token>

{
  "name": "Production API Key",
  "expires_at": "2026-12-31T23:59:59Z"  // Optional
}
```

---

## 3. 핵심 엔드포인트

### 3.1 Auth

#### POST /api/v1/auth/register

회원가입

**요청**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "John Doe"
}
```

**응답**: `201 Created`
```json
{
  "data": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "John Doe",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**검증 규칙**:
- `email`: 이메일 형식, 고유해야 함
- `password`: 최소 8자, 영문/숫자/특수문자 포함
- `full_name`: 최대 255자

#### POST /api/v1/auth/login

로그인

**요청**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**응답**: `200 OK`
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600
  }
}
```

**에러**:
- `401 Unauthorized`: 잘못된 이메일/비밀번호
- `429 Too Many Requests`: 로그인 시도 제한 초과

#### POST /api/v1/auth/refresh

토큰 갱신

**요청**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**응답**: `200 OK`
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600
  }
}
```

---

### 3.2 Projects

#### GET /api/v1/projects

프로젝트 목록 조회

**헤더**:
```
Authorization: Bearer <access_token>
```

**쿼리 파라미터**:
- `page`: 페이지 번호 (기본값: 1)
- `per_page`: 페이지당 항목 수 (기본값: 20, 최대: 100)
- `search`: 검색어 (프로젝트 이름)
- `is_active`: 활성화 상태 필터 (true/false)

**응답**: `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "name": "My Project",
      "description": "Project description",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

#### POST /api/v1/projects

프로젝트 생성

**요청**:
```json
{
  "name": "My Project",
  "description": "Project description",
  "organization_id": 1  // Optional
}
```

**응답**: `201 Created`
```json
{
  "data": {
    "id": 1,
    "name": "My Project",
    "description": "Project description",
    "owner_id": 1,
    "organization_id": 1,
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**검증 규칙**:
- `name`: 필수, 1-255자, 같은 소유자 내에서 고유해야 함
- `description`: 선택, 최대 1000자
- `organization_id`: 선택, 사용자가 멤버인 조직이어야 함

**에러**:
- `400 Bad Request`: 검증 실패
- `409 Conflict`: 프로젝트 이름 중복

#### GET /api/v1/projects/{id}

프로젝트 조회

**응답**: `200 OK`
```json
{
  "data": {
    "id": 1,
    "name": "My Project",
    "description": "Project description",
    "owner_id": 1,
    "organization_id": 1,
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**에러**:
- `404 Not Found`: 프로젝트를 찾을 수 없음
- `403 Forbidden`: 접근 권한 없음

#### PUT /api/v1/projects/{id}

프로젝트 수정

**요청**:
```json
{
  "name": "Updated Project Name",
  "description": "Updated description"
}
```

**응답**: `200 OK`
```json
{
  "data": {
    "id": 1,
    "name": "Updated Project Name",
    "description": "Updated description",
    "owner_id": 1,
    "organization_id": 1,
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**권한**: 프로젝트 소유자 또는 조직 관리자만 수정 가능

#### DELETE /api/v1/projects/{id}

프로젝트 삭제

**응답**: `204 No Content`

**권한**: 프로젝트 소유자만 삭제 가능

**주의**: 프로젝트 삭제 시 관련된 모든 데이터 (Snapshots, Traces, Rubrics 등)도 함께 삭제됩니다.

---

### 3.3 Proxy

#### POST /api/v1/proxy/{project_id}/chat/completions

OpenAI Proxy

**헤더**:
```
Authorization: Bearer <api_key>
Content-Type: application/json
```

**요청**: OpenAI API와 동일한 형식
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Hello, world!"
    }
  ],
  "temperature": 0.7
}
```

**응답**: OpenAI API와 동일한 형식
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 10,
    "total_tokens": 20
  },
  "x-agentguard-origin": "Proxy"  // Proxy, Upstream, Network
}
```

**에러 헤더**:
- `X-AgentGuard-Origin: Proxy`: AgentGuard 서버 에러
- `X-AgentGuard-Origin: Upstream`: 원본 LLM 제공자 에러
- `X-AgentGuard-Origin: Network`: 네트워크 에러

#### POST /api/v1/proxy/{project_id}/v1/chat/completions

Anthropic Proxy

**요청**: Anthropic API와 동일한 형식
```json
{
  "model": "claude-3-opus-20240229",
  "messages": [
    {
      "role": "user",
      "content": "Hello, world!"
    }
  ],
  "max_tokens": 1024
}
```

**응답**: Anthropic API와 동일한 형식

---

### 3.4 결과 1: 새 모델 안전성 검증

#### POST /api/v1/projects/{id}/model-safety-test

새 모델 안전성 검증 (One-Click)

**요청**:
```json
{
  "model": "gpt-4-turbo",
  "provider": "openai",
  "golden_case_ids": [1, 2, 3]  // Optional: 특정 골든 케이스만 테스트
}
```

**응답**: `202 Accepted` (비동기 처리)
```json
{
  "data": {
    "test_id": "test_123",
    "status": "pending",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

#### GET /api/v1/projects/{id}/model-safety-test/{test_id}

검증 결과 조회

**응답**: `200 OK`
```json
{
  "data": {
    "test_id": "test_123",
    "status": "completed",
    "model": "gpt-4-turbo",
    "provider": "openai",
    "results": {
      "total_cases": 10,
      "passed_cases": 8,
      "failed_cases": 2,
      "average_score": 0.85,
      "regression_detected": false
    },
    "created_at": "2026-01-01T00:00:00Z",
    "completed_at": "2026-01-01T00:05:00Z"
  }
}
```

#### GET /api/v1/projects/{id}/model-safety-test/{test_id}/details

상세 분석 (Pro 전용)

**응답**: `200 OK`
```json
{
  "data": {
    "test_id": "test_123",
    "detailed_results": [
      {
        "golden_case_id": 1,
        "golden_case_name": "High Variance Case",
        "score": 0.9,
        "passed": true,
        "reasoning": "The model performed well on this case..."
      },
      {
        "golden_case_id": 2,
        "golden_case_name": "Low Score Case",
        "score": 0.6,
        "passed": false,
        "reasoning": "The model failed to meet the minimum score threshold..."
      }
    ]
  }
}
```

**권한**: Pro 플랜 이상만 접근 가능

---

### 3.5 결과 2: 문제 발생 지점 찾기

#### POST /api/v1/projects/{id}/problem-analysis

문제 발생 지점 분석 (One-Click)

**요청**:
```json
{
  "trace_id": 123,  // Optional: 특정 트레이스만 분석
  "time_range": {   // Optional: 시간 범위
    "start": "2026-01-01T00:00:00Z",
    "end": "2026-01-02T00:00:00Z"
  }
}
```

**응답**: `202 Accepted`
```json
{
  "data": {
    "analysis_id": "analysis_123",
    "status": "pending",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

#### GET /api/v1/projects/{id}/problem-analysis/{analysis_id}

분석 결과 조회

**응답**: `200 OK`
```json
{
  "data": {
    "analysis_id": "analysis_123",
    "status": "completed",
    "problematic_agents": [
      {
        "agent_name": "Agent A",
        "error_rate": 0.15,
        "error_types": ["timeout", "invalid_response"],
        "recommendations": ["Increase timeout", "Add input validation"]
      }
    ],
    "created_at": "2026-01-01T00:00:00Z",
    "completed_at": "2026-01-01T00:10:00Z"
  }
}
```

#### GET /api/v1/projects/{id}/problem-analysis/{analysis_id}/mapping

설계도 데이터 (Pro 전용)

**응답**: `200 OK`
```json
{
  "data": {
    "nodes": [
      {
        "id": "agent_a",
        "name": "Agent A",
        "type": "agent",
        "error_rate": 0.15,
        "position": { "x": 100, "y": 100 }
      }
    ],
    "edges": [
      {
        "source": "agent_a",
        "target": "agent_b",
        "type": "dependency"
      }
    ]
  }
}
```

---

### 3.6 Replay

#### POST /api/v1/replay/{project_id}/run

Replay 실행

**요청**:
```json
{
  "snapshot_ids": [1, 2, 3],  // Optional: 특정 스냅샷만 재실행
  "model": "gpt-4-turbo",     // Optional: 다른 모델로 테스트
  "provider": "openai"        // Optional
}
```

**응답**: `202 Accepted`
```json
{
  "data": {
    "replay_id": "replay_123",
    "status": "pending",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

#### GET /api/v1/replay/{project_id}/results

Replay 결과 조회

**쿼리 파라미터**:
- `replay_id`: Replay ID (필수)

**응답**: `200 OK`
```json
{
  "data": {
    "replay_id": "replay_123",
    "status": "completed",
    "results": {
      "total_snapshots": 10,
      "passed": 8,
      "failed": 2,
      "regression_detected": true,
      "regression_cases": [
        {
          "snapshot_id": 1,
          "baseline_score": 0.9,
          "current_score": 0.7,
          "score_drop": 0.2
        }
      ]
    },
    "created_at": "2026-01-01T00:00:00Z",
    "completed_at": "2026-01-01T00:05:00Z"
  }
}
```

---

### 3.7 Rubrics

#### GET /api/v1/projects/{id}/rubrics

루브릭 목록 조회

**응답**: `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "name": "Accuracy Rubric",
      "criteria_prompt": "Evaluate the accuracy of the response...",
      "min_score": 0.7,
      "max_score": 1.0,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/v1/projects/{id}/rubrics

루브릭 생성

**요청**:
```json
{
  "name": "Accuracy Rubric",
  "criteria_prompt": "Evaluate the accuracy of the response...",
  "min_score": 0.7,
  "max_score": 1.0
}
```

**응답**: `201 Created`
```json
{
  "data": {
    "id": 1,
    "name": "Accuracy Rubric",
    "criteria_prompt": "Evaluate the accuracy of the response...",
    "min_score": 0.7,
    "max_score": 1.0,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**검증 규칙**:
- `name`: 필수, 1-255자
- `criteria_prompt`: 필수, 최대 5000자
- `min_score`: 0.0-1.0, `max_score`보다 작거나 같아야 함
- `max_score`: 0.0-1.0, `min_score`보다 크거나 같아야 함

#### DELETE /api/v1/rubrics/{id}

루브릭 삭제

**응답**: `204 No Content`

---

### 3.8 데이터 Export

#### POST /api/v1/projects/{id}/export

프로젝트 데이터 Export (JSON/CSV)

**요청**:
```json
{
  "format": "json",  // "json" or "csv"
  "data_types": ["snapshots", "evaluations", "api_calls"],  // Optional
  "time_range": {   // Optional
    "start": "2026-01-01T00:00:00Z",
    "end": "2026-01-02T00:00:00Z"
  }
}
```

**응답**: `202 Accepted`
```json
{
  "data": {
    "export_id": "export_123",
    "status": "pending",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

#### GET /api/v1/projects/{id}/export/status/{export_id}

Export 상태 조회

**응답**: `200 OK`
```json
{
  "data": {
    "export_id": "export_123",
    "status": "completed",
    "download_url": "https://storage.agentguard.ai/exports/export_123.json",
    "expires_at": "2026-01-08T00:00:00Z",
    "created_at": "2026-01-01T00:00:00Z",
    "completed_at": "2026-01-01T00:05:00Z"
  }
}
```

---

## 4. 에러 처리

### 4.1 에러 코드 체계

**에러 코드 형식**: `CATEGORY_ERROR_TYPE`

**카테고리**:
- `AUTH`: 인증/인가 관련
- `VALIDATION`: 검증 관련
- `NOT_FOUND`: 리소스를 찾을 수 없음
- `PERMISSION`: 권한 관련
- `RATE_LIMIT`: Rate Limit 초과
- `SERVER`: 서버 에러
- `UPSTREAM`: 원본 LLM 제공자 에러
- `NETWORK`: 네트워크 에러

**예시**:
- `AUTH_INVALID_TOKEN`: 유효하지 않은 토큰
- `VALIDATION_INVALID_EMAIL`: 잘못된 이메일 형식
- `NOT_FOUND_PROJECT`: 프로젝트를 찾을 수 없음
- `PERMISSION_DENIED`: 접근 권한 없음
- `RATE_LIMIT_EXCEEDED`: Rate Limit 초과
- `SERVER_INTERNAL_ERROR`: 서버 내부 에러
- `UPSTREAM_OPENAI_ERROR`: OpenAI API 에러
- `NETWORK_TIMEOUT`: 네트워크 타임아웃

### 4.2 에러 응답 형식

```json
{
  "error": {
    "code": "NOT_FOUND_PROJECT",
    "message": "Project not found",
    "details": {
      "project_id": 123
    },
    "origin": "Proxy",  // Proxy, Upstream, Network
    "request_id": "req_1234567890",
    "timestamp": "2026-01-01T00:00:00Z"
  }
}
```

### 4.3 HTTP 상태 코드

- `200 OK`: 성공
- `201 Created`: 리소스 생성 성공
- `202 Accepted`: 비동기 작업 시작
- `204 No Content`: 성공 (응답 본문 없음)
- `400 Bad Request`: 잘못된 요청
- `401 Unauthorized`: 인증 필요
- `403 Forbidden`: 접근 권한 없음
- `404 Not Found`: 리소스를 찾을 수 없음
- `409 Conflict`: 리소스 충돌 (예: 중복)
- `422 Unprocessable Entity`: 검증 실패
- `429 Too Many Requests`: Rate Limit 초과
- `500 Internal Server Error`: 서버 에러
- `502 Bad Gateway`: 게이트웨이 에러
- `503 Service Unavailable`: 서비스 사용 불가

### 4.4 에러 원인 구분 (X-AgentGuard-Origin)

**헤더**: `X-AgentGuard-Origin`

**값**:
- `Proxy`: AgentGuard 서버 에러
- `Upstream`: 원본 LLM 제공자 에러 (OpenAI, Anthropic 등)
- `Network`: 네트워크 에러

**사용 예시**:
```bash
# Proxy 에러
HTTP/1.1 500 Internal Server Error
X-AgentGuard-Origin: Proxy

# Upstream 에러
HTTP/1.1 502 Bad Gateway
X-AgentGuard-Origin: Upstream

# Network 에러
HTTP/1.1 503 Service Unavailable
X-AgentGuard-Origin: Network
```

---

## 5. 검증 규칙

### 5.1 이메일 검증

- 형식: RFC 5322 준수
- 최대 길이: 255자
- 고유성: 데이터베이스에서 고유해야 함

### 5.2 비밀번호 검증

- 최소 길이: 8자
- 최대 길이: 128자
- 필수 포함: 영문 대소문자, 숫자, 특수문자 중 최소 3종류

### 5.3 프로젝트 이름 검증

- 최소 길이: 1자
- 최대 길이: 255자
- 고유성: 같은 소유자 내에서 고유해야 함
- 허용 문자: 영문, 숫자, 공백, 하이픈, 언더스코어

### 5.4 점수 검증

- 범위: 0.0-1.0
- 형식: 소수점 2자리까지
- 제약조건: `min_score <= max_score`

### 5.5 Pydantic RequestDTO 검증

**예시**:
```python
from pydantic import BaseModel, EmailStr, Field, validator

class ProjectCreateDTO(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(None, max_length=1000)
    organization_id: int = Field(None, gt=0)
    
    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()
```

---

## 6. Rate Limiting

### 6.1 Rate Limit 정책

**인증된 사용자**:
- 일반 API: 1000 requests/hour
- Proxy API: 100 requests/minute

**인증되지 않은 사용자**:
- 모든 API: 100 requests/hour

### 6.2 Rate Limit 헤더

**응답 헤더**:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

### 6.3 Rate Limit 초과 응답

**HTTP 상태 코드**: `429 Too Many Requests`

**응답 본문**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 1000,
      "remaining": 0,
      "reset_at": "2026-01-01T01:00:00Z"
    }
  }
}
```

---

## 7. API 버저닝

### 7.1 버전 관리 체계

**URL 기반 버저닝**:
- `/api/v1/` - 현재 버전 (안정화)
- `/api/v2/` - 다음 버전 (개발 중)
- `/api/beta/` - 베타 버전 (테스트용)

### 7.2 하위 호환성 정책

**v1 → v2 마이그레이션**:
- v1 API는 최소 12개월간 유지
- v2 출시 후 6개월간 v1과 v2 병행 운영
- Deprecation Notice: v1 사용자에게 3개월 전 알림

**Breaking Changes 처리**:
- Breaking Change는 새로운 버전에서만 적용
- 기존 버전은 변경 없이 유지
- 점진적 마이그레이션 가이드 제공

### 7.3 Deprecation Notice

**응답 헤더**:
```
Deprecation: true
Sunset: Sat, 31 Dec 2026 23:59:59 GMT
Link: <https://api.agentguard.ai/api/v2/projects>; rel="successor-version"
```

---

## 8. OpenAPI/Swagger 스펙

### 8.1 Swagger UI

**URL**: `https://api.agentguard.ai/docs`

**기능**:
- 인터랙티브 API 문서
- 요청/응답 예시
- 직접 API 테스트 가능

### 8.2 OpenAPI 스펙

**URL**: `https://api.agentguard.ai/openapi.json`

**형식**: OpenAPI 3.0

### 8.3 스펙 생성

**FastAPI 자동 생성**:
```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

app = FastAPI()

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="AgentGuard API",
        version="1.0.0",
        description="AgentGuard API Documentation",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
```

### 8.4 스펙 예시

```yaml
openapi: 3.0.0
info:
  title: AgentGuard API
  version: 1.0.0
  description: AgentGuard API Documentation
servers:
  - url: https://api.agentguard.ai
    description: Production server
paths:
  /api/v1/projects:
    get:
      summary: List projects
      tags:
        - Projects
      security:
        - BearerAuth: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectListResponse'
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Project:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
        owner_id:
          type: integer
        is_active:
          type: boolean
        created_at:
          type: string
          format: date-time
```

---

## 9. 사용 예제

### 9.1 Python SDK 사용 예제

#### 기본 설정 및 초기화

```python
import agentguard

# 환경 변수로 설정 (권장)
# export AGENTGUARD_API_KEY="your-api-key"
# export AGENTGUARD_PROJECT_ID="123"
# export AGENTGUARD_API_URL="https://api.agentguard.ai"

# 또는 코드에서 직접 설정
guard = agentguard.AgentGuard(
    api_key="your-api-key",
    project_id=123,
    api_url="https://api.agentguard.ai",
    agent_name="my-agent"
)

# OpenAI SDK 자동 패치
guard.init()

# 이제 모든 OpenAI 호출이 자동으로 모니터링됩니다
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

#### 수동 모니터링 (패치 없이)

```python
import agentguard

guard = agentguard.AgentGuard(
    api_key="your-api-key",
    project_id=123
)

# 수동으로 API 호출 기록
guard.capture_api_call(
    request_data={"model": "gpt-4", "messages": [...]},
    response_data={"choices": [...]},
    latency_ms=500,
    status_code=200
)
```

#### 에러 처리

```python
import agentguard
from openai import OpenAI

guard = agentguard.AgentGuard(
    api_key="your-api-key",
    project_id=123
)
guard.init()

client = OpenAI()

try:
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}]
    )
except Exception as e:
    # AgentGuard SDK가 자동으로 에러를 기록합니다
    # Circuit Breaker가 활성화되면 자동으로 fail-open
    print(f"Error: {e}")
```

---

### 9.2 Node.js SDK 사용 예제

#### 기본 설정 및 초기화

```javascript
const AgentGuard = require('agentguard');

// 환경 변수로 설정 (권장)
// export AGENTGUARD_API_KEY="your-api-key"
// export AGENTGUARD_PROJECT_ID="123"
// export AGENTGUARD_API_URL="https://api.agentguard.ai"

// 또는 코드에서 직접 설정
const guard = new AgentGuard({
  apiKey: 'your-api-key',
  projectId: 123,
  apiUrl: 'https://api.agentguard.ai',
  agentName: 'my-agent'
});

// OpenAI SDK 자동 패치
guard.init();

// 이제 모든 OpenAI 호출이 자동으로 모니터링됩니다
const OpenAI = require('openai');
const client = new OpenAI();
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

#### 수동 모니터링 (패치 없이)

```javascript
const AgentGuard = require('agentguard');

const guard = new AgentGuard({
  apiKey: 'your-api-key',
  projectId: 123
});

// 수동으로 API 호출 기록
guard.captureApiCall({
  requestData: { model: 'gpt-4', messages: [...] },
  responseData: { choices: [...] },
  latencyMs: 500,
  statusCode: 200
});
```

#### 에러 처리

```javascript
const AgentGuard = require('agentguard');
const OpenAI = require('openai');

const guard = new AgentGuard({
  apiKey: 'your-api-key',
  projectId: 123
});
guard.init();

const client = new OpenAI();

try {
  const response = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
} catch (error) {
  // AgentGuard SDK가 자동으로 에러를 기록합니다
  // Circuit Breaker가 활성화되면 자동으로 fail-open
  console.error('Error:', error);
}
```

---

### 9.3 curl 명령어 예제

#### 인증 및 프로젝트 조회

```bash
# 1. 로그인하여 토큰 획득
TOKEN=$(curl -X POST https://api.agentguard.ai/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' | jq -r '.data.access_token')

# 2. 프로젝트 목록 조회
curl -X GET https://api.agentguard.ai/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 3. 특정 프로젝트 조회
curl -X GET https://api.agentguard.ai/api/v1/projects/123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

#### Proxy API 사용 (OpenAI 호환)

```bash
# OpenAI API와 동일한 형식으로 사용
curl -X POST https://api.agentguard.ai/api/v1/proxy/123/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "Hello, world!"
      }
    ],
    "temperature": 0.7
  }'
```

#### 모델 안전성 검증

```bash
# 1. 검증 시작
RESPONSE=$(curl -X POST https://api.agentguard.ai/api/v1/projects/123/model-safety-test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4-turbo",
    "provider": "openai"
  }')

TEST_ID=$(echo $RESPONSE | jq -r '.data.test_id')

# 2. 검증 결과 조회 (폴링)
while true; do
  RESULT=$(curl -X GET "https://api.agentguard.ai/api/v1/projects/123/model-safety-test/$TEST_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  STATUS=$(echo $RESULT | jq -r '.data.status')
  
  if [ "$STATUS" = "completed" ]; then
    echo $RESULT | jq '.'
    break
  fi
  
  echo "Status: $STATUS, waiting..."
  sleep 5
done
```

#### Replay 실행

```bash
# Replay 시작
RESPONSE=$(curl -X POST https://api.agentguard.ai/api/v1/replay/123/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_ids": [1, 2, 3],
    "model": "gpt-4-turbo"
  }')

REPLAY_ID=$(echo $RESPONSE | jq -r '.data.replay_id')

# 결과 조회
curl -X GET "https://api.agentguard.ai/api/v1/replay/123/results?replay_id=$REPLAY_ID" \
  -H "Authorization: Bearer $TOKEN"
```

#### 에러 처리 예제

```bash
# 에러 응답 확인
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET https://api.agentguard.ai/api/v1/projects/999 \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "200" ]; then
  ERROR_CODE=$(echo "$BODY" | jq -r '.error.code')
  ERROR_MESSAGE=$(echo "$BODY" | jq -r '.error.message')
  ORIGIN=$(echo "$BODY" | jq -r '.error.origin')
  
  echo "Error: $ERROR_CODE - $ERROR_MESSAGE (Origin: $ORIGIN)"
fi
```

---

### 9.4 CI/CD 통합 예제 (GitHub Actions)

#### GitHub Actions 워크플로우

```yaml
name: Model Validation CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  validate-model:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install agentguard openai
      
      - name: Run model validation
        env:
          AGENTGUARD_API_KEY: ${{ secrets.AGENTGUARD_API_KEY }}
          AGENTGUARD_PROJECT_ID: ${{ secrets.AGENTGUARD_PROJECT_ID }}
          AGENTGUARD_API_URL: https://api.agentguard.ai
        run: |
          python - <<EOF
          import agentguard
          import os
          import requests
          
          # AgentGuard 초기화
          guard = agentguard.AgentGuard(
              api_key=os.getenv("AGENTGUARD_API_KEY"),
              project_id=int(os.getenv("AGENTGUARD_PROJECT_ID")),
              api_url=os.getenv("AGENTGUARD_API_URL")
          )
          guard.init()
          
          # CI 검증 실행
          project_id = int(os.getenv("AGENTGUARD_PROJECT_ID"))
          api_url = os.getenv("AGENTGUARD_API_URL")
          api_key = os.getenv("AGENTGUARD_API_KEY")
          
          response = requests.post(
              f"{api_url}/api/v1/ci/validate",
              headers={"Authorization": f"Bearer {api_key}"},
              json={
                  "project_id": project_id,
                  "new_model": "gpt-4-turbo",
                  "provider": "openai"
              },
              timeout=300
          )
          
          if response.status_code != 200:
              print(f"Validation failed: {response.text}")
              exit(1)
          
          result = response.json()
          if result["data"]["passed"]:
              print("✅ Model validation passed!")
          else:
              print(f"❌ Model validation failed: {result['data']['message']}")
              exit(1)
          EOF
```

#### GitLab CI/CD 예제

```yaml
validate-model:
  image: python:3.11
  before_script:
    - pip install agentguard openai requests
  script:
    - |
      python - <<EOF
      import agentguard
      import os
      import requests
      
      guard = agentguard.AgentGuard(
          api_key=os.getenv("AGENTGUARD_API_KEY"),
          project_id=int(os.getenv("AGENTGUARD_PROJECT_ID")),
          api_url=os.getenv("AGENTGUARD_API_URL", "https://api.agentguard.ai")
      )
      guard.init()
      
      # CI 검증 실행
      response = requests.post(
          f"{os.getenv('AGENTGUARD_API_URL', 'https://api.agentguard.ai')}/api/v1/ci/validate",
          headers={"Authorization": f"Bearer {os.getenv('AGENTGUARD_API_KEY')}"},
          json={
              "project_id": int(os.getenv("AGENTGUARD_PROJECT_ID")),
              "new_model": "gpt-4-turbo",
              "provider": "openai"
          },
          timeout=300
      )
      
      if response.status_code != 200 or not response.json()["data"]["passed"]:
          exit(1)
      EOF
  variables:
    AGENTGUARD_API_URL: "https://api.agentguard.ai"
  only:
    - merge_requests
    - main
```

---

### 9.5 에러 처리 예제

#### Python 에러 처리

```python
import agentguard
from openai import OpenAI
import httpx

guard = agentguard.AgentGuard(
    api_key="your-api-key",
    project_id=123
)
guard.init()

client = OpenAI()

try:
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}]
    )
except httpx.HTTPStatusError as e:
    # HTTP 에러 (4xx, 5xx)
    if e.response.status_code == 429:
        print("Rate limit exceeded. Retrying...")
    elif e.response.status_code >= 500:
        print("Server error. Circuit breaker may activate.")
    else:
        print(f"HTTP error: {e.response.status_code}")
except httpx.RequestError as e:
    # 네트워크 에러
    print(f"Network error: {e}")
    # Circuit Breaker가 활성화되면 자동으로 fail-open
except Exception as e:
    # 기타 에러
    print(f"Unexpected error: {e}")
```

#### Node.js 에러 처리

```javascript
const AgentGuard = require('agentguard');
const OpenAI = require('openai');

const guard = new AgentGuard({
  apiKey: 'your-api-key',
  projectId: 123
});
guard.init();

const client = new OpenAI();

async function makeRequest() {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }]
    });
    return response;
  } catch (error) {
    if (error.response) {
      // HTTP 에러
      const status = error.response.status;
      if (status === 429) {
        console.log('Rate limit exceeded. Retrying...');
      } else if (status >= 500) {
        console.log('Server error. Circuit breaker may activate.');
      } else {
        console.log(`HTTP error: ${status}`);
      }
    } else if (error.request) {
      // 네트워크 에러
      console.log('Network error:', error.message);
      // Circuit Breaker가 활성화되면 자동으로 fail-open
    } else {
      // 기타 에러
      console.log('Unexpected error:', error.message);
    }
    throw error;
  }
}
```

#### API 직접 호출 시 에러 처리

```python
import requests
from requests.exceptions import RequestException, HTTPError

def call_agentguard_api(endpoint, method="GET", data=None, token=None):
    """AgentGuard API 호출 헬퍼 함수"""
    base_url = "https://api.agentguard.ai"
    headers = {"Content-Type": "application/json"}
    
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        response = requests.request(
            method=method,
            url=f"{base_url}{endpoint}",
            headers=headers,
            json=data,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    
    except HTTPError as e:
        # HTTP 에러 응답 파싱
        try:
            error_data = e.response.json()
            error_code = error_data.get("error", {}).get("code")
            error_message = error_data.get("error", {}).get("message")
            error_origin = error_data.get("error", {}).get("origin", "Proxy")
            
            print(f"API Error [{error_origin}]: {error_code} - {error_message}")
            
            # Origin에 따른 처리
            if error_origin == "Upstream":
                print("This is an upstream LLM provider error")
            elif error_origin == "Network":
                print("This is a network connectivity error")
            else:
                print("This is an AgentGuard server error")
        
        except ValueError:
            print(f"HTTP {e.response.status_code}: {e.response.text}")
        
        raise
    
    except RequestException as e:
        # 네트워크 에러
        print(f"Network error: {e}")
        raise
    
    except Exception as e:
        # 기타 에러
        print(f"Unexpected error: {e}")
        raise

# 사용 예제
try:
    result = call_agentguard_api(
        "/api/v1/projects/123",
        method="GET",
        token="your-token"
    )
    print(result)
except Exception as e:
    print(f"Failed to call API: {e}")
```

---

### 9.6 실전 통합 예제

#### FastAPI 애플리케이션과 통합

```python
from fastapi import FastAPI, HTTPException
import agentguard
from openai import OpenAI

app = FastAPI()

# AgentGuard 초기화
guard = agentguard.AgentGuard(
    api_key=os.getenv("AGENTGUARD_API_KEY"),
    project_id=int(os.getenv("AGENTGUARD_PROJECT_ID")),
    api_url=os.getenv("AGENTGUARD_API_URL", "https://api.agentguard.ai")
)
guard.init()

client = OpenAI()

@app.post("/chat")
async def chat_endpoint(message: str):
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": message}]
        )
        return {"response": response.choices[0].message.content}
    except Exception as e:
        # AgentGuard가 자동으로 에러를 기록합니다
        raise HTTPException(status_code=500, detail=str(e))
```

#### Express.js 애플리케이션과 통합

```javascript
const express = require('express');
const AgentGuard = require('agentguard');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

// AgentGuard 초기화
const guard = new AgentGuard({
  apiKey: process.env.AGENTGUARD_API_KEY,
  projectId: parseInt(process.env.AGENTGUARD_PROJECT_ID),
  apiUrl: process.env.AGENTGUARD_API_URL || 'https://api.agentguard.ai'
});
guard.init();

const client = new OpenAI();

app.post('/chat', async (req, res) => {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: req.body.message }]
    });
    res.json({ response: response.choices[0].message.content });
  } catch (error) {
    // AgentGuard가 자동으로 에러를 기록합니다
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**참고**: [../DETAILED_DESIGN.md](../DETAILED_DESIGN.md) - 메인 아키텍처 문서
