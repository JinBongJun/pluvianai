"""
Stream Processor for batch writing snapshots from Redis Stream to DB
"""

import json
import asyncio
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.services.cache_service import cache_service
from app.core.database import SessionLocal
from app.core.logging_config import logger
from app.core.config import settings
import httpx


class StreamProcessor:
    """Background worker to process Redis Stream and batch insert to DB"""

    def __init__(self, batch_size: int = 100, interval_seconds: int = 1):
        self.batch_size = batch_size
        self.interval_seconds = interval_seconds
        self.running = False

    async def start(self):
        """Start the stream processor"""
        self.running = True
        logger.info("Stream processor started")
        
        while self.running:
            try:
                await self.process_streams()
                await asyncio.sleep(self.interval_seconds)
            except Exception as e:
                logger.error(f"Stream processor error: {str(e)}", exc_info=True)
                await asyncio.sleep(self.interval_seconds)

    async def stop(self):
        """Stop the stream processor"""
        self.running = False
        logger.info("Stream processor stopped")

    async def process_streams(self):
        """Process all snapshot streams and batch insert to DB"""
        if not cache_service.enabled:
            return

        try:
            # Get all stream keys (snapshot:stream:*)
            stream_keys = cache_service.redis_client.keys("snapshot:stream:*")
            
            for stream_key in stream_keys:
                await self.process_stream(stream_key)
        except Exception as e:
            logger.error(f"Error processing streams: {str(e)}", exc_info=True)

    async def process_stream(self, stream_key: str):
        """Process a single stream and batch insert to DB"""
        try:
            # Read up to batch_size entries from stream
            # Use XREADGROUP for consumer groups (better for production)
            # For MVP, use simple XREAD
            entries = cache_service.redis_client.xread(
                {stream_key: "0"},  # Read from beginning
                count=self.batch_size,
                block=100  # Block for 100ms if no data
            )
            
            if not entries:
                return

            # Extract snapshot data from stream entries
            snapshots_to_insert = []
            entry_ids_to_delete = []
            
            for stream_name, messages in entries:
                for message_id, data in messages:
                    try:
                        snapshot_data = {
                            "trace_id": data.get("trace_id"),
                            "provider": data.get("provider"),
                            "model": data.get("model"),
                            "payload": json.loads(data.get("payload")) if isinstance(data.get("payload"), str) else data.get("payload"),
                            "is_sanitized": data.get("is_sanitized", "true").lower() == "true",
                            "status_code": int(data.get("status_code")) if data.get("status_code") else None,
                        }
                        project_id = int(data.get("project_id")) if data.get("project_id") else None
                        
                        snapshots_to_insert.append((snapshot_data, project_id, message_id))
                    except Exception as e:
                        logger.error(f"Error parsing snapshot data from stream: {str(e)}")
                        entry_ids_to_delete.append(message_id)  # Delete malformed entries

            # Batch insert to DB
            if snapshots_to_insert:
                await self.batch_insert_snapshots(snapshots_to_insert, stream_key)
                
                # Delete processed entries from stream
                if entry_ids_to_delete or snapshots_to_insert:
                    # Delete processed entries
                    for _, _, message_id in snapshots_to_insert:
                        cache_service.redis_client.xdel(stream_key, message_id)
                    for message_id in entry_ids_to_delete:
                        cache_service.redis_client.xdel(stream_key, message_id)
                        
        except Exception as e:
            logger.error(f"Error processing stream {stream_key}: {str(e)}", exc_info=True)

    async def batch_insert_snapshots(self, snapshots_data: List[tuple], stream_key: str):
        """Batch insert snapshots to database"""
        db = SessionLocal()
        try:
            # Pre-check hard limits before inserting (if enabled)
            from app.models.project import Project
            from app.services.billing_service import BillingService
            from app.core.config import settings
            
            # Group by project_id to check limits per owner
            project_owners = {}  # project_id -> owner_id
            snapshots_by_owner = {}  # owner_id -> list of (snapshot_data, project_id, message_id)
            
            for snapshot_data, project_id, message_id in snapshots_data:
                if project_id:
                    if project_id not in project_owners:
                        project = db.query(Project).filter(Project.id == project_id).first()
                        if project:
                            project_owners[project_id] = project.owner_id
                    
                    if project_id in project_owners:
                        owner_id = project_owners[project_id]
                        if owner_id not in snapshots_by_owner:
                            snapshots_by_owner[owner_id] = []
                        snapshots_by_owner[owner_id].append((snapshot_data, project_id, message_id))
            
            # Filter snapshots based on hard limit (if enabled)
            filtered_snapshots = []
            skipped_count = 0
            billing_service = BillingService(db)
            
            for owner_id, owner_snapshots in snapshots_by_owner.items():
                if settings.ENABLE_FREE_PLAN_HARD_LIMIT:
                    # Check limit before processing
                    for snapshot_data, project_id, message_id in owner_snapshots:
                        # Pre-check: try to increment and see if allowed
                        is_allowed, warning = billing_service.increment_usage(owner_id, "snapshots", 1)
                        if not is_allowed:
                            skipped_count += 1
                            logger.warning(
                                f"Skipping snapshot {message_id} for user {owner_id}: {warning}"
                            )
                            continue
                        filtered_snapshots.append((snapshot_data, project_id, message_id))
                else:
                    # No hard limit, process all
                    filtered_snapshots.extend(owner_snapshots)
            
            # Also include snapshots without project_id (they won't be tracked)
            for snapshot_data, project_id, message_id in snapshots_data:
                if not project_id:
                    filtered_snapshots.append((snapshot_data, project_id, message_id))
            
            if skipped_count > 0:
                logger.info(f"Skipped {skipped_count} snapshots due to hard limit from {stream_key}")
            
            # Insert filtered snapshots
            inserted_count = 0
            for snapshot_data, project_id, message_id in filtered_snapshots:
                try:
                    # Ensure trace exists
                    trace = db.query(Trace).filter(Trace.id == snapshot_data["trace_id"]).first()
                    if not trace and project_id:
                        # Create trace if it doesn't exist
                        trace = Trace(id=snapshot_data["trace_id"], project_id=project_id)
                        db.add(trace)
                        db.flush()
                    
                    # Create snapshot
                    snapshot = Snapshot(
                        trace_id=snapshot_data["trace_id"],
                        provider=snapshot_data["provider"],
                        model=snapshot_data["model"],
                        payload=snapshot_data["payload"],
                        is_sanitized=snapshot_data["is_sanitized"],
                        status_code=snapshot_data["status_code"]
                    )
                    db.add(snapshot)
                    inserted_count += 1
                except Exception as e:
                    logger.error(f"Error inserting snapshot {message_id}: {str(e)}")
                    db.rollback()
                    continue

            # Commit batch
            if inserted_count > 0:
                db.commit()
                logger.info(f"Batch inserted {inserted_count} snapshots from {stream_key}")

                # Optional: track snapshot_created event in PostHog (batch-level)
                try:
                    if settings.NEXT_PUBLIC_POSTHOG_KEY:
                        posthog_host = settings.NEXT_PUBLIC_POSTHOG_HOST or "https://app.posthog.com"
                        httpx.post(
                            f"{posthog_host.rstrip('/')}/capture/",
                            json={
                                "api_key": settings.NEXT_PUBLIC_POSTHOG_KEY,
                                "event": "snapshot_created",
                                "properties": {
                                    "inserted_count": inserted_count,
                                    "stream_key": stream_key,
                                },
                            },
                            timeout=2.0,
                        )
                except Exception as e:
                    # 실패해도 프로덕션 흐름에는 영향 주지 않음
                    logger.debug(f"PostHog snapshot_created tracking failed: {str(e)}")

                # Track snapshot usage for subscription limits (after successful insert)
                # Only track if hard limit was not pre-checked (to avoid double counting)
                if not settings.ENABLE_FREE_PLAN_HARD_LIMIT:
                    # Group by project_id to track usage per project owner
                    project_owners = {}  # project_id -> owner_id
                    for snapshot_data, project_id, _ in filtered_snapshots:
                        if project_id and project_id not in project_owners:
                            project = db.query(Project).filter(Project.id == project_id).first()
                            if project:
                                project_owners[project_id] = project.owner_id

                    # Track usage per owner (count snapshots per owner)
                    owner_counts = {}
                    for snapshot_data, project_id, _ in filtered_snapshots:
                        if project_id and project_id in project_owners:
                            owner_id = project_owners[project_id]
                            owner_counts[owner_id] = owner_counts.get(owner_id, 0) + 1

                    # Increment usage for each owner
                    billing_service = BillingService(db)
                    for owner_id, count in owner_counts.items():
                        try:
                            billing_service.increment_usage(owner_id, "snapshots", count)
                        except Exception as e:
                            logger.warning(f"Failed to track snapshot usage for user {owner_id}: {str(e)}")
        except Exception as e:
            logger.error(f"Error in batch insert: {str(e)}", exc_info=True)
            db.rollback()
        finally:
            db.close()

# Global instance
stream_processor = StreamProcessor()
