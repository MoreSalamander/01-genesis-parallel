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
}
export interface EventRecord { event: string; at: string; mission_id?: string; [k: string]: unknown }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const getStatus = () => api<SystemStatus>("/api/status");
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
