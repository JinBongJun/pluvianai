# AgentGuard Organization Owner 관리 설계

## 목표
- 표준 SaaS 패턴을 따르는 Owner 관리 시스템
- 명확한 권한 구조와 소유권 이전 프로세스
- Org 연속성 보장 (최소 1명의 Owner 유지)

---

## 1. 다른 서비스들의 Owner 관리 방식

### GitHub
- **Owner 역할**: Organization의 모든 권한 (설정, 멤버, 청구 등)
- **최소 Owner 수**: 2명 (연속성 확보)
- **소유권 이전**: Settings에서 다른 Owner에게 이전 가능
- **Custom Roles**: Owner가 아닌 사람들에게 특정 권한만 부여 가능

### npm Orgs
- **Owner 역할**: 청구 관리, 멤버 추가/제거, 역할 변경
- **최소 Owner 수**: 1명
- **역할 구조**: Owner > Admin > Member (3단계)

### Supabase / Vercel
- **Owner 역할**: 생성자가 자동으로 Owner
- **소유권 이전**: Settings에서 가능
- **멤버 초대**: Owner/Admin이 초대 가능

---

## 2. AgentGuard Owner 관리 방식

### 2-1. 기본 원칙

1. **Org 생성 시**:
   - 생성자가 자동으로 Owner가 됨
   - Owner Email 입력 필드 없음 (간소화)

2. **Owner 권한**:
   - ✅ Billing 관리 (플랜 변경, 결제 수단 관리)
   - ✅ 멤버 관리 (초대, 제거, 역할 변경)
   - ✅ Org 설정 변경 (이름, 타입 등)
   - ✅ Org 삭제
   - ✅ 모든 프로젝트 접근 및 관리

3. **최소 Owner 수**:
   - 항상 최소 1명의 Owner가 존재해야 함
   - 마지막 Owner는 Org를 삭제하거나 다른 사람에게 소유권을 이전해야 함

### 2-2. 역할 구조

```
Owner (소유자)
  ├─ 모든 권한
  └─ 소유권 이전 가능

Admin (관리자)
  ├─ 프로젝트 생성/삭제
  ├─ 멤버 초대/제거 (Owner 제외)
  ├─ 프로젝트 설정 변경
  └─ 소유권 이전 불가

Member (멤버)
  ├─ 프로젝트 접근 및 사용
  ├─ 프로젝트 내 작업 수행
  └─ Org 설정 변경 불가

Viewer (뷰어)
  ├─ 프로젝트 조회만 가능
  └─ 수정 불가
```

### 2-3. Org 생성 플로우 (Owner 관련)

```
[Org 생성 폼]
    ↓
[Name, Type 입력]
    ↓
["Create organization" 클릭]
    ↓
[POST /api/v1/organizations]
    {
      name: "My Org",
      type: "startup",
      plan_type: "free"
      // owner_id는 자동으로 current_user.id로 설정
    }
    ↓
[OrganizationMember 생성]
    {
      organization_id: org.id,
      user_id: current_user.id,
      role: "owner" // 자동으로 Owner 역할
    }
    ↓
[Org 생성 완료]
```

---

## 3. Settings > Team 페이지

### 3-1. 멤버 리스트

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Settings > Team                                                           │
│                                                                          │
│  Members                                                                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ [Avatar]  user@example.com                    [Owner]  [Remove]     │ │
│  │           You                                                       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ [Avatar]  admin@example.com                  [Admin]  [Change]    │ │
│  │           John Doe                                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ [Avatar]  member@example.com                [Member] [Change]    │ │
│  │           Jane Smith                                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  [+ Invite member]                                                      │
│                                                                          │
│  ────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  Transfer Ownership                                                      │
│                                                                          │
│  Transfer this organization to another member. You'll become an Admin   │
│  after the transfer.                                                    │
│                                                                          │
│  [Select member ▼]                                                      │
│  [Transfer Ownership]                                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3-2. 멤버 초대

**Owner/Admin만 가능**:
```
[+ Invite member 클릭]
    ↓
[이메일 입력]
    ↓
[역할 선택: Admin, Member, Viewer]
    ↓
[초대 전송]
    ↓
[초대 링크 이메일 발송]
    ↓
[초대 수락 시 멤버 추가]
```

### 3-3. 역할 변경

**Owner만 가능**:
- Admin ↔ Member ↔ Viewer 변경 가능
- Owner 역할 변경은 "Transfer Ownership"으로만 가능

### 3-4. 소유권 이전 (Transfer Ownership)

**Owner만 가능**:
```
[Settings > Team > Transfer Ownership]
    ↓
[기존 Owner가 다른 멤버 선택]
    ↓
[확인 모달 표시]
    "Are you sure you want to transfer ownership to {member}?"
    "You'll become an Admin after the transfer."
    [Cancel] [Transfer]
    ↓
[소유권 이전]
    - 선택한 멤버: Member → Owner
    - 기존 Owner: Owner → Admin
    ↓
[알림 전송]
    - 새 Owner에게 알림
    - 기존 Owner에게 알림
    ↓
[완료]
```

**제약사항**:
- 최소 1명의 Owner가 항상 존재해야 함
- 마지막 Owner는 소유권을 이전하지 않고는 Org를 삭제할 수 없음

---

## 4. API 엔드포인트

### 4-1. Organization Members

```
GET    /api/v1/organizations/{id}/members
POST   /api/v1/organizations/{id}/members/invite
PATCH  /api/v1/organizations/{id}/members/{user_id}/role
DELETE /api/v1/organizations/{id}/members/{user_id}
POST   /api/v1/organizations/{id}/members/transfer-ownership
```

### 4-2. Transfer Ownership

```python
POST /api/v1/organizations/{id}/members/transfer-ownership

요청:
{
  "new_owner_user_id": 123
}

처리:
1. 현재 사용자가 Owner인지 확인
2. 최소 1명의 Owner가 유지되는지 확인
3. 새 Owner가 Org 멤버인지 확인
4. 역할 변경:
   - 새 Owner: role → "owner"
   - 기존 Owner: role → "admin"
5. 알림 전송
6. Activity Log 기록

응답:
{
  "message": "Ownership transferred successfully",
  "new_owner": {
    "user_id": 123,
    "email": "newowner@example.com"
  },
  "previous_owner": {
    "user_id": 456,
    "email": "previousowner@example.com"
  }
}
```

---

## 5. 권한 체크 로직

### 5-1. Owner 권한 체크

```python
def check_org_owner(org_id: int, user_id: int, db: Session) -> bool:
    """Check if user is Owner of the organization"""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id,
        OrganizationMember.role == "owner"
    ).first()
    return member is not None

def check_org_admin_or_owner(org_id: int, user_id: int, db: Session) -> bool:
    """Check if user is Admin or Owner"""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id,
        OrganizationMember.role.in_(["owner", "admin"])
    ).first()
    return member is not None
```

### 5-2. Billing 권한

- **Owner만 가능**: 플랜 변경, 결제 수단 관리, 구독 취소
- **Admin/Member**: 조회만 가능

### 5-3. 멤버 관리 권한

- **Owner**: 모든 멤버 초대/제거/역할 변경 가능
- **Admin**: Owner 제외한 멤버 초대/제거/역할 변경 가능
- **Member/Viewer**: 불가

### 5-4. Org 삭제 권한

- **Owner만 가능**: Org 삭제
- **제약**: 마지막 Owner는 소유권을 이전하지 않고는 삭제 불가

---

## 6. 데이터 모델

### 6-1. OrganizationMember

```python
class OrganizationMember(Base):
    id: int
    organization_id: int  # FK → Organization
    user_id: int  # FK → User
    role: str  # "owner", "admin", "member", "viewer"
    invited_by: int  # FK → User (초대한 사람)
    invited_at: datetime
    joined_at: datetime
    created_at: datetime
    updated_at: datetime
    
    # Constraints
    UniqueConstraint("organization_id", "user_id")
    Index("idx_org_member_role", "organization_id", "role")
```

### 6-2. Organization

```python
class Organization(Base):
    id: int
    name: str
    type: str
    plan_type: str  # "free", "pro", "enterprise"
    owner_id: int  # FK → User (현재 Owner, denormalized for quick access)
    created_at: datetime
    updated_at: datetime
    
    # Relationships
    members = relationship("OrganizationMember", ...)
    projects = relationship("Project", ...)
```

**Owner denormalization**:
- `owner_id`를 Organization 테이블에 저장 (빠른 조회)
- 실제 권한은 OrganizationMember.role로 관리
- 소유권 이전 시 두 곳 모두 업데이트

---

## 7. 구현 우선순위

### Phase 1: 기본 구조
1. ✅ OrganizationMember 모델 생성
2. ✅ Org 생성 시 Owner 자동 할당
3. ✅ 멤버 리스트 조회 API

### Phase 2: 멤버 관리
1. ✅ 멤버 초대 API
2. ✅ 역할 변경 API
3. ✅ 멤버 제거 API

### Phase 3: 소유권 이전
1. ✅ Transfer Ownership API
2. ✅ 권한 체크 로직
3. ✅ 알림 및 Activity Log

### Phase 4: UI 구현
1. ✅ Settings > Team 페이지
2. ✅ 멤버 초대 폼
3. ✅ Transfer Ownership UI

---

## 8. 보안 고려사항

1. **소유권 이전 확인**:
   - 확인 모달 필수
   - 이메일 알림 전송
   - Activity Log 기록

2. **최소 Owner 수 보장**:
   - 마지막 Owner는 소유권 이전 없이 삭제 불가
   - 소유권 이전 시 검증 로직

3. **권한 체크**:
   - 모든 API 엔드포인트에서 권한 체크
   - Owner/Admin 권한 명확히 구분

4. **초대 보안**:
   - 초대 토큰 만료 시간 설정 (7일)
   - 초대 링크는 한 번만 사용 가능

---

이 설계는 GitHub, Supabase, Vercel 등 표준 SaaS 서비스들의 패턴을 따르면서도 AgentGuard의 특성에 맞게 조정되었습니다.
