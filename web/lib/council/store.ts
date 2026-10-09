import { create } from "zustand";
import type {
  Advisor, AdvisorKey, AgentLogEntry, Bias, Decision, ExtraAgent, Memory, OmiStatus, Verdict, WeightChange, Webhooks,
} from "../types";

export type FeedItem = { id: number } & (
  | { t: "msg"; text: string; source?: string; cmd: boolean }
  | { t: "mem"; kind: string; redacted: boolean }
  | { t: "note"; text: string; tone: "dim" | "bad" | "gold" }
);

export interface Toast {
  id: number;
  text: string;
  color?: string;
}

export interface Geo {
  W: number; H: number; cx: number; cy: number; R: number; orb: number;
  pos: Record<string, { x: number; y: number }>;
}

export type Tab = "memories" | "weights" | "log" | "decisions";
export type CoreMode = "idle" | "bubble" | "ring" | "none";

export interface CouncilState {
  // server data
  advisors: Partial<Record<AdvisorKey, Advisor>>;
  extra: Record<string, ExtraAgent>;
  memories: Memory[];
  decisions: Decision[];
  agentLog: AgentLogEntry[]; // newest first
  feed: FeedItem[];
  omi: OmiStatus;
  tunnel: Webhooks | null;
  tunnelStatus: string;
  lyzrOnline: boolean | null;
  qdrant: string;
  omiWriteback: boolean;

  // the debate on the table
  debating: boolean;
  phase: string;
  question: string;
  options: string[];
  favourite: string | null;
  biases: Bias[];
  used: Set<string>; // memory ids cited in this debate (lit up in the constellation)
  scanning: boolean;
  core: CoreMode;
  ringShown: boolean;
  ring: { lead: string; pct: string };
  stances: Partial<Record<AdvisorKey, string>>;
  speaking: string | null;
  focus: AdvisorKey | null;
  bubble: { label: string; color: string; round?: number; vote?: string; confidence?: number; done: boolean };
  countdown: { seconds: number; key: number } | null;
  verdict: Verdict | null;
  verdictOpen: boolean;
  writeback: { ok: boolean; detail?: string } | null;
  weightChanges: { changes: WeightChange[]; key: number } | null;
  trackText: string;

  // ui
  geo: Geo | null;
  tab: Tab;
  panelOpen: boolean;
  connectOpen: boolean;
  constellationOpen: boolean;
  entered: boolean;
  muted: boolean;
  speed: number;
  toasts: Toast[];
}

const initial: CouncilState = {
  advisors: {}, extra: {}, memories: [], decisions: [], agentLog: [], feed: [],
  omi: { state: "waiting" }, tunnel: null, tunnelStatus: "", lyzrOnline: null, qdrant: "", omiWriteback: false,
  debating: false, phase: "The council awaits", question: "Ask a question", options: [], favourite: null, biases: [],
  used: new Set(), scanning: false, core: "idle", ringShown: false, ring: { lead: "—", pct: "votes" }, stances: {},
  speaking: null, focus: null, bubble: { label: "", color: "#E8B64C", done: false }, countdown: null,
  verdict: null, verdictOpen: false, writeback: null, weightChanges: null, trackText: "",
  geo: null, tab: "memories", panelOpen: false, connectOpen: false, constellationOpen: false, entered: false,
  muted: false, speed: 1.15, toasts: [],
};

export const useCouncil = create<CouncilState>()(() => initial);

export const council = {
  get: useCouncil.getState,
  set: useCouncil.setState,
};

let seq = 0;

export function toast(text: string, color?: string) {
  const id = ++seq;
  council.set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, color }] }));
  setTimeout(() => council.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5200);
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function addFeed(item: DistributiveOmit<FeedItem, "id">) {
  council.set((s) => ({ feed: [...s.feed.slice(-59), { ...item, id: ++seq } as FeedItem] }));
}

export function openTab(tab: Tab) {
  council.set({ tab, panelOpen: isSmall() });
}

export const isSmall = () => typeof window !== "undefined" && matchMedia("(max-width:1100px)").matches;

export function whoInfo(who: string): { name: string; title?: string; color: string } {
  const s = council.get();
  return s.advisors[who as AdvisorKey] ?? s.extra[who] ?? { name: who, color: "#E8B64C" };
}

export const OPT_COLORS = ["var(--opt0)", "var(--opt1)", "var(--opt2)", "var(--opt3)"];
export function optColor(option: string | undefined, options = council.get().options) {
  const i = option ? options.indexOf(option) : -1;
  return OPT_COLORS[i < 0 ? 0 : i];
}

/** What the centre of the table shows when nobody is speaking. */
export function restCore() {
  const s = council.get();
  council.set({ core: s.ringShown ? "ring" : s.debating ? "none" : "idle", focus: null });
}
