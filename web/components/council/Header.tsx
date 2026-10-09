"use client";

import Link from "next/link";
import { Link2, PanelRight, Star, Volume2, VolumeX } from "lucide-react";
import { council, useCouncil } from "@/lib/council/store";
import { stopSpeaking } from "@/lib/council/voice";

export function omiLabel(state: string, source?: string | null) {
  return state === "live" && source && source !== "phone" ? `live · ${source}` : state;
}

function qdrantLabel(mode: string) {
  if (!mode) return "…";
  return /server/.test(mode) ? (/cloud\.qdrant/.test(mode) ? "cloud" : "server") : "embedded";
}

export default function Header() {
  const omi = useCouncil((s) => s.omi);
  const lyzr = useCouncil((s) => s.lyzrOnline);
  const qdrant = useCouncil((s) => s.qdrant);
  const muted = useCouncil((s) => s.muted);

  const toggleMute = () => {
    if (!muted) stopSpeaking();
    council.set({ muted: !muted });
  };

  return (
    <header className="col-span-full flex items-center gap-3 border-b border-line bg-bg/80 px-[18px] backdrop-blur-md">
      <Link href="/" title="Back to the landing page" className="mr-1.5 flex items-baseline gap-2.5">
        <b className="font-display text-[22px] font-bold tracking-[.14em] text-gold2 [text-shadow:0_0_24px_#e8b64c55]">SABHA</b>
        <span className="text-[10px] uppercase tracking-[.22em] text-dim max-[700px]:hidden">Lyzr × Qdrant × Omi</span>
      </Link>
      <div className="pill" title="Omi Link: live while your phone's Omi app is streaming">
        <span className="status-dot" data-state={omi.state} />
        Omi Link <b>{omiLabel(omi.state, omi.source)}</b>
      </div>
      <div className="pill max-[1100px]:hidden!">
        <span className="status-dot" data-state={lyzr == null ? undefined : lyzr ? "ok" : "warn"} />
        Lyzr <b>{lyzr == null ? "…" : lyzr ? "online" : "offline mode"}</b>
      </div>
      <div className="pill max-[1100px]:hidden!">
        <span className="status-dot" data-state="ok" />
        Qdrant <b>{qdrantLabel(qdrant)}</b>
      </div>
      {omi.off_record && (
        <div className="pill border-[#ef444488]! text-[#fca5a5]!">
          <span className="status-dot" data-state="bad" />
          Off the record
        </div>
      )}
      <div className="flex-1" />
      <button className="hbtn" onClick={() => council.set({ constellationOpen: true })}>
        <Star size={16} />
        <span className="max-[700px]:hidden">Constellation</span>
      </button>
      <button className="hbtn" onClick={() => council.set({ connectOpen: true })}>
        <Link2 size={16} />
        <span className="max-[700px]:hidden">Connect Omi</span>
      </button>
      <button className="hbtn icon" onClick={toggleMute} title={muted ? "Unmute voices" : "Mute voices"}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button
        className="hbtn icon hidden! max-[1100px]:inline-flex!"
        title="Panels"
        onClick={() => council.set((s) => ({ panelOpen: !s.panelOpen }))}
      >
        <PanelRight size={16} />
      </button>
    </header>
  );
}
