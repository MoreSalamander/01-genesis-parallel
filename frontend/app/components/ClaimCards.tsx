"use client";
/* Claims as cards, grouped by entity.

   A flat wall of claims buries the one thing this system does that others do
   not: when sources disagree, the disagreement is kept. So CONFLICTED claims
   sort to the top and render as a split card showing both source statements
   side by side — never merged, never averaged, never silently resolved. */

import { Claim, EvidenceT, SourceT } from "@/lib/api";
import { VerifyChip } from "./Chips";
import { cascade } from "@/lib/alive";

const METER_MAX = 4;

/** ●●●○ — corroboration at a glance, with the count kept for screen readers. */
function Corroboration({ sources }: { sources: number }) {
  const filled = Math.min(sources, METER_MAX);
  return (
    <span className="corrob" title={`${sources} corroborating source${sources === 1 ? "" : "s"}`}>
      <span aria-hidden="true">
        {"●".repeat(filled)}
        {"○".repeat(Math.max(0, METER_MAX - filled))}
        {sources > METER_MAX ? "+" : ""}
      </span>
      <span className="corrob-n">
        {sources} source{sources === 1 ? "" : "s"}
      </span>
    </span>
  );
}

function EvidenceLine({ evidence, source }: { evidence: EvidenceT; source?: SourceT }) {
  return (
    <div className="evidence">
      <div>“{evidence.supporting_content || evidence.claim_text}”</div>
      {source && (
        <div className="src">
          — <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
        </div>
      )}
    </div>
  );
}

/** Figures quoted by a piece of evidence — amounts, counts, dates. Two sources
 *  that quote the same figures are not the pair a conflict card should show. */
const FIGURES = /\$?\d[\d,.]*\s*(?:[MBK]\b|million|billion|thousand)?/gi;

function figuresOf(evidence: EvidenceT): string {
  const text = evidence.supporting_content || evidence.claim_text;
  return (text.match(FIGURES) ?? []).join("|").toLowerCase();
}

/** The two members that actually disagree. Showing the first two would happily
 *  put two agreeing sources either side of a "they disagree" seal, so pick the
 *  first pair quoting different figures — and if no such pair exists, say so by
 *  falling back to a plain list rather than staging a fake confrontation. */
function disagreeingPair(members: EvidenceT[]): [EvidenceT, EvidenceT] | null {
  for (let i = 0; i < members.length; i++) {
    const a = figuresOf(members[i]);
    if (!a) continue;
    for (let j = i + 1; j < members.length; j++) {
      const b = figuresOf(members[j]);
      if (b && b !== a) return [members[i], members[j]];
    }
  }
  return null;
}

function ConflictedCard({ claim, evidenceById, sourceById }: {
  claim: Claim;
  evidenceById: Map<string, EvidenceT>;
  sourceById: Map<string, SourceT>;
}) {
  const members = claim.evidence_ids
    .map((id) => evidenceById.get(id))
    .filter((e): e is EvidenceT => !!e);
  const pair = disagreeingPair(members);
  const [left, right] = pair ?? [];

  return (
    <div className="claim conflicted-card">
      <div className="head">
        <VerifyChip status={claim.status} />
        {claim.entity && <span className="entity">{claim.entity}</span>}
        <Corroboration sources={claim.corroborating_sources} />
      </div>
      <div className="text">{claim.text}</div>

      {left && right ? (
        <div className="conflict-split">
          <div className="side">
            <div className="side-label">one source says</div>
            <EvidenceLine evidence={left} source={sourceById.get(left.source_id)} />
          </div>
          <div className="versus" aria-hidden="true">vs</div>
          <div className="side">
            <div className="side-label">another says</div>
            <EvidenceLine evidence={right} source={sourceById.get(right.source_id)} />
          </div>
        </div>
      ) : (
        members.map((e) => (
          <EvidenceLine key={e.id} evidence={e} source={sourceById.get(e.source_id)} />
        ))
      )}

      <div className="preserved">
        ⚠ {claim.conflict_detail || "Sources disagree."} — the disagreement is preserved, not resolved.
      </div>
    </div>
  );
}

function PlainCard({ claim, evidenceById, sourceById }: {
  claim: Claim;
  evidenceById: Map<string, EvidenceT>;
  sourceById: Map<string, SourceT>;
}) {
  return (
    <div className="claim">
      <div className="head">
        <VerifyChip status={claim.status} />
        {claim.entity && <span className="entity">{claim.entity}</span>}
        <Corroboration sources={claim.corroborating_sources} />
      </div>
      <div className="text">{claim.text}</div>
      <details>
        <summary>Evidence trail ({claim.evidence_ids.length})</summary>
        {claim.evidence_ids.map((eid) => {
          const evidence = evidenceById.get(eid);
          if (!evidence) return null;
          return (
            <EvidenceLine key={eid} evidence={evidence} source={sourceById.get(evidence.source_id)} />
          );
        })}
      </details>
    </div>
  );
}

export function ClaimCards({ claims, evidence, sources }: {
  claims: Claim[];
  evidence: EvidenceT[];
  sources: SourceT[];
}) {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  // Group by entity, and put whichever groups carry a conflict first.
  const groups = new Map<string, Claim[]>();
  for (const claim of claims) {
    const key = claim.entity || "unattributed";
    const bucket = groups.get(key);
    if (bucket) bucket.push(claim);
    else groups.set(key, [claim]);
  }
  const hasConflict = (list: Claim[]) => list.some((c) => c.status === "CONFLICTED");
  const ordered = [...groups.entries()].sort(
    (a, b) => Number(hasConflict(b[1])) - Number(hasConflict(a[1])),
  );

  return (
    <div className="alive-cascade">
      {ordered.map(([entity, list], i) => (
        <section className="claim-group" key={entity} style={cascade(i)}>
          <h3 className="claim-entity">
            {entity}
            <span className="claim-count">{list.length} claim{list.length === 1 ? "" : "s"}</span>
          </h3>
          {[...list]
            .sort((a, b) => Number(b.status === "CONFLICTED") - Number(a.status === "CONFLICTED"))
            .map((claim) =>
              claim.status === "CONFLICTED"
                ? <ConflictedCard key={claim.id} claim={claim}
                                  evidenceById={evidenceById} sourceById={sourceById} />
                : <PlainCard key={claim.id} claim={claim}
                             evidenceById={evidenceById} sourceById={sourceById} />,
            )}
        </section>
      ))}
    </div>
  );
}
