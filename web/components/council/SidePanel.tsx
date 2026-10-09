"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Lock, LockOpen, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Redacted, kindLabel, pct } from "@/lib/format";
import { ADV_ORDER, type Memory } from "@/lib/types";
import { openTab, useCouncil, whoInfo, type Tab } from "@/lib/council/store";

const TABS: [Tab, string][] = [["memories", "Memories"], ["weights", "Weights"], ["log", "Agent log"], ["decisions", "Decisions"]];
const help = "mx-0.5 mb-3 text-[11.5px] leading-normal text-dim";
const MAX_WEIGHT = 3;

export function SearchBox({ value, onChange, placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <div className={`flex h-9 items-center gap-2 rounded-[10px] border border-line bg-[#0e0a07] px-3 text-dim ${className}`}>
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 bg-transparent text-[12.5px] text-ink outline-none" />
    </div>
  );
}

function MemoryRow({ m }: { m: Memory }) {
  return (
    <div className={`mem ${m.sealed ? "sealed" : ""}`}>
      <div className="mb-[3px] flex items-center justify-between text-[10.5px] text-dim">
        <span>
          <span className={`kind k-${m.kind}`}>{kindLabel(m.kind)}</span>
          {m.date} · {m.source}
          {m.score != null && <> · <b className="text-gold2">{m.score}</b></>}
        </span>
        <button
          className={`grid size-6 place-items-center rounded-md hover:bg-[#261a0c] hover:text-gold2 ${m.sealed ? "text-gold" : "text-dim"}`}
          title={m.sealed ? "Sealed: reasoned with, never quoted. Click to unseal" : "Seal this memory"}
          onClick={() => api.seal(m.id, !m.sealed)}
        >
          {m.sealed ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
      </div>
      <div className="body"><Redacted text={m.text} /></div>
    </div>
  );
}

function MemoriesPane() {
  const memories = useCouncil((s) => s.memories);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Memory[] | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) return setHits(null);
    const t = setTimeout(() => api.memories(query).then(setHits, () => setHits([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  const sealed = memories.filter((m) => m.sealed).length;
  const redacted = memories.filter((m) => m.redacted).length;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Semantic search in Qdrant…" className="mb-2" />
      <div className="mx-0.5 mb-2.5 text-[11px] text-dim">
        {memories.length} memories in Qdrant · {sealed} sealed · {redacted} redacted
      </div>
      {(hits ?? memories).map((m) => <MemoryRow key={m.id} m={m} />)}
    </>
  );
}

function WeightsPane() {
  const advisors = useCouncil((s) => s.advisors);
  const wc = useCouncil((s) => s.weightChanges);
  const trackText = useCouncil((s) => s.trackText);
  const bars = useRef<Record<string, HTMLElement | null>>({});
  const changes = Object.fromEntries((wc?.changes ?? []).map((c) => [c.advisor, c]));

  // after an outcome report, animate each bar from its old weight to the new one
  useLayoutEffect(() => {
    wc?.changes.forEach((c) =>
      gsap.fromTo(bars.current[c.advisor]!, { width: `${(c.old / MAX_WEIGHT) * 100}%` },
        { width: `${(c.new / MAX_WEIGHT) * 100}%`, duration: 1.6, ease: "elastic.out(1,.6)", delay: 0.3 }));
  }, [wc?.key]);

  return (
    <>
      <div className={help}>
        Vote power = <b className="text-ink">weight × confidence</b>. Tell Sabha how a decision turned out, and advisors who
        called it right gain weight.
      </div>
      {ADV_ORDER.map((k) => {
        const a = advisors[k];
        if (!a) return null;
        const c = changes[k];
        const up = c && c.new >= c.old;
        return (
          <div key={k} className="wrow">
            <div className="flex justify-between text-[13px]">
              <span>
                <span style={{ color: a.color }}>●</span> {a.name}
                {c && (
                  <span className={`ml-1.5 text-[11px] font-bold ${up ? "text-ok" : "text-bad"}`}>
                    {up ? "▲ +" : "▼ "}{(c.new - c.old).toFixed(2)}
                  </span>
                )}
              </span>
              <span className="font-mono">{a.weight.toFixed(2)}</span>
            </div>
            <div className="mt-[7px] h-[7px] overflow-hidden rounded-md bg-[#2a1d10]">
              <i ref={(el) => void (bars.current[k] = el)} className="block h-full rounded-md"
                style={{ width: `${(a.weight / MAX_WEIGHT) * 100}%`, background: a.color }} />
            </div>
            <div className="mt-[5px] text-[11px] text-dim">
              right {a.times_right} of {a.total}
              {c && (
                <> · voted {c.voted} → {c.right ? <span className="text-ok">called it</span> : <span className="text-bad">missed</span>}</>
              )}
            </div>
          </div>
        );
      })}
      {trackText && <div className="mt-2.5 text-xs text-gold2">{trackText}</div>}
    </>
  );
}

function LogPane() {
  const log = useCouncil((s) => s.agentLog);
  return (
    <>
      <div className={help}>Every Lyzr agent call, fallback and Omi write-back.</div>
      {log.map((e, i) => {
        const info = whoInfo(e.agent);
        const color = e.agent === "omi" ? "#60A5FA" : info.color;
        return (
          <div key={`${e.ts ?? ""}-${i}`} className="mb-1.5 rounded-lg border-l-[3px] bg-[#18110b] px-2.5 py-2 text-[11.5px]" style={{ borderColor: color }}>
            <div className="flex items-center justify-between gap-1.5">
              <span>
                <b style={{ color }}>{e.agent === "omi" ? "Omi" : info.name || e.agent}</b>{" "}
                <span className="text-dim">· {e.phase}</span>
              </span>
              <span className="whitespace-nowrap">
                <span className={`mode m-${e.mode}`}>{String(e.mode).toUpperCase()}</span>{" "}
                <span className="text-dim">{e.ms ? `${e.ms}ms` : ""}</span>{" "}
                {e.ok ? <span className="text-ok">✓</span> : <span className="text-bad">✗</span>}
              </span>
            </div>
            <div className="mt-[3px] break-words font-mono text-[10.5px] text-[#bfae8e]">{e.preview}</div>
          </div>
        );
      })}
    </>
  );
}

function DecisionsPane() {
  const decisions = useCouncil((s) => s.decisions);
  if (!decisions.length) return <div className={help}>No decisions yet. Ask the council a question.</div>;
  return (
    <>
      {decisions.map((d) => (
        <div key={d.id} className="wrow">
          <div className="text-[10.5px] text-dim">{d.date}</div>
          <div className="mt-0.5 text-[13px] font-semibold">{d.question}</div>
          <div className="mt-[3px] text-xs text-muted">
            Verdict <b className="text-gold2">{d.verdict}</b> · {pct(d.confidence)}
          </div>
          {!!d.biases?.length && <div className="mt-[3px] text-[11px] text-[#fed7aa]">Biases: {d.biases.join(", ")}</div>}
          {d.tipping && <div className="mt-[3px] text-[11px] text-muted">⚖ {d.tipping.label} · {d.tipping.text}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.outcome ? (
              <span className={`chip ${d.outcome === "good" ? "text-ok!" : "text-bad!"}`}>
                chose {d.chosen} · went {d.outcome === "good" ? "well" : "badly"}
              </span>
            ) : (
              d.options.flatMap((o) => [
                <button key={`${o}+`} className="smallbtn" onClick={() => api.outcome(d.id, o, true)}>{o} ✓ well</button>,
                <button key={`${o}-`} className="smallbtn" onClick={() => api.outcome(d.id, o, false)}>{o} ✗ badly</button>,
              ])
            )}
          </div>
        </div>
      ))}
    </>
  );
}

const PANES: Record<Tab, () => React.ReactNode> = {
  memories: MemoriesPane, weights: WeightsPane, log: LogPane, decisions: DecisionsPane,
};

/** Right column (a slide-over drawer on narrow screens). */
export default function SidePanel() {
  const tab = useCouncil((s) => s.tab);
  const open = useCouncil((s) => s.panelOpen);
  const Pane = PANES[tab];

  return (
    <aside className={`right flex min-h-0 ${open ? "open" : ""}`}>
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px]">
        <div className="flex gap-1 border-b border-line p-1.5">
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => openTab(t)}
              className={`flex-1 rounded-[9px] px-1 py-[7px] text-xs font-medium ${tab === t ? "bg-[#261a0c] text-gold2" : "text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <Pane />
        </div>
      </div>
    </aside>
  );
}
