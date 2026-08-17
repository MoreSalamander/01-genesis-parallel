"""Gemini cognition layer (locked §8: Gemini = cognition, Parallel = observation,
DataHub = knowledge/context/provenance).

LIVE mode calls Gemini at runtime via the official `google-genai` SDK
(hackathon Google Cloud requirement — accepted SDK, imported and actually
called). MOCK mode is a deterministic cognition stand-in so the system runs
with no credentials. Both implement the same role-based interface, so agents
never know which one they are talking to.
"""
from __future__ import annotations

import json
import re
from typing import Any, Protocol

from app.config import Settings
from app import runtime_proof

ROLE_PROMPTS: dict[str, str] = {
    "research_plan": (
        "You are the Research Planner for a film studio's Signal Intelligence system. "
        "Decompose the intelligence objective into research tasks across exactly these cognitive "
        "domains: market, talent, industry, strategic. Return JSON: {\"tasks\": [{\"domain\": str, "
        "\"focus\": str, \"queries\": [str, ...]}]} with 1-2 tasks per relevant domain and 2-3 "
        "web-search queries each. Queries must be concrete and derived from the objective."
    ),
    "evidence_extraction": (
        "You extract atomic factual claims from web search results for an intelligence system. "
        "For each result excerpt, produce zero or more claims. Return JSON: {\"claims\": [{\"source_url\": str, "
        "\"statement\": str (the observed statement, close to the text), \"claim\": str (normalized factual claim), "
        "\"entity\": str (primary organization/person), \"confidence\": float 0-1}]}. "
        "Never invent facts not present in the excerpts."
    ),
    "verification_analysis": (
        "You are the Verification cognition for an intelligence system. Group the provided claims that "
        "assert the same underlying fact, and detect contradictions (same fact, incompatible values). "
        "Return JSON: {\"groups\": [{\"claim\": str, \"entity\": str, \"member_indices\": [int], "
        "\"contradiction\": bool, \"contradiction_detail\": str}]}. Claims from different source URLs "
        "in the same group corroborate each other. Preserve disagreements; never pick a winner."
    ),
    # Does the answer actually answer the question? A recommendation that
    # prioritises "verified high-CPM niches" while holding one disputed CPM
    # figure has named its own missing input and stopped — which is a plan to
    # find out, not a finding. This role exists to catch that, and its output
    # drives another research round.
    "sufficiency_check": (
        "You are the Sufficiency Auditor for a film studio's Signal Intelligence system. "
        "You are given the original objective and the answer assembled for it. Decide whether "
        "the answer FULFILS the objective as literally asked. Be strict and concrete:\n"
        "- If the objective asks for a number of specific items (e.g. 'top 10 ideas'), an answer "
        "that describes the category without listing them is NOT fulfilled.\n"
        "- If the answer recommends acting on data it does not actually contain, or cites a "
        "criterion it has not measured, that is an unmet dependency and NOT fulfilled.\n"
        "- If the answer is a process for finding the answer rather than the answer, it is NOT "
        "fulfilled.\n"
        "Return JSON: {\"fulfilled\": bool, \"reason\": str, \"gaps\": [{\"question\": str, "
        "\"why\": str}]}. Each gap question must be a self-contained research question that, if "
        "answered, closes the shortfall. Return at most 4 gaps, ordered by how much they block "
        "the objective. If fulfilled is true, gaps must be empty."
    ),
    "strategic_assessment": (
        "You are Strategic Cognition for a film studio ('Convergence Studios'). Given verified/unverified/"
        "conflicted claims about external entities, produce findings and one recommendation for the Studio "
        "Head. Return JSON: {\"findings\": [{\"domain\": \"market|talent|industry|strategic\", \"text\": str, "
        "\"impact\": \"HIGH|MEDIUM|LOW\", \"claim_indices\": [int]}], \"recommendation\": {\"action\": str, "
        "\"rationale\": str (grounded ONLY in the provided claims), \"confidence\": float 0-1}}. "
        "If evidence is insufficient, say so explicitly in the rationale and lower confidence."
    ),
}


class Cognition(Protocol):
    live: bool

    def generate_json(self, role: str, payload: dict[str, Any]) -> dict[str, Any]: ...


class GeminiCognition:
    """Real Gemini via google-genai (API key or Vertex AI, auto-detected from env)."""

    live = True

    def __init__(self, settings: Settings):
        from google import genai  # accepted hackathon SDK: google-genai

        self.settings = settings
        self._client = genai.Client()
        self._model = settings.gemini_model

    def generate_json(self, role: str, payload: dict[str, Any]) -> dict[str, Any]:
        import time

        from app import cognition_ledger
        from app.observability.tracing import span

        prompt = ROLE_PROMPTS[role] + "\n\nINPUT:\n" + json.dumps(payload, ensure_ascii=False)
        started = time.monotonic()
        tokens: dict[str, int] = {}
        try:
            with span("gemini.generate", role=role, model=self._model) as sp:
                response = self._client.models.generate_content(
                    model=self._model,
                    contents=prompt,
                    config={"response_mime_type": "application/json", "temperature": 0.2},
                )
                usage = getattr(response, "usage_metadata", None)
                if usage is not None:
                    tokens = {
                        "prompt": getattr(usage, "prompt_token_count", 0) or 0,
                        "total": getattr(usage, "total_token_count", 0) or 0,
                    }
                if sp is not None and tokens:
                    sp.set_attribute("tokens.prompt", tokens["prompt"])
                    sp.set_attribute("tokens.total", tokens["total"])
        except Exception as err:
            # A failed call is part of the reasoning record. Dropping it would
            # leave the console showing an unbroken run of successes.
            cognition_ledger.record(
                role=role, model=self._model, live=True, prompt=prompt, raw="",
                ms=int((time.monotonic() - started) * 1000), parsed_ok=False,
                tokens=tokens, error=f"{type(err).__name__}: {err}",
            )
            raise
        # First-hand proof of Google Cloud usage: the call came back.
        runtime_proof.record("gemini", "LIVE",
                             f"{self._model} returned a response this session")
        text = response.text or ""
        ms = int((time.monotonic() - started) * 1000)

        # Record the exact prompt and the exact reply, before parsing. The
        # console renders the reasoning from this, so it has to be what was
        # really sent and really returned — not a retelling of the parsed result.
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
            else:
                cognition_ledger.record(
                    role=role, model=self._model, live=True, prompt=prompt, raw=text,
                    ms=ms, parsed_ok=False, tokens=tokens,
                    error="response was not JSON and contained no JSON object",
                )
                raise
        cognition_ledger.record(
            role=role, model=self._model, live=True, prompt=prompt, raw=text,
            ms=ms, parsed_ok=True, tokens=tokens,
        )
        return parsed


class MockCognition:
    """Deterministic cognition used when no Google credentials are configured."""

    live = False

    def generate_json(self, role: str, payload: dict[str, Any]) -> dict[str, Any]:
        import time

        from app import cognition_ledger

        handler = getattr(self, f"_{role}", None)
        if handler is None:
            raise ValueError(f"MockCognition has no handler for role '{role}'")
        started = time.monotonic()
        result = handler(payload)
        # Recorded too, and flagged live=False: fixture output must never
        # appear under a model's name.
        cognition_ledger.record(
            role=role, model="fixture (no model called)", live=False,
            prompt=ROLE_PROMPTS.get(role, "") + "\n\nINPUT:\n"
                   + json.dumps(payload, ensure_ascii=False, default=str),
            raw=json.dumps(result, ensure_ascii=False, default=str),
            ms=int((time.monotonic() - started) * 1000), parsed_ok=True,
        )
        return result

    # -- research_plan ------------------------------------------------------
    def _research_plan(self, payload: dict) -> dict:
        objective = payload.get("objective", "external developments")
        subject = objective.rstrip(".").lower()
        return {
            "tasks": [
                {"domain": "market", "focus": f"Market signals related to: {subject}",
                 "queries": [f"{subject} funding", f"{subject} distribution deals"]},
                {"domain": "talent", "focus": f"Talent and leadership moves related to: {subject}",
                 "queries": [f"{subject} leadership hires", f"{subject} creator moves"]},
                {"domain": "industry", "focus": f"Industry and technology developments related to: {subject}",
                 "queries": [f"{subject} technology virtual production", f"{subject} industry expansion"]},
                {"domain": "strategic", "focus": f"Strategic opportunities and threats related to: {subject}",
                 "queries": [f"{subject} competitive positioning", f"{subject} strategic partnerships"]},
            ]
        }

    # -- evidence_extraction -------------------------------------------------
    def _evidence_extraction(self, payload: dict) -> dict:
        claims = []
        for result in payload.get("results", []):
            for excerpt in result.get("excerpts", []):
                snippet = " ".join(excerpt.split())[:240]  # keep mock claims readable on live excerpts
                entity = self._entity_of(snippet) or self._entity_of(result.get("title", "")) or ""
                claims.append(
                    {
                        "source_url": result.get("url", ""),
                        "statement": snippet,
                        "claim": snippet,
                        "entity": entity,
                        "confidence": 0.6,
                    }
                )
        return {"claims": claims}

    @staticmethod
    def _entity_of(text: str) -> str:
        match = re.search(r"([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)+)", text)
        if not match:
            return ""
        entity = match.group(1)
        return entity[4:] if entity.startswith("The ") else entity

    # -- verification_analysis ------------------------------------------------
    def _verification_analysis(self, payload: dict) -> dict:
        claims = payload.get("claims", [])
        buckets: dict[str, list[int]] = {}
        for i, claim in enumerate(claims):
            key = (claim.get("entity", "") + "|" + self._topic_key(claim.get("claim", ""))).lower()
            buckets.setdefault(key, []).append(i)
        groups = []
        for key, indices in buckets.items():
            texts = [claims[i]["claim"] for i in indices]
            amounts = {m for t in texts for m in re.findall(r"\$\d+(?:\.\d+)?\s*[MmBb]", t)}
            contradiction = len(amounts) > 1
            groups.append(
                {
                    "claim": texts[0],
                    "entity": claims[indices[0]].get("entity", ""),
                    "member_indices": indices,
                    "contradiction": contradiction,
                    "contradiction_detail": (
                        f"Sources disagree on amount: {', '.join(sorted(amounts))}" if contradiction else ""
                    ),
                }
            )
        return {"groups": groups}

    @staticmethod
    def _topic_key(text: str) -> str:
        lowered = text.lower()
        for topic in ("series a", "funding", "financ", "raise"):
            if topic in lowered:
                return "funding"
        for topic in ("cto", "join", "hire", "head of"):
            if topic in lowered:
                return "leadership"
        for topic in ("first-look", "streamer", "distribution"):
            if topic in lowered:
                return "distribution"
        for topic in ("led", "virtual-production", "stage", "volume"):
            if topic in lowered:
                return "virtual-production"
        return re.sub(r"[^a-z]+", "-", lowered)[:32]

    # -- strategic_assessment ---------------------------------------------------
    def _sufficiency_check(self, payload: dict) -> dict:
        """Deterministic stand-in for the auditor.

        It cannot read intent, so it checks the two shortfalls that are
        decidable from structure alone: an objective that asks for N items
        against an answer that lists none, and a recommendation that leans on a
        criterion nothing verified measured. Anything subtler is left to the
        model — this returns fulfilled rather than inventing a gap.
        """
        import re

        objective = str(payload.get("objective", ""))
        answer = str(payload.get("recommendation", "")) + " " + " ".join(
            str(f) for f in payload.get("findings", []))
        verified = [str(c) for c in payload.get("verified_claims", [])]
        gaps = []

        wanted = re.search(r"\btop\s+(\d+)|\b(\d+)\s+(?:ideas|examples|options|ways)", objective, re.I)
        if wanted:
            n = int(next(g for g in wanted.groups() if g))
            # Does the answer actually enumerate anything?
            listed = len(re.findall(r"(?m)^\s*(?:\d+[.)]|[-*])\s+", answer))
            if listed < n:
                gaps.append({
                    "question": f"What are {n} specific, named options for: {objective.strip()}?",
                    "why": f"the objective asks for {n} items and the answer enumerates {listed}",
                })

        # Grouped, because these are the same claim wearing different words: an
        # answer that measured "cost" has not failed to measure "budget", and
        # flagging that would manufacture work rather than find a real gap.
        criteria = {
            "CPM": ("cpm",),
            "competition": ("competition", "competitor", "saturation"),
            "cost": ("cost", "budget", "price", "spend"),
            "revenue": ("revenue", "earnings", "income", "monetis", "monetiz"),
        }
        lowered_answer = answer.lower()
        lowered_claims = " ".join(verified).lower()
        for label, terms in criteria.items():
            if not any(t in lowered_answer for t in terms):
                continue
            if any(t in lowered_claims for t in terms):
                continue
            gaps.append({
                "question": f"What are the actual {label} figures relevant to: {objective.strip()}?",
                "why": f"the answer prioritises by {label} but no verified claim measures it",
            })
            break

        return {
            "fulfilled": not gaps,
            "reason": ("The answer addresses the objective as asked." if not gaps
                       else "The answer names inputs it does not supply."),
            "gaps": gaps[:4],
        }

    def _strategic_assessment(self, payload: dict) -> dict:
        claims = payload.get("claims", [])
        verified = [i for i, c in enumerate(claims) if c.get("status") == "VERIFIED"]
        conflicted = [i for i, c in enumerate(claims) if c.get("status") == "CONFLICTED"]
        from collections import Counter

        counts = Counter(c.get("entity") for c in claims if c.get("entity"))
        markers = ("studio", "studios", "collective", "ventures", "pictures", "films", "media", "labs")
        companies = [e for e in counts if any(m in e.lower() for m in markers)]
        if companies:
            primary = max(companies, key=lambda e: counts[e])
        elif counts:
            primary = counts.most_common(1)[0][0]
        else:
            primary = "the subject"
        findings = []
        if verified:
            findings.append(
                {
                    "domain": "market",
                    "text": f"{primary} shows corroborated expansion signals (funding/leadership) relevant to studio strategy.",
                    "impact": "HIGH",
                    "claim_indices": verified,
                }
            )
        if conflicted:
            findings.append(
                {
                    "domain": "strategic",
                    "text": f"Reported deal size for {primary} is disputed across credible sources; treat magnitude as unresolved.",
                    "impact": "MEDIUM",
                    "claim_indices": conflicted,
                }
            )
        findings.append(
            {
                "domain": "industry",
                "text": "Virtual-production capacity in the segment is growing; monitor for partnership options.",
                "impact": "MEDIUM",
                "claim_indices": [i for i, c in enumerate(claims) if "virtual-production" in c.get("claim", "").lower()
                                  or "LED" in c.get("claim", "")],
            }
        )
        confidence = 0.87 if verified else 0.4
        return {
            "findings": findings,
            "recommendation": {
                "action": f"Monitor {primary} closely; open a partnership/acquisition evaluation if expansion is confirmed next quarter.",
                "rationale": (
                    f"{len(verified)} corroborated claim(s) support material expansion by {primary}; "
                    f"{len(conflicted)} claim group(s) remain conflicted and are preserved as unresolved. "
                    "Recommendation is grounded only in retrieved evidence."
                ),
                "confidence": confidence,
            },
        }


def get_cognition(settings: Settings) -> Cognition:
    if settings.gemini_live:
        return GeminiCognition(settings)
    return MockCognition()
