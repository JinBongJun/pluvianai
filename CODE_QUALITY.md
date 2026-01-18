# Code Quality & Pre-commit Checks

이 문서는 코드 품질을 보장하고 문법 오류를 사전에 방지하기 위한 가이드입니다.

## 🛡️ 자동 코드 품질 체크

### 1. Pre-commit Hooks (로컬)

커밋 전에 자동으로 코드를 검사합니다.

```bash
# 설치
pip install pre-commit
pre-commit install

# 수동 실행 (모든 파일)
pre-commit run --all-files
```

**검사 항목:**
- ✅ Python 문법 체크 (`py_compile`)
- ✅ TypeScript 문법 체크 (`tsc --noEmit`)
- ✅ YAML/JSON/TOML 유효성
- ✅ 대용량 파일 차단 (>1MB)
- ✅ 머지 컨플릭트 체크
- ✅ 코드 포맷팅 (Black, ESLint)

### 2. GitHub Actions (CI)

모든 Push/PR에 대해 자동으로 검사합니다.

**워크플로우:** `.github/workflows/code-quality.yml`

**검사 항목:**
- ✅ Python 문법 체크
- ✅ TypeScript 컴파일 체크

### 3. 수동 스크립트

커밋 전에 수동으로 실행할 수 있습니다:

```bash
# Python만
find backend -name "*.py" -type f -exec python -m py_compile {} \;

# TypeScript만
cd frontend && npx tsc --noEmit --skipLibCheck

# 전체 스크립트 (Mac/Linux)
bash scripts/pre-commit-checks.sh
```

## 📋 체크 리스트

커밋 전에 확인:

- [ ] Python 파일 문법 오류 없음
- [ ] TypeScript/JavaScript 문법 오류 없음
- [ ] `try` 블록에 `except`/`finally` 존재
- [ ] 들여쓰기 일관성
- [ ] 임포트 문 오류 없음
- [ ] 타입 오류 없음 (TypeScript)

## 🚨 자주 발생하는 오류

### 1. SyntaxError: expected 'except' or 'finally' block

**원인:** `try` 블록이 제대로 닫히지 않음

```python
# ❌ 잘못된 코드
try:
    db.commit()
logger.info("Success")  # try 블록 밖에 있음

# ✅ 올바른 코드
try:
    db.commit()
    logger.info("Success")
except Exception as e:
    logger.error(f"Error: {e}")
```

### 2. 들여쓰기 오류

**원인:** 공백과 탭이 섞이거나 들여쓰기 레벨이 맞지 않음

**해결:** 에디터에서 "Show Whitespace" 설정하고 일관된 들여쓰기 사용

### 3. Import 오류

**원인:** 순환 참조 또는 잘못된 import 경로

**해결:** `python -m py_compile` 로 문법만 확인, 실제 import는 런타임에서 확인

## 🔧 설정 파일

- **Pre-commit:** `.pre-commit-config.yaml`
- **Python Linting:** `backend/.flake8`
- **CI/CD:** `.github/workflows/code-quality.yml`

## 💡 팁

1. **IDE 확장 설치:**
   - VSCode: Python, ESLint, Prettier
   - PyCharm: Built-in linter

2. **에디터 설정:**
   - 자동 포맷팅 (저장 시)
   - 문법 하이라이팅
   - 린터 경고 표시

3. **커밋 전 습관:**
   - 항상 로컬에서 빌드 테스트
   - Pre-commit hook 실행
   - 작은 단위로 자주 커밋

---

**이 설정을 통해 문법 오류로 인한 불필요한 배포 실패와 토큰 비용을 절감할 수 있습니다!**
