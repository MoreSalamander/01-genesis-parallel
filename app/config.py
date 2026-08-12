"""Runtime configuration for Genesis OS — Signal Intelligence.

Live integrations switch on automatically when credentials are present;
otherwise the system runs in mock mode so a clean clone is always demonstrable.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    parallel_api_key: str = field(default_factory=lambda: os.getenv("PARALLEL_API_KEY", "").strip())
    google_api_key: str = field(
        default_factory=lambda: (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()
    )
    use_vertex: bool = field(default_factory=lambda: _truthy(os.getenv("GOOGLE_GENAI_USE_VERTEXAI")))
    google_project: str = field(default_factory=lambda: os.getenv("GOOGLE_CLOUD_PROJECT", "").strip())
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip())
    datahub_gms_url: str = field(default_factory=lambda: os.getenv("DATAHUB_GMS_URL", "http://localhost:8080").strip())
    postgres_dsn: str = field(
        default_factory=lambda: os.getenv(
            "POSTGRES_DSN", "postgresql://genesis:genesis@localhost:5433/genesis_signal"
        ).strip()
    )
    nats_url: str = field(default_factory=lambda: os.getenv("NATS_URL", "nats://localhost:4223").strip())
    nats_subject: str = field(default_factory=lambda: os.getenv("NATS_SUBJECT", "genesis.signal.events").strip())
    temporal_address: str = field(
        default_factory=lambda: os.getenv("TEMPORAL_ADDRESS", "localhost:7233").strip()
    )
    temporal_task_queue: str = field(
        default_factory=lambda: os.getenv("TEMPORAL_TASK_QUEUE", "genesis-signal-missions").strip()
    )
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("GENESIS_DATA_DIR", "./data")))
    force_mock: bool = field(default_factory=lambda: _truthy(os.getenv("GENESIS_MOCK")))

    @property
    def parallel_live(self) -> bool:
        return bool(self.parallel_api_key) and not self.force_mock

    @property
    def gemini_live(self) -> bool:
        if self.force_mock:
            return False
        return bool(self.google_api_key) or (self.use_vertex and bool(self.google_project))

    def banner(self) -> str:
        return (
            "Genesis OS — Signal Intelligence | "
            f"Parallel: {'LIVE' if self.parallel_live else 'MOCK'} | "
            f"Gemini({self.gemini_model}): {'LIVE' if self.gemini_live else 'MOCK'} | "
            f"Knowledge: {'DataHub ' + self.datahub_gms_url if self.datahub_gms_url else 'local graph store'}"
        )


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
