# PluvianAI 개선 목록

작성: 2026-02 기준. 구현 완료 여부는 코드/릴리스 노트 참고.

---

## 1. 리플레이 (Replay)

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 1.1 | Proxy 스냅샷 payload 형식 | Proxy 생성 스냅샷은 `{ request, response }` 형태 → 리플레이 시 **request만** provider body로 전송 | 높음 | ✅ 반영 |
| 1.2 | 리플레이 오버라이드 확장 | temperature, max_tokens, top_p, replay_overrides(dict) 지원 | 높음 | ✅ 반영 |
| 1.3 | Release Gate 연동 | Validate 요청에 replay_temperature, replay_max_tokens, replay_top_p, replay_overrides 전달 | 중간 | ✅ 반영 |
| 1.4 | 리플레이 API 키 | 키 없을 때 명확한 에러 메시지 | 중간 | ✅ 반영 |
| 1.5 | Release Gate UI | 후보 설정에 Temperature, Max tokens, Top P 입력 필드 추가 | 중간 | ✅ 반영 |

---

## 2. Live View / 데이터 수집

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 2.1 | SDK 전용 POST /api-calls | SDK가 보내는 데이터 수신 → APICall + Snapshot 생성 (Live View 로그) | 높음 | ✅ 반영 |
| 2.2 | Snapshot payload 형식 통일 | Proxy는 `{ request, response }`, stream은 flat. 장기적으로 저장 형식 통일 검토 | 낮음 | 미구현 |

---

## 3. 저장/최적화 (선택)

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 3.1 | APICall 저장 시 tools 보존 | optimize_api_call_data의 essential_request_fields에 tools 추가 검토 | 낮음 | 미구현 |

---

## 4. CI / 문서

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 4.1 | Release Gate CI 가이드 | GitHub Actions / GitLab CI에서 validate·webhook 호출 예제 | 중간 | ✅ RELEASE_GATE_CI.md |
| 4.2 | Behavior CI Gate 가이드 | ci-gate 사용법, threshold, exit_code | 중간 | 미구현 |
| 4.3 | Release Gate vs Behavior CI Gate | 한 페이지 비교 요약 | 중간 | ✅ RELEASE_GATE_CI.md §3 |
| 4.4 | API 스펙 최신화 | validate, webhook, ci-gate 파라미터·응답 반영 | 낮음 | 미구현 |

---

## 5. 포지셔닝 / 메시지

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 5.1 | 타겟 문구 정리 | "규칙 기반 배포 검증·회귀 방지" 강조 | 낮음 | 미구현 |
| 5.2 | 셀프호스팅/오픈소스 | 가이드·공개 범위 명시 | 낮음 | 미구현 |

---

## 6. 데이터 리니지 / 출처 표시

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 6.1 | 데이터 리니지/출처 표시 | "이 input이 어디서(어느 노드/어느 툴)에서 왔는지" UI·문서로 명시. 메시지·스텝별 출처 표시 또는 lineage 뷰 | 중간 | 미구현 |

---

## 7. 기타 (코드/운영)

| # | 항목 | 내용 | 우선순위 | 상태 |
|---|------|------|----------|------|
| 7.1 | ClinicalLog 등 프론트 | orgId, router, Flag 등 타입/미정의 참조 정리 | 중간 | 미구현 |

---

## 우선순위 요약

- **즉시 완료**: 1.1, 1.2, 1.3, 1.4, 2.1
- **단기**: 4.1–4.3 (CI 문서), 6.1 (리니지/출처)
- **중기**: 7.1 (프론트), 5.1–5.2
- **선택/장기**: 2.2, 3.1, 4.4
