"use client";
/* One question, written up as a paper.

   Everything the console shows in panels is the same record a reader would want
   laid out as an argument: what was asked, what was concluded, what the
   conclusion rests on, and where every piece of it came from. So this renders the
   mission as a paper — numbered sections, superscript citations, block quotes of
   the actual retrieved text, and a reference list of every page read.

   Two rules make it a paper rather than a printout. Every claim carries citations
   resolved through its own evidence to the source that produced it, so a reader
   can check any sentence against the page it came from. And the three
   verification states stay separate and labelled: confirmed, disputed with both
   sides kept, and single-source — because the value of the record is that it does
   not quietly average a disagreement away or promote an unconfirmed claim.

   It prints. A studio wants this as a PDF, so @media print drops the chrome and
   sets the type on white. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Claim, MissionDetail, MissionSummary, getMission, listMissions } from "@/lib/api";

const IMPACT: Record<string, string> = { HIGH: "high impact", MEDIUM: "medium impact", LOW: "low impact" };

export default function PaperPage() {
  const { id } = useParams<{ id: string }>();
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [all, setAll] = useState<MissionSummary[]>([]);

  useEffect(() => {
    if (!id) return;
    getMission(id).then(setMission).catch(() => {});
    listMissions().then(setAll).catch(() => setAll([]));
  }, [id]);

  /* Sources are numbered once, in the order they are first cited, and every
     citation anywhere in the paper resolves to that number. */
  const paper = useMemo(() => {
    if (!mission) return null;
    const evidenceById = new Map(mission.evidence.map((e) => [e.id, e]));
    const sourceById = new Map(mission.sources.map((s) => [s.id, s]));
    const numberOf = new Map<string, number>();
    const ordered: { n: number; title: string; url: string }[] = [];

    const citationsFor = (claim: Claim) => {
      const seen: number[] = [];
      for (const evidenceId of claim.evidence_ids) {
        const evidence = evidenceById.get(evidenceId);
        const source = evidence && sourceById.get(evidence.source_id);
        if (!source) continue;
        let n = numberOf.get(source.id);
        if (n === undefined) {
          n = ordered.length + 1;
          numberOf.set(source.id, n);
          ordered.push({ n, title: source.title || source.url, url: source.url });
        }
        if (!seen.includes(n)) seen.push(n);
      }
      return seen.sort((a, b) => a - b);
    };

    const quotesFor = (claim: Claim, limit = 2) =>
      claim.evidence_ids
        .map((eid) => evidenceById.get(eid))
        .filter((e): e is NonNullable<typeof e> => Boolean(e && e.supporting_content))
        .slice(0, limit)
        .map((e) => ({
          text: e.supporting_content,
          source: sourceById.get(e.source_id)?.title ?? "",
          n: numberOf.get(e.source_id) ?? 0,
        }));

    // Order matters: confirmed first, because citation numbers are assigned as
    // they are used and the confirmed material is what the answer rests on.
    const confirmed = mission.claims.filter((c) => c.status === "VERIFIED");
    const disputed = mission.claims.filter((c) => c.status === "CONFLICTED");
    const single = mission.claims.filter((c) => c.status === "UNVERIFIED");
    const withCites = [...confirmed, ...disputed, ...single].map((c) => ({
      claim: c, cites: citationsFor(c), quotes: quotesFor(c),
    }));
    const byId = new Map(withCites.map((r) => [r.claim.id, r]));

    // Any page read but never cited still belongs in the record.
    const uncited = mission.sources
      .filter((s) => !numberOf.has(s.id))
      .map((s) => ({ title: s.title || s.url, url: s.url }));

    return {
      confirmed: confirmed.map((c) => byId.get(c.id)!),
      disputed: disputed.map((c) => byId.get(c.id)!),
      single: single.map((c) => byId.get(c.id)!),
      references: ordered,
      uncited,
    };
  }, [mission]);

  if (!mission || !paper) {
    return <main className="paper"><p className="paper-loading">Assembling the record…</p></main>;
  }

  const rec = mission.recommendation;
  /* Sections are numbered as they are rendered. Hardcoding them meant an empty
     section left a hole in the sequence — this paper jumped from 4 to 6 the first
     time a mission had nothing single-source, which is exactly the detail that
     makes a document look unchecked. */
  let sectionNo = 0;
  const n = () => ++sectionNo;
  const nested = all.filter((m) => m.raised_by === mission.id);
  const raisedFrom = mission.raised_by ? all.find((m) => m.id === mission.raised_by) : undefined;
  const domains = [...new Set(mission.tasks.map((t) => t.domain))];
  const specialists = [...new Set(mission.tasks.map((t) => t.specialist))];
  const when = new Date(mission.created_at);

  return (
    <main className="paper">
      <nav className="paper-nav">
        <Link href={`/missions/${mission.id}`}>← back to the console</Link>
        <button onClick={() => window.print()}>print / save as PDF</button>
      </nav>

      <header className="paper-head">
        <p className="paper-kind">Signal Intelligence — evidence record</p>
        <h1>{mission.objective}</h1>
        <p className="paper-by">
          Genesis OS · Convergence Studios · {when.toLocaleDateString(undefined,
            { year: "numeric", month: "long", day: "numeric" })}
          <span className="paper-id">{mission.id}</span>
        </p>
        {raisedFrom && (
          <p className="paper-raised">
            This question was raised by the system while answering{" "}
            <Link href={`/missions/${raisedFrom.id}/paper`}>{raisedFrom.objective}</Link>.
          </p>
        )}
      </header>

      {rec && (
        <section className="paper-abstract">
          <h2>Abstract</h2>
          <p>{rec.action}</p>
          <p>{rec.rationale}</p>
          <p className="paper-confidence">
            Confidence {Math.round(rec.confidence * 100)}% — the share of this recommendation resting
            on claims confirmed by more than one independent source.
            {rec.decision && <> Studio Head decision: <b>{rec.decision.toUpperCase()}</b>.</>}
          </p>
        </section>
      )}

      <section>
        <h2>{n()} · Method</h2>
        <p>
          The question was decomposed into {mission.tasks.length} line
          {mission.tasks.length === 1 ? "" : "s"} of enquiry across {domains.length} cognitive
          domain{domains.length === 1 ? "" : "s"} ({domains.join(", ")}), each assigned to a named
          specialist: {specialists.join(", ")}. Retrieval ran against the open web through the
          Parallel Search API; extraction, verification grouping and synthesis were performed by
          Gemini. {mission.sources.length} sources were read and {mission.evidence.length} passages
          extracted, from which {mission.claims.length} distinct claims were assembled.
        </p>
        <p>
          A claim is <b>confirmed</b> only where two or more independent sources assert it.
          Where sources contradict each other the claim is recorded as <b>disputed</b> and both
          readings are preserved rather than reconciled. A claim asserted by a single source
          remains <b>unconfirmed</b> and is reported as such. No claim in this record was inferred
          in the absence of a source.
        </p>
      </section>

      {mission.findings.length > 0 && (
        <section>
          <h2>{n()} · Findings</h2>
          <ol className="paper-findings">
            {mission.findings.map((f) => (
              <li key={f.id}>
                {f.text}
                <span className="paper-tag">{f.domain} · {IMPACT[f.strategic_impact] ?? f.strategic_impact}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2>{n()} · Confirmed claims <span className="paper-count">{paper.confirmed.length}</span></h2>
        {paper.confirmed.length === 0 && (
          <p className="paper-none">
            Nothing in this enquiry reached confirmation by more than one independent source.
          </p>
        )}
        {paper.confirmed.map(({ claim, cites, quotes }) => (
          <article className="paper-claim" key={claim.id}>
            <p className="pc-text">
              {claim.text}
              <sup className="pc-cite">
                {cites.map((n, i) => <span key={n}>{i > 0 && ", "}{n}</span>)}
              </sup>
            </p>
            <p className="pc-meta">
              {claim.entity && <span className="pc-entity">{claim.entity} ·</span>}{" "}
              {claim.corroborating_sources} independent source
              {claim.corroborating_sources === 1 ? "" : "s"}
            </p>
            {quotes.map((q, i) => (
              <blockquote key={i}>
                {q.text}
                <cite>— {q.source}<sup>{q.n}</sup></cite>
              </blockquote>
            ))}
          </article>
        ))}
      </section>

      {paper.disputed.length > 0 && (
        <section>
          <h2>{n()} · Disputed claims <span className="paper-count">{paper.disputed.length}</span></h2>
          <p className="paper-lead">
            Sources disagree on the following. Both readings are kept: the disagreement is
            usually the most decision-relevant thing in the record, and resolving it is a
            judgement for the Studio Head rather than for the system.
          </p>
          {paper.disputed.map(({ claim, cites, quotes }) => (
            <article className="paper-claim disputed" key={claim.id}>
              <p className="pc-text">
                {claim.text}
                <sup className="pc-cite">
                  {cites.map((n, i) => <span key={n}>{i > 0 && ", "}{n}</span>)}
                </sup>
              </p>
              {claim.conflict_detail && <p className="pc-conflict">{claim.conflict_detail}</p>}
              {quotes.map((q, i) => (
                <blockquote key={i}>
                  {q.text}
                  <cite>— {q.source}<sup>{q.n}</sup></cite>
                </blockquote>
              ))}
            </article>
          ))}
        </section>
      )}

      {paper.single.length > 0 && (
        <section>
          <h2>{n()} · Unconfirmed, single-source <span className="paper-count">{paper.single.length}</span></h2>
          <p className="paper-lead">
            One page asserted each of these and nothing else has agreed or disagreed. They are
            leads, not findings, and nothing above rests on them.
          </p>
          <ul className="paper-single">
            {paper.single.map(({ claim, cites }) => (
              <li key={claim.id}>
                {claim.text}
                <sup className="pc-cite">
                  {cites.map((n, i) => <span key={n}>{i > 0 && ", "}{n}</span>)}
                </sup>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nested.length > 0 && (
        <section>
          <h2>{n()} · Questions this raised</h2>
          <p className="paper-lead">
            Audited against the context graph, this answer left the following open. Each was
            researched as a question of its own and has a record of its own.
          </p>
          <ul className="paper-nested">
            {nested.map((n) => (
              <li key={n.id}>
                <Link href={`/missions/${n.id}/paper`}>{n.objective}</Link>
                <span className="paper-tag">{n.sources} sources · {n.verified} confirmed</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="paper-refs">
        <h2>References</h2>
        <ol>
          {paper.references.map((r) => (
            <li key={r.n} id={`ref-${r.n}`}>
              {r.title}. <a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a>
            </li>
          ))}
        </ol>
        {paper.uncited.length > 0 && (
          <>
            <h3>Read but not cited <span className="paper-count">{paper.uncited.length}</span></h3>
            <p className="paper-lead">
              These pages were retrieved and read. Nothing in this record rests on them, and they
              are listed because a record of what was read is part of what makes the rest checkable.
            </p>
            <ol className="paper-uncited">
              {paper.uncited.map((r) => (
                <li key={r.url}>
                  {r.title}. <a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <footer className="paper-foot">
        <p>
          Assembled by Genesis OS — Signal Intelligence. Every claim above resolves through its own
          extracted passage to the page that produced it; the machine record behind this document,
          including the exact prompt and response of every model call, is retained with the mission
          and viewable in the console.
        </p>
      </footer>
    </main>
  );
}
