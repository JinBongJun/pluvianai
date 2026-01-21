# AgentGuard Organization 구조 설계

## 목표
- 표준 SaaS 패턴 (Vercel, Supabase, Railway)을 따라 Org 기반 구조로 전환
- Org 단위 결제 및 플랜 관리
- 멀티 프로젝트 환경에서 일관된 관리

## ✅ 확정된 설계 결정사항

### 1. 플랜 구조 (3개 플랜)
- **Free**: $0/month (1 Org, 1 Project, 5K calls)
- **Pro**: $49/month (3 Orgs, 10 Projects/Org, 100K calls/Org) - Most Popular
- **Enterprise**: $299/month (Unlimited)

### 2. Org 생성 플로우
- ✅ 플랜 선택 단계 제거
- ✅ 모든 Org는 Free 플랜으로 시작
- ✅ 업그레이드는 Settings > Billing에서 진행

### 3. Owner 관리
- ✅ 생성자가 자동으로 Owner
- ✅ Owner Email 입력 필드 제거
- ✅ 멤버 초대는 Settings > Team에서 진행
- ✅ 소유권 이전은 Settings > Team에서 가능

### 4. 전역 헤더 구조
- ✅ 좌측: AG Logo + Breadcrumb
- ✅ 우측: Feedback, Search (⌘K), Help, Suggestions, Profile
- ✅ 다크 테마, 상단 고정
- ✅ 모든 페이지에서 일관된 헤더

### 5. AgentGuard 특화 정보
- ✅ Org 카드에 API Calls, Cost, Alerts 표시
- ✅ Projects 화면에 Usage/Alerts 섹션
- ✅ 프로젝트 카드에 Quality Score, Drift 감지 표시

---

## 1. 전체 플로우

### 1-1. 사용자 여정

```
[로그인]
    ↓
[/organizations] ──────────────────────────────────────────────┐
    │                                                          │
    ├─→ [Organizations 리스트 화면]                           │
    │   • 기존 Org 카드들 표시                                │
    │   • "New organization" 버튼                            │
    │                                                          │
    ├─→ [+ New organization] 클릭                             │
    │   ↓                                                      │
    │   [/organizations/new] ────────────────────────────────┼─→ [Org 생성 폼]
    │       │                                                  │
    │       ├─→ Name 입력                                     │
    │       ├─→ Type 선택 (옵션)                              │
    │       └─→ Owner Email 입력 (옵션)                        │
    │       (플랜 선택 없음 - 기본 Free로 생성)                 │
    │                                                          │
    └──────────────────────────────────────────────────────────┘
                                                              │
                                                              ↓
[Org 생성 완료]
    ↓
[/organizations/{orgId}] (Org 컨텍스트 활성화)
    ↓
[/organizations/{orgId}/projects] ────────────────────────────┐
    │                                                          │
    ├─→ [Projects 리스트 화면]                                 │
    │   • Org의 모든 프로젝트 표시                            │
    │   • "New project" 버튼                                   │
    │                                                          │
    └─→ [프로젝트 상세]                                       │
        • /organizations/{orgId}/projects/{projectId}         │
```

---

## 2. Organizations 리스트 화면 (`/organizations`)

### 2-1. 레이아웃 구조

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [상단 헤더 바 - 전역 헤더]                                               │
│ [AG Logo] / Organizations  [Feedback] [🔍 Search ⌘K] [❓] [💡] [👤]    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ [메인 콘텐츠]                                                             │
│                                                                          │
│  Your Organizations                                                      │
│                                                                          │
│  🔍 Search for an organization              [+ New organization]        │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ [아이콘]  JinBongJun's Org                                         │ │
│  │          Free Plan • 1 project                                      │ │
│  │          📊 5,234 calls  💰 $12.50  ⚠️ 2 alerts                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ [아이콘]  My Company Org                                            │ │
│  │          Pro Plan • 5 projects                                      │ │
│  │          📊 45,234 calls  💰 $128.50  ⚠️ 3 alerts                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2-2. Org 카드 구성

**각 Org 카드**:
- 왼쪽: Org 아이콘 (3D 큐브 또는 네트워크 아이콘)
- 중앙:
  - Org 이름 (클릭 시 해당 Org로 이동)
  - 플랜 정보 (Free Plan, Startup Plan 등)
  - 프로젝트 개수 (1 project, 5 projects 등)
- 오른쪽: "New organization" 버튼 (전체 화면 기준)

**인터랙션**:
- Org 카드 클릭 → `/organizations/{orgId}/projects`로 이동
- "New organization" 버튼 → `/organizations/new`로 이동

### 2-3. 상단 헤더 바 상세 설계

**구성 요소** (이미지 참고):
```
┌──────────────────────────────────────────────────────────────────────────┐
│ [AG Logo] / Organizations  [Feedback] [🔍 Search ⌘K] [❓] [💡] [👤]    │
└──────────────────────────────────────────────────────────────────────────┘
```

**요소별 설명**:
- **좌측**: 
  - `[AG Logo]`: AgentGuard 로고 (홈으로 이동)
  - `/ Organizations`: Breadcrumb (현재 페이지)
  
- **우측** (왼쪽부터):
  1. **Feedback**: 피드백 버튼 (사용자 피드백 수집)
  2. **🔍 Search ⌘K**: 전역 검색 (키보드 단축키 ⌘K 또는 Ctrl+K)
  3. **❓ Help**: 도움말 (문서, FAQ)
  4. **💡 Suggestions**: 제안/아이디어 (선택사항)
  5. **👤 Profile**: 사용자 프로필 (드롭다운)
     - Usage
     - Settings
     - Billing
     - Logout

**스타일**:
- 다크 테마 (이미지와 유사)
- 상단 고정 (sticky header)
- 모든 페이지에서 일관된 헤더

**메인 콘텐츠 영역**:
- "Your Organizations" 제목 (큰 텍스트)
- 검색창과 "New organization" 버튼이 같은 줄에 배치
- 검색창: 왼쪽
- "New organization" 버튼: 오른쪽 (초록색, Primary 버튼)

---

## 3. Org 생성 폼 (`/organizations/new`)

### 3-1. 기본 구조

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [상단 헤더 바]                                                           │
│ New organization              [🔍] [🔔] [👤 User ▼]                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ [메인 콘텐츠 - 모달 또는 전체 페이지]                                     │
│                                                                          │
│  Create a new organization                                               │
│                                                                          │
│  Organizations are a way to group your projects. Each organization      │
│  can be configured with different team members and billing settings.    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Name *                                                            │ │
│  │  [Organization name                    ]                          │ │
│  │  What's the name of your company or team? You can change this     │ │
│  │  later.                                                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Type                                                               │ │
│  │  [Personal ▼]                                                      │ │
│  │  What best describes your organization?                           │ │
│  │  Options: Personal, Startup, Company, Agency, Educational, N/A     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ℹ️  Your organization will start on the Free plan. You can upgrade     │
│  anytime from Settings > Billing.                                      │
│                                                                          │
│  ℹ️  You'll be the owner of this organization. You can invite team      │
│  members and transfer ownership later from Settings > Team.             │
│                                                                          │
│  [Cancel]                    [Create organization]                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3-2. 플랜 선택 제거 (간소화)

**변경사항**: Org 생성 시 플랜 선택 단계 제거
- 모든 Org는 기본적으로 **Free 플랜**으로 생성
- 플랜 업그레이드는 Org 생성 후 **Settings > Billing**에서 진행
- 더 간단하고 빠른 Org 생성 플로우

**이전 방식 (제거됨)**: Step 2 플랜 선택 화면

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [상단 헤더 바]                                                           │
│ New organization              [🔍] [🔔] [👤 User ▼]                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ [메인 콘텐츠]                                                             │
│                                                                          │
│  Select a plan                                                           │
│                                                                          │
│  Choose the plan that best fits your organization's needs. You can      │
│  change this later in Settings > Billing.                               │
│                                                                          │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│  │  Free                │ │  Pro                 │ │  Enterprise          │ │
│  │                      │ │  [Most Popular] ⭐   │ │                      │ │
│  │  $0/month            │ │  $49/month            │ │  $299/month          │ │
│  │                      │ │                      │ │                      │ │
│  │  Core Resources:      │ │  Core Resources:      │ │  Core Resources:      │ │
│  │  • 1 Organization     │ │  • 3 Organizations   │ │  • Unlimited         │ │
│  │  • 1 Project          │ │  • 10 Projects/Org   │ │  • Unlimited         │ │
│  │  • 5K Calls/month    │ │  • 100K Calls/Org    │ │  • Unlimited         │ │
│  │  • 1 Team Member      │ │  • 5 Members/Org     │ │  • Unlimited         │ │
│  │  • 7 days Retention   │ │  • 90 days Retention│ │  • 365 days Retention│ │
│  │                      │ │                      │ │                      │ │
│  │  Features:            │ │  Features:           │ │  Features:           │ │
│  │  ✓ Basic Monitoring   │ │  ✓ All Core Features│ │  ✓ All Pro Features  │ │
│  │  ✓ Basic Drift        │ │  ✓ Enhanced Drift    │ │  ✓ Agent Chain       │ │
│  │  ✗ Alerts             │ │  ✓ Full Alerts      │ │  ✓ RBAC              │ │
│  │  ✗ Model Compare      │ │  ✓ Model Compare     │ │  ✓ Self-hosted       │ │
│  │  ✗ Reports            │ │  ✓ Auto Reports      │ │  ✓ SLA 99.9%         │ │
│  │                      │ │                      │ │  ✓ Dedicated Support │ │
│  │                      │ │                      │ │                      │ │
│  │  [Select]             │ │  [Select]            │ │  [Select]            │ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│                                                                          │
│  [← Back]                    [Continue →]                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**플랜 카드 상세 구조** (3개 플랜):
```
┌─────────────────────────┐
│  Free                   │
│  $0/month                │
│                          │
│  Core Resources:         │
│  • 1 Organization        │
│  • 1 Project             │
│  • 5K API Calls/mo      │
│  • 1 Team Member         │
│  • 7 days Retention      │
│                          │
│  Features:               │
│  ✓ Basic Monitoring      │
│  ✓ Basic Drift           │
│  ✗ Alerts                │
│  ✗ Model Compare         │
│  ✗ Reports               │
│                          │
│  [Select]                │
└─────────────────────────┘

┌─────────────────────────┐
│  Pro                    │
│  [Most Popular] ⭐      │
│  $49/month               │
│                          │
│  Core Resources:         │
│  • 3 Organizations       │
│  • 10 Projects/Org       │
│  • 100K Calls/Org/mo    │
│  • 5 Members/Org          │
│  • 90 days Retention     │
│                          │
│  Features:               │
│  ✓ All Core Features     │
│  ✓ Enhanced Drift        │
│  ✓ Full Alerts           │
│  ✓ Model Compare         │
│  ✓ Auto Reports          │
│  ✗ Agent Chain           │
│  ✗ RBAC                  │
│                          │
│  [Select]                │
└─────────────────────────┘

┌─────────────────────────┐
│  Enterprise             │
│  $299/month              │
│                          │
│  Core Resources:         │
│  • Unlimited Orgs        │
│  • Unlimited Projects    │
│  • Unlimited Calls       │
│  • Unlimited Members      │
│  • 365 days Retention     │
│                          │
│  Features:               │
│  ✓ All Pro Features      │
│  ✓ Agent Chain           │
│  ✓ RBAC                  │
│  ✓ Self-hosted           │
│  ✓ SLA 99.9%             │
│  ✓ Dedicated Support     │
│                          │
│  [Select]                │
└─────────────────────────┘
```

**인터랙션**:
- "Create organization" 버튼 클릭
- `POST /api/v1/organizations` 호출 (plan_type: "free" 기본값)
- Org 생성 완료 → `/organizations/{orgId}/projects`로 이동
- 업그레이드 배너 표시 (선택사항)

### 3-3. Org 생성 후 플랜 업그레이드

**모든 Org는 Free 플랜으로 시작**:
- Org 생성 시 플랜 선택 없음
- 기본적으로 Free 플랜으로 생성
- 사용자가 서비스를 체험한 후 필요 시 업그레이드

**업그레이드 경로**:
1. **Org 생성 직후**: 업그레이드 배너 표시 (선택사항)
   ```
   "🎉 Your organization has been created!"
   "Upgrade to Pro to unlock more features"
   [Upgrade Now] [Maybe Later]
   ```

2. **Settings > Billing**: 언제든지 업그레이드 가능
   - 현재 플랜 표시 (Free)
   - 플랜 비교 테이블 (Pro, Enterprise)
   - "Upgrade" 버튼 → Paddle 결제 페이지로 이동

3. **제한 도달 시**: 자동 업그레이드 안내
   - API Calls 한도 도달 시
   - 프로젝트 수 제한 도달 시
   - 기능 제한 도달 시

**장점**:
- ✅ Org 생성 플로우가 매우 간단해짐 (플랜 선택 단계 제거)
- ✅ 사용자가 먼저 서비스를 체험할 수 있음
- ✅ 결제는 나중에 신중하게 결정 가능
- ✅ 실제 사용 후 필요성을 느낀 후 업그레이드하므로 전환율이 더 높을 수 있음
- ✅ 다른 서비스들도 이런 패턴 사용 (GitHub, GitLab 등)

**가격 정보** (Settings > Billing에서 확인):
- Free: $0/month
- Pro: $49/month (연간 결제 시 $499/year = $41.58/month, 15% 할인)
- Enterprise: $299/month (연간 결제 시 $2,870/year = $239/month, 20% 할인)

### 3-4. Owner 관리 방식

**기본 원칙** (다른 서비스들 참고):
- Org 생성자가 **자동으로 Owner**가 됨
- Owner는 Org의 모든 권한을 가짐 (Billing, 멤버 관리, Org 삭제 등)
- Owner는 나중에 Settings에서 다른 사람에게 소유권을 이전할 수 있음
- 최소 1명의 Owner가 항상 존재해야 함 (Org 삭제 방지)

**Owner Email 필드 제거**:
- ❌ Org 생성 시 Owner Email 입력 필드 제거
- ✅ 생성자가 자동으로 Owner
- ✅ 멤버 초대는 Org 생성 후 Settings > Team에서 진행

**이유**:
- 다른 서비스들(GitHub, Supabase, Vercel)도 생성자가 자동으로 Owner
- 생성 시점에 Owner를 지정하는 것보다, 생성 후 초대하는 방식이 더 일반적
- 플로우가 더 간단하고 명확함

---

## 4. Org 컨텍스트 활성화 후 화면

### 4-1. 상단 헤더 바 (Org 스위처)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [AG Logo]  JinBongJun's Org [FREE ▼]  [🔍] [🔔 3] [👤 User ▼]         │
└──────────────────────────────────────────────────────────────────────────┘
```

**Org 스위처 드롭다운** (클릭 시):
```
┌─────────────────────────────────────┐
│ 🔍 Find organization...             │
│                                      │
│ ✓ JinBongJun's Org                  │
│   My Company Org                     │
│   ─────────────────────────────────  │
│   All Organizations                  │
│   + New organization                 │
└─────────────────────────────────────┘
```

**인터랙션**:
- Org 선택 → 해당 Org로 전환
- "All Organizations" → `/organizations`로 이동
- "+ New organization" → `/organizations/new`로 이동

### 4-2. 사이드바 구조 (Org 컨텍스트 내)

```
┌─────────────────────┐
│ [AG Logo]           │
│                     │
│ Dashboard           │
│ Projects            │
│ Alerts              │
│ API Calls           │
│ Settings            │
│                     │
│ ─────────────────── │
│ [User Info]         │
│ Logout              │
└─────────────────────┘
```

**사이드바 항목**:
1. **Dashboard**: Org 전체 개요 (Usage, Alerts 요약)
2. **Projects**: Org의 모든 프로젝트 리스트
3. **Alerts**: Org 전역 알림
4. **API Calls**: Org 전역 API 호출 로그
5. **Settings**: Org 설정 (Team, Billing, Webhooks 등)

---

## 5. Projects 화면 (`/organizations/{orgId}/projects`)

### 5-1. 레이아웃 구조 (AgentGuard 특화)

**다른 서비스와의 차별화**:
- ✅ **LLM 모니터링 특화 정보**: API Calls, Cost, Quality, Drift
- ✅ **프로젝트별 상태 인디케이터**: Quality Score, Alerts, Drift 감지
- ✅ **비용 분석**: Org 전체 비용 및 프로젝트별 비용 분해
- ✅ **사용량 모니터링**: API Calls 한도 및 사용률

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [상단 헤더 바]                                                           │
│ JinBongJun's Org [FREE ▼]  [🔍] [🔔 3] [👤 User ▼]                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ [사이드바] │ [메인 콘텐츠]                                               │
│            │                                                              │
│ Dashboard  │  Projects                                                     │
│ Projects  │                                                              │
│ Alerts    │  🔍 Search for a project  [Filter]  [Grid] [List]  [+ New] │
│ API Calls │                                                              │
│ Settings  │  ┌──────────────────────────────────────────────────────┐   │
│            │  │ [Usage 섹션 - AgentGuard 특화]                      │   │
│            │  │ Last 7 days                                         │   │
│            │  │ ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│            │  │ │API Calls │ │   Cost   │ │  Quality │            │   │
│            │  │ │ 12,340   │ │  $45.20  │ │   87.5%  │            │   │
│            │  │ │ / 5K     │ │  / $200  │ │   / 100% │            │   │
│            │  │ │ [247%] ⚠️│ │  [23%]   │ │  [88%]   │            │   │
│            │  │ └──────────┘ └──────────┘ └──────────┘            │   │
│            │  │ [Upgrade to Pro] 버튼                               │   │
│            │  └──────────────────────────────────────────────────────┘   │
│            │                                                              │
│            │  ┌──────────────────────────────────────────────────────┐   │
│            │  │ [Alerts 섹션 - AgentGuard 특화]                      │   │
│            │  │ ⚠️ 3 Open Alerts                                   │   │
│            │  │ • Project 1: 2 alerts (Drift detected)              │   │
│            │  │ • Project 3: 1 alert (Quality drop)                  │   │
│            │  │ [View All →]                                        │   │
│            │  └──────────────────────────────────────────────────────┘   │
│            │                                                              │
│            │  [프로젝트 그리드 - AgentGuard 특화 정보]                    │
│            │  ┌──────────────┐ ┌──────────────┐ ┌──────────┐            │
│            │  │ [Project 1]  │ │ [Project 2]  │ │ [Proj 3] │            │
│            │  │              │ │              │ │          │            │
│            │  │ My Project   │ │ API Monitor  │ │ Chat Bot │            │
│            │  │              │ │              │ │          │            │
│            │  │ 📊 1,234     │ │ 📊 8,901     │ │ 📊 2,205 │            │
│            │  │ 💰 $12.50    │ │ 💰 $28.30    │ │ 💰 $4.40 │            │
│            │  │ ⭐ 85%       │ │ ⭐ 92%       │ │ ⭐ 78%   │            │
│            │  │ ⚠️ 2 alerts  │ │ ✅ Healthy   │ │ ⚠️ 1     │            │
│            │  │ 🔄 Drift     │ │              │ │          │            │
│            │  │              │ │              │ │          │            │
│            │  │ [→]          │ │ [→]          │ │ [→]      │            │
│            │  └──────────────┘ └──────────────┘ └──────────┘            │
└────────────┴──────────────────────────────────────────────────────────────┘
```

**프로젝트 카드 특화 정보**:
- 📊 API Calls: 최근 24시간 호출 수
- 💰 Cost: 최근 7일 비용
- ⭐ Quality: 평균 Quality Score
- ⚠️ Alerts: 활성 알림 수
- 🔄 Drift: 드리프트 감지 여부

### 5-2. 주요 변경사항

**이전 구조와의 차이**:
- ❌ 사이드바에 프로젝트 리스트 없음 (중앙 그리드만)
- ✅ "New project" 버튼이 메인 상단 검색/필터 옆에 위치
- ✅ 상단 헤더에 Org 스위처 추가
- ✅ 좌측 Usage/Alerts 섹션 (Vercel 스타일)

---

## 6. Org Settings (`/organizations/{orgId}/settings`)

### 6-1. Settings 탭 구조

```
Settings
├── General
│   ├── Organization name
│   ├── Organization type
│   └── Description
├── Team
│   ├── Members list
│   ├── Invite members
│   ├── Roles management
│   └── Transfer ownership (Owner만 가능)
├── Billing
│   ├── Current plan
│   ├── Upgrade/Downgrade
│   ├── Payment method
│   └── Invoice history
├── Webhooks
│   ├── Webhook list
│   └── Create webhook
└── Danger Zone
    └── Delete organization
```

### 6-2. Billing 섹션 (Paddle 연동)

**구조**:
- 현재 플랜 표시
- 플랜 변경 버튼 → Paddle Hosted Checkout으로 이동
- 결제 수단 관리 (Paddle에서 관리)
- 청구서 내역 (Paddle에서 가져오기)

**플랜 변경 플로우**:
1. Settings > Billing에서 "Upgrade" 또는 "Change Plan" 클릭
2. 플랜 선택
3. Paddle Hosted Checkout으로 리다이렉트
4. 결제 완료 후 콜백으로 플랜 업데이트

---

## 7. 데이터 모델 변경사항

### 7-1. Organization 모델 추가

```python
class Organization(Base):
    id: int
    name: str
    type: str  # personal, startup, company, agency, educational, na
    plan_type: str  # free, pro, enterprise
    paddle_customer_id: str  # Paddle 고객 ID
    paddle_subscription_id: str  # Paddle 구독 ID
    owner_id: int  # FK → User
    created_at: datetime
    updated_at: datetime
```

### 7-2. OrganizationMember 모델 추가

```python
class OrganizationMember(Base):
    id: int
    organization_id: int  # FK → Organization
    user_id: int  # FK → User
    role: str  # owner, admin, member, viewer
    created_at: datetime
```

### 7-3. Project 모델 수정

```python
class Project(Base):
    id: int
    organization_id: int  # FK → Organization (추가)
    name: str
    description: str
    owner_id: int  # FK → User (유지, 프로젝트 레벨 Owner)
    created_at: datetime
    updated_at: datetime
```

**권한 구조**:
- **Org 레벨**: OrganizationMember.role (owner, admin, member, viewer)
- **Project 레벨**: ProjectMember.role (owner, admin, member, viewer)
- Org Owner/Admin은 모든 프로젝트에 접근 가능
- Project Owner는 해당 프로젝트만 관리

---

## 8. API 엔드포인트 추가

### 8-1. Organizations API

```
GET    /api/v1/organizations              # Org 리스트
POST   /api/v1/organizations              # Org 생성
GET    /api/v1/organizations/{id}         # Org 상세
PATCH  /api/v1/organizations/{id}         # Org 수정
DELETE /api/v1/organizations/{id}         # Org 삭제

GET    /api/v1/organizations/{id}/members # Org 멤버 리스트
POST   /api/v1/organizations/{id}/members # Org 멤버 추가
PATCH  /api/v1/organizations/{id}/members/{user_id} # 역할 변경
DELETE /api/v1/organizations/{id}/members/{user_id} # 멤버 제거
```

### 8-2. Billing API (Paddle 연동)

```
GET    /api/v1/organizations/{id}/billing # 현재 플랜 정보
POST   /api/v1/organizations/{id}/billing/upgrade # 플랜 업그레이드
POST   /api/v1/organizations/{id}/billing/cancel # 구독 취소
POST   /api/v1/organizations/{id}/billing/webhooks/paddle # Paddle 웹훅
```

---

## 9. 마이그레이션 전략

### 9-1. 기존 프로젝트 단위 결제 → Org 단위 결제

**단계**:
1. 기존 사용자들의 모든 프로젝트를 하나의 기본 Org로 묶기
2. 프로젝트별 플랜 → Org 플랜으로 통합 (가장 높은 플랜 선택)
3. Paddle 구독도 Org 단위로 마이그레이션
4. 프로젝트 Settings > Billing 제거 또는 "Org Billing으로 이동" 링크만

**마이그레이션 스크립트**:
- 각 사용자마다 기본 Org 생성
- 기존 프로젝트들을 해당 Org에 연결
- 프로젝트별 플랜 정보를 Org 플랜으로 통합

---

## 10. 우리 방식으로 구현하는 방법 (Paddle Hosted Checkout)

### 10-1. 플랜 선택 화면 구현 방식

**2-Step 폼 구조** (추천):
1. **Step 1**: Name, Type, Owner Email 입력
2. **Step 2**: 플랜 선택 (사진처럼 플랜 비교 테이블)
   - Free 선택 → 바로 생성
   - 유료 선택 → Paddle로 이동

**장점**:
- 사용자가 플랜을 신중하게 선택할 수 있음
- 플랜 비교 테이블을 크게 보여줄 수 있음
- "Most Popular" 태그 등으로 가이드 가능

### 10-2. 간소화된 Org 생성 플로우

#### 새로운 플로우 (플랜 선택 제거)
```
[Step 1: 기본 정보 입력]
    ↓
[Name, Type, Owner Email 입력]
    ↓
["Create organization" 버튼 클릭]
    ↓
[POST /api/v1/organizations]
    {
      name: "My Org",
      type: "startup",
      plan_type: "free", // 항상 Free로 시작
      owner_email: null
    }
    ↓
[Org 생성 완료]
    ↓
[/organizations/{orgId}/projects로 리다이렉트]
    ↓
[업그레이드 배너 표시 (선택사항)]
    "🎉 Your organization has been created!"
    "Upgrade to Pro to unlock:
     • 3 Organizations (currently 1)
     • 10 Projects per Org (currently 1)
     • 100K API Calls per Org (currently 5K)
     • Full alerts & reports"
    [Upgrade Now] [Maybe Later]
    ↓
[사용자가 원할 때 Settings > Billing에서 업그레이드]
```

#### 업그레이드 플로우 (Settings > Billing)
```
[/organizations/{orgId}/settings/billing]
    ↓
[현재 플랜 표시: Free]
    ↓
[플랜 비교 테이블: Pro, Enterprise]
    ↓
[원하는 플랜 선택]
    ↓
["Upgrade" 버튼 클릭]
    ↓
[POST /api/v1/organizations/{id}/billing/upgrade]
    {
      plan_type: "pro", // 또는 "enterprise"
      billing_period: "monthly" // 또는 "yearly"
    }
    ↓
[Paddle Hosted Checkout으로 리다이렉트]
    ↓
[결제 완료]
    ↓
[Paddle 웹훅 → 플랜 업데이트]
    ↓
[/organizations/{orgId}/settings/billing?success=true]
    ↓
[성공 메시지 표시]
    "🎉 Your organization has been upgraded to Pro!"
```

### 10-3. Paddle 연동 플로우 상세

#### Free 플랜 플로우
```
[Step 1: 기본 정보 입력]
    ↓
[Step 2: 플랜 선택 화면]
    ↓
[Free 플랜 선택]
    ↓
[Continue 클릭]
    ↓
[POST /api/v1/organizations]
    {
      name: "My Org",
      type: "startup",
      plan_type: "free",
      owner_email: null
    }
    ↓
[Org 생성 완료]
    ↓
[/organizations/{orgId}/projects로 리다이렉트]
```

#### Pro/Enterprise 플랜 플로우
```
[Step 1: 기본 정보 입력]
    ↓
[Step 2: 플랜 선택 화면]
    ↓
[Pro 또는 Enterprise 플랜 선택]
    ↓
[연간/월간 선택 (옵션)]
    ↓
[Continue to Payment 클릭]
    ↓
[POST /api/v1/organizations/billing/create-checkout]
    {
      name: "My Org",
      type: "startup",
      plan_type: "pro", // 또는 "enterprise"
      owner_email: null,
      billing_period: "monthly" // 또는 "yearly"
    }
    ↓
[백엔드에서 Paddle Checkout 생성]
    - 임시로 Org 정보 저장 (아직 생성 안 됨)
    - Paddle Checkout URL 생성
    ↓
[응답: { checkout_url: "https://checkout.paddle.com/..." }]
    ↓
[프론트엔드: window.location.href = checkout_url]
    ↓
[Paddle Hosted Checkout 페이지로 리다이렉트]
    ↓
[사용자가 Paddle에서 결제 완료]
    ↓
[Paddle 웹훅 → POST /api/v1/organizations/billing/webhooks/paddle]
    ↓
[웹훅 처리]
    - Paddle 서명 검증
    - 결제 완료 이벤트 확인
    - 임시 저장된 Org 정보로 실제 Org 생성
    - Paddle customer_id, subscription_id 저장
    - Owner 설정
    ↓
[Org 생성 완료]
    ↓
[Paddle success_url로 리다이렉트]
    ↓
[/organizations/{orgId}/projects로 이동]
```

### 10-3. 백엔드 구현 상세

#### Checkout 생성 엔드포인트
```python
POST /api/v1/organizations/billing/create-checkout

요청:
{
  "name": "My Org",
  "type": "startup",
  "plan_type": "pro", // 또는 "enterprise"
  "owner_email": null,
  "billing_period": "monthly" // 또는 "yearly" (할인 적용)
}

처리:
1. 임시 Org 정보를 세션 또는 Redis에 저장 (key: checkout_session_id)
2. Paddle API로 Checkout 생성
   - items: 플랜에 맞는 상품 ID (월간/연간 구분)
   - customer_email: 현재 사용자 이메일
   - success_url: /organizations/{orgId}/projects
   - metadata: { checkout_session_id, name, type, owner_email, billing_period }
   - 가격: billing_period에 따라 할인 적용 (Pro: 15%, Enterprise: 20%)
3. Checkout URL 반환

응답:
{
  "checkout_url": "https://checkout.paddle.com/...",
  "checkout_session_id": "xxx"
}
```

#### Paddle 웹훅 처리
```python
POST /api/v1/organizations/billing/webhooks/paddle

처리:
1. Paddle 서명 검증
2. 이벤트 타입 확인 (subscription.created 또는 payment.succeeded)
3. metadata에서 checkout_session_id 추출
4. 임시 저장된 Org 정보 조회
5. Org 생성:
   - Organization 모델 생성
   - OrganizationMember 생성 (Owner)
   - Paddle customer_id, subscription_id 저장
6. Owner Email이 있으면 초대 전송
7. 성공 응답 반환
```

### 10-4. 프론트엔드 구현 상세

#### Step 1 컴포넌트
```typescript
// /organizations/new/step1
- Name 입력 필드
- Type 드롭다운
- Owner Email 입력 필드 (옵션)
- "Continue" 버튼
```

#### Org 생성 컴포넌트 (간소화됨)
```typescript
// /organizations/new
- Name 입력 필드 (필수)
- Type 드롭다운 (옵션)
- Owner Email 입력 필드 (옵션)
- 안내 메시지: "Your organization will start on the Free plan. You can upgrade anytime from Settings > Billing."
- "Create organization" 버튼

// 생성 로직
const handleCreate = async () => {
  const response = await fetch('/api/v1/organizations', {
    method: 'POST',
    body: JSON.stringify({
      name: formData.name,
      type: formData.type || null,
      plan_type: "free", // 항상 Free로 시작
      owner_email: formData.owner_email || null
    })
  });
  
  const org = await response.json();
  router.push(`/organizations/${org.id}/projects`);
};
```

#### 업그레이드 배너 컴포넌트 (선택사항)
```typescript
// /organizations/{orgId}/projects
const UpgradeBanner = ({ orgName, onDismiss }) => {
  const [showBanner, setShowBanner] = useState(true);
  
  if (!showBanner) return null;
  
  return (
    <div className="upgrade-banner">
      <h3>🎉 Your organization "{orgName}" has been created!</h3>
      <p>Upgrade to Pro to unlock:</p>
      <ul>
        <li>3 Organizations (currently 1)</li>
        <li>10 Projects per Org (currently 1)</li>
        <li>100K API Calls per Org (currently 5K)</li>
        <li>Full alerts & reports</li>
      </ul>
      <button onClick={() => router.push(`/organizations/${orgId}/settings/billing`)}>
        Upgrade Now
      </button>
      <button onClick={() => setShowBanner(false)}>Maybe Later</button>
    </div>
  );
};
```

#### Settings > Billing 페이지 (업그레이드)
```typescript
// /organizations/{orgId}/settings/billing
const BillingSettings = ({ org }) => {
  return (
    <div>
      <h2>Billing</h2>
      
      {/* 현재 플랜 */}
      <div className="current-plan">
        <h3>Current Plan</h3>
        <p>{org.plan_type} Plan</p>
        {org.plan_type === "free" && (
          <p>Upgrade to unlock more features</p>
        )}
      </div>
      
      {/* 플랜 비교 테이블 */}
      <div className="plan-comparison">
        <PlanCard 
          plan="pro"
          isPopular={true}
          onUpgrade={() => handleUpgrade("pro")}
        />
        <PlanCard 
          plan="enterprise"
          onUpgrade={() => handleUpgrade("enterprise")}
        />
      </div>
    </div>
  );
};

const handleUpgrade = async (planType: string, billingPeriod: string = "monthly") => {
  const response = await fetch(`/api/v1/organizations/${orgId}/billing/upgrade`, {
    method: 'POST',
    body: JSON.stringify({
      plan_type: planType,
      billing_period: billingPeriod
    })
  });
  
  const { checkout_url } = await response.json();
  window.location.href = checkout_url; // Paddle로 리다이렉트
};
```

---

## 11. 구현 우선순위

### Phase 1: 기본 구조
1. ✅ Organization 모델 추가
2. ✅ OrganizationMember 모델 추가
3. ✅ Project 모델에 organization_id 추가
4. ✅ Organizations API 엔드포인트 구현

### Phase 2: UI 구현
1. ✅ `/organizations` 리스트 화면
2. ✅ `/organizations/new` 생성 폼
3. ✅ Org 스위처 (상단 헤더)
4. ✅ 사이드바 구조 변경

### Phase 3: 결제 연동
1. ✅ Paddle Hosted Checkout 연동
2. ✅ Org 생성 시 유료 플랜 결제 플로우
3. ✅ Settings > Billing 구현
4. ✅ Paddle 웹훅 처리

### Phase 4: 마이그레이션
1. ✅ 기존 데이터 마이그레이션 스크립트
2. ✅ 프로젝트 단위 결제 → Org 단위 결제 전환

---

이 구조가 표준 SaaS 패턴을 따르면서도 AgentGuard의 특성을 반영한 최종 설계입니다.
