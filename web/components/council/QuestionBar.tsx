"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { council, OPT_COLORS, useCouncil } from "@/lib/council/store";
import { nextRound } from "@/lib/council/socket";

function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(Math.round(seconds));
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line2 bg-panel py-[3px] pr-1 pl-3 text-xs">
      {left > 0 ? (
        <span>
          Round 2 in <b>{left}s</b> · add a thought
        </span>
      ) : (
        "Waiting for you"
      )}
      <button
        className="rounded-full bg-gold px-2.5 py-[3px] text-[11.5px] font-semibold text-[#1a1006]"
        onClick={() => {
          nextRound();
          council.set({ countdown: null });
        }}
      >
        Next round ›
      </button>
    </span>
  );
}

/** Phase label, the question, the options with their colours, detected biases and the round-2 countdown. */
export default function QuestionBar() {
  const phase = useCouncil((s) => s.phase);
  const question = useCouncil((s) => s.question);
  const options = useCouncil((s) => s.options);
  const favourite = useCouncil((s) => s.favourite);
  const biases = useCouncil((s) => s.biases);
  const countdown = useCouncil((s) => s.countdown);
  const phaseRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(phaseRef.current, { opacity: 0 }, { opacity: 1, duration: 0.5 });
  }, [phase]);
  useEffect(() => {
    gsap.fromTo(questionRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6 });
  }, [question]);
  useEffect(() => {
    if (biases.length) gsap.from(metaRef.current!.querySelectorAll(".bias"), { scale: 0, stagger: 0.15, duration: 0.4, ease: "back.out" });
  }, [biases]);

  return (
    <div className="min-h-[92px] px-6 pt-3.5 text-center max-[700px]:px-3 max-[700px]:pt-2.5">
      <div ref={phaseRef} className="h-4 text-[11px] uppercase tracking-[.28em] text-gold">{phase}</div>
      <div ref={questionRef} className="question mx-auto mt-1 max-w-[760px]">{question}</div>
      <div ref={metaRef} className="mt-2 flex min-h-6 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-muted">
        {options.map((o, i) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <i className="size-[9px] rounded-full" style={{ background: OPT_COLORS[i] }} />
            {o}
            {o === favourite && <span className="text-dim">· your lean</span>}
          </span>
        ))}
        {biases.map((b) => (
          <span key={b.name} className="bias" title={b.evidence}>
            ⚠ {b.name}
          </span>
        ))}
        {countdown && <Countdown key={countdown.key} seconds={countdown.seconds} />}
      </div>
    </div>
  );
}
