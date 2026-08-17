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

const W = 1080;
const H = 560;
const TICKS = 260;
const DEPTH = 400;          // how far back the far wall sits
const FOCAL = 900;          // perspective strength: larger is flatter

/* The shape is a claim, so it says something true: a sun and a disc.

   Everything the studio holds a disagreement about is pulled into a mass at the
   centre; everything settled is held on a shell around it, evenly spaced, each
   node wired back to the same anchor. That is not decoration — the core is
   exactly the material a Studio Head cannot act on without deciding something,
   and the size of that mass inside the shell is how much of the world model is
   contested.

   Only the shell's radius is constrained. Where a node sits on it is left to the
   push between nodes, which is what makes the spacing even rather than assigned:
   a sphere covered by mutual repulsion arrives at an even covering on its own.

   The forces are live and adjustable, because the right spacing depends on how
   much is on screen: four hundred entities want different numbers from forty.
   The controls write into a ref the simulation reads each tick, so moving one
   re-shapes the running model rather than restarting it. */
const SUN_R = 74;              // how far the contested mass spreads from the anchor

export interface Forces {
  wire: number;      // length of the wire to the anchor — the shell's radius
  pull: number;      // how strongly a node is held at its wire length
  push: number;      // how hard nodes hold each other off
  spacing: number;   // the distance below which push applies at all
  glow: number;      // how strongly the anchor wires are drawn
  colour: string;    // and in what colour
  /* The other wire in the picture, and a different thing: an anchor wire says
     "this node is held here", a connection says "one question learned about both
     of these". They are coloured separately because they mean separately. */
  edgeColour: string;
}
export const DEFAULT_FORCES: Forces = {
  wire: 250, pull: 0.05, push: 1500, spacing: 90,
  glow: 0.16, colour: "#c0c6d4", edgeColour: "#3987e5",
};

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
  const remembered = loadLayout();
  const nodes: Node[] = names.map((name, i) => {
    const assertions = entities[name].assertions ?? [];
    const disputed = assertions.some((a) => a.disputed);
    // Seeded roughly where it belongs — disputed into the core, settled onto the
    // disc — so the first ticks refine a shape instead of building one. The angle
    // is a golden-ratio step, which spreads them without a seam for the model to
    // fight, and a little jitter keeps coincident nodes from stacking exactly.
    const theta = Math.PI * (3 - Math.sqrt(5)) * i;
    const jitter = (n: number) => (Math.sin(i * n) * 0.5 + 0.5);
    const radius = disputed
      ? SUN_R * (0.3 + jitter(12.9898) * 0.7)
      : DEFAULT_FORCES.wire * (0.85 + jitter(78.233) * 0.3);
    const lift = disputed ? (jitter(43.758) - 0.5) * SUN_R : (jitter(93.989) - 0.5) * 24;
    // A remembered place wins over a seeded one, so the map stays the map.
    const was = remembered[name];
    return {
      id: name,
      x: was ? was[0] : W / 2 + Math.cos(theta) * radius,
      y: was ? was[1] : H / 2 + lift,
      z: was ? was[2] : Math.sin(theta) * radius,
      vx: 0, vy: 0, vz: 0,
      claims: assertions.length,
      r: Math.min(24, 9 + assertions.length * 2),
      disputed,
    };
  });

  const missionsOf = new Map<string, Set<string>>();
  for (const name of names) {
    missionsOf.set(name, new Set((entities[name].assertions ?? []).map((a) => a.mission_id)));
  }
  /* An edge now carries its weight: how many questions learned about both ends.
     Eight and a half thousand pairs share at least one, so a tour that walked
     them in index order would spend its first ten minutes on the accidental ones.
     Ranked by shared questions, then by how much is known about both ends, the
     strong connections come first. */
  const edges: { a: number; b: number; shared: number }[] = [];
  for (let i = 0; i < names.length; i++) {
    const mine = missionsOf.get(names[i])!;
    for (let j = i + 1; j < names.length; j++) {
      let shared = 0;
      for (const m of mine) if (missionsOf.get(names[j])!.has(m)) shared++;
      if (shared > 0) edges.push({ a: i, b: j, shared });
    }
  }
  const degree = new Array(names.length).fill(0);
  for (const e of edges) { degree[e.a]++; degree[e.b]++; }
  const tour = [...edges.keys()].sort((x, y) => {
    const e = edges[x], f = edges[y];
    if (f.shared !== e.shared) return f.shared - e.shared;
    return (nodes[f.a].claims + nodes[f.b].claims) - (nodes[e.a].claims + nodes[e.b].claims);
  });
  return { nodes, edges, tour, degree };
}

/* One tick of the model, run every frame rather than once up front, so moving a
   slider re-shapes what you are looking at instead of restarting it. */
function step(nodes: Node[], f: Forces): number {
  const cutoff = f.spacing * f.spacing;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      // Only near pairs push. At four hundred nodes the far ones contribute
      // almost nothing and would cost the whole frame budget.
      if (d2 > cutoff || d2 === 0) continue;
      const d = Math.sqrt(Math.max(16, d2));
      const force = f.push / Math.max(64, d2);
      a.vx -= (dx / d) * force; a.vy -= (dy / d) * force; a.vz -= (dz / d) * force;
      b.vx += (dx / d) * force; b.vy += (dy / d) * force; b.vz += (dz / d) * force;
    }
  }

  let moved = 0;
  for (const n of nodes) {
    const ox = n.x - W / 2, oy = n.y - H / 2, oz = n.z;
    if (n.disputed) {
      // The sun: held near the anchor in every direction, so the push between
      // them is what gives the mass its volume.
      const dist = Math.max(1, Math.hypot(ox, oy, oz));
      const gap = (SUN_R - dist) * f.pull * 1.6;
      n.vx += (ox / dist) * gap; n.vy += (oy / dist) * gap; n.vz += (oz / dist) * gap;
    } else {
      // The shell: held at wire length in every direction, so the settled
      // material forms a sphere around the contested core rather than a plane
      // through it. Only the radius is constrained — where a node sits on the
      // shell is left to the push between them, which is what makes the spacing
      // even rather than assigned. (A sphere covered by mutual repulsion is the
      // Thomson arrangement; nothing here has to compute it, only allow it.)
      const dist = Math.max(1, Math.hypot(ox, oy, oz));
      const gap = (f.wire - dist) * f.pull;
      n.vx += (ox / dist) * gap;
      n.vy += (oy / dist) * gap;
      n.vz += (oz / dist) * gap;
    }
    n.vx *= 0.84; n.vy *= 0.84; n.vz *= 0.84;
    n.x += n.vx; n.y += n.vy; n.z += n.vz;
    // Bounded whatever the sliders say, so nothing leaves the frame.
    n.x = Math.max(n.r + 20, Math.min(W - n.r - 20, n.x));
    n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y));
    n.z = Math.max(-DEPTH, Math.min(DEPTH, n.z));
    moved += Math.abs(n.vx) + Math.abs(n.vy) + Math.abs(n.vz);
  }
  return moved / Math.max(1, nodes.length);
}

/* Where the model was left. A graph you have learned the shape of should be the
   same graph next time: without this every reload re-derived positions from the
   entity order, so one new company shifted everything and the map you had built
   in your head was gone. Positions are stored per entity name, so a node keeps
   its place across reloads and across new arrivals. */
/* Average per-node movement below which the model is considered arrived. */
const REST = 0.05;
/* Two seconds a connection, as asked: long enough to read both names. */
const TOUR_MS = 2000;
const LAYOUT_KEY = "genesis.graph.layout";
const FORCES_KEY = "genesis.graph.forces";

function saveLayout(nodes: Node[]) {
  try {
    const out: Record<string, [number, number, number]> = {};
    for (const n of nodes) out[n.id] = [Math.round(n.x), Math.round(n.y), Math.round(n.z)];
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
  } catch { /* private mode, or over quota — the model just re-derives next time */ }
}

function loadLayout(): Record<string, [number, number, number]> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
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
  const stepRef = useRef<((ticks: number) => void) | null>(null);
  const settledRef = useRef(false);
  /* The tour. One connection held for two seconds, then the next — a way to read
     eight thousand relationships one at a time instead of as a mat of line. It
     runs on its own timer rather than the animation loop, so it works with
     reduced motion and in a background tab, and it drives the same highlight
     that hovering does. */
  const tourRef = useRef<{ order: number[]; at: number } | null>(null);
  const tourNodeRef = useRef<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [tourAt, setTourAt] = useState<
    { i: number; of: number; name: string; links: number; claims: number } | null>(null);
  // Rotation lives in refs for the same reason hover does: as state it would
  // re-run the effect and re-settle 260 ticks of O(n²) repulsion on every
  // mouse move of a drag.
  const yawRef = useRef(0.5);
  // Tipped slightly down the whole time, so the rotation reads as a body turning
  // rather than as a flat ring spinning.
  const pitchRef = useRef(-0.22);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  // Forces in a ref, mirrored into state only so the sliders can show their own
  // values: as a dependency they would tear down and rebuild the model on every
  // pixel of a drag.
  const tourStepRef = useRef<((restart: boolean) => void) | null>(null);
  const forcesRef = useRef<Forces>({ ...DEFAULT_FORCES });
  const [forces, setForces] = useState<Forces>({ ...DEFAULT_FORCES });
  // Tuning is part of the arrangement, so it is remembered with it. Read after
  // mount, like every other stored preference here, so the server and client
  // agree about the first paint.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORCES_KEY);
      if (!raw) return;
      const saved = { ...DEFAULT_FORCES, ...JSON.parse(raw) } as Forces;
      forcesRef.current = saved;
      setForces(saved);
      stepRef.current?.(60);
    } catch { /* the defaults stand */ }
  }, []);
  const setForce = (key: keyof Forces, value: number | string) => {
    forcesRef.current = { ...forcesRef.current, [key]: value };
    setForces(forcesRef.current);
    try { localStorage.setItem(FORCES_KEY, JSON.stringify(forcesRef.current)); } catch { /* ignore */ }
    // A repaint is enough for a paint-only setting; the rest need the model to
    // move, and stepping when nothing has to move would jog a settled layout.
    if (key === "glow" || key === "colour" || key === "edgeColour") { drawRef.current?.(); return; }
    // Settle and repaint on the spot rather than waiting for the animation loop.
    // The loop is not always there: reduced motion has none at all, and a
    // background tab has requestAnimationFrame suspended — in both cases the
    // sliders silently did nothing, which is worse than not having them.
    stepRef.current?.(24);
  };
  const draggedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  // The list can be folded away to give the graph the whole panel. Read after
  // mount rather than during render: reading localStorage while rendering makes
  // the server and client disagree about the first paint, and React refuses to
  // patch that tree.
  const [listOpen, setListOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("genesis.graph.list");
      if (stored !== null) setListOpen(stored === "1");
    } catch { /* private mode — the default stands */ }
  }, []);
  // Two folds, remembered separately: the sidebar is how you read one entity,
  // the index is the whole cast at once, and wanting one is not wanting the other.
  const [nodesOpen, setNodesOpen] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("genesis.graph.nodes");
      if (stored !== null) setNodesOpen(stored === "1");
    } catch { /* private mode — folded is the default */ }
  }, []);
  const toggleNodes = () => {
    setNodesOpen((open) => {
      const next = !open;
      try { localStorage.setItem("genesis.graph.nodes", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const toggleList = () => {
    setListOpen((open) => {
      const next = !open;
      try { localStorage.setItem("genesis.graph.list", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
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

    const { nodes, edges, degree } = build(entities);
    nodesRef.current = nodes;
    tourRef.current = { order: [], at: -1 };
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue("--accent").trim() || "#3987e5";
    const warn = css.getPropertyValue("--warn").trim() || "#fab219";
    const line = css.getPropertyValue("--line").trim() || "#232936";
    const ink = css.getPropertyValue("--ink-2").trim() || "#c0c6d4";
    // The panel the canvas sits on. Needed because a node is drawn translucent,
    // so without an opaque backing it takes the colour of whatever is behind it.
    const panel = css.getPropertyValue("--surface-2").trim() || "#171c27";
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The canvas is drawn in a 720-wide space and displayed around 430 wide, so
    // every label at once is a 6px mat of overlapping text at 106 entities.
    // Name the ones carrying the most, and let hover name the rest.
    const labelled = new Set(
      [...nodes].sort((a, b) => b.claims - a.claims).slice(0, 20).map((n) => n.id),
    );

    const draw = () => {
      // Recomputed each frame so hover responds without restarting the layout.
      const sel = selectedRef.current;
      // A toured node is a focus like any other, which is what lights its whole
      // fan: the edge and neighbour highlighting below is the same code hovering
      // uses, so the tour did not need a second way of drawing anything.
      const focus = hoveredRef.current ?? tourNodeRef.current ?? sel;
      const near = new Set<string>();
      if (focus) {
        for (const e of edges) {
          if (nodes[e.a].id === focus) near.add(nodes[e.b].id);
          if (nodes[e.b].id === focus) near.add(nodes[e.a].id);
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
      // The anchor wires, drawn first and so underneath everything. They are
      // structure — "this node is held here" — and 643 of them radiating from one
      // point will paint over anything drawn before them, which is exactly what
      // happened to the connections: they were rendered, then buried, so changing
      // their colour appeared to do nothing at all. Meaning goes on top of
      // structure.
      // because four hundred of them at full strength is a solid disc of line.
      const anchor = project(
        { x: W / 2, y: H / 2, z: 0, r: 0 } as Node, yaw, pitch);
      // Drawn in ink rather than in the line colour, and at an adjustable
      // strength. The panel behind the canvas is #171c27, so the old --line
      // (#232936) had 1.17:1 against it and was effectively invisible; black
      // measures 1.23:1, which is the same nothing. Ink is 9.96:1, which is why
      // it can be faint and still be seen — six hundred wires need to be faint.
      ctx.lineWidth = 1;
      for (const n of order) {
        const lit = focus !== null && n.id === focus;
        ctx.strokeStyle = lit ? accent : (forcesRef.current.colour || ink);
        ctx.globalAlpha = (lit ? 0.9 : forcesRef.current.glow) * fade(n);
        ctx.beginPath();
        ctx.moveTo(anchor.sx, anchor.sy);
        ctx.lineTo(n.sx!, n.sy!);
        ctx.stroke();
      }
      // The anchor itself, so the wires end somewhere rather than at nothing.
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(anchor.sx, anchor.sy, 3.5 * anchor.k, 0, Math.PI * 2);
      ctx.fillStyle = ink; ctx.fill();

      // 390 edges across 106 nodes drawn at full strength is a grey mat that
      // buries the nodes. They are context, so they sit back until you point.
      // One colour for both states, alpha doing the work: a chosen colour that
      // only showed on the dim ones would barely be a choice, and the lit state is
      // where connections are actually read — during a cycle, or on hover.
      const edgeInk = forcesRef.current.edgeColour || accent;
      for (const { a: i, b: j } of edges) {
        const lit = focus !== null && (nodes[i].id === focus || nodes[j].id === focus);
        ctx.strokeStyle = edgeInk;
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
        /* A node in the current connection fills solid; everything else stays a
           hollow ring. Whether a node is *in* the thing being shown is the only
           question the cycle asks, and a difference in alpha between 0.26 and 0.5
           is not an answer you can see across four hundred of them. Solid against
           hollow is legible at a glance, and it keeps the amber/accent meaning —
           what fills is still coloured by whether it is disputed. */
        const inConnection = focus !== null && related;
        /* Backed with the panel colour before its own is applied. A node is drawn
           at 26% when it is not part of what is being shown, which means anything
           behind it shows through — and with the connections now painting over the
           anchor wires, that was the connection colour: pick red for connections
           and the nodes went red with them. A node has to look like itself
           whatever is behind it, so the disc is made opaque first. */
        ctx.globalAlpha = 1;
        ctx.fillStyle = panel;
        ctx.fill();
        ctx.fillStyle = colour;
        ctx.globalAlpha = inConnection ? 1 : on ? 0.5 : 0.26;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colour;
        ctx.lineWidth = inConnection || on ? 2.5 : 1.5;
        ctx.stroke();
        if (on) {                                   // selection ring
          ctx.beginPath();
          ctx.arc(n.sx!, n.sy!, n.sr! + 6, 0, Math.PI * 2);
          ctx.strokeStyle = colour; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // A neighbour of the toured node is named while it holds the frame, so a
        // fan can be read rather than just seen.
        if (labelled.has(n.id) || related) {
          ctx.fillStyle = on ? css.getPropertyValue("--ink").trim() || "#fff" : ink;
          ctx.font = `${on ? "600 " : ""}15px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.id.length > 22 ? `${n.id.slice(0, 21)}…` : n.id,
                       n.sx!, n.sy! + n.sr! + 14);
        }
      }
      ctx.globalAlpha = 1;
    };

    /* The model settles and then holds. Stepping forever meant the graph was
       never the same twice — a permanent shimmer of nodes finding their places,
       which makes it impossible to learn the map and impossible to point at
       anything. So it steps until movement falls below a threshold, then stops
       and stays put; a control or new data wakes it, and it settles again.

       Rotation is unaffected: turning a still model is the motion that was
       wanted, and a model that never stops moving underneath it is not. */
    const advance = (ticks: number) => {
      let moved = 0;
      for (let i = 0; i < ticks; i++) moved = step(nodes, forcesRef.current);
      settledRef.current = moved < REST;
      drawRef.current?.();
      // Saved whether or not it has come to rest. Persisting only at rest tied
      // the map's memory to a convergence that may not happen — with reduced
      // motion or a background tab there is no loop to converge in, and the
      // arrangement would be forgotten precisely for the users who cannot watch
      // it settle. Where it got to is worth keeping either way.
      saveLayout(nodes);
    };
    stepRef.current = (ticks: number) => { settledRef.current = false; advance(ticks); };
    // Advance the tour by one connection and repaint. Kept here because it needs
    // the built edges, which never leave this effect.
    /* The tour steps over nodes, not over edges. One node holds the frame with
       every connection it has lit at once — its whole fan — and then the next node
       takes it. Walking edge by edge said one relationship at a time and never
       showed a shape; a fan says "this is what this company sits inside", which is
       the thing worth two seconds.

       Most-connected first, because that is the order in which the graph is worth
       explaining. */
    const connected = nodes
      .map((n, i) => i)
      .filter((i) => degree[i] > 0)
      .sort((x, y) => degree[y] - degree[x]);

    tourStepRef.current = (restart: boolean) => {
      const t = tourRef.current;
      if (!t) return;
      if (restart) {
        t.order = connected;
        // Start from the selected node if there is one, so clicking something and
        // starting the tour begins where you were looking rather than jumping.
        const from = selectedRef.current === null
          ? -1
          : connected.findIndex((i) => nodes[i].id === selectedRef.current);
        t.at = from;
      }
      if (t.order.length === 0) { tourNodeRef.current = null; setTourAt(null); drawRef.current?.(); return; }
      t.at = (t.at + 1) % t.order.length;
      const node = nodes[t.order[t.at]];
      tourNodeRef.current = node.id;
      setTourAt({
        i: t.at + 1, of: t.order.length,
        name: node.id, links: degree[t.order[t.at]], claims: node.claims,
      });
      drawRef.current?.();
    };
    advance(90);
    drawRef.current = draw;
    draw();
    // Reduced motion draws the settled layout once and stops. The redraw effect
    // below is what keeps hover and selection working without this loop.
    if (reduced) return;

    let raf = 0;
    const start = performance.now();
    let last = start;
    const drift = (now: number) => {
      const t = (now - start) / 1000;
      // Turn it slowly, about a revolution every fifty seconds — enough that the
      // far side comes round on its own, slow enough to read while it moves.
      // Yields immediately to a drag, and to a hover: nobody should have to
      // chase the thing they are pointing at.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragRef.current && hoveredRef.current === null && selectedRef.current === null) {
        yawRef.current += dt * 0.125;
      }
      // Step only while it is still arriving. Once it has, the frame is spent on
      // rotation alone and the arrangement is fixed until something changes it.
      if (!settledRef.current) {
        const moved = step(nodes, forcesRef.current);
        if (moved < REST) {
          settledRef.current = true;
          saveLayout(nodes);       // remember where it came to rest
        }
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

  useEffect(() => {
    if (!touring) { tourNodeRef.current = null; setTourAt(null); drawRef.current?.(); return; }
    tourStepRef.current?.(true);                   // aim it, and show one at once
    const timer = setInterval(() => tourStepRef.current?.(false), TOUR_MS);
    return () => clearInterval(timer);
  }, [touring, selected]);

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

      <div className={`graph-layout${listOpen ? "" : " list-folded"}`}>
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
          {/* The settings bar. These are the model's own forces, not a view
              filter — what they change is where the nodes actually settle, which
              is why they are worth having: the right spacing for forty entities
              is the wrong spacing for four hundred. */}
          <div className="graph-forces">
            <label>
              <span>wire length<b>{forces.wire}</b></span>
              <input type="range" min={110} max={400} step={5} value={forces.wire}
                     onChange={(e) => setForce("wire", Number(e.target.value))} />
            </label>
            <label>
              <span>pull to anchor<b>{forces.pull.toFixed(2)}</b></span>
              <input type="range" min={0.01} max={0.2} step={0.01} value={forces.pull}
                     onChange={(e) => setForce("pull", Number(e.target.value))} />
            </label>
            <label>
              <span>push apart<b>{forces.push}</b></span>
              <input type="range" min={200} max={5000} step={100} value={forces.push}
                     onChange={(e) => setForce("push", Number(e.target.value))} />
            </label>
            <label>
              <span>keep apart within<b>{forces.spacing}</b></span>
              <input type="range" min={30} max={200} step={5} value={forces.spacing}
                     onChange={(e) => setForce("spacing", Number(e.target.value))} />
            </label>
            <label>
              <span>anchor strength<b>{forces.glow.toFixed(2)}</b></span>
              <input type="range" min={0.02} max={0.7} step={0.02} value={forces.glow}
                     onChange={(e) => setForce("glow", Number(e.target.value))} />
            </label>
            <label className="gf-colour">
              <span>anchor wires<b>{forces.colour}</b></span>
              <input type="color" value={forces.colour}
                     onChange={(e) => setForce("colour", e.target.value)} />
            </label>
            <label className="gf-colour">
              <span>connections<b>{forces.edgeColour}</b></span>
              <input type="color" value={forces.edgeColour}
                     onChange={(e) => setForce("edgeColour", e.target.value)} />
            </label>
            <button className={`gf-tour${touring ? " on" : ""}`}
                    onClick={() => setTouring((t) => !t)}
                    aria-pressed={touring}
                    title="Hold each connected entity for two seconds with all of its connections lit, most connected first">
              {touring ? "◼ stop cycling" : "▶ cycle connections"}
            </button>
            <button className="gf-reset" onClick={() => {
              forcesRef.current = { ...DEFAULT_FORCES };
              setForces(forcesRef.current);
              try {
                localStorage.removeItem(FORCES_KEY);
                localStorage.removeItem(LAYOUT_KEY);
              } catch { /* ignore */ }
              stepRef.current?.(120);
            }}>reset</button>
          </div>

          {touring && tourAt && (
            <p className="graph-tour" aria-live="polite">
              <span className="gt-count">{tourAt.i} of {tourAt.of.toLocaleString()}</span>
              <b>{tourAt.name}</b>
              <span className="gt-why">
                {tourAt.links} connection{tourAt.links === 1 ? "" : "s"}
                {" · "}
                {tourAt.claims} thing{tourAt.claims === 1 ? "" : "s"} known
              </span>
            </p>
          )}

          <p className="graph-legend">
            It turns on its own, and <b>you can drag it</b> — pointing at anything stops it so you
            can read. The shape is the studio&apos;s knowledge: everything <b>disputed</b> is drawn
            into the mass at the centre, and everything settled sits on the plane around it, each
            wired back to the same anchor. So the size of that core against the disc is how much of
            what the studio knows is contested. Bigger means more has been asserted and nearer is
            drawn larger. Only the busiest are named — hover to light up any other and everything it
            connects to, or click to read it.
          </p>
        </div>

        <button
          className="graph-list-toggle"
          onClick={toggleList}
          aria-expanded={listOpen}
          aria-controls="graph-entity-list"
          title={listOpen
            ? "Fold the list away and give the graph the whole panel"
            : "Show the list of everything the studio tracks"}
        >
          <span className="caret" aria-hidden="true">{listOpen ? "›" : "‹"}</span>
          {listOpen ? "hide list" : `list · ${names.length}`}
        </button>

        <aside className="graph-detail" id="graph-entity-list" hidden={!listOpen}>
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

      {/* Four hundred and seventy-two chips ran further down the page than the
          graph, the legend and the sidebar combined — a wall you scroll past
          rather than a list you use. It folds, and starts folded: the graph and
          the sidebar are how you get at an entity, and this is the exhaustive
          index for when you want to see everything at once. */}
      <button
        className="graph-nodes-toggle"
        onClick={toggleNodes}
        aria-expanded={nodesOpen}
        aria-controls="graph-node-index"
      >
        <span className="caret" aria-hidden="true">{nodesOpen ? "▾" : "▸"}</span>
        {nodesOpen
          ? `hide all ${names.length}`
          : `show all ${names.length} companies and people`}
      </button>

      <div className="graph-nodes" id="graph-node-index" hidden={!nodesOpen}>
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
