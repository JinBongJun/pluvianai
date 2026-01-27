"""
Integration tests for backup and restore functionality
"""

import pytest
import os
import tempfile
from pathlib import Path
from scripts.backup import BackupService


@pytest.mark.integration
class TestBackupRestore:
    """Integration tests for backup and restore"""

    @pytest.fixture
    def backup_service(self):
        """Create a BackupService instance with temporary backup directory"""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield BackupService(backup_dir=tmpdir)

    def test_create_backup(self, backup_service):
        """Test creating a database backup"""
        # Skip if DATABASE_URL is not set or is a test database
        if "test" not in os.getenv("DATABASE_URL", "").lower():
            pytest.skip("Requires test database")

        backup_path = backup_service.create_backup()
        assert Path(backup_path).exists()
        assert Path(backup_path).stat().st_size > 0

    def test_list_backups(self, backup_service):
        """Test listing backups"""
        # Create a test backup file
        test_backup = Path(backup_service.backup_dir) / "test_backup.sql"
        test_backup.write_text("test backup content")

        backups = backup_service.list_backups()
        assert len(backups) > 0
        assert any(b["name"] == "test_backup.sql" for b in backups)

    def test_cleanup_old_backups(self, backup_service):
        """Test cleaning up old backups"""
        # Create a test backup file
        test_backup = Path(backup_service.backup_dir) / "old_backup.sql"
        test_backup.write_text("test backup content")

        # Modify file time to be old
        import time
        old_time = time.time() - (31 * 24 * 60 * 60)  # 31 days ago
        os.utime(test_backup, (old_time, old_time))

        deleted = backup_service.cleanup_old_backups(keep_days=30)
        assert deleted > 0
        assert not test_backup.exists()
