"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/** Slow golden motes drifting up behind everything. */
export default function Dust({ count = 34 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current!;
    const motes = Array.from({ length: count }, () => {
      const d = document.createElement("i");
      d.className = "absolute size-[3px] rounded-full bg-gold2 opacity-0";
      box.appendChild(d);
      return d;
    });
    const run = (d: HTMLElement) => {
      gsap.set(d, { x: Math.random() * innerWidth, y: innerHeight + 10, opacity: 0 });
      gsap.to(d, {
        y: -20, x: `+=${Math.random() * 120 - 60}`, opacity: Math.random() * 0.45 + 0.1,
        duration: 12 + Math.random() * 14, ease: "none", delay: Math.random() * 10, onComplete: () => run(d),
      });
    };
    motes.forEach(run);
    return () => {
      gsap.killTweensOf(motes);
      motes.forEach((d) => d.remove());
    };
  }, [count]);

  return <div ref={ref} className="pointer-events-none fixed inset-0 z-0 overflow-hidden" />;
}
