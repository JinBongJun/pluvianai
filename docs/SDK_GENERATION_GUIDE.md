# SDK 자동 생성 가이드

AgentGuard는 OpenAPI 스키마에서 자동으로 SDK를 생성합니다.

## 🚀 생성되는 SDK

1. **Python SDK** - `sdk/python-generated/`
2. **TypeScript SDK** - `sdk/typescript-generated/`
3. **Node.js SDK** - `sdk/node-generated/`

## 📋 자동 생성 프로세스

### GitHub Actions

매일 자동으로:
1. 백엔드 서버 시작
2. OpenAPI 스키마 가져오기
3. SDK 생성
4. PR 자동 생성 (변경사항이 있는 경우)

### 수동 생성

```bash
# 1. 백엔드 서버 시작
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. OpenAPI 스키마 가져오기
curl http://localhost:8000/openapi.json > openapi.json

# 3. SDK 생성
npm install -g @openapitools/openapi-generator-cli

# Python SDK
openapi-generator-cli generate \
  -i openapi.json \
  -g python \
  -o sdk/python-generated \
  --package-name agentguard_sdk

# TypeScript SDK
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o sdk/typescript-generated

# Node.js SDK
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-node \
  -o sdk/node-generated
```

## 🔧 사용 방법

### Python SDK

```python
from agentguard_sdk import AgentGuardClient

client = AgentGuardClient(
    base_url="https://api.agentguard.com",
    api_key="your-api-key"
)

# Get projects
projects = client.projects.list_projects()

# Get API calls
api_calls = client.api_calls.list_api_calls(project_id=1)
```

### TypeScript SDK

```typescript
import { AgentGuardClient } from '@agentguard/sdk';

const client = new AgentGuardClient({
  baseURL: 'https://api.agentguard.com',
  apiKey: 'your-api-key'
});

// Get projects
const projects = await client.projects.listProjects();

// Get API calls
const apiCalls = await client.apiCalls.listApiCalls({ projectId: 1 });
```

### Node.js SDK

```javascript
const { AgentGuardClient } = require('@agentguard/node-sdk');

const client = new AgentGuardClient({
  baseURL: 'https://api.agentguard.com',
  apiKey: 'your-api-key'
});

// Get projects
client.projects.listProjects()
  .then(projects => console.log(projects))
  .catch(error => console.error(error));
```

## 📦 배포

### Python SDK (PyPI)

```bash
cd sdk/python-generated
python setup.py sdist bdist_wheel
twine upload dist/*
```

### TypeScript/Node.js SDK (npm)

```bash
cd sdk/typescript-generated
npm publish

cd ../node-generated
npm publish
```

## 🔄 업데이트 프로세스

1. **API 변경**: 백엔드 API 수정
2. **스키마 업데이트**: OpenAPI 스키마 자동 업데이트
3. **SDK 생성**: GitHub Actions에서 자동 생성
4. **PR 생성**: 변경사항이 있으면 자동 PR 생성
5. **검토 및 머지**: PR 검토 후 머지
6. **배포**: SDK 배포 (수동 또는 자동)

## 📚 추가 리소스

- [OpenAPI Generator](https://openapi-generator.tech/)
- [OpenAPI 스펙](https://swagger.io/specification/)

---

**자동 생성된 SDK로 개발자 경험을 향상시키세요!** 🚀
