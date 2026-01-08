# 커밋 이메일 주소 문제 해결

## 문제

Vercel 체크에서 다음 오류 발생:
- "No GitHub account was found matching the commit author email address"

## 원인

Git 커밋에 사용된 이메일 주소가 GitHub 계정에 연결되지 않음

## 해결 방법

### 방법 1: Git 이메일 주소를 GitHub 이메일로 변경

1. GitHub에서 이메일 확인:
   - GitHub → Settings → Emails
   - 사용 중인 이메일 주소 확인

2. Git 설정 변경:
   ```bash
   git config --global user.email "your-github-email@example.com"
   git config --global user.name "Your Name"
   ```

3. 기존 커밋 이메일 변경 (선택사항):
   ```bash
   git commit --amend --author="Your Name <your-github-email@example.com>"
   ```

### 방법 2: GitHub에 이메일 추가

1. GitHub → Settings → Emails
2. "Add email address" 클릭
3. Git에서 사용하는 이메일 주소 추가
4. 이메일 인증 완료

### 방법 3: GitHub noreply 이메일 사용

1. GitHub → Settings → Emails
2. "Keep my email addresses private" 체크 해제
3. "Block command line pushes that expose my email" 체크 해제
4. 또는 GitHub 제공 noreply 이메일 사용:
   ```bash
   git config --global user.email "username@users.noreply.github.com"
   ```

## 확인

```bash
# 현재 설정 확인
git config user.email
git config user.name

# 최근 커밋 이메일 확인
git log --format='%an <%ae>' -1
```

## 중요

- 이 설정은 **앞으로의 커밋**에만 적용됩니다
- 기존 커밋은 변경하지 않아도 됩니다 (Vercel은 최신 커밋만 확인)
- 다음 커밋부터는 올바른 이메일로 표시됩니다

