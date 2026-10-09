"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppState } from "@/lib/types";

/** Live numbers from the running server, shown under the hero. */
export default function LiveStats() {
  const [s, setS] = useState<AppState | null | "error">(null);
  useEffect(() => {
    api.state().then(setS, () => setS("error"));
  }, []);

  if (s === "error") return null;
  const items: [boolean, string][] = s
    ? [
        [true, `${s.memories.length} memories in ${/cloud\.qdrant/.test(s.qdrant) ? "Qdrant Cloud" : "Qdrant"}`],
        [s.lyzr_online, `Lyzr ${s.lyzr_online ? "8 agents online" : "offline mode"}`],
        [s.omi.state === "live", `Omi Link ${s.omi.state}`],
        [true, `${s.decisions.length} decisions made`],
      ]
    : [[false, "connecting…"]];

  return (
    <div className="mt-[22px] flex flex-wrap justify-center gap-[18px] text-[12.5px] text-muted">
      {items.map(([ok, label]) => (
        <span key={label} className="inline-flex items-center gap-[7px]">
          <i className="status-dot size-[7px]!" data-state={ok ? "ok" : undefined} />
          {label}
        </span>
      ))}
    </div>
  );
}
