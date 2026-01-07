# GitHub 저장소 설정 가이드

## ✅ Step 1 완료: Git 커밋
- 108개 파일 커밋 완료
- 커밋 해시: `b9bc244`

## 📝 Step 2: GitHub 저장소 생성

### 방법 1: 웹 브라우저에서 (권장)

1. **GitHub 접속**: https://github.com
2. **로그인** (또는 회원가입)
3. **우측 상단 "+" 버튼** 클릭 → **"New repository"**
4. **저장소 설정**:
   - Repository name: `AgentGuard` (또는 원하는 이름)
   - Description: `LLM Agent Monitoring Platform - MVP`
   - Public 또는 Private 선택
   - ⚠️ **중요**: "Initialize this repository with" 옵션들은 모두 체크 해제
     - Add a README file ❌
     - Add .gitignore ❌
     - Choose a license ❌
5. **"Create repository"** 클릭

### 방법 2: GitHub CLI 사용 (선택)

```bash
gh repo create AgentGuard --public --source=. --remote=origin --push
```

---

## 🚀 Step 3: GitHub에 푸시

GitHub 저장소를 생성하면 아래 URL이 표시됩니다:
```
https://github.com/YOUR_USERNAME/AgentGuard.git
```

이 URL을 사용하여 아래 명령어를 실행하세요:

```bash
# 원격 저장소 추가
git remote add origin https://github.com/YOUR_USERNAME/AgentGuard.git

# 브랜치 이름을 main으로 변경
git branch -M main

# GitHub에 푸시
git push -u origin main
```

---

## ✅ 확인

푸시가 완료되면:
- GitHub 저장소 페이지에서 모든 파일이 보여야 합니다
- README.md, backend/, frontend/ 등 모든 파일 확인

---

## 다음 단계

GitHub 푸시 완료 후:
1. Railway 백엔드 배포 시작
2. Vercel 프론트엔드 배포 시작


