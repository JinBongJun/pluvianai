# Feature Flags 가이드

AgentGuard는 Feature Flags를 사용하여 점진적 배포와 A/B 테스트를 지원합니다.

## 🚀 빠른 시작

### 환경 변수로 설정

```bash
# Feature flag 활성화
export FEATURE_FLAG_NEW_DASHBOARD=true
export FEATURE_FLAG_ENHANCED_ANALYTICS=true
export FEATURE_FLAG_BETA_FEATURES=false
```

### 코드에서 사용

```python
from app.core.feature_flags import feature_flags

# Feature flag 확인
if feature_flags.is_enabled("new_dashboard", user_id=current_user.id):
    # 새 대시보드 표시
    return render_new_dashboard()
else:
    # 기존 대시보드 표시
    return render_old_dashboard()
```

## 📋 기본 Feature Flags

- `new_dashboard`: 새 대시보드 UI
- `enhanced_analytics`: 향상된 분석 기능
- `beta_features`: 베타 기능 활성화
- `experimental_api`: 실험적 API 엔드포인트

## 🔧 API 사용

### 모든 Feature Flags 조회

```bash
GET /api/v1/feature-flags
Authorization: Bearer <token>

Response:
{
  "new_dashboard": true,
  "enhanced_analytics": false,
  "beta_features": false,
  "experimental_api": false
}
```

### 특정 Feature Flag 확인

```bash
GET /api/v1/feature-flags/new_dashboard
Authorization: Bearer <token>

Response:
{
  "flag": "new_dashboard",
  "enabled": true
}
```

## 🎯 사용 사례

### 1. 점진적 배포

```python
# 새 기능을 일부 사용자에게만 노출
if feature_flags.is_enabled("new_feature", user_id=user.id):
    # 새 기능 사용
    result = new_feature_logic()
else:
    # 기존 기능 사용
    result = old_feature_logic()
```

### 2. A/B 테스트

```python
# 사용자 그룹별로 다른 기능 제공
if feature_flags.is_enabled("variant_b", user_id=user.id):
    # Variant B
    return variant_b_ui()
else:
    # Variant A (기본)
    return variant_a_ui()
```

### 3. 베타 기능

```python
# 베타 사용자에게만 기능 제공
if feature_flags.is_enabled("beta_features", user_id=user.id):
    # 베타 기능 활성화
    enable_beta_features()
```

## 🔄 고급 기능 (향후 구현)

### 사용자별 Feature Flags

```python
# 특정 사용자에게만 활성화
feature_flags.enable_for_user("new_feature", user_id=123)
```

### 퍼센트 기반 롤아웃

```python
# 10%의 사용자에게만 활성화
feature_flags.enable_percentage("new_feature", percentage=10)
```

### 시간 기반 Feature Flags

```python
# 특정 시간에만 활성화
feature_flags.enable_during("new_feature", start_time, end_time)
```

## 📚 추가 리소스

- [Feature Flags 모범 사례](https://martinfowler.com/articles/feature-toggles.html)

---

**Feature Flags로 안전하게 새 기능을 배포하세요!** 🚀
