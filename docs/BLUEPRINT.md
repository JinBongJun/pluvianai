# Synpira Master Blueprint

> **Updated: 2026-02-02** (브랜드: Synpira, 슬로건 및 Toxic Lab 팔레트 반영)

---

## 핵심 포지셔닝

### Vision
**Synpira**는 **"the test lab for agents"** — LLM/Agent 테스트 전용 서비스입니다.

> **Synpira — the test lab for agents.**

### 핵심 가치
| 하지 않는 것 | 하는 것 |
|--------------|---------|
| 에이전트 빌더 | **테스트 플랫폼** |
| 코드 생성/내보내기 | **실험 및 검증** |
| 실시간 차단 (Firewall) | **사전 배포 테스트** |
| 복잡한 점수 평가 | **명확한 상태 판정** |

### 한 줄 메시지
```
"Synpira — the test lab for agents."
"SDK 한 줄 연동 → 에이전트 구조 자동 시각화 → 원클릭 테스트"
```

---

## 타겟 고객

### 1차 타겟
- **운영 중인 LLM 제품을 가진 팀**
  - SaaS 제품
  - 사내 Agent
  - 고객 대응 챗봇
  - 자동 리포트 / 분석 Agent
- **핵심 페인포인트**: "모델/프롬프트 바꿀 때마다 불안한 팀"

### 타겟 아님
- 연구용 벤치마크
- 모델 학습/파인튜닝
- 에이전트 빌딩 도구 필요한 팀

---

## 핵심 사용자 플로우

### Step 1: SDK 연동 (한 줄)
```python
import agentguard
agentguard.init(api_key="...")
```

### Step 2: Live View에서 박스 확인
- 트래픽이 쌓이면 → 에이전트 박스 자동 생성
- Railway 스타일로 박스만 표시 (화살표 없음)
- 사용자가 원하면 화살표 직접 추가 가능

### Step 3: Test Lab에서 실험
- Live View에서 박스 복사 또는 직접 생성
- 화살표로 연결하여 체인 구성
- 개별 테스트 또는 체인 테스트 실행

### 두 가지 섹션

| Live View (실제 섹션) | Test Lab (테스트 섹션) |
|----------------------|------------------------|
| 박스만 자동 감지 | 박스 + 화살표 자유롭게 |
| 읽기 전용 | 모든 것 수정 가능 |
| 실제 트래픽 모니터링 | 실험 및 테스트 |
| 화살표는 선택적 추가 | 체인 테스트 가능 |

---

## Killer Features

### 1. Live View + Test Lab (Railway 스타일)

#### Live View (실제 섹션)
| 항목 | 내용 |
|------|------|
| **자동 감지** | 박스(에이전트)만 자동 감지, **화살표 없음** |
| **수정** | 읽기 전용 (화살표는 선택적으로 사용자가 추가 가능) |
| **용도** | 실제 트래픽 모니터링 |

```
SDK 연동 → 트래픽 수집 → 박스만 자동 생성 (화살표 없음)

    ┌───────────┐        ┌───────────┐
    │ Classifier│        │  Writer   │
    │  gpt-4o   │        │  gpt-4o   │
    │  45 calls │        │  120 calls│
    └───────────┘        └───────────┘

    ┌───────────┐        ┌───────────┐
    │ Analyzer  │        │ Summarizer│
    │  gpt-4o   │        │  gpt-4o   │
    │  67 calls │        │  30 calls │
    └───────────┘        └───────────┘

(화살표는 사용자가 원하면 직접 연결)
```

#### Test Lab (테스트 섹션)
| 항목 | 내용 |
|------|------|
| **박스** | Live View에서 복사 또는 직접 생성 |
| **화살표** | 사용자가 자유롭게 연결 |
| **용도** | 실험, 체인 테스트 |

```
Test Lab에서 사용자가 화살표 연결:

    ┌───────────┐      ┌───────────┐      ┌───────────┐
    │ Classifier│ ───→ │  Writer   │ ───→ │ Summarizer│
    └───────────┘      └───────────┘      └───────────┘

→ 체인 테스트 실행 가능
```

### 2. Chain Testing (체인 테스트)
| 항목 | 내용 |
|------|------|
| **Problem** | 여러 에이전트가 연결된 전체 흐름 테스트 어려움 |
| **Solution** | Test Lab에서 화살표로 연결 → 순서대로 실행 |
| **핵심** | A의 출력 → B의 입력 → C의 입력... 자동 연결 |

**플로우:**
```
Input: "고객님, 환불 요청드립니다"
    │
    ▼
[Classifier] → "category: refund"
    │
    ▼
[Writer] → "안녕하세요, 환불 요청을 접수했습니다..."
    │
    ▼
[Summarizer] → "[요약] 환불 요청 접수 완료"
    │
    ▼
Signal 평가 → SAFE / NEEDS_REVIEW / CRITICAL
```

### 3. 모델 변경 테스트 (Test Lab)
| 항목 | 내용 |
|------|------|
| **Problem** | 모델 바꿀 때마다 "기도하고 배포" |
| **Solution** | Snapshot을 새 모델로 재실행 |
| **핵심** | **프롬프트는 그대로, 모델만 변경** |

**플로우:**
```
1. 실제 프로덕션 Snapshot 선택 (100개, 1000개 등)
2. 테스트할 모델 선택 (gpt-4 → gpt-4o-mini)
3. 반복 실행 (100~1000회)
4. Signal 기반 자동 평가
5. 결과: SAFE / NEEDS_REVIEW / CRITICAL
```

### 4. Live Sampling (비용 최적화 테스트) ⭐
| 항목 | 내용 |
|------|------|
| **Problem** | 100% 재실행 시 API 비용 부담 |
| **Solution** | **실제 트래픽의 5~10%만 샘플링**하여 비동기 비교 실행 |
| **핵심** | 유저는 A를 받지만, 뒤에서 B도 실행하여 차이 비교 |

**플로우:**
```
1. Proxy가 유저 요청을 Model A로 전달 (정상 응답)
2. 동시에 5% 확률로 Model B에도 비동기 호출 수행
3. 두 응답(A, B)을 모두 기록하고 Signal Engine으로 비교
4. 미묘한 행동 드리프트(Behavior Drift)를 비용 효율적으로 포착
```

### 3. 프롬프트 변경 테스트 (Test Lab)
| 항목 | 내용 |
|------|------|
| **Problem** | 튜닝 프롬프트 수정 후 성능 변화 확인 어려움 |
| **Solution** | 실제 입력 프롬프트들로 새 튜닝 프롬프트 실행 |
| **핵심** | **모델은 그대로, 튜닝 프롬프트만 변경** |

**플로우:**
```
1. 변경할 튜닝 프롬프트 (System Prompt) 입력
2. 실제 사용자 입력 Snapshot 선택
3. 반복 실행
4. Signal 기반 자동 평가
5. 결과 비교
```

### 4. Signal 기반 감지 (LLM Judge 아님)
| 항목 | 내용 |
|------|------|
| **Problem** | LLM-as-Judge = "자기 만족", 점수 애매함 |
| **Solution** | 규칙 + Signal 기반 명확한 판정 |

**기본 Signal들:**
```
- Hallucination detector (임베딩 기반)
- 응답 길이 변화
- 특정 키워드 포함/제외
- JSON schema 유효성
- Latency spike
- 에러 발생률
- Semantic similarity (코사인 유사도)
```

**결과 형식:**
| 기존 | AgentGuard |
|------|------------|
| 점수 (0-100) | 상태 |
| "78.5점" | `SAFE` / `NEEDS_REVIEW` / `CRITICAL` |

### 5. Worst Prompt Set (자동 수집)
| 항목 | 내용 |
|------|------|
| **Problem** | Golden dataset 직접 만들기 귀찮음 |
| **Solution** | 실패/의심 케이스 자동 수집 & 클러스터링 |
| **가치** | "이거 돌리면 불안한 거 다 나오네" |

**자동 수집 대상:**
- Signal에서 CRITICAL/NEEDS_REVIEW 판정된 케이스
- 긴 응답 시간 케이스
- 에러 발생 케이스
- 사용자가 수동으로 추가한 케이스

**활용:**
- 모델 변경 전 Worst Set으로 빠른 회귀 테스트
- 새로운 실패 케이스 자동 추가 (Data Flywheel)

### 6. Human-in-the-loop (사람 검토)
| 항목 | 내용 |
|------|------|
| **Problem** | 자동화만으로 한계, subtle 변화 못 잡음 |
| **Solution** | NEEDS_REVIEW 케이스에 대해 사람 최종 판정 |

**워크플로우:**
```
자동화                         사람
├── Signal 기반 평가           ├── NEEDS_REVIEW 케이스 검토
├── SAFE/CRITICAL 자동 분류    ├── OK / FAIL 판정
└── 의심 케이스 리스트업        └── Worst Set에 추가 여부 결정
```

### 7. Custom Signals (커스텀 평가 기준)
| 항목 | 내용 |
|------|------|
| **Problem** | 도메인 특화 평가 기준 필요 |
| **Solution** | 사용자가 직접 Signal 규칙 추가 |

**예시:**
- "환불 정책을 정확히 말하는지" (특정 키워드 포함)
- "응답이 3문장 이하인지" (길이 제한)
- "JSON 형식이 맞는지" (스키마 검증)
- "특정 단어를 사용하지 않는지" (금지어)

### 8. Snapshot 관리
| 항목 | 내용 |
|------|------|
| **기능** | 모든 Snapshot 보기/삭제 가능 |
| **데이터** | System Prompt + User Input + Response + 메타데이터 |
| **GDPR** | 사용자 데이터 소유권 보장 |

### 9. Playground Mode (SDK 없이 테스트)
| 항목 | 내용 |
|------|------|
| **대상** | 아직 에이전트를 안 만든 사용자 |
| **기능** | System Prompt + User Input 직접 입력 → 테스트 |
| **특징** | SDK 연동 없이 바로 테스트 가능 |
| **활용** | 프롬프트 초안 검증, 모델 비교 |

**지원 시나리오:**
| 시나리오 | 대응 |
|----------|------|
| 아직 안 만듦 | Playground에서 직접 테스트 |
| 만드는 중 | SDK 연동 (development mode) |
| 이미 운영 중 | SDK 연동 (production mode) |

---

## 삭제된 기능 (테스트 전용 포커스)

| 삭제 기능 | 이유 |
|----------|------|
| Quality (품질 점수) | 점수보다 상태 판정이 명확함 |
| Firewall (실시간 차단) | 테스트 전용이므로 실시간 차단 불필요 |
| Time Machine | 복잡성 대비 가치 낮음 |
| Drift 독립 기능 | Alerts + Worst Prompts로 흡수 |

**Drift 처리:**
- 정기 테스트 → Alerts로 알림
- 성능 저하 케이스 → Worst Prompts에 자동 저장

---

## UI 탭 메뉴 구조

```
┌─────────────────────────────────────────────────────────────┐
│  AgentGuard  │  Live View │ Test Lab │ Playground │         │
│              │  API Calls │ Signals  │ Worst Prompts │      │
│              │  Reviews   │ Alerts   │ Settings             │
└─────────────────────────────────────────────────────────────┘
```

### 각 탭 역할

| 탭 | 역할 |
|----|------|
| **Live View** | 실제 섹션 - 자동 감지된 박스, 읽기 전용 |
| **Test Lab** | 테스트 섹션 - 박스+화살표 자유 구성, 체인 테스트 |
| **Playground** | SDK 없이 직접 테스트 |
| **API Calls** | Snapshot 목록, 상세 보기, 삭제 |
| **Signals** | Signal 규칙 관리, 커스텀 Signal 추가 |
| **Worst Prompts** | 자동 수집된 문제 케이스 관리 |
| **Reviews** | Human-in-the-loop 검토 대기열 |
| **Alerts** | 알림 설정, Drift 감지 설정 |
| **Settings** | 프로젝트 설정, API Key 관리 |

---

## Test Lab 상세

### 캔버스 UI

```
┌─────────────────────────────────────────────────────────────┐
│  🧪 Test Lab                     [박스 추가] [화살표 모드]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│      ┌───────────┐         ┌───────────┐                   │
│      │ Classifier│ ───────→│  Writer   │                   │
│      │  [편집]   │         │  [편집]   │                   │
│      └───────────┘         └───────────┘                   │
│                                   │                         │
│                                   ▼                         │
│                            ┌───────────┐                   │
│                            │ Summarizer│                   │
│                            │  [편집]   │                   │
│                            └───────────┘                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  테스트 유형:                                                │
│  ○ 개별 테스트 (박스 하나 선택 → 모델 변경 또는 프롬프트 변경)│
│  ● 체인 테스트 (연결된 전체 흐름 테스트)                     │
│                                                             │
│  [▶ 테스트 실행]                                             │
└─────────────────────────────────────────────────────────────┘
```

### 박스 편집 시

```
┌─────────────────────────────────┐
│  📦 Agent 편집                  │
├─────────────────────────────────┤
│  이름: [Classifier          ]   │
│  모델: [gpt-4o            ▼]    │
│                                 │
│  System Prompt:                 │
│  ┌─────────────────────────┐    │
│  │ You are a classifier... │    │
│  └─────────────────────────┘    │
│                                 │
│  [취소]  [저장]                  │
└─────────────────────────────────┘
```

---

## 경쟁사 대비 차별화

| 항목 | LangSmith/LangFuse | AgentGuard |
|------|---------------------|------------|
| 목적 | 관측 (Observability) | **사전 배포 테스트** |
| 평가 | LLM-as-Judge | **Signal 기반 규칙** |
| 결과 | 점수 | **상태 판정** |
| 테스트셋 | 직접 만들기 | **자동 수집** |
| 에이전트 구조 | 수동 설정 | **자동 추출** |
| 포지션 | 빌드 + 관측 | **테스트 전용** |

---

## Pricing Strategy

### Tier 구조
| Tier | 가격 | 기능 |
|------|------|------|
| **Free** | $0 | 기본 Signal 5개, 월 100회 테스트, 자동 맵 |
| **Pro** | $29/월 | 무제한 테스트, 커스텀 Signal, 알림 연동 |
| **Team** | $79/월 | 팀 협업, CI/CD 연동, 우선 지원 |
| **Enterprise** | 문의 | Self-hosted, SLA, 전담 지원 |

### 비즈니스 모델
- **Managed Mode**: AgentGuard API Key 사용, AgentGuard가 비용 청구
- **BYOK Mode**: 사용자 API Key 사용, 사용자가 직접 LLM 비용 부담

---

## Implementation Phases

### Phase 1: MVP (현재)
- [x] 기본 Proxy 및 Snapshot 저장
- [x] 기본 Replay 기능
- [ ] Auto-Mapping (트래픽 기반)
- [ ] Signal 기반 평가 (기본 5개)
- [ ] Worst Prompt Set 자동 수집

### Phase 2: 핵심 완성
- [ ] 커스텀 Signal 추가 UI
- [ ] Human-in-the-loop 리뷰 UI
- [ ] 테스트 모드 (에이전트별 실험)
- [ ] Before/After diff UI
- [ ] SDK (Python, Node)

### Phase 3: 확장
- [ ] CI/CD 연동 (GitHub Actions)
- [ ] Slack/Email 알림
- [ ] 팀 협업 기능
- [ ] BYOK (Bring Your Own Key)

### Phase 4: Enterprise
- [ ] Self-hosted 버전
- [ ] SOC2 인증
- [ ] Multi-region 지원

---

## Success Metrics

### MVP 성공 기준
- [ ] 10개 팀 베타 사용
- [ ] 3개 팀 유료 전환
- [ ] NPS 40+

### 6개월 목표
- [ ] 100개 팀 사용
- [ ] MRR $5,000+

---

## Related Documents
- [DETAILED_DESIGN.md](./DETAILED_DESIGN.md) - 기술 상세 설계
- [SCHEMA_SPEC.md](../SCHEMA_SPEC.md) - API 스키마 명세

---

*Last Updated: 2026-01-31*
