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

interface Node {
  id: string; x: number; y: number; vx: number; vy: number;
  r: number; disputed: boolean; claims: number;
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

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const [entities, setEntities] = useState<Record<string, KnowledgeEntity>>({});
  const [selected, setSelected] = useState<string | null>(null);
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

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      for (const [i, j] of edges) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
      for (const n of nodes) {
        const on = n.id === selected;
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
        ctx.fillStyle = on ? css.getPropertyValue("--ink").trim() || "#fff" : ink;
        ctx.font = `${on ? "600 " : ""}11px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(n.id.length > 22 ? `${n.id.slice(0, 21)}…` : n.id, n.x, n.y + n.r + 13);
      }
    };

    if (reduced) { settle(nodes, edges, TICKS); draw(); return; }
    let frame = 0, raf = 0;
    const tick = () => {
      settle(nodes, edges, 2); draw(); frame += 2;
      if (frame < TICKS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [entities, names.length, reduced, selected]);

  // Map a click in CSS pixels onto the canvas's logical coordinate space, since
  // the canvas is laid out responsively rather than at its intrinsic size.
  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W;
    const y = ((event.clientY - box.top) / box.height) * H;
    let hit: string | null = null;
    let best = Infinity;
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= n.r + 10 && d < best) { best = d; hit = n.id; }
    }
    setSelected(hit === selected ? null : hit);
  };

  if (names.length === 0) return null;
  const entity = selected ? entities[selected] : null;
  const disputedCount = names.filter((n) => (entities[n].assertions ?? []).some((a) => a.disputed)).length;

  return (
    <section className="panel graph-panel">
      <h2>
        What the studio has learned
        <span className="muted">
          {" · "}{names.length} companies and people it now tracks
          {disputedCount > 0 ? `, ${disputedCount} with something disputed` : ""}
        </span>
      </h2>

      <div className="graph-layout">
        <div className="graph-wrap">
          <canvas
            ref={canvasRef}
            onClick={pick}
            style={{ width: "100%", maxWidth: W, height: "auto", aspectRatio: `${W} / ${H}`, cursor: "pointer" }}
            role="img"
            aria-label={`${names.length} entities. Use the list below to inspect each one.`}
          />
          <p className="graph-legend">
            Bigger means more has been asserted. Amber means something about them is disputed.
            A line means one question learned about both. Click any node — or use the list.
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
