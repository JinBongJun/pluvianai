"""
Unit tests for CacheService
"""
import pytest
from unittest.mock import Mock, patch
from app.services.cache_service import CacheService


class TestCacheService:
    """Test CacheService functionality"""
    
    def test_get_when_disabled(self):
        """Test get() when Redis is disabled"""
        service = CacheService()
        service.enabled = False
        
        result = service.get("test_key")
        
        assert result is None
    
    def test_set_when_disabled(self):
        """Test set() when Redis is disabled"""
        service = CacheService()
        service.enabled = False
        
        # Should not raise exception
        service.set("test_key", "test_value")
    
    def test_get_when_key_exists(self):
        """Test get() when key exists in cache"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        service.redis_client.get.return_value = '{"test": "value"}'
        
        result = service.get("test_key")
        
        assert result == {"test": "value"}
        service.redis_client.get.assert_called_once_with("test_key")
    
    def test_get_with_exception(self):
        """Test get() handles Redis exceptions gracefully"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        service.redis_client.get.side_effect = Exception("Redis connection error")
        
        # Should not raise exception, should return None
        result = service.get("test_key")
        
        assert result is None
    
    def test_get_when_key_not_exists(self):
        """Test get() when key doesn't exist"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        service.redis_client.get.return_value = None
        
        result = service.get("test_key")
        
        assert result is None
    
    def test_set_success(self):
        """Test set() with valid data"""
        import json
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        
        service.set("test_key", {"test": "value"}, ttl=60)
        
        service.redis_client.setex.assert_called_once()
        call_args = service.redis_client.setex.call_args
        assert call_args[0][0] == "test_key"
        assert call_args[0][1] == 60
        assert json.loads(call_args[0][2]) == {"test": "value"}
    
    def test_set_with_exception(self):
        """Test set() handles Redis exceptions gracefully"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        service.redis_client.setex.side_effect = Exception("Redis connection error")
        
        # Should not raise exception
        service.set("test_key", {"test": "value"}, ttl=60)
    
    def test_delete_success(self):
        """Test delete() removes key"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        
        service.delete("test_key")
        
        service.redis_client.delete.assert_called_once_with("test_key")
    
    def test_delete_with_exception(self):
        """Test delete() handles Redis exceptions gracefully"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        service.redis_client.delete.side_effect = Exception("Redis connection error")
        
        # Should not raise exception
        service.delete("test_key")
    
    def test_delete_pattern(self):
        """Test delete_pattern() removes matching keys"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        matching_keys = ["key1", "key2", "key3"]
        service.redis_client.keys.return_value = matching_keys
        
        service.delete_pattern("project:1:*")
        
        service.redis_client.keys.assert_called_once_with("project:1:*")
        # Verify delete was called once with all keys (using unpacking)
        service.redis_client.delete.assert_called_once()
        # The delete method uses *keys, so verify all keys are in the call args
        delete_call_args = service.redis_client.delete.call_args[0]
        assert set(delete_call_args) == set(matching_keys)
    
    def test_delete_pattern_empty_result(self):
        """Test delete_pattern() when no keys match"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        service.redis_client.keys.return_value = []
        
        service.delete_pattern("project:999:*")
        
        service.redis_client.keys.assert_called_once_with("project:999:*")
        # delete should not be called when no keys match
        service.redis_client.delete.assert_not_called()
    
    def test_delete_pattern_when_disabled(self):
        """Test delete_pattern() when Redis is disabled"""
        service = CacheService()
        service.enabled = False
        
        # Should not raise exception
        service.delete_pattern("project:1:*")
    
    def test_cache_key_generators(self):
        """Test cache key generation methods"""
        assert CacheService.project_stats_key(1, 7) == "project:1:stats:7d"
        assert CacheService.quality_scores_key(1, 100) == "project:1:quality:100"
        assert CacheService.api_calls_key(1, 50) == "project:1:api_calls:50"
        assert CacheService.cost_analysis_key(1, 30) == "project:1:cost:30d"
        assert CacheService.project_members_key(1) == "project:1:members"
        assert CacheService.project_list_key(1) == "user:1:projects"
    
    def test_invalidate_project_cache(self):
        """Test invalidate_project_cache() removes all project cache"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        matching_keys = [
            "project:1:stats:7d",
            "project:1:quality:100",
            "project:1:api_calls:50",
            "project:1:cost:30d",
            "project:1:members"
        ]
        service.redis_client.keys.return_value = matching_keys
        
        service.invalidate_project_cache(1)
        
        # invalidate_project_cache calls delete_pattern once, which calls keys once
        service.redis_client.keys.assert_called_once_with("project:1:*")
        # delete_pattern calls delete once with all matching keys
        service.redis_client.delete.assert_called_once()
        # Verify all matching keys were deleted (order doesn't matter)
        deleted_keys = set(service.redis_client.delete.call_args[0])
        assert deleted_keys == set(matching_keys)
    
    def test_invalidate_project_cache_when_disabled(self):
        """Test invalidate_project_cache() when Redis is disabled"""
        service = CacheService()
        service.enabled = False
        
        # Should not raise exception
        service.invalidate_project_cache(1)
    
    def test_invalidate_user_projects_cache(self):
        """Test invalidate_user_projects_cache() removes user project list cache"""
        service = CacheService()
        service.enabled = True
        service.redis_client = Mock()
        
        service.invalidate_user_projects_cache(1)
        
        expected_key = "user:1:projects"
        service.redis_client.delete.assert_called_once_with(expected_key)
    
    def test_invalidate_user_projects_cache_when_disabled(self):
        """Test invalidate_user_projects_cache() when Redis is disabled"""
        service = CacheService()
        service.enabled = False
        
        # Should not raise exception
        service.invalidate_user_projects_cache(1)
