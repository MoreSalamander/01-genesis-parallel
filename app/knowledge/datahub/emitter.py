"""DataHub mirror of the knowledge graph (locked §4: DataHub is the durable
knowledge/context/provenance substrate).

Staged integration: when DATAHUB_GMS_URL is set (and the optional
`acryl-datahub` extra is installed) every promoted entity is emitted to DataHub
with its assertions as properties; otherwise emission is skipped with a log
line and the local graph store remains the working substrate. This keeps the
locked DataHub role genuinely wired without making a heavy DataHub deployment a
prerequisite for running the standalone demo.
"""
from __future__ import annotations

from app.config import Settings


class DataHubEmitter:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._emitter = None
        if settings.datahub_gms_url:
            try:
                from datahub.emitter.rest_emitter import DatahubRestEmitter

                self._emitter = DatahubRestEmitter(gms_server=settings.datahub_gms_url)
            except ImportError:
                print("[knowledge] DATAHUB_GMS_URL set but acryl-datahub not installed "
                      "(pip install 'genesis-parallel[datahub]') — using local graph store only")

    @property
    def available(self) -> bool:
        return self._emitter is not None

    def emit_entity(self, name: str, record: dict) -> bool:
        if self._emitter is None:
            return False
        try:
            from datahub.emitter.mce_builder import make_dataset_urn
            from datahub.emitter.mcp import MetadataChangeProposalWrapper
            from datahub.metadata.schema_classes import DatasetPropertiesClass

            verified = [a["claim"] for a in record.get("assertions", []) if a.get("status") == "VERIFIED"]
            disputed = [a["claim"] for a in record.get("assertions", []) if a.get("disputed")]
            mcp = MetadataChangeProposalWrapper(
                entityUrn=make_dataset_urn(
                    platform="genesis-signal-intelligence",
                    name=name.lower().replace(" ", "_"),
                    env="PROD",
                ),
                aspect=DatasetPropertiesClass(
                    name=name,
                    description=f"Signal Intelligence knowledge entity ({record.get('type', 'Entity')}). "
                                f"{len(verified)} verified assertion(s), {len(disputed)} disputed.",
                    customProperties={
                        "entity_type": record.get("type", "Entity"),
                        "verified_assertions": " | ".join(verified)[:900],
                        "disputed_assertions": " | ".join(disputed)[:900],
                        "provenance": "genesis-parallel signal intelligence missions",
                    },
                ),
            )
            self._emitter.emit(mcp)
            return True
        except Exception as err:  # DataHub outage must not fail the mission (§12)
            print(f"[knowledge] DataHub emission failed for {name}: {err}")
            return False
