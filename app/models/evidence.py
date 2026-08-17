"""Locked evidence lineage (Architecture Review V2 §5):

    Source → Observation → Evidence → Claim → Finding → Recommendation

Every object carries enough provenance to answer "Why do you believe this?"
Verification states (§6): VERIFIED / UNVERIFIED / CONFLICTED — conflicts are
preserved, never silently resolved.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    UNVERIFIED = "UNVERIFIED"
    CONFLICTED = "CONFLICTED"


class Domain(str, Enum):
    MARKET = "market"
    TALENT = "talent"
    INDUSTRY = "industry"
    STRATEGIC = "strategic"


class StrategicImpact(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class MissionStatus(str, Enum):
    PLANNED = "PLANNED"
    RESEARCHING = "RESEARCHING"
    VERIFYING = "VERIFYING"
    SYNTHESIZING = "SYNTHESIZING"
    RECOMMENDED = "RECOMMENDED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    MORE_RESEARCH_REQUESTED = "MORE_RESEARCH_REQUESTED"
    INCOMPLETE = "INCOMPLETE"


class Source(BaseModel):
    id: str = Field(default_factory=lambda: new_id("src"))
    url: str
    title: str
    source_type: str = "web"
    retrieved_at: datetime = Field(default_factory=utcnow)


class Observation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("obs"))
    source_id: str
    statement: str


class Evidence(BaseModel):
    id: str = Field(default_factory=lambda: new_id("evd"))
    observation_id: str
    source_id: str
    claim_text: str
    supporting_content: str = ""
    confidence: float = 0.5
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    related_entities: list[str] = Field(default_factory=list)
    retrieved_at: datetime = Field(default_factory=utcnow)
    provenance: dict = Field(default_factory=dict)


class Claim(BaseModel):
    id: str = Field(default_factory=lambda: new_id("clm"))
    text: str
    entity: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    corroborating_sources: int = 0
    status: VerificationStatus = VerificationStatus.UNVERIFIED
    conflict_detail: str = ""


class Finding(BaseModel):
    id: str = Field(default_factory=lambda: new_id("fnd"))
    domain: Domain
    text: str
    claim_ids: list[str] = Field(default_factory=list)
    strategic_impact: StrategicImpact = StrategicImpact.MEDIUM


class Recommendation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rec"))
    mission_id: str
    action: str
    rationale: str
    confidence: float
    finding_ids: list[str] = Field(default_factory=list)
    requires_authorization: bool = True
    decision: Optional[str] = None  # approved | rejected | more_research
    decided_at: Optional[datetime] = None


class ResearchTask(BaseModel):
    id: str = Field(default_factory=lambda: new_id("tsk"))
    domain: Domain
    focus: str
    queries: list[str] = Field(default_factory=list)
    specialist: str = ""


class MissionStage(BaseModel):
    name: str
    detail: str = ""
    at: datetime = Field(default_factory=utcnow)


class Mission(BaseModel):
    """Working memory (§10) for one intelligence mission."""

    id: str = Field(default_factory=lambda: new_id("msn"))
    objective: str
    status: MissionStatus = MissionStatus.PLANNED
    stages: list[MissionStage] = Field(default_factory=list)
    tasks: list[ResearchTask] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    observations: list[Observation] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    recommendation: Optional[Recommendation] = None
    error: str = ""
    # A follow-up the loop raised gets its own mission, so it lands on the board
    # with its own answer the way a typed question does. These say where it came
    # from, so it is presented as raised rather than passed off as asked — and
    # they are what stops the recursion: a mission that was itself raised does
    # not deepen again.
    raised_by: str = ""
    raised_because: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def stage(self, name: str, detail: str = "") -> None:
        self.stages.append(MissionStage(name=name, detail=detail))
        self.updated_at = utcnow()

    @property
    def verified_claims(self) -> list[Claim]:
        return [c for c in self.claims if c.status == VerificationStatus.VERIFIED]

    @property
    def conflicted_claims(self) -> list[Claim]:
        return [c for c in self.claims if c.status == VerificationStatus.CONFLICTED]
