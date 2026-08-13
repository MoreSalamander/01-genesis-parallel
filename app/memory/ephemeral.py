"""Ephemeral high-speed state — Redis (preserved-stack responsibility).

Used for short-lived cross-process coordination, never as a knowledge layer:
here, a rate window on mission starts that protects the Parallel and Gemini
quotas from runaway launch loops.
"""
from __future__ import annotations

import threading
import time

from app.config import Settings


class InProcEphemeral:
    """Tests / forced-mock fallback."""

    def __init__(self):
        self._data: dict[str, tuple[str, float]] = {}
        self._counters: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def acquire_latch(self, key: str, value: str, ttl_s: int) -> str | None:
        with self._lock:
            existing = self._data.get(key)
            now = time.time()
            if existing and existing[1] > now:
                return existing[0]
            self._data[key] = (value, now + ttl_s)
            return None

    def release_latch(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def allow_rate(self, key: str, limit: int, window_s: int) -> bool:
        with self._lock:
            count, expiry = self._counters.get(key, (0, 0.0))
            now = time.time()
            if expiry <= now:
                count, expiry = 0, now + window_s
            count += 1
            self._counters[key] = (count, expiry)
            return count <= limit


class RedisEphemeral:
    def __init__(self, url: str):
        import redis

        self._redis = redis.Redis.from_url(url, socket_connect_timeout=3, socket_timeout=3)
        self._redis.ping()
        print(f"[ephemeral] Redis connected: {url}")

    def acquire_latch(self, key: str, value: str, ttl_s: int) -> str | None:
        """Returns None when acquired; otherwise the current holder's value."""
        if self._redis.set(key, value, nx=True, ex=ttl_s):
            return None
        holder = self._redis.get(key)
        return holder.decode() if holder else "unknown"

    def release_latch(self, key: str) -> None:
        self._redis.delete(key)

    def allow_rate(self, key: str, limit: int, window_s: int) -> bool:
        count = self._redis.incr(key)
        if count == 1:
            self._redis.expire(key, window_s)
        return count <= limit


def get_ephemeral(settings: Settings):
    if settings.force_mock or not settings.redis_url:
        return InProcEphemeral()
    try:
        return RedisEphemeral(settings.redis_url)
    except Exception as err:
        print(f"[ephemeral] Redis unreachable ({err}) — DEGRADED: in-process latches only")
        return InProcEphemeral()


MISSION_RATE_KEY = "genesis:signal:mission:rate"
MISSION_RATE_LIMIT = 5
MISSION_RATE_WINDOW_S = 60
