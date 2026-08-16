"use client";
/* What the studio knows, as a graph you can interrogate.

   Nodes are entities the store has actually promoted — unverified claims never
   reach it — sized by how much has been asserted about them and marked amber
   when any of it is disputed. An edge means one question learned about both,
   which is the only relation this data supports and therefore the only one
   drawn.

   Clicking a node opens what the studio believes about that entity, in the
   words a reader would use. Every node is also a real button in a list beneath
   the canvas, because a canvas is invisible to a keyboard and a screen reader. */

import { useEffect, useMemo, useRef, useState } from "react";
import { KnowledgeEntity, getKnowledgeEntities } from "@/lib/api";
import { useReducedMotion } from "@/lib/alive";
import { Reticle } from "./Hud";

interface Node {
  id: string; x: number; y: number; vx: number; vy: number;
  r: number; disputed: boolean; claims: number;
  bx?: number; by?: number; phase?: number;   // settled position + drift offset
}

const W = 720;
const H = 340;
const TICKS = 260;

function build(entities: Record<string, KnowledgeEntity>) {
  const names = Object.keys(entities);
  const nodes: Node[] = names.map((name, i) => {
    const assertions = entities[name].assertions ?? [];
    const angle = (i / Math.max(1, names.length)) * Math.PI * 2;
    return {
      id: name,
      x: W / 2 + Math.cos(angle) * 120,
      y: H / 2 + Math.sin(angle) * 90,
      vx: 0, vy: 0,
      claims: assertions.length,
      r: Math.min(18, 7 + assertions.length * 1.6),
      disputed: assertions.some((a) => a.disputed),
    };
  });

  const missionsOf = new Map<string, Set<string>>();
  for (const name of names) {
    missionsOf.set(name, new Set((entities[name].assertions ?? []).map((a) => a.mission_id)));
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if ([...missionsOf.get(names[i])!].some((m) => missionsOf.get(names[j])!.has(m))) {
        edges.push([i, j]);
      }
    }
  }
  return { nodes, edges };
}

function settle(nodes: Node[], edges: [number, number][], steps: number) {
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = Math.max(64, dx * dx + dy * dy);
        const f = 2600 / d2, d = Math.sqrt(d2);
        a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
        b.vx += (dx / d) * f; b.vy += (dy / d) * f;
      }
    }
    for (const [i, j] of edges) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - 110) * 0.012;
      a.vx += (dx / d) * pull; a.vy += (dy / d) * pull;
      b.vx -= (dx / d) * pull; b.vy -= (dy / d) * pull;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.004;
      n.vy += (H / 2 - n.y) * 0.004;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x = Math.max(n.r + 44, Math.min(W - n.r - 44, n.x + n.vx));
      n.y = Math.max(n.r + 14, Math.min(H - n.r - 14, n.y + n.vy));
    }
  }
}

const STATE_WORD: Record<string, string> = {
  VERIFIED: "Confirmed", CONFLICTED: "Sources disagree", UNVERIFIED: "Single source",
};

export function KnowledgeGraph({ running = false }: { running?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const [entities, setEntities] = useState<Record<string, KnowledgeEntity>>({});
  const [selected, setSelected] = useState<string | null>(null);
  // Hover lives in a ref: putting it in the dependency list would re-run the
  // effect and re-settle the whole layout on every mouse move.
  const hoveredRef = useRef<string | null>(null);
  const [hoverName, setHoverName] = useState<string | null>(null);
  // Selection is a ref for the same reason as hover: as a dependency it re-ran
  // the effect and re-settled the entire layout on every click — 260 ticks of
  // O(n²) repulsion to arrive at the identical picture.
  const selectedRef = useRef<string | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    getKnowledgeEntities().then(setEntities).catch(() => setEntities({}));
  }, []);

  const names = useMemo(() => Object.keys(entities), [entities]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || names.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { nodes, edges } = build(entities);
    nodesRef.current = nodes;
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue("--accent").trim() || "#3987e5";
    const warn = css.getPropertyValue("--warn").trim() || "#fab219";
    const line = css.getPropertyValue("--line").trim() || "#232936";
    const ink = css.getPropertyValue("--ink-2").trim() || "#c0c6d4";
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The canvas is drawn in a 720-wide space and displayed around 430 wide, so
    // every label at once is a 6px mat of overlapping text at 106 entities.
    // Name the ones carrying the most, and let hover name the rest.
    const labelled = new Set(
      [...nodes].sort((a, b) => b.claims - a.claims).slice(0, 12).map((n) => n.id),
    );

    const draw = () => {
      // Recomputed each frame so hover responds without restarting the layout.
      const sel = selectedRef.current;
      const focus = hoveredRef.current ?? sel;
      const near = new Set<string>();
      if (focus) {
        for (const [i, j] of edges) {
          if (nodes[i].id === focus) near.add(nodes[j].id);
          if (nodes[j].id === focus) near.add(nodes[i].id);
        }
      }
      ctx.clearRect(0, 0, W, H);
      // 390 edges across 106 nodes drawn at full strength is a grey mat that
      // buries the nodes. They are context, so they sit back until you point.
      for (const [i, j] of edges) {
        const lit = focus !== null && (nodes[i].id === focus || nodes[j].id === focus);
        ctx.strokeStyle = lit ? accent : line;
        ctx.lineWidth = lit ? 1.6 : 1;
        ctx.globalAlpha = focus === null ? 0.38 : lit ? 0.9 : 0.14;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const n of nodes) {
        const on = n.id === sel || n.id === focus;
        const related = focus !== null && (n.id === focus || near.has(n.id));
        // Most entities are known from a single fact. They stay on the board —
        // hiding them would misrepresent how much is thinly sourced — but they
        // sit back so the ones the studio actually knows well read first.
        const thin = n.claims <= 1 ? 0.5 : 1;
        ctx.globalAlpha = focus === null ? thin : related ? 1 : 0.22;
        const colour = n.disputed ? warn : accent;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = colour; ctx.globalAlpha = on ? 0.5 : 0.26; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = colour; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke();
        if (on) {                                   // selection ring
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = colour; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (labelled.has(n.id) || related) {
          ctx.fillStyle = on ? css.getPropertyValue("--ink").trim() || "#fff" : ink;
          ctx.font = `${on ? "600 " : ""}13px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.id.length > 22 ? `${n.id.slice(0, 21)}…` : n.id, n.x, n.y + n.r + 14);
        }
      }
      ctx.globalAlpha = 1;
    };

    // Settle the layout once, then keep it gently in motion. Re-running the
    // O(n²) repulsion every frame would be 11k pair calculations at this size;
    // drifting each node around its settled position costs nothing and means
    // the graph is never frozen. The drift is ambient — it claims nothing.
    settle(nodes, edges, TICKS);
    for (const n of nodes) { n.bx = n.x; n.by = n.y; n.phase = Math.random() * Math.PI * 2; }
    drawRef.current = draw;
    draw();
    // Reduced motion draws the settled layout once and stops. The redraw effect
    // below is what keeps hover and selection working without this loop.
    if (reduced) return;

    let raf = 0;
    const start = performance.now();
    const drift = (now: number) => {
      const t = (now - start) / 1000;
      for (const n of nodes) {
        n.x = n.bx! + Math.sin(t * 0.42 + n.phase!) * 4.5;
        n.y = n.by! + Math.cos(t * 0.33 + n.phase!) * 3.5;
      }
      draw();
      raf = requestAnimationFrame(drift);
    };
    raf = requestAnimationFrame(drift);
    return () => cancelAnimationFrame(raf);
  }, [entities, names.length, reduced]);

  // Selection and hover feed the canvas through refs, so React re-rendering is
  // not enough to repaint it. With motion reduced there is no animation loop to
  // pick the change up on the next frame, which left hover and selection doing
  // nothing at all for those users; this repaints on demand.
  useEffect(() => {
    selectedRef.current = selected;
    drawRef.current?.();
  }, [selected, hoverName]);

  // Map a click in CSS pixels onto the canvas's logical coordinate space, since
  // the canvas is laid out responsively rather than at its intrinsic size.
  const nodeAt = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * W;
    const y = ((clientY - box.top) / box.height) * H;
    let hit: string | null = null;
    let best = Infinity;
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= n.r + 10 && d < best) { best = d; hit = n.id; }
    }
    return hit;
  };

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = nodeAt(event.clientX, event.clientY);
    setSelected(hit === selected ? null : hit);
  };

  const track = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = nodeAt(event.clientX, event.clientY);
    hoveredRef.current = hit;              // the draw loop reads this next frame
    setHoverName(hit);                     // only to drive the cursor
  };

  if (names.length === 0) return null;
  const entity = selected ? entities[selected] : null;
  const disputedCount = names.filter((n) => (entities[n].assertions ?? []).some((a) => a.disputed)).length;
  // How many are known from more than one fact. Most are not, and a Studio Head
  // should be told that rather than left to infer it from a dense picture.
  const wellKnown = names.filter((n) => (entities[n].assertions ?? []).length > 1).length;

  return (
    <section className="panel graph-panel">
      <h2>
        What the studio has learned
        <span className="muted">
          {" · "}{names.length} companies and people it now tracks
          {`, ${wellKnown} known from more than one fact`}
          {disputedCount > 0 ? `, ${disputedCount} with something disputed` : ""}
        </span>
      </h2>

      <div className="graph-layout">
        <div className="graph-wrap">
          <Reticle running={running}>
            <canvas
              ref={canvasRef}
              onClick={pick}
              onMouseMove={track}
              onMouseLeave={() => { hoveredRef.current = null; setHoverName(null); }}
              style={{
                width: "100%", maxWidth: W, height: "auto", aspectRatio: `${W} / ${H}`,
                cursor: hoverName ? "pointer" : "default",
              }}
              role="img"
              aria-label={`${names.length} entities. Use the list below to inspect each one.`}
            />
          </Reticle>
          <p className="graph-legend">
            Bigger means more has been asserted. Amber means something about them is disputed.
            A line means one question learned about both. Only the busiest are named — hover to
            light up any other and everything it connects to, or click to read it.
          </p>
        </div>

        <aside className="graph-detail">
          {entity ? (
            <>
              <div className="gd-head">
                <span className="gd-name">{selected}</span>
                <span className="gd-type">{entity.type}</span>
              </div>
              <p className="gd-meta">
                {entity.assertions.length} thing{entity.assertions.length === 1 ? "" : "s"} known ·
                first seen {new Date(entity.first_seen).toLocaleDateString()}
              </p>
              <ul className="gd-claims">
                {entity.assertions.map((a) => (
                  <li key={a.claim_id} className={a.disputed ? "disputed" : ""}>
                    <span className={`gd-state ${a.status}`}>{STATE_WORD[a.status] ?? a.status}</span>
                    <span className="gd-claim">{a.claim}</span>
                    <span className="gd-src">
                      {a.corroborating_sources === 1
                        ? "1 source"
                        : `${a.corroborating_sources} independent sources`}
                      {a.disputed && a.conflict_detail ? ` · ${a.conflict_detail}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="gd-hint">
              Click a node to see everything the studio believes about it, and how well
              each part is supported.
            </p>
          )}
        </aside>
      </div>

      <div className="graph-nodes">
        {names.map((name) => {
          const disputed = (entities[name].assertions ?? []).some((a) => a.disputed);
          return (
            <button
              key={name}
              className={`gnode${disputed ? " disputed" : ""}${selected === name ? " on" : ""}`}
              onClick={() => setSelected(selected === name ? null : name)}
              aria-pressed={selected === name}
            >
              {name}
              <span className="n">{entities[name].assertions.length}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
