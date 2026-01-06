# 데이터베이스 마이그레이션 가이드

새로운 Subscription 및 Usage 모델을 데이터베이스에 추가하는 방법입니다.

## 방법 1: Admin 엔드포인트 사용 (권장)

배포된 서버에서 다음 엔드포인트를 호출합니다:

```bash
# Railway 배포된 경우
curl -X POST https://your-backend-url.up.railway.app/api/v1/admin/init-db

# 로컬 개발 환경
curl -X POST http://localhost:8000/api/v1/admin/init-db
```

이 엔드포인트는:
- 모든 테이블을 생성합니다 (기존 테이블은 유지)
- `subscriptions` 및 `usage` 테이블을 추가합니다

## 방법 2: Python 스크립트 사용

```python
# migrate.py
from app.core.database import engine, Base
from app.models import (
    User, Project, ProjectMember, APIKey, APICall,
    QualityScore, DriftDetection, Alert, Subscription, Usage
)

# 새 테이블만 생성 (기존 테이블은 유지)
Base.metadata.create_all(bind=engine, checkfirst=True)
print("Migration completed!")
```

실행:
```bash
cd backend
python migrate.py
```

## 방법 3: SQL 직접 실행 (고급)

PostgreSQL에 직접 연결하여:

```sql
-- subscriptions 테이블 생성
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    plan_type VARCHAR(20) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end VARCHAR(5) DEFAULT 'false',
    trial_end TIMESTAMP WITH TIME ZONE,
    paddle_subscription_id VARCHAR(255) UNIQUE,
    paddle_customer_id VARCHAR(255),
    price_per_month REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_subscription_user_status ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_plan ON subscriptions(plan_type, status);
CREATE INDEX IF NOT EXISTS idx_subscription_paddle_sub ON subscriptions(paddle_subscription_id);

-- usage 테이블 생성
CREATE TABLE IF NOT EXISTS usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    project_id INTEGER REFERENCES projects(id),
    metric_type VARCHAR(50) NOT NULL,
    current_usage BIGINT DEFAULT 0,
    limit BIGINT,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_usage_user_metric ON usage(user_id, metric_type, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_project_metric ON usage(project_id, metric_type, period_start);

-- 기존 사용자들에게 free 플랜 구독 생성
INSERT INTO subscriptions (user_id, plan_type, status, current_period_start, current_period_end, cancel_at_period_end)
SELECT 
    id,
    'free',
    'active',
    DATE_TRUNC('month', NOW()),
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date,
    'false'
FROM users
WHERE id NOT IN (SELECT user_id FROM subscriptions WHERE user_id IS NOT NULL);
```

## 기존 사용자 마이그레이션

기존 사용자들에게 자동으로 free 플랜 구독을 생성하려면:

```python
# migrate_existing_users.py
from app.core.database import SessionLocal
from app.models.user import User
from app.models.subscription import Subscription
from datetime import datetime

db = SessionLocal()

try:
    users_without_subscription = db.query(User).filter(
        ~User.id.in_(db.query(Subscription.user_id))
    ).all()
    
    now = datetime.utcnow()
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        period_end = period_start.replace(year=now.year + 1, month=1)
    else:
        period_end = period_start.replace(month=now.month + 1)
    
    for user in users_without_subscription:
        subscription = Subscription(
            user_id=user.id,
            plan_type="free",
            status="active",
            current_period_start=period_start,
            current_period_end=period_end,
            cancel_at_period_end="false"
        )
        db.add(subscription)
    
    db.commit()
    print(f"Created subscriptions for {len(users_without_subscription)} users")
finally:
    db.close()
```

## 확인

마이그레이션이 성공했는지 확인:

```sql
-- 테이블 확인
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('subscriptions', 'usage');

-- 구독 데이터 확인
SELECT COUNT(*) FROM subscriptions;
SELECT plan_type, COUNT(*) FROM subscriptions GROUP BY plan_type;
```

## 주의사항

1. **프로덕션 환경**: Admin 엔드포인트는 보안을 위해 제거하거나 인증을 추가해야 합니다.
2. **데이터 백업**: 마이그레이션 전에 데이터베이스 백업을 권장합니다.
3. **롤백**: 문제 발생 시 백업에서 복원하거나 테이블을 삭제할 수 있습니다:
   ```sql
   DROP TABLE IF EXISTS usage;
   DROP TABLE IF EXISTS subscriptions;
   ```

