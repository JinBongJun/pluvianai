"""
S3 Glacier Service for archiving snapshots (Enterprise only)
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError, BotoCoreError
from app.core.config import settings
from app.core.logging_config import logger
from app.models.snapshot import Snapshot
from app.models.project import Project
from app.models.user import User
from app.models.subscription import Subscription


class S3GlacierService:
    """Service for archiving snapshots to S3 Glacier (Enterprise only)"""

    def __init__(self):
        """Initialize S3 Glacier service"""
        self.enabled = bool(
            settings.AWS_ACCESS_KEY_ID and
            settings.AWS_SECRET_ACCESS_KEY and
            settings.S3_BUCKET_NAME
        )
        
        if self.enabled:
            try:
                self.s3_client = boto3.client(
                    's3',
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    region_name=settings.AWS_REGION
                )
                
                # Initialize Glacier client if vault is configured
                if settings.S3_GLACIER_VAULT:
                    self.glacier_client = boto3.client(
                        'glacier',
                        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                        region_name=settings.AWS_REGION
                    )
                else:
                    self.glacier_client = None
            except Exception as e:
                logger.error(f"Failed to initialize S3 Glacier service: {str(e)}")
                self.enabled = False
                self.s3_client = None
                self.glacier_client = None
        else:
            self.s3_client = None
            self.glacier_client = None

    def _check_enterprise_plan(self, user_id: int, db) -> bool:
        """
        Check if user has Enterprise plan
        
        Args:
            user_id: User ID
            db: Database session
        
        Returns:
            True if user has Enterprise plan, False otherwise
        """
        subscription = db.query(Subscription).filter(Subscription.user_id == user_id).first()
        if not subscription:
            return False
        
        return subscription.plan_type == "enterprise"

    async def archive_snapshots(
        self,
        snapshot_ids: List[int],
        project_id: int,
        db
    ) -> Dict[str, Any]:
        """
        Archive snapshots to S3 Glacier
        
        Args:
            snapshot_ids: List of snapshot IDs to archive
            project_id: Project ID
            db: Database session
        
        Returns:
            Dict with archive results
        """
        if not self.enabled:
            return {
                "status": "error",
                "message": "S3 Glacier service is not configured",
                "archived_count": 0
            }

        # Get project to check owner's plan
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {
                "status": "error",
                "message": "Project not found",
                "archived_count": 0
            }

        # Check if user has Enterprise plan
        if not self._check_enterprise_plan(project.owner_id, db):
            return {
                "status": "error",
                "message": "S3 Glacier archiving is only available for Enterprise plan",
                "archived_count": 0
            }

        # Get snapshots
        snapshots = db.query(Snapshot).filter(Snapshot.id.in_(snapshot_ids)).all()
        if not snapshots:
            return {
                "status": "error",
                "message": "No snapshots found",
                "archived_count": 0
            }

        archived_count = 0
        errors = []

        for snapshot in snapshots:
            try:
                # Serialize snapshot data
                snapshot_data = {
                    "id": snapshot.id,
                    "trace_id": snapshot.trace_id,
                    "provider": snapshot.provider,
                    "model": snapshot.model,
                    "payload": snapshot.payload,
                    "is_sanitized": snapshot.is_sanitized,
                    "status_code": snapshot.status_code,
                    "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None
                }

                # Create S3 key (organized by project and date)
                archived_at = datetime.now(timezone.utc)
                date_str = archived_at.strftime("%Y/%m/%d")
                s3_key = f"archives/{project_id}/{date_str}/snapshot_{snapshot.id}.json"

                # Upload to S3
                self.s3_client.put_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=s3_key,
                    Body=json.dumps(snapshot_data, default=str),
                    StorageClass='GLACIER' if settings.S3_GLACIER_VAULT else 'STANDARD_IA',  # Intelligent Tiering or Glacier
                    Metadata={
                        'project_id': str(project_id),
                        'snapshot_id': str(snapshot.id),
                        'archived_at': archived_at.isoformat()
                    }
                )

                # If Glacier vault is configured, also archive to Glacier
                if self.glacier_client and settings.S3_GLACIER_VAULT:
                    try:
                        # Upload to Glacier vault
                        archive_response = self.glacier_client.upload_archive(
                            vaultName=settings.S3_GLACIER_VAULT,
                            body=json.dumps(snapshot_data, default=str)
                        )
                        logger.info(
                            f"Snapshot {snapshot.id} archived to Glacier vault",
                            extra={"snapshot_id": snapshot.id, "archive_id": archive_response.get("archiveId")}
                        )
                    except Exception as e:
                        logger.warning(
                            f"Failed to archive snapshot {snapshot.id} to Glacier vault: {str(e)}",
                            extra={"snapshot_id": snapshot.id}
                        )
                        # Continue even if Glacier upload fails, S3 upload succeeded

                archived_count += 1
                logger.info(
                    f"Snapshot {snapshot.id} archived to S3",
                    extra={"snapshot_id": snapshot.id, "s3_key": s3_key}
                )

            except ClientError as e:
                error_msg = f"AWS client error: {str(e)}"
                logger.error(
                    f"Failed to archive snapshot {snapshot.id}: {error_msg}",
                    extra={"snapshot_id": snapshot.id},
                    exc_info=True
                )
                errors.append({"snapshot_id": snapshot.id, "error": error_msg})
            except Exception as e:
                error_msg = f"Unexpected error: {str(e)}"
                logger.error(
                    f"Failed to archive snapshot {snapshot.id}: {error_msg}",
                    extra={"snapshot_id": snapshot.id},
                    exc_info=True
                )
                errors.append({"snapshot_id": snapshot.id, "error": error_msg})

        return {
            "status": "success" if archived_count > 0 else "error",
            "archived_count": archived_count,
            "total_count": len(snapshot_ids),
            "errors": errors if errors else None
        }

    async def restore_snapshot(
        self,
        s3_key: str,
        project_id: int,
        db
    ) -> Optional[Dict[str, Any]]:
        """
        Restore snapshot from S3 Glacier (future implementation)
        
        Args:
            s3_key: S3 key of archived snapshot
            project_id: Project ID
            db: Database session
        
        Returns:
            Snapshot data dict or None if not found
        """
        if not self.enabled:
            return None

        # Check if user has Enterprise plan
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        if not self._check_enterprise_plan(project.owner_id, db):
            return None

        try:
            # Download from S3
            response = self.s3_client.get_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=s3_key
            )
            
            snapshot_data = json.loads(response['Body'].read().decode('utf-8'))
            return snapshot_data

        except ClientError as e:
            logger.error(
                f"Failed to restore snapshot from S3: {str(e)}",
                extra={"s3_key": s3_key},
                exc_info=True
            )
            return None
        except Exception as e:
            logger.error(
                f"Unexpected error restoring snapshot: {str(e)}",
                extra={"s3_key": s3_key},
                exc_info=True
            )
            return None
