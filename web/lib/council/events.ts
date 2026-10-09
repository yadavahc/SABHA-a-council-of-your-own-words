/** Applies every server event to the store, and queues what the council says and does. */
import type { Advisor, AdvisorKey, ServerEvent } from "../types";
import { addFeed, council, isSmall, openTab, restCore, toast } from "./store";
import { clearLinks, clearRing, drawRing, memCard, pulse, setStance, speakAs, voteFly } from "./stage";
import { send } from "./socket";
import { clearQueue, enqueue, sleep } from "./voice";

const WAKE = /^\W*(hey |ok |okay )?(sabha|saba|sabah)\b/i;

const byKey = (list: Advisor[]) => Object.fromEntries(list.map((a) => [a.key, a])) as Record<AdvisorKey, Advisor>;
const mergeAdvisors = (list: Advisor[]) =>
  council.set((s) => ({
    advisors: Object.fromEntries(list.map((a) => [a.key, { ...s.advisors[a.key], ...a }])) as Record<AdvisorKey, Advisor>,
  }));
const quote = (q: string) => `“${q}”`;

export function handleEvent(ev: ServerEvent) {
  const s = council.get();
  switch (ev.type) {
    case "state": {
      const running = ev.debate && ev.debate.phase !== "done";
      council.set({
        advisors: byKey(ev.advisors), extra: ev.extra, memories: ev.memories, decisions: ev.decisions,
        agentLog: [...ev.agent_log].reverse(), omi: ev.omi, tunnel: ev.tunnel, tunnelStatus: ev.tunnel_status,
        lyzrOnline: ev.lyzr_online, qdrant: ev.qdrant, omiWriteback: ev.omi_writeback, debating: !!running,
        ...(running && {
          options: ev.debate!.options, favourite: ev.debate!.favourite, phase: ev.debate!.phase,
          question: quote(ev.debate!.question), core: "none" as const,
        }),
      });
      if (!s.feed.some((f) => f.t === "msg"))
        ev.phone.slice(-6).forEach((p) => addFeed({ t: "msg", text: p.text, source: p.source, cmd: false }));
      if (!running) restCore();
      break;
    }
    case "phone":
      addFeed({ t: "msg", text: ev.text, source: ev.source, cmd: WAKE.test(ev.text) });
      if (ev.source === "phone" || ev.source === "simulate")
        pulse("you", ".orb", { boxShadow: "0 0 40px #fff" }, { boxShadow: "0 0 22px #e5e7eb", duration: 1 });
      if (isSmall()) toast(`📱 ${ev.text}`);
      break;
    case "omi_status": {
      const { type: _, ...omi } = ev;
      council.set({ omi });
      break;
    }
    case "tunnel":
      council.set({ tunnel: ev.webhooks });
      toast("Tunnel up · click Connect Omi for the webhook URLs", "#4ade80");
      break;
    case "memory_added": {
      const m = ev.memory;
      council.set({ memories: [m, ...s.memories] });
      addFeed({ t: "mem", kind: m.kind, redacted: m.redacted });
      if (!s.debating) memCard(m, "you");
      if (isSmall()) toast(`Saved as ${m.kind.toUpperCase()}: ${m.text.slice(0, 60)}`);
      break;
    }
    case "memory_skipped":
      addFeed(ev.reason === "noise"
        ? { t: "note", text: "skipped · noise", tone: "dim" }
        : { t: "note", text: "not saved · off the record", tone: "bad" });
      break;
    case "memory_updated":
      council.set({ memories: s.memories.map((m) => (m.id === ev.memory.id ? ev.memory : m)) });
      break;
    case "memory_deleted":
      council.set({ memories: s.memories.filter((m) => m.id !== ev.id) });
      break;
    case "command":
      addFeed({ t: "note", text: `command → ${ev.cmd}`, tone: "gold" });
      pulse("you", ".orb", { scale: 1.4 }, { scale: 1, duration: 0.8, ease: "elastic.out(1,.4)" });
      break;

    case "debate_start":
      clearQueue();
      clearRing();
      clearLinks();
      council.set({
        debating: true, used: new Set(), options: [], biases: [], favourite: null, ringShown: false, stances: {},
        scanning: false, phase: "The council convenes", question: quote(ev.question), core: "none",
        verdictOpen: false, countdown: null,
      });
      break;
    case "phase":
      enqueue(() => {
        council.set({ phase: ev.label, scanning: ev.phase === "bias" });
        if (ev.phase === "round2" || ev.phase === "vote") council.set({ countdown: null });
        if (ev.phase === "vote") drawRing({});
      });
      break;
    case "moderator":
      council.set({
        options: ev.options ?? s.options, favourite: ev.favourite ?? null,
        ...(ev.question && { question: quote(ev.question) }),
      });
      enqueue(() => speakAs("moderator", ev.text));
      break;
    case "advisor_say":
      ev.memories?.forEach((m) => s.used.add(m.id));
      enqueue(() => speakAs(ev.advisor, ev.say, ev));
      break;
    case "bias":
      enqueue(async () => {
        council.set({ biases: ev.biases });
        await speakAs("bias_radar", ev.say, { memories: ev.biases.flatMap((b) => b.memories ?? []).slice(0, 3) });
        council.set({ scanning: false });
      });
      break;
    case "awaiting_next":
      council.set({ countdown: { seconds: ev.seconds, key: Date.now() } });
      break;
    case "interjection":
      pulse("you", ".orb", { boxShadow: "0 0 90px #fff", scale: 1.5 }, { boxShadow: "0 0 22px #e5e7eb", scale: 1, duration: 1.4 });
      memCard({ ...ev.memory, kind: "you just said", date: "now" }, "you");
      toast(`✋ Noted: ${ev.text} · the advisors will weigh it next round`, "#ffffff");
      break;
    case "vote":
      enqueue(async () => {
        voteFly(ev.advisor, ev.option);
        await sleep(650);
        drawRing(ev.totals);
        setStance(ev.advisor, ev.option);
        pulse(ev.advisor, ".orbbox", { scale: 1.25 }, { scale: 1, duration: 0.6 });
        await sleep(300);
      });
      break;
    case "verdict": {
      const { type: _, ...v } = ev;
      council.set({ writeback: null });
      enqueue(async () => {
        drawRing(v.totals, true);
        council.set({ verdict: v, verdictOpen: true });
        await sleep(1500);
        council.set({ debating: false });
        const tip = v.tipping?.flips.length ? ` Tipping point: ${v.tipping.text}` : "";
        await speakAs("scribe", `${v.verdict || v.winner}. ${v.summary}${tip}`);
      });
      break;
    }
    case "omi_writeback":
      council.set({ writeback: { ok: ev.ok, detail: ev.detail } });
      toast(ev.ok ? "📲 Sent to your Omi app" : `Omi write-back: ${ev.detail}`, ev.ok ? "#4ade80" : "#fbbf24");
      break;
    case "decisions":
      council.set({ decisions: ev.decisions });
      break;
    case "weights_update":
      mergeAdvisors(ev.advisors);
      council.set({ weightChanges: { changes: ev.changes, key: Date.now() } });
      openTab("weights");
      ev.changes.forEach((c) =>
        pulse(c.advisor, ".orb", { filter: c.right ? "brightness(2)" : "brightness(.4)" }, { filter: "brightness(1)", duration: 2 }));
      enqueue(() => speakAs("moderator", ev.text));
      break;
    case "track_record":
      mergeAdvisors(ev.advisors);
      council.set({ decisions: ev.decisions, weightChanges: null, trackText: ev.text });
      openTab("weights");
      enqueue(() => speakAs("moderator", ev.text));
      break;
    case "agent_log": {
      const { type: _, ...entry } = ev;
      council.set({ agentLog: [entry, ...s.agentLog].slice(0, 200) });
      break;
    }
    case "toast":
      toast(ev.text);
      break;
    case "error":
      toast(`⚠ ${ev.text}`, "#ef4444");
      break;
    case "debate_stopped":
      clearQueue();
      council.set({ debating: false, ringShown: false, phase: "Debate stopped" });
      restCore();
      break;
    case "sync":
      // the server waits for this before moving on, so speech and debate stay in step
      enqueue(() => send({ type: "playback_done", token: ev.token }));
      break;
  }
}
