# AgentGuard Org 생성 폼 상세 설계

## 목표
- 간단하고 빠른 Org 생성 플로우
- 표준 SaaS 패턴 적용
- 사용자 친화적인 UI/UX

---

## 1. 페이지 구조

### 1-1. 전체 레이아웃

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [전역 헤더]                                                              │
│ [AG Logo] / Organizations / New  [Feedback] [🔍 ⌘K] [❓] [💡] [👤]     │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ [메인 콘텐츠]                                                             │
│                                                                          │
│  Create a new organization                                               │
│                                                                          │
│  Organizations are a way to group your projects. Each organization      │
│  can be configured with different team members and billing settings.    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Name *                                                            │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │ Organization name                                            │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  What's the name of your company or team? You can change this     │ │
│  │  later.                                                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Type                                                              │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │ Personal                                    [▼]              │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  What best describes your organization?                           │ │
│  │  Options: Personal, Startup, Company, Agency, Educational, N/A    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ℹ️  Your organization will start on the Free plan. You can      │ │
│  │  upgrade anytime from Settings > Billing.                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ℹ️  You'll be the owner of this organization. You can invite      │ │
│  │  team members and transfer ownership later from Settings > Team.  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  [Cancel]                                    [Create organization]      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 폼 필드 상세

### 2-1. Name 필드 (필수)

**레이블**: `Name *`

**입력 필드**:
- 타입: Text input
- Placeholder: "Organization name"
- 최소 길이: 1자
- 최대 길이: 255자
- 유효성 검사:
  - 비어있으면 안 됨
  - 공백만으로 구성 불가
  - 특수 문자 제한 (선택사항)

**도움말 텍스트**:
- "What's the name of your company or team? You can change this later."

**에러 메시지**:
- "Organization name is required"
- "Organization name must be at least 1 character"
- "Organization name cannot exceed 255 characters"

### 2-2. Type 필드 (선택)

**레이블**: `Type`

**드롭다운 옵션**:
- Personal
- Startup
- Company
- Agency
- Educational
- N/A (또는 "Other")

**기본값**: Personal

**도움말 텍스트**:
- "What best describes your organization?"

**선택사항 처리**:
- 비워두면 `null` 또는 "N/A"로 저장
- 백엔드에서 `nullable=True` 처리

---

## 3. 정보 메시지

### 3-1. 플랜 정보

```
ℹ️  Your organization will start on the Free plan. You can upgrade anytime 
from Settings > Billing.
```

**스타일**:
- 정보 아이콘 (ℹ️)
- 회색 텍스트
- 작은 폰트 크기

### 3-2. Owner 정보

```
ℹ️  You'll be the owner of this organization. You can invite team members 
and transfer ownership later from Settings > Team.
```

**스타일**:
- 정보 아이콘 (ℹ️)
- 회색 텍스트
- 작은 폰트 크기

---

## 4. 버튼

### 4-1. Cancel 버튼

**위치**: 왼쪽 하단

**스타일**:
- Secondary 버튼
- 회색 테두리
- 클릭 시: `/organizations`로 이동

### 4-2. Create organization 버튼

**위치**: 오른쪽 하단

**스타일**:
- Primary 버튼
- 초록색 배경
- Name 필드가 유효할 때만 활성화

**로딩 상태**:
- 클릭 시 로딩 스피너 표시
- 버튼 비활성화
- "Creating..." 텍스트

---

## 5. API 연동

### 5-1. 요청

```typescript
POST /api/v1/organizations

{
  "name": "My Organization",
  "type": "startup",  // 또는 null
  "plan_type": "free"  // 항상 "free"
}
```

### 5-2. 응답

```typescript
{
  "id": 123,
  "name": "My Organization",
  "type": "startup",
  "plan_type": "free",
  "owner_id": 456,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 5-3. 에러 처리

**400 Bad Request**:
- 유효성 검사 실패
- 에러 메시지 표시

**401 Unauthorized**:
- 로그인 필요
- `/login`으로 리다이렉트

**409 Conflict**:
- Org 이름 중복 (선택사항)
- "An organization with this name already exists"

---

## 6. 성공 후 플로우

### 6-1. 리다이렉트

```
POST /api/v1/organizations 성공
    ↓
응답 받기
    ↓
/organizations/{orgId}/projects로 리다이렉트
```

### 6-2. 업그레이드 배너 (선택사항)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🎉 Your organization "My Organization" has been created!                 │
│                                                                          │
│ Upgrade to Pro to unlock:                                                │
│ • 3 Organizations (currently 1)                                        │
│ • 10 Projects per Org (currently 1)                                     │
│ • 100K API Calls per Org (currently 5K)                                 │
│ • Full alerts & reports                                                 │
│                                                                          │
│ [Upgrade Now]                    [Maybe Later]                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 7. 프론트엔드 구현

### 7-1. 컴포넌트 구조

```typescript
// /organizations/new/page.tsx
export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState('personal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          name: name.trim(),
          type: type || null,
          plan_type: 'free'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create organization');
      }

      const org = await response.json();
      router.push(`/organizations/${org.id}/projects`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Create a new organization</h1>
      <p className="text-gray-400 mb-8">
        Organizations are a way to group your projects. Each organization
        can be configured with different team members and billing settings.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name 필드 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            required
            maxLength={255}
          />
          <p className="mt-1 text-sm text-gray-400">
            What's the name of your company or team? You can change this later.
          </p>
        </div>

        {/* Type 필드 */}
        <div>
          <label className="block text-sm font-medium mb-2">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
          >
            <option value="personal">Personal</option>
            <option value="startup">Startup</option>
            <option value="company">Company</option>
            <option value="agency">Agency</option>
            <option value="educational">Educational</option>
            <option value="na">N/A</option>
          </select>
          <p className="mt-1 text-sm text-gray-400">
            What best describes your organization?
          </p>
        </div>

        {/* 정보 메시지 */}
        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            ℹ️  Your organization will start on the Free plan. You can upgrade
            anytime from Settings > Billing.
          </p>
        </div>

        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            ℹ️  You'll be the owner of this organization. You can invite team
            members and transfer ownership later from Settings > Team.
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.push('/organizations')}
            className="px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create organization'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

### 7-2. 유효성 검사

```typescript
const validateName = (name: string): string | null => {
  if (!name.trim()) {
    return 'Organization name is required';
  }
  if (name.trim().length < 1) {
    return 'Organization name must be at least 1 character';
  }
  if (name.length > 255) {
    return 'Organization name cannot exceed 255 characters';
  }
  return null;
};
```

---

## 8. 백엔드 구현

### 8-1. API 엔드포인트

```python
@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_data: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new organization
    """
    # 유효성 검사
    if not org_data.name or not org_data.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name is required"
        )
    
    # 중복 체크 (선택사항)
    existing = db.query(Organization).filter(
        Organization.name == org_data.name.strip(),
        Organization.owner_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organization with this name already exists"
        )
    
    # Org 생성
    org = Organization(
        name=org_data.name.strip(),
        type=org_data.type,
        plan_type="free",  # 항상 Free로 시작
        owner_id=current_user.id
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    
    # OrganizationMember 생성 (Owner 역할)
    member = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role="owner"
    )
    db.add(member)
    db.commit()
    
    return org
```

### 8-2. 스키마

```python
class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: Optional[str] = Field(None, regex="^(personal|startup|company|agency|educational|na)$")
    plan_type: Literal["free"] = "free"  # 항상 "free"
```

---

## 9. 테스트 케이스

### 9-1. 성공 케이스
- ✅ 유효한 이름과 타입 입력 → Org 생성 성공
- ✅ 이름만 입력 (타입 비움) → Org 생성 성공
- ✅ 생성 후 `/organizations/{id}/projects`로 리다이렉트

### 9-2. 실패 케이스
- ✅ 이름 비움 → 에러 메시지 표시
- ✅ 이름이 255자 초과 → 에러 메시지 표시
- ✅ 중복된 이름 → 에러 메시지 표시
- ✅ 로그인 안 함 → `/login`으로 리다이렉트

---

## 10. 구현 체크리스트

### 프론트엔드
- [ ] `/organizations/new` 페이지 생성
- [ ] Name 입력 필드 (필수)
- [ ] Type 드롭다운 (선택)
- [ ] 정보 메시지 표시
- [ ] 유효성 검사
- [ ] 에러 처리
- [ ] 로딩 상태
- [ ] 성공 후 리다이렉트

### 백엔드
- [ ] `POST /api/v1/organizations` 엔드포인트
- [ ] Organization 모델 생성
- [ ] OrganizationMember 모델 생성 (Owner)
- [ ] 유효성 검사
- [ ] 중복 체크 (선택사항)
- [ ] 에러 처리

### 통합
- [ ] API 연동 테스트
- [ ] 에러 케이스 테스트
- [ ] 성공 플로우 테스트

---

이 설계를 기반으로 Org 생성 폼을 구현할 수 있습니다.
