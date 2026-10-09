"use client";

import { useRef } from "react";
import gsap from "gsap";
import { council } from "@/lib/council/store";
import { unlockSpeech } from "@/lib/council/voice";

/** Full-screen gate: the click is the user gesture browsers require before speech synthesis may play. */
export default function Intro() {
  const ref = useRef<HTMLDivElement>(null);

  const enter = () => {
    unlockSpeech();
    gsap.to(ref.current, { opacity: 0, duration: 0.7, onComplete: () => council.set({ entered: true }) });
    gsap.from(".council .table", { scale: 0.7, opacity: 0, duration: 1.3, ease: "power3.out" });
    gsap.from([".council .left", ".council .right"], { opacity: 0, y: 14, duration: 0.9, delay: 0.2, stagger: 0.1 });
  };

  return (
    <div
      ref={ref}
      onClick={enter}
      className="fixed inset-0 z-80 flex cursor-pointer flex-col items-center justify-center bg-[radial-gradient(circle,#1a1008,#050302)]"
    >
      <div className="font-display text-[clamp(48px,9vw,96px)] font-bold tracking-[.16em] text-gold2 [text-shadow:0_0_50px_#e8b64c77]">
        SABHA
      </div>
      <div className="mt-1.5 text-xs uppercase tracking-[.4em] text-muted">a council of your own words</div>
      <button className="mt-[34px] rounded-full border border-gold px-[26px] py-3 text-sm tracking-[.06em] text-gold2">
        Enter the Sabha
      </button>
      <div className="mt-3 text-[11.5px] text-dim">click anywhere · enables the advisors&apos; voices</div>
    </div>
  );
}
