# 자동화 가이드

이 프로젝트는 최대한 자동화된 개발 워크플로우를 제공합니다. 개발자는 코드만 작성하면 나머지는 자동으로 처리됩니다.

## 🚀 자동화된 프로세스

### 1. Pre-commit Hooks (로컬 자동화)

커밋 전에 자동으로 실행되는 검사 및 수정:

```bash
# 설치 (한 번만)
pip install pre-commit
pre-commit install
```

**자동 실행 항목:**
- ✅ Python 코드 포맷팅 (Black) - **자동 수정**
- ✅ Python 린팅 (Flake8)
- ✅ TypeScript/JavaScript 포맷팅 (Prettier) - **자동 수정**
- ✅ ESLint 검사 및 수정 - **자동 수정**
- ✅ YAML/JSON/TOML 유효성 검사
- ✅ 대용량 파일 차단 (>1MB)
- ✅ 머지 컨플릭트 체크
- ✅ 민감 정보 감지

**수동 실행:**
```bash
# 모든 파일 검사
pre-commit run --all-files

# 특정 hook만 실행
pre-commit run black --all-files
pre-commit run prettier --all-files
```

### 2. GitHub Actions CI/CD (자동 검증)

모든 Push/PR에 대해 자동으로 실행:

#### 2.1 Comprehensive CI Pipeline
**파일:** `.github/workflows/ci-comprehensive.yml`

**자동 실행 항목:**
- ✅ Python 코드 품질 (Black, Flake8, MyPy)
- ✅ TypeScript 코드 품질 (ESLint, Type Check)
- ✅ 자동 테스트 실행 (Unit + Integration)
- ✅ 코드 커버리지 검사 (60% 이상)
- ✅ OpenAPI 타입 자동 생성 및 검증
- ✅ 보안 취약점 스캔 (Safety, npm audit)
- ✅ 품질 게이트 (모든 검사 통과 필수)

#### 2.2 PR Validation
**파일:** `.github/workflows/pr-validation.yml`

**자동 검증 항목:**
- ✅ PR 제목 형식 검사 (Conventional Commits)
- ✅ 대용량 파일 차단
- ✅ 민감 정보 감지
- ✅ 커밋 메시지 형식 검사

#### 2.3 Auto Format Check
**파일:** `.github/workflows/auto-format.yml`

**자동 검사:**
- ✅ 코드 포맷팅 일관성 확인
- ✅ 포맷팅 오류 시 자동 수정 제안

### 3. Dependabot (자동 의존성 업데이트)

**파일:** `.github/dependabot.yml`

**자동 기능:**
- ✅ 주간 의존성 업데이트 확인
- ✅ 취약점 발견 시 자동 PR 생성
- ✅ 마이너/패치 업데이트 자동 그룹화
- ✅ 업데이트 PR 자동 라벨링

**설정:**
- Python: 매주 월요일 09:00
- Node.js: 매주 월요일 09:00
- GitHub Actions: 매월

### 4. OpenAPI 타입 자동 생성

**자동화된 타입 동기화:**

```bash
# 로컬에서 수동 실행
cd frontend
npm run generate-types

# CI에서 자동 실행
# - 백엔드 서버 시작
# - OpenAPI 스키마 가져오기
# - TypeScript 타입 생성
# - 타입 검증
```

**CI 통합:**
- PR 생성 시 자동 타입 생성 및 검증
- 타입 불일치 시 빌드 실패

## 📋 개발 워크플로우

### 일반적인 개발 흐름

1. **코드 작성**
   ```bash
   # 기능 개발
   git checkout -b feat/new-feature
   # ... 코드 작성 ...
   ```

2. **자동 포맷팅 (Pre-commit)**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # Pre-commit hooks가 자동으로:
   # - 코드 포맷팅 (Black, Prettier)
   # - 린팅 검사
   # - 문법 검사
   ```

3. **PR 생성**
   ```bash
   git push origin feat/new-feature
   # GitHub Actions가 자동으로:
   # - 코드 품질 검사
   # - 테스트 실행
   # - 타입 검증
   # - 보안 스캔
   ```

4. **자동 검증 통과 후 머지**
   - 모든 검사 통과 시 PR 머지 가능
   - 실패 시 자동으로 피드백 제공

## 🛠️ 수동 실행 명령어

### 코드 포맷팅

```bash
# Python
cd backend
black app/

# TypeScript/JavaScript
cd frontend
npm run format
```

### 린팅

```bash
# Python
cd backend
flake8 app/

# TypeScript
cd frontend
npm run lint
npm run lint:fix  # 자동 수정
```

### 타입 검사

```bash
# Python (선택사항)
cd backend
mypy app/

# TypeScript
cd frontend
npm run type-check
```

### 테스트

```bash
# Backend
cd backend
pytest tests/unit -v
pytest tests/integration -v
pytest tests/ -v --cov=app --cov-report=html

# Frontend (추가 시)
cd frontend
npm test
```

## 🔧 설정 파일

### Pre-commit
- `.pre-commit-config.yaml` - Pre-commit hooks 설정

### 코드 포맷팅
- `backend/pyproject.toml` - Black, MyPy, Pytest 설정
- `frontend/.prettierrc.json` - Prettier 설정
- `backend/.flake8` - Flake8 설정

### CI/CD
- `.github/workflows/ci-comprehensive.yml` - 종합 CI 파이프라인
- `.github/workflows/pr-validation.yml` - PR 검증
- `.github/workflows/auto-format.yml` - 포맷팅 검사
- `.github/dependabot.yml` - 의존성 자동 업데이트

## 🎯 품질 게이트 기준

PR 머지 전 필수 통과 항목:

1. ✅ **코드 포맷팅** - Black, Prettier 통과
2. ✅ **린팅** - Flake8, ESLint 통과
3. ✅ **타입 검사** - TypeScript 컴파일 성공
4. ✅ **테스트** - 모든 테스트 통과
5. ✅ **커버리지** - 60% 이상 (경고만, 차단 안 함)
6. ✅ **OpenAPI 검증** - 타입 생성 성공
7. ✅ **보안 스캔** - 심각한 취약점 없음

## 🚨 문제 해결

### Pre-commit hooks가 실행되지 않을 때

```bash
# 재설치
pre-commit uninstall
pre-commit install

# 수동 실행
pre-commit run --all-files
```

### 포맷팅 오류가 계속 발생할 때

```bash
# Python
cd backend
black app/ --diff  # 변경사항 확인
black app/         # 자동 수정

# TypeScript
cd frontend
npm run format:check  # 확인
npm run format        # 자동 수정
```

### CI에서 실패할 때

1. 로컬에서 동일한 명령어 실행
2. 오류 메시지 확인
3. 자동 수정 가능한 경우 수정 후 재커밋
4. 수동 수정 필요 시 코드 변경

## 💡 팁

1. **자동 수정 활용**: Pre-commit hooks가 자동으로 포맷팅을 수정하므로, 커밋 전에 한 번 더 커밋하면 자동 수정된 내용이 포함됩니다.

2. **로컬에서 먼저 테스트**: CI에서 실패하기 전에 로컬에서 검사:
   ```bash
   pre-commit run --all-files
   ```

3. **의존성 업데이트**: Dependabot이 생성한 PR은 자동으로 테스트되므로 안심하고 머지 가능합니다.

4. **타입 생성**: 백엔드 스키마 변경 후 프론트엔드 타입 자동 생성:
   ```bash
   # 백엔드 서버 실행 후
   cd frontend
   npm run generate-types
   ```

---

**이 자동화 시스템을 통해 코드 품질을 유지하면서 개발 속도를 높일 수 있습니다!** 🚀
