# Vercel 자동 배포 설정 가이드

Cursor에서 `git push`만 하면 자동으로 Vercel에 배포되도록 설정하는 방법입니다.

## 방법 1: GitHub Actions 사용 (권장)

### 1단계: Vercel 토큰 생성

1. Vercel 대시보드 → Settings → Tokens
2. "Create Token" 클릭
3. Token 이름: `GitHub Actions Deploy`
4. Scope: Full Account
5. 생성된 토큰 복사 (한 번만 보여줌!)

### 2단계: Vercel 프로젝트 정보 확인

1. Vercel 프로젝트 → Settings → General
2. **Project ID** 복사
3. **Team ID** 확인 (개인 계정이면 비워두기)

### 3단계: GitHub Secrets 설정

1. GitHub 저장소 → Settings → Secrets and variables → Actions
2. "New repository secret" 클릭하여 다음 추가:

```
VERCEL_TOKEN = <위에서 생성한 토큰>
VERCEL_PROJECT_ID = <프로젝트 ID>
VERCEL_ORG_ID = <조직 ID, 개인 계정이면 비워두기>
VERCEL_TEAM_ID = <팀 ID, 개인 계정이면 비워두기>
```

### 4단계: GitHub Actions 워크플로우 확인

`.github/workflows/deploy-vercel.yml` 파일이 이미 생성되어 있습니다.

### 5단계: 테스트

```bash
git add .
git commit -m "Test auto deploy"
git push origin main
```

GitHub Actions 탭에서 워크플로우 실행을 확인할 수 있습니다.

---

## 방법 2: Vercel과 GitHub 연결 재설정

### 1단계: Vercel에서 저장소 재연결

1. Vercel 프로젝트 → Settings → Git
2. "Disconnect" 클릭
3. "Connect Git Repository" 클릭
4. `JinBongJun/AgentGuard` 선택
5. 권한 승인

### 2단계: GitHub에서 Vercel 권한 확인

1. GitHub → Settings → Applications → Authorized OAuth Apps
2. "Vercel" 찾기
3. 권한 확인:
   - ✅ Repository access: `JinBongJun/AgentGuard` 포함
   - ✅ Repository permissions: `Read` 권한

### 3단계: 저장소를 Public으로 변경 (선택사항)

Private 저장소는 webhook 문제가 있을 수 있습니다:

1. GitHub 저장소 → Settings → General
2. "Danger Zone" → "Change visibility"
3. "Make public" 선택

---

## 방법 3: Deploy Hook 사용

### 1단계: Deploy Hook 생성

1. Vercel 프로젝트 → Settings → Git → Deploy Hooks
2. Name: `Auto Deploy`
3. Branch: `main`
4. "Create Hook" 클릭
5. URL 복사

### 2단계: GitHub Actions에 추가

`.github/workflows/vercel-deploy-simple.yml` 파일을 사용하거나, 
다음과 같이 수정:

```yaml
name: Trigger Vercel Deployment

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel Deploy Hook
        run: |
          curl -X POST ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}
```

GitHub Secrets에 `VERCEL_DEPLOY_HOOK_URL` 추가

---

## 추천 방법

**방법 1 (GitHub Actions)**을 권장합니다:
- ✅ Private 저장소에서도 작동
- ✅ 배포 로그 확인 가능
- ✅ 배포 실패 시 알림 받을 수 있음
- ✅ 커스터마이징 가능

---

## 문제 해결

### 배포가 트리거되지 않을 때

1. GitHub Actions 탭에서 워크플로우 실행 확인
2. Vercel 토큰이 유효한지 확인
3. 프로젝트 ID가 올바른지 확인

### 빌드 실패 시

1. GitHub Actions 로그 확인
2. Vercel 대시보드에서 빌드 로그 확인
3. `frontend/package.json`의 의존성 확인


