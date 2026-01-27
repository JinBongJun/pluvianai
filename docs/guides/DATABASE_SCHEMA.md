# 🗄️ AgentGuard 데이터베이스 스키마 상세

> **목표**: 완전한 데이터베이스 스키마 정의, 외래키 제약조건, 인덱스 전략, 마이그레이션 전략

---

## 📋 목차

1. [핵심 테이블](#1-핵심-테이블)
2. [외래키 제약조건](#2-외래키-제약조건)
3. [데이터 무결성 제약조건](#3-데이터-무결성-제약조건)
4. [인덱스 전략](#4-인덱스-전략)
5. [트랜잭션 관리 전략](#5-트랜잭션-관리-전략)
6. [데이터 수명 주기 설계](#6-데이터-수명-주기-설계)
7. [마이그레이션 전략](#7-마이그레이션-전략)
8. [데이터베이스 연결 풀 관리](#8-데이터베이스-연결-풀-관리)

---

## 1. 핵심 테이블

### 1.1 Users

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    referred_by INTEGER,
    referral_code UUID UNIQUE DEFAULT gen_random_uuid(),
    referral_credits INTEGER DEFAULT 0 CHECK (referral_credits >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `email`: 고유 이메일 주소 (UNIQUE 제약조건)
- `hashed_password`: bcrypt 해시된 비밀번호
- `full_name`: 사용자 전체 이름
- `is_active`: 계정 활성화 상태
- `referred_by`: 추천한 사용자 ID (외래키, NULL 가능)
- `referral_code`: 고유 추천 코드 (UUID, 고유 인덱스)
- `referral_credits`: 추천으로 받은 크레딧 (Pro 플랜 무료 개월 수, 기본값 0, >= 0 제약조건)
- `created_at`: 생성 시간

### 1.2 Organizations

```sql
CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `name`: 조직 이름
- `plan_type`: 플랜 타입 (free, pro, enterprise)
- `created_at`: 생성 시간

### 1.3 Projects

```sql
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL,
    organization_id INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_project_name_per_owner UNIQUE (owner_id, name)
);
```

**필드 설명**:
- `id`: Primary Key
- `name`: 프로젝트 이름
- `description`: 프로젝트 설명
- `owner_id`: 소유자 ID (외래키)
- `organization_id`: 조직 ID (외래키, NULL 가능)
- `is_active`: 프로젝트 활성화 상태
- `created_at`: 생성 시간
- **제약조건**: 같은 소유자 내에서 프로젝트 이름은 고유해야 함

### 1.4 OrganizationMembers

```sql
CREATE TABLE organization_members (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_org_member UNIQUE (organization_id, user_id)
);
```

**필드 설명**:
- `id`: Primary Key
- `organization_id`: 조직 ID (외래키)
- `user_id`: 사용자 ID (외래키)
- `role`: 역할 (owner, admin, member)
- `created_at`: 생성 시간
- **제약조건**: 같은 조직 내에서 사용자는 중복될 수 없음

### 1.5 Snapshots

```sql
CREATE TABLE snapshots (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    trace_id INTEGER,
    request_data JSONB NOT NULL,
    response_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `project_id`: 프로젝트 ID (외래키)
- `trace_id`: 트레이스 ID (외래키, NULL 가능)
- `request_data`: 요청 데이터 (JSONB)
- `response_data`: 응답 데이터 (JSONB)
- `created_at`: 생성 시간

### 1.6 Traces

```sql
CREATE TABLE traces (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `project_id`: 프로젝트 ID (외래키)
- `name`: 트레이스 이름
- `created_at`: 생성 시간

### 1.7 EvaluationRubrics

```sql
CREATE TABLE evaluation_rubrics (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    criteria_prompt TEXT NOT NULL,
    min_score DECIMAL(3,2) DEFAULT 0.0 CHECK (min_score >= 0.0 AND min_score <= 1.0),
    max_score DECIMAL(3,2) DEFAULT 1.0 CHECK (max_score >= 0.0 AND max_score <= 1.0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_score_range CHECK (min_score <= max_score)
);
```

**필드 설명**:
- `id`: Primary Key
- `project_id`: 프로젝트 ID (외래키)
- `name`: 루브릭 이름
- `criteria_prompt`: 평가 기준 프롬프트
- `min_score`: 최소 점수 (0.0-1.0)
- `max_score`: 최대 점수 (0.0-1.0)
- `created_at`: 생성 시간
- **제약조건**: min_score <= max_score

### 1.8 APICalls

```sql
CREATE TABLE api_calls (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    snapshot_id INTEGER,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens INTEGER DEFAULT 0 CHECK (completion_tokens >= 0),
    cost DECIMAL(10,6) DEFAULT 0.0 CHECK (cost >= 0.0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `project_id`: 프로젝트 ID (외래키)
- `snapshot_id`: 스냅샷 ID (외래키, NULL 가능)
- `provider`: LLM 제공자 (OpenAI, Anthropic 등)
- `model`: 모델 이름
- `prompt_tokens`: 프롬프트 토큰 수 (>= 0)
- `completion_tokens`: 완성 토큰 수 (>= 0)
- `cost`: 비용 (>= 0.0)
- `created_at`: 생성 시간

### 1.9 FirewallRules

```sql
CREATE TABLE firewall_rules (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('PII', 'TOXICITY', 'CUSTOM')),
    rule_config JSONB NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('BLOCK', 'WARN')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `project_id`: 프로젝트 ID (외래키)
- `name`: 규칙 이름
- `rule_type`: 규칙 타입 (PII, TOXICITY, CUSTOM)
- `rule_config`: 규칙 설정 (JSONB)
- `action`: 동작 (BLOCK, WARN)
- `is_active`: 활성화 상태
- `created_at`: 생성 시간

### 1.10 GoldenCases

```sql
CREATE TABLE golden_cases (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    snapshot_ids JSONB NOT NULL, -- 배열
    selection_strategy VARCHAR(50) NOT NULL CHECK (selection_strategy IN ('high_variance', 'low_score', 'outlier')),
    extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP,
    success_count INTEGER DEFAULT 0 CHECK (success_count >= 0),
    total_count INTEGER DEFAULT 0 CHECK (total_count >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_success_count CHECK (success_count <= total_count)
);
```

**필드 설명**:
- `id`: Primary Key
- `project_id`: 프로젝트 ID (외래키)
- `name`: 골든 케이스 이름
- `snapshot_ids`: 스냅샷 ID 배열 (JSONB)
- `selection_strategy`: 선택 전략 (high_variance, low_score, outlier)
- `extracted_at`: 추출 시간
- `last_run_at`: 마지막 실행 시간
- `success_count`: 성공 횟수 (>= 0)
- `total_count`: 전체 횟수 (>= 0)
- `created_at`: 생성 시간
- **제약조건**: success_count <= total_count

### 1.11 GoldenCaseRuns

```sql
CREATE TABLE golden_case_runs (
    id SERIAL PRIMARY KEY,
    golden_case_id INTEGER NOT NULL,
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    results JSONB NOT NULL,
    cost DECIMAL(10,6) DEFAULT 0.0 CHECK (cost >= 0.0),
    regression_detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `golden_case_id`: 골든 케이스 ID (외래키)
- `model`: 모델 이름
- `provider`: LLM 제공자
- `results`: 결과 (JSONB)
- `cost`: 비용 (>= 0.0)
- `regression_detected`: 회귀 감지 여부
- `created_at`: 생성 시간

### 1.12 AuditLogs

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    project_id INTEGER,
    action_type VARCHAR(100) NOT NULL,
    action_description TEXT,
    ip_address INET,
    user_agent TEXT,
    activity_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**필드 설명**:
- `id`: Primary Key
- `user_id`: 사용자 ID (외래키, NULL 가능)
- `project_id`: 프로젝트 ID (외래키, NULL 가능)
- `action_type`: 액션 타입 (예: 'panic_toggle', 'project_create')
- `action_description`: 액션 설명
- `ip_address`: IP 주소
- `user_agent`: User Agent
- `activity_data`: 액티비티 데이터 (JSONB)
- `created_at`: 생성 시간 (불변)

---

## 2. 외래키 제약조건

### 2.1 외래키 정의

```sql
-- Users
ALTER TABLE users
ADD CONSTRAINT fk_users_referred_by
FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;

-- Projects
ALTER TABLE projects
ADD CONSTRAINT fk_projects_owner_id
FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE projects
ADD CONSTRAINT fk_projects_organization_id
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- OrganizationMembers
ALTER TABLE organization_members
ADD CONSTRAINT fk_org_members_organization_id
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE organization_members
ADD CONSTRAINT fk_org_members_user_id
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Snapshots
ALTER TABLE snapshots
ADD CONSTRAINT fk_snapshots_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE snapshots
ADD CONSTRAINT fk_snapshots_trace_id
FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE SET NULL;

-- Traces
ALTER TABLE traces
ADD CONSTRAINT fk_traces_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- EvaluationRubrics
ALTER TABLE evaluation_rubrics
ADD CONSTRAINT fk_rubrics_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- APICalls
ALTER TABLE api_calls
ADD CONSTRAINT fk_api_calls_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE api_calls
ADD CONSTRAINT fk_api_calls_snapshot_id
FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL;

-- FirewallRules
ALTER TABLE firewall_rules
ADD CONSTRAINT fk_firewall_rules_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- GoldenCases
ALTER TABLE golden_cases
ADD CONSTRAINT fk_golden_cases_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- GoldenCaseRuns
ALTER TABLE golden_case_runs
ADD CONSTRAINT fk_golden_case_runs_golden_case_id
FOREIGN KEY (golden_case_id) REFERENCES golden_cases(id) ON DELETE CASCADE;

-- AuditLogs
ALTER TABLE audit_logs
ADD CONSTRAINT fk_audit_logs_user_id
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_logs
ADD CONSTRAINT fk_audit_logs_project_id
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
```

### 2.2 CASCADE 정책

**CASCADE DELETE** (부모 삭제 시 자식도 삭제):
- `projects` → `snapshots`, `traces`, `evaluation_rubrics`, `api_calls`, `firewall_rules`, `golden_cases`
- `organizations` → `organization_members`
- `users` → `projects` (owner)
- `golden_cases` → `golden_case_runs`

**SET NULL** (부모 삭제 시 자식의 외래키를 NULL로 설정):
- `users` → `users.referred_by`
- `projects` → `projects.organization_id`
- `snapshots` → `snapshots.trace_id`
- `api_calls` → `api_calls.snapshot_id`
- `audit_logs` → `audit_logs.user_id`, `audit_logs.project_id`

---

## 3. 데이터 무결성 제약조건

### 3.1 UNIQUE 제약조건

```sql
-- Users
ALTER TABLE users ADD CONSTRAINT unique_users_email UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT unique_users_referral_code UNIQUE (referral_code);

-- Projects
ALTER TABLE projects ADD CONSTRAINT unique_project_name_per_owner UNIQUE (owner_id, name);

-- OrganizationMembers
ALTER TABLE organization_members ADD CONSTRAINT unique_org_member UNIQUE (organization_id, user_id);
```

### 3.2 CHECK 제약조건

```sql
-- Users
ALTER TABLE users ADD CONSTRAINT check_referral_credits_non_negative CHECK (referral_credits >= 0);

-- Organizations
ALTER TABLE organizations ADD CONSTRAINT check_plan_type_valid CHECK (plan_type IN ('free', 'pro', 'enterprise'));

-- OrganizationMembers
ALTER TABLE organization_members ADD CONSTRAINT check_role_valid CHECK (role IN ('owner', 'admin', 'member'));

-- EvaluationRubrics
ALTER TABLE evaluation_rubrics ADD CONSTRAINT check_min_score_range CHECK (min_score >= 0.0 AND min_score <= 1.0);
ALTER TABLE evaluation_rubrics ADD CONSTRAINT check_max_score_range CHECK (max_score >= 0.0 AND max_score <= 1.0);
ALTER TABLE evaluation_rubrics ADD CONSTRAINT check_valid_score_range CHECK (min_score <= max_score);

-- APICalls
ALTER TABLE api_calls ADD CONSTRAINT check_prompt_tokens_non_negative CHECK (prompt_tokens >= 0);
ALTER TABLE api_calls ADD CONSTRAINT check_completion_tokens_non_negative CHECK (completion_tokens >= 0);
ALTER TABLE api_calls ADD CONSTRAINT check_cost_non_negative CHECK (cost >= 0.0);

-- FirewallRules
ALTER TABLE firewall_rules ADD CONSTRAINT check_rule_type_valid CHECK (rule_type IN ('PII', 'TOXICITY', 'CUSTOM'));
ALTER TABLE firewall_rules ADD CONSTRAINT check_action_valid CHECK (action IN ('BLOCK', 'WARN'));

-- GoldenCases
ALTER TABLE golden_cases ADD CONSTRAINT check_selection_strategy_valid CHECK (selection_strategy IN ('high_variance', 'low_score', 'outlier'));
ALTER TABLE golden_cases ADD CONSTRAINT check_success_count_non_negative CHECK (success_count >= 0);
ALTER TABLE golden_cases ADD CONSTRAINT check_total_count_non_negative CHECK (total_count >= 0);
ALTER TABLE golden_cases ADD CONSTRAINT check_valid_success_count CHECK (success_count <= total_count);

-- GoldenCaseRuns
ALTER TABLE golden_case_runs ADD CONSTRAINT check_cost_non_negative CHECK (cost >= 0.0);
```

### 3.3 NOT NULL 제약조건

모든 Primary Key, Foreign Key, 필수 필드는 NOT NULL로 정의되어 있습니다.

---

## 4. 인덱스 전략

### 4.1 필수 인덱스

```sql
-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_referred_by ON users(referred_by);

-- Projects
CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_projects_is_active ON projects(is_active);

-- OrganizationMembers
CREATE INDEX idx_org_members_organization_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);

-- Snapshots
CREATE INDEX idx_snapshots_project_id ON snapshots(project_id);
CREATE INDEX idx_snapshots_trace_id ON snapshots(trace_id);
CREATE INDEX idx_snapshots_created_at ON snapshots(created_at);

-- Traces
CREATE INDEX idx_traces_project_id ON traces(project_id);

-- EvaluationRubrics
CREATE INDEX idx_rubrics_project_id ON evaluation_rubrics(project_id);

-- APICalls
CREATE INDEX idx_api_calls_project_id ON api_calls(project_id);
CREATE INDEX idx_api_calls_snapshot_id ON api_calls(snapshot_id);
CREATE INDEX idx_api_calls_created_at ON api_calls(created_at);
CREATE INDEX idx_api_calls_provider_model ON api_calls(provider, model);

-- FirewallRules
CREATE INDEX idx_firewall_rules_project_id ON firewall_rules(project_id);
CREATE INDEX idx_firewall_rules_is_active ON firewall_rules(is_active);
CREATE INDEX idx_firewall_rules_rule_type ON firewall_rules(rule_type);

-- GoldenCases
CREATE INDEX idx_golden_cases_project_id ON golden_cases(project_id);
CREATE INDEX idx_golden_cases_extracted_at ON golden_cases(extracted_at);

-- GoldenCaseRuns
CREATE INDEX idx_golden_case_runs_golden_case_id ON golden_case_runs(golden_case_id);
CREATE INDEX idx_golden_case_runs_created_at ON golden_case_runs(created_at);
CREATE INDEX idx_golden_case_runs_regression_detected ON golden_case_runs(regression_detected);

-- AuditLogs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_project_id ON audit_logs(project_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### 4.2 복합 인덱스

```sql
-- Projects: owner_id + is_active (프로젝트 목록 조회 최적화)
CREATE INDEX idx_projects_owner_active ON projects(owner_id, is_active);

-- Snapshots: project_id + created_at (시간순 조회 최적화)
CREATE INDEX idx_snapshots_project_created ON snapshots(project_id, created_at DESC);

-- APICalls: project_id + created_at (비용 분석 최적화)
CREATE INDEX idx_api_calls_project_created ON api_calls(project_id, created_at DESC);

-- FirewallRules: project_id + is_active + rule_type (활성 규칙 조회 최적화)
CREATE INDEX idx_firewall_rules_project_active_type ON firewall_rules(project_id, is_active, rule_type);
```

### 4.3 부분 인덱스 (Partial Index)

```sql
-- 활성화된 프로젝트만 인덱싱
CREATE INDEX idx_projects_active ON projects(owner_id) WHERE is_active = TRUE;

-- 활성화된 방화벽 규칙만 인덱싱
CREATE INDEX idx_firewall_rules_active ON firewall_rules(project_id, rule_type) WHERE is_active = TRUE;

-- 회귀 감지된 골든 케이스 실행만 인덱싱
CREATE INDEX idx_golden_case_runs_regression ON golden_case_runs(golden_case_id, created_at) WHERE regression_detected = TRUE;
```

---

## 5. 트랜잭션 관리 전략

### 5.1 트랜잭션 격리 수준

**기본 격리 수준**: `READ COMMITTED` (PostgreSQL 기본값)

**특정 작업별 격리 수준**:

```python
# 높은 일관성이 필요한 작업 (예: 결제 처리)
with db.begin():
    db.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    # 결제 처리 로직

# 읽기 전용 작업 (예: 대시보드 조회)
with db.begin():
    db.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
    # 조회 로직
```

### 5.2 트랜잭션 경계

**서비스 레이어에서 트랜잭션 관리**:

```python
# backend/app/services/project_service.py
class ProjectService:
    def create_project(self, user_id: int, name: str, description: str) -> Project:
        with self.db.begin():  # 트랜잭션 시작
            # 1. 프로젝트 생성
            project = Project(name=name, description=description, owner_id=user_id)
            self.db.add(project)
            self.db.flush()  # ID 생성
            
            # 2. Audit Log 기록
            audit_log = AuditLog(
                user_id=user_id,
                project_id=project.id,
                action_type='project_create',
                action_description=f'Project {name} created'
            )
            self.db.add(audit_log)
            
            # 3. 자동 커밋 (성공 시) 또는 롤백 (예외 시)
            return project
```

### 5.3 데드락 방지 전략

1. **일관된 락 순서**: 항상 같은 순서로 락을 획득
2. **짧은 트랜잭션**: 트랜잭션 시간 최소화
3. **인덱스 활용**: 락 범위 최소화
4. **재시도 로직**: 데드락 발생 시 자동 재시도

```python
# 데드락 재시도 데코레이터
@retry_on_deadlock(max_retries=3, backoff=0.1)
def transfer_credits(from_user_id: int, to_user_id: int, amount: int):
    with db.begin():
        # 항상 작은 ID부터 락 획득 (일관된 순서)
        user_ids = sorted([from_user_id, to_user_id])
        for user_id in user_ids:
            user = db.query(User).filter(User.id == user_id).with_for_update().first()
            # 크레딧 전송 로직
```

---

## 6. 데이터 수명 주기 설계

> **핵심 원칙**: "100만 개의 Snapshot을 영원히 저장하면 DB 비용으로 망합니다."

### 6.1 플랜별 TTL (Time To Live) 설정

**Free 플랜**:
- **TTL**: 7일
- 7일 후 자동 삭제 또는 S3 Glacier로 아카이브

**Pro 플랜**:
- **TTL**: 30일
- 30일 후 자동 삭제 또는 S3 Glacier로 아카이브

**Enterprise 플랜**:
- **TTL**: 90일 (기본)
- 고객 요구에 따라 조정 가능
- 90일 후 자동 삭제 또는 S3 Glacier로 아카이브

### 6.2 Auto-Archiving 로직

**아카이빙 전략**:
1. **TTL 도달 전 3일**: 사용자에게 알림 (데이터 보존 연장 옵션)
2. **TTL 도달**: 자동으로 S3 Glacier로 아카이브
3. **아카이브 후 90일**: 완전 삭제 (복구 불가)

**구현**:
```python
# backend/app/services/archive_service.py
class ArchiveService:
    def archive_expired_snapshots(self):
        """매일 실행되는 백그라운드 워커"""
        for snapshot in self.get_expired_snapshots():
            plan = snapshot.project.organization.plan_type
            
            if plan == "free" and snapshot.age > 7_days:
                self.archive_to_s3_glacier(snapshot)
            elif plan == "pro" and snapshot.age > 30_days:
                self.archive_to_s3_glacier(snapshot)
            elif plan == "enterprise" and snapshot.age > 90_days:
                self.archive_to_s3_glacier(snapshot)
    
    def archive_to_s3_glacier(self, snapshot: Snapshot):
        # S3 Glacier로 아카이브
        s3_key = f"archives/{snapshot.project_id}/{snapshot.id}.json"
        s3_client.upload_file(
            snapshot.to_json(),
            bucket="agentguard-archives",
            key=s3_key,
            storage_class="GLACIER"
        )
        
        # DB에서 삭제
        self.db.delete(snapshot)
        self.db.commit()
```

**비용 절감 효과**:
- DB 저장 비용: 90% 감소
- S3 Glacier 비용: DB 대비 1/10 수준
- 수익성 향상

---

## 7. 마이그레이션 전략

### 7.1 Alembic 사용

**마이그레이션 생성**:
```bash
alembic revision --autogenerate -m "add_audit_logs_table"
```

**마이그레이션 실행**:
```bash
alembic upgrade head
```

**마이그레이션 롤백**:
```bash
alembic downgrade -1
```

### 7.2 마이그레이션 베스트 프랙티스

1. **모든 스키마 변경은 마이그레이션으로**: 직접 SQL 실행 금지
2. **롤백 가능한 마이그레이션 작성**: `downgrade()` 함수 구현 필수
3. **데이터 마이그레이션 분리**: 스키마 변경과 데이터 마이그레이션 분리
4. **제로 다운타임 마이그레이션**: 가능한 경우 Blue-Green 배포 활용

### 7.3 마이그레이션 검증

**마이그레이션 전 검증**:
```python
# 마이그레이션 전 데이터 검증
def validate_before_migration():
    # 1. 데이터 무결성 검사
    assert db.query(User).filter(User.email.is_(None)).count() == 0
    
    # 2. 외래키 무결성 검사
    assert db.query(Project).filter(Project.owner_id.is_(None)).count() == 0
    
    # 3. 제약조건 검사
    assert db.query(User).filter(User.referral_credits < 0).count() == 0
```

**마이그레이션 후 검증**:
```python
# 마이그레이션 후 데이터 검증
def validate_after_migration():
    # 1. 데이터 개수 확인
    old_count = get_old_count()
    new_count = db.query(Snapshot).count()
    assert old_count == new_count
    
    # 2. 데이터 무결성 검사
    assert db.query(Snapshot).filter(Snapshot.project_id.is_(None)).count() == 0
```

### 7.4 제로 다운타임 마이그레이션 전략

**단계별 마이그레이션**:

1. **Phase 1: 컬럼 추가 (NULL 허용)**
   ```sql
   ALTER TABLE users ADD COLUMN new_field VARCHAR(255) NULL;
   ```

2. **Phase 2: 데이터 마이그레이션 (백그라운드)**
   ```python
   # 백그라운드 워커로 기존 데이터 마이그레이션
   for user in db.query(User).filter(User.new_field.is_(None)):
       user.new_field = calculate_new_field(user)
       db.commit()
   ```

3. **Phase 3: 컬럼 NOT NULL로 변경**
   ```sql
   ALTER TABLE users ALTER COLUMN new_field SET NOT NULL;
   ```

---

## 8. 데이터베이스 연결 풀 관리

### 8.1 연결 풀 설정

**SQLAlchemy 연결 풀 설정**:
```python
# backend/app/core/database.py
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,  # 기본 연결 수
    max_overflow=10,  # 최대 추가 연결 수
    pool_pre_ping=True,  # 연결 유효성 검사
    pool_recycle=3600,  # 1시간마다 연결 재사용
    echo=False
)
```

### 8.2 연결 풀 모니터링

**연결 풀 상태 확인**:
```python
# 연결 풀 상태 확인
pool = engine.pool
print(f"Pool size: {pool.size()}")
print(f"Checked out: {pool.checkedout()}")
print(f"Overflow: {pool.overflow()}")
print(f"Invalid: {pool.invalid()}")
```

### 8.3 연결 타임아웃 설정

**연결 타임아웃**:
```python
engine = create_engine(
    DATABASE_URL,
    connect_args={
        "connect_timeout": 10,  # 연결 타임아웃 (초)
        "options": "-c statement_timeout=30000"  # 쿼리 타임아웃 (30초)
    }
)
```

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**참고**: [../DETAILED_DESIGN.md](../DETAILED_DESIGN.md) - 메인 아키텍처 문서
