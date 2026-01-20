"""
Lightweight retry utilities with exponential backoff and jitter.
"""
from __future__ import annotations

import asyncio
import random
import time
from typing import Callable, Iterable, Type, Any


def async_retry(
    retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 10.0,
    retry_exceptions: Iterable[Type[BaseException]] = (Exception,),
):
    """
    Decorator to retry async functions with exponential backoff and jitter.
    """

    def decorator(func: Callable):
        async def wrapper(*args, **kwargs):
            attempt = 0
            while True:
                try:
                    return await func(*args, **kwargs)
                except retry_exceptions as exc:
                    attempt += 1
                    if attempt > retries:
                        raise
                    delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                    delay = delay * (0.8 + random.random() * 0.4)  # jitter
                    await asyncio.sleep(delay)
        return wrapper
    return decorator


def sync_retry(
    retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 10.0,
    retry_exceptions: Iterable[Type[BaseException]] = (Exception,),
):
    """
    Decorator to retry sync functions with exponential backoff and jitter.
    """

    def decorator(func: Callable):
        def wrapper(*args, **kwargs):
            attempt = 0
            while True:
                try:
                    return func(*args, **kwargs)
                except retry_exceptions:
                    attempt += 1
                    if attempt > retries:
                        raise
                    delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                    delay = delay * (0.8 + random.random() * 0.4)
                    time.sleep(delay)
        return wrapper
    return decorator
