"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ADV_ORDER, type Advisor } from "@/lib/types";
import { pct } from "@/lib/format";
import { computeGeo } from "@/lib/council/geometry";
import { attachStage } from "@/lib/council/stage";
import { council, optColor, useCouncil, type Geo } from "@/lib/council/store";

function Seat({ id, advisor, geo, index }: { id: string; advisor?: Advisor; geo: Geo; index: number }) {
  const speaking = useCouncil((s) => s.speaking === id);
  const dim = useCouncil((s) => !!s.focus && s.focus !== id);
  const stance = useCouncil((s) => (advisor ? s.stances[advisor.key] : undefined));
  const options = useCouncil((s) => s.options);
  const orb = useRef<HTMLDivElement>(null);
  const weight = advisor?.weight;

  // vote power is visible: heavier advisors get bigger orbs
  useEffect(() => {
    if (weight != null)
      gsap.to(orb.current, { scale: Math.max(0.78, Math.min(1.3, 0.82 + 0.18 * weight)), duration: 1.2, ease: "elastic.out(1,.5)" });
  }, [weight]);

  const p = geo.pos[id];
  return (
    <div
      data-seat={id}
      className={`seat ${advisor ? "" : "you"} ${speaking ? "speaking" : ""} ${dim ? "dim" : ""}`}
      style={{ left: p.x, top: p.y + (advisor ? 14 : 0), animationDelay: `${index * 0.1}s`, "--c": advisor?.color } as React.CSSProperties}
    >
      <div className="orbbox">
        <div ref={orb} className="orb" title={advisor?.title}>
          <div className="halo" />
        </div>
      </div>
      <div className="nm">{advisor ? advisor.name : "YOU"}</div>
      {advisor && (
        <div className="mt-0.5 flex items-center gap-[5px] whitespace-nowrap text-[10.5px] text-muted">
          {stance && <span className="stance" style={{ background: optColor(stance, options) }}>{stance}</span>}
          <span title="vote weight">⚖ {advisor.weight.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function Core({ geo }: { geo: Geo }) {
  const core = useCouncil((s) => s.core);
  const bubble = useCouncil((s) => s.bubble);
  const ring = useCouncil((s) => s.ring);
  const options = useCouncil((s) => s.options);
  const R = geo.R, ringSize = Math.min(150, R * 0.9);

  return (
    <div
      className="pointer-events-none absolute z-[8] -translate-x-1/2 -translate-y-1/2 text-center"
      style={{ left: geo.cx, top: geo.cy, width: Math.min(R * 1.42, 470), fontSize: R < 170 ? 12.5 : R < 220 ? 13.5 : 14.5 }}
    >
      <div className={`leading-[1.6] text-muted ${core === "idle" ? "" : "hidden"}`}>
        <div className="mb-1.5 font-display text-[1.25em] text-ink">Bring the council a decision</div>
        Say <kbd>Sabha, should I … or …?</kbd>
        <br />
        into Omi, the mic, or the box below.
      </div>

      <div
        data-bubble
        className={`bubble ${bubble.done ? "done" : ""} ${core === "bubble" ? "" : "hidden"}`}
        style={{ "--c": bubble.color, maxHeight: R * 1.3 } as React.CSSProperties}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="whitespace-nowrap font-display text-[11px] font-bold tracking-[.16em]" style={{ color: "var(--c)" }}>
            {bubble.label}
            {bubble.round && <span className="ml-1.5 font-sans text-[10px] uppercase tracking-[.1em] text-dim">round {bubble.round}</span>}
          </span>
          {bubble.vote && (
            <span className="stance inline-block" style={{ background: optColor(bubble.vote, options) }}>
              {bubble.vote} · {pct(bubble.confidence)}
            </span>
          )}
        </div>
        <div data-bubble-text className="text leading-[1.55]" />
      </div>

      <div className={`relative mx-auto ${core === "ring" ? "" : "hidden"}`} style={{ width: ringSize, height: ringSize }}>
        <svg viewBox="0 0 150 150" className="size-full -rotate-90">
          <circle cx="75" cy="75" r="60" fill="none" stroke="#2a1d10" strokeWidth="13" />
          <g data-ring />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-lg font-bold">{ring.lead}</div>
          <div className="text-[11px] text-muted">{ring.pct}</div>
        </div>
      </div>
    </div>
  );
}

/** The round table: seats laid out around it, the speaker's bubble or the vote ring in the middle. */
export default function Stage() {
  const geo = useCouncil((s) => s.geo);
  const advisors = useCouncil((s) => s.advisors);
  const scanning = useCouncil((s) => s.scanning);
  const root = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const links = useRef<SVGSVGElement>(null);
  const fx = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight) council.set({ geo: computeGeo(el.clientWidth, el.clientHeight) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = !!geo;
  useEffect(() => {
    if (!ready) return;
    const el = root.current!;
    attachStage({
      root: el, table: table.current!, links: links.current!, fx: fx.current!,
      bubble: el.querySelector("[data-bubble]")!, bubbleText: el.querySelector("[data-bubble-text]")!,
      ringSegs: el.querySelector("[data-ring]")!,
    });
    return () => attachStage(null);
  }, [ready]);

  const size = geo ? geo.R * 2 : 0;
  return (
    <div ref={root} className="relative min-h-0 flex-1" style={{ "--orb": `${geo?.orb ?? 60}px` } as React.CSSProperties}>
      {geo && (
        <>
          <div ref={table} className={`table ${scanning ? "scanning" : ""}`}
            style={{ width: size, height: size, left: geo.cx - geo.R, top: geo.cy - geo.R }}>
            <div className="scan" />
          </div>
          <svg ref={links} className="pointer-events-none absolute inset-0 z-[3] size-full overflow-visible" />
          {ADV_ORDER.map((k, i) => advisors[k] && <Seat key={k} id={k} advisor={advisors[k]} geo={geo} index={i + 1} />)}
          <Seat id="you" geo={geo} index={6} />
          <Core geo={geo} />
          <div ref={fx} className="pointer-events-none absolute inset-0" />
        </>
      )}
    </div>
  );
}
