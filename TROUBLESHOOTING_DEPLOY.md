# Vercel 자동 배포 문제 해결 가이드

## 현재 상황

1. ✅ "Deploy to Vercel via Hook" 워크플로우만 남김
2. ✅ GitHub Secrets에 `VERCEL_DEPLOY_HOOK_URL` 설정됨
3. ❓ Vercel에서 배포가 트리거되지 않음

## 확인 사항

### 1. GitHub Actions 확인

1. GitHub 저장소 → **Actions** 탭
2. "Deploy to Vercel via Hook" 워크플로우 확인
3. 최근 실행 클릭 → 로그 확인:
   - "Check if secret exists" 단계: ✅ 또는 ❌
   - "Trigger Vercel Deployment" 단계: HTTP 응답 코드 확인

### 2. Deploy Hook URL 확인

**Vercel에서:**
1. Settings → Git → Deploy Hooks
2. "Auto Deploy" Hook의 URL 복사
3. 전체 URL이 복사되었는지 확인 (매우 긴 URL)

**GitHub에서:**
1. Settings → Secrets and variables → Actions
2. `VERCEL_DEPLOY_HOOK_URL` 확인
3. Vercel에서 복사한 URL과 일치하는지 확인

### 3. 수동 테스트

터미널에서 직접 테스트:

```bash
# Deploy Hook URL을 여기에 붙여넣기
curl -X POST "https://api.vercel.com/v1/integrations/deploy/..."
```

**성공 응답:**
```json
{
  "job": {
    "id": "...",
    "state": "QUEUED"
  }
}
```

**실패 응답:**
- 401: 인증 실패
- 404: Hook이 존재하지 않음
- 400: 잘못된 요청

### 4. Vercel 대시보드 확인

1. Vercel → Deployments 탭
2. 새 배포가 시작되었는지 확인
3. 배포가 없으면 Hook이 트리거되지 않은 것

## 해결 방법

### 방법 1: Deploy Hook 재생성

1. Vercel → Settings → Git → Deploy Hooks
2. 기존 "Auto Deploy" Hook 삭제 (Revoke)
3. 새 Hook 생성:
   - Name: `Auto Deploy`
   - Branch: `main`
4. 새 URL을 GitHub Secrets에 업데이트

### 방법 2: GitHub Actions 로그 확인

1. GitHub → Actions → "Deploy to Vercel via Hook"
2. 실패한 실행 클릭
3. "Trigger Vercel Deployment" 단계 확장
4. 에러 메시지 확인:
   - `VERCEL_DEPLOY_HOOK_URL secret is not set`: Secret 미설정
   - `HTTP code: 401`: Hook URL이 잘못됨
   - `HTTP code: 404`: Hook이 삭제됨

### 방법 3: Vercel과 GitHub 재연결

1. Vercel → Settings → Git
2. "Disconnect" 클릭
3. "Connect Git Repository" 클릭
4. 저장소 재연결

### 방법 4: 수동 배포 (임시 해결)

Vercel Deployments 페이지에서:
- "Redeploy" 버튼 클릭
- 또는 Deploy Hook URL을 브라우저에서 직접 호출

## 예상 원인

1. **Deploy Hook URL이 만료됨**: Hook을 재생성 필요
2. **Secret이 잘못 설정됨**: URL이 잘려서 복사됨
3. **Private 저장소 문제**: Vercel이 webhook을 받지 못함
4. **GitHub Actions 권한 문제**: Secrets에 접근 불가

## 다음 단계

1. GitHub Actions 로그 확인
2. Deploy Hook URL 수동 테스트
3. 필요시 Hook 재생성

