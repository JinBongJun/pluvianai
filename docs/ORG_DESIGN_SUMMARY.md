# AgentGuard Organization 설계 요약

## 📋 확정된 설계 결정사항

### 1. 플랜 구조 (3개 플랜)
- **Free**: $0/month
  - 1 Org, 1 Project, 5K calls/월, 1 Member, 7일 보관
- **Pro**: $49/month (Most Popular ⭐)
  - 3 Orgs, 10 Projects/Org, 100K calls/Org/월, 5 Members/Org, 90일 보관
- **Enterprise**: $299/month
  - Unlimited, 모든 기능, Self-hosted, SLA 99.9%

### 2. Org 생성 플로우
- ✅ 플랜 선택 단계 제거 (간소화)
- ✅ 모든 Org는 Free 플랜으로 시작
- ✅ 업그레이드는 Settings > Billing에서 진행
- ✅ 생성자가 자동으로 Owner

### 3. Owner 관리
- ✅ 생성자가 자동으로 Owner
- ✅ Owner Email 입력 필드 제거
- ✅ 멤버 초대는 Settings > Team에서 진행
- ✅ 소유권 이전은 Settings > Team에서 가능

### 4. 전역 헤더 구조
```
[AG Logo] / [Breadcrumb]  [Feedback] [🔍 Search ⌘K] [❓] [💡] [👤]
```
- ✅ 좌측: AG Logo + Breadcrumb
- ✅ 우측: Feedback, Search (⌘K), Help, Suggestions, Profile
- ✅ 다크 테마, 상단 고정
- ✅ 모든 페이지에서 일관된 헤더

### 5. AgentGuard 특화 정보
- ✅ Org 카드에 API Calls, Cost, Alerts 표시
- ✅ Projects 화면에 Usage/Alerts 섹션
- ✅ 프로젝트 카드에 Quality Score, Drift 감지 표시

---

## 📁 관련 문서

- `ORG_STRUCTURE_DESIGN.md`: 전체 Org 구조 설계
- `ORG_OWNER_MANAGEMENT.md`: Owner 관리 상세 설계
- `ORG_DIFFERENTIATION.md`: 차별화 전략
- `GLOBAL_HEADER_DESIGN.md`: 전역 헤더 설계
- `PRICING_PLAN_DESIGN.md`: 플랜 가격 설계

---

## 🚀 다음 단계

1. **Org 생성 폼 구현** (`/organizations/new`)
2. **Settings > Team 페이지 설계**
3. **Settings > Billing 페이지 설계**
4. **프로젝트 화면 구현** (`/organizations/{orgId}/projects`)
