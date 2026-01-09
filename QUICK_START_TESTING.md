# 빠른 테스트 시작 가이드

## 🚀 3단계로 시작하기

### 1단계: 의존성 설치

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-test.txt
```

### 2단계: 테스트 실행

```bash
# 모든 테스트 실행
pytest

# 커버리지 포함
pytest --cov=app --cov-report=term
```

### 3단계: 결과 확인

테스트가 통과하면 ✅, 실패하면 ❌ 표시됩니다.

---

## 📝 주요 명령어

```bash
# Unit tests만
pytest -m unit

# Integration tests만
pytest -m integration

# 특정 파일만
pytest tests/unit/test_cache_service.py

# 상세 출력
pytest -v

# 커버리지 HTML 리포트
pytest --cov=app --cov-report=html
# 브라우저에서 htmlcov/index.html 열기
```

---

## 🐛 문제 해결

### Import 에러
```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)/backend"
pytest
```

### 테스트 실패
```bash
# 상세한 에러 메시지
pytest -v --tb=long
```

---

## 📚 더 알아보기

- 상세 가이드: `TESTING_GUIDE.md`
- 최적화 전략: `OPTIMIZATION_AND_TESTING.md`
- 테스트 구조: `backend/tests/README.md`
