# AgentGuard 기능 개선 계획

**최종 업데이트**: 2026-01-19

---

## 📋 목차

1. [기능 평가 결과](#기능-평가-결과)
2. [최우선 강화 기능](#최우선-강화-기능)
3. [우선 강화 기능](#우선-강화-기능)
4. [유지 기능 (개선)](#유지-기능-개선)
5. [유지 기능 (숨김 처리)](#유지-기능-숨김-처리)
6. [구현 우선순위](#구현-우선순위)
7. [구현 가이드](#구현-가이드)

---

## 기능 평가 결과

### 평가 기준

1. **사용자 니즈**: 실제 사용자들이 얼마나 필요로 하는지
2. **경쟁력**: 경쟁사 대비 차별성
3. **구현 복잡도**: 개발/유지 비용
4. **비즈니스 가치**: 수익/고객 확보 기여도

### 평가 결과 요약

| 기능 | 사용자 니즈 | 경쟁력 | 구현 복잡도 | 비즈니스 가치 | 평가 |
|------|------------|--------|------------|--------------|------|
| **에이전트 체인 프로파일링** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **최우선 강화** |
| **Shadow Routing** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **최우선 강화** |
| **비용 분석 + 자동 최적화** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **최우선 강화** |
| **품질 평가 + Human-in-the-loop** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **우선 강화** |
| **드리프트 감지 + 예측** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **우선 강화** |
| **API 프록시 + 자동 페일오버** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **우선 강화** |
| **벤치마크 비교** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **유지** |
| **알림 시스템** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | **유지** |
| **모니터링 대시보드** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **유지 + 개선** |
| **데이터 아카이빙** | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | **유지 (숨김)** |
| **활동 로그** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | **유지 (낮은 우선순위)** |
| **리포트 생성** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **유지 (간소화)** |

---

## 최우선 강화 기능

### 1. 에이전트 체인 프로파일링 강화

#### 현재 상태
- ✅ 멀티 에이전트 파이프라인 분석
- ✅ Bottleneck 감지
- ✅ 에이전트별 통계

#### 강화 방향

**1.1 실시간 Bottleneck 감지**
- 실시간으로 Bottleneck 에이전트 감지
- 자동 알림 (Bottleneck 발생 시)
- 시각화 개선 (체인 플로우 다이어그램)

**1.2 자동 최적화 제안 (안전장치 포함)**
```python
# backend/app/services/agent_chain_optimizer.py (새로 생성)

class AgentChainOptimizer:
    """
    에이전트 체인 자동 최적화 제안
    - 안전장치 포함
    - 사용자 승인 필수
    """
    
    def suggest_optimizations(
        self,
        project_id: int,
        chain_id: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        최적화 제안만 제공 (자동 적용 안 함)
        """
        # 1. 체인 프로파일링
        profile = self.profiler.profile_chain(project_id, chain_id, db=db)
        
        # 2. 최적화 기회 발견
        optimizations = []
        
        # 병렬화 기회
        parallel_opportunities = self._find_parallel_opportunities(profile)
        for opp in parallel_opportunities:
            optimizations.append({
                "type": "parallelization",
                "agents": opp["agents"],
                "current_latency": opp["current"],
                "optimized_latency": opp["optimized"],
                "improvement": f"{(opp['current'] - opp['optimized']) / opp['current'] * 100:.1f}%",
                "risk_level": "low",  # 안전장치 통과
                "requires_approval": True,  # 승인 필수
            })
        
        # 순서 최적화
        order_optimizations = self._optimize_agent_order(profile)
        
        # 모델 최적화
        model_optimizations = self._optimize_agent_models(profile)
        
        return {
            "suggestions": optimizations,
            "current_performance": {
                "total_latency": profile["total_latency"],
                "success_rate": profile["success_rate"],
            },
            "predicted_improvement": {
                "latency_reduction": "40%",
                "cost_reduction": "25%",
                "success_rate_improvement": "5%",
            },
            "auto_apply": False,  # 자동 적용 안 함
            "requires_approval": True,  # 승인 필수
        }
    
    def _check_safety(self, optimization):
        """
        안전장치 확인
        """
        # 품질 하락 확인
        if optimization.get("quality_change", 0) < -5:
            return False
        
        # 최소 품질 점수 확인
        if optimization.get("new_quality", 100) < 75:
            return False
        
        # 비용 증가 확인
        if optimization.get("cost_change", 0) > 0:
            return False
        
        return True
```

**1.3 시각화 개선**
- 체인 플로우 다이어그램 추가
- 실시간 업데이트
- Bottleneck 하이라이트

**구현 파일**
- `backend/app/services/agent_chain_optimizer.py` (새로 생성)
- `backend/app/api/v1/endpoints/agent_chain.py` (수정)
- `frontend/components/ChainFlowDiagram.tsx` (개선)

---

### 2. Shadow Routing 강화

#### 현재 상태
- ✅ A/B 테스트
- ✅ 모델 비교
- ✅ 자동 알림

#### 강화 방향

**2.1 자동 Shadow 모델 추천**
```python
# backend/app/services/shadow_routing_service.py (수정)

class ShadowRoutingService:
    """
    Shadow Routing 강화
    - 자동 Shadow 모델 추천
    - 점진적 적용
    - 안전장치 포함
    """
    
    def suggest_shadow_models(
        self,
        project_id: int,
        primary_model: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        자동 Shadow 모델 추천 (제안만)
        """
        # 1. 사용 패턴 분석
        usage = self._analyze_usage_pattern(project_id, primary_model, db)
        
        # 2. Shadow 모델 추천
        recommended = self._recommend_shadow_models(usage)
        
        # 3. 테스트 결과 (Shadow Routing으로)
        test_result = self._test_with_shadow_routing(
            project_id,
            primary_model,
            recommended["model"],
            duration_days=7
        )
        
        return {
            "current_model": primary_model,
            "recommended_shadow_model": recommended["model"],
            "estimated_savings": recommended["savings"],
            "test_result": test_result,
            "confidence": self._calculate_confidence(test_result),
            "auto_apply": False,  # 자동 적용 안 함
            "requires_approval": True,  # 승인 필수
        }
    
    def apply_gradually(
        self,
        project_id: int,
        primary_model: str,
        shadow_model: str,
        user_confirmation: bool,
        db: Session
    ):
        """
        점진적 적용 (사용자 승인 후)
        """
        if not user_confirmation:
            raise ValueError("User confirmation required")
        
        # 롤백 포인트 생성
        rollback_point = self._create_rollback_point(project_id, primary_model)
        
        # Phase 1: Shadow Routing 테스트 (10%)
        shadow_result = self._test_with_shadow_routing(
            project_id,
            primary_model,
            shadow_model,
            percentage=10
        )
        
        if not self._validate_shadow_result(shadow_result):
            self._rollback(rollback_point)
            return {"status": "failed", "reason": "Shadow test failed"}
        
        # Phase 2: 점진적 증가 (25% → 50% → 75% → 100%)
        for percentage in [25, 50, 75, 100]:
            result = self._apply_percentage(
                project_id,
                primary_model,
                shadow_model,
                percentage
            )
            
            if not self._validate_result(result):
                self._rollback_to_previous(project_id, percentage)
                return {"status": "failed", "reason": f"Validation failed at {percentage}%"}
        
        return {"status": "success", "rollback_point": rollback_point.id}
```

**2.2 점진적 적용 시스템**
- Shadow Routing 테스트 (10%)
- 단계별 증가 (25% → 50% → 75% → 100%)
- 각 단계마다 검증
- 실패 시 자동 롤백

**구현 파일**
- `backend/app/services/shadow_routing_service.py` (수정)
- `backend/app/api/v1/endpoints/proxy.py` (수정)
- `frontend/app/dashboard/[projectId]/settings/shadow-routing/page.tsx` (새로 생성)

---

### 3. 비용 분석 + 자동 최적화

#### 현재 상태
- ✅ 비용 분석
- ✅ 비용 이상 감지
- ✅ 모델 비교

#### 강화 방향

**3.1 자동 비용 최적화 제안 (안전장치 포함)**
```python
# backend/app/services/cost_optimizer.py (새로 생성)

class CostOptimizer:
    """
    자동 비용 최적화 엔진
    - 안전장치 포함
    - 사용자 승인 필수
    """
    
    SAFETY_THRESHOLDS = {
        "max_quality_drop": 5.0,  # 품질 하락 최대 5%
        "min_quality_score": 75.0,  # 최소 품질 점수 75
        "max_cost_increase": 0.0,  # 비용 증가 불가
        "min_test_samples": 100,  # 최소 테스트 샘플 수
    }
    
    def suggest_optimizations(
        self,
        project_id: int,
        days: int = 30,
        db: Session = None
    ) -> Dict[str, Any]:
        """
        비용 최적화 제안 (제안만, 자동 적용 안 함)
        """
        # 1. 사용 패턴 분석
        usage_patterns = self._analyze_usage_patterns(project_id, days, db)
        
        # 2. 비용 절감 기회 발견
        opportunities = []
        
        # 패턴 1: 고가 모델을 단순 작업에 사용
        for pattern in usage_patterns:
            if pattern["avg_quality_score"] < 70 and pattern["model"].startswith("gpt-4"):
                opportunity = {
                    "type": "model_downgrade",
                    "current": pattern["model"],
                    "recommended": "gpt-3.5-turbo",
                    "savings_percentage": 80,
                    "estimated_monthly_savings": pattern["monthly_cost"] * 0.8,
                    "quality_change": -2.0,  # 예상 품질 변화
                    "risk": "low",
                }
                
                # 안전장치 확인
                if self._check_safety(opportunity):
                    opportunities.append(opportunity)
        
        # 패턴 2: 비슷한 성능의 저가 모델 발견
        # 패턴 3: 사용하지 않는 모델 제거
        
        return {
            "opportunities": opportunities,
            "total_potential_savings": sum(o["estimated_monthly_savings"] for o in opportunities),
            "auto_apply": False,  # 자동 적용 안 함
            "requires_approval": True,  # 승인 필수
        }
    
    def _check_safety(self, opportunity):
        """
        안전장치 확인
        """
        # 품질 하락 확인
        if opportunity.get("quality_change", 0) < -self.SAFETY_THRESHOLDS["max_quality_drop"]:
            return False
        
        # 최소 품질 점수 확인
        if opportunity.get("new_quality", 100) < self.SAFETY_THRESHOLDS["min_quality_score"]:
            return False
        
        # 비용 증가 확인
        if opportunity.get("cost_change", 0) > self.SAFETY_THRESHOLDS["max_cost_increase"]:
            return False
        
        return True
```

**3.2 비용 예측**
- 향후 비용 예측
- 비용 급증 예측
- 예산 초과 경고

**3.3 프로젝트/팀별 비용 할당**
- 프로젝트별 비용 추적
- 팀별 비용 할당
- 비용 리포트

**구현 파일**
- `backend/app/services/cost_optimizer.py` (새로 생성)
- `backend/app/api/v1/endpoints/cost.py` (수정)
- `frontend/app/dashboard/[projectId]/cost/page.tsx` (개선)

---

## 우선 강화 기능

### 4. 품질 평가 + Human-in-the-loop

#### 현재 상태
- ✅ 품질 평가
- ✅ 다차원 점수

#### 강화 방향

**4.1 사용자 피드백 루프**
```python
# backend/app/services/quality_evaluator.py (수정)

class QualityEvaluator:
    """
    품질 평가 + Human-in-the-loop
    """
    
    def evaluate_with_feedback(
        self,
        api_call: APICall,
        user_feedback: Optional[Dict[str, Any]] = None,
        db: Session = None
    ) -> QualityScore:
        """
        사용자 피드백 포함 품질 평가
        """
        # 1. 자동 평가
        quality_score = self.evaluate(api_call, db=db)
        
        # 2. 사용자 피드백 반영
        if user_feedback:
            quality_score.user_feedback = user_feedback
            quality_score.feedback_score = self._calculate_feedback_score(user_feedback)
            quality_score.overall_score = self._combine_scores(
                quality_score.overall_score,
                quality_score.feedback_score
            )
        
        return quality_score
```

**4.2 비즈니스 메트릭 연결**
- 품질 점수 → 사용자 만족도
- 품질 점수 → 성공률
- 품질 점수 → 비즈니스 가치

**구현 파일**
- `backend/app/services/quality_evaluator.py` (수정)
- `backend/app/api/v1/endpoints/quality.py` (수정)
- `frontend/app/dashboard/[projectId]/quality/page.tsx` (개선)

---

### 5. 드리프트 감지 + 예측

#### 현재 상태
- ✅ 드리프트 감지
- ✅ 다차원 분석

#### 강화 방향

**5.1 예측적 드리프트 방지**
```python
# backend/app/services/predictive_drift.py (새로 생성)

class PredictiveDriftPrevention:
    """
    예측적 드리프트 방지
    """
    
    def predict_drift(
        self,
        project_id: int,
        model: str,
        days: int = 30,
        db: Session = None
    ) -> Dict[str, Any]:
        """
        드리프트 발생 예측
        """
        # 1. 과거 데이터 분석
        historical_data = self._get_historical_metrics(project_id, model, days, db)
        
        # 2. 트렌드 분석
        trends = self._analyze_trends(historical_data)
        
        # 3. 드리프트 예측
        predictions = []
        
        # 패턴 1: 점진적 품질 하락
        if trends["quality"]["slope"] < -0.5:
            predictions.append({
                "type": "quality_drift",
                "probability": 0.85,
                "expected_date": trends["quality"]["projected_cross_date"],
                "prevention": {
                    "action": "model_update",
                    "recommended_model": self._get_better_model(model),
                },
            })
        
        # 패턴 2: 비용 급증 예측
        if trends["cost"]["slope"] > 1.5:
            predictions.append({
                "type": "cost_spike",
                "probability": 0.70,
                "expected_date": trends["cost"]["projected_cross_date"],
                "prevention": {
                    "action": "cost_optimization",
                    "recommendations": self._get_cost_optimization_tips(),
                },
            })
        
        return {
            "predictions": predictions,
            "confidence": self._calculate_confidence(predictions),
            "auto_prevention_enabled": False,  # 자동 예방 안 함
        }
```

**5.2 비즈니스 영향 분석**
- 드리프트 → 비즈니스 손실
- 드리프트 → 고객 이탈 위험
- 드리프트 → 수익 영향

**구현 파일**
- `backend/app/services/predictive_drift.py` (새로 생성)
- `backend/app/api/v1/endpoints/drift.py` (수정)
- `frontend/app/dashboard/[projectId]/drift/page.tsx` (개선)

---

### 6. API 프록시 + 자동 페일오버

#### 현재 상태
- ✅ LLM API 프록시
- ✅ 자동 캡처

#### 강화 방향

**6.1 자동 페일오버**
```python
# backend/app/api/v1/endpoints/proxy.py (수정)

@router.post("/{provider}/{path:path}")
async def proxy_request(
    provider: str,
    path: str,
    request: Request,
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    db: Session = Depends(get_db)
):
    """
    LLM API 프록시 + 자동 페일오버
    """
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            # 프록시 요청
            response = await make_proxy_request(provider, path, request, db)
            return response
            
        except Exception as e:
            retry_count += 1
            
            # 페일오버 로직
            if retry_count < max_retries:
                # 대체 프로바이더로 시도
                fallback_provider = get_fallback_provider(provider)
                if fallback_provider:
                    provider = fallback_provider
                    continue
            
            # 모든 재시도 실패
            raise HTTPException(
                status_code=503,
                detail="Service temporarily unavailable"
            )
```

**6.2 지능형 라우팅**
- 비용/성능 균형 고려
- 자동 모델 선택
- 지역별 라우팅

**구현 파일**
- `backend/app/api/v1/endpoints/proxy.py` (수정)
- `backend/app/services/routing_service.py` (새로 생성)

---

## 유지 기능 (개선)

### 7. 벤치마크 비교

#### 개선 방향
- A/B 테스트 통합
- 실시간 비교 대시보드
- 추천 점수 개선

---

### 8. 알림 시스템

#### 개선 방향
- 알림 채널 확대 (Slack, Discord)
- 알림 규칙 커스터마이징
- 알림 그룹핑

---

### 9. 모니터링 대시보드

#### 개선 방향
- 실시간 업데이트
- 커스터마이징 가능한 대시보드
- 비즈니스 메트릭 통합

---

## 유지 기능 (숨김 처리)

### 10. 데이터 아카이빙

#### 전략: 숨김 처리 + 자동화

**현재 상태**
- ✅ 데이터 아카이빙 서비스
- ✅ API 엔드포인트

**개선 방향**

**10.1 자동 실행 (스케줄러)**
```python
# backend/app/services/scheduler_service.py (수정)

@scheduler.scheduled_job('cron', hour=2, minute=0)  # 매일 새벽 2시
def auto_archive_old_data():
    """
    자동으로 오래된 데이터 아카이빙
    """
    from app.services.archiving_service import archiving_service
    
    try:
        stats = archiving_service.archive_old_data()
        logger.info(f"Auto-archived old data: {stats}")
    except Exception as e:
        logger.error(f"Failed to auto-archive: {str(e)}")
```

**10.2 Admin 전용**
- 프론트엔드에서 숨김
- Admin 페이지에만 표시
- API는 유지 (Admin 전용)

**구현 파일**
- `backend/app/services/scheduler_service.py` (수정)
- `frontend/app/settings/admin/archiving/page.tsx` (Admin 전용, 새로 생성)

---

### 11. 활동 로그

#### 전략: 낮은 우선순위 유지

**현재 상태**
- ✅ 활동 로그 서비스
- ✅ API 엔드포인트
- ✅ 프론트엔드 페이지

**개선 방향**
- 유지하되 낮은 우선순위
- 향후 강화 가능
- 감사 목적으로 필요

---

### 12. 리포트 생성

#### 전략: 간소화

**현재 상태**
- ✅ 리포트 생성 API
- ✅ 프론트엔드 페이지

**개선 방향**
- 기본 기능만 유지
- 복잡한 리포트는 보류
- Export 기능과 통합

---

## 구현 우선순위

### Phase 1: 최우선 강화 (1-2주)

1. **에이전트 체인 프로파일링 강화**
   - 실시간 Bottleneck 감지
   - 자동 최적화 제안 (안전장치 포함)
   - 시각화 개선

2. **Shadow Routing 강화**
   - 자동 Shadow 모델 추천
   - 점진적 적용 시스템

3. **비용 분석 + 자동 최적화**
   - 자동 비용 최적화 제안 (안전장치 포함)
   - 비용 예측

---

### Phase 2: 우선 강화 (2-4주)

4. **품질 평가 + Human-in-the-loop**
   - 사용자 피드백 루프
   - 비즈니스 메트릭 연결

5. **드리프트 감지 + 예측**
   - 예측적 드리프트 방지
   - 비즈니스 영향 분석

6. **API 프록시 + 자동 페일오버**
   - 자동 페일오버
   - 지능형 라우팅

---

### Phase 3: 유지 기능 개선 (1-2주)

7. **벤치마크 비교 개선**
8. **알림 시스템 개선**
9. **모니터링 대시보드 개선**

---

### Phase 4: 숨김 처리 (1주)

10. **데이터 아카이빙 자동화**
11. **활동 로그 낮은 우선순위 유지**
12. **리포트 생성 간소화**

---

## 구현 가이드

### 안전한 자동화 원칙

1. **자동 적용 금지**
   - 모든 변경은 사용자 승인 필요
   - `auto_apply: False` 기본값

2. **안전장치 필수**
   - 품질 하락 제한
   - 최소 품질 점수
   - 비용 증가 방지

3. **점진적 적용**
   - Shadow Routing 테스트 먼저
   - 단계별 증가 (10% → 25% → 50% → 100%)
   - 각 단계마다 검증

4. **롤백 가능**
   - 적용 전 상태 저장
   - 언제든 롤백 가능
   - 자동 롤백 옵션

5. **테스트 먼저**
   - Shadow Routing으로 충분한 테스트
   - 최소 샘플 수 확보
   - 테스트 결과 기반 추천

6. **투명성**
   - 모든 변경사항 공개
   - 위험 요소 명시
   - 완화 방안 제시

---

### 공통 구현 패턴

#### 1. 제안만 제공 (자동 적용 안 함)

```python
def suggest_optimization(project_id: int) -> Dict[str, Any]:
    """
    최적화 제안만 제공
    """
    suggestions = analyze_and_suggest(project_id)
    
    return {
        "suggestions": suggestions,
        "auto_apply": False,  # 항상 False
        "requires_approval": True,  # 승인 필수
        "estimated_impact": {
            "cost_savings": "$500/month",
            "quality_change": "+2%",
            "risk_level": "low"
        }
    }
```

#### 2. 안전장치 확인

```python
def check_safety(suggestion: Dict[str, Any]) -> bool:
    """
    안전장치 확인
    """
    SAFETY_THRESHOLDS = {
        "max_quality_drop": 5.0,
        "min_quality_score": 75.0,
        "max_cost_increase": 0.0,
    }
    
    # 품질 하락 확인
    if suggestion["quality_change"] < -SAFETY_THRESHOLDS["max_quality_drop"]:
        return False
    
    # 최소 품질 점수 확인
    if suggestion["new_quality"] < SAFETY_THRESHOLDS["min_quality_score"]:
        return False
    
    # 비용 증가 확인
    if suggestion["cost_change"] > SAFETY_THRESHOLDS["max_cost_increase"]:
        return False
    
    return True
```

#### 3. 점진적 적용

```python
def apply_gradually(
    project_id: int,
    suggestion_id: str,
    user_confirmation: bool
) -> Dict[str, Any]:
    """
    점진적 적용
    """
    if not user_confirmation:
        raise ValueError("User confirmation required")
    
    # 롤백 포인트 생성
    rollback_point = create_rollback_point(project_id)
    
    # 단계별 적용
    for percentage in [10, 25, 50, 75, 100]:
        result = apply_percentage(project_id, suggestion_id, percentage)
        
        if not validate_result(result):
            rollback_to_previous(project_id, percentage)
            return {"status": "failed", "reason": f"Validation failed at {percentage}%"}
    
    return {"status": "success", "rollback_point": rollback_point.id}
```

---

## 성공 지표

### Phase 1 성공 지표

1. **에이전트 체인 프로파일링**
   - Bottleneck 감지 정확도: 90% 이상
   - 최적화 제안 수용률: 30% 이상
   - 성능 개선: 평균 20% 이상

2. **Shadow Routing**
   - Shadow 모델 추천 정확도: 80% 이상
   - 점진적 적용 성공률: 95% 이상
   - 비용 절감: 평균 15% 이상

3. **비용 최적화**
   - 최적화 제안 정확도: 85% 이상
   - 비용 절감: 평균 25% 이상
   - 품질 유지: 95% 이상

---

## 결론

이 개선 계획을 통해:

1. **차별화 기능 강화**: 에이전트 체인, Shadow Routing
2. **안전한 자동화**: 제안만 제공, 사용자 승인 필수
3. **사용자 경험 개선**: UI/UX, 시각화
4. **비즈니스 가치 연결**: 비즈니스 메트릭, ROI

AgentGuard의 경쟁력을 크게 향상시킬 수 있습니다.

---

**다음 단계**: Phase 1 구현 시작
