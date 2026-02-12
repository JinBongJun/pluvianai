# ?› ï¸?PluvianAI êµ¬í˜„ ê°€?´ë“œ

> **ëª©í‘œ**: ?˜ê²½ ë³€?? ë°°í¬, ?ŒìŠ¤?? SDK ??êµ¬í˜„???„ìš”??ëª¨ë“  ?•ë³´

---

## ?“‹ ëª©ì°¨

1. [?˜ê²½ ë³€???¤ì •](#1-?˜ê²½-ë³€???¤ì •)
2. [ë°°í¬ ì²´í¬ë¦¬ìŠ¤??(#2-ë°°í¬-ì²´í¬ë¦¬ìŠ¤??
3. [?ŒìŠ¤???„ëµ](#3-?ŒìŠ¤???„ëµ)
4. [SDK ë°°í¬ ë°?ê´€ë¦?(#4-sdk-ë°°í¬-ë°?ê´€ë¦?
5. [CI/CD ?Œì´?„ë¼??(#5-cicd-?Œì´?„ë¼??
6. [?±ëŠ¥ ?ŒìŠ¤??(#6-?±ëŠ¥-?ŒìŠ¤??
7. [?˜ê²½ë³??¤ì • ê´€ë¦?(#7-?˜ê²½ë³??¤ì •-ê´€ë¦?

---

## 1. ?˜ê²½ ë³€???¤ì •

### 1.1 ?„ìˆ˜ ?˜ê²½ ë³€??
**?°ì´?°ë² ?´ìŠ¤**:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/PluvianAI
```

**Redis**:
```bash
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
```

**JWT**:
```bash
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
```

**Sentry**:
```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
```

**Stripe** (ê²°ì œ):
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Resend** (?´ë©”???„ì†¡):
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=onboarding@yourdomain.com  # ?ëŠ” onboarding@resend.dev (?ŒìŠ¤?¸ìš©)
EMAIL_FROM_NAME=PluvianAI
```

**AWS S3** (?„ì¹´?´ë¹™):
```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=PluvianAI-archives
```

**LLM API Keys**:
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 1.2 ? íƒ???˜ê²½ ë³€??
**ë¡œê¹…**:
```bash
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json  # json, text
```

**Rate Limiting**:
```bash
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_HOUR=1000
```

**CORS**:
```bash
CORS_ORIGINS=https://app.PluvianAI.ai,https://staging.PluvianAI.ai
```

**ê¸°í?**:
```bash
API_VERSION=v1
ENVIRONMENT=production  # development, staging, production
DEBUG=false
```

### 1.3 ?˜ê²½ ë³€??ê´€ë¦?
**ë¡œì»¬ ê°œë°œ**:
```bash
# .env ?Œì¼ ?¬ìš©
cp .env.example .env
# .env ?Œì¼ ?¸ì§‘
```

**?„ë¡œ?•ì…˜**:
- Railway/Vercel ?˜ê²½ ë³€???¤ì • ?¬ìš©
- ?˜ê²½ ë³€?˜ëŠ” ì½”ë“œ ?€?¥ì†Œ??ì»¤ë°‹?˜ì? ?ŠìŒ
- `.env.example` ?Œì¼???ˆì‹œë§??œê³µ

**Railway ?˜ê²½ ë³€???¤ì •**:
1. Railway ?€?œë³´?????„ë¡œ?íŠ¸ ??Variables
2. `RESEND_API_KEY` ì¶”ê? (Resend ?€?œë³´?œì—??ë°œê¸‰)
3. `EMAIL_FROM` ì¶”ê? (?¸ì¦???„ë©”???ëŠ” `onboarding@resend.dev`)

**Vercel ?˜ê²½ ë³€???¤ì •**:
1. Vercel ?€?œë³´?????„ë¡œ?íŠ¸ ??Settings ??Environment Variables
2. ?„ë¡ ?¸ì—”?œì—???´ë©”???„ì†¡???„ìš”??ê²½ìš°?ë§Œ ?¤ì •

**?˜ê²½ ë³€??ê²€ì¦?*:
```python
# backend/app/core/config.py
from pydantic import BaseSettings, validator

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    jwt_secret_key: str
    
    @validator('database_url')
    def validate_database_url(cls, v):
        if not v.startswith('postgresql://'):
            raise ValueError('Invalid database URL')
        return v
    
    class Config:
        env_file = '.env'
        case_sensitive = False

settings = Settings()
```

---

## 2. ë°°í¬ ì²´í¬ë¦¬ìŠ¤??
### 2.1 ë°°í¬ ??ì²´í¬ë¦¬ìŠ¤??
**ì½”ë“œ ?ˆì§ˆ**:
- [ ] ëª¨ë“  ?ŒìŠ¤???µê³¼
- [ ] ì½”ë“œ ë¦¬ë·° ?„ë£Œ
- [ ] Linter ê²½ê³  ?†ìŒ
- [ ] ?€??ì²´í¬ ?µê³¼ (mypy)

**?°ì´?°ë² ?´ìŠ¤**:
- [ ] ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤í¬ë¦½íŠ¸ ì¤€ë¹?- [ ] ë§ˆì´ê·¸ë ˆ?´ì…˜ ë¡¤ë°± ?¤í¬ë¦½íŠ¸ ì¤€ë¹?- [ ] ë°±ì—… ?„ë£Œ

**?˜ê²½ ë³€??*:
- [ ] ëª¨ë“  ?„ìˆ˜ ?˜ê²½ ë³€???¤ì •
- [ ] ?œí¬ë¦???ë¡œí…Œ?´ì…˜ ?„ë£Œ (?„ìš”??
- [ ] ?˜ê²½ ë³€??ê²€ì¦??„ë£Œ

**?¸í”„??*:
- [ ] ?œë²„ ë¦¬ì†Œ???•ì¸ (CPU, Memory, Disk)
- [ ] ë¡œë“œ ë°¸ëŸ°???¤ì • ?•ì¸
- [ ] ?¬ìŠ¤ ì²´í¬ ?”ë“œ?¬ì¸???•ì¸

**ëª¨ë‹ˆ?°ë§**:
- [ ] Sentry ?µí•© ?•ì¸
- [ ] ë¡œê¹… ?¤ì • ?•ì¸
- [ ] ë©”íŠ¸ë¦??˜ì§‘ ?¤ì • ?•ì¸

### 2.2 ë°°í¬ ?„ë¡œ?¸ìŠ¤

**Blue-Green ë°°í¬**:
1. ??ë²„ì „??Green ?˜ê²½??ë°°í¬
2. ?¬ìŠ¤ ì²´í¬ ?•ì¸
3. ?¸ë˜?½ì„ Green?¼ë¡œ ?„í™˜
4. Blue ?˜ê²½ ëª¨ë‹ˆ?°ë§ (ë¡¤ë°± ì¤€ë¹?
5. ë¬¸ì œ ?†ìœ¼ë©?Blue ?˜ê²½ ì¢…ë£Œ

**ì¹´ë‚˜ë¦?ë°°í¬**:
1. ??ë²„ì „???Œìˆ˜ ?¸ìŠ¤?´ìŠ¤??ë°°í¬
2. ?¸ë˜?½ì˜ 10%ë¥???ë²„ì „?¼ë¡œ ?¼ìš°??3. ëª¨ë‹ˆ?°ë§ ë°?ë©”íŠ¸ë¦??•ì¸
4. ë¬¸ì œ ?†ìœ¼ë©??ì§„?ìœ¼ë¡??¸ë˜??ì¦ê?
5. ëª¨ë“  ?¸ë˜???„í™˜ ?„ë£Œ

### 2.3 ë°°í¬ ??ì²´í¬ë¦¬ìŠ¤??
**ê¸°ëŠ¥ ?•ì¸**:
- [ ] ì£¼ìš” ?”ë“œ?¬ì¸???™ì‘ ?•ì¸
- [ ] ?¸ì¦/?¸ê? ?™ì‘ ?•ì¸
- [ ] ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?•ì¸
- [ ] Redis ?°ê²° ?•ì¸

**?±ëŠ¥ ?•ì¸**:
- [ ] ?‘ë‹µ ?œê°„ ?•ì¸
- [ ] ?ëŸ¬???•ì¸
- [ ] ë¦¬ì†Œ???¬ìš©???•ì¸

**ëª¨ë‹ˆ?°ë§ ?•ì¸**:
- [ ] ë¡œê·¸ ?˜ì§‘ ?•ì¸
- [ ] ë©”íŠ¸ë¦??˜ì§‘ ?•ì¸
- [ ] ?Œë¦¼ ?¤ì • ?•ì¸

---

## 3. ?ŒìŠ¤???„ëµ

### 3.1 ?ŒìŠ¤???¼ë¼ë¯¸ë“œ

**?¨ìœ„ ?ŒìŠ¤??(70%)**:
- ?œë¹„???ˆì´??ë¡œì§ ?ŒìŠ¤??- ? í‹¸ë¦¬í‹° ?¨ìˆ˜ ?ŒìŠ¤??- ?„ë©”??ëª¨ë¸ ?ŒìŠ¤??
**?µí•© ?ŒìŠ¤??(20%)**:
- API ?”ë“œ?¬ì¸???ŒìŠ¤??- ?°ì´?°ë² ?´ìŠ¤ ?µí•© ?ŒìŠ¤??- ?¸ë? ?œë¹„???µí•© ?ŒìŠ¤??(Mock)

**E2E ?ŒìŠ¤??(10%)**:
- ì£¼ìš” ?¬ìš©???œë‚˜ë¦¬ì˜¤ ?ŒìŠ¤??- ?„ì²´ ?Œí¬?Œë¡œ???ŒìŠ¤??
### 3.2 ?ŒìŠ¤??ì»¤ë²„ë¦¬ì? ëª©í‘œ

**ëª©í‘œ ì»¤ë²„ë¦¬ì?**: 80%

**ì¸¡ì • ?„êµ¬**:
- `pytest-cov` (Python)
- `jest --coverage` (TypeScript)

**ì»¤ë²„ë¦¬ì? ë¦¬í¬??*:
```bash
# Python
pytest --cov=app --cov-report=html

# TypeScript
npm test -- --coverage
```

### 3.3 ?ŒìŠ¤???ë™??
**CI/CD ?µí•©**:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v3
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: pytest --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

**?ŒìŠ¤???¤í–‰ ì£¼ê¸°**:
- ì»¤ë°‹ ?? ?¨ìœ„ ?ŒìŠ¤??+ ?µí•© ?ŒìŠ¤??- PR ?? ?„ì²´ ?ŒìŠ¤???¤ìœ„??- ë°°í¬ ?? ?„ì²´ ?ŒìŠ¤??+ E2E ?ŒìŠ¤??
### 3.4 ?ŒìŠ¤???°ì´??ê´€ë¦?
**?ŒìŠ¤???°ì´???ì„±**:
```python
# tests/fixtures.py
import factory
from app.models import User, Project

class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker('name')
    is_active = True

class ProjectFactory(factory.Factory):
    class Meta:
        model = Project
    
    name = factory.Sequence(lambda n: f"Project {n}")
    owner = factory.SubFactory(UserFactory)
```

**?ŒìŠ¤???°ì´??ê²©ë¦¬**:
- ê°??ŒìŠ¤?¸ëŠ” ?…ë¦½?ìœ¼ë¡??¤í–‰
- ?ŒìŠ¤?????°ì´???•ë¦¬ (teardown)
- ?¸ëœ??…˜ ë¡¤ë°± ?œìš©

---

## 4. SDK ë°°í¬ ë°?ê´€ë¦?
### 4.1 Python SDK

**?¨í‚¤ì§€ êµ¬ì¡°**:
```
PluvianAI-python/
?œâ??€ PluvianAI/
??  ?œâ??€ __init__.py
??  ?œâ??€ client.py
??  ?”â??€ middleware.py
?œâ??€ setup.py
?œâ??€ README.md
?”â??€ tests/
```

**setup.py**:
```python
from setuptools import setup, find_packages

setup(
    name="PluvianAI",
    version="1.0.0",
    description="PluvianAI Python SDK",
    author="PluvianAI Team",
    packages=find_packages(),
    install_requires=[
        "requests>=2.28.0",
        "pydantic>=1.10.0",
    ],
    python_requires=">=3.8",
)
```

**PyPI ë°°í¬**:
```bash
# ë¹Œë“œ
python setup.py sdist bdist_wheel

# PyPI ?…ë¡œ??twine upload dist/*
```

**ë²„ì „ ê´€ë¦?*:
- Semantic Versioning (MAJOR.MINOR.PATCH)
- `1.0.0` ??`1.0.1` (?¨ì¹˜)
- `1.0.0` ??`1.1.0` (ë§ˆì´??
- `1.0.0` ??`2.0.0` (ë©”ì´?€)

### 4.2 Node.js SDK

**?¨í‚¤ì§€ êµ¬ì¡°**:
```
PluvianAI-node/
?œâ??€ src/
??  ?œâ??€ index.ts
??  ?œâ??€ client.ts
??  ?”â??€ middleware.ts
?œâ??€ package.json
?œâ??€ tsconfig.json
?œâ??€ README.md
?”â??€ tests/
```

**package.json**:
```json
{
  "name": "@PluvianAI/sdk",
  "version": "1.0.0",
  "description": "PluvianAI Node.js SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "publish": "npm publish --access public"
  },
  "dependencies": {
    "axios": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
```

**npm ë°°í¬**:
```bash
# ë¹Œë“œ
npm run build

# npm ë°°í¬
npm publish --access public
```

### 4.3 SDK ë¬¸ì„œ??
**API ë¬¸ì„œ**:
- ê°??¨ìˆ˜??JSDoc/Python Docstring ì¶”ê?
- ?¬ìš© ?ˆì œ ?¬í•¨
- ?€???ŒíŠ¸/TypeScript ?€???•ì˜

**README.md**:
```markdown
# PluvianAI SDK

## Installation

```bash
pip install PluvianAI
```

## Quick Start

```python
from PluvianAI import PluvianAIClient

client = PluvianAIClient(api_key="your-api-key")

# Create a project
project = client.projects.create(
    name="My Project",
    description="Project description"
)
```

## API Reference

See [API Reference](./API_REFERENCE.md)
```

### 4.4 SDK ë²„ì „ ê´€ë¦?
**?˜ìœ„ ?¸í™˜???•ì±…**:
- ?¨ì¹˜ ë²„ì „: ë²„ê·¸ ?˜ì •ë§?(?˜ìœ„ ?¸í™˜)
- ë§ˆì´??ë²„ì „: ??ê¸°ëŠ¥ ì¶”ê? (?˜ìœ„ ?¸í™˜)
- ë©”ì´?€ ë²„ì „: Breaking Changes

**Deprecation ?•ì±…**:
- Deprecated ê¸°ëŠ¥?€ ìµœì†Œ 2ê°?ë²„ì „ ?™ì•ˆ ? ì?
- Deprecation Notice ëª…ì‹œ
- ë§ˆì´ê·¸ë ˆ?´ì…˜ ê°€?´ë“œ ?œê³µ

---

## 5. CI/CD ?Œì´?„ë¼??
### 5.1 GitHub Actions ?Œí¬?Œë¡œ??
**?ŒìŠ¤???Œí¬?Œë¡œ??*:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v3
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: pytest --cov=app
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

**ë°°í¬ ?Œí¬?Œë¡œ??*:
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Railway
        uses: bervProject/railway-deploy@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: backend
```

### 5.2 ë°°í¬ ?Œì´?„ë¼???¨ê³„

1. **ì½”ë“œ ì²´í¬?„ì›ƒ**
2. **?˜ì¡´???¤ì¹˜**
3. **?ŒìŠ¤???¤í–‰**
4. **ë¹Œë“œ**
5. **ë°°í¬**
6. **?¬ìŠ¤ ì²´í¬**
7. **?Œë¦¼**

---

## 6. ?±ëŠ¥ ?ŒìŠ¤??
### 6.1 ë¶€???ŒìŠ¤??
**?„êµ¬**: Locust

**?ŒìŠ¤???œë‚˜ë¦¬ì˜¤**:
```python
# locustfile.py
from locust import HttpUser, task, between

class PluvianAIUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        # ë¡œê·¸??        response = self.client.post("/api/v1/auth/login", json={
            "email": "user@example.com",
            "password": "password123"
        })
        self.token = response.json()["data"]["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    @task(3)
    def list_projects(self):
        self.client.get("/api/v1/projects", headers=self.headers)
    
    @task(1)
    def create_project(self):
        self.client.post("/api/v1/projects", json={
            "name": "Test Project",
            "description": "Test"
        }, headers=self.headers)
```

**?¤í–‰**:
```bash
locust -f locustfile.py --host=https://api.PluvianAI.ai
```

### 6.2 ?¤íŠ¸?ˆìŠ¤ ?ŒìŠ¤??
**ëª©í‘œ**: ?œìŠ¤???œê³„ ?Œì•…

**?œë‚˜ë¦¬ì˜¤**:
- ?ì§„?ìœ¼ë¡?ë¶€??ì¦ê?
- ?œìŠ¤???¥ì•  ì§€???Œì•…
- ë³µêµ¬ ?œê°„ ì¸¡ì •

### 6.3 ì¹´ì˜¤???”ì??ˆì–´ë§?
**?„êµ¬**: Chaos Monkey

**?œë‚˜ë¦¬ì˜¤**:
- ?œë²„ ì¢…ë£Œ
- ?¤íŠ¸?Œí¬ ì§€??- ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?Šê?
- Redis ?¥ì• 

**ëª©í‘œ**: ë³µêµ¬ ?œê°„ ì¸¡ì • ë°?ê°œì„ 

### 6.4 ?±ëŠ¥ ë²¤ì¹˜ë§ˆí¬

**ë²¤ì¹˜ë§ˆí¬ ?œë‚˜ë¦¬ì˜¤**:
- PII Sanitization: < 50ms
- Firewall: < 100ms
- Proxy Overhead: < 200ms

**ë²¤ì¹˜ë§ˆí¬ ê²°ê³¼ ?€??*:
- ê°?ì»¤ë°‹ë§ˆë‹¤ ë²¤ì¹˜ë§ˆí¬ ?¤í–‰
- ê²°ê³¼ë¥??°ì´?°ë² ?´ìŠ¤???€??- ?±ëŠ¥ ?Œê? ê°ì?

---

## 7. ?˜ê²½ë³??¤ì • ê´€ë¦?
### 7.1 ?˜ê²½ ?•ì˜

**ê°œë°œ ?˜ê²½ (Development)**:
- ë¡œì»¬ ?°ì´?°ë² ?´ìŠ¤
- ë¡œì»¬ Redis
- Debug ëª¨ë“œ ?œì„±??- ?ì„¸ ë¡œê¹…

**?¤í…Œ?´ì§• ?˜ê²½ (Staging)**:
- ?„ë¡œ?•ì…˜ê³?? ì‚¬???¸í”„??- ?ŒìŠ¤???°ì´??- ?„ë¡œ?•ì…˜ ?¤ì • ë¯¸ëŸ¬ë§?
**?„ë¡œ?•ì…˜ ?˜ê²½ (Production)**:
- ?„ë¡œ?•ì…˜ ?°ì´?°ë² ?´ìŠ¤
- ?„ë¡œ?•ì…˜ Redis
- Debug ëª¨ë“œ ë¹„í™œ?±í™”
- ìµœì ?”ëœ ë¡œê¹…

### 7.2 ?˜ê²½ë³?ì°¨ì´??
**ê¸°ëŠ¥ ?Œë˜ê·?*:
```python
# backend/app/core/config.py
class Settings(BaseSettings):
    environment: str = "development"
    
    @property
    def is_development(self) -> bool:
        return self.environment == "development"
    
    @property
    def is_production(self) -> bool:
        return self.environment == "production"
```

**ë¦¬ì†Œ???¬ê¸°**:
- ê°œë°œ: ìµœì†Œ ë¦¬ì†Œ??- ?¤í…Œ?´ì§•: ì¤‘ê°„ ë¦¬ì†Œ??- ?„ë¡œ?•ì…˜: ìµœë? ë¦¬ì†Œ??
**ë¡œê·¸ ?ˆë²¨**:
- ê°œë°œ: DEBUG
- ?¤í…Œ?´ì§•: INFO
- ?„ë¡œ?•ì…˜: WARNING

---

**?‘ì„±??*: 2026-01-XX  
**ë²„ì „**: 1.0.0  
**ì°¸ê³ **: [../DETAILED_DESIGN.md](../DETAILED_DESIGN.md) - ë©”ì¸ ?„í‚¤?ì²˜ ë¬¸ì„œ
