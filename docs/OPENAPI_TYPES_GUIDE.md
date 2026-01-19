# OpenAPI 타입 자동 생성 가이드

## 개요

이 프로젝트는 FastAPI의 OpenAPI 스키마를 활용하여 프론트엔드 TypeScript 타입을 자동 생성합니다.

## 장점

1. **타입 동기화 자동화**: 백엔드 스키마 변경 시 프론트엔드 타입 자동 업데이트
2. **런타임 에러 감소**: 타입 불일치로 인한 에러 사전 방지
3. **개발 생산성 향상**: 수동 타입 정의 작업 제거
4. **API 문서 자동화**: Swagger UI에서 실시간 확인 가능

## 사용 방법

### 1. 타입 생성

백엔드 서버가 실행 중일 때:

```bash
# Windows (PowerShell)
cd frontend
npm run generate-types

# 또는 직접 실행
npx openapi-typescript http://localhost:8000/openapi.json -o lib/api-types.ts
```

### 2. 생성된 타입 사용

```typescript
import type { paths } from './lib/api-types';

// API 응답 타입 자동 추론
type AlertResponse = paths['/api/v1/alerts']['get']['responses']['200']['content']['application/json'][0];
type ProjectResponse = paths['/api/v1/projects']['post']['responses']['201']['content']['application/json'];
```

### 3. CI/CD 통합

GitHub Actions에서 자동으로 타입을 생성하고 검증:

```yaml
- name: Generate API types
  run: |
    cd frontend
    npm run generate-types
  env:
    BACKEND_URL: ${{ secrets.BACKEND_URL }}
```

## 백엔드 OpenAPI 스키마 확인

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

## 주의사항

1. 백엔드 서버가 실행 중이어야 타입 생성 가능
2. 스키마 변경 후 반드시 타입 재생성 필요
3. 생성된 타입 파일은 `.gitignore`에 추가하지 않음 (팀 공유 필요)

## 향후 개선

- [ ] GitHub Actions에서 자동 타입 생성 및 검증
- [ ] 타입 불일치 시 빌드 실패 처리
- [ ] Zod 스키마와 OpenAPI 타입 통합
