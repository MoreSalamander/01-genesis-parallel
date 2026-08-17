"use client";
/* The context graph: where a fact came from.

   The knowledge graph answers "what does the studio know about X". This
   answers the other question a Studio Head asks — "where did that come from" —
   by drawing the provenance chain the store actually recorded:

       source → evidence → claim → entity          (how a fact was assembled)
       question → finding → recommendation         (how a decision was reached)
       question → nested question                   (what the answer raised)

   Each column is a kind of thing, sized by how many of them exist. Clicking a
   kind shows what it holds and what it connects to, so the chain can be walked
   rather than taken on trust. Every relation drawn is one the store emitted;
   nothing here is inferred. */

import { useEffect, useMemo, useState } from "react";
import { RelationshipRecord, getKnowledgeRelationships } from "@/lib/api";

const KIND_LABEL: Record<string, string> = {
  source: "sources", evidence: "quotes", claim: "facts", entity: "companies & people",
  objective: "questions", gap: "nested questions", finding: "findings",
  recommendation: "recommendations",
};
const KIND_EXPLAIN: Record<string, string> = {
  source: "Web pages the researcher actually opened.",
  evidence: "Exact passages pulled out of those pages.",
  claim: "Statements assembled from the quotes, then checked against each other.",
  entity: "The companies and people those statements are about.",
  objective: "The questions you asked.",
  gap: "What the first answer left open. Each became a question of its own, researched before answering you.",
  finding: "The patterns worth acting on.",
  recommendation: "What it advised you to do.",
};
// `gap` sits next to `objective` because that is where it comes from: the
// deepen loop audits an answer and writes objective ─raised─> gap. A kind
// missing from this list is filtered out of the graph entirely, which is how
// follow-up questions stayed invisible while being recorded all along.
const ORDER = ["objective", "gap", "source", "evidence", "claim", "entity", "finding", "recommendation"];

export function ContextGraph() {
  const [rels, setRels] = useState<RelationshipRecord[]>([]);
  const [kind, setKind] = useState<string | null>(null);

  useEffect(() => {
    getKnowledgeRelationships(400).then(setRels).catch(() => setRels([]));
  }, []);

  const { counts, links } = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    const links = new Map<string, number>();
    for (const r of rels) {
      if (!counts.has(r.src_kind)) counts.set(r.src_kind, new Set());
      if (!counts.has(r.dst_kind)) counts.set(r.dst_kind, new Set());
      counts.get(r.src_kind)!.add(r.src);
      counts.get(r.dst_kind)!.add(r.dst);
      const key = `${r.src_kind}|${r.rel}|${r.dst_kind}`;
      links.set(key, (links.get(key) ?? 0) + 1);
    }
    return { counts, links };
  }, [rels]);

  if (rels.length === 0) return null;

  const present = ORDER.filter((k) => counts.has(k));
  const selectedLinks = kind
    ? [...links.entries()]
        .map(([key, n]) => {
          const [src, rel, dst] = key.split("|");
          return { src, rel, dst, n };
        })
        .filter((l) => l.src === kind || l.dst === kind)
    : [];

  return (
    <section className="panel graph-panel">
      <h2>
        Where everything came from
        <span className="muted">
          {" · "}{rels.length} recorded links between {present.length} kinds of thing
        </span>
      </h2>

      {/* The chain is a corridor, not a row. Each step sits further back than the
          one before it, so "this came from that" is carried by depth rather than
          by an arrow you have to read. Transforms only — the layout, the tab
          order and the text are unchanged, and a reader who cannot perceive the
          depth loses nothing but the depth. */}
      <div className="chain chain-3d" role="list">
        {present.map((k, i) => (
          <div className="chain-step" key={k}
               style={{ "--step": i, "--steps": present.length } as React.CSSProperties}>
            <button
              role="listitem"
              className={`chain-node${kind === k ? " on" : ""}`}
              onClick={() => setKind(kind === k ? null : k)}
              aria-pressed={kind === k}
            >
              <span className="cn-count">{counts.get(k)!.size}</span>
              <span className="cn-label">{KIND_LABEL[k] ?? k}</span>
            </button>
            {i < present.length - 1 && <span className="chain-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>

      <div className="chain-detail">
        {kind ? (
          <>
            <p className="cd-lead">
              <b>{counts.get(kind)!.size} {KIND_LABEL[kind] ?? kind}</b> — {KIND_EXPLAIN[kind] ?? ""}
            </p>
            <ul className="cd-links">
              {selectedLinks.map((l) => (
                <li key={`${l.src}${l.rel}${l.dst}`}>
                  <span className="cd-n">{l.n}</span>
                  <span>
                    {KIND_LABEL[l.src] ?? l.src} <b>{l.rel}</b> {KIND_LABEL[l.dst] ?? l.dst}
                  </span>
                </li>
              ))}
              {selectedLinks.length === 0 && <li className="muted">No recorded links for this kind.</li>}
            </ul>
          </>
        ) : (
          <p className="cd-hint">
            Every fact in this system can be walked back to the page it came from. Click any
            step to see what it holds and what it connects to.
          </p>
        )}
      </div>
    </section>
  );
}
