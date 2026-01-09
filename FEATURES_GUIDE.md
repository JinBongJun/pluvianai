# AgentGuard 기능 가이드

이 문서는 AgentGuard 서비스의 모든 기능과 각 기능을 어디서 어떻게 확인할 수 있는지 설명합니다.

---

## 🎯 서비스 개요

**AgentGuard**는 LLM(Large Language Model) 에이전트의 **품질, 비용, 드리프트**를 모니터링하는 SaaS 플랫폼입니다.

---

## 📍 접근 경로별 기능 목록

### 1. 랜딩 페이지 (`/`)

**접근 방법**: 브라우저에서 서비스 URL 접속 시 첫 화면

**기능**:
- 서비스 소개 및 주요 기능 설명
- SDK 설치 가이드 (Python, Node.js)
- "Get Started" 버튼 → 회원가입 페이지로 이동
- "Sign in" 버튼 → 로그인 페이지로 이동

**확인 방법**: 
- 서비스 메인 페이지 접속
- 상단 네비게이션에서 "Features", "Integrations", "Pricing" 섹션 확인
- 하단 "Get Started Free" 버튼 클릭

---

### 2. 로그인/회원가입 (`/login`)

**접근 방법**: 
- 랜딩 페이지에서 "Sign in" 또는 "Get Started" 클릭
- 직접 URL: `/login` 또는 `/login?mode=signup`

**기능**:
- **로그인**: 이메일/비밀번호로 로그인
- **회원가입**: 새 계정 생성 (이메일, 비밀번호, 이름)
- JWT 토큰 기반 인증

**확인 방법**:
- 로그인: 이메일과 비밀번호 입력 후 "Sign in" 클릭
- 회원가입: "Don't have an account? Sign up" 클릭 또는 `/login?mode=signup` 접속

---

### 3. 온보딩 (`/onboarding`)

**접근 방법**: 회원가입 후 자동 이동 또는 직접 URL 접속

**기능**:
- SDK 설치 가이드 (60초 설치)
- API 키 설정 방법 안내
- 프로젝트 생성 및 샘플 데이터 생성 가이드

**확인 방법**:
- 회원가입 후 자동으로 이동
- 단계별 가이드 따라하기
- "Generate Sample Data" 옵션으로 샘플 데이터 생성 가능

---

### 4. 대시보드 - 프로젝트 목록 (`/dashboard`)

**접근 방법**: 로그인 후 자동 이동 또는 사이드바에서 "Dashboard" 클릭

**기능**:
- **프로젝트 목록 보기**: 내가 만든 모든 프로젝트 표시
- **프로젝트 검색**: 프로젝트 이름으로 검색
- **프로젝트 생성**: "Create Project" 버튼으로 새 프로젝트 생성
- **프로젝트 클릭**: 프로젝트 상세 페이지로 이동

**확인 방법**:
1. 로그인 후 `/dashboard` 접속
2. "Create Project" 버튼 클릭
3. 프로젝트 이름과 설명 입력
4. "Generate Sample Data" 옵션 선택 가능
5. 생성된 프로젝트 카드 클릭하여 상세 페이지로 이동

---

### 5. 프로젝트 상세 - Overview 탭 (`/dashboard/[projectId]`)

**접근 방법**: 프로젝트 목록에서 프로젝트 카드 클릭

**기능**:
- **통계 카드 4개**:
  - Total API Calls (지난 7일)
  - Avg Quality Score (지난 7일)
  - Total Cost (지난 7일)
  - Success Rate (지난 7일)
- **Quality Scores 차트**: 시간별 품질 점수 추이 (Area Chart)
- **Drift Detections 차트**: 드리프트 감지 결과 (Bar Chart)
- **각 통계 카드의 "View Details" 버튼**: 상세 페이지로 이동

**확인 방법**:
1. 프로젝트 클릭
2. Overview 탭에서 통계 카드 확인
3. 차트에서 데이터 추이 확인
4. "View Details" 버튼으로 상세 페이지 이동

---

### 6. API Calls 페이지 (`/dashboard/[projectId]/api-calls`)

**접근 방법**: 
- 프로젝트 상세 페이지에서 "API Calls" 탭 클릭
- Overview의 "Total API Calls" 카드에서 "View Details" 클릭

**기능**:
- **API 호출 목록**: 모든 LLM API 호출 기록 표시
- **필터링**:
  - Date Range: DateRangePicker로 날짜 범위 선택
  - Provider: OpenAI, Anthropic, Google 등
  - Model: gpt-4, claude-3 등
  - Status: Success, Error
  - Agent Name: 에이전트 이름
  - Search: 요청/응답 텍스트 검색
- **정렬**: Time, Latency 기준 정렬
- **페이지네이션**: 25/50/100개씩 표시
- **상세 보기**: 각 API 호출 클릭 시 상세 정보 페이지로 이동

**확인 방법**:
1. 프로젝트 상세 페이지에서 "API Calls" 탭 클릭
2. 필터 패널 열기 (Filters 버튼)
3. Date Range 선택 (Last 7 days, Last 30 days 등)
4. Provider, Model 등 필터 적용
5. 테이블에서 각 API 호출 확인
6. "View" 버튼으로 상세 정보 확인

**데이터 생성 방법**:
- SDK를 통해 실제 LLM API 호출을 하면 자동으로 기록됨
- 또는 샘플 데이터 생성 기능 사용

---

### 7. API Call 상세 페이지 (`/dashboard/[projectId]/api-calls/[callId]`)

**접근 방법**: API Calls 목록에서 "View" 버튼 클릭

**기능**:
- **요청 정보**: Provider, Model, Agent Name, Chain ID
- **응답 정보**: Status Code, Latency, Tokens
- **요청/응답 데이터**: 전체 JSON 데이터 표시
- **Quality Score 링크**: 해당 호출의 품질 점수 확인
- **Drift Detection 링크**: 관련 드리프트 감지 결과 확인

**확인 방법**:
1. API Calls 목록에서 특정 호출의 "View" 클릭
2. 요청/응답 데이터 확인
3. 관련 Quality Score, Drift Detection 링크 확인

---

### 8. Compare 페이지 (`/dashboard/[projectId]/compare`)

**접근 방법**: 프로젝트 상세 페이지에서 "Compare" 탭 클릭

**기능**:
- **모델 비교**: 여러 LLM 모델의 성능 비교
- **비교 지표**:
  - Avg Cost per Call
  - Avg Latency
  - Success Rate
  - Total Calls
  - Recommendation Score
- **Date Range 선택**: 비교할 기간 선택
- **모델별 추천**: 각 모델에 대한 추천 사항 표시

**확인 방법**:
1. "Compare" 탭 클릭
2. Date Range 선택 (최소 7일 이상의 데이터 필요)
3. 여러 모델의 성능 비교 결과 확인
4. Recommendation Score가 높은 모델 확인

**주의사항**:
- Startup 플랜 이상 필요 (403 에러 시 구독 업그레이드 안내 표시)
- 여러 모델의 API 호출 데이터가 있어야 비교 가능

---

### 9. Reports 페이지 (`/dashboard/[projectId]/reports`)

**접근 방법**: 프로젝트 상세 페이지에서 "Reports" 탭 클릭

**기능**:
- **리포트 생성**: 프로젝트 데이터를 기반으로 리포트 생성
- **템플릿 선택**:
  - Standard Report
  - Detailed Report
  - Executive Summary
- **Date Range 선택**: 리포트에 포함할 기간 선택
- **리포트 다운로드**: 생성된 리포트 다운로드

**확인 방법**:
1. "Reports" 탭 클릭
2. Template 선택 (Standard/Detailed/Executive)
3. Date Range 선택
4. "Generate Report" 버튼 클릭
5. 생성된 리포트 확인 및 "Download Report" 클릭

---

### 10. Team Members 탭 (`/dashboard/[projectId]?tab=members`)

**접근 방법**: 프로젝트 상세 페이지에서 "Team Members" 탭 클릭

**기능**:
- **멤버 목록**: 프로젝트에 속한 모든 멤버 표시
- **멤버 추가**: 이메일로 멤버 추가 (AgentGuard 계정 필요)
- **권한 관리**: Owner, Admin, Member, Viewer 역할 설정
- **멤버 활동 추적**: 각 멤버의 활동 통계 및 타임라인
- **권한별 기능 가시성**: 각 역할이 접근 가능한 기능 표시
- **멤버 초대 링크**: 초대 링크 생성 및 공유

**확인 방법**:
1. "Team Members" 탭 클릭
2. 멤버 목록 확인
3. "Add Member" 또는 "Generate Invite Link" 클릭
4. 멤버 카드 클릭하여 활동 추적 및 권한 정보 확인
5. 권한 변경: 드롭다운에서 역할 선택

**권한 설명**:
- **Owner**: 모든 권한 (프로젝트 삭제 포함)
- **Admin**: 설정 및 멤버 관리 (프로젝트 삭제 제외)
- **Member**: 데이터 조회 및 API 호출 가능 (설정 변경 불가)
- **Viewer**: 읽기 전용

---

### 11. Settings 탭 (`/dashboard/[projectId]?tab=settings`)

**접근 방법**: 프로젝트 상세 페이지에서 "Settings" 탭 클릭 (Owner/Admin만 접근 가능)

**기능**:
- **프로젝트 이름/설명 수정**
- **프로젝트 삭제**: Danger Zone에서 프로젝트 삭제 (Owner만 가능)

**확인 방법**:
1. "Settings" 탭 클릭 (Owner/Admin만 보임)
2. 프로젝트 이름 또는 설명 수정
3. "Save Changes" 클릭
4. 프로젝트 삭제: "Delete Project" 버튼 클릭 (확인 필요)

---

### 12. Settings - Profile (`/settings/profile`)

**접근 방법**: 사이드바 하단 "Settings" 클릭 → "Profile" 카드 클릭

**기능**:
- **프로필 정보 수정**: 이름, 이메일 변경
- **계정 삭제**: 계정 완전 삭제

**확인 방법**:
1. 사이드바에서 "Settings" 클릭
2. "Profile" 카드 클릭
3. 이름, 이메일 수정 후 저장

---

### 13. Settings - Security (`/settings/security`)

**접근 방법**: Settings 페이지에서 "Security" 카드 클릭

**기능**:
- **비밀번호 변경**: 현재 비밀번호 확인 후 새 비밀번호 설정

**확인 방법**:
1. Settings → "Security" 클릭
2. 현재 비밀번호와 새 비밀번호 입력
3. "Change Password" 클릭

---

### 14. Settings - API Keys (`/settings/api-keys`)

**접근 방법**: Settings 페이지에서 "API Keys" 카드 클릭

**기능**:
- **API Key 생성**: AgentGuard API를 호출할 때 사용하는 키 생성
- **API Key 목록**: 생성된 모든 키 표시
- **사용 통계**: 각 키의 마지막 사용일, 사용 상태 (Active/Recent/Inactive)
- **프로젝트 링크**: 프로젝트 목록으로 이동하는 링크
- **API Key 삭제**: 더 이상 사용하지 않는 키 삭제

**확인 방법**:
1. Settings → "API Keys" 클릭
2. "Create API Key" 버튼 클릭
3. 키 이름 입력 (예: "Production API Key")
4. 생성된 키 복사 (한 번만 표시됨)
5. 키 목록에서 사용 상태 확인
6. "View Projects" 링크로 프로젝트 목록 이동

**사용 목적**:
- AgentGuard API를 직접 호출할 때 인증에 사용
- SDK 대신 REST API로 데이터 조회/생성 시 필요

---

### 15. Settings - Notifications (`/settings/notifications`)

**접근 방법**: Settings 페이지에서 "Notifications" 카드 클릭

**기능**:
- **알림 설정**: 이메일 및 인앱 알림 설정
- **알림 유형별 설정**: Drift 감지, 비용 이상, 품질 저하 등

**확인 방법**:
1. Settings → "Notifications" 클릭
2. 각 알림 유형별 토글 설정
3. 저장

---

### 16. Settings - Billing (`/settings/billing`)

**접근 방법**: Settings 페이지에서 "Billing" 카드 클릭

**기능**:
- **구독 플랜 확인**: 현재 플랜 (Free/Startup/Scale/Enterprise)
- **플랜 업그레이드**: 더 높은 플랜으로 업그레이드
- **결제 정보 관리**: 결제 수단, 청구서 내역

**확인 방법**:
1. Settings → "Billing" 클릭
2. 현재 플랜 확인
3. "Upgrade" 버튼으로 플랜 변경

---

### 17. Settings - Webhooks (`/settings/webhooks`)

**접근 방법**: Settings 페이지에서 "Webhooks" 카드 클릭

**기능**:
- **Webhook 생성**: 외부 시스템으로 이벤트 전송 설정
- **Webhook 목록**: 생성된 모든 웹훅 표시
- **Webhook 테스트**: 웹훅이 정상 작동하는지 테스트

**확인 방법**:
1. Settings → "Webhooks" 클릭
2. "Create Webhook" 클릭
3. URL, 이벤트 유형 설정
4. "Test" 버튼으로 테스트

---

### 18. Settings - Activity Log (`/settings/activity`)

**접근 방법**: Settings 페이지에서 "Activity Log" 카드 클릭

**기능**:
- **활동 기록**: 계정 전체의 모든 활동 기록
- **프로젝트 필터**: 특정 프로젝트의 활동만 보기
- **활동 유형 필터**: Project Created, Member Added 등
- **프로젝트 링크**: 각 활동에서 관련 프로젝트로 바로 이동

**확인 방법**:
1. Settings → "Activity Log" 클릭
2. Filters 버튼 클릭
3. Project 또는 Activity Type 선택
4. 활동 목록에서 프로젝트 링크 클릭하여 이동

**활동 유형**:
- Project Created/Updated/Deleted
- Member Added/Removed
- Settings Updated

---

### 19. 알림 센터 (상단 헤더)

**접근 방법**: 대시보드 상단 헤더의 벨 아이콘 클릭

**기능**:
- **알림 목록**: 모든 프로젝트의 알림 표시
- **읽음 처리**: 알림 클릭 시 읽음 처리
- **알림 삭제**: 불필요한 알림 삭제
- **읽지 않은 알림 수**: 벨 아이콘에 배지로 표시

**확인 방법**:
1. 대시보드 상단 헤더의 벨 아이콘 클릭
2. 알림 목록 확인
3. 알림 클릭하여 상세 정보 확인
4. "Mark as read" 또는 "Delete" 클릭

---

## 🔄 데이터 흐름 및 기능 연관성

### API Call → Quality → Drift → Alert 흐름

1. **API Call 생성** (`/dashboard/[projectId]/api-calls`)
   - SDK를 통해 LLM API 호출 시 자동으로 기록됨
   - 요청/응답 데이터가 데이터베이스에 저장됨

2. **Quality Score 생성** (자동)
   - API Call이 생성되면 자동으로 품질 평가 실행
   - Overview 탭의 Quality Chart에서 확인 가능
   - `/dashboard/[projectId]` → Quality Scores 차트

3. **Drift Detection** (자동 또는 수동)
   - 품질 점수나 응답 패턴 변화 감지
   - Overview 탭의 Drift Chart에서 확인 가능
   - `/dashboard/[projectId]` → Drift Detections 차트
   - 수동 실행: `/dashboard/[projectId]/drift` (구현 예정)

4. **Alert 생성** (자동)
   - Drift 감지 또는 비용 이상 시 자동으로 알림 생성
   - 알림 센터(벨 아이콘)에서 확인
   - `/dashboard/[projectId]/alerts/[alertId]` (구현 예정)

---

## 📊 주요 기능별 상세 설명

### 1. API 호출 모니터링

**목적**: LLM API 호출을 자동으로 캡처하고 분석

**확인 위치**:
- `/dashboard/[projectId]/api-calls`: 전체 호출 목록
- `/dashboard/[projectId]/api-calls/[callId]`: 개별 호출 상세

**데이터 포함**:
- Provider (OpenAI, Anthropic, Google)
- Model (gpt-4, claude-3 등)
- Request/Response 데이터
- Latency, Tokens, Status Code
- Agent Name, Chain ID

**사용 방법**:
1. SDK 설치 및 초기화
2. 일반적인 LLM API 호출 코드 작성
3. 자동으로 모든 호출이 기록됨

---

### 2. 품질 평가 (Quality Evaluation)

**목적**: LLM 응답의 품질을 자동으로 평가

**확인 위치**:
- `/dashboard/[projectId]`: Quality Scores 차트
- Overview 탭의 "Avg Quality Score" 카드

**평가 항목**:
- JSON 유효성
- 구조 일관성
- 의미 일관성
- 필수 필드 존재 여부

**확인 방법**:
1. Overview 탭에서 Quality Scores 차트 확인
2. 시간별 품질 점수 추이 확인
3. 평균 품질 점수 카드 확인

---

### 3. 드리프트 감지 (Drift Detection)

**목적**: LLM 출력의 변화를 감지하고 알림

**확인 위치**:
- `/dashboard/[projectId]`: Drift Detections 차트
- Overview 탭의 차트에서 빨간색 영역으로 표시

**감지 유형**:
- Length Drift: 응답 길이 변화
- Structure Drift: JSON 구조 변화
- Semantic Drift: 의미적 변화
- Tone Drift: 톤 변화

**확인 방법**:
1. Overview 탭에서 Drift Detections 차트 확인
2. 최근 감지 결과 목록 확인
3. 각 감지의 상세 정보 확인 (구현 예정)

---

### 4. 비용 분석 (Cost Analysis)

**목적**: LLM API 호출 비용을 추적하고 분석

**확인 위치**:
- `/dashboard/[projectId]`: "Total Cost" 카드
- Overview 탭에서 확인

**분석 항목**:
- 총 비용 (지난 7일/30일)
- 모델별 비용 분포
- Provider별 비용 분포
- 일별 비용 추이
- 비용 이상 감지

**확인 방법**:
1. Overview 탭에서 "Total Cost" 카드 확인
2. 비용 추이 차트 확인 (구현 예정)

---

### 5. 모델 비교 (Model Comparison)

**목적**: 여러 LLM 모델의 성능을 비교하고 최적 모델 추천

**확인 위치**:
- `/dashboard/[projectId]/compare`: Compare 탭

**비교 지표**:
- 평균 비용
- 평균 지연 시간
- 성공률
- 총 호출 수
- 추천 점수

**확인 방법**:
1. Compare 탭 클릭
2. Date Range 선택 (최소 7일)
3. 여러 모델의 성능 비교 결과 확인
4. 추천 점수가 높은 모델 확인

**주의사항**:
- Startup 플랜 이상 필요
- 여러 모델의 데이터 필요

---

### 6. 리포트 생성 (Reports)

**목적**: 프로젝트 데이터를 기반으로 리포트 생성 및 다운로드

**확인 위치**:
- `/dashboard/[projectId]/reports`: Reports 탭

**리포트 유형**:
- Standard Report: 기본 리포트
- Detailed Report: 상세 리포트
- Executive Summary: 요약 리포트

**확인 방법**:
1. Reports 탭 클릭
2. Template 선택
3. Date Range 선택
4. "Generate Report" 클릭
5. "Download Report" 클릭

---

### 7. 팀 협업 (Team Members)

**목적**: 프로젝트에 팀 멤버를 추가하고 권한 관리

**확인 위치**:
- `/dashboard/[projectId]?tab=members`: Team Members 탭

**기능**:
- 멤버 추가 (이메일)
- 권한 설정 (Owner/Admin/Member/Viewer)
- 멤버 활동 추적
- 초대 링크 생성

**확인 방법**:
1. Team Members 탭 클릭
2. "Add Member" 또는 "Generate Invite Link" 클릭
3. 멤버 카드 클릭하여 활동 및 권한 확인
4. 권한 변경: 드롭다운에서 선택

---

### 8. 알림 시스템 (Notifications)

**목적**: 중요한 이벤트 발생 시 알림 전송

**확인 위치**:
- 상단 헤더의 벨 아이콘: 알림 센터
- `/settings/notifications`: 알림 설정

**알림 유형**:
- Drift 감지
- 비용 이상
- 품질 저하
- 프로젝트 이벤트

**확인 방법**:
1. 헤더의 벨 아이콘 클릭
2. 알림 목록 확인
3. Settings → Notifications에서 알림 설정 변경

---

## 🛠️ SDK 사용 방법

### Python SDK

**설치**:
```bash
pip install agentguard
```

**사용**:
```python
import agentguard

# 한 줄로 초기화
agentguard.init(
    api_key="your-api-key",
    project_id=1
)

# 이제 모든 OpenAI 호출이 자동으로 모니터링됩니다
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(...)
```

**확인 방법**:
1. SDK 설치 및 초기화
2. 일반적인 LLM API 호출 코드 작성
3. `/dashboard/[projectId]/api-calls`에서 호출 기록 확인

### Node.js SDK

**설치**:
```bash
npm install agentguard
```

**사용**:
```javascript
import { init } from 'agentguard';

init({
  apiKey: 'your-api-key',
  projectId: 1
});

// 이제 모든 OpenAI 호출이 자동으로 모니터링됩니다
import OpenAI from 'openai';
const openai = new OpenAI();
const response = await openai.chat.completions.create(...);
```

---

## 📝 데이터 생성 방법

### 1. 실제 API 호출 (권장)

**방법**:
1. SDK 설치 및 초기화
2. 실제 LLM API 호출 코드 작성
3. 자동으로 모든 호출이 기록됨

**확인**: `/dashboard/[projectId]/api-calls`

### 2. 샘플 데이터 생성

**방법**:
1. 프로젝트 생성 시 "Generate Sample Data" 옵션 선택
2. 또는 Admin API를 통해 샘플 데이터 생성

**확인**: 
- `/dashboard/[projectId]`: Overview에서 통계 확인
- `/dashboard/[projectId]/api-calls`: 샘플 API 호출 확인

---

## 🔐 권한 및 접근 제어

### 프로젝트 권한

- **Owner**: 모든 권한 (프로젝트 삭제 포함)
- **Admin**: 설정 및 멤버 관리 (프로젝트 삭제 제외)
- **Member**: 데이터 조회 및 API 호출 가능
- **Viewer**: 읽기 전용

### 기능별 접근 권한

- **Settings 탭**: Owner/Admin만 접근
- **Team Members 관리**: Owner/Admin만 가능
- **프로젝트 삭제**: Owner만 가능
- **데이터 조회**: 모든 멤버 가능

---

## 🎨 UI/UX 특징

### 디자인 스타일
- **배경**: Deep Navy (`#000314`)
- **카드**: Glassmorphism (반투명, 블러 효과)
- **강조 색상**: Purple, Cyan, Red (Glow 효과)
- **폰트**: Inter (본문), JetBrains Mono (숫자)

### 주요 컴포넌트
- **StatsCard**: 통계 카드 (Glow 효과)
- **DateRangePicker**: 날짜 범위 선택 (왼쪽 프리셋, 오른쪽 캘린더)
- **ProjectTabs**: 프로젝트 탭 네비게이션 (항상 표시)
- **EmptyState**: 빈 상태 가이드

---

## 📌 빠른 참조

### 가장 중요한 페이지
1. **프로젝트 목록**: `/dashboard` - 모든 프로젝트 관리
2. **프로젝트 Overview**: `/dashboard/[projectId]` - 핵심 통계 및 차트
3. **API Calls**: `/dashboard/[projectId]/api-calls` - 모든 호출 기록
4. **Settings**: `/settings` - 계정 설정

### 가장 중요한 기능
1. **API 호출 모니터링**: SDK 설치 후 자동 작동
2. **품질 평가**: Overview의 Quality Chart에서 확인
3. **드리프트 감지**: Overview의 Drift Chart에서 확인
4. **비용 분석**: Overview의 Total Cost 카드에서 확인

---

## 🚀 시작하기

1. **회원가입**: `/login?mode=signup`
2. **프로젝트 생성**: `/dashboard` → "Create Project"
3. **SDK 설치**: `/onboarding` 가이드 따라하기
4. **API 호출**: SDK 초기화 후 일반적인 LLM 호출 코드 작성
5. **데이터 확인**: `/dashboard/[projectId]`에서 통계 및 차트 확인

---

이 가이드를 통해 AgentGuard의 모든 기능을 확인하고 활용할 수 있습니다! 🎉
