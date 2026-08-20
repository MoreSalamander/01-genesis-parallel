"""One-off: collapse the claim rows re-verification left behind.

Until verification rebuilt its picture instead of appending to it, a mission that
ran nested-question rounds verified its whole evidence list again each round and
appended the result. The same fact then stood twice, and the older copy kept the
status it had before the corroboration arrived — "Spain offers up to a 30% rebate"
reading UNVERIFIED (1 source) beside VERIFIED (5 sources).

This puts the stored missions into the state one pass would have produced. It does
not re-run verification: nothing here calls a model or spends a retrieval. The
grouping the model already did is kept, and only what is derivable from the
mission's own evidence is recomputed —

    corroborating_sources = distinct source URLs under the merged evidence
    status                = CONFLICTED if either copy preserved a disagreement,
                            else VERIFIED at >= 2 distinct sources, else UNVERIFIED

which is the verifier's own rule (agents/verification/verifier.py), applied to the
union rather than to whichever half a round happened to see.

Findings are deduplicated the same way and repointed at the surviving claims, the
recommendation is repointed at the surviving findings, and each entity in the world
model drops the assertions whose claim no longer exists.

    .venv/bin/python ops/collapse_reverified_claims.py            # dry run
    .venv/bin/python ops/collapse_reverified_claims.py --apply
"""
from __future__ import annotations

import json
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.memory.durable import get_store
from app.models.evidence import Mission, VerificationStatus

APPLY = "--apply" in sys.argv


def key(text: str, entity: str) -> tuple[str, str]:
    return (" ".join((text or "").split()).lower(), (entity or "").strip().lower())


def collapse(mission: Mission) -> dict:
    """Return what changed; mutates the mission in place."""
    source_url = {s.id: s.url for s in mission.sources}
    evidence_source = {e.id: e.source_id for e in mission.evidence}

    groups: dict[tuple[str, str], list] = defaultdict(list)
    for claim in mission.claims:
        groups[key(claim.text, claim.entity)].append(claim)

    # Which claim ids the findings point at — a surviving claim keeps a cited id
    # where it can, so a finding's chain into the evidence is not broken by the
    # collapse itself.
    cited = Counter()
    for finding in mission.findings:
        for claim_id in finding.claim_ids:
            cited[claim_id] += 1

    survivors = []
    remap: dict[str, str] = {}
    for members in groups.values():
        keeper = max(members, key=lambda c: (cited[c.id], c.corroborating_sources))
        evidence_ids = list(dict.fromkeys(eid for c in members for eid in c.evidence_ids))
        distinct = {source_url.get(evidence_source.get(eid, ""), "") for eid in evidence_ids}
        distinct.discard("")
        disagreement = next(
            (c for c in members if c.status == VerificationStatus.CONFLICTED), None
        )
        keeper.evidence_ids = evidence_ids
        keeper.corroborating_sources = len(distinct)
        if disagreement is not None:
            # A disagreement two sources had is not resolved by merging the rows
            # that recorded it (§6: conflicts are preserved, never quietly settled).
            keeper.status = VerificationStatus.CONFLICTED
            keeper.conflict_detail = keeper.conflict_detail or disagreement.conflict_detail
        elif len(distinct) >= 2:
            keeper.status = VerificationStatus.VERIFIED
        else:
            keeper.status = VerificationStatus.UNVERIFIED
        for member in members:
            remap[member.id] = keeper.id
        survivors.append(keeper)

    dropped_claims = len(mission.claims) - len(survivors)
    mission.claims = survivors

    by_claim = {c.id: c for c in survivors}
    for claim in survivors:
        for evidence_id in claim.evidence_ids:
            for evidence in mission.evidence:
                if evidence.id == evidence_id:
                    evidence.verification_status = claim.status

    for finding in mission.findings:
        finding.claim_ids = [
            cid for cid in dict.fromkeys(remap.get(i, i) for i in finding.claim_ids)
            if cid in by_claim
        ]

    # Synthesis appended too, and each round words the same conclusion
    # differently, so there is nothing to match on by text. What there is: the
    # ASSESSED stage records a running total, so the last round's findings are
    # exactly the tail after the previous total — the answer as it stood when the
    # mission finished, with the superseded drafts behind it. Anything that does
    # not reconcile is left alone rather than guessed at.
    counts = []
    for stage in mission.stages:
        if stage.name == "ASSESSED":
            head = stage.detail.split(" ", 1)[0]
            counts.append(int(head) if head.isdigit() else -1)
    dropped_findings = 0
    if len(counts) > 1 and all(c >= 0 for c in counts) and counts[-1] == len(mission.findings):
        keep_from = counts[-2]
        dropped_findings = keep_from
        mission.findings = mission.findings[keep_from:]

    if mission.recommendation:
        live = {f.id for f in mission.findings}
        mission.recommendation.finding_ids = [
            fid for fid in mission.recommendation.finding_ids if fid in live
        ] or [f.id for f in mission.findings]

    return {"claims": dropped_claims, "findings": dropped_findings,
            "live_claim_ids": {c.id for c in survivors}}


def main() -> None:
    store = get_store(settings)
    docs = store.list("mission", limit=1000)
    print(f"missions in the store: {len(docs)}\n")

    if APPLY:
        # Every mission as it stands, before anything is rewritten. This pass
        # merges rows and cannot un-merge them.
        backups = Path(settings.data_dir) / "backups"
        backups.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        (backups / f"missions-before-collapse-{stamp}.json").write_text(
            json.dumps(docs, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
        print(f"missions backed up to backups/missions-before-collapse-{stamp}.json\n")

    live_by_mission: dict[str, set[str]] = {}
    touched = 0
    total_claims = total_findings = 0
    for doc in docs:
        try:
            mission = Mission.model_validate(doc)
        except Exception as err:
            print(f"!! skipping unreadable mission doc: {err}")
            continue
        before = len(mission.claims)
        result = collapse(mission)
        live_by_mission[mission.id] = result["live_claim_ids"]
        if not result["claims"] and not result["findings"]:
            continue
        touched += 1
        total_claims += result["claims"]
        total_findings += result["findings"]
        print(f"{mission.id}  -{result['claims']:3} claims (of {before:3})  "
              f"-{result['findings']} findings   {mission.objective[:58]}")
        if APPLY:
            mission.updated_at = datetime.now(timezone.utc)
            store.upsert("mission", mission.id, mission.status.value, False,
                         mission.model_dump(mode="json"))

    print(f"\n{touched} missions carried duplicates · "
          f"{total_claims} surplus claim rows · {total_findings} surplus findings")

    # The world model promotes by claim id, so a claim that no longer exists
    # leaves an assertion behind it that nothing supports.
    entities_path = Path(settings.data_dir) / "knowledge_entities.json"
    entities = json.loads(entities_path.read_text(encoding="utf-8")) if entities_path.exists() else {}
    orphans = emptied = 0
    for name, record in list(entities.items()):
        assertions = record.get("assertions", [])
        kept = []
        for assertion in assertions:
            live = live_by_mission.get(assertion.get("mission_id", ""))
            # Missions the store no longer holds are left alone: their assertions
            # are old but they are not known-stale, and dropping them would be
            # this pass inventing a retraction.
            if live is None or assertion.get("claim_id") in live:
                kept.append(assertion)
        orphans += len(assertions) - len(kept)
        if len(assertions) != len(kept):
            record["assertions"] = kept
        if not record.get("assertions"):
            entities.pop(name, None)
            emptied += 1

    print(f"world model: {orphans} assertions with no surviving claim · "
          f"{emptied} entities left holding nothing")

    if APPLY:
        backup = entities_path.with_name(
            f"knowledge_entities.before-collapse-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
        shutil.copy2(entities_path, backup)
        entities_path.write_text(json.dumps(entities, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\napplied · entities backed up to {backup.name}")
    else:
        print("\ndry run — nothing written. Re-run with --apply")


if __name__ == "__main__":
    main()
