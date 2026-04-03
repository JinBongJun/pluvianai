# 2026.04 Week 1 — Ops looks fine, but deploy replay showed long-tail risk

## 목표(포지셔닝 고정)
- 메인 메시지: **운영(Live)에서 보는 신호만으로는 “배포해도 된다”를 증명하기 어렵다. 저장된 실제 케이스를 배포 게이트에서 같은 입력으로 반복 실행하면 롱테일/불안정이 케이스 단위로 드러난다.**
- 핵심 증거: **스냅샷이 쌓인 Live 한 장 + Gate 결과(HEALTHY n/10, FLAKY/FLAGGED, 대표 FAIL 이유 1~2개)**
- 질문: 여러분은 배포 전에 **어떤 최소 증거**(케이스 세트, 반복 횟수, 실패 이유)를 요구하나요?

## 가정(시나리오) — 이번 주 증거에 맞춤
- **Live View:** 실트래픽 스냅샷이 들어오고, 운영용 eval(예: 짧은 답/지연/HTTP 등)으로 대부분은 “괜찮아 보이는” 그림이 나올 수 있음.
- **Release Gate:** Live에서 쓰던 것과 **목적이 같은 eval만**이 아니라, 배포 기준(예: **Required keywords**, 강화된 short/length 등)을 **게이트에서** 켜고 같은 저장 케이스를 **repeat(예: 10회)** 로 돌림.
- **결과:** 일부 intent에서만 **FLAKY** 또는 **FLAGGED**가 나오고, 전체 aggregate만 보면 놓치기 쉬운 패턴이 **케이스 단위**로 보임.

### (선택) “변경 때문에 깨졌다”를 말하고 싶을 때
- **같은 Gate eval + 같은 저장 케이스 + 같은 repeat** 으로 **baseline(기존 프롬프트/모델)** vs **candidate(후보 프롬프트/모델)** 를 각각 돌린 스크린샷이 있으면, 주장을 **회귀(regression)** 로 올릴 수 있음.
- 그 스크린 한 쌍이 없으면, 본문에서는 **“새 배포 기준을 올렸더니 숨어 있던 리스크가 드러났다”** 로 정직하게 쓴다.

## 증거에 채울 숫자(복붙용 체크리스트)
- Snapshots: `____ / 10000` (또는 표시되는 한도)
- Gate: 선택 로그 **4**개(예: refund/billing 계열 3 + 대조 1), repeat **`10`**
- 결과 요약: 예) `FLAGGED (71.1%)`, 로그별 `9/10`, `4/10`, `0/10` 등 **실제 UI 숫자**
- FAIL 이유 라벨(실제 표시에 맞춰 1~2개): 예) `required keywords`, `empty/short`, `latency`

## 스크린샷 구성(Shot 우선)
- Reddit: `Shot 1(Live 훅)` + `Shot 3 또는 Gate 결과(평가/집계)` 최소
- IH: `Shot 2b(스냅샷/재료)` + `Shot 6(실패·FLAKY가 읽히는 결과)` 중심
- 캡션 원칙: “클릭 경로”가 아니라 **무엇을 증명했는지** 한 줄

---

## Reddit — 권장 서브 & 제목

- **1차:** `r/aiengineering`
- **2차(선택):** `r/LLMDevs` — 훅만 “프로덕션 에이전트 배포 전 증거” 톤으로 바꿔 재게시 금지(복붙 금지)

**Title (EN) 예시:**  
Aggregate metrics looked fine in Live View—then a pre-deploy replay (same saved cases, 10× repeats) surfaced FLAKY/FLAGGED long-tail failures. How do you decide what counts as “enough evidence” before shipping?

**Body (초안):**

We run a small production-ish support bot demo and ingest real-ish traffic into Live View. At a glance, things look “okay” on the usual operational checks.

The part that scared us wasn’t a loud outage—it was that **the scary cases only showed up when we replayed a tight set of saved real requests under a stricter deploy bar**, with repeats to separate “one-off weirdness” from instability.

Here’s the concrete evidence we’re using this week:
- **Live View:** snapshots are coming in; operational eval highlights are mostly broad-strokes.
- **Release Gate:** we replay **4** saved cases with **10×** repeats and explicit checks (e.g., required keywords + short/empty + latency thresholds—use whatever your screenshot shows).
- **Outcome:** mixed health across cases—some **FLAKY**, one line item looked **much worse** than the rest (paste your real numbers).

**Question for the room:** when average looks fine, what’s your minimum deploy evidence—case set size, repeat count, and what failure modes you treat as ship-stoppers?

*(Optional 1-sentence product line, last only:)* We run this loop in **PluvianAI** (capture → saved cases → pre-deploy replay), but I’m more interested in your routine than tooling.

---

## Indie Hackers — 제목 & 본문

**Title (EN) 예시:**  
Our dashboards looked fine—until we replayed saved production-like cases under a deploy gate with repeats.

**Post (초안):**

We’re building validation around LLM apps the same way we’d treat any production system: **you need evidence that matches the decision you’re about to make** (ship / don’t ship).

In Live View, it’s easy to feel reassured: traffic is flowing, snapshots are accumulating, and operational signals look mostly healthy.

But “mostly healthy on averages” isn’t the same thing as “safe to change the thing customers rely on.” So we took a small, high-signal slice of saved real requests and ran them in a pre-deploy gate with **repeat runs**. The result wasn’t “everything is broken”—it was closer to **long-tail risk**: a few intents looked unstable, and one looked consistently bad under the deploy checks (fill in your exact numbers).

What we changed in how we work:
- **Separate concerns:** operational monitoring vs deploy criteria (they’re not identical).
- **Repeat on purpose:** same input multiple times to surface **FLAKY** vs deterministic failure.
- **Case-level verdicts:** FAIL reasons as checklist items, not vibes.

**CTA (고정 1개만 선택):**  
- (A) 댓글로 “배포 전 최소 증거” 루틴 공유 요청  
- (B) 트라이얼/웹사이트 1링크(문장 1개)  
- (C) 이메일/캘린더 등 다음 스텝 1개

If you ship LLM changes weekly: **what evidence would make you stop a release even when aggregate metrics look fine?**
