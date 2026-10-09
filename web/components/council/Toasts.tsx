"use client";

import { useCouncil } from "@/lib/council/store";

export default function Toasts() {
  const toasts = useCouncil((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-[68px] left-1/2 z-60 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast max-w-[460px] rounded-full border border-line2 bg-[#1d140bf5] px-3.5 py-2 text-[12.5px] shadow-[0_8px_24px_#000a]"
          style={t.color ? { borderColor: t.color } : undefined}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
