import type { RuntimeProof } from "@/lib/alive";

export type VerifyState = "VERIFIED" | "UNVERIFIED" | "CONFLICTED";

export interface MissionSummary {
  id: string; objective: string; status: string;
  sources: number; claims: number; verified: number; conflicted: number;
  has_recommendation: boolean; created_at: string; updated_at: string;
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
export const getEvents = (limit = 300) => api<EventRecord[]>(`/api/events?limit=${limit}`);
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
