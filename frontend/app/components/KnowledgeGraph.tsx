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
  id: string; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; disputed: boolean; claims: number;
  bx?: number; by?: number; bz?: number; phase?: number;   // settled position + drift
  sx?: number; sy?: number; sr?: number; depth?: number;   // last projection
}

const W = 720;
const H = 340;
const TICKS = 260;
const DEPTH = 300;          // how far back the far wall sits
const FOCAL = 620;          // perspective strength: larger is flatter

/* One point, rotated then projected. Yaw turns the model, pitch tips it, and the
   perspective divide is what makes depth legible at all — without it a rotating
   graph is just a graph that wobbles. `k` is the scale at that depth, so a node's
   radius, its edges and its hit target all shrink together and stay consistent. */
function project(n: Node, yaw: number, pitch: number) {
  const dx = n.x - W / 2, dy = n.y - H / 2, dz = n.z;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = dy * cp - z1 * sp;
  const z2 = dy * sp + z1 * cp;
  const k = FOCAL / (FOCAL + z2);
  return { sx: W / 2 + x1 * k, sy: H / 2 + y1 * k, k, z: z2 };
}

function build(entities: Record<string, KnowledgeEntity>) {
  const names = Object.keys(entities);
  const nodes: Node[] = names.map((name, i) => {
    const assertions = entities[name].assertions ?? [];
    // Seeded on a sphere rather than a ring — a Fibonacci lattice, so the
    // starting shell is even and the simulation is not fighting a seam.
    const golden = Math.PI * (3 - Math.sqrt(5));
    const t = names.length > 1 ? i / (names.length - 1) : 0.5;
    const yUnit = 1 - t * 2;
    const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const theta = golden * i;
    return {
      id: name,
      x: W / 2 + Math.cos(theta) * ring * 120,
      y: H / 2 + yUnit * 90,
      z: Math.sin(theta) * ring * DEPTH * 0.5,
      vx: 0, vy: 0, vz: 0,
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
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d2 = Math.max(64, dx * dx + dy * dy + dz * dz);
        const f = 2600 / d2, d = Math.sqrt(d2);
        a.vx -= (dx / d) * f; a.vy -= (dy / d) * f; a.vz -= (dz / d) * f;
        b.vx += (dx / d) * f; b.vy += (dy / d) * f; b.vz += (dz / d) * f;
      }
    }
    for (const [i, j] of edges) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.max(1, Math.hypot(dx, dy, dz));
      const pull = (d - 110) * 0.012;
      a.vx += (dx / d) * pull; a.vy += (dy / d) * pull; a.vz += (dz / d) * pull;
      b.vx -= (dx / d) * pull; b.vy -= (dy / d) * pull; b.vz -= (dz / d) * pull;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.004;
      n.vy += (H / 2 - n.y) * 0.004;
      n.vz += (0 - n.z) * 0.004;
      n.vx *= 0.86; n.vy *= 0.86; n.vz *= 0.86;
      // Room to rotate: the box is bounded in x and y so nothing leaves frame,
      // and in z so the far wall cannot swallow a node entirely.
      n.x = Math.max(n.r + 44, Math.min(W - n.r - 44, n.x + n.vx));
      n.y = Math.max(n.r + 14, Math.min(H - n.r - 14, n.y + n.vy));
      n.z = Math.max(-DEPTH, Math.min(DEPTH, n.z + n.vz));
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
  // Rotation lives in refs for the same reason hover does: as state it would
  // re-run the effect and re-settle 260 ticks of O(n²) repulsion on every
  // mouse move of a drag.
  const yawRef = useRef(0.5);
  const pitchRef = useRef(-0.22);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
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
      // Project every node once per frame, then paint far to near. Without the
      // depth sort a near node can be drawn under a far one and the whole thing
      // reads as flat noise rather than as a body with an inside.
      const yaw = yawRef.current, pitch = pitchRef.current;
      for (const n of nodes) {
        const p = project(n, yaw, pitch);
        n.sx = p.sx; n.sy = p.sy; n.sr = Math.max(1.5, n.r * p.k); n.depth = p.z;
      }
      const order = [...nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));
      // Distance fade, kept subtle: depth should be felt, not performed.
      const fade = (n: Node) => 0.45 + 0.55 * (1 - Math.min(1, ((n.depth ?? 0) + DEPTH) / (DEPTH * 2)));
      // 390 edges across 106 nodes drawn at full strength is a grey mat that
      // buries the nodes. They are context, so they sit back until you point.
      for (const [i, j] of edges) {
        const lit = focus !== null && (nodes[i].id === focus || nodes[j].id === focus);
        ctx.strokeStyle = lit ? accent : line;
        ctx.lineWidth = lit ? 1.6 : 1;
        const dim = Math.min(fade(nodes[i]), fade(nodes[j]));
        ctx.globalAlpha = (focus === null ? 0.38 : lit ? 0.9 : 0.14) * dim;
        ctx.beginPath();
        ctx.moveTo(nodes[i].sx!, nodes[i].sy!);
        ctx.lineTo(nodes[j].sx!, nodes[j].sy!);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const n of order) {
        const on = n.id === sel || n.id === focus;
        const related = focus !== null && (n.id === focus || near.has(n.id));
        // Most entities are known from a single fact. They stay on the board —
        // hiding them would misrepresent how much is thinly sourced — but they
        // sit back so the ones the studio actually knows well read first.
        const thin = n.claims <= 1 ? 0.5 : 1;
        ctx.globalAlpha = (focus === null ? thin : related ? 1 : 0.22) * fade(n);
        const colour = n.disputed ? warn : accent;
        ctx.beginPath();
        ctx.arc(n.sx!, n.sy!, n.sr!, 0, Math.PI * 2);
        ctx.fillStyle = colour; ctx.globalAlpha = on ? 0.5 : 0.26; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = colour; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke();
        if (on) {                                   // selection ring
          ctx.beginPath();
          ctx.arc(n.sx!, n.sy!, n.sr! + 6, 0, Math.PI * 2);
          ctx.strokeStyle = colour; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (labelled.has(n.id) || related) {
          ctx.fillStyle = on ? css.getPropertyValue("--ink").trim() || "#fff" : ink;
          ctx.font = `${on ? "600 " : ""}13px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.id.length > 22 ? `${n.id.slice(0, 21)}…` : n.id,
                       n.sx!, n.sy! + n.sr! + 14);
        }
      }
      ctx.globalAlpha = 1;
    };

    // Settle the layout once, then keep it gently in motion. Re-running the
    // O(n²) repulsion every frame would be 11k pair calculations at this size;
    // drifting each node around its settled position costs nothing and means
    // the graph is never frozen. The drift is ambient — it claims nothing.
    settle(nodes, edges, TICKS);
    for (const n of nodes) {
      n.bx = n.x; n.by = n.y; n.bz = n.z; n.phase = Math.random() * Math.PI * 2;
    }
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
        n.z = n.bz! + Math.sin(t * 0.27 + n.phase!) * 6;
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
    // Against the projected position: the model coordinates are behind a
    // rotation now, so hit-testing them would pick the wrong node the moment
    // the graph is turned.
    for (const n of nodesRef.current) {
      if (n.sx === undefined || n.sy === undefined) continue;
      const d = Math.hypot(n.sx - x, n.sy - y);
      if (d <= (n.sr ?? n.r) + 10 && d < best) { best = d; hit = n.id; }
    }
    return hit;
  };

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // A drag that ends on a node must not also select it — turning the graph is
    // not the same gesture as opening something.
    if (draggedRef.current) { draggedRef.current = false; return; }
    const hit = nodeAt(event.clientX, event.clientY);
    setSelected(hit === selected ? null : hit);
  };

  const track = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) draggedRef.current = true;
      yawRef.current += dx * 0.008;
      // Pitch is clamped short of the poles: past vertical the graph turns
      // inside out and reads as a glitch rather than as rotation.
      pitchRef.current = Math.max(-1.1, Math.min(1.1, pitchRef.current + dy * 0.006));
      dragRef.current = { x: event.clientX, y: event.clientY };
      drawRef.current?.();                 // reduced motion has no loop to repaint
      return;
    }
    const hit = nodeAt(event.clientX, event.clientY);
    hoveredRef.current = hit;              // the draw loop reads this next frame
    setHoverName(hit);                     // only to drive the cursor
  };

  const startDrag = (event: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    draggedRef.current = false;
    setDragging(true);
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

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
              onMouseDown={startDrag}
              onMouseUp={endDrag}
              onMouseLeave={() => {
                endDrag();
                hoveredRef.current = null; setHoverName(null);
              }}
              style={{
                width: "100%", maxWidth: W, height: "auto", aspectRatio: `${W} / ${H}`,
                cursor: dragging ? "grabbing" : hoverName ? "pointer" : "grab",
                touchAction: "none",
              }}
              role="img"
              aria-label={`${names.length} entities in a rotatable three-dimensional graph. `
                + `Drag to turn it. Use the list below to inspect each one, which does not `
                + `require the graph.`}
            />
          </Reticle>
          <p className="graph-legend">
            Bigger means more has been asserted, and nearer is drawn larger — <b>drag to turn
            the graph</b>. Amber means something about them is disputed. A line means one question
            learned about both. Only the busiest are named — hover to light up any other and
            everything it connects to, or click to read it.
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
                {/* One claim is one thing the studio knows, and the store now
                    enforces that on write. The index still rides in the key: a
                    duplicate in the data is a bug to fix in the store, not a
                    reason for this panel to drop or duplicate rows while it is
                    being fixed. */}
                {entity.assertions.map((a, i) => (
                  <li key={`${a.claim_id}-${i}`} className={a.disputed ? "disputed" : ""}>
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
