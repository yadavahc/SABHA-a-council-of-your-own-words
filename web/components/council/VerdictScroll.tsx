"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { council, useCouncil } from "@/lib/council/store";

/** The verdict unrolls as a parchment scroll. */
export default function VerdictScroll() {
  const open = useCouncil((s) => s.verdictOpen);
  const v = useCouncil((s) => s.verdict);
  const writeback = useCouncil((s) => s.writeback);
  const writebackOn = useCouncil((s) => s.omiWriteback);
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const el = root.current;
    const parch = el.querySelector<HTMLElement>(".parch")!;
    const lower = el.querySelectorAll(".roller")[1];
    gsap.set(el, { opacity: 1 });
    gsap.set(parch, { clipPath: "inset(0 0 100% 0)" });
    gsap.fromTo(lower, { y: -parch.offsetHeight }, { y: 0, duration: 1.4, ease: "power2.inOut" });
    gsap.to(parch, { clipPath: "inset(0 0 0% 0)", duration: 1.4, ease: "power2.inOut" });
    gsap.from(el.querySelector(".scroll"), { scale: 0.88, opacity: 0, duration: 0.5 });
  }, [open, v]);

  if (!open || !v) return null;

  const close = () => gsap.to(root.current, { opacity: 0, duration: 0.3, onComplete: () => council.set({ verdictOpen: false }) });
  const omiLine = writeback
    ? writeback.ok ? "✅ Saved to your Omi app: verdict memory + action item" : `⚠ Omi write-back: ${writeback.detail}`
    : writebackOn ? "Sending to your Omi app…" : "Omi write-back is off (no OMI_API_KEY).";
  const totals = Object.entries(v.totals).map(([k, x]) => `${k} ${x.toFixed(2)}`).join("  vs  ");

  return (
    <div ref={root} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[3px]">
      <div className="scroll relative w-[min(560px,92vw)]">
        <div className="roller" />
        <div className="parch">
          <h2 className="text-center font-display text-xs tracking-[.32em] text-[#7a4e10]">VERDICT OF THE SABHA</h2>
          <div className="mt-1.5 mb-0.5 text-center font-display text-[28px] leading-tight font-bold text-[#3a220a]">
            {v.verdict || v.winner}
          </div>
          <div className="text-center text-xs text-[#7a4e10]">
            {v.winner} · {Math.round(v.confidence * 100)}% of the weighted vote · {totals}
          </div>
          <p className="my-2.5 text-sm leading-[1.6]">{v.summary}</p>
          <div className="rounded-r-md border-l-[3px] border-[#b07a1c] bg-gold/20 px-2.5 py-2 text-[13px]">
            <b>Next step →</b> {v.action_item}
          </div>
          {v.dissent && <p className="my-2.5 text-[12.5px] text-[#5a3a12] italic">Dissent: {v.dissent}</p>}
          {v.tipping && (
            <div className="mt-2.5 rounded-md border border-dashed border-[#b07a1c] px-2.5 py-2 text-[12.5px] text-[#4a2e0c]">
              <b className="mr-1.5 text-[10.5px] uppercase tracking-[.08em] text-[#7a4e10]">Tipping point · {v.tipping.label}</b>
              {v.tipping.text}
            </div>
          )}
          <div className="mt-2 text-xs text-[#5a3a12]">{omiLine}</div>
          <div className="mt-3.5 text-center">
            <button className="rounded-lg bg-parch px-4 py-1.5 text-[12.5px] text-[#f6e7c8]" onClick={close}>
              Close
            </button>
          </div>
        </div>
        <div className="roller" />
      </div>
    </div>
  );
}
