# 추가 최적화 가이드

현재 적용된 최적화 외에 추가로 적용 가능한 최적화 항목들입니다.

## 즉시 적용 가능한 최적화

### 1. N+1 쿼리 문제 해결 ⚠️

**현재 문제**: 일부 엔드포인트에서 N+1 쿼리 발생 가능

**예시**:
```python
# 현재 (N+1 문제)
api_calls = db.query(APICall).all()
for call in api_calls:
    project = call.project  # 각각 쿼리 실행
```

**개선 방법**:
```python
# 개선 (Eager Loading)
from sqlalchemy.orm import joinedload

api_calls = db.query(APICall).options(
    joinedload(APICall.project)
).all()
```

**적용 위치**:
- `backend/app/api/v1/endpoints/api_calls.py`
- `backend/app/api/v1/endpoints/quality.py`
- `backend/app/api/v1/endpoints/drift.py`

**예상 효과**: 쿼리 수 50-80% 감소

---

### 2. 배치 처리 ⚠️

**현재 문제**: API 호출을 개별적으로 저장

**개선 방법**: 여러 호출을 배치로 저장
```python
# 배치 저장 (100개씩)
api_calls_batch = []
for call_data in calls:
    api_calls_batch.append(APICall(**call_data))
    if len(api_calls_batch) >= 100:
        db.bulk_insert_mappings(APICall, api_calls_batch)
        api_calls_batch = []
```

**적용 위치**: `backend/app/services/background_tasks.py`

**예상 효과**: 데이터베이스 부하 30-50% 감소

---

### 3. 추가 캐싱 ⚠️

**현재 상태**: API 호출 목록만 캐싱

**개선 방법**: 더 많은 데이터 캐싱
- 프로젝트 목록
- 사용자 정보
- 통계 데이터
- 품질 점수

**적용 위치**: 각 엔드포인트에 캐싱 추가

**예상 효과**: 데이터베이스 쿼리 추가 20-30% 감소

---

### 4. 쿼리 최적화 ⚠️

**현재 문제**: 불필요한 컬럼 조회

**개선 방법**: 필요한 컬럼만 선택
```python
# 현재
api_calls = db.query(APICall).all()

# 개선
api_calls = db.query(
    APICall.id,
    APICall.project_id,
    APICall.provider,
    APICall.model,
    APICall.created_at
).all()
```

**예상 효과**: 쿼리 속도 20-40% 개선

---

## 중기 최적화 (필요시)

### 5. 데이터 파티셔닝

**목적**: 대용량 데이터 관리

**방법**: 날짜별 파티셔닝
```sql
CREATE TABLE api_calls_2024_01 PARTITION OF api_calls
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

**적용 시점**: 1,000+ 사용자

---

### 6. 읽기 전용 복제본

**목적**: 쿼리 부하 분산

**방법**: 읽기 쿼리를 복제본으로 라우팅

**적용 시점**: 500+ 사용자

---

### 7. 메시지 큐 (Celery/RQ)

**목적**: 대량 처리 작업

**방법**: 비동기 작업 큐 도입

**적용 시점**: 1,000+ 사용자

---

## 우선순위

### 높은 우선순위 (즉시 적용 가능)
1. ✅ Gzip 압축 (완료)
2. ✅ Rate Limiting (완료)
3. ⚠️ N+1 쿼리 해결
4. ⚠️ 배치 처리

### 중간 우선순위 (1-2주 내)
1. ⚠️ 추가 캐싱
2. ⚠️ 쿼리 최적화

### 낮은 우선순위 (필요시)
1. 데이터 파티셔닝
2. 읽기 전용 복제본
3. 메시지 큐

---

## 적용 방법

각 최적화는 독립적으로 적용 가능합니다. 필요에 따라 선택적으로 적용하세요.

**권장**: 현재 최적화만으로도 200-300명 사용자 지원 가능하므로, 실제 사용량을 모니터링한 후 필요시 추가 최적화를 적용하는 것을 권장합니다.


