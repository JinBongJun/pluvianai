# AgentGuard 아키텍처 가이드

서비스 확장에 따른 아키텍처 변화를 설명합니다.

## 아키텍처 진화

### Phase 1: MVP (현재)
```
┌─────────────┐
│   Vercel    │ ← 프론트엔드 (Next.js)
│  (무료)     │
└──────┬──────┘
       │ API 호출
       ▼
┌─────────────┐
│  Railway    │ ← 백엔드 (FastAPI)
│  ($5-20/월) │
└──────┬──────┘
       │
       ├── PostgreSQL (Railway)
       └── Redis (Railway, 선택)
```

### Phase 2: 성장 (100-1,000 고객)
```
┌─────────────┐
│   Vercel    │ ← 프론트엔드 (Next.js)
│  (Pro $20)  │   - 글로벌 CDN
│             │   - Edge Functions
└──────┬──────┘
       │ API 호출
       ▼
┌─────────────┐
│  Railway    │ ← 백엔드 (FastAPI)
│ ($20-50/월) │   - 스케일 업
│             │   - 자동 스케일링
└──────┬──────┘
       │
       ├── PostgreSQL (Railway, 업그레이드)
       └── Redis (Railway, 클러스터)
```

### Phase 3: 확장 (1,000-10,000 고객)
```
┌─────────────┐
│   Vercel    │ ← 프론트엔드 (Next.js) - 계속 유지!
│  (Pro $20)  │   - 최적의 Next.js 호스팅
│             │   - 글로벌 CDN
│             │   - Edge Functions
└──────┬──────┘
       │ API 호출
       ▼
┌─────────────┐
│  Railway    │ ← 백엔드 (FastAPI)
│ ($50-100/월)│   - 더 큰 인스턴스
│             │   - 읽기 전용 복제본
└──────┬──────┘
       │
       ├── PostgreSQL (Railway, 파티셔닝)
       ├── Redis (Railway, 클러스터)
       └── Celery/RQ (비동기 작업)
```

### Phase 4: 대규모 (10,000+ 고객) - 하이브리드 아키텍처
```
┌─────────────┐
│   Vercel    │ ← 프론트엔드 (Next.js) - 계속 유지!
│  (Pro $20)  │   ✅ Next.js 최적화
│             │   ✅ 글로벌 CDN
│             │   ✅ Edge Functions
│             │   ✅ 자동 배포
└──────┬──────┘
       │ API 호출
       ▼
┌─────────────────────────────────┐
│      AWS / GCP / Azure          │ ← 백엔드 전환
│                                 │
│  ┌──────────────┐              │
│  │ Kubernetes   │              │
│  │ (EKS/GKE/AKS)│              │
│  └──────┬───────┘              │
│         │                      │
│    ┌────┴────┐                 │
│    │         │                 │
│  FastAPI   FastAPI            │
│  (Pod 1)   (Pod 2)            │
│    │         │                 │
│    └────┬────┘                 │
│         │                      │
│  ┌──────┴──────┐               │
│  │ Load        │               │
│  │ Balancer    │               │
│  └─────────────┘               │
└──────┬──────────────────────────┘
       │
       ├── RDS/Cloud SQL (PostgreSQL)
       │   - Multi-AZ
       │   - 읽기 전용 복제본
       │   - 자동 백업
       │
       ├── ElastiCache/Cloud Memorystore (Redis)
       │   - 클러스터 모드
       │   - 고가용성
       │
       └── SQS/Pub/Sub (메시지 큐)
           - 비동기 작업
           - 이벤트 처리
```

## 왜 프론트엔드는 Vercel을 계속 사용하나?

### Vercel의 장점 (프론트엔드용)

1. **Next.js 최적화**
   - Vercel은 Next.js를 만든 회사
   - 자동 최적화 및 빌드
   - Image Optimization 자동

2. **글로벌 CDN**
   - 전 세계 엣지 서버
   - 자동 배포
   - 빠른 응답 시간

3. **Edge Functions**
   - 서버리스 함수
   - 지역별 최적화
   - 낮은 지연 시간

4. **비용 효율성**
   - Pro: $20/월 (무제한 대역폭)
   - AWS CloudFront + S3보다 저렴
   - 관리 부담 없음

5. **자동 배포**
   - Git Push → 자동 배포
   - Preview 배포
   - 롤백 쉬움

### AWS/GCP로 프론트엔드 전환 시 단점

1. **복잡성 증가**
   - CloudFront + S3 + Lambda 설정
   - 빌드 파이프라인 구축
   - CDN 설정 복잡

2. **비용 증가**
   - CloudFront: $0.085/GB
   - S3: $0.023/GB
   - Lambda: 요청당 비용
   - 총 비용이 Vercel보다 비쌀 수 있음

3. **관리 부담**
   - 인프라 직접 관리
   - 모니터링 설정
   - 보안 설정

## 하이브리드 아키텍처가 최선인 이유

### 프론트엔드: Vercel
- ✅ Next.js 최적화
- ✅ 글로벌 CDN
- ✅ 간단한 배포
- ✅ 비용 효율적

### 백엔드: AWS/GCP
- ✅ 대규모 확장성
- ✅ 고가용성
- ✅ 세밀한 제어
- ✅ 엔터프라이즈 기능

## 실제 사례

### 대규모 서비스들의 하이브리드 아키텍처

1. **Vercel + AWS**
   - 프론트엔드: Vercel
   - 백엔드: AWS (API Gateway + Lambda)
   - 데이터베이스: RDS

2. **Vercel + GCP**
   - 프론트엔드: Vercel
   - 백엔드: GCP (Cloud Run)
   - 데이터베이스: Cloud SQL

3. **Vercel + Railway (현재)**
   - 프론트엔드: Vercel
   - 백엔드: Railway
   - 데이터베이스: Railway PostgreSQL

## 전환 시나리오

### 시나리오 1: Railway → AWS 전환

**전환 대상:**
- ✅ 백엔드 (FastAPI)
- ✅ PostgreSQL
- ✅ Redis
- ✅ 메시지 큐

**유지 대상:**
- ✅ 프론트엔드 (Vercel)
- ✅ Git 저장소 (GitHub)

**전환 단계:**
1. AWS 인프라 구축 (EKS, RDS, ElastiCache)
2. 백엔드 마이그레이션
3. 데이터 마이그레이션
4. DNS 업데이트 (백엔드 URL만 변경)
5. Vercel 환경 변수 업데이트 (`NEXT_PUBLIC_API_URL`)
6. Railway 종료

### 시나리오 2: Railway → GCP 전환

**전환 대상:**
- ✅ 백엔드 (Cloud Run 또는 GKE)
- ✅ Cloud SQL (PostgreSQL)
- ✅ Cloud Memorystore (Redis)

**유지 대상:**
- ✅ 프론트엔드 (Vercel)

## 비용 비교

### 현재 (Railway + Vercel)
- Vercel Pro: $20/월
- Railway: $20-50/월
- **총: $40-70/월**

### AWS 전환 후
- Vercel Pro: $20/월 (유지)
- AWS (EKS + RDS + ElastiCache): $200-500/월
- **총: $220-520/월**

### GCP 전환 후
- Vercel Pro: $20/월 (유지)
- GCP (GKE + Cloud SQL + Memorystore): $150-400/월
- **총: $170-420/월**

## 결론

### 프론트엔드는 Vercel 유지 권장

**이유:**
1. Next.js 최적화
2. 글로벌 CDN 자동
3. 비용 효율적
4. 관리 부담 없음
5. 대규모 서비스에서도 충분

### 백엔드만 전환

**전환 시점:**
- 10,000+ 고객
- 더 큰 확장성 필요
- 엔터프라이즈 기능 필요
- 비용 최적화 필요

**전환 대상:**
- 백엔드 서버
- 데이터베이스
- 캐시
- 메시지 큐

**유지 대상:**
- 프론트엔드 (Vercel)
- Git 저장소
- CI/CD (GitHub Actions)

## 권장 아키텍처 (최종)

```
프론트엔드: Vercel (항상)
    ↓
백엔드: Railway → AWS/GCP (필요시 전환)
    ↓
데이터베이스: Railway → RDS/Cloud SQL (필요시 전환)
```

**핵심**: 프론트엔드와 백엔드는 독립적으로 확장 가능합니다!


