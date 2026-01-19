# Dependabot + Vercel 자동화 설정 가이드

## 현재 상태

✅ **Dependabot 설정 완료:**
- PR 생성 빈도: `weekly` → `monthly` (줄임)
- PR 제한: `5` → `3` (줄임)
- Major 버전 업데이트 무시 (자동 업데이트 위험 방지)
- `skip-vercel-preview` 라벨 자동 추가

## Vercel Preview 배포 스킵 설정

Dependabot PR에 대해 Vercel Preview 배포를 스킵하려면 다음 중 하나를 선택하세요:

### 방법 1: Vercel 대시보드 설정 (추천 ⭐)

1. Vercel 프로젝트 대시보드 접속
2. **Settings** → **Git** 탭
3. **Ignored Build Step** 섹션 찾기
4. 다음 설정 추가:

```bash
# Skip Vercel preview deployments for dependency update PRs
git log -1 --pretty=%B | grep -q "skip-vercel-preview" && exit 1 || exit 0
```

또는 더 정확하게:

```bash
# Check if PR has skip-vercel-preview label (requires GitHub API)
# This is a simple check - if commit message contains the label, skip build
git log -1 --pretty=%B | grep -i "skip.*vercel\|dependabot\|chore.*deps" && exit 1 || exit 0
```

**주의:** 이 방법은 커밋 메시지를 기반으로 하므로, Dependabot이 `skip-vercel-preview`를 커밋 메시지에 포함하도록 설정해야 합니다.

### 방법 2: GitHub Actions로 제어 (더 정확함)

`.github/workflows/vercel-skip.yml` 파일 생성:

```yaml
name: Skip Vercel Preview for Dependencies

on:
  pull_request:
    types: [opened, synchronize, labeled, unlabeled]

jobs:
  skip-vercel:
    runs-on: ubuntu-latest
    steps:
      - name: Check if PR has skip-vercel-preview label
        id: check-label
        uses: actions/github-script@v7
        with:
          script: |
            const labels = context.payload.pull_request.labels.map(l => l.name);
            const hasSkipLabel = labels.includes('skip-vercel-preview');
            core.setOutput('skip', hasSkipLabel);
            
            if (hasSkipLabel) {
              console.log('✅ PR has skip-vercel-preview label - Vercel preview will be skipped');
            } else {
              console.log('ℹ️ PR does not have skip-vercel-preview label - Vercel preview will be created');
            }
```

하지만 이 방법은 Vercel이 GitHub Actions를 직접 확인하지 않으므로 효과가 제한적입니다.

### 방법 3: Vercel CLI + GitHub Actions (가장 확실함)

`.github/workflows/vercel-deploy.yml` 파일 생성:

```yaml
name: Conditional Vercel Deploy

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  check-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Check PR labels
        id: check-labels
        uses: actions/github-script@v7
        with:
          script: |
            const labels = context.payload.pull_request.labels.map(l => l.name);
            const hasSkipLabel = labels.includes('skip-vercel-preview');
            core.setOutput('skip', hasSkipLabel);
            
      - name: Skip deployment if label exists
        if: steps.check-labels.outputs.skip == 'true'
        run: |
          echo "⏭️ Skipping Vercel preview deployment (skip-vercel-preview label detected)"
          exit 0
      
      - name: Deploy to Vercel Preview
        if: steps.check-labels.outputs.skip != 'true'
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

**주의:** 이 방법은 Vercel의 자동 배포를 비활성화하고 GitHub Actions로 대체해야 합니다.

---

## 추천 방법

**가장 간단한 방법:** Dependabot 설정을 이미 개선했으므로 (monthly, PR limit 3), Preview 배포 빈도가 자연스럽게 줄어듭니다. 추가 설정 없이도 충분할 수 있습니다.

**더 확실한 방법:** Vercel 대시보드에서 **Ignored Build Step** 설정:
- 커밋 메시지에 "dependabot" 또는 "chore(deps)"가 포함되면 빌드 스킵

---

## 확인 방법

1. Dependabot PR 생성 확인
2. Vercel 대시보드에서 Preview 배포가 생성되지 않는지 확인
3. 또는 Preview 배포가 생성되더라도 실패하지 않는지 확인

---

## 추가 개선 사항

### Dependabot 자동 머지 설정 (선택사항)

신뢰할 수 있는 의존성 업데이트만 자동 머지:

1. GitHub 저장소 → **Settings** → **General**
2. **Pull Requests** 섹션에서 **Allow auto-merge** 활성화
3. Dependabot PR에 **auto-merge** 라벨 추가

또는 GitHub Actions로 자동 머지:

```yaml
name: Auto-merge Dependabot PRs

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    steps:
      - name: Check if PR is from Dependabot
        if: github.actor == 'dependabot[bot]'
        uses: actions/github-script@v7
        with:
          script: |
            // Only auto-merge if CI passes and has approval
            // This is a placeholder - implement your own logic
```

---

## 요약

✅ **완료된 작업:**
- Dependabot PR 빈도 감소 (weekly → monthly)
- PR 제한 감소 (5 → 3)
- Major 버전 업데이트 무시
- `skip-vercel-preview` 라벨 자동 추가

📋 **추가 설정 (선택사항):**
- Vercel Ignored Build Step 설정
- 또는 GitHub Actions로 조건부 배포 제어

현재 설정만으로도 Preview 배포 빈도가 크게 줄어들었습니다!
