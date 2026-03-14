# Toy Project Browser Test Runbook

이 문서는 `docs/manual-test-scenarios-mvp-replay-test.md`를 실제로 브라우저에서 돌릴 때,
"어떤 순서로 무엇을 검증할지"를 짧게 실행하는 런북이다.

## 1) 준비

- 토이 프로젝트 1개 생성 (`toy-regression-lab` 권장)
- 노드(에이전트) 1개 이상 생성
- SDK 또는 API로 스냅샷 30~50개 적재
- 테스트 계정 2개 준비:
  - owner 계정 1개
  - member 또는 viewer 계정 1개

## 2) 실행 순서 (브라우저)

아래 순서대로 체크하면 회귀 위험이 낮다.

1. `INT-6` 해피패스
2. `LV-10` + `RG-1a` 상태 처리
3. `REC-1` ~ `REC-7` 데이터 선택/결과 상세
4. `RG-2` ~ `RG-6` 반복 실행/판정/결과 UI
5. `F-1` ~ `F-4` Free 한도/사용량 UI
6. `K-1` ~ `K-6` 권한 경계
7. `M-1` ~ `M-5` Role UX + Legal/Trust 링크
8. `OPS-7` dry-run (선택)

## 3) 증거 캡처 최소 세트

- Live View 노드 + Clinical Log + 상세
- Release Gate 결과 (k/N passed, attempt detail, behavior change)
- 한도 초과 403 메시지
- 권한 부족 403 메시지 (required/current/next-step hint 포함)
- Team `Role Access Guide`
- `/terms`, `/privacy`, `/security` 페이지 및 랜딩 푸터 링크 이동

## 4) 완료 기준

- Final checklist에서 `INT`, `LV`, `REC`, `RG`, `F`, `K`, `M` 항목이 모두 체크됨
- 재현 가능한 실패 항목은 Evidence 캡처와 함께 이슈로 분리됨

