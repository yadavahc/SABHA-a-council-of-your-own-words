/** Shapes sent by the FastAPI server (app/main.py, app/debate.py, app/memory.py). */

export type AdvisorKey = "mentor" | "skeptic" | "future_you" | "strategist" | "guardian";
export type SpeakerKey = AdvisorKey | "moderator" | "bias_radar" | "scribe" | "omi" | "you";

export const ADV_ORDER: AdvisorKey[] = ["mentor", "skeptic", "future_you", "strategist", "guardian"];

export type MemoryKind = "goal" | "value" | "fear" | "plan" | "fact" | "past_decision";

export interface Advisor {
  key: AdvisorKey;
  name: string;
  title: string;
  color: string;
  weight: number;
  times_right: number;
  total: number;
}

export interface ExtraAgent {
  name: string;
  title?: string;
  color: string;
}

export interface Memory {
  id: string;
  text: string;
  kind: MemoryKind;
  time: number;
  date: string;
  sealed: boolean;
  source: string;
  redacted: boolean;
  score?: number;
}

/** A memory as cited in a debate: sealed ones arrive with `text: null`. */
export interface MemoryCard {
  id: string;
  short?: string | null;
  date: string;
  kind: MemoryKind | string;
  sealed: boolean;
  text: string | null;
}

export interface ConstellationPoint extends Memory {
  text: string;
  pos: [number, number, number];
}

export interface Tipping {
  label: string;
  text: string;
  flips: { advisor: AdvisorKey; kind: "switch" | "weight"; text: string }[];
  runner_up?: string;
  gap?: number;
  margin?: number;
}

export interface Decision {
  id: string;
  question: string;
  options: string[];
  verdict: string;
  confidence: number;
  date?: string;
  time?: number;
  biases?: string[];
  tipping?: Tipping | null;
  outcome?: "good" | "bad" | null;
  chosen?: string | null;
}

export interface OmiStatus {
  state: "waiting" | "live" | "idle";
  source?: string | null;
  age?: number | null;
  off_record?: boolean;
}

export interface Webhooks {
  realtime: string;
  memory_created: string;
  day_summary: string;
  app: string;
}

export interface AgentLogEntry {
  agent: string;
  phase: string;
  ok: boolean;
  mode: "lyzr" | "offline" | "omi-api" | string;
  ms?: number;
  preview?: string;
  ts?: number;
}

export interface PhoneEntry {
  text: string;
  source?: string;
  is_user?: boolean;
}

export interface Bias {
  name: string;
  evidence: string;
  memories?: MemoryCard[];
}

export interface DebateSnapshot {
  id: string;
  question: string;
  options: string[];
  favourite: string | null;
  phase: string;
}

export interface Verdict {
  debate_id: string;
  question: string;
  options: string[];
  winner: string;
  verdict?: string;
  confidence: number;
  totals: Record<string, number>;
  summary: string;
  action_item: string;
  dissent?: string;
  tipping?: Tipping | null;
}

export interface WeightChange {
  advisor: AdvisorKey;
  old: number;
  new: number;
  voted: string;
  right: boolean;
}

export interface AppState {
  advisors: Advisor[];
  extra: Record<string, ExtraAgent>;
  omi: OmiStatus;
  tunnel: Webhooks | null;
  tunnel_status: string;
  lyzr: string;
  lyzr_online: boolean;
  omi_writeback: boolean;
  qdrant: string;
  memories: Memory[];
  decisions: Decision[];
  agent_log: AgentLogEntry[];
  phone: PhoneEntry[];
  debate: DebateSnapshot | null;
  user: string;
}

export interface AdvisorSay {
  advisor: AdvisorKey;
  say: string;
  vote?: string;
  confidence?: number;
  round?: number;
  memories?: MemoryCard[];
  replies_to?: AdvisorKey | null;
}

/** Every event the server pushes over /ws. */
export type ServerEvent =
  | ({ type: "state" } & AppState)
  | { type: "phone"; text: string; source?: string }
  | ({ type: "omi_status" } & OmiStatus)
  | { type: "tunnel"; url: string; webhooks: Webhooks }
  | { type: "memory_added"; memory: Memory }
  | { type: "memory_skipped"; reason: "noise" | "off_record"; text: string }
  | { type: "memory_updated"; memory: Memory }
  | { type: "memory_deleted"; id: string }
  | { type: "command"; cmd: string; text: string; source?: string }
  | { type: "debate_start"; debate_id: string; question: string }
  | { type: "phase"; phase: string; label: string }
  | { type: "moderator"; text: string; options?: string[]; favourite?: string | null; question?: string }
  | ({ type: "advisor_say" } & AdvisorSay)
  | { type: "bias"; say: string; biases: Bias[] }
  | { type: "awaiting_next"; seconds: number }
  | { type: "interjection"; text: string; memory: MemoryCard; phase: string }
  | { type: "vote"; advisor: AdvisorKey; option: string; totals: Record<string, number> }
  | ({ type: "verdict" } & Verdict)
  | { type: "omi_writeback"; ok: boolean; detail?: string }
  | { type: "decisions"; decisions: Decision[] }
  | { type: "weights_update"; advisors: Advisor[]; changes: WeightChange[]; text: string }
  | { type: "track_record"; advisors: Advisor[]; decisions: Decision[]; text: string }
  | ({ type: "agent_log" } & AgentLogEntry)
  | { type: "toast"; text: string }
  | { type: "error"; text: string }
  | { type: "debate_stopped" }
  | { type: "sync"; token: number };
