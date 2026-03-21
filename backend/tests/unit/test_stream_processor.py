"""
Unit tests for StreamProcessor
"""
import pytest
import asyncio
import json
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from sqlalchemy.orm import sessionmaker
from app.services.stream_processor import StreamProcessor
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.services.cache_service import cache_service


@pytest.mark.unit
class TestStreamProcessor:
    """Tests for Stream Processor"""

    @pytest.fixture
    def processor(self):
        """Create StreamProcessor instance"""
        return StreamProcessor(batch_size=10, interval_seconds=0.1)

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client"""
        mock_redis = MagicMock()
        mock_redis.keys.return_value = []
        mock_redis.xread.return_value = []
        mock_redis.xdel.return_value = 1
        return mock_redis

    @pytest.fixture
    def patched_session_local(self, db):
        """Use the test database engine for StreamProcessor's background session factory."""
        testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=db.bind)
        with patch("app.services.stream_processor.SessionLocal", testing_session_local):
            yield

    @pytest.mark.asyncio
    async def test_process_streams_success(self, processor, mock_redis):
        """Test processing streams successfully"""
        # Mock stream keys
        mock_redis.keys.return_value = [b"snapshot:stream:project_1"]
        
        # Mock stream entries
        mock_redis.xread.return_value = [
            (
                b"snapshot:stream:project_1",
                [
                    (
                        b"1234567890-0",
                        {
                            b"trace_id": b"trace_1",
                            b"provider": b"openai",
                            b"model": b"gpt-3.5-turbo",
                            b"payload": b'{"messages": []}',
                            b"is_sanitized": b"true",
                            b"status_code": b"200",
                            b"project_id": b"1",
                        }
                    )
                ]
            )
        ]
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                with patch.object(processor, 'batch_insert_snapshots', new_callable=AsyncMock):
                    await processor.process_streams()
                    
                    assert mock_redis.keys.called
                    assert mock_redis.xread.called

    @pytest.mark.asyncio
    async def test_process_streams_redis_disabled(self, processor):
        """Test processing streams when Redis is disabled"""
        with patch.object(cache_service, 'enabled', False):
            # Should return early without errors
            await processor.process_streams()

    @pytest.mark.asyncio
    async def test_process_streams_no_streams(self, processor, mock_redis):
        """Test processing when no streams exist"""
        mock_redis.keys.return_value = []
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                await processor.process_streams()
                
                assert mock_redis.keys.called
                assert not mock_redis.xread.called

    @pytest.mark.asyncio
    async def test_batch_insert_success(self, processor, db, test_project, patched_session_local):
        """Test batch inserting snapshots successfully"""
        # Create trace
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.commit()
        
        snapshots_data = [
            (
                {
                    "trace_id": "test_trace",
                    "provider": "openai",
                    "model": "gpt-3.5-turbo",
                    "payload": {"messages": []},
                    "is_sanitized": True,
                    "status_code": 200,
                },
                test_project.id,
                "msg_1"
            ),
            (
                {
                    "trace_id": "test_trace",
                    "provider": "anthropic",
                    "model": "claude-3-sonnet",
                    "payload": {"messages": []},
                    "is_sanitized": False,
                    "status_code": 200,
                },
                test_project.id,
                "msg_2"
            ),
        ]
        
        await processor.batch_insert_snapshots(snapshots_data, "snapshot:stream:project_1")
        
        # Verify snapshots were inserted
        snapshot_count = db.query(Snapshot).filter(Snapshot.trace_id == "test_trace").count()
        assert snapshot_count == 2

    @pytest.mark.asyncio
    async def test_batch_insert_creates_trace(self, processor, db, test_project, patched_session_local):
        """Test batch insert creates trace if it doesn't exist"""
        snapshots_data = [
            (
                {
                    "trace_id": "new_trace",
                    "provider": "openai",
                    "model": "gpt-3.5-turbo",
                    "payload": {"messages": []},
                    "is_sanitized": True,
                    "status_code": 200,
                },
                test_project.id,
                "msg_1"
            ),
        ]
        
        await processor.batch_insert_snapshots(snapshots_data, "snapshot:stream:project_1")
        
        # Verify trace was created
        trace = db.query(Trace).filter(Trace.id == "new_trace").first()
        assert trace is not None
        assert trace.project_id == test_project.id
        
        # Verify snapshot was created
        snapshot = db.query(Snapshot).filter(Snapshot.trace_id == "new_trace").first()
        assert snapshot is not None

    @pytest.mark.asyncio
    async def test_batch_insert_partial_failure(self, processor, db, test_project, patched_session_local):
        """Test batch insert with partial failures"""
        # Create trace
        trace = Trace(id="test_trace", project_id=test_project.id)
        db.add(trace)
        db.commit()
        
        snapshots_data = [
            (
                {
                    "trace_id": "test_trace",
                    "provider": "openai",
                    "model": "gpt-3.5-turbo",
                    "payload": {"messages": []},
                    "is_sanitized": True,
                    "status_code": 200,
                },
                test_project.id,
                "msg_1"
            ),
            (
                {
                    "trace_id": "test_trace",
                    "provider": None,  # Invalid data
                    "model": None,
                    "payload": {},
                    "is_sanitized": True,
                    "status_code": 200,
                },
                test_project.id,
                "msg_2"
            ),
        ]
        
        # Should handle errors gracefully
        await processor.batch_insert_snapshots(snapshots_data, "snapshot:stream:project_1")
        
        # At least one snapshot should be inserted
        snapshot_count = db.query(Snapshot).filter(Snapshot.trace_id == "test_trace").count()
        assert snapshot_count >= 1

    @pytest.mark.asyncio
    async def test_start_stop_processor(self, processor):
        """Test starting and stopping the processor"""
        processor.running = False
        
        # Start processor in background
        task = asyncio.create_task(processor.start())
        
        # Wait a bit
        await asyncio.sleep(0.2)
        
        # Verify it's running
        assert processor.running is True
        
        # Stop processor
        await processor.stop()
        
        # Wait for task to complete
        await asyncio.sleep(0.2)
        
        # Verify it stopped
        assert processor.running is False
        
        # Cancel task if still running
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_process_stream_empty_stream(self, processor, mock_redis):
        """Test processing empty stream"""
        mock_redis.xread.return_value = []
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                await processor.process_stream("snapshot:stream:project_1")
                
                assert mock_redis.xread.called
                assert not mock_redis.xdel.called

    @pytest.mark.asyncio
    async def test_process_stream_malformed_data(self, processor, mock_redis):
        """Test processing stream with malformed data"""
        mock_redis.xread.return_value = [
            (
                b"snapshot:stream:project_1",
                [
                    (
                        b"1234567890-0",
                        {
                            b"trace_id": b"trace_1",
                            # Missing required fields
                        }
                    )
                ]
            )
        ]
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                with patch.object(processor, 'batch_insert_snapshots', new_callable=AsyncMock):
                    await processor.process_stream("snapshot:stream:project_1")
                    
                    # Should handle error gracefully
                    assert mock_redis.xread.called
