# 배포 상태 확인 가이드

## 현재 상황

✅ **"Deploy to Vercel via Hook" 워크플로우 성공** (4초)
- GitHub Actions에서 성공적으로 실행됨
- Deploy Hook URL 호출 완료

❓ **Vercel에서 배포가 시작되지 않음**

## 확인 방법

### 1. GitHub Actions 로그 확인

1. GitHub → Actions → "Deploy to Vercel via Hook"
2. 최근 성공한 실행 클릭
3. "Trigger Vercel Deployment" 단계 확장
4. 확인할 내용:
   - `Response code: 200` 또는 `201` → 성공
   - `Response body:` → JSON 응답 확인
   - `✅ Deployment triggered successfully` → 성공 메시지

### 2. Vercel 대시보드 확인

1. Vercel → Deployments 탭
2. 새 배포가 있는지 확인
3. 배포가 없으면:
   - Deploy Hook이 트리거되지 않았거나
   - Hook URL이 잘못되었을 수 있음

### 3. Deploy Hook 수동 테스트

Vercel에서:
1. Settings → Git → Deploy Hooks
2. "Auto Deploy" Hook의 URL 복사
3. 터미널에서 테스트:
   ```bash
   curl -X POST "여기에_URL_붙여넣기"
   ```

**성공 응답 예시:**
```json
{
  "job": {
    "id": "xxx",
    "state": "QUEUED"
  }
}
```

### 4. 가능한 문제

1. **Deploy Hook URL이 잘못됨**
   - GitHub Secrets의 URL이 잘려서 복사됨
   - 해결: Vercel에서 전체 URL 다시 복사

2. **Hook이 만료됨**
   - Deploy Hook이 삭제되거나 비활성화됨
   - 해결: 새 Hook 생성

3. **Vercel 프로젝트 설정 문제**
   - Root Directory가 `frontend`로 설정되지 않음
   - 해결: Vercel Settings → General 확인

## 해결 방법

### 방법 1: Deploy Hook 재생성

1. Vercel → Settings → Git → Deploy Hooks
2. 기존 "Auto Deploy" Hook 삭제 (Revoke)
3. 새 Hook 생성:
   - Name: `Auto Deploy`
   - Branch: `main`
4. 새 URL을 GitHub Secrets에 업데이트:
   - GitHub → Settings → Secrets → `VERCEL_DEPLOY_HOOK_URL` 수정

### 방법 2: Vercel 프로젝트 설정 확인

1. Vercel → Settings → General
2. 확인 사항:
   - **Root Directory**: `frontend`로 설정되어 있는지
   - **Framework Preset**: `Next.js`로 설정되어 있는지
   - **Build Command**: `npm run build` (자동)
   - **Output Directory**: `.next` (자동)

### 방법 3: 수동 배포 (임시)

Vercel Deployments 페이지에서:
- 최근 배포의 "..." 메뉴 → "Redeploy"
- 또는 상단의 "Deploy" 버튼

## 다음 단계

1. GitHub Actions 로그에서 HTTP 응답 코드 확인
2. Vercel 대시보드에서 새 배포 확인
3. 배포가 없으면 Deploy Hook 재생성

