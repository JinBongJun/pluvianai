# 🏗️ AgentGuard 상세 설계 문서

> **Updated: 2026-01-27** (Reddit 시장 조사 기반 방향 재정립)
> 
> **핵심 포지셔닝**: "운영 중인 LLM/Agent가 망가지지 않았는지 자동으로 잡아주는 회귀/퇴화 감지 서비스"

---

## 🎯 핵심 방향 요약 (2026.01 업데이트)

### 포지셔닝
- ❌ "LLM 평가 도구" / "에이전트 테스트 프레임워크"
- ✅ **"LLM 배포 안전성 감지 서비스"**

### 핵심 기능
1. **Shadow Replay** - 프로덕션 트래픽을 새 모델로 재실행
2. **"최악 프롬프트 세트" 자동 수집** - 실패/의심 케이스 자동 관리
3. **Signal 기반 감지** - LLM-as-Judge ❌, Rule + Signal ✅
4. **상태 판정** - 점수(0-100) ❌, 상태(SAFE/REGRESSED/CRITICAL) ✅
5. **Human-in-the-loop** - 자동 감지 + 사람 최종 결정
6. **커스텀 Signal** - 도메인 특화 체크 추가

### 기술적 방향
- LLM-as-Judge ❌ (자기 만족 문제, entropy multiplying)
- Signal 기반 ✅ (hallucination, length, refusal, JSON break, latency)

> 상세 내용: [BLUEPRINT.md](./BLUEPRINT.md) 참조

---

## 🔄 구현 현황 (2026.01 방향 재정립)

### ✅ 유지 (새 방향과 맞음)

| 구분 | 항목 | 활용 방법 |
|------|------|-----------|
| Service | `replay_service.py` | **Shadow Replay 핵심** |
| Service | `snapshot_service.py` | 트래픽 캡처/저장 |
| Service | `alert_service.py` | 상태 변경 알림 |
| Service | `drift_engine.py` | Drift 모니터링 |
| Service | `firewall_service.py` | Signal 감지 일부 |
| Service | `pii_sanitizer.py` | 보안 유지 |
| Service | `slack_service.py`, `discord_service.py` | 알림 채널 |
| Endpoint | `replay.py`, `alerts.py`, `drift.py` | 핵심 기능 |
| Endpoint | `proxy.py` | 트래픽 캡처 |
| Frontend | `/replay`, `/alerts`, `/drift`, `/api-calls` | 핵심 UI |

### ⚠️ 수정 필요

| 현재 | 변경 방향 |
|------|-----------|
| `judge_service.py` | → `signal_detection_service.py` (Signal 기반) |
| `quality_evaluator.py` | → 상태 기반 (점수 ❌) |
| `golden_case_service.py` | → "최악 프롬프트 세트" 자동 수집 |
| `quality.py` endpoint | → 상태 판정 API |
| `/quality` 페이지 | → 상태 기반 UI |

### ❌ 삭제/단순화 (MVP 제외)

| 항목 | 이유 |
|------|------|
| `benchmark_service.py`, `public_benchmark_service.py` | MVP 제외 (리서치용) |
| `cost_analyzer.py`, `cost_optimizer.py` | MVP 제외 (나중에) |
| `judge_reliability_service.py` | LLM Judge 제거됨 |
| `rule_market_service.py` | Phase 3로 미룸 |
| `/benchmarks/*`, `/cost`, `/rule-market/*` | MVP 제외 |

### 🆕 추가 필요

| 항목 | 용도 |
|------|------|
| `signal_detection_service.py` | Signal 기반 감지 (hallucination, length, refusal, JSON, latency) |
| `worst_prompt_service.py` | 최악 프롬프트 자동 수집/관리 |
| `review_service.py` | Human-in-the-loop 리뷰 |
| `regression_service.py` | 회귀 상태 판정 (SAFE/REGRESSED/CRITICAL) |
| `/signals`, `/worst-prompts`, `/reviews`, `/regression` | 신규 엔드포인트 |
| 신규 프론트엔드 페이지 | Signal 관리, 최악 세트, 리뷰 대기열, 회귀 대시보드 |

---

## 📋 목차

1. [비전 & 페르소나](#1-비전--페르소나)
   - [1.1 타겟 페르소나](#11-타겟-페르소나)
   - [1.2 ICP (Ideal Customer Profile)](#12-icp-ideal-customer-profile)
   - [1.3 핵심 가치 제안](#13-핵심-가치-제안)
2. [아키텍처 원칙](#2-아키텍처-원칙)
3. [계층 구조 설계](#3-계층-구조-설계)
4. [핵심 기능 정의](#4-핵심-기능-정의)
   - [4.1 Shadow Replay](#41-shadow-replay)
   - [4.2 최악 프롬프트 세트](#42-최악-프롬프트-세트)
   - [4.3 Signal 기반 감지](#43-signal-기반-감지)
   - [4.4 Human-in-the-loop](#44-human-in-the-loop)
5. [보안 체크리스트](#5-보안-체크리스트)
6. [운영 필수 요소](#6-운영-필수-요소)
7. [데이터베이스 설계](#7-데이터베이스-설계)
8. [API 설계](#8-api-설계)
9. [프론트엔드 설계](#9-프론트엔드-설계)
10. [구현 현황](#10-구현-현황)
11. [수익 모델 및 구독 플랜](#11-수익-모델-및-구독-플랜)

---

## 1. 비전 & 페르소나

### 1.1 타겟 페르소나

**"운영 중인 LLM 제품을 가진 팀"**

- **역할**: 프로덕트/플랫폼 팀, AI Product Engineer
- **페인 포인트**: 
  - "모델 바꿀 때마다 불안함"
  - "기존 도구(LangSmith 등) 복잡해서 안 씀"
  - "직접 테스트 스크립트 만들거나 그냥 배포"
- **행동 패턴**: "Vibe-testing" / "Rolling the dice" → "빠른 안전성 검증"
- **운영 환경**: SaaS, 사내 Agent, 고객 대응 챗봇, 자동 리포트

**❌ 타겟 아님:**
- 연구용
- 벤치마크 집착
- 모델 비교 놀이

### 1.2 ICP (Ideal Customer Profile)

> **참고**: ICP는 설정하고 잊어버리는 작업이 아닙니다. 시장이 끊임없이 진화하므로 지속적으로 정제하고 재정의해야 합니다.

#### 초기 ICP (Free → Pro 전환) - 버전 0.1

**회사 속성**:
- **규모**: 1-10명 (개인 개발자/소규모 스타트업)
- **수익**: $0-$1M (프리랜서/사이드 프로젝트/초기 스타트업)
- **지역**: 북미, 유럽, 아시아 (영어권 우선)
- **산업**: 소프트웨어, AI/ML, SaaS
- **비즈니스 모델**: B2B SaaS, B2C 제품 (AI 에이전트 포함)

**속성/트리거**:
- AI 에이전트를 제품에 통합 중 또는 계획 중
- 모델/프롬프트를 정기적으로 업데이트 (월 1회 이상)
- 테스트 방법이 불명확 ("Vibe-testing" 단계)
- CI/CD 파이프라인 사용 중 또는 도입 계획
- 프로덕션 환경에서 AI 에이전트 운영 중

**도구**:
- **현재 사용**: LangSmith, Weights & Biases, 또는 없음
- **전환 가능**: 모니터링 도구 경험 있음 (Datadog, Sentry 등)
- **기술 스택**: Python, TypeScript, FastAPI, Next.js 등

**사용 사례 (JTBD - Jobs To Be Done)**:
- 새 모델 배포 전 안전성 검증
- 프롬프트 변경 후 성능 확인
- 프로덕션에서 문제 발생 시 원인 파악
- 성능 병목 찾기

**목표 (달성하려는 결과)**:
- "Silent Regressions" 방지
- "Vibe-testing" → "Scientific reliability" 전환
- 배포 실패율 감소 (목표: 80% 감소)
- 개발 시간 절약 (테스트 케이스 작성 불필요)
- 프로덕션 안전성 확보

**구매자 페르소나**:
- **역할**: CTO, Engineering Lead, AI Product Engineer
- **특성**: 제품/기술 스택 결정 권한, AI 도입 책임자
- **결정 기준**: 개발 효율성, 프로덕션 안전성, 비용

**챔피언 (Champion)**:
- **역할**: AI Product Engineer, ML Engineer, Full-stack Engineer
- **특성**: 
  - 제품에 AI 통합 담당
  - 테스트 방법 고민 중
  - "Vibe-testing"의 한계 인식
  - CI/CD 경험 있음
- **영향력**: 팀 내 기술적 의사결정 영향

**사용량**:
- 월 500개 이하의 snapshot 생성 (비용 관리)
- Judge 호출: 월 100회 이하

---

#### 성장 ICP (Pro 플랜) - 버전 0.1

**회사 속성**:
- **규모**: 5-50명 (성장하는 스타트업/중소기업)
- **수익**: $1M-$50M
- **지역**: 북미, 유럽 (주요 시장)
- **산업**: 소프트웨어, AI/ML, SaaS, FinTech, HealthTech
- **비즈니스 모델**: B2B SaaS (AI 에이전트가 핵심 제품)

**속성/트리거**:
- AI 제품을 만드는 팀 (전담 팀 존재)
- 정기적인 모델/프롬프트 업데이트 (주 1회 이상)
- 프로덕션 환경에서 대량의 AI 트래픽 처리
- CI/CD 파이프라인 구축 완료
- 팀 협업 필요 (5명 이상)

**도구**:
- **현재 사용**: LangSmith (무료 티어), 또는 자체 구축
- **전환 가능**: 더 나은 자동화 도구 필요
- **기술 스택**: Python, TypeScript, Kubernetes, Docker

**사용 사례**:
- CI/CD 통합 자동 검증
- 팀 내 모델 성능 공유 및 비교
- 프로덕션 모니터링 및 알림
- 성능 병목 자동 감지

**목표**:
- 배포 자동화 (CI/CD 통합)
- 팀 협업 효율화
- 프로덕션 안전성 확보
- 비용 최적화

**구매자 페르소나**:
- **역할**: CTO, VP Engineering, Engineering Manager
- **특성**: 팀 전체 기술 스택 결정, 예산 책임
- **결정 기준**: 팀 생산성, 안정성, ROI

**챔피언**:
- **역할**: AI Product Engineer, ML Engineer (팀 리더)
- **특성**: 팀 내 기술적 영향력, 도구 도입 추진

**사용량**:
- 월 10,000개 이상의 snapshot 생성
- Judge 호출: 월 100,000회까지 포함 (소프트 캡)
- 초과 시: $0.001/회 또는 알림 후 제한
- Fair Use Policy 적용

---

#### 확장 ICP (Enterprise) - 버전 0.1

**회사 속성**:
- **규모**: 50명 이상 (Enterprise 기업)
- **수익**: $50M 이상
- **지역**: 글로벌
- **산업**: 모든 산업 (AI 도입 기업)
- **비즈니스 모델**: Enterprise AI 도입

**속성/트리거**:
- Enterprise AI 도입 기업
- 다중 프로젝트/조직 관리 필요
- 규정 준수 요구사항 (GDPR, SOC2 등)
- SLA 요구사항

**사용 사례**:
- 조직 전체 AI 에이전트 관리
- 규정 준수 및 감사
- 엔터프라이즈 통합 (SSO, RBAC 등)

**목표**:
- 조직 전체 AI 안전성 확보
- 규정 준수
- 운영 효율화

**구매자 페르소나**:
- **역할**: CTO, CIO, VP Engineering
- **특성**: 조직 전체 기술 스택 결정, 대규모 예산 책임

**사용량**:
- 무제한 snapshot
- Judge 호출: 충분히 넉넉한 소프트 캡 (월 1,000,000회)
- 정상적인 사용 범위 내에서 무제한
- 비정상적인 사용 패턴 감지 시 제한
- SLA (99.9%)

---

### 1.2.1 ICP 점수 모델

> **중요**: ICP를 이진적으로가 아니라 스케일로 처리합니다. 데이터가 부족하거나 비즈니스의 특정 특성으로 인해 속성이 부족한 경우 잠재적인 기회를 놓칠 수 있기 때문입니다.

**ICP 적합도 점수 (0-100점)**

| 속성 | 점수 | 설명 |
|------|------|------|
| 규모 (1-10명) | +20점 | 이상적 규모 |
| AI 제품 개발 중 | +20점 | 핵심 속성 |
| 테스트 방법 불명확 | +15점 | 핵심 페인 포인트 |
| CI/CD 사용 중 | +15점 | 자동화 준비됨 |
| 모니터링 도구 경험 | +10점 | 도구 사용 경험 |
| 정기적 모델 업데이트 | +10점 | 지속적 사용 |
| 북미/유럽 지역 | +10점 | 주요 시장 |

**ICP 적합도 등급**:
- **80-100점**: 이상적 고객 (우선 타겟) ⭐⭐⭐
- **60-79점**: 좋은 고객 (타겟) ⭐⭐
- **40-59점**: 가능한 고객 (저우선순위) ⭐
- **0-39점**: 부적합 고객 (타겟 아님)

---

### 1.2.2 ICP 검증 전략

#### 정량적 분석 (제품-시장 적합성 달성 후)
- **MVP 버전**: 12개월 이상 유지, 평균보다 많은 수익, 최근 30일 활동 고객 세그먼트
- **완전한 분석**: 코호트 전환율, 유지율, 수익, 사용량, 승/패 분석
- **데이터 보강**: Clearbit/Zoominfo/Clay로 CRM 데이터 보강

#### 정성적 분석 (즉시 시작 가능)
- **사용자 인터뷰**: "더 이상 사용할 수 없게 되면 실망할 사람은?", "주요 사용 사례는?"
- **패널 연구**: 시장 인식, 구매/지불 의사
- **리뷰 사이트**: 감정, 고통점, 가치 분석

#### 시장 분석
- **시장 보고서**: AI 에이전트 시장 방향성
- **Google 트렌드**: "AI testing", "LLM evaluation" 키워드 트렌드
- **경쟁 분석**: ICP 타겟, 차별화 요소
- **소셜 미디어 분석**: 시장 감정

---

### 1.2.3 ICP 진화 전략

> **핵심 원칙**: "제품-시장 적합성은 시장이 끊임없이 진화하고 있기 때문에 이동하는 목표입니다."

**ICP 버전 관리**:

| 버전 | 시기 | 내용 |
|------|------|------|
| **0.1** | 현재 | 가정 기반 ICP (정성적 분석) |
| **1.0** | 6개월 후 | 정량적 데이터 기반 ICP |
| **2.0** | 1년 후 | 시장 분석 반영 ICP |

**지속적 개선**:
- **분기별 ICP 검토**: 새로운 통찰 반영
- **시장 변화 대응**: 트렌드 변화에 맞춰 ICP 재정의
- **고객 피드백 반영**: 실제 고객 데이터로 ICP 검증

**혁신 확산 이론 적용**:
- 제품이 주기의 어느 단계에 있는지 이해
- 주기의 각 단계에서 ICP 변경 가능
- Early Adopters → Early Majority → Late Majority

---

### 1.2.4 ICP 집중 전략 (PostHog 사례 참고)

> **핵심**: ICP를 발견한 후, 그들만을 위해 전력을 다합니다.

#### 제품 개발
- **AI Product Engineer를 위해 제품 개발**
- Zero-Friction (Base URL만 변경)
- 개발자 친화적 UI (코드 스니펫, 다크 모드, SQL 쿼리 등)
- 분석 도구가 아닌 개발 도구처럼 느껴지는 UI

#### 마케팅
- **엔지니어와 창업자를 위한 고품질 콘텐츠**
- 기술 블로그, 튜토리얼
- 코드 스니펫과 밈으로 가득한 비전통적 웹사이트
- 광고 쿠키 및 리타겟팅 캠페인 실행하지 않음

#### 판매
- **제품 주도 (Product-Led Growth)**
- 아웃바운드 판매 없음
- 투명한 사용량 기반 가격
- 기능 판매, 혜택 판매

#### 고객 서비스
- **빠른 피드백 반영**
- 고객의 말을 경청
- 문제 해결에 집중
- 주말/휴일도 없이 일하며 고객 의견 반영

---

### 1.2.5 제1원칙 사고법: 근본적인 문제 정의

#### 표면적 문제
- "Silent Regressions" 감지 어려움
- 테스트 방법 불명확

#### 근본적인 문제 (제1원칙 사고법)
1. **AI 에이전트는 비결정적(Non-deterministic)**
   - 전통적인 테스트 방법(Unit Test)으로는 불가능
   - 같은 입력에 대해 다른 출력 가능

2. **"Vibe-testing"은 주관적이고 비과학적**
   - 객관적 기준 없음
   - 팀 간 일관성 없음

3. **프로덕션 트래픽을 테스트로 재사용할 방법이 없음**
   - 테스트 케이스 작성에 시간 소요
   - 실제 사용 패턴과 다를 수 있음

4. **의미론적 평가가 어려움**
   - 정확도만으로는 부족
   - "이 답변이 좋은가?"를 판단하기 어려움

#### 해결책 (근본 원칙에서 도출)
1. **프로덕션 트래픽 자동 캡처** (Zero-Friction)
   - Base URL만 변경
   - 테스트 케이스 작성 불필요

2. **의미론적 평가** (LLM-as-a-Judge)
   - AI가 "이 답변이 좋은가?" 판단
   - 객관적 기준 제공

3. **One-Click 결과 제공**
   - 복잡한 기능을 단순한 결과로
   - 개발 시간 절약

---

### 1.2.6 ICP 활용 방법

**팀 일치시키기**:
- ICP를 사용하여 핵심 청중에 노력을 집중
- 목표 마케팅 캠페인 만들기
- 제품 개발에 정보 제공
- 판매 경험과 고객 서비스 향상

**주의사항**:
- ICP는 다른 모든 사람들에게 열등한 경험을 제공하거나 이탈 고객의 피드백을 무시하기 위한 핑계로 사용해서는 안 됩니다.
- ICP에 대한 집중과 전체 시장 역학 및 회사 목표 사이의 균형을 지속적으로 유지해야 합니다.

### 1.3 핵심 가치 제안 (결과 중심 접근)

> **전략**: 기능 중심이 아닌 **"사용자가 원하는 결과"** 중심으로 접근

#### 핵심 결과 (One-Click)

1. **새 모델 안전성 검증**
   - 클릭 한 번으로 "✅ 안전합니다" 또는 "❌ 위험합니다" 결과 제공
   - 프로덕션 트래픽 자동 재사용 (Zero-Friction)
   - AI가 의미론적으로 평가 (LLM-as-a-Judge)

2. **문제 발생 지점 찾기**
   - 클릭 한 번으로 설계도 표시 (Railway 스타일)
   - 문제가 발생한 노드를 붉게 표시
   - Auto-Mapping + Judge 조합

3. **의존성 파악하기**
   - 클릭 한 번으로 설계도 표시
   - 에이전트 간 의존성 그래프 시각화
   - Auto-Mapping + Snapshot 조합

4. **성능 병목 찾기**
   - 클릭 한 번으로 설계도 표시
   - 느린 노드를 붉게 표시
   - Auto-Mapping + 레이턴시 분석 조합

#### 기술적 차별화

- **Zero-Friction**: Base URL만 변경하면 즉시 사용 가능
- **AI-Native**: LLM-as-a-Judge로 의미론적 평가
- **프로덕션 트래픽 재사용**: 테스트 케이스 작성 불필요
- **Switzerland Strategy**: 모든 LLM 프로바이더 중립 지원

---

### 1.3.1 기술적 Moat (참구) - "왜 너희인가?"

> **핵심 질문**: "만약 LangChain 팀이 LangSmith에 'Regression Test' 버튼을 하나 추가하는 순간, AgentGuard의 설 자리는 어디인가요?"

#### 1. 프로덕션 트래픽 재사용의 네트워크 효과

**기능**:
- 사용자가 많을수록 더 많은 Golden Case 생성
- 더 많은 Golden Case = 더 정확한 검증

**Moat (참구)**:
- LangChain이 따라하기 어려운 데이터 네트워크 효과
- 사용자가 많을수록 가치 증가 (네트워크 효과)
- 프로덕션 트래픽 데이터의 축적은 시간이 걸림

#### 2. 실시간 방화벽의 기술적 장벽

**기능**:
- 스트리밍 병렬 검사 기술
- 0.1초 내외 레이턴시 달성 (목표)

**Moat (참구)**:
- LangChain이 쉽게 따라하기 어려운 기술적 복잡도
- 실시간 차단의 기술적 장벽
- 성능 최적화는 오랜 시간이 걸림

#### 3. 에이전트 전용 관제탑 선점

**기능**:
- 개발자의 워크플로우를 독점

**Moat (참구)**:
- LangSmith는 "관찰(Observability)" 모델
- AgentGuard는 "제어 및 회귀 검증(Control & Regression)" 모델
- 개발자의 워크플로우에 필수 요소로 만듦
- 선점 효과: 먼저 들어온 도구가 워크플로우에 고착됨

#### 4. Switzerland Strategy의 네트워크 효과

**기능**:
- 모든 LLM 프로바이더 중립 지원 (OpenAI, Anthropic, Google 등)

**Moat (참구)**:
- 프로바이더 간 비교 분석 가능
- 프로바이더 종속성 제거
- 프로바이더가 바뀌어도 AgentGuard는 유지

---

## 2. 아키텍처 원칙

### 2.1 안티패턴 방지 (이미지 참고)

#### ❌ 금지 사항

1. **컨트롤러가 리포지토리를 직접 사용**
   - 문제: 책임 분리 붕괴, 비즈니스 로직이 컨트롤러에 흩어짐
   - 해결: 컨트롤러 → 서비스 → 리포지토리 계층 분리

2. **서비스가 RequestDTO를 사용**
   - 문제: 도메인 독립성 깨짐, HTTP 인터페이스에 종속
   - 해결: 서비스는 도메인 모델만 사용, DTO는 컨트롤러에서만 사용

#### ✅ 올바른 구조

```
Controller (HTTP Layer)
  ↓ (RequestDTO → Domain Model 변환)
Service (Business Logic Layer)
  ↓ (Domain Model 사용)
Repository (Data Access Layer)
  ↓ (Domain Model 반환)
Database
```

### 2.2 OCP (Open-Closed Principle) 준수

- **확장에는 열림**: 새 Repository/Service 추가 시 기존 코드 수정 불필요
- **수정에는 닫힘**: BaseRepository/BaseService 인터페이스는 변경 없이 유지
- **Strategy 패턴**: DB 구현체(SQLAlchemy → Supabase) 교체 가능

### 2.3 Clean Architecture 계층

```
┌─────────────────────────────────────┐
│   Presentation Layer (API/Web)      │  ← FastAPI Controllers
├─────────────────────────────────────┤
│   Application Layer (Use Cases)     │  ← Services
├─────────────────────────────────────┤
│   Domain Layer (Business Logic)     │  ← Domain Models
├─────────────────────────────────────┤
│   Infrastructure Layer (External)   │  ← Repositories, DB, Redis
└─────────────────────────────────────┘
```

---

## 3. 계층 구조 설계

### 3.1 Controller Layer (HTTP 요청/응답 처리)

**책임**:
- HTTP 요청/응답 처리
- RequestDTO → Domain Model 변환
- ResponseDTO ← Domain Model 변환
- 인증/인가 체크 (의존성 주입)
- 에러 핸들링 (HTTP 상태 코드)

**금지 사항**:
- ❌ 리포지토리 직접 사용
- ❌ 비즈니스 로직 포함
- ❌ 데이터베이스 쿼리 직접 실행

**예시 구조**:
```python
# backend/app/api/v1/endpoints/projects.py

@router.post("", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,  # RequestDTO
    current_user: User = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service)
):
    # RequestDTO → Domain Model 변환
    project = project_service.create_project(
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id
    )
    # Domain Model → ResponseDTO 변환 (자동)
    return project
```

### 3.2 Service Layer (비즈니스 로직)

**책임**:
- 비즈니스 로직 구현
- 트랜잭션 경계 관리
- 도메인 모델 조작
- 여러 리포지토리 조합

**금지 사항**:
- ❌ RequestDTO/ResponseDTO 사용
- ❌ HTTP 관련 코드 (Request, Response 객체)
- ❌ 직접적인 DB 쿼리 (리포지토리 사용)

**예시 구조**:
```python
# backend/app/services/project_service.py

class ProjectService:
    def __init__(
        self,
        project_repo: ProjectRepository,
        user_repo: UserRepository,
        db: Session
    ):
        self.project_repo = project_repo
        self.user_repo = user_repo
        self.db = db
    
    def create_project(
        self,
        name: str,  # 도메인 모델 파라미터
        description: str | None,
        owner_id: int
    ) -> Project:  # 도메인 모델 반환
        # 비즈니스 로직
        if self.project_repo.exists_by_name(name, owner_id):
            raise EntityAlreadyExistsError("Project name already exists")
        
        project = Project(
            name=name,
            description=description,
            owner_id=owner_id
        )
        return self.project_repo.save(project)
```

### 3.3 Repository Layer (데이터 접근)

**책임**:
- 데이터베이스 CRUD 작업
- 쿼리 최적화
- 도메인 모델 반환

**금지 사항**:
- ❌ 비즈니스 로직 포함
- ❌ 트랜잭션 관리 (서비스에서 처리)

**예시 구조**:
```python
# backend/app/infrastructure/repositories/project_repository.py

class ProjectRepository(SQLAlchemyRepository[Project]):
    def find_by_name_and_owner(
        self,
        name: str,
        owner_id: int
    ) -> Optional[Project]:
        return self.db.query(Project).filter(
            Project.name == name,
            Project.owner_id == owner_id,
            Project.is_active.is_(True)
        ).first()
    
    def exists_by_name(
        self,
        name: str,
        owner_id: int
    ) -> bool:
        return self.db.query(
            exists().where(
                and_(
                    Project.name == name,
                    Project.owner_id == owner_id,
                    Project.is_active.is_(True)
                )
            )
        ).scalar()
```

### 3.4 Domain Model Layer

**책임**:
- 비즈니스 엔티티 정의
- 도메인 규칙 캡슐화
- 데이터베이스 스키마 정의

**예시 구조**:
```python
# backend/app/models/project.py

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 도메인 로직
    def deactivate(self):
        """프로젝트 비활성화"""
        self.is_active = False
    
    def is_owned_by(self, user_id: int) -> bool:
        """소유자 확인"""
        return self.owner_id == user_id
```

---

## 4. 핵심 기능 정의 (결과 중심 접근)

> **전략**: 기능 중심이 아닌 **"사용자가 원하는 결과"** 중심으로 접근  
> **목표**: 클릭 한 번으로 명확한 결과 제공

---

### 🎯 4.1 핵심 결과 (One-Click Results)

사용자가 원하는 결과를 클릭 한 번으로 제공합니다.

#### 결과 1: "새 모델 안전성 검증"

**사용자가 원하는 것**: "이 모델을 배포해도 안전한가?"

**기능 조합**:
1. Proxy → 프로덕션 트래픽 자동 캡처 (Zero-Friction)
2. Snapshot → 최근 100개 저장
3. Replay → 새 모델로 재실행
4. Judge → 의미론적 평가

**사용자 경험**:
```
[새 모델 테스트] 버튼 클릭
  ↓
"최근 100개 트래픽으로 테스트 중..."
  ↓
"✅ 안전합니다 (평균 점수 4.5/5.0)"
또는
"❌ 위험합니다 (평균 점수 3.2/5.0, 15% 하락)"
```

**Free vs Pro**:
- **Free**: 수동 실행, 결과 요약만 (점수만)
- **Pro**: 자동 실행 (CI/CD 통합), 상세 분석 (어떤 케이스가 실패했는지), 자동 알림

---

#### 결과 2: "문제 발생 지점 찾기"

**사용자가 원하는 것**: "어디서 문제가 발생했는가?"

**기능 조합**:
1. Auto-Mapping → 에이전트 구조 시각화 (Railway 스타일)
2. Judge → 각 노드의 성능 점수
3. 결과 → 문제가 발생한 노드를 붉게 표시

**사용자 경험**:
```
[문제 분석] 버튼 클릭
  ↓
설계도 표시 (Railway 스타일):
- Agent A: ✅ 4.5점 (정상)
- Agent B: ❌ 2.1점 (문제 발생) ← 붉게 표시
- Agent C: ✅ 4.2점 (정상)

"Agent B에서 문제가 발생했습니다"
```

**Free vs Pro**:
- **Free**: 수동 실행, 텍스트만 (설계도 없음)
- **Pro**: 자동 실행 (문제 발생 시), 설계도 시각화, 자동 알림

---

#### 결과 3: "의존성 파악하기"

**사용자가 원하는 것**: "이 에이전트가 어떤 에이전트에 의존하는가?"

**기능 조합**:
1. Auto-Mapping → 에이전트 구조 시각화
2. Snapshot → 실제 호출 관계
3. 결과 → 의존성 그래프

**사용자 경험**:
```
[의존성 보기] 버튼 클릭
  ↓
설계도 표시:
Agent A → Agent B → Agent C
  ↓
"Agent C는 Agent A, B에 의존합니다"
"Agent B를 수정하면 Agent C에 영향이 갑니다"
```

**Free vs Pro**:
- **Free**: 수동 실행, 텍스트만 (설계도 없음)
- **Pro**: 자동 업데이트 (트래픽 변경 시), 설계도 시각화

---

#### 결과 4: "성능 병목 찾기"

**사용자가 원하는 것**: "어느 에이전트가 느린가?"

**기능 조합**:
1. Auto-Mapping → 에이전트 구조 시각화
2. Snapshot → 각 노드의 레이턴시
3. 결과 → 느린 노드를 붉게 표시

**사용자 경험**:
```
[성능 분석] 버튼 클릭
  ↓
설계도 표시:
- Agent A: 100ms (정상)
- Agent B: 2.5s (병목) ← 붉게 표시
- Agent C: 150ms (정상)

"Agent B가 병목입니다"
```

**Free vs Pro**:
- **Free**: 수동 실행, 텍스트만 (설계도 없음)
- **Pro**: 자동 실행 (병목 발생 시), 설계도 시각화, 자동 알림

---

### 🔧 4.2 인프라 기능 (결과를 위한 기반)

#### 1. Proxy (Zero-Friction Interception)
- **목적**: Base URL만 변경하여 모든 LLM 요청 캡처
- **구현**: FastAPI Proxy 엔드포인트 + 비동기 Snapshot 생성
- **우선순위**: P0

**에러 투명성 (Error Namespace)**:
- **문제**: 원본 LLM 에러와 AgentGuard 프록시 에러 구분 불가
- **해결책**: 응답 헤더 추가
  - `X-AgentGuard-Origin: Proxy` - AgentGuard 프록시 에러
  - `X-AgentGuard-Origin: Upstream` - 원본 LLM (OpenAI 등) 에러
  - `X-AgentGuard-Origin: Network` - 네트워크 에러
- **효과**: CS 대응 시간 단축, 사용자 혼란 감소, 에러 원인 명확한 구분
- **우선순위**: P0 (즉시 필요)

#### 2. Snapshot/Replay
- **목적**: 프로덕션 트래픽을 재실행하여 테스트
- **구현**: Snapshot 저장 → Replay 실행 → 결과 비교
- **우선순위**: P0

#### 3. LLM-as-a-Judge
- **목적**: 의미론적 평가로 Regression 감지
- **구현**: Evaluation Rubrics + GPT-4o-mini Judge
- **우선순위**: P0

**Judge 신뢰도 강화**:
- **문제**: "너희 AI Judge 점수를 어떻게 믿어?"
- **해결책**:
  1. **Alignment Score**: AI가 매긴 점수와 사람이 생각하는 점수의 일치도 측정 (0-100점)
  2. **Feedback Loop**: 사용자가 AI의 오판을 수정하고 학습시키는 UI
  3. **메타 검증**: Judge의 판단을 다른 Judge로 검증, 일관성 체크
- **목표**: "AI가 AI를 채점한다"는 불신을 깨는 장치
- **우선순위**: P1 (Phase 4)

**Sandboxed Judge Prompt (Prompt Injection 방어)**:
- **문제**: "유저의 Snapshot 데이터가 AI Judge의 시스템 프롬프트를 오염(Prompt Injection)시킬 수 있습니다."
- **해결책**:
  1. **XML 태깅을 통한 입력값 격리**: 사용자 데이터를 `<user_input>...</user_input>` 태그로 감싸서 시스템 프롬프트와 분리
  2. **Zero-Log API Key 정책**: Judge 호출 시 API Key는 로그에 기록하지 않음
  3. **프롬프트 구조**:
```
<system>
당신은 AI 응답 품질을 평가하는 Judge입니다.
평가 기준: {criteria}
</system>

<user_input>
{snapshot_data}  <!-- 격리된 사용자 데이터 -->
</user_input>

<instruction>
위 user_input을 평가 기준에 따라 점수를 매기세요.
</instruction>
```
- **효과**: Prompt Injection 공격 방어, 시스템 프롬프트 오염 방지
- **우선순위**: P0 (즉시 필요)

#### 4. Auto-Mapping (동적 분석)
- **목적**: 에이전트 구조 시각화 (Railway 스타일)
- **구현**: Proxy 트래픽 기반 호출 계보(Graph) 시각화
- **우선순위**: P1 (Phase 4)

**복잡도 관리 (Complexity Management)**:
- **문제**: "에이전트가 20~30개가 넘어가면 화면은 복잡한 선으로 가득 찬 '스파게티'가 됩니다."
- **해결책**:
  1. **Sub-graph 기능**: 에이전트를 그룹화, 관련 에이전트만 표시
  2. **Focus Mode**: 특정 트래픽 경로만 하이라이트, 문제 발생 지점 중심으로 확대
  3. **필터링 및 검색**: 에이전트 이름 검색, 성능 기준 필터링, 문제가 있는 에이전트만 표시
- **목표**: "보기에만 예쁜 지도"가 아니라 "진짜 문제를 해결해주는 지도"

#### 5. PII Sanitizer (보안 마스킹)
- **목적**: 저장되는 로그에서 개인정보나 비밀번호가 유출되지 않도록 실시간 처리
- **구현**: 2단계 처리 (Regex → Presidio NLP)
- **우선순위**: P0

#### 6. Projects & Auth
- **목적**: 멀티 테넌시 및 인증
- **구현**: Project 관리 + JWT 인증
- **우선순위**: P0

#### 7. Organizations (기본)
- **목적**: 팀/조직 관리
- **구현**: Organization + Member 관리
- **우선순위**: P1

---

### ✂️ 4.2 제거하거나 합쳐도 되는 기능 (The Pruning)

"있으면 좋지만, 랭스미스가 더 잘하는" 혹은 "평범해 보이는" 기능들입니다.

#### ❌ 제거/축소
- **Chain Root Cause Analysis (범인 지목)**
  - **처리**: 완전 제거
  - **이유**: 
    - 사용 빈도 낮음 (복잡한 체인 에러는 드묾)
    - 구현 복잡도 높음 (o1-preview 등 고성능 모델 필요)
    - 비용 대비 효과 불명확
  - **대안**: 수동 분석 도구 제공 (로그 검색/필터링 강화)

- **Detailed Monitoring (상세 통계/리포트)**
  - **처리**: 삭제/축소
  - **전략**: 호출 횟수, 성공률 등은 기본 화면에 작게만 보여주고, 메인 메뉴에서는 제거
  - **이유**: "우리는 차트를 보여주는 회사가 아니라, 문제를 해결하는 회사다"라는 인상
  - **구현**: Dashboard에 작은 통계 카드만 유지

- **Shadow Routing**
  - **처리**: 제거 (나중에)
  - **이유**: 복잡함, MVP에서 불필요

- **Agent Chain Profiler**
  - **처리**: 제거 (나중에)
  - **이유**: 고급 기능, Auto-Mapping으로 대체 가능

- **Archive, Admin, Reports, Webhooks, Feature Flags, Notifications, Activity, Settings**
  - **처리**: 제거 (나중에)
  - **이유**: MVP에서 불필요
- **Export** (데이터 소유권)
  - **처리**: P0로 유지 (즉시 필요)
  - **이유**: 사용자 신뢰의 기반, GDPR 준수

#### 🔀 합병
- **Cost Analysis (비용 분석)**
  - **처리**: 합병
  - **전략**: 독립된 메뉴가 아니라, **Golden Case Miner 안에서 "이 테스트셋을 돌릴 때 들 예상 비용"** 정도로만 노출
  - **이유**: 비용 분석 툴은 이미 시장에 너무 많음

- **Drift Detection (성능 변화 감지)**
  - **처리**: 합병
  - **전략**: 별도 기능이 아니라 **AI Judge의 결과값 중 하나**로 처리
  - **이유**: 굳이 "Drift"라는 용어로 메뉴를 만들면 LangSmith와 겹쳐 보임
  - **구현**: Replay 결과에서 "Regression 감지됨" 플래그로 표시

- **단순 Panic Mode**
  - **처리**: 진화
  - **전략**: "끄고 켜는 스위치"는 **Production Guard의 한 기능**으로 포함
  - **구현**: Production Guard 설정에서 "글로벌 차단" 옵션으로 통합

---

### 4.2.1 🛡️ Production Guard (핵심 비즈니스 - "보안을 뿌리로 박기")

> **전략**: "AgentGuard가 꺼지면 서비스가 불안해지는 수준까지 침투"  
> **목표**: 검증 툴 → 운영 인프라 전환으로 높은 Retention 확보

#### 핵심 원칙

**"지도를 미끼로 던지고, 보안을 뿌리로 박으세요"**
- 시각화 (Railway Map) = 마케팅 미끼
- Production Guard (Firewall) = 비즈니스 뿌리

#### 1. 실시간 방화벽 (Real-time Firewall)

**목적**: 프로덕션 트래픽을 실시간으로 차단

**기능**:
- 스트리밍 응답을 병렬로 검사
- 위험 응답 감지 시 즉시 차단 (소켓 강제 종료)
- 레이턴시: < 100ms (목표)

**Lock-in 전략**:
- AgentGuard 없이는 배포 불가능
- 프로덕션 트래픽을 실시간으로 차단하는 필수 인프라

**Retention 전략**:
- 매일 프로덕션을 지켜보는 감시탑
- 문제 발생 시 즉시 대응

#### 2. 자동 배포 차단 (CI/CD 통합)

**목적**: Regression 감지 시 자동으로 배포 차단

**기능**:
- GitHub Actions 통합
- 성능 하락 시 PR 자동 거부
- "이 PR은 성능이 15% 하락했습니다. 배포를 중단합니다."

**CI/CD Skip-on-Failure 전략**:
- **문제**: "AgentGuard 서버 점검 중일 때 고객사의 전체 배포가 막히면 안 됩니다."
- **해결책**: CI/CD 통합 SDK에 "테스트 타임아웃(ex. 60s) 도달 시 경고만 남기고 배포를 허용하는 안전 스위치" 옵션을 기본으로 제공
- **구현**:
```yaml
# GitHub Actions 예시
- name: AgentGuard Test
  uses: agentguard/ci-action@v1
  with:
    timeout: 60s
    skip_on_failure: true  # 기본값: true
    # AgentGuard 서버 점검 중이거나 타임아웃 시 경고만 남기고 배포 허용
```
- **효과**: 고객 배포 차단 방지, 고객 만족도 향상, 운영 안정성 강화
- **우선순위**: P1 (Phase 4)

**Lock-in 전략**:
- CI/CD 파이프라인에 필수 요소
- AgentGuard 없이는 배포 불가능

**Retention 전략**:
- 배포할 때마다 사용
- 매일 사용하는 습관 형성

#### 3. 실시간 모니터링 및 알림

**목적**: 문제 발생 시 즉시 알림

**이메일 서비스: Resend**

AgentGuard는 **Resend**를 이메일 전송 서비스로 사용합니다.

**Resend 선택 이유**:
- 무료 티어: 월 3,000건 (초기 테스트에 충분)
- 간단한 API: 개발자 친화적, 빠른 구현
- 빠른 전송: 실시간 알림에 적합
- 도메인 인증 간단: DNS 설정만으로 가능
- 모던 스택: 최신 이메일 서비스, React Email 지원

**설정**:
- 환경 변수: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`
- 프로덕션: 자체 도메인 인증 (예: `onboarding@agentguard.ai`)
- 개발/테스트: `onboarding@resend.dev` 사용 가능

**기능**:
- Slack/Email 자동 알림 (Resend 사용)
- 실시간 대시보드
- 문제 발생 시 즉시 대응

**Retention 전략**:
- 매일 확인하는 습관 형성
- 자동 알림으로 지속적 참여 유도

#### 4. 글로벌 차단 (Panic Mode 진화)

**목적**: 긴급 상황 시 모든 AI 트래픽 차단

**기능**:
- Redis 기반 글로벌 토글
- 즉시 모든 프로젝트 차단
- "모든 AI 트래픽을 즉시 차단합니다."

**Lock-in 전략**:
- 긴급 상황 대응의 필수 도구
- AgentGuard 없이는 안전하지 않음

---

### 4.2.2 Retention 전략

> **문제**: "모델 테스트가 끝난 사용자가 매일 우리 앱에 들어와야 하는 이유가 무엇인가요? '검증 툴'은 일시적(Burst) 사용 패턴을 보입니다."

#### 1. 검증 툴 → 운영 인프라 전환

**Before**: "모델 테스트할 때만 사용" (일시적 사용)  
**After**: "매일 프로덕션을 지켜보는 감시탑" (지속적 사용)

**전략**:
- Free 플랜: 검증 툴 (일시적 사용)
- Pro 플랜: 운영 인프라 (매일 사용)
  - 실시간 방화벽
  - 자동 알림
  - CI/CD 통합
- Enterprise 플랜: 완전한 운영 인프라
  - Self-hosted 옵션
  - SOC2 인증
  - 전용 지원

#### 2. Lock-in 전략

**CI/CD 통합**:
- 배포 파이프라인에 필수 요소
- AgentGuard 없이는 배포 불가능

**실시간 방화벽**:
- 프로덕션 트래픽을 실시간으로 차단
- AgentGuard 없이는 서비스가 불안함

**자동 알림**:
- 문제 발생 시 즉시 알림
- AgentGuard 없이는 문제를 모름

**결과**: AgentGuard 없이는 배포 불가능, 서비스가 불안함

#### 3. 데일리 사용 유도

**실시간 대시보드**:
- 매일 확인하는 습관 형성
- 트렌드 분석으로 시간에 따른 성능 변화 추적

**자동 알림**:
- 문제 발생 시 즉시 알림
- 지속적 참여 유도

**트렌드 분석**:
- 시간에 따른 성능 변화 추적
- 장기적인 가치 제공

**결과**: 매일 사용하는 습관 형성

---

### 4.3 인프라 기능 (필수, 차별화 아님)

#### 1. Proxy (Zero-Friction Interception)
- **목적**: Base URL만 변경하여 모든 LLM 요청 캡처
- **구현**: FastAPI Proxy 엔드포인트 + 비동기 Snapshot 생성
- **우선순위**: P0

**Fail-open 전략 (장애 시 우회)**:
- **문제**: "만약 AgentGuard 서버가 죽으면 내 서비스도 마비되는 거 아냐?"
- **해결책**:
  1. **클라이언트 측 SDK 미들웨어**: AgentGuard 서버 장애 시 자동으로 원본 LLM으로 직접 요청
  2. **Circuit Breaker 패턴**: 연속 실패 시 자동 우회 (failure_threshold=3, timeout=60s)
  3. **Health Check**: `/health/proxy` 엔드포인트로 서버 상태 모니터링
  4. **증명**: "AgentGuard가 죽어도 우리 서비스는 안전합니다" 문서화 및 테스트
- **우선순위**: P0 (즉시 필요)

#### 2. Snapshot/Replay
- **목적**: 프로덕션 트래픽을 재실행하여 테스트
- **구현**: Snapshot 저장 → Replay 실행 → 결과 비교
- **우선순위**: P0

#### 3. PII Sanitizer (보안 마스킹)
- **목적**: 저장되는 로그에서 개인정보나 비밀번호가 유출되지 않도록 실시간 처리
- **구현**:
  - 2단계 처리: Regex (빠름) → Presidio NLP (정확)
  - 이메일, 카드번호, API Key 등을 [REDACTED]로 마스킹
  - 사용자 정의 패턴 지원 (프로젝트별 커스텀 규칙)
- **우선순위**: P0
- **성능 목표**: < 50ms
  - Regex 단계: < 10ms (빠른 필터링)
  - Presidio NLP: < 40ms (정확한 검출)
- **주의사항**: 성능 최적화, False Negative 방지

#### 4. Projects & Auth
- **목적**: 멀티 테넌시 및 인증
- **구현**: Project 관리 + JWT 인증
- **우선순위**: P0

#### 5. Organizations (기본)
- **목적**: 팀/조직 관리
- **구현**: Organization + Member 관리
- **우선순위**: P1

#### 6. 데이터 Export (데이터 소유권)
- **목적**: 사용자가 언제든지 자신의 데이터를 가져갈 수 있도록
- **구현**: 
  - 모든 Snapshot 데이터 Export (JSON/CSV)
  - Evaluation 결과 Export
  - 한 번의 클릭으로 전체 데이터 다운로드
- **데이터 소유권 명시**: "당신의 데이터는 당신 것입니다"
  - 언제든지 Export 가능
  - 언제든지 삭제 가능
  - GDPR 준수
- **우선순위**: P0 (즉시 필요)

---

### 4.3.1 성능 목표 및 증명

> **핵심 원칙**: "0.1초 내외 레이턴시를 코드 레벨에서 증명하지 못하면, 개발자들은 '성능 떨어진다'며 프록시를 걷어낼 것입니다."

#### 레이턴시 목표

| 기능 | 목표 | 세부 목표 |
|------|------|----------|
| **PII Sanitization** | < 50ms | Regex: < 10ms, Presidio NLP: < 40ms |
| **Firewall 검사** | < 100ms | 스트리밍 병렬 검사 |
| **전체 프록시 오버헤드** | < 200ms | 사용자 경험에 영향 없음 |

#### 성능 증명 전략

**1. 벤치마크 테스트**:
- 다양한 트래픽 패턴으로 테스트
- 레이턴시 분포 분석 (P50, P95, P99)
- 결과를 문서화 및 공개

**2. 데모 비디오**:
- 성능 지표를 데모 비디오에 포함
- "0.1초 내외 레이턴시" 시각화
- 실제 사용 시나리오로 증명

**3. 코드 레벨 증명**:
- 성능 테스트 코드 포함
- CI/CD에서 자동 성능 테스트
- 성능 회귀 방지

**4. 성능 모니터링**:
- 프로덕션 환경에서 실제 레이턴시 추적
- 성능 저하 시 즉시 알림
- 지속적인 성능 최적화

#### 클라이언트 SDK용 권장 타임아웃 가이드라인

> **핵심 원칙**: "우리가 우회 로직을 제공하더라도, 클라이언트의 타임아웃 설정이 우리 프록시의 지연시간보다 짧으면 무용지물입니다."

**Proxy Cascading Failure 방지**:
- **Proxy 타임아웃**: 30초 (LLM 응답 대기)
- **Firewall 검사 타임아웃**: 1초 내 중단 (타임아웃 시 자동 우회)
- **PII Sanitization 타임아웃**: 100ms (타임아웃 시 원본 전달)

**SDK 구현 가이드**:
- Circuit Breaker 패턴 적용
- Health Check 엔드포인트 모니터링
- 타임아웃 초과 시 자동 Fail-open (원본 LLM으로 직접 요청)

**우선순위**: P0 (즉시 필요)

---

### 4.3.2 프록시 성능 고도화 (Async Buffering & Batch Write)

> **핵심 원칙**: "프록시 트래픽이 몰릴 때 DB 쓰기(Write) 병목이 발생하면 프록시 전체가 느려집니다."

#### 문제점

**DB 쓰기 병목**:
- Snapshot 저장이 동기적으로 DB에 직접 쓰기
- 트래픽 증가 시 DB 쓰기 병목 발생
- 프록시 전체 성능 저하

#### 해결책: Async Buffering & Batch Write

**Redis Stream 완충지대**:
- Snapshot 데이터를 Redis Stream에 먼저 저장
- 프록시는 즉시 응답 (비동기 처리)
- Redis Stream: `snapshot:stream:{project_id}`

**Batch Write 로직**:
- 1초 단위로 Batch Insert 실행
- 여러 Snapshot을 한 번에 DB에 저장
- DB 쓰기 횟수 대폭 감소

**구현**:
```python
# 1. 프록시에서 Snapshot 생성 시
redis_client.xadd(f"snapshot:stream:{project_id}", snapshot_data)

# 2. 백그라운드 워커 (1초마다 실행)
snapshots = redis_client.xread(f"snapshot:stream:{project_id}", count=100)
db.bulk_insert_snapshots(snapshots)  # Batch Insert
```

**효과**:
- DB 쓰기 병목 완전 해결
- 프록시 성능 유지 (비동기 처리)
- 확장성 확보

#### Snapshot Loss-Tolerant Proxy (Fail-silent 로직)

> **핵심 원칙**: "Redis가 일시적으로 죽었을 때 프록시가 에러를 내면 안 됩니다."

**문제점**:
- Redis Stream 실패 시 프록시 에러 발생 가능
- 원본 LLM 응답 지연/실패 위험
- Redis 장애가 전체 프록시에 영향

**해결책: Fail-silent 로직**:
- **Redis Write 실패 시**: Snapshot 저장은 포기하되 원본 LLM 응답은 지체 없이 반환
- **구현**:
```python
try:
    redis_client.xadd(f"snapshot:stream:{project_id}", snapshot_data)
except RedisError:
    # Redis 실패 시 Snapshot 저장 포기, 원본 응답은 정상 반환
    logger.warning("Redis write failed, skipping snapshot")
    pass  # 원본 LLM 응답은 그대로 반환
```

**효과**:
- Redis 장애 시에도 프록시 정상 동작
- 원본 LLM 응답 보장 (가용성 유지)
- Snapshot 손실은 감수 (데이터 수집 vs 서비스 가용성)

**우선순위**: P0 (즉시 필요)

---

#### Dogfooding 전략

> **핵심 원칙**: "우리 툴이 좋은지 어떻게 알아?" → "우리가 우리 툴로 AgentGuard를 만들고 있다"

**내부 테스트**:
- AgentGuard의 백엔드 성능과 AI Judge 로직은 AgentGuard 자체 프록시를 통해 매일 모니터링됨
- 우리 자신이 첫 번째 사용자이자 가장 까다로운 사용자
- 실제 프로덕션 환경에서 지속적으로 테스트

**효과**:
- "우리가 우리 툴로 AgentGuard를 만들고 있다"는 증명
- 개발자적 신뢰도 향상
- 실제 사용 시나리오에서 발견되는 문제를 즉시 해결

---

### 4.4 결과 및 기능 우선순위 요약

#### 결과 중심 (One-Click)

| 결과 | 우선순위 | 차별화 | 상태 |
|------|---------|--------|------|
| 결과 1: 새 모델 안전성 검증 | P0 | ⭐⭐⭐ | Phase 3 |
| 결과 2: 문제 발생 지점 찾기 | P1 | ⭐⭐ | Phase 4 |
| 결과 3: 의존성 파악하기 | P1 | ⭐⭐ | Phase 4 |
| 결과 4: 성능 병목 찾기 | P1 | ⭐⭐ | Phase 4 |

#### 인프라 기능 (결과를 위한 기반)

| 기능 | 우선순위 | 차별화 | 상태 |
|------|---------|--------|------|
| Proxy | P0 | ⭐ | 구현됨 |
| Snapshot/Replay | P0 | ⭐ | 구현됨 |
| LLM-as-a-Judge | P0 | ⭐⭐ | 구현됨 |
| PII Sanitizer | P0 | ⭐ | Phase 3 |
| Projects & Auth | P0 | - | 구현됨 |
| Organizations | P1 | - | 구현됨 |
| Auto-Mapping (동적) | P1 | ⭐⭐ | Phase 4 |
| Git-Sync | P2 | ⭐⭐⭐ | Phase 6 (나중에) |
| 데이터 Export | P0 | - | Phase 3 |
| Fail-open 전략 | P0 | - | Phase 3 |
| Billing & Usage Tracking | P0 | - | Phase 3 |
| 온보딩 (Magic Moment) | P0 | ⭐ | Phase 3 |
| Error Namespace | P0 | - | Phase 3 |
| 클라이언트 타임아웃 가이드라인 | P0 | - | Phase 3 |
| Trust Center | P1 | ⭐ | Phase 3 |
| Judge 신뢰도 강화 | P1 | ⭐ | Phase 4 |
| 복잡도 관리 | P1 | ⭐ | Phase 4 |
| Streaming UI | P1 | ⭐ | Phase 4 |
| 인터랙티브 지도 | P1 | ⭐⭐ | Phase 4 |
| Delta UX | P1 | ⭐ | Phase 4 |
| Daily Insight 서머리 | P1 | ⭐⭐ | Phase 4 |
| Z-Score 기반 인사이트 | P1 | ⭐ | Phase 4 |
| 사용자 API Key 연동 | P1 | ⭐ | Phase 4 |
| Shareable Verdict Link | P1 | ⭐ | Phase 4 |
| 시스템 상태별 UI 분기 | P1 | ⭐ | Phase 4 |
| Deep Linking 전략 | P1 | ⭐ | Phase 4 |
| Admin Impersonation & Audit Trail | P1 | ⭐ | Phase 4 |
| 바이럴 엔진 (레퍼럴) | P1 | ⭐⭐ | Phase 4 |
| API 버저닝 전략 | P1 | - | Phase 4 |
| CI/CD Skip-on-Failure | P1 | ⭐ | Phase 4 |
| Viewport Coordinated Focus | P1 | ⭐ | Phase 4 |
| Public Agency Map Gallery | P2 | ⭐⭐ | Phase 5 |
| 커뮤니티 전략 | P2 | ⭐⭐ | Phase 5 |
| Multi-Region 데이터 거주 | P1 | - | Phase 8 |
| 법적/윤리적 (ToS, DPA) | P1 | - | Phase 6 |

---

### 4.4.1 커뮤니티 전략 (바이럴 장치)

> **문제**: "개발자들이 우리 서비스를 쓰지 않더라도 우리 사이트에 와서 정보를 얻게 만들 '미끼 데이터'가 있을까요?"

#### 1. 오픈소스 전략
- **표준 AI 채점 루브릭(Standard AI Rubrics)** 오픈소스 공개
- 업계 표준으로 만들기
- GitHub에서 활발한 커뮤니티 구축

#### 2. Rule Market
- 개발자들이 자신만의 Firewall Rule을 공유
- 커뮤니티가 만든 Rule 라이브러리
- 인기 Rule 추천

#### 3. Public Benchmarks (미끼 데이터)
- 모델별 성능 벤치마크 공개
- 사용하지 않아도 가치를 제공하는 콘텐츠
- SEO 및 바이럴 효과

**우선순위**: P2 (Phase 5)

---

## 5. 보안 체크리스트

> **상세 내용**: [guides/SECURITY_GUIDE.md](./guides/SECURITY_GUIDE.md) 참고

### 5.1 인증/인가 (AuthN/AuthZ)

#### ✅ 구현 필요
- [x] JWT 기반 인증
- [x] Password Hashing (bcrypt)
- [x] Refresh Token Rotation
- [x] API Key 인증 (SDK용)
- [x] RBAC (Role-Based Access Control)
- [ ] ABAC (Attribute-Based Access Control)
- [x] 테넌트 격리 (project_id 필수 체크)
- [x] 최소 권한 원칙

#### 구현 위치
- `backend/app/core/security.py` - JWT, Password
- `backend/app/core/permissions.py` - RBAC, Project Access
- `backend/app/middleware/auth_middleware.py` - 인증 미들웨어

### 5.2 입력 검증 & SQL Injection 방어

#### ✅ 구현 필요
- [x] Pydantic RequestDTO 검증
- [x] SQL Injection 방어 (SQLAlchemy ORM 사용)
- [x] XSS 방어 (CSP 헤더)
- [ ] CSRF 방어 (SameSite 쿠키) - JWT 사용으로 쿠키 미사용
- [x] SSRF 방어 (프록시 요청 검증)

#### 구현 위치
- `backend/app/api/v1/endpoints/*.py` - Pydantic 검증
- `backend/app/core/validation.py` - 커스텀 검증
- `backend/app/middleware/security_middleware.py` - 보안 헤더

### 5.3 Rate Limiting & Brute Force 방어

#### ✅ 구현 필요
- [x] Rate Limiting (기본)
- [x] Brute Force 방어 (로그인 시도 제한)
- [x] IP 기반 차단

#### 구현 위치
- `backend/app/middleware/rate_limit.py` - Rate Limiting
- `backend/app/services/brute_force_protection.py` - Brute Force

### 5.4 쿠키 & 세션 보안

#### ✅ 구현 필요
- [ ] HttpOnly 쿠키
- [ ] Secure 쿠키 (HTTPS)
- [ ] SameSite 쿠키
- [ ] 세션 타임아웃

### 5.5 Secret 관리 & Rotation

#### ✅ 구현 필요
- [ ] 환경 변수로 Secret 관리
- [ ] Secret Rotation 전략
- [ ] API Key Rotation

### 5.6 HTTPS/HSTS & 보안 헤더

#### ✅ 구현 필요
- [x] HTTPS 강제 (프로덕션 환경)
- [x] HSTS 헤더
- [x] CSP (Content Security Policy)
- [x] X-Frame-Options
- [x] X-Content-Type-Options
- [x] Referrer-Policy

### 5.7 CORS/Preflight

#### ✅ 구현 필요
- [x] CORS 설정 (기본)
- [ ] Preflight 요청 처리
- [ ] 프로덕션 환경별 Origin 제한

### 5.8 Audit Log

#### ✅ 구현 필요
- [x] 모든 인증/인가 이벤트 로깅
- [x] 중요한 비즈니스 액션 로깅
- [x] 불변성 보장 (로그 수정 불가)

### 5.9 에러 노출 차단

#### ✅ 구현 필요
- [x] 프로덕션 환경에서 상세 에러 숨김
- [x] Sentry 통합 (에러 추적)
- [x] 일반적인 에러 메시지 반환

### 5.10 의존성 취약점 점검

#### ✅ 구현 필요
- [x] 정기적인 `pip audit` 실행 (check_vulnerabilities.py 스크립트)
- [x] Dependabot 설정
- [x] 취약점 알림 시스템 (GitHub Actions security-scan.yml)

### 5.11 규정 준수 및 인증 (Enterprise 필수)

#### ✅ 구현 필요
- [ ] SOC2 Type 1 준비 (6개월)
- [ ] SOC2 Type 1 인증 (12개월 내)
- [ ] SOC2 Type 2 인증 (18개월 내)
- [ ] GDPR 준수
- [ ] 데이터 익명화 강화
- [ ] 데이터 보존 정책 (고객 요구에 따라 조정 가능)
- [ ] 데이터 로컬 저장 옵션 (Self-hosted, Phase 4)

---

### 5.12 Trust Center (GTM 전략)

> **핵심 원칙**: "우리는 Vercel 만큼 안전하다"는 인상을 첫 런딩 페이지에서 주어야 합니다.

#### Trust Center 페이지

**목적**: 현재 우리가 준수하고 있는 보안 정책을 투명하게 공개

**내용**:
- 현재 보안 정책 (암호화, 접근 제어, 모니터링)
- 준수 중인 규정 (GDPR 준수, 데이터 보호)
- SOC2 인증 로드맵 (현재 상태, 예상 일정)
- 데이터 처리 정책 (데이터 소유권, Export 옵션)
- 보안 인시던트 대응 계획

**배치**:
- 사이트 하단 링크
- 대시보드 내 'Trust Center' 링크
- 첫 런딩 페이지에 명시

**효과**:
- 엔터프라이즈 고객 신뢰 구축
- 미국 시장 진입 장벽 완화
- "Security"와 "Compliance" 체크하는 고객 대응

**우선순위**: P1 (Phase 3 - 런칭 전 필수)

#### SOC2 인증 계획
- **Phase 1 (6개월)**: SOC2 Type 1 준비 - 보안 정책 문서화, 액세스 제어 프로세스 구축 ($20,000-50,000)
- **Phase 2 (12개월)**: SOC2 Type 1 인증 - 외부 감사 진행 ($20,000-50,000)
- **Phase 3 (18개월)**: SOC2 Type 2 인증 - 연속 모니터링 구축 ($50,000-100,000)

#### 데이터 프라이버시
- 데이터 익명화: PII Sanitizer로 실시간 마스킹
- 데이터 보존: 고객 요구에 따라 조정 가능 (기본 90일)
- 데이터 로컬 저장: Self-hosted 옵션 (Enterprise 전용, Phase 4)
- 데이터 접근 제어: RBAC/ABAC로 엄격한 접근 제어

#### Multi-Region 데이터 거주 정책 (Data Residency)

> **핵심 원칙**: "유럽 고객(GDPR)은 데이터가 미국 서버로 넘어가는 것을 법적으로 금지할 수 있습니다."

**데이터 저장 지역 선택 옵션**:
- **AWS Seoul**: 한국 고객용
- **AWS Oregon**: 미국 고객용 (기본)
- **AWS Frankfurt**: 유럽 고객용 (GDPR 준수)

**구현 계획**:
- **Phase 8**: 고객 플랜에 따라 데이터 저장 지역 선택 옵션 제공
- 데이터 복제 및 동기화 전략
- 지역별 규정 준수 (GDPR, 각국 데이터 보호법)

**우선순위**: P1 (Enterprise 고객 확보 전 필수)

---

## 6. 운영 필수 요소

> **상세 내용**: [guides/OPERATIONS_GUIDE.md](./guides/OPERATIONS_GUIDE.md) 참고

### 6.1 에러 로깅

#### ✅ 구현 필요
- [x] Sentry 통합
- [x] 구조화된 JSON 로깅
- [ ] 에러 알림 (Slack/Email)
  - [x] Resend 이메일 서비스 설정 (`backend/app/core/config.py`)
  - [ ] 이메일 서비스 구현 (`backend/app/services/email_service.py`)
  - [ ] Alert 서비스와 이메일 통합
  - [ ] 이메일 템플릿 작성

### 6.2 사용자 행동/이벤트 추적

#### ✅ 구현 필요
- [ ] PostHog 또는 Google Analytics 통합
- [ ] 주요 이벤트 추적 (Project 생성, Replay 실행 등)

### 6.3 백업 전략

#### ✅ 구현 필요
- [ ] 데이터베이스 자동 백업 (Railway/Supabase)
- [ ] 백업 복구 테스트
- [ ] 백업 보관 정책

### 6.4 Status Page/Health Check

#### ✅ 구현 필요
- [x] `/health` 엔드포인트
- [x] `/health/detailed` 엔드포인트
- [ ] 외부 Status Page (예: statuspage.io)

### 6.5 Admin Screen

#### ✅ 구현 필요
- [ ] 사용자 관리 화면
- [ ] 결제 관리 화면
- [ ] 콘텐츠 관리 화면
- [ ] 시스템 모니터링 화면

#### Admin Impersonation & Audit Trail

> **핵심 원칙**: "유저가 '내 에이전트 답변이 왜 차단됐어?'라고 물을 때, 관리자가 그 트래픽을 즉시 디버깅할 도구가 필요합니다."

**유저 데이터 일시적 뷰어**:
- 관리자가 유저 승인 하에 유저 데이터 접근
- 유저의 Snapshot, 트래픽, 설정 등을 일시적으로 확인
- 디버깅 완료 후 즉시 접근 종료

**Audit Trail**:
- 모든 설정 변경 이력을 기록하는 `AuditLogs` 테이블
- 누가, 언제, 무엇을 변경했는지 추적
- 법적 요구사항 준수 (SOC2 등)

**AuditLogs 테이블 설계**:
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100),  -- 'project_created', 'firewall_rule_updated', etc.
  resource_type VARCHAR(50),  -- 'project', 'firewall_rule', etc.
  resource_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**효과**:
- CS 대응 시간 단축
- 유저 이탈 방지
- 법적 요구사항 준수

**우선순위**: P1 (Phase 4)

---

### 6.6 Billing & Usage Tracking

> **핵심 원칙**: "유저가 100,000회를 넘게 썼을 때, 이를 실시간으로 감지해서 차단하거나 추가 과금을 하는 시스템이 없으면 '수익성'이 순식간에 악화됩니다."

#### Billing Service 설계

**파일**: `backend/app/services/billing_service.py`

**기능**:
- Stripe 연동 (결제 처리)
- 사용량 실시간 트래킹
- 소프트 캡 초과 시 처리 (차단 또는 추가 과금)
- 구독 플랜 관리 (Free, Pro, Enterprise)

#### 실시간 사용량 트래킹

**Redis 기반 카운터**:
- Daily Usage Counter: `user:{user_id}:usage:daily:{date}`
- Monthly Usage Counter: `user:{user_id}:usage:monthly:{year_month}`
- Judge 호출 카운터: `user:{user_id}:judge_calls:monthly:{year_month}`
- Snapshot 카운터: `user:{user_id}:snapshots:monthly:{year_month}`

**실시간 감지**:
- 각 요청마다 Redis 카운터 증가
- 소프트 캡 초과 시 즉시 알림 또는 차단
- 월간 사용량 리셋 (매월 1일)

#### 소프트 캡 초과 처리

**Pro 플랜 (100,000회)**:
- 초과 시: 알림 → 추가 요금 ($0.001/회) 또는 제한
- Fair Use Policy 적용

**Enterprise 플랜 (1,000,000회)**:
- 초과 시: 알림 → 계약에 따라 처리
- 사용량 조정 가능

**우선순위**: P0 (즉시 필요)

---

## 7. 데이터베이스 설계

> **상세 내용**: [guides/DATABASE_SCHEMA.md](./guides/DATABASE_SCHEMA.md) 참고

### 7.1 핵심 테이블 개요

- **Users**: 사용자 정보, 레퍼럴 시스템
- **Projects**: 프로젝트 정보
- **Organizations**: 조직 정보
- **OrganizationMembers**: 조직 멤버십
- **Snapshots**: LLM 요청/응답 스냅샷
- **Traces**: 트레이스 정보
- **EvaluationRubrics**: 평가 루브릭
- **APICalls**: API 호출 이력
- **FirewallRules**: 방화벽 규칙
- **GoldenCases**: 골든 케이스
- **GoldenCaseRuns**: 골든 케이스 실행 이력
- **AuditLogs**: 감사 로그

### 7.2 주요 설계 원칙

- **외래키 제약조건**: CASCADE/SET NULL 정책 명확히 정의
- **인덱스 전략**: 쿼리 성능 최적화
- **트랜잭션 관리**: 일관성 보장
- **데이터 수명 주기**: 플랜별 TTL 설정

**상세 내용**: [guides/DATABASE_SCHEMA.md](./guides/DATABASE_SCHEMA.md) 참고

---

### 7.3 데이터 수명 주기 설계 (Data Retention & Auto-Archiving)

> **핵심 원칙**: "100만 개의 Snapshot을 영원히 저장하면 DB 비용으로 망합니다."

#### 플랜별 TTL (Time To Live) 설정

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

#### Auto-Archiving 로직

**아카이빙 전략**:
1. **TTL 도달 전 3일**: 사용자에게 알림 (데이터 보존 연장 옵션)
2. **TTL 도달**: 자동으로 S3 Glacier로 아카이브
3. **아카이브 후 90일**: 완전 삭제 (복구 불가)

**구현**:
```python
# 백그라운드 워커 (매일 실행)
for snapshot in get_expired_snapshots():
    if snapshot.plan == "free" and snapshot.age > 7_days:
        archive_to_s3_glacier(snapshot)
    elif snapshot.plan == "pro" and snapshot.age > 30_days:
        archive_to_s3_glacier(snapshot)
    elif snapshot.plan == "enterprise" and snapshot.age > 90_days:
        archive_to_s3_glacier(snapshot)
```

**비용 절감 효과**:
- DB 저장 비용: 90% 감소
- S3 Glacier 비용: DB 대비 1/10 수준
- 수익성 향상

**우선순위**: P0 (즉시 필요)
- 모든 스키마 변경은 마이그레이션으로
- 롤백 가능한 마이그레이션 작성

---

## 8. API 설계

> **상세 내용**: [guides/API_REFERENCE.md](./guides/API_REFERENCE.md) 참고

### 8.1 RESTful API 원칙

- 리소스 중심 URL 설계
- HTTP 메서드 적절히 사용 (GET, POST, PUT, DELETE)
- 일관된 응답 형식

### 8.2 핵심 엔드포인트 개요

#### Auth
- `POST /api/v1/auth/register` - 회원가입
- `POST /api/v1/auth/login` - 로그인
- `POST /api/v1/auth/refresh` - 토큰 갱신

#### Projects
- `GET /api/v1/projects` - 프로젝트 목록
- `POST /api/v1/projects` - 프로젝트 생성
- `GET /api/v1/projects/{id}` - 프로젝트 조회
- `PUT /api/v1/projects/{id}` - 프로젝트 수정
- `DELETE /api/v1/projects/{id}` - 프로젝트 삭제

#### Proxy
- `POST /api/v1/proxy/{project_id}/chat/completions` - OpenAI Proxy
- `POST /api/v1/proxy/{project_id}/v1/chat/completions` - Anthropic Proxy

#### 결과 1: 새 모델 안전성 검증
- `POST /api/v1/projects/{id}/model-safety-test` - 새 모델 안전성 검증 (One-Click)
- `GET /api/v1/projects/{id}/model-safety-test/{test_id}` - 검증 결과 조회
- `GET /api/v1/projects/{id}/model-safety-test/{test_id}/details` - 상세 분석 (Pro 전용)

#### 결과 2: 문제 발생 지점 찾기
- `POST /api/v1/projects/{id}/problem-analysis` - 문제 발생 지점 분석 (One-Click)
- `GET /api/v1/projects/{id}/problem-analysis/{analysis_id}` - 분석 결과 조회
- `GET /api/v1/projects/{id}/problem-analysis/{analysis_id}/mapping` - 설계도 데이터 (Pro 전용)

#### 결과 3: 의존성 파악하기
- `POST /api/v1/projects/{id}/dependency-analysis` - 의존성 분석 (One-Click)
- `GET /api/v1/projects/{id}/dependency-analysis/{analysis_id}` - 분석 결과 조회
- `GET /api/v1/projects/{id}/dependency-analysis/{analysis_id}/mapping` - 설계도 데이터 (Pro 전용)

#### 결과 4: 성능 병목 찾기
- `POST /api/v1/projects/{id}/performance-analysis` - 성능 병목 분석 (One-Click)
- `GET /api/v1/projects/{id}/performance-analysis/{analysis_id}` - 분석 결과 조회
- `GET /api/v1/projects/{id}/performance-analysis/{analysis_id}/mapping` - 설계도 데이터 (Pro 전용)

#### Replay (기반 기능)
- `POST /api/v1/replay/{project_id}/run` - Replay 실행
- `GET /api/v1/replay/{project_id}/results` - Replay 결과 조회 (Regression 감지 포함)

#### Rubrics
- `GET /api/v1/projects/{id}/rubrics` - 루브릭 목록
- `POST /api/v1/projects/{id}/rubrics` - 루브릭 생성
- `DELETE /api/v1/rubrics/{id}` - 루브릭 삭제

#### 데이터 Export
- `POST /api/v1/projects/{id}/export` - 프로젝트 데이터 Export (JSON/CSV)
- `GET /api/v1/projects/{id}/export/status/{export_id}` - Export 상태 조회

#### Organizations
- `GET /api/v1/organizations` - 조직 목록
- `POST /api/v1/organizations` - 조직 생성
- `GET /api/v1/organizations/{id}` - 조직 조회

#### 🔍 Auto-Mapping (Phase 2)
- `GET /api/v1/projects/{id}/mapping` - 에이전트 구조 시각화 데이터
- `GET /api/v1/projects/{id}/mapping/graph` - 의존성 그래프

#### 🪄 Git-Sync (Phase 3, 나중에)
- `POST /api/v1/projects/{id}/git-sync` - Git 동기화 트리거
- `GET /api/v1/projects/{id}/git-sync/status` - 동기화 상태 조회
- **참고**: 보안/복잡도 고려하여 Phase 3로 연기

### 8.3 API 문서화

- **Swagger UI**: `/docs` 엔드포인트
- **OpenAPI 스펙**: `/openapi.json`
- **에러 처리**: 표준화된 에러 응답 형식
- **검증 규칙**: Pydantic 기반 요청 검증

**상세 내용**: [guides/API_REFERENCE.md](./guides/API_REFERENCE.md) 참고

---

## 9. 프론트엔드 설계

### 9.1 기술 스택

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (표준 SaaS 컴포넌트)
- **State Management**: React Context + Zustand (필요시)
- **API Client**: tRPC 또는 Fetch API
- **서버 상태 관리**: TanStack Query (React Query) - 캐싱 및 서버 상태 관리
- **실시간 통신**: WebSocket (실시간 데이터 스트리밍)
- **Optimistic UI**: TanStack Query의 Optimistic Updates 활용

### 9.2 디자인 원칙

- **다른 서비스 프레임에 맞춤**: Vercel, Linear, Stripe 같은 모던 SaaS UI 패턴
- **기능 중심**: 디자인보다 기능 구현 우선
- **일관성**: shadcn/ui 컴포넌트로 일관된 UI

### 9.3 핵심 페이지 (결과 중심)

#### Phase 1 (MVP)
1. **Dashboard** - 프로젝트 목록, 작은 통계 카드, Daily Insight 서머리
   - **Daily Insight 서머리** (Phase 4): 대시보드 최상단에 AI 요약 레포트
     - 매일 자동으로 인사이트 추출
     - 사용자가 정보를 '찾으러' 오는 게 아니라, 우리가 인사이트를 '먹여주는' 경험
     - 예시: "새로운 회귀 패턴 감지", "비용 급증 알림", "품질 하락 경고"
     - 효과: Retention 향상 (매일 확인할 이유 제공), 정보 과부하 해결
     - **Z-Score 기반 정밀 인사이트**:
       - **문제**: "20% 하락" 같은 단순 비율은 데이터 편차가 클 때 오작동
       - **해결책**: 이동 평균과 표준 편차(Z-Score)를 활용한 이상치 감지 알고리즘
       - **구현**: 
         - 이동 평균(MA) 계산: 최근 7일 평균 점수
         - 표준 편차(σ) 계산
         - Z-Score = (현재 점수 - MA) / σ
         - Z-Score > 2 또는 < -2인 경우 이상치로 감지
       - **효과**: 통계적 정확도 확보, False Positive 감소, 신뢰도 향상
2. **Project Detail** - 결과 중심 One-Click 버튼들
   - [새 모델 테스트] 버튼 → 결과 1: "새 모델 안전성 검증"
   - [문제 분석] 버튼 → 결과 2: "문제 발생 지점 찾기" (텍스트만, Free)
   - [의존성 보기] 버튼 → 결과 3: "의존성 파악하기" (텍스트만, Free)
   - [성능 분석] 버튼 → 결과 4: "성능 병목 찾기" (텍스트만, Free)
3. **Results View** - 결과 상세 보기
   - 결과 요약 (Free)
   - 상세 분석 (Pro)
   - 설계도 시각화 (Pro)
4. **Rubrics** - 루브릭 관리

#### Phase 2
5. **🔍 Auto-Mapping** - 설계도 시각화 (Railway 스타일, Pro 전용)
   - 결과 2, 3, 4에서 사용
   - 문제 노드/병목 노드 붉게 표시

#### Phase 3 (나중에)
6. **🪄 Git-Sync** - Git 동기화 상태, UI-to-Code 변경 이력 (보안/복잡도 고려)

---

### 9.4 Interactive Onboarding (The Magic Moment)

> **핵심 원칙**: "얼마나 빨리 내 첫 데이터를 화면에서 보는가"가 개발자 도구의 성패를 결정합니다. "Base URL만 바꾸면 된다"고 하지만, 실제로 프록시 API 키를 발급받고 코드를 수정하는 과정에서 5분만 허우적대도 개발자는 이탈합니다.

#### Quick Start 가이드

**목표**: 첫 5분 내 첫 Snapshot 생성

**구현**:
1. 가입 즉시 대시보드에 curl 명령어 표시
2. 복사-붙여넣기로 즉시 테스트 가능
3. 첫 Snapshot 생성 시 축하 메시지

**예시**:
```bash
# 대시보드에 표시되는 명령어
curl -X POST https://api.agentguard.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]}'
```

#### Magic Setup Playground

**가상 에이전트 시뮬레이터**:
- 가입 즉시 대시보드 우측에 배치
- 버튼 클릭으로 가상 트래픽 생성
- 실시간으로 Snapshot 쌓임, 지도 그려짐
- "이 툴이 나에게 줄 가치"를 30초 만에 이해

**효과**:
- 내 에이전트를 연동하기 전부터 가치 체감
- 이탈률 감소
- 첫 사용 경험 최적화

**Click-through Liability Agreement** (Phase 3):
- **문제**: "AI Judge가 만점이라고 했는데 실제로 사고가 났을 때, 소송을 방어할 '면책 문구'의 위치와 구속력이 약합니다."
- **해결책**: 온보딩 시 **"AI 채점의 비결정성을 이해하며, 이를 신뢰한 결과에 대한 책임은 본인에게 있다"**는 강제 동의 절차
- **구현**:
  1. 가입 시 ToS 동의 화면 표시
  2. "AI Judge 결과에 대한 책임 한계" 섹션 강조
  3. 체크박스 필수 선택 (동의 없이 진행 불가)
  4. 동의 기록 저장 (법적 증거)
- **효과**: 법적 리스크 완화, 소송 방어 근거 강화

**Shareable Verdict Link** (Phase 4):
- **문제**: "설계도가 그려지는 마법" 이후, 유저가 **"그래서 이걸 어떻게 상사에게 보고하지?"**라는 지점에서 막힘
- **해결책**: "✅ 배포 가능"이라는 결과 화면을 클릭 한 번으로 팀장님 슬랙에 쏠 수 있게 하는 경험
- **구현**: 결과 화면에 "Share" 버튼 → 고유 URL 생성 → Slack/Email 공유
- **효과**: 마찰을 0으로 만듦, 팀 내 의사결정 가속화

**우선순위**: P0 (즉시 필요)

---

### 9.5 UX 개선사항

#### 1. 실시간성 시각화 (Streaming UI)

> **핵심 원칙**: "아, 지금 내 에이전트들이 일하고 있구나"를 시각적으로 즉각 체감하게 합니다.

**Live Stream View**:
- 데이터가 들어오는 즉시 리스트가 위로 밀려 올라가는 애니메이션
- Vercel의 Deployment 로그 뷰어 같은 느낌

**Pulse 인디케이터**:
- 현재 통과 중인 트래픽 수 표시
- 실시간 트래픽 흐름 시각화

**효과**: "아, 지금 내 에이전트들이 일하고 있구나" 즉각 체감

**우선순위**: P1 (Phase 4)

---

#### 2. 지도의 인터랙티브 디테일 (Graph Canvas UX)

> **핵심 원칙**: Railway 스타일의 지도는 우리 마케팅의 '섹시함'을 담당합니다. 하지만 UX가 불편하면 금방 안 씁니다.

**미니맵 (Mini-map)**:
- 에이전트가 많아졌을 때를 대비한 내비게이션
- 전체 구조를 한눈에 파악

**노드 확장/축소**:
- 에이전트 내부의 상세 로그를 지도에서 바로 팝업(또는 슬라이드)으로 확인
- 클릭 한 번으로 상세 정보 접근

**드래그 앤 드롭 정책 부여**:
- Firewall Rule을 특정 에이전트 노드 위에 드롭하면 즉시 적용
- 직관적인 정책 관리

**기술 추천**: React Flow 또는 X6 라이브러리

**Interaction Specification**:
- **Zoom level에 따른 정보 차등 노출**:
  - 줌아웃 시: 점수(✅/❌)만 표시
  - 줌인 시: 해당 에이전트의 최근 3개 메시지 노출
- **Edge Case 처리**:
  - 순환 참조(Circular Dependency) 에이전트 구조 시 시각화 처리 규칙
  - 너무 많은 노드일 때 자동 그룹화
  - 렌더링 성능 최적화 (가상화)

**Viewport Coordinated Focus**:
- **문제**: "지도가 복잡해지면 노드 클릭 시 어디로 이동했는지 유저가 혼란을 겪습니다."
- **해결책**: 
  - **부드러운 캔버스 포커싱 애니메이션**: 노드 클릭 시 해당 노드로 부드럽게 이동 (0.3초 애니메이션)
  - **실시간 업데이트 초당 2회 제한(Throttling)**: 업데이트 빈도를 제한하여 시각적 피로도 제어
  - **Viewport 좌표 계산**: 클릭한 노드의 화면 중앙 배치
- **구현**:
  - React Flow의 `fitView` API 활용
  - `requestAnimationFrame`으로 애니메이션 제어
  - 업데이트 이벤트를 500ms 간격으로 제한 (Throttling)
- **효과**: 사용자 혼란 감소, 시각적 피로도 제어, 사용성 향상
- **우선순위**: P1 (Phase 4)

---

#### 3. 사이드-바이-사이드 결과 비교 (Delta UX)

> **핵심 원칙**: '회귀 검증(Regression Guard)'의 핵심은 **"어제보다 오늘 뭐가 달라졌나"**를 한눈에 보여주는 것입니다.

**Semantic Diff Viewer**:
- AI Judge가 감점한 **'특정 문구'**를 하이라이트
- 단순히 텍스트 비교를 넘어, 의미적 차이를 시각화

**모델 A vs 모델 B**:
- 양옆에 두고 차이점(Delta)만 골라 보여주는 뷰
- 수천 글자를 읽지 않고도 "아, 이 모델은 이 문장이 약하구나" 수 초 만에 깨달음

**효과**: 개발자가 수천 글자를 읽지 않고도 "아, 이 모델은 이 문장이 약하구나"라고 수 초 만에 깨닫게 합니다.

**우선순위**: P1 (Phase 4)

---

### 9.6 시스템 상태별 UI 분기 설계

> **핵심 원칙**: "에이전트 연동이 실패했을 때", "구독 한도가 다 찼을 때", "지도가 너무 커서 렌더링이 안 될 때" 등의 에러 화면 기획이 필요합니다.

#### 1. Cold Start (프로젝트 생성 후 트래픽이 0일 때)

**Empty State 화면**:
- Curl 가이드 강조
- Magic Setup Playground 버튼
- "첫 Snapshot을 생성해보세요" 메시지

#### 2. Quota Exceeded (구독 한도 초과)

**Pro 플랜 유도 모달**:
- 기능 잠금(Overlay) UI 플로우
- "Pro 플랜으로 업그레이드하여 더 많은 기능을 사용하세요" 메시지
- 즉시 업그레이드 버튼

#### 3. Async Judge (Judge 결과가 아직 안 나왔을 때)

**Skeleton/Loading 상태**:
- Judge 실행 중임을 명확히 표시
- 예상 소요 시간 표시
- 진행률 표시 (가능한 경우)

#### 4. 에이전트 연동 실패

**에러 화면**:
- 명확한 에러 메시지
- 해결 방법 가이드
- 지원팀 연락처

#### 5. 지도 렌더링 실패 (너무 큰 구조)

**Fallback UI**:
- 텍스트 기반 의존성 트리 표시
- 필터링 옵션 제공
- "더 작은 범위로 보기" 버튼

**우선순위**: P1 (Phase 4)

---

### 9.7 Deep Linking 전략

> **핵심 원칙**: "개발팀은 결과를 공유하며 의사결정합니다."

#### 특정 Snapshot/Regression Test 결과 공유

**고유 URL 생성 규칙**:
- `/projects/{project_id}/snapshots/{snapshot_id}` - 특정 Snapshot 상세
- `/projects/{project_id}/tests/{test_id}` - 특정 Regression Test 결과
- `/projects/{project_id}/results/{result_id}` - 특정 One-Click 결과

#### Guest View (Read-only)

**인증 여부에 따른 접근**:
- 인증된 사용자: 전체 기능 접근
- Guest (URL 공유): Read-only 모드
  - 결과만 볼 수 있음
  - 편집 불가
  - "로그인하여 더 많은 기능 사용" 유도

#### 공유 기능

**Share 버튼**:
- 결과 화면에 "Share" 버튼
- 고유 URL 생성
- Slack/Email 공유
- 팀 내 의사결정 가속화

**우선순위**: P1 (Phase 4)

---

## 10. 마이그레이션 전략

### 10.1 단계별 마이그레이션

#### Phase 1: 인프라 구조 정리 (1주)
1. Repository 패턴 완전 구현
2. Service Layer 리팩토링 (DTO 제거)
3. Controller Layer 리팩토링 (Repository 직접 사용 제거)

#### Phase 2: 불필요한 기능 제거 및 통합 (3일)
1. Detailed Monitoring 축소 (기본 화면에 작은 통계만)
2. Cost Analysis → Golden Case Miner에 통합
3. Drift Detection → AI Judge 결과에 통합
4. Panic Mode → Semantic Firewall로 진화
5. Shadow Routing, Agent Chain Profiler, Archive/Admin/Reports 등 제거

#### Phase 3: 핵심 결과 구현 + Billing + 온보딩 (3주)
1. **결과 1: 새 모델 안전성 검증** (3일)
   - One-Click 버튼
   - Proxy + Snapshot + Replay + Judge 조합
   - 결과 표시 (요약만, Free)

2. **PII Sanitizer 구현** (3일)
   - 2단계 처리 (Regex → Presidio)
   - 사용자 정의 패턴 지원

3. **Free 플랜 제한 구현** (2일)
   - 월 500개 snapshot 제한
   - Judge 호출 제한 (월 100회)
   - 설계도 없음 (텍스트만)

4. **Billing & Usage Tracking 구현** (3일)
   - Billing Service 설계 (`backend/app/services/billing_service.py`)
   - Stripe 연동 (결제 처리)
   - Redis 기반 실시간 사용량 트래킹
   - 소프트 캡 초과 처리 로직

5. **Interactive Onboarding 구현** (3일)
   - Quick Start 가이드 (curl 명령어 표시)
   - Magic Setup Playground (가상 에이전트 시뮬레이터)
   - 첫 Snapshot 생성 시 축하 메시지

6. **Error Namespace 구현** (1일)
   - `X-AgentGuard-Origin` 헤더 추가
   - Proxy/Upstream/Network 에러 구분

7. **클라이언트 타임아웃 가이드라인 구현** (1일)
   - SDK 타임아웃 설정 가이드
   - Circuit Breaker 패턴 적용
   - Health Check 엔드포인트 모니터링

8. **Async Buffering & Batch Write 구현** (2일)
   - Redis Stream 완충지대 구축
   - Batch Write 로직 (1초 단위)
   - DB 쓰기 병목 완전 해결

9. **Snapshot Loss-Tolerant Proxy 구현** (1일)
   - Fail-silent 로직 (Redis 실패 시 Snapshot 저장 포기, 원본 응답 보장)
   - Redis 장애 시에도 프록시 정상 동작

10. **Sandboxed Judge Prompt 구현** (1일)
    - XML 태깅을 통한 입력값 격리
    - Zero-Log API Key 정책
    - Prompt Injection 방어

11. **데이터 수명 주기 (TTL) 구현** (2일)
   - 플랜별 TTL 설정 (Free: 7일, Pro: 30일, Enterprise: 90일)
   - Auto-Archiving 로직 (S3 Glacier)
   - 비용 절감 효과

12. **Click-through Liability Agreement 구현** (1일)
    - 온보딩 시 ToS 동의 화면
    - AI Judge 책임 한계 강조
    - 동의 기록 저장 (법적 증거)

13. **Trust Center 페이지** (2일)
    - 보안 정책 공개 페이지
    - SOC2 로드맵 표시
    - 사이트 하단 및 대시보드 링크

#### Phase 4: Pro 가치 추가 + UX 개선 (5주)
1. **Auto-Mapping 구현** (1주)
   - 동적 분석 (Proxy 트래픽 기반)
   - Railway 스타일 UI

2. **결과 2-4 구현** (1주)
   - 결과 2: 문제 발생 지점 찾기 (설계도 포함)
   - 결과 3: 의존성 파악하기 (설계도 포함)
   - 결과 4: 성능 병목 찾기 (설계도 포함)

3. **Pro 전용 기능** (1주)
   - 자동 알림 (Slack/Email)
   - 상세 분석 (어떤 케이스가 실패했는지)
   - CI/CD 통합 (GitHub Actions)

4. **UX 개선사항** (1주)
   - Streaming UI (Live Stream View, Pulse 인디케이터)
   - 인터랙티브 지도 (미니맵, 노드 확장/축소, 드래그 앤 드롭, Interaction Specification, Viewport Coordinated Focus)
   - Delta UX (Semantic Diff Viewer, 모델 A vs 모델 B)
   - Daily Insight 서머리 (대시보드 최상단 AI 요약 레포트, Z-Score 기반 정밀 인사이트)

5. **사용자 API Key 연동** (3일)
   - 사용자 OpenAI API Key 연결 기능
   - 옵션 1: 우리 리소스 사용
   - 옵션 2: 사용자 API Key 연동 (무제한, 사용자 비용)

6. **Shareable Verdict Link** (2일)
   - 결과 화면에 "Share" 버튼
   - 고유 URL 생성
   - Slack/Email 공유

7. **시스템 상태별 UI 분기 설계** (3일)
   - Cold Start (Empty State)
   - Quota Exceeded (Pro 플랜 유도)
   - Async Judge (Loading 상태)
   - 에이전트 연동 실패
   - 지도 렌더링 실패

8. **Deep Linking 전략** (2일)
   - 특정 Snapshot/Test 결과 고유 URL
   - Guest View (Read-only)
   - 공유 기능

9. **Admin Impersonation & Audit Trail** (3일)
   - 유저 데이터 일시적 뷰어
   - AuditLogs 테이블 설계 및 구현
   - CS 효율성 향상

10. **바이럴 엔진 (레퍼럴) 구현** (3일)
    - Users 테이블 확장 (referred_by, referral_code, referral_credits)
    - 레퍼럴 로직 구현
    - 크레딧 시스템

11. **API 버저닝 전략 구현** (2일)
    - /v1/, /v2/ 체계 명시
    - 하위 호환성 정책
    - 마이그레이션 가이드

12. **CI/CD Skip-on-Failure 구현** (1일)
    - 테스트 타임아웃 설정 (60s)
    - Skip-on-Failure 옵션 (기본값: true)
    - 고객 배포 차단 방지

#### Phase 4: 보안 강화 (1주)
1. 보안 체크리스트 항목 구현
2. 테스트 및 검증

#### Phase 5: 운영 요소 추가 + 커뮤니티 구축 (2주)
1. PostHog 통합
2. Admin Screen 구현
3. 백업 전략 수립
4. Public Agency Map Gallery (3일)
   - 유명 오픈소스 에이전트 구조 시각화
   - "표준" 인식 구축

#### Phase 6: 고급 기능 + 법적 준비 (나중에)
1. **🔍 Auto-Mapping (정적 분석)** - 코드 AST 분석 (옵트인)
2. **🪄 Git-Sync & Control Plane** - UI-to-Code 동기화 (보안/복잡도 고려)
3. **법적/윤리적 준비** - ToS 최종화, DPA 준비, SOC2 인증 계획

### 10.2 코드 정리 원칙

1. **쓸모있는 코드**: 남기기
   - 핵심 기능 (Proxy, Replay, Judge, PII Sanitizer)
   - 인증/인가
   - 기본 모니터링

2. **오류 가능성 있는 코드**: 제거
   - 복잡한 비즈니스 로직 (나중에 다시 구현)
   - 사용되지 않는 엔드포인트
   - 중복된 기능

3. **흐름 개선**
   - 명확한 에러 처리
   - 일관된 로깅
   - 트랜잭션 경계 명확화

---

## 📝 메모: 고려사항 저장

### 아키텍처 원칙
- ✅ 컨트롤러 → 서비스 → 리포지토리 계층 분리
- ✅ 서비스는 RequestDTO 사용 금지 (도메인 모델만)
- ✅ OCP 원칙 준수 (확장에는 열림, 수정에는 닫힘)

### 보안 체크리스트
- CORS/Preflight, CSRF, XSS+CSP, SSRF
- AuthN/AuthZ, RBAC/ABAC + 테넌트 격리
- Validation + SQLi 방어
- RateLimit/Bruteforce
- 쿠키 보안, Secret 관리
- HTTPS/HSTS + 보안 헤더
- AuditLog, 에러 노출 차단
- 의존성 취약점 점검

### 운영 필수 요소
- 에러 로깅 (Sentry)
- 사용자 행동 추적 (PostHog/GA)
- 백업 전략
- Status Page/Health Check
- Admin Screen

### 바이브 코딩 초보가 막히는 지점
- 요구사항 변경 시 구조 무너짐 → OCP 준수로 해결
- 로그인/권한 보안 → 보안 체크리스트로 해결
- DB 설계 → 마이그레이션 전략으로 해결
- 배포 복잡도 → Railway/Vercel 사용
- 에러 처리/관측 → Sentry + 구조화된 로깅
- 성능/비용 → 모니터링 및 최적화

---

## 11. 수익 모델 및 구독 플랜

### 11.1 구독 플랜 상세

#### Free 플랜 (무료)

**제한**:
- 월 500개 snapshot (비용 관리)
- Judge 호출 제한 (월 100회)
- 설계도 없음 (텍스트만)
- 알림 없음
- CI/CD 통합 없음

**기능**:
- 결과 1: "새 모델 안전성 검증" (수동 실행, 결과 요약만)
- 결과 2: "문제 발생 지점 찾기" (수동 실행, 텍스트만)
- 결과 3: "의존성 파악하기" (수동 실행, 텍스트만)
- 결과 4: "성능 병목 찾기" (수동 실행, 텍스트만)

**비용**:
- Infrastructure: $10-30/월
- Database: $0-10/월
- Redis: $0-5/월
- Judge: $2-5/월 (100회 제한)
- **총: $12-50/월 (손실)**

---

#### Pro 플랜 ($79/월)

**제한**:
- 월 10,000개 snapshot
- Judge 호출: 월 100,000회까지 포함 (소프트 캡)
- 초과 시: $0.001/회 또는 알림 후 제한
- Fair Use Policy 적용 (비정상적인 사용 패턴 감지 시 제한)
- 모든 기능

**기능**:
- 결과 1: "새 모델 안전성 검증" (자동 실행, 상세 분석, CI/CD 통합) ⭐
- 결과 2: "문제 발생 지점 찾기" (자동 실행, 설계도 시각화, 자동 알림) ⭐
- 결과 3: "의존성 파악하기" (자동 업데이트, 설계도 시각화) ⭐
- 결과 4: "성능 병목 찾기" (자동 실행, 설계도 시각화, 자동 알림) ⭐

**추가**:
- 설계도 시각화 (Railway 스타일) ⭐
- 자동 알림 (Slack/Email) ⭐
- 상세 분석 (어떤 케이스가 실패했는지) ⭐
- CI/CD 통합 (GitHub Actions) ⭐

**비용**:
- Infrastructure: $20-50/월
- Database: $0-20/월
- Redis: $0-10/월
- Judge: $10-30/월 (정상 사용 범위 내, 월 100,000회 기준)
- **총: $30-110/월**

**수익**: $79/월  
**손익**: -$31 ~ +$49/월 (평균적으로 손익분기점 근처)

**비용 보호**:
- Judge 호출이 월 100,000회를 초과하면 추가 요금 또는 알림 후 제한
- 비정상적인 사용 패턴 (예: 단시간 내 대량 호출) 감지 시 자동 제한
- Fair Use Policy로 악의적 사용 방지

**사용자 API Key 연동 옵션** (Phase 4):
- **전략**: "Free는 우리 리소스(제한적), Pro는 사용자 API Key 연동 가능(무제한 혹은 저렴하게)"
- **옵션 1**: 우리 리소스 사용 (월 100,000회 소프트 캡)
- **옵션 2**: 사용자 API Key 연동 (무제한, 사용자 비용)
  - 사용자가 자신의 OpenAI API Key 연결
  - Judge 호출 비용은 사용자 부담
  - 우리는 인프라 비용만 부담
- **효과**: 장기적으로 우리의 비용 리스크를 유저에게 전가, 유저는 더 싼 값에 사용 가능, 수익성 향상

---

#### Enterprise 플랜 ($499/월)

**제한**:
- 무제한 snapshot
- Judge 호출: 충분히 넉넉한 소프트 캡 (월 1,000,000회)
- 정상적인 사용 범위 내에서 무제한
- 비정상적인 사용 패턴 감지 시 제한
- 모든 기능
- SLA (99.9%)
- 전용 지원

**보안 및 규정 준수**:
- SOC2 Type 1 인증 (12개월 내 계획)
- SOC2 Type 2 인증 (18개월 내 계획)
- 데이터 익명화 강화
- 데이터 로컬 저장 옵션 (Self-hosted, Phase 4)
- GDPR 준수
- 데이터 보존 정책 (고객 요구에 따라 조정 가능)

**비용**:
- Infrastructure: $50-150/월
- Database: $20-50/월
- Redis: $10-30/월
- Judge: $50-150/월 (정상 사용 범위 내)
- **총: $130-380/월**

**수익**: $499/월  
**손익**: +$119 ~ +$369/월 (수익성 확보)

**비용 보호**:
- Judge 호출이 월 1,000,000회를 초과하면 추가 요금 또는 알림 후 제한
- 비정상적인 사용 패턴 감지 시 자동 제한
- Enterprise 고객과의 계약에 따라 사용량 조정 가능

---

### 11.2 전환 트리거

#### 시나리오 A: 자동화 필요
```
1. Free 플랜 사용 중
2. 매번 수동으로 실행해야 함
3. "자동으로 실행하고 싶다면 Pro 플랜으로 업그레이드하세요"
4. 클릭 → Pro 플랜 전환
```

#### 시나리오 B: 설계도 필요
```
1. Free 플랜 사용 중
2. 문제 발생 지점을 텍스트로만 확인
3. "설계도로 시각화하려면 Pro 플랜으로 업그레이드하세요"
4. 클릭 → Pro 플랜 전환
```

#### 시나리오 C: CI/CD 통합 필요
```
1. Free 플랜 사용 중
2. GitHub Actions 통합하고 싶음
3. "CI/CD 통합은 Pro 플랜에서만 가능합니다"
4. 클릭 → Pro 플랜 전환
```

#### 시나리오 D: Snapshot 한도
```
1. Free 플랜 사용 중
2. 500개 한도 초과
3. "Pro 플랜으로 업그레이드하거나 오래된 snapshot을 삭제하세요"
4. 기능 제한 때문에 Pro 플랜 전환
```

---

### 11.3 Traction 검증 전략

#### Phase 1: MVP 출시 (2주)
- 목표: 10개 팀이 사용
- Free 플랜만 제공
- Traction 데이터 수집

**검증 항목**:
1. "One-Click" 기능 사용률
2. 가장 많이 사용되는 결과
3. Free → Pro 전환율
4. 사용자 피드백

#### Phase 2: Traction 분석 (1주)
- 분석: 어떤 결과가 가장 많이 사용되는가?
- 개선: 사용률이 낮은 기능 제거, 높은 기능 강화

#### Phase 3: Pro 플랜 출시 (1주)
- 목표: Free → Pro 전환율 20% 이상
- Pro 플랜 사용자 5명 이상
- MRR $400 이상

---

### 11.4 법적/윤리적 고려사항

> **핵심 원칙**: "만약 우리 Production Guard가 정상적인 답변을 차단해서 고객사가 금전적 손해를 입었을 때, 혹은 반대로 우리가 막지 못해 사고가 났을 때의 책임 소재가 불명확합니다."

#### Terms of Service (ToS) 핵심 조항

**책임 한계**:
- AgentGuard는 "보조 도구"이며 최종 책임은 사용자에게 있음
- AgentGuard는 AI 응답의 정확성이나 적절성을 보장하지 않음
- 사용자는 AgentGuard의 결과를 검토하고 최종 결정을 내려야 함

**서비스 중단**:
- AgentGuard 서비스 중단 시 Fail-open 전략으로 원본 LLM으로 자동 전환
- 서비스 중단에 대한 책임은 제한됨 (최대 월 구독료 범위)

**데이터 소유권**:
- 사용자의 데이터는 사용자 소유
- 언제든지 Export 가능
- 데이터 삭제 요청 시 즉시 처리

#### DPA (Data Processing Agreement) 준비

**EU AI Act 대응**:
- 데이터 처리 위탁 계약서 준비
- GDPR 준수
- 데이터 로컬 저장 옵션 (Self-hosted)

**Enterprise 계약**:
- DPA 포함 계약서 템플릿
- SOC2 Type 1/2 인증 계획 명시
- 데이터 익명화 옵션

**준비 계획**: Phase 6 (Enterprise 준비 시)

**우선순위**: P1 (Enterprise 고객 확보 전 필수)

---

### 11.5 바이럴 엔진 설계 (Referral Logic & Attribution)

> **핵심 원칙**: "B2B SaaS 성장의 치트키인 레퍼럴 프로그램이 빠졌습니다. '누가 우리를 추천했는지' 추적할 방법이 필요합니다."

#### 레퍼럴 프로그램 구조

**Users 테이블 확장**:
- `referred_by` 컬럼 추가 (추천한 사용자 ID)
- `referral_code` 컬럼 추가 (고유 추천 코드)
- `referral_credits` 컬럼 추가 (추천으로 받은 크레딧)

**레퍼럴 로직**:
1. 가입 시 친구 초대 코드 입력
2. 코드 입력 시 `referred_by`에 추천인 ID 저장
3. 추천인에게 Pro 플랜 1개월 무료 제공
4. 신규 가입자에게도 Pro 플랜 1개월 무료 제공

#### 크레딧 시스템

**크레딧 지급 규칙**:
- 추천인: 친구가 Pro 플랜으로 업그레이드 시 1개월 무료
- 신규 가입자: 추천 코드 입력 시 1개월 무료
- 크레딧은 Pro 플랜 구독료에 자동 적용

**구현**:
```python
# 가입 시
if referral_code:
    referrer = get_user_by_referral_code(referral_code)
    user.referred_by = referrer.id
    user.referral_credits = 1  # 1개월 무료
    referrer.referral_credits += 1  # 추천인도 1개월 무료
```

#### Attribution 추적

**추천 경로 추적**:
- 가입 시점의 추천 코드 기록
- Pro 플랜 전환 시 추천인에게 크레딧 지급
- 추천 통계 대시보드 (관리자용)

**효과**:
- 바이럴 루프 강화
- 성장 가속화
- CAC (Customer Acquisition Cost) 감소

**우선순위**: P1 (Phase 4)

---

## 12. 미국 시장 진출 전략 (어사이드 사례 기반)

> **핵심 교훈**: "미국 진출"이란 단어를 쓰는 순간부터 이미 안 될 게임을 시작한다.  
> **실전 원칙**: 미국은 글로벌이 아니라 "로컬 사회"다. 레퍼런스와 신용이 없으면 배타적이다.

---

### 12.1 핵심 원칙

> **"미국 진출"이란 단어를 쓰는 순간부터 이미 안 될 게임을 시작한다.**  
> **미국은 글로벌이 아니라 "로컬 사회"다. 레퍼런스와 신용이 없으면 배타적이다.**

#### 마인드셋 변화
- ❌ "미국 진출" → ✅ "미국에서 만들기"
- ❌ 한국 매출 의존 → ✅ 미국 매출 먼저
- ❌ 글로벌 마케팅 → ✅ 미국 시장 집중

#### 제품 전략
- **전부 0에서 언러닝**: 한국 경험을 잊고 미국 시장에 맞춰 재검증
- **문제 정의부터 다시**: 미국 고객과 직접 대화하며 문제 재정의
- **새로운 제품 만들기**: 한국 제품을 가져가지 말고 미국에서 처음부터

#### GTM 전략
- **ICP가 모이는 곳으로**: AI Product Engineer → 샌프란시스코
- **트위터 활용**: 커뮤니티 형성
- **퀄리티 있는 데모 비디오**: 바이럴 보장
- **세일즈 팀은 나중에**: 파운더가 미국에 있고, 제품도 거기서 만들고, 고객이 많이 생기고 있을 때

### 12.2 실전 체크리스트

#### ✅ 해야 할 것
- 최소 1년 이상 미국에서 보내기
- 창업자가 직접 가서 헤매기
- 문제 정의부터 다시 하기
- 새로운 제품 만들기
- ICP가 모이는 곳으로 가기 (AI → SF)
- 트위터 활용, 퀄리티 있는 데모 비디오

#### ❌ 하지 말아야 할 것
- 프로덕트 런칭, 실리콘밸리 투어
- 일주일만 출장
- 프로덕트헌트 런칭
- 손으로 정성스럽게 콜드메일 쓰기
- 현재 세일즈 팀 채용

### 12.3 AI 골드러시 시대

> **브체스키 (YC)**: "AI 골드러시는 시작됐다. 이번이 훨씬 더 크다."

**기회**: 앱스토어 상위 100개 앱 중 AI 네이티브 앱은 10개도 안 됨  
**현실**: 이미 많은 파운더들이 몰려들고 있음, 경쟁 수준이 미친 수준  
**전략**: 틈은 언제나 있음, 다만 보기까지 1-2년은 사회될 각오 필요
- [ ] 고객이 많이 생기고 있을 때 세일즈 팀 채용

---

## 13. 마케팅 전략 ("지도를 미끼로 던지기")

> **상세 내용**: [guides/MARKETING_GUIDE.md](./guides/MARKETING_GUIDE.md) 참고

> **핵심 원칙**: "지도를 미끼로 던지고, 보안을 뿌리로 박으세요"

### 13.1 시각화를 마케팅 전면에

#### 1. Railway 스타일 설계도 시각화

**전략**:
- 시각화 (Railway Map)를 마케팅 전면에 배치
- YC 파트너와 초기 엔지니어들을 유혹하는 도구
- "섹시한" 기능으로 첫인상 만들기

**실행**:
- 데모 비디오: Railway 스타일 설계도 시각화
- 트위터: 설계도 스크린샷으로 바이럴
- YC 피칭: "에이전트 구조를 한눈에 보세요"로 시작

#### 2. One-Click 결과 강조

**전략**:
- 사용하기 쉬운 UI 강조
- "클릭 한 번으로 끝" 메시지
- 복잡한 기능을 단순한 결과로 표현

**실행**:
- 랜딩 페이지: One-Click 결과 데모
- 데모 비디오: One-Click 사용 시나리오
- 트위터: One-Click 결과 스크린샷

#### 3. 퀄리티 있는 데모 비디오

**전략**:
- 퀄리티 있는 비디오를 만들면 바이럴 보장
- 트위터에 올리면 효과적
- YC 배치 중 절반은 비디오그래퍼 찾아다님

**실행**:
- 비디오그래퍼 고용
- 퀄리티 있는 데모 비디오 제작
- 성능 지표 포함 (0.1초 내외 레이턴시 시각화)

### 13.2 마케팅 메시지

#### Before vs After

**Before**: "AI 에이전트 테스트 플랫폼"  
**After**: "에이전트 구조를 한눈에 보고, 문제를 즉시 찾고, 배포를 안전하게"

#### 핵심 메시지

1. **시각화**: "에이전트 구조를 한눈에 보세요"
2. **One-Click**: "클릭 한 번으로 문제를 찾으세요"
3. **Production Guard**: "배포를 안전하게 하세요"

#### 4. Public Agency Map Gallery (Moat의 현금화)

> **핵심 원칙**: "경쟁사가 우리 지도를 베끼는 것은 쉽습니다. 하지만 **'우리 지도가 표준이 되는 것'**은 어렵습니다."

**전략**:
- 유명한 오픈소스 에이전트(예: AutoGPT)의 구조를 우리 지도로 공개
- "지도는 AgentGuard로 보는 게 표준이다"라는 인식을 시장에 박기
- Public Gallery에서 누구나 볼 수 있게 함

**실행**:
- AutoGPT, LangChain 등 유명 에이전트의 구조 시각화
- Public Gallery 페이지 구축
- 트위터/블로그에 "AutoGPT 구조를 한눈에" 같은 콘텐츠

**효과**:
- 브랜드 인지도 향상
- SEO 최적화 (검색 시 AgentGuard가 나오게)
- "표준"으로 인식되어 경쟁 우위 확보

**우선순위**: P2 (Phase 5 - 커뮤니티 구축 시)

---

## 14. YC 피칭 전략

### 14.1 "왜 지금인가?" (Why Now?)

#### ✅ 명확한 답

1. **AI 골드러시 시대**
   - 브체스키: "AI 골드러시는 시작됐다"
   - 앱스토어 상위 100개 앱 중 AI 네이티브 앱은 10개도 안 됨
   - 기회가 너무 많음

2. **Silent Regressions 문제가 급증**
   - "머리에 불이 붙은 듯한 시급한 문제"
   - 모델/프롬프트 변경 시 성능 저하를 감지하기 어려움
   - "Vibe-testing" → "Scientific reliability" 전환 필요

3. **LangSmith는 관찰만, 우리는 제어**
   - LangSmith: "관찰(Observability)" 모델
   - AgentGuard: "제어 및 회귀 검증(Control & Regression)" 모델

### 14.2 "왜 너희인가?" (Why You?) - 개선 필요

#### 기술적 Moat

1. **프로덕션 트래픽 재사용의 네트워크 효과**
   - 사용자가 많을수록 더 많은 Golden Case 생성
   - 더 많은 Golden Case = 더 정확한 검증
   - LangChain이 따라하기 어려운 데이터 네트워크 효과

2. **실시간 방화벽의 기술적 장벽**
   - 스트리밍 병렬 검사 기술
   - 0.1초 내외 레이턴시 달성 (기술적 복잡도)
   - LangChain이 쉽게 따라하기 어려운 기술

3. **에이전트 전용 관제탑 선점**
   - 개발자의 워크플로우를 독점
   - 선점 효과: 먼저 들어온 도구가 워크플로우에 고착됨

#### 실행력 증명

1. **데모 비디오**
   - 퀄리티 있는 데모 비디오로 증명
   - 성능 지표 포함 (0.1초 내외 레이턴시)

2. **벤치마크 테스트 결과**
   - 코드 레벨에서 증명
   - 성능 테스트 결과 공개

3. **빠른 개발 속도**
   - Phase별 명확한 계획
   - 실행력 입증

### 14.3 피칭 구조

#### 1. 문제 (30초)
- Silent Regressions (머리에 불이 붙은 문제)
- 모델/프롬프트 변경 시 성능 저하를 감지하기 어려움

#### 2. 해결책 (1분)
- Production Guard (제어 및 회귀 검증)
- One-Click 결과 제공
- 시각화 (Railway Map) 데모

#### 3. 차별화 (30초)
- LangSmith는 관찰, 우리는 제어
- 프로덕션 트래픽 재사용
- 실시간 방화벽

#### 4. Moat (30초)
- 네트워크 효과
- 기술적 장벽
- 선점 효과

#### 5. 실행력 (30초)
- 데모 비디오
- 벤치마크 테스트 결과
- 빠른 개발 속도

---

## 🎯 다음 단계

1. ✅ 이 설계 문서 검토 및 승인 (결과 중심 접근 반영 완료)
2. **Phase 1**: 인프라 구조 정리 (Repository 패턴 완전 구현)
3. **Phase 2**: 불필요한 기능 제거 및 통합
4. **Phase 3**: 핵심 결과 구현 + Production Guard 기초 + Fail-open + Export (2.5주)
   - 결과 1: "새 모델 안전성 검증" (3일)
   - PII Sanitizer 구현 (3일) - 레이턴시 목표: < 50ms, 벤치마크 테스트 포함
   - Production Guard 기초 (4일) - 실시간 방화벽 기본 구현, 레이턴시 목표: < 100ms, 벤치마크 테스트 포함
   - Fail-open 전략 구현 (2일) - SDK 미들웨어, Circuit Breaker, Health Check
   - 데이터 Export 기능 (1일) - JSON/CSV Export, 데이터 소유권 명시
   - Free 플랜 제한 구현 (2일)
5. **Phase 4**: Pro 가치 추가 + Self-hosted + 복잡도 관리 + Judge 신뢰도 (5주)
   - Auto-Mapping 구현 (1주) - 마케팅 전면에 사용, 복잡도 관리 포함 (Sub-graph, Focus Mode, 필터링)
   - Production Guard 완성 (1주) - 실시간 방화벽, CI/CD 통합
   - 결과 2-4 구현 (1주)
   - Judge 신뢰도 강화 (1주) - Alignment Score, Feedback Loop, 메타 검증
   - Self-hosted 옵션 (기본) (1주) - Docker Compose 기반, Enterprise 전용
6. **Phase 5**: Retention 강화 + 커뮤니티 구축 (3주)
   - 실시간 대시보드 (1주) - 매일 확인하는 습관 형성
   - 자동 알림 강화 (1주) - Slack/Email 통합 (Resend 구현)
   - 커뮤니티 전략 (1주) - 오픈소스 루브릭, Rule Market, Public Benchmarks
7. **Phase 6**: 보안 강화 및 운영 요소 추가
   - SOC2 Type 1 준비 (6개월)
   - 데이터 익명화 강화
   - Fair Use Policy 구현
   - 비정상적인 사용 패턴 감지 시스템
   - 성능 벤치마크 테스트 및 문서화
8. **Phase 7**: 미국 시장 진출 준비 (어사이드 사례 기반)
9. **Phase 8**: Enterprise 준비 + Multi-Region (12-18개월)
   - SOC2 Type 1 인증 (12개월 내)
   - SOC2 Type 2 인증 (18개월 내)
   - Self-hosted 옵션 고급 버전 (Kubernetes)
   - Multi-Region 데이터 거주 정책 (AWS Seoul/Oregon/Frankfurt 선택 옵션)
   - 데이터 로컬 저장 옵션

---

## 📚 관련 문서

> **실제 코드 기반 문서**: 코드 상태는 [STATUS.md](./STATUS.md)를 참조하세요.

- [STATUS.md](./STATUS.md) ⭐ - 현재 구현 상태 (코드 기반)
- [guides/API_REFERENCE.md](./guides/API_REFERENCE.md) - API 문서 및 스펙
- [guides/DATABASE_SCHEMA.md](./guides/DATABASE_SCHEMA.md) - 데이터베이스 스키마
- [PHASE3_CHECKLIST.md](./PHASE3_CHECKLIST.md) - Phase 3 완료 체크리스트

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**작성자**: AI Assistant + User
