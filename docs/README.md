# Synpira 문서

> **Synpira — the test lab for agents.** LLM/Agent 테스트 전용 서비스

---

## 핵심 문서

### 설계 문서
- **[BLUEPRINT.md](./BLUEPRINT.md)** - 마스터 블루프린트 (비전, 기능, 로드맵)
- **[DETAILED_DESIGN.md](./DETAILED_DESIGN.md)** - 상세 설계 (아키텍처, DB, API)

### 시작하기
- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - 로컬 개발 환경 설정

### 배포 가이드
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Vercel + Railway 배포
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 배포 체크리스트
- [DEPLOYMENT_WORKFLOW.md](./DEPLOYMENT_WORKFLOW.md) - 배포 워크플로우
- [RAILWAY_DB_SETUP.md](./RAILWAY_DB_SETUP.md) - Railway DB 설정
- [RAILWAY_LOCAL_SETUP.md](./RAILWAY_LOCAL_SETUP.md) - Railway 로컬 연결
- [RAILWAY_FRONTEND_E2E.md](./RAILWAY_FRONTEND_E2E.md) - 로컬 프론트 → Railway 백엔드 연결 및 한데까지(E2E) 테스트

### 운영 가이드
- [PRODUCTION_MONITORING.md](./PRODUCTION_MONITORING.md) - 모니터링 설정
- [SCALING_GUIDE.md](./SCALING_GUIDE.md) - 확장 가이드
- [SLO_SLA.md](./SLO_SLA.md) - SLO/SLA 정의

---

## 가이드 문서 (`guides/`)

### API & 개발
- [API_REFERENCE.md](./guides/API_REFERENCE.md) - API 문서
- [API_VERSIONING.md](./guides/API_VERSIONING.md) - API 버전 관리
- [CODING_STANDARDS.md](./guides/CODING_STANDARDS.md) - 코딩 표준
- [DATABASE_SCHEMA.md](./guides/DATABASE_SCHEMA.md) - DB 스키마
- [IMPLEMENTATION_GUIDE.md](./guides/IMPLEMENTATION_GUIDE.md) - 구현 가이드

### 운영 & 보안
- [OPERATIONS_GUIDE.md](./guides/OPERATIONS_GUIDE.md) - 운영 가이드
- [SECURITY_GUIDE.md](./guides/SECURITY_GUIDE.md) - 보안 가이드
- [SDK_TIMEOUT_GUIDE.md](./guides/SDK_TIMEOUT_GUIDE.md) - SDK 타임아웃

### 설정
- [STRIPE_SETUP.md](./guides/STRIPE_SETUP.md) - Stripe 결제 설정
- [SELF_HOSTED_SETUP.md](./guides/SELF_HOSTED_SETUP.md) - Self-hosted 설정
- [UX_GUIDE.md](./guides/UX_GUIDE.md) - UX 가이드

---

## 스키마 명세

- [../SCHEMA_SPEC.md](../SCHEMA_SPEC.md) - Frontend/Backend 스키마 명세

---

## 핵심 기능 요약

| 기능 | 설명 |
|------|------|
| **Auto-Mapping** | SDK 연동 → 트래픽 분석 → 에이전트 구조 자동 시각화 |
| **Test Lab (모델 변경)** | 프롬프트 고정, 모델만 변경 → 재실행 |
| **Test Lab (프롬프트 변경)** | 모델 고정, 프롬프트만 변경 → 실행 |
| **Signal Detection** | 규칙 기반 평가 (LLM Judge 아님) |
| **Worst Prompt Set** | 실패 케이스 자동 수집 |
| **Human-in-the-loop** | 애매한 케이스 사람 검토 |

---

**마지막 업데이트**: 2026-01-31
