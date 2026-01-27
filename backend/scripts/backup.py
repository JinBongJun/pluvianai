"""
Database backup script for AgentGuard
Supports PostgreSQL backup and restore operations
"""

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
import argparse

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.core.logging_config import logger


class BackupService:
    """Service for database backup and restore operations"""

    def __init__(self, backup_dir: Optional[str] = None):
        self.backup_dir = Path(backup_dir or os.getenv("BACKUP_DIR", "./backups"))
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.database_url = settings.DATABASE_URL

    def create_backup(self, backup_name: Optional[str] = None) -> str:
        """
        Create a PostgreSQL database backup
        
        Args:
            backup_name: Optional custom backup name (defaults to timestamp)
            
        Returns:
            Path to the backup file
        """
        if not backup_name:
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            backup_name = f"agentguard_backup_{timestamp}.sql"

        backup_path = self.backup_dir / backup_name

        # Extract connection details from DATABASE_URL
        # Format: postgresql://user:password@host:port/database
        try:
            # Parse DATABASE_URL
            url_parts = self.database_url.replace("postgresql://", "").split("@")
            if len(url_parts) != 2:
                raise ValueError("Invalid DATABASE_URL format")

            auth_part = url_parts[0]
            host_db_part = url_parts[1]

            user_pass = auth_part.split(":")
            username = user_pass[0]
            password = user_pass[1] if len(user_pass) > 1 else ""

            host_port_db = host_db_part.split("/")
            host_port = host_port_db[0].split(":")
            host = host_port[0]
            port = host_port[1] if len(host_port) > 1 else "5432"
            database = host_port_db[1] if len(host_port_db) > 1 else "agentguard"

            # Set PGPASSWORD environment variable for pg_dump
            env = os.environ.copy()
            if password:
                env["PGPASSWORD"] = password

            # Run pg_dump
            cmd = [
                "pg_dump",
                "-h", host,
                "-p", port,
                "-U", username,
                "-d", database,
                "-F", "c",  # Custom format (compressed)
                "-f", str(backup_path),
            ]

            logger.info(f"Creating backup: {backup_path}")
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)

            if result.returncode != 0:
                raise RuntimeError(f"Backup failed: {result.stderr}")

            logger.info(f"Backup created successfully: {backup_path}")
            return str(backup_path)

        except Exception as e:
            logger.error(f"Backup failed: {str(e)}")
            raise

    def restore_backup(self, backup_path: str, drop_existing: bool = False) -> None:
        """
        Restore database from backup
        
        Args:
            backup_path: Path to backup file
            drop_existing: If True, drop existing database before restore
        """
        backup_file = Path(backup_path)
        if not backup_file.exists():
            raise FileNotFoundError(f"Backup file not found: {backup_path}")

        # Parse DATABASE_URL
        try:
            url_parts = self.database_url.replace("postgresql://", "").split("@")
            if len(url_parts) != 2:
                raise ValueError("Invalid DATABASE_URL format")

            auth_part = url_parts[0]
            host_db_part = url_parts[1]

            user_pass = auth_part.split(":")
            username = user_pass[0]
            password = user_pass[1] if len(user_pass) > 1 else ""

            host_port_db = host_db_part.split("/")
            host_port = host_port_db[0].split(":")
            host = host_port[0]
            port = host_port[1] if len(host_port) > 1 else "5432"
            database = host_port_db[1] if len(host_port_db) > 1 else "agentguard"

            # Set PGPASSWORD environment variable
            env = os.environ.copy()
            if password:
                env["PGPASSWORD"] = password

            if drop_existing:
                logger.warning("Dropping existing database...")
                # Connect to postgres database to drop target database
                drop_cmd = [
                    "psql",
                    "-h", host,
                    "-p", port,
                    "-U", username,
                    "-d", "postgres",  # Connect to default database
                    "-c", f"DROP DATABASE IF EXISTS {database};",
                ]
                subprocess.run(drop_cmd, env=env, check=True)

                # Recreate database
                create_cmd = [
                    "psql",
                    "-h", host,
                    "-p", port,
                    "-U", username,
                    "-d", "postgres",
                    "-c", f"CREATE DATABASE {database};",
                ]
                subprocess.run(create_cmd, env=env, check=True)

            # Restore from backup
            logger.info(f"Restoring from backup: {backup_path}")
            cmd = [
                "pg_restore",
                "-h", host,
                "-p", port,
                "-U", username,
                "-d", database,
                "-c",  # Clean (drop) before restore
                str(backup_file),
            ]

            result = subprocess.run(cmd, env=env, capture_output=True, text=True)

            if result.returncode != 0:
                raise RuntimeError(f"Restore failed: {result.stderr}")

            logger.info("Backup restored successfully")

        except Exception as e:
            logger.error(f"Restore failed: {str(e)}")
            raise

    def list_backups(self) -> list:
        """List all available backups"""
        backups = []
        for backup_file in self.backup_dir.glob("*.sql"):
            stat = backup_file.stat()
            backups.append({
                "name": backup_file.name,
                "path": str(backup_file),
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
        return sorted(backups, key=lambda x: x["created_at"], reverse=True)

    def cleanup_old_backups(self, keep_days: int = 30) -> int:
        """
        Delete backups older than specified days
        
        Args:
            keep_days: Number of days to keep backups
            
        Returns:
            Number of backups deleted
        """
        from datetime import timedelta

        cutoff_date = datetime.utcnow() - timedelta(days=keep_days)
        deleted_count = 0

        for backup_file in self.backup_dir.glob("*.sql"):
            file_time = datetime.fromtimestamp(backup_file.stat().st_mtime)
            if file_time < cutoff_date:
                logger.info(f"Deleting old backup: {backup_file.name}")
                backup_file.unlink()
                deleted_count += 1

        logger.info(f"Cleaned up {deleted_count} old backups")
        return deleted_count


def main():
    """CLI interface for backup operations"""
    parser = argparse.ArgumentParser(description="AgentGuard Database Backup Tool")
    parser.add_argument("action", choices=["backup", "restore", "list", "cleanup"], help="Action to perform")
    parser.add_argument("--file", help="Backup file path (for restore)")
    parser.add_argument("--name", help="Custom backup name (for backup)")
    parser.add_argument("--drop-existing", action="store_true", help="Drop existing database before restore")
    parser.add_argument("--keep-days", type=int, default=30, help="Days to keep backups (for cleanup)")

    args = parser.parse_args()

    service = BackupService()

    try:
        if args.action == "backup":
            backup_path = service.create_backup(args.name)
            print(f"Backup created: {backup_path}")

        elif args.action == "restore":
            if not args.file:
                print("Error: --file required for restore")
                sys.exit(1)
            service.restore_backup(args.file, drop_existing=args.drop_existing)
            print("Backup restored successfully")

        elif args.action == "list":
            backups = service.list_backups()
            if not backups:
                print("No backups found")
            else:
                print(f"\nFound {len(backups)} backups:\n")
                for backup in backups:
                    size_mb = backup["size"] / (1024 * 1024)
                    print(f"  {backup['name']}")
                    print(f"    Size: {size_mb:.2f} MB")
                    print(f"    Created: {backup['created_at']}\n")

        elif args.action == "cleanup":
            deleted = service.cleanup_old_backups(args.keep_days)
            print(f"Deleted {deleted} old backups")

    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
