"""Raw evidence objects — MinIO (preserved-stack responsibility).

Every retrieved source's full payload (url, title, excerpts) is stored as an
immutable object under mission/{id}/source/{id}.json — the untransformed
evidence behind the §5 lineage, addressable for audit ("show me exactly what
was retrieved").
"""
from __future__ import annotations

import io
import json

from app.config import Settings

BUCKET = "genesis-evidence"


class EvidenceObjectStore:
    def __init__(self, settings: Settings):
        self._client = None
        if settings.force_mock:
            return
        try:
            from minio import Minio

            self._client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=False,
            )
            if not self._client.bucket_exists(BUCKET):
                self._client.make_bucket(BUCKET)
            print(f"[objects] MinIO connected: {settings.minio_endpoint}/{BUCKET}")
        except Exception as err:
            print(f"[objects] MinIO unreachable ({err}) — DEGRADED: raw evidence objects not stored")
            self._client = None

    @property
    def available(self) -> bool:
        return self._client is not None

    def put_source(self, mission_id: str, source_id: str, payload: dict) -> str | None:
        if self._client is None:
            return None
        try:
            key = f"mission/{mission_id}/source/{source_id}.json"
            data = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
            self._client.put_object(BUCKET, key, io.BytesIO(data), len(data),
                                    content_type="application/json")
            return key
        except Exception as err:
            print(f"[objects] MinIO put failed: {err}")
            return None
