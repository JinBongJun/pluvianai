# 다음 단계 구현 가이드

## 완료된 작업 ✅

1. **Subscription Backend**
   - Subscription 및 Usage 모델 생성
   - 구독 서비스 구현
   - 구독 API 엔드포인트 생성
   - 사용량 제한 미들웨어 구현

2. **UI Component Library**
   - 핵심 UI 컴포넌트 생성
   - 디자인 시스템 업데이트

3. **Slack-Style Navigation**
   - Sidebar 및 DashboardLayout 구현
   - 페이지 업데이트

4. **Subscription UI**
   - UsageDashboard, PlanSelector, Billing 페이지 구현

5. **데이터베이스 마이그레이션**
   - Admin 엔드포인트 업데이트
   - 신규 사용자 자동 구독 생성
   - 기존 사용자 마이그레이션 스크립트

## 다음 단계

### 1. 데이터베이스 마이그레이션 실행

#### 로컬 개발 환경:
```bash
# 백엔드 실행 후
curl -X POST http://localhost:8000/api/v1/admin/init-db

# 또는 Python 스크립트 실행
cd backend
python scripts/migrate_existing_users.py
```

#### 프로덕션 (Railway):
```bash
# Railway 대시보드에서 터미널 열기 또는
curl -X POST https://your-backend-url.up.railway.app/api/v1/admin/init-db
```

### 2. 사용자 정보 API 엔드포인트 추가

현재 프론트엔드에서 사용자 이메일/이름을 가져오는 방법이 제한적입니다. 
사용자 정보 엔드포인트를 추가하는 것이 좋습니다:

```python
# backend/app/api/v1/endpoints/auth.py에 추가
@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information"""
    return current_user
```

### 3. 프론트엔드 사용자 정보 로드 개선

`DashboardLayout`에서 사용자 정보를 제대로 로드하도록 개선:

```typescript
// frontend/components/layout/DashboardLayout.tsx
const loadData = async () => {
  try {
    const [projectsData, userData, subscriptionData] = await Promise.all([
      projectsAPI.list(),
      authAPI.getMe(), // 새 엔드포인트
      subscriptionAPI.getCurrent().catch(() => null),
    ]);
    
    setProjects(projectsData);
    setUserEmail(userData.email);
    setUserName(userData.full_name || '');
    
    if (subscriptionData) {
      setUserPlan(subscriptionData.plan_type || 'free');
    }
  } catch (error) {
    console.error('Failed to load data:', error);
  } finally {
    setLoading(false);
  }
};
```

### 4. Paddle 통합 (선택사항)

현재는 placeholder입니다. 실제 Paddle 통합을 원한다면:

1. Paddle 계정 생성
2. API 키 설정
3. `backend/app/api/v1/endpoints/subscription.py`의 `initiate_upgrade` 함수 구현
4. Webhook 핸들러 구현

### 5. 테스트

#### 백엔드 테스트:
```bash
# 구독 조회
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/subscription

# 플랜 목록 조회
curl http://localhost:8000/api/v1/subscription/plans
```

#### 프론트엔드 테스트:
1. 로그인
2. 대시보드에서 Sidebar 확인
3. `/settings/billing` 페이지 접속
4. 플랜 선택 및 업그레이드 플로우 테스트

### 6. 사용량 추적 구현

API 호출 시 자동으로 사용량을 추적하도록 `proxy.py` 엔드포인트에 추가:

```python
# backend/app/api/v1/endpoints/proxy.py
from app.services.subscription_service import SubscriptionService

# API 호출 후
service = SubscriptionService(db)
service.increment_usage(user_id, "api_calls", 1, project_id)
```

### 7. 기능 접근 제어

각 기능별로 플랜 체크를 추가:

```python
# 예: Multi-model comparison 엔드포인트
from app.services.subscription_service import SubscriptionService

service = SubscriptionService(db)
if not service.check_feature_access(user_id, "multi_model_comparison"):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Multi-model comparison requires Startup plan or higher"
    )
```

## 우선순위

1. **높음**: 데이터베이스 마이그레이션 실행
2. **높음**: 사용자 정보 API 엔드포인트 추가
3. **중간**: 프론트엔드 사용자 정보 로드 개선
4. **중간**: 사용량 추적 구현
5. **낮음**: Paddle 통합 (나중에)
6. **낮음**: 기능 접근 제어 강화

## 체크리스트

- [ ] 데이터베이스 마이그레이션 실행
- [ ] 기존 사용자 구독 생성
- [ ] 사용자 정보 API 엔드포인트 추가
- [ ] 프론트엔드 사용자 정보 로드 개선
- [ ] API 호출 사용량 추적 구현
- [ ] 프로젝트 생성 제한 테스트
- [ ] 팀 멤버 추가 제한 테스트
- [ ] 구독 플랜 변경 테스트
- [ ] 사용량 대시보드 확인


