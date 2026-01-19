# 모니터링 빠른 시작 가이드

AgentGuard 모니터링을 빠르게 시작하는 방법입니다.

## 🚀 원클릭 시작

### Windows (PowerShell)
```powershell
.\scripts\start-monitoring.ps1
```

### Linux/Mac (Bash)
```bash
./scripts/start-monitoring.sh
```

스크립트가 자동으로:
1. ✅ 백엔드 상태 확인
2. 🐳 모니터링 스택 시작 (Prometheus + Grafana)
3. 🌐 Grafana 대시보드 자동 열기

## 📊 접속 정보

### Grafana 대시보드
- **URL**: http://localhost:3001
- **Username**: admin
- **Password**: admin

### Prometheus
- **URL**: http://localhost:9090

### 메트릭 엔드포인트
- **URL**: http://localhost:8000/metrics

## 🎯 프론트엔드에서 접근

설정 페이지 → 모니터링 메뉴에서 바로 접근할 수 있습니다:
- http://localhost:3000/settings/monitoring

## 📈 대시보드 확인

Grafana에 로그인하면 **AgentGuard - Complete Overview** 대시보드에서 다음을 확인할 수 있습니다:

### 상단 핵심 지표 (한 줄에 모든 정보)
- 총 요청 수
- 에러율
- 평균 응답 시간
- 활성 사용자 수
- LLM API 호출 수
- 총 비용 (USD)
- 평균 품질 점수
- 활성 프로젝트 수

### 그래프 패널
- API 요청 및 에러 추이
- 응답 시간 (p50, p95, p99)
- LLM API 호출 (프로바이더별)
- 비용 트렌드
- 품질 점수 분포
- 데이터베이스 성능

### 테이블 및 차트
- 상위 엔드포인트 (요청 수 기준)
- 에러 유형별 분류

## 🔧 문제 해결

### 백엔드가 실행되지 않는 경우
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 모니터링 스택 중지
```bash
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml down
```

### 로그 확인
```bash
docker logs agentguard-prometheus
docker logs agentguard-grafana
```

## 🔄 자동 업데이트

백엔드가 시작되면 자동으로:
- 앱 정보 메트릭 업데이트
- 활성 사용자/프로젝트 수 주기적 업데이트 (60초마다)

## 📚 더 알아보기

- [상세 모니터링 가이드](./MONITORING_GUIDE.md)
- [부하 테스트 가이드](./LOAD_TEST_GUIDE.md)
- [Chaos Testing 가이드](./CHAOS_TESTING_GUIDE.md)
