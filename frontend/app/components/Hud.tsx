"use client";
/* Instruments for the board.

   The visual language is a heads-up display: notched panels, tick rings, thin
   bright strokes on near-black. The discipline underneath it is that every
   instrument is bound to a number the system actually produced. A HUD is
   persuasive precisely because it looks instrumented, which makes a dial that
   reads nothing the most dishonest object we could put on screen — so:

     · a ring with no denominator draws its track and reads "—", never a fill
     · the sweep turns only while a question is genuinely being worked
     · the feed prints only events the backend emitted, newest first

   Nothing here interpolates, smooths, or invents a value to keep the board
   looking busy. A quiet studio should render as a quiet board. */

import { useEffect, useMemo, useRef, useState } from "react";
import { EventRecord } from "@/lib/api";
import { Rolling, useReducedMotion } from "@/lib/alive";

/* ── panel ───────────────────────────────────────────────────────────────── */

export function Panel({ title, meta, className = "", foldId, defaultOpen = true, children }: {
  title?: string;
  meta?: React.ReactNode;
  className?: string;
  /** Pass a stable key to make the panel foldable and remember the choice. */
  foldId?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Read the stored preference after mount rather than during render: reading
  // localStorage while rendering makes the server and client disagree about the
  // first paint, and React refuses to patch that tree.
  useEffect(() => {
    if (!foldId) return;
    try {
      const stored = localStorage.getItem(`genesis.panel.${foldId}`);
      if (stored !== null) setOpen(stored === "1");
    } catch { /* private mode — the default stands */ }
  }, [foldId]);

  const toggle = () => {
    setOpen((was) => {
      const next = !was;
      try { localStorage.setItem(`genesis.panel.${foldId}`, next ? "1" : "0"); }
      catch { /* preference simply is not remembered */ }
      return next;
    });
  };

  const foldable = Boolean(foldId);
  const shown = !foldable || open;

  return (
    <section className={`hud-panel${foldable && !open ? " folded" : ""} ${className}`}>
      {title && (
        <header className="hp-head">
          {foldable ? (
            <button type="button" className="hp-toggle" onClick={toggle}
                    aria-expanded={open} aria-controls={`panel-${foldId}`}>
              <span className="hp-caret" aria-hidden="true">▸</span>
              <h2>{title}</h2>
            </button>
          ) : (
            <h2>{title}</h2>
          )}
          {/* The summary stays visible when folded, so collapsing changes how
              much room a panel takes and never whether you know what is in it. */}
          {meta && <span className="hp-meta">{meta}</span>}
        </header>
      )}
      {shown && <div className="hp-body" id={foldable ? `panel-${foldId}` : undefined}>{children}</div>}
    </section>
  );
}

/* ── ring gauge ──────────────────────────────────────────────────────────── */

const R = 42;
const C = 2 * Math.PI * R;
const TICKS = Array.from({ length: 48 }, (_, i) => i);

/* Tick coordinates are trigonometric, and Node and the browser disagree on the
   last bit of Math.cos — enough for React to call the server and client HTML
   different and refuse to patch it. Fixing the precision makes both sides emit
   the same string. Two decimals is far below a pixel at this scale. */
const fx = (n: number) => n.toFixed(2);

/** A proportion, drawn as an arc. `total` of zero is not zero percent — it is
 *  the absence of a measurement, and reads as one. */
export function Ring({ value, total, label, hint, tone = "" }: {
  value: number;
  total: number;
  label: string;
  hint: string;
  tone?: string;
}) {
  const has = total > 0;
  const ratio = has ? Math.max(0, Math.min(1, value / total)) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div className={`hud-ring ${tone}${has ? "" : " empty"}`}
         title={has ? hint : "nothing measured yet"}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <g className="hr-ticks">
          {TICKS.map((i) => {
            const a = (i / TICKS.length) * Math.PI * 2 - Math.PI / 2;
            const long = i % 4 === 0;
            const r1 = 54;
            const r2 = long ? 47 : 50;
            return (
              <line
                key={i}
                x1={fx(60 + Math.cos(a) * r1)} y1={fx(60 + Math.sin(a) * r1)}
                x2={fx(60 + Math.cos(a) * r2)} y2={fx(60 + Math.sin(a) * r2)}
                className={long ? "long" : ""}
              />
            );
          })}
        </g>
        <circle className="hr-track" cx="60" cy="60" r={R} />
        {has && (
          /* The arc transitions to its new length, so a poll that changes the
             number is visible as movement rather than a silent swap. */
          <circle
            className="hr-arc" cx="60" cy="60" r={R}
            strokeDasharray={C} strokeDashoffset={C * (1 - ratio)}
            transform="rotate(-90 60 60)"
          />
        )}
      </svg>
      <div className="hr-mid">
        {has ? (
          <b><Rolling value={pct} suffix="%" /></b>
        ) : (
          <b className="none" aria-label="not measured yet">—</b>
        )}
        <span className="hr-label">{label}</span>
      </div>
    </div>
  );
}

/** The rings are small, so what each one actually counts is spelled out here
 *  rather than crammed underneath it. This is where the denominator lives. */
export function RingLegend({ items }: { items: { tone: string; hint: string; has: boolean }[] }) {
  return (
    <ul className="ring-legend">
      {items.map((it) => (
        <li key={it.hint} className={it.tone}>
          <span className="rl-dot" aria-hidden="true" />
          <span>{it.has ? it.hint : "nothing measured yet"}</span>
        </li>
      ))}
    </ul>
  );
}

/** A bare count. Rolls to its new value so arrivals are visible. */
export function Readout({ n, label, tone = "" }: { n: number; label: string; tone?: string }) {
  return (
    <div className={`hud-readout ${tone}`}>
      <b><Rolling value={n} /></b>
      <span>{label}</span>
    </div>
  );
}

/* ── central instrument frame ────────────────────────────────────────────── */

/** Concentric rings and a reticle around whatever is at the centre of the
 *  board. The sweep hand turns only while `running` — an idle system shows a
 *  still instrument, because there is nothing being scanned. */
export function Reticle({ running, children }: { running: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className={`hud-reticle${running && !reduced ? " running" : ""}`}>
      {/* The rings stretch to the frame rather than holding a circle: the thing
          being framed is a wide graph, and a circle around it would waste the
          column. preserveAspectRatio="none" turns them into concentric ovals
          that fit whatever they wrap. */}
      <svg className="ret-rings" viewBox="0 0 400 400" aria-hidden="true" preserveAspectRatio="none">
        <circle className="rr-1" cx="200" cy="200" r="196" />
        <circle className="rr-2" cx="200" cy="200" r="182" />
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = 196;
          const r2 = long ? 184 : 190;
          return (
            <line
              key={i}
              x1={fx(200 + Math.cos(a) * r1)} y1={fx(200 + Math.sin(a) * r1)}
              x2={fx(200 + Math.cos(a) * r2)} y2={fx(200 + Math.sin(a) * r2)}
              className={long ? "long" : ""}
            />
          );
        })}
      </svg>
      {running && <div className="ret-sweep" aria-hidden="true" />}
      <div className="ret-inner">{children}</div>
      <span className="ret-corner tl" aria-hidden="true" />
      <span className="ret-corner tr" aria-hidden="true" />
      <span className="ret-corner bl" aria-hidden="true" />
      <span className="ret-corner br" aria-hidden="true" />
    </div>
  );
}

/* ── live feed ───────────────────────────────────────────────────────────── */

/* Said the way a person would say it. Anything not in this map prints its raw
   event name rather than a friendly guess — an unlabelled event is a gap in
   this table, and should look like one. */
const EVENT_LABEL: Record<string, string> = {
  "signal.plan": "worked out what to look into",
  "signal.research": "started reading",
  "signal.discovered": "found a source",
  "signal.verify": "cross-checked a claim",
  "signal.synthesize": "assembled the answer",
  "signal.complete": "finished a question",
  "signal.incomplete": "stopped — not enough to stand on",
  "signal.knowledge": "wrote to the world model",
  "claim.verified": "a claim held up",
  "claim.conflicted": "sources disagreed",
  "evidence.created": "pulled out a quote",
  "finding.created": "spotted a pattern",
  "recommendation.created": "made a recommendation",
  "knowledge.updated": "updated what it knows",
  "opportunity.detected": "flagged an opportunity",
  "threat.detected": "flagged a risk",
  "intelligence.completed": "closed the loop",
  "intelligence.incomplete": "closed the loop — incomplete",
  "authorization.decided": "recorded your decision",
};

const TONE: Record<string, string> = {
  "claim.conflicted": "warn",
  "signal.incomplete": "warn",
  "intelligence.incomplete": "warn",
  "threat.detected": "warn",
  "signal.complete": "ok",
  "claim.verified": "ok",
  "intelligence.completed": "ok",
};

function clock(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? "--:--:--"
    : d.toLocaleTimeString([], { hour12: false });
}

/** The event stream as it arrives. Rows that are new since the last poll land
 *  with a flash, so you can see the system working without reading it. */
export function Feed({ events }: { events: EventRecord[] }) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // The API returns events oldest-first. A feed reads newest-first, and taking
  // the head of the raw list would have shown the oldest fourteen — so new
  // arrivals would never have appeared on screen at all. Ties fall back to
  // original order, which is the order the backend emitted them in.
  const newestFirst = useMemo(() => {
    const keyed = events.map((e, i) => ({ e, i, k: `${e.at}|${e.event}|${i}` }));
    keyed.sort((a, b) => {
      const d = new Date(b.e.at).getTime() - new Date(a.e.at).getTime();
      return d !== 0 ? d : b.i - a.i;
    });
    return keyed;
  }, [events]);

  useEffect(() => {
    const keys = newestFirst.map((it) => it.k);
    // First load is not an arrival — flashing the whole backlog on mount would
    // claim a burst of activity that happened minutes ago.
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const added = keys.filter((k) => !seen.current!.has(k));
    for (const k of keys) seen.current.add(k);
    if (added.length === 0) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 1200);
    return () => clearTimeout(t);
  }, [newestFirst]);

  if (events.length === 0) {
    return <p className="feed-empty">Nothing has happened yet. Ask a question and this fills up.</p>;
  }

  return (
    <ul className="hud-feed" aria-live="polite" aria-label="Live activity">
      {newestFirst.slice(0, 14).map(({ e, k }) => (
        <li key={k} className={`${TONE[e.event] ?? ""}${fresh.has(k) ? " fresh" : ""}`}>
          <span className="fe-time">{clock(e.at)}</span>
          <span className="fe-what">{EVENT_LABEL[e.event] ?? e.event}</span>
        </li>
      ))}
    </ul>
  );
}
