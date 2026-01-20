"""
Bulkhead isolation using asyncio.Semaphore.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager


class Bulkhead:
    def __init__(self, max_concurrent: int = 10):
        self.semaphore = asyncio.Semaphore(max_concurrent)

    @asynccontextmanager
    async def acquire(self):
        await self.semaphore.acquire()
        try:
            yield
        finally:
            self.semaphore.release()
