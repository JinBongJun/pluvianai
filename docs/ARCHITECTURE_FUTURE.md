# 미래 아키텍처 설계

## 하이브리드 아키텍처 개요

AgentGuard는 하이브리드 아키텍처를 채택하여 각 서비스의 장점을 최대한 활용합니다.

### 아키텍처 구성

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentGuard Platform                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │   Supabase       │         │    Railway       │          │
│  │                  │         │                  │          │
│  │  • PostgreSQL    │◄───────►│  • API Service   │          │
│  │  • Auth          │         │  • Agent Service │          │
│  │  • Storage       │         │  • Worker Service│          │
│  │  • Realtime      │         │  • LLM Proxy     │          │
│  └──────────────────┘         └──────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Supabase 역할

- **데이터베이스**: PostgreSQL (데이터 저장)
- **인증**: 사용자 인증 및 권한 관리
- **스토리지**: 파일 저장 (로그, 리포트 등)
- **Realtime**: 실시간 업데이트 (선택적)

### Railway 역할

- **API Service**: 비즈니스 로직 및 API 엔드포인트
- **Agent Service**: LLM 에이전트 실행
- **Worker Service**: 백그라운드 작업 처리
- **LLM Proxy**: 외부 LLM API 프록시

## Repository 패턴

### 설계 원칙

Repository 패턴은 OCP(Open-Closed Principle)를 준수하여 설계되었습니다.

- **확장에는 열림**: 새 Repository 추가 시 기존 코드 수정 불필요
- **수정에는 닫힘**: BaseRepository 인터페이스는 변경 없이 유지
- **Strategy 패턴**: DB 구현체(SQLAlchemy → Supabase) 교체 가능

### 계층 구조

```
API Layer
    ↓
Dependency Injection (dependencies.py)
    ↓
Repository Interface (BaseRepository)
    ↓
Repository Implementation (SQLAlchemyRepository)
    ↓
Database (PostgreSQL via SQLAlchemy)
```

### 현재 구현

- **SQLAlchemyRepository**: 현재 PostgreSQL과 SQLAlchemy 사용
- **BaseRepository**: 추상 인터페이스로 Supabase 전환 시에도 동일하게 사용

### Supabase 전환 전략

1. **SupabaseRepository 구현**: BaseRepository를 구현하는 새로운 Repository 생성
2. **의존성 주입 변경**: dependencies.py에서 Repository 구현체만 교체
3. **기존 코드 수정 불필요**: BaseRepository 인터페이스는 변경 없음

## OCP 준수 구조

### 확장성 (Open for Extension)

- 새 Repository 추가: `BaseRepository` 상속만 하면 됨
- 새 메서드 추가: 서브클래스에서 자유롭게 추가 가능
- 새 DB 구현체: `BaseRepository` 구현만 하면 됨

### 수정 방지 (Closed for Modification)

- `BaseRepository` 인터페이스는 변경 없음
- 기존 Repository 코드는 수정 불필요
- 기존 엔드포인트는 그대로 유지 (점진적 적용)

## 트랜잭션 관리

### FastAPI 엔드포인트

- `save()` 사용: commit하지 않음, get_db()가 자동 commit
- 여러 Repository 사용 시 하나의 트랜잭션으로 관리

### Background Tasks

- `save_and_commit()` 사용: 명시적 commit 필요
- SessionLocal() 직접 사용 시 명시적 commit/rollback

## 마이그레이션 전략

### Phase 1: 현재 (완료)

- SQLAlchemyRepository 구현
- 기존 코드와 호환
- 점진적 적용 가능

### Phase 2: Supabase 전환 준비

- SupabaseRepository 인터페이스 설계
- 테스트 환경 구축

### Phase 3: Supabase 전환

- SupabaseRepository 구현
- 의존성 주입 변경
- 기존 코드 수정 최소화
