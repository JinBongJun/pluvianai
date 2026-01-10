# 테스트 작성 가이드라인

이 문서는 앞으로 테스트를 작성할 때 따라야 할 가이드라인과 주의사항을 설명합니다.

## 🚨 깨지기 쉬운 테스트 패턴 (피해야 할 것들)

### 1. **구현 세부사항에 의존하는 테스트**

❌ **나쁜 예:**
```python
def test_invalidate_cache():
    service.invalidate_project_cache(1)
    # 구현 세부사항에 의존: keys가 정확히 2번 호출되어야 함
    assert service.redis_client.keys.call_count == 2
```

✅ **좋은 예:**
```python
def test_invalidate_cache():
    service.invalidate_project_cache(1)
    # 동작을 검증: 올바른 패턴으로 호출되고, 모든 매칭 키가 삭제됨
    assert service.redis_client.keys.call_count == 1
    assert service.redis_client.keys.call_args[0][0] == "project:1:*"
    # 삭제된 키들이 예상과 일치하는지 검증 (순서는 중요하지 않음)
    deleted_keys = set(service.redis_client.delete.call_args[0])
    assert deleted_keys == expected_keys
```

### 2. **엄격한 call_count 검증**

❌ **나쁜 예:**
```python
def test_process_data():
    service.process_data(data)
    # 만약 내부 구현이 최적화되어 호출 횟수가 줄어들면 테스트가 깨짐
    assert db.query.call_count == 5
```

✅ **좋은 예:**
```python
def test_process_data():
    result = service.process_data(data)
    # 결과를 검증 (구현 세부사항에 의존하지 않음)
    assert result is not None
    assert len(result) > 0
    # 필요시 최소/최대 범위로 검증
    assert db.query.call_count >= 3  # 최소값만 검증
```

### 3. **응답 구조에 과도하게 의존하는 테스트**

❌ **나쁜 예:**
```python
def test_get_projects():
    response = client.get("/api/v1/projects")
    # 응답 구조가 변경되면 깨짐
    assert response.json()["data"]["items"][0]["project"]["name"] == "Test"
```

✅ **좋은 예:**
```python
def test_get_projects():
    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    # 유연한 검증: 리스트 또는 딕셔너리 모두 허용
    assert isinstance(data, (list, dict))
    if isinstance(data, list):
        assert len(data) > 0
        assert "name" in data[0]
    elif isinstance(data, dict):
        assert "items" in data or "data" in data
```

## ✅ 견고한 테스트 작성 방법

### 1. **동작 중심 테스트**

구현 세부사항보다는 **기대하는 동작**을 테스트합니다.

```python
def test_delete_pattern():
    """Test delete_pattern() removes matching keys"""
    matching_keys = ["key1", "key2", "key3"]
    service.redis_client.keys.return_value = matching_keys
    
    service.delete_pattern("project:1:*")
    
    # 올바른 패턴으로 호출되었는지 확인
    service.redis_client.keys.assert_called_once_with("project:1:*")
    # 모든 매칭 키가 삭제되었는지 확인 (순서는 중요하지 않음)
    deleted_keys = set(service.redis_client.delete.call_args[0])
    assert deleted_keys == set(matching_keys)
```

### 2. **엣지 케이스 테스트**

예외 상황과 엣지 케이스를 테스트합니다.

```python
def test_delete_pattern_empty_result():
    """Test delete_pattern() when no keys match"""
    service.redis_client.keys.return_value = []
    
    service.delete_pattern("project:999:*")
    
    service.redis_client.keys.assert_called_once_with("project:999:*")
    # 키가 없으면 delete가 호출되지 않아야 함
    service.redis_client.delete.assert_not_called()

def test_delete_pattern_when_disabled():
    """Test delete_pattern() when Redis is disabled"""
    service.enabled = False
    
    # 예외가 발생하지 않아야 함
    service.delete_pattern("project:1:*")
```

### 3. **예외 처리 테스트**

모든 메서드가 예외를 안전하게 처리하는지 테스트합니다.

```python
def test_get_with_exception():
    """Test get() handles Redis exceptions gracefully"""
    service.redis_client.get.side_effect = Exception("Redis connection error")
    
    # 예외가 발생하지 않고 None을 반환해야 함
    result = service.get("test_key")
    assert result is None
```

### 4. **순서가 중요하지 않은 검증**

순서에 의존하지 않고 집합(set)을 사용하여 검증합니다.

```python
# ❌ 나쁜 예: 순서에 의존
assert service.redis_client.delete.call_args[0] == ("key1", "key2", "key3")

# ✅ 좋은 예: 순서 무관
deleted_keys = set(service.redis_client.delete.call_args[0])
assert deleted_keys == {"key1", "key2", "key3"}
```

## 📋 테스트 작성 체크리스트

테스트를 작성할 때 다음을 확인하세요:

- [ ] **동작 중심 테스트**: 구현 세부사항이 아닌 기대하는 동작을 테스트하는가?
- [ ] **엣지 케이스**: 빈 결과, None 값, 예외 상황을 테스트하는가?
- [ ] **예외 처리**: 모든 메서드가 예외를 안전하게 처리하는지 테스트하는가?
- [ ] **순서 독립성**: 순서가 중요하지 않은 경우 set()을 사용하는가?
- [ ] **유연한 검증**: 응답 구조 변경에 대비한 유연한 검증인가?
- [ ] **명확한 어설션**: 테스트가 실패했을 때 무엇이 문제인지 명확한가?

## 🔧 테스트 유지보수 팁

1. **구현 변경 시**: 테스트를 먼저 수정하고, 그 다음 구현을 변경하세요.
2. **call_count 검증**: 정확한 횟수보다는 "호출되었는가" 또는 최소/최대 범위를 검증하세요.
3. **Mock 설정**: `side_effect` 대신 `return_value`를 사용하면 더 예측 가능합니다.
4. **통합 테스트**: 단위 테스트에서 구현 세부사항을 검증하기 어렵다면 통합 테스트로 이동하세요.

## 🎯 현재 개선된 테스트 예시

`test_cache_service.py`의 모든 테스트는 위 가이드라인을 따릅니다:

- ✅ 동작 중심 검증
- ✅ 엣지 케이스 커버리지
- ✅ 예외 처리 테스트
- ✅ 순서 독립적인 검증
- ✅ 구현 세부사항에 의존하지 않음
