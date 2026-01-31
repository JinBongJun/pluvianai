# 🗺️ AgentGuard Master Blueprint

> **Updated: 2026-01-27** (Reddit 시장 조사 기반 방향 재정립)

---

## 🎯 핵심 포지셔닝

### Vision
AgentGuard는 **"LLM 배포 안전성 감지 서비스"** 입니다.

> "운영 중인 LLM/Agent가 망가지지 않았는지 자동으로 잡아주는 회귀/퇴화 감지"

### 핵심 가치
| ❌ 하지 않는 것 | ✅ 하는 것 |
|---------------|-----------|
| 정확도 측정 | **퇴화 감지** |
| 정답 판별 | **상태 판정** |
| 복잡한 평가 | **빠른 시작** |

### 한 줄 메시지
```
"LangSmith 복잡해서 안 쓰시죠? 우리 거 쓰세요, 5분이면 됩니다."
"그냥 배포하고 기도하시죠? 기도 대신 테스트하세요, 쉬워요."
```

### ❌ 하면 안 되는 포지션
- "LangWatch 비슷한 거"
- "LLM 평가 도구"
- "에이전트 테스트 프레임워크"
→ 이미 과포화 + 비교당함

---

## 👥 타겟 고객

### 1차 타겟 (가장 돈 됨)
- **운영 중인 LLM 제품을 가진 팀**
  - SaaS 제품
  - 사내 Agent
  - 고객 대응 챗봇
  - 자동 리포트 / 분석 Agent
- **핵심 페인포인트**: "모델 바꿀 때마다 불안한 팀"

### ❌ 타겟 아님
- 연구용
- 벤치마크 집착
- 모델 비교 놀이

---

## 🚀 Killer Features

### 1. ⚡ Shadow Replay (핵심 기능)
| 항목 | 내용 |
|------|------|
| **Problem** | 모델/프롬프트 바꿀 때마다 "기도하고 배포" |
| **Solution** | 프로덕션 트래픽을 새 모델로 재실행, 자동 비교 |
| **차별화** | SDK 3줄 연동, 비용 효율적 샘플링, Before/After diff UI |

### 2. 📦 "최악 프롬프트 세트" 자동 관리
| 항목 | 내용 |
|------|------|
| **Problem** | Golden dataset 50-100개 직접 만들기 귀찮음 |
| **Solution** | 실패/의심 케이스 자동 수집 & 클러스터링 |
| **가치** | "이거 돌리면 불안한 거 다 나오네" |

**자동 수집 대상:**
- 실패 응답
- 긴 응답
- Hallucination 의심
- 고객 클레임
- Refusal 증가

### 3. 🔍 Signal 기반 감지 (LLM Judge ❌)
| 항목 | 내용 |
|------|------|
| **Problem** | LLM-as-Judge = "자기 만족", entropy multiplying, 점수 애매함 |
| **Solution** | Rule + Signal 기반 명확한 판정 |

**감지 Signal:**
```
- Hallucination detector
- Answer length 변화
- Refusal 증가
- JSON schema break
- Latency spike
- Tool misuse
```

**결과 형식:**
| ❌ 기존 | ✅ 우리 |
|--------|---------|
| 점수 (0-100) | 상태 |
| "78.5점" | `SAFE` / `REGRESSED` / `CRITICAL` |

### 4. 👤 Human-in-the-loop 워크플로우
| 항목 | 내용 |
|------|------|
| **Problem** | 자동화만으로 한계, subtle 변화 못 잡음 |
| **Solution** | 자동 감지 + 사람 최종 결정 |

**워크플로우:**
```
자동화                          사람
├── 트래픽 수집                 ├── 최종 배포 결정
├── Signal 감지                 ├── "OK" / "배포 중단"
├── 상태 판정                   └── 피드백 → 기준 업데이트
└── 의심 케이스 리스트업
```

### 5. 🎛️ 커스텀 Signal
| 항목 | 내용 |
|------|------|
| **Problem** | 도메인 특화 평가 기준 필요 |
| **Solution** | 쉬운 UI로 커스텀 Signal 추가 |

**예시:**
- "환불 정책 맞게 말하는지"
- "특정 키워드 포함 여부"
- "톤이 친절한지"

### 6. 📡 Drift 모니터링
| 항목 | 내용 |
|------|------|
| **Problem** | Provider가 몰래 업데이트 → 어느 날 갑자기 품질 변함 |
| **Solution** | 정기 스케줄 실행 + 알림 |

---

## 🆚 경쟁사 대비 차별화

| 항목 | LangWatch/LangSmith | AgentGuard |
|------|---------------------|------------|
| 목적 | 관측 & 평가 | **배포 안전성** |
| 기준 | 점수/지표 | **퇴화 여부** |
| Judge | LLM 중심 | **Signal 중심** |
| 설정 | 복잡함 | **5분 온보딩** |
| 테스트셋 | 직접 만들기 | **자동 수집** |
| 결과 | 애매한 점수 | **명확한 상태** |
| 사용자 | LLM 엔지니어 | **프로덕트/플랫폼 팀** |
| 데이터 | 없음 | **검증된 최악 케이스 공유** |

---

## 🔧 기술적 방향

### LLM-as-Judge ❌ → Signal 기반 ✅

**Reddit에서 확인된 LLM-as-Judge 문제점:**
- "entropy multiplying" - 점점 복잡해짐
- "satisfy themselves" - 자기 출력을 좋게 평가
- 신뢰하기 어려움

**해결책:**
- Rule + Signal 기반 판정
- 명확한 기준 (점수 아닌 상태)
- Human-in-the-loop으로 최종 판단

### API 비용 최적화
| 문제 | 해결 |
|------|------|
| Production replay → 비용 2배 | 샘플링 옵션 (전체 ❌, 일부만) |
| 모든 케이스 테스트 | "최악 케이스"만 테스트 (효율적) |
| 비용 예측 어려움 | 비용 추정 미리 보여주기 |

---

## 📦 MVP 범위

### ✅ 반드시 포함
- Trace replay (Shadow Replay)
- "최악 프롬프트 세트" 자동 수집
- Signal 기반 감지 (5개 기본)
- 상태 판정 (SAFE/REGRESSED/CRITICAL)
- Before/After diff UI
- 커스텀 Signal 추가 기능
- Human-in-the-loop 리뷰 UI
- SDK (Python, Node)
- API + CLI

### ❌ MVP에서 제외 (나중에)
- Fancy dashboard
- 복잡한 scoring
- 멀티 모델 비교
- 리서치용 벤치마크
- CI/CD Gate (Phase 2)
- 비주얼 맵 빌더 (Phase 3)
- Self-hosted 버전 (Enterprise)

---

## 💰 Pricing Strategy

### 가치 제안
```
- 모델 비용 절감
- 사고 방지
- "버그 하나 막아주면 연봉 값"
```

### Tier 구조
| Tier | 가격 | 기능 |
|------|------|------|
| **Free** | $0 | Shadow Replay (제한), 기본 Signal 5개, 월 100회 테스트 |
| **Pro** | $29/월 | 무제한 테스트, 커스텀 Signal, Drift 모니터링 |
| **Team** | $79/월 | 팀 협업, CI/CD 연동, 우선 지원 |
| **Enterprise** | 문의 | Self-hosted, SLA, 전담 지원 |

---

## 🛠️ Implementation Phases

### Phase 1: MVP (1-2개월) 🎯 NOW
- [ ] Shadow Replay 핵심
- [ ] Signal 기반 감지 (5개 기본)
- [ ] "최악 프롬프트 세트" 자동 수집
- [ ] 상태 판정 (SAFE/REGRESSED/CRITICAL)
- [ ] Before/After diff UI
- [ ] Human-in-the-loop 리뷰 UI
- [ ] SDK (Python, Node)
- [ ] API + CLI

### Phase 2: 확장 (2-3개월)
- [ ] CI/CD Gate (GitHub Actions)
- [ ] 더 많은 Signal (10개+)
- [ ] Drift 모니터링 스케줄
- [ ] Slack/GitHub 알림 연동
- [ ] 고급 대시보드

### Phase 3: 고급 기능 (3-6개월)
- [ ] "Lovable for evals" (AI 기반 eval 생성)
- [ ] 비주얼 맵 빌더
- [ ] **최악 프롬프트 마켓플레이스** ⭐
  - 실제 프로덕션에서 테스트된 "최악 케이스" 공유
  - 도메인별 테스트 세트 (챗봇, RAG, 코드생성 등)
  - Signal 템플릿 공유
  - 데이터 moat (경쟁 우위)
- [ ] Self-hosted 버전
- [ ] Enterprise 기능

---

## 📊 Success Metrics

### MVP 성공 기준
- [ ] 10개 팀 베타 사용
- [ ] 3개 팀 유료 전환
- [ ] NPS 40+

### 6개월 목표
- [ ] 100개 팀 사용
- [ ] MRR $5,000+
- [ ] 주요 피드백 기반 Phase 2 완료

---

## 📝 Reddit 시장 조사 결과 (2026.01)

### 조사 개요
- **조회수**: ~5,200회 (LocalLLaMA 3,100 + LangChain 2,100)
- **의미 있는 피드백**: 7명+

### 주요 피드백 제공자
| 유저 | 핵심 인사이트 |
|------|--------------|
| **FullOf_Bad_Ideas** (상위 1%) | 15개월 직접 개발, "Lovable for evals" 제안 |
| **commanderdgr8** | Rouge 메트릭 + baseline 방식, 자동+수동 둘 다 |
| **sn2006gy** | LLM-as-Judge "자기 만족" 문제, Human-in-the-loop 필수 |
| **pballll** | Provider drift, API 비용 2배 문제, staged rollout 필요 |
| **FragrantBox4293** | Golden dataset 50-100개 실용적 |
| **Previous_Ladder9278** | LangWatch Scenario 경쟁사 정보 |

### 검증된 것
- ✅ 문제 존재함 (사람들이 직접 만들거나 포기)
- ✅ 기존 도구 복잡함 (진입장벽)
- ✅ LLM-as-Judge 신뢰 문제
- ✅ Human-in-the-loop 필수
- ✅ 지속적 수요 있음 (모델/프롬프트 계속 변경)

---

## 📚 Related Documents
- [DETAILED_DESIGN.md](./DETAILED_DESIGN.md) - 기술 상세 설계
- [SIGNAL_DETECTION.md](./SIGNAL_DETECTION.md) - Signal 기반 감지 설계

---

*Last Updated: 2026-01-27*
