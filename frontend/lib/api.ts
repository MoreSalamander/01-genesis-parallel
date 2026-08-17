import type { RuntimeProof } from "@/lib/alive";

export type VerifyState = "VERIFIED" | "UNVERIFIED" | "CONFLICTED";

export interface MissionSummary {
  id: string; objective: string; status: string;
  sources: number; claims: number; verified: number; conflicted: number;
  has_recommendation: boolean;
  /** Set when the loop raised this question itself. It belongs on the board
   *  like any other, but must never read as one the Studio Head typed. */
  raised_by: string; raised_because: string;
  created_at: string; updated_at: string;
}
export interface Stage { name: string; detail: string; at: string }
export interface Task { id: string; domain: string; focus: string; queries: string[]; specialist: string }
export interface SourceT { id: string; url: string; title: string }
export interface EvidenceT {
  id: string; observation_id: string; source_id: string; claim_text: string;
  supporting_content: string; confidence: number; verification_status: VerifyState;
  related_entities: string[]; provenance: Record<string, unknown>;
}
export interface Claim {
  id: string; text: string; entity: string; evidence_ids: string[];
  corroborating_sources: number; status: VerifyState; conflict_detail: string;
}
export interface Finding {
  id: string; domain: string; text: string; claim_ids: string[];
  strategic_impact: "HIGH" | "MEDIUM" | "LOW";
}
export interface Recommendation {
  id: string; action: string; rationale: string; confidence: number;
  finding_ids: string[]; decision: string | null; decided_at: string | null;
}
export interface MissionDetail {
  id: string; objective: string; status: string; error: string;
  raised_by: string; raised_because: string;
  stages: Stage[]; tasks: Task[]; sources: SourceT[]; evidence: EvidenceT[];
  claims: Claim[]; findings: Finding[]; recommendation: Recommendation | null;
  created_at: string; updated_at: string;
}
export interface SystemStatus {
  system: string; banner: string; parallel_live: boolean; gemini_live: boolean;
  missions: number; episodic: number;
  /** Substrate states for the runtime-proof footer (app/runtime_proof.py). */
  runtime_proof?: RuntimeProof;
}
export interface EventRecord { event: string; at: string; mission_id?: string; [k: string]: unknown }
/** One recorded call to Gemini (app/cognition_ledger.py). The summary carries
 *  no prompt and no full response — `getCognitionCall` fetches those. */
export interface CognitionCall {
  id: string; at: string; role: string; model: string; live: boolean; ms: number;
  parsed_ok: boolean; tokens: { prompt?: number; total?: number }; ref: string | null;
  error: string; prompt_chars: number; raw_chars: number; preview: string;
}
/** The full record. `cognition_ledger.get` returns the stored entry as-is, so
 *  the summary-only fields (prompt_chars, raw_chars, preview) are NOT on it —
 *  measure the text itself. */
export type CognitionDetail =
  Omit<CognitionCall, "prompt_chars" | "raw_chars" | "preview"> & { prompt: string; raw: string };
/** The cast (app/agents/roster.py): roles that run every mission, and the
 *  domain specialists an objective can call up. */
export interface StandingAgent { name: string; role: string; permissions: string[]; stage: string }
export interface SpecialistAgent { name: string; focus: string; permissions: string[] }
export interface AgentRoster {
  standing: StandingAgent[];
  domains: { domain: string; specialists: SpecialistAgent[] }[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** One promoted entity in the durable world model. UNVERIFIED claims never
 *  reach this store, so everything here is knowledge the studio stands behind. */
export interface KnowledgeAssertion {
  claim: string; status: VerifyState; disputed: boolean;
  conflict_detail: string; corroborating_sources: number;
  mission_id: string; claim_id: string; at: string;
}
export interface KnowledgeEntity {
  name: string; type: string; first_seen: string; last_updated?: string;
  assertions: KnowledgeAssertion[];
}

export const getStatus = () => api<SystemStatus>("/api/status");
export const getKnowledgeEntities = () =>
  api<Record<string, KnowledgeEntity>>("/api/knowledge/entities");

/** One recorded provenance link: how a thing got here, and from what. */
export interface RelationshipRecord {
  src_kind: string; src: string; rel: string;
  dst_kind: string; dst: string; mission_id: string;
}
export const getKnowledgeRelationships = (limit = 400) =>
  api<RelationshipRecord[]>(`/api/knowledge/relationships?limit=${limit}`);
export const listMissions = () => api<MissionSummary[]>("/api/missions");
export const getMission = (id: string) => api<MissionDetail>(`/api/missions/${id}`);
/** Pass `mission` to get that mission's own events wherever they sit in the
 *  log — a global tail only ever covers the newest few missions. */
export const getEvents = (limit = 300, mission = "") =>
  api<EventRecord[]>(`/api/events?limit=${limit}${mission ? `&mission=${encodeURIComponent(mission)}` : ""}`);
export const getAgents = () => api<AgentRoster>("/api/agents");

/** Standing tallies for the board: what each agent and each line of enquiry has
 *  done across every mission, counted over the whole event log. */
export interface FleetSpecialist {
  name: string; focus: string; permissions: string[]; tasks: number; produced: number;
}
export interface FleetTally {
  standing: StandingAgent[];
  domains: { domain: string; specialists: FleetSpecialist[]; tasks: number; sources: number }[];
  follow_up: { name: string; tasks: number; produced: number };
  totals: { missions: number; raised: number; tasks: number; produced: number; sources: number };
}
export const getFleet = () => api<FleetTally>("/api/fleet");

/** Gemini's standing record (app/cognition_ledger.py is a window, so `on_record`
 *  says how many calls this covers rather than implying an all-time total). */
export interface GeminiSummary {
  model: string; on_record: number; calls: number; tokens: number; ms: number;
  live: number; malformed: number;
  by_role: { role: string; calls: number; ms: number; tokens: number }[];
  latest: CognitionCall | null;
}
export const getCognitionSummary = () => api<GeminiSummary>("/api/cognition/summary");
/** Gemini's own record. `ref` scopes it to one mission (filtered server-side
 *  across the whole ledger, so an older mission still resolves). */
export const getCognition = (ref = "", limit = 40) =>
  api<CognitionCall[]>(`/api/cognition?limit=${limit}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`);
export const getCognitionCall = (id: string) => api<CognitionDetail>(`/api/cognition/${id}`);
export const startMission = (objective: string) =>
  api<{ id: string; status: string }>("/api/missions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective }),
  });
export const decideMission = (id: string, decision: "approved" | "rejected" | "more_research") =>
  api<MissionSummary>(`/api/missions/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });

export const ACTIVE_STATUSES = new Set(["PLANNED", "RESEARCHING", "VERIFYING", "SYNTHESIZING"]);

/** One question, however many times it was asked. */
export interface AskedGroup { latest: MissionSummary; times: number; earlier: MissionSummary[] }

/** Asking the same question twice is one question with two runs, not two
 *  entries. Listing each run separately pushed distinct questions off the rail
 *  and made a short history look like a busy one. Runs are ordered by when they
 *  were created rather than by the order the API returned them, so "latest"
 *  means latest regardless of that. */
export function groupByQuestion(missions: MissionSummary[]): AskedGroup[] {
  const by = new Map<string, MissionSummary[]>();
  for (const m of missions) {
    const key = m.objective.trim().replace(/\s+/g, " ").toLowerCase();
    const list = by.get(key);
    if (list) list.push(m);
    else by.set(key, [m]);
  }
  const groups = [...by.values()].map((runs) => {
    const sorted = [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { latest: sorted[0], times: sorted.length, earlier: sorted.slice(1) };
  });
  groups.sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));
  return groups;
}
