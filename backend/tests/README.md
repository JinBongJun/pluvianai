# Backend test guide

This directory contains tests for the PluvianAI backend (FastAPI).

---

## 🚀 Quick start

### 1. Use Python 3.11

The backend test environment is currently standardized on **Python 3.11**.

- `backend/.venv` should be created with Python 3.11.
- Python 3.14 is not a supported test runtime for this repo today. We verified local failures there from pinned dependencies and import compatibility, including `psycopg2-binary==2.9.9`, `spacy==3.7.2`, and `sqlalchemy==2.0.23` from [`requirements.txt`](../requirements.txt) and [`pyproject.toml`](../pyproject.toml).

### 2. Set up the test environment

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-test.txt
```

PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install -r requirements-test.txt
```

If `backend/.venv` was created with a Python executable that no longer exists, recreate it. A broken `pyvenv.cfg` will cause `pytest.exe` and other launchers to fail before tests even start.

### 3. Run tests

```bash
# Run all tests
pytest

# Run a specific test file
pytest tests/unit/test_cache_service.py

# Run with coverage report
pytest --cov=app --cov-report=html

# Run by marker
pytest -m unit          # Unit tests only
pytest -m integration   # Integration tests only
pytest -m e2e           # E2E tests only
```

---

## 📁 Test layout

```text
tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests (majority)
│   └── test_cache_service.py
├── integration/             # Integration tests
│   ├── test_api_auth.py
│   └── test_api_projects.py
└── e2e/                     # End‑to‑end tests
    └── test_user_flows.py
```

---

## 🧪 Writing tests

### Unit test example

```python
# tests/unit/test_quality_evaluator.py
import pytest
from app.services.quality_evaluator import QualityEvaluator


def test_evaluate_valid_response():
    evaluator = QualityEvaluator()
    api_call = create_mock_api_call(...)

    score = evaluator.evaluate(api_call)

    assert 0 <= score.overall_score <= 100
```

### Integration test example

```python
# tests/integration/test_api_projects.py
import pytest


@pytest.mark.integration
def test_create_project(client, auth_headers):
    response = client.post(
        "/api/v1/projects",
        json={"name": "Test", "description": "Test"},
        headers=auth_headers,
    )

    assert response.status_code == 201
```

---

## 📊 Coverage targets (guideline)

- **Unit tests**: ≥ 80%
- **Integration tests**: ≥ 60%
- **Overall**: ≥ 70%

---

## 🔧 Common fixtures

Typical fixtures defined in `conftest.py` (may evolve over time):

- `db`: test database session
- `client`: FastAPI test client
- `test_user`: seeded test user
- `auth_headers`: auth headers for the test user
- `test_project`: seeded test project

### Example usage

```python
def test_get_project(client, auth_headers, test_project):
    response = client.get(
        f"/api/v1/projects/{test_project.id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
```

---

## 🐛 Troubleshooting

### Test DB connection issues

Make sure test environment variables are set, for example:

```bash
export DATABASE_URL=sqlite:///:memory:
export REDIS_URL=redis://localhost:6379/0
```

On PowerShell:

```powershell
$env:DATABASE_URL = "sqlite:///./test.db"
$env:REDIS_URL = "redis://localhost:6379/0"
```

### Redis not available

Tests are designed to run even without Redis. `CacheService` will automatically fall back or be disabled when Redis is not reachable.

---

## ✅ Test checklist

- [ ] Tests are independent (no cross‑test ordering dependencies)
- [ ] Data is cleaned up between tests
- [ ] Test names clearly describe behavior
- [ ] Follow Arrange‑Act‑Assert pattern
- [ ] Include edge‑case and error‑path tests where relevant

---

## 🚀 CI/CD

GitHub Actions runs the test suite automatically on:

- Pushes to main/develop
- Pull requests

Coverage reports can be uploaded to Codecov or a similar service (see CI config).
