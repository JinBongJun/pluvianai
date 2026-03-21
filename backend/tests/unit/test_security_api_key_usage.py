"""
Unit tests for API key auth usage tracking.
"""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import (
    API_KEY_LAST_USED_WRITE_INTERVAL,
    _should_update_api_key_last_used,
    get_user_from_api_key,
)
from app.models.api_key import APIKey


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _create_api_key(db, user_id: int, raw_key: str, *, last_used_at=None, scope="*") -> APIKey:
    api_key = APIKey(
        user_id=user_id,
        key_hash=hashlib.sha256(raw_key.encode()).hexdigest(),
        name="Test key",
        scope=scope,
        is_active=True,
        last_used_at=last_used_at,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return api_key


@pytest.mark.unit
class TestAPIKeyUsageTracking:
    def test_should_update_last_used_when_missing_or_stale(self):
        now_utc = datetime.now(timezone.utc)

        assert _should_update_api_key_last_used(None, now_utc) is True
        assert (
            _should_update_api_key_last_used(
                now_utc - API_KEY_LAST_USED_WRITE_INTERVAL - timedelta(seconds=1),
                now_utc,
            )
            is True
        )

    def test_should_not_update_last_used_within_write_interval(self):
        now_utc = datetime.now(timezone.utc)

        assert (
            _should_update_api_key_last_used(
                now_utc - API_KEY_LAST_USED_WRITE_INTERVAL + timedelta(seconds=1),
                now_utc,
            )
            is False
        )

    @pytest.mark.asyncio
    async def test_get_user_from_api_key_updates_stale_last_used(self, db, test_user):
        raw_key = "ag_live_usage_tracking_stale"
        stale_last_used = datetime.now(timezone.utc) - API_KEY_LAST_USED_WRITE_INTERVAL - timedelta(minutes=1)
        api_key = _create_api_key(
            db,
            test_user.id,
            raw_key,
            last_used_at=stale_last_used,
            scope='["ingest","read"]',
        )

        user, scopes = await get_user_from_api_key(authorization=f"Bearer {raw_key}", db=db)

        db.refresh(api_key)
        assert user.id == test_user.id
        assert scopes == ["ingest", "read"]
        assert api_key.last_used_at is not None
        assert _as_naive_utc(api_key.last_used_at) > _as_naive_utc(stale_last_used)

    @pytest.mark.asyncio
    async def test_get_user_from_api_key_skips_frequent_last_used_writes(self, db, test_user):
        raw_key = "ag_live_usage_tracking_recent"
        recent_last_used = datetime.now(timezone.utc) - timedelta(minutes=1)
        api_key = _create_api_key(db, test_user.id, raw_key, last_used_at=recent_last_used, scope="ingest")

        user, scopes = await get_user_from_api_key(authorization=f"Bearer {raw_key}", db=db)

        db.refresh(api_key)
        assert user.id == test_user.id
        assert scopes == ["ingest"]
        assert _as_naive_utc(api_key.last_used_at) == _as_naive_utc(recent_last_used)
