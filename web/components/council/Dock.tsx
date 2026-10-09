"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FlaskConical, Mic, RotateCcw, SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import { council, toast, useCouncil } from "@/lib/council/store";
import { clearQueue, stopSpeaking } from "@/lib/council/voice";

const SUGGESTIONS: [label: string, say: string][] = [
  ["Ask: startup or MNC?", "Sabha, should I join the startup or the MNC offer?"],
  ["Next round", "Sabha, next round"],
  ["I also care about…", "Sabha, I also care about staying close to my parents in Bengaluru"],
  ["Seal that", "Sabha, seal that"],
  ["It went well", "Sabha, the startup decision went well"],
  ["Track record", "Sabha, show my track record"],
];

const REPLAYS: [scenario: string, label: string][] = [
  ["memories", "Memories arrive"], ["question", "Ask question"], ["interrupt", "Interrupt"], ["next", "Next round"],
  ["seal", "Seal that"], ["offrecord", "Off the record"], ["outcome", "Report outcome"], ["track", "Track record"],
  ["daysummary", "Omi day summary"],
];

const say = (text: string, source = "typed") => {
  text = text.trim();
  if (text) void api.speech(text, source);
};

// ---------------------------------------------------------------- browser mic (backup for Omi)
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function useMic() {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const live = useRef(false);

  useEffect(() => () => {
    live.current = false;
    rec.current?.stop();
  }, []);

  const toggle = () => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return toast("Web Speech API not supported here. Use Chrome/Edge, or type.");
    if (live.current) {
      live.current = false;
      rec.current?.stop();
      return setOn(false);
    }
    const r = new SR();
    r.lang = "en-IN";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) say(e.results[i][0].transcript, "web-mic");
    };
    r.onend = () => {
      if (live.current) try { r.start(); } catch {}
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") {
        live.current = false;
        setOn(false);
        toast("Mic permission denied");
      }
    };
    rec.current = r;
    live.current = true;
    r.start();
    setOn(true);
    toast("Listening… speak naturally, start with “Sabha” for commands");
  };
  return { on, toggle };
}

// ---------------------------------------------------------------- demo tools
function DemoTools({ close }: { close: () => void }) {
  const speed = useCouncil((s) => s.speed);
  const replay = async (scenario: string, label: string) => {
    await api.simulate(scenario);
    toast(`▶ Replaying Omi webhooks: ${label}`);
    close();
  };
  const reset = async () => {
    if (!confirm("Reset Qdrant to the seed memories? Decisions and weights are cleared.")) return;
    clearQueue();
    await api.reset();
    toast("Demo data reset");
  };

  return (
    <div data-demo className="card absolute right-6 bottom-[78px] z-30 w-[300px] rounded-[18px] p-3.5">
      <h4 className="mb-2 text-[11px] uppercase tracking-[.16em] text-dim">Replay Omi webhooks</h4>
      <div className="grid grid-cols-2 gap-1.5">
        {REPLAYS.map(([s, label]) => (
          <button key={s} onClick={() => replay(s, label)}
            className="rounded-lg border border-line bg-[#120d09] px-2 py-1.5 text-left text-xs hover:border-gold hover:text-gold2">
            {label}
          </button>
        ))}
        <button onClick={() => { council.set({ constellationOpen: true }); close(); }}
          className="rounded-lg border border-line bg-[#120d09] px-2 py-1.5 text-left text-xs hover:border-gold hover:text-gold2">
          Constellation
        </button>
      </div>
      <button className="smallbtn mt-1.5 w-full py-[7px]!" onClick={() => replay("full", "Full demo")}>
        ▶ Full demo (memories + question)
      </button>
      <label className="mt-3 flex items-center gap-2.5 text-xs text-muted">
        Voice speed
        <input type="range" min="0.9" max="1.7" step="0.1" value={speed} className="flex-1 accent-gold"
          onChange={(e) => council.set({ speed: parseFloat(e.target.value) })} />
        <span>{speed.toFixed(2)}×</span>
      </label>
      <div className="mt-3 flex items-center gap-2.5">
        <button className="smallbtn inline-flex items-center gap-1" onClick={stopSpeaking}>
          <SkipForward size={12} /> Skip speaker
        </button>
        <button className="smallbtn inline-flex items-center gap-1" onClick={reset}>
          <RotateCcw size={12} /> Reset demo data
        </button>
      </div>
    </div>
  );
}

/** Bottom bar: browser mic, text input (same pipeline as Omi speech), quick commands and demo tools. */
export default function Dock() {
  const [text, setText] = useState("");
  const [demo, setDemo] = useState(false);
  const mic = useMic();

  useEffect(() => {
    if (!demo) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-demo]")) setDemo(false);
    };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [demo]);

  const submit = () => {
    say(text);
    setText("");
  };

  return (
    <div className="relative px-6 pt-2 pb-4 max-[700px]:px-3 max-[700px]:pb-3">
      <div className="mx-auto flex max-w-[820px] items-center gap-2.5">
        <button className={`round ${mic.on ? "rec" : ""}`} title="Browser mic (backup for Omi)" onClick={mic.toggle}>
          <Mic size={19} />
        </button>
        <div className="flex h-[46px] flex-1 items-center rounded-full border border-line2 bg-panel pr-[5px] pl-[18px] transition focus-within:border-gold focus-within:shadow-[0_0_0_3px_#e8b64c22]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoComplete="off"
            placeholder="Say or type… “Sabha, should I join the startup or the MNC offer?”"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
          />
          <button title="Send" onClick={submit}
            className="grid size-9 place-items-center rounded-full bg-gold text-[#1a1006] hover:bg-gold2">
            <ArrowUp size={16} />
          </button>
        </div>
        <button data-demo className={`round ${demo ? "on" : ""}`} title="Demo tools" onClick={() => setDemo((d) => !d)}>
          <FlaskConical size={18} />
        </button>
      </div>
      <div className="mx-auto mt-[9px] flex max-w-[820px] flex-wrap justify-center gap-1.5 max-[700px]:hidden">
        {SUGGESTIONS.map(([label, line]) => (
          <button key={label} className="chip" onClick={() => say(line)}>
            {label}
          </button>
        ))}
      </div>
      {demo && <DemoTools close={() => setDemo(false)} />}
    </div>
  );
}
