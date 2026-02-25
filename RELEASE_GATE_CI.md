# Release Gate CI 연동

배포 전에 Release Gate 검증을 CI(GitHub Actions, GitLab CI 등)에서 호출하는 방법입니다.

---

## 1. Validate API 호출

**엔드포인트**: `POST /api/v1/projects/{project_id}/release-gate/validate`

**인증**: `Authorization: Bearer <JWT>` 또는 API Key (프로젝트/유저 키).

**주요 body 예시** (Regression 모드):

```json
{
  "agent_id": "your-agent-id",
  "evaluation_mode": "regression",
  "snapshot_ids": ["123", "456"],
  "new_model": "gpt-4o",
  "new_system_prompt": "You are a helpful assistant.",
  "replay_temperature": 0.7,
  "replay_max_tokens": 1024,
  "repeat_runs": 1,
  "failed_run_ratio_max": 0.25
}
```

- **데이터 소스**: `snapshot_ids`(Live View에서 선택한 스냅샷) 또는 `dataset_ids`(저장된 데이터셋 ID 목록).
- **후보 설정**: `new_model`, `new_system_prompt`, `replay_temperature`, `replay_max_tokens`, `replay_top_p`, `replay_overrides`(선택).

**응답**: `pass: true/false`, `report_id`, `run_results` / `drift_runs` 등. 실패 시 `pass: false`와 원인 필드 확인.

---

## 2. GitHub Actions 예시

```yaml
- name: Release Gate validate
  env:
    API_BASE: "https://your-api.example.com"
    PROJECT_ID: "8"
    BEARER_TOKEN: "${{ secrets.AGENTGUARD_TOKEN }}"
  run: |
    res=$(curl -s -X POST "$API_BASE/api/v1/projects/$PROJECT_ID/release-gate/validate" \
      -H "Authorization: Bearer $BEARER_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"agent_id":"my-agent","snapshot_ids":["1","2"],"evaluation_mode":"regression","repeat_runs":1}')
    echo "$res" | jq .
    if [ "$(echo "$res" | jq -r '.pass')" != "true" ]; then exit 1; fi
```

- 시크릿에 `AGENTGUARD_TOKEN`(JWT 또는 API 키) 저장.
- `pass`가 `true`가 아니면 스텝 실패로 배포 중단 가능.

---

## 3. Release Gate vs Behavior CI Gate

| 구분 | Release Gate | Behavior CI Gate |
|------|--------------|------------------|
| **엔드포인트** | `POST .../release-gate/validate` | `POST .../behavior/ci-gate` |
| **데이터** | 스냅샷/데이터셋 기반 리플레이 | 테스트 런(Test Run) 결과 |
| **용도** | “저장된 런으로 후보 모델/프롬프트 검증” | “방금 돌린 테스트 런이 정책 통과 여부” |

CI에서 “저장된 트래픽으로 배포 전 검증”이면 Release Gate, “테스트 런 결과로 게이트”면 Behavior CI Gate를 사용하면 됩니다.
