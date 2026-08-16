"use client";
/* The world model, drawn — force-directed canvas, no dependencies.

   A list of entity names does not look like institutional knowledge; a graph
   that settles into clusters does. Nodes are entities the store has actually
   promoted (UNVERIFIED claims never make it here), sized by how much has been
   asserted about them and marked when any assertion is disputed. An edge means
   two entities were learned by the same mission — that is the only relation
   this data supports, so it is the only relation drawn. */

import { useEffect, useRef, useState } from "react";
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
    const record = entities[name];
    const assertions = record.assertions ?? [];
    // Deterministic ring start — same corpus draws the same graph every time.
    const angle = (i / Math.max(1, names.length)) * Math.PI * 2;
    return {
      id: name,
      x: W / 2 + Math.cos(angle) * 120,
      y: H / 2 + Math.sin(angle) * 90,
      vx: 0, vy: 0,
      claims: assertions.length,
      r: Math.min(16, 5 + assertions.length * 1.6),
      disputed: assertions.some((a) => a.disputed),
    };
  });

  // Two entities are linked when a mission asserted something about both.
  const missionsOf = new Map<string, Set<string>>();
  for (const name of names) {
    missionsOf.set(name, new Set((entities[name].assertions ?? []).map((a) => a.mission_id)));
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = missionsOf.get(names[i])!;
      const b = missionsOf.get(names[j])!;
      if ([...a].some((m) => b.has(m))) edges.push([i, j]);
    }
  }
  return { nodes, edges };
}

function settle(nodes: Node[], edges: [number, number][], steps: number) {
  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = Math.max(64, dx * dx + dy * dy);
        const force = 2600 / d2;                       // repulsion
        const d = Math.sqrt(d2);
        a.vx -= (dx / d) * force; a.vy -= (dy / d) * force;
        b.vx += (dx / d) * force; b.vy += (dy / d) * force;
      }
    }
    for (const [i, j] of edges) {                      // springs
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - 110) * 0.012;
      a.vx += (dx / d) * pull; a.vy += (dy / d) * pull;
      b.vx -= (dx / d) * pull; b.vy -= (dy / d) * pull;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.004;                   // gentle centering
      n.vy += (H / 2 - n.y) * 0.004;
      n.vx *= 0.86; n.vy *= 0.86;                      // damping
      n.x = Math.max(n.r + 40, Math.min(W - n.r - 40, n.x + n.vx));
      n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y + n.vy));
    }
  }
}

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [entities, setEntities] = useState<Record<string, KnowledgeEntity>>({});
  const reduced = useReducedMotion();

  useEffect(() => {
    getKnowledgeEntities().then(setEntities).catch(() => setEntities({}));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const names = Object.keys(entities);
    if (!canvas || names.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { nodes, edges } = build(entities);
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue("--accent").trim() || "#3987e5";
    const warn = css.getPropertyValue("--warn").trim() || "#fab219";
    const line = css.getPropertyValue("--line").trim() || "#232936";
    const ink = css.getPropertyValue("--ink-2").trim() || "#c0c6d4";
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (const [i, j] of edges) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.disputed ? warn : accent;
        ctx.globalAlpha = 0.28;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = n.disputed ? warn : accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(n.id.length > 22 ? `${n.id.slice(0, 21)}…` : n.id, n.x, n.y + n.r + 12);
      }
    };

    if (reduced) {                       // settle silently, draw the result once
      settle(nodes, edges, TICKS);
      draw();
      return;
    }
    let frame = 0;
    let raf = 0;
    const tick = () => {
      settle(nodes, edges, 2);
      draw();
      frame += 2;
      if (frame < TICKS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [entities, reduced]);

  const names = Object.keys(entities);
  if (names.length === 0) return null;
  const disputed = names.filter((n) => (entities[n].assertions ?? []).some((a) => a.disputed));

  return (
    <section className="panel">
      <h2>World model <span className="muted">· {names.length} entities carried across missions</span></h2>
      <div className="graph-wrap">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", maxWidth: W, height: "auto", aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`Knowledge graph: ${names.length} entities, ${disputed.length} carrying disputed assertions`}
        />
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Size follows how much has been asserted; amber marks an entity carrying a disputed
        assertion. An edge means one mission learned about both. Unverified claims are never
        promoted here — this is what the studio actually knows.
      </p>
    </section>
  );
}
