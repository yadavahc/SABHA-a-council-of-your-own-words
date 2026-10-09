"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Mic } from "lucide-react";
import { Redacted, kindLabel } from "@/lib/format";
import { council, useCouncil, type FeedItem } from "@/lib/council/store";
import { omiLabel } from "./Header";

const TONE = { dim: "text-dim", bad: "text-[#fca5a5]", gold: "text-gold" };

function Row({ item }: { item: FeedItem }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.from(ref.current, { y: 10, opacity: 0, duration: 0.3 });
  }, []);

  if (item.t === "msg")
    return (
      <div ref={ref} className={`msg ${item.cmd ? "cmd" : ""}`}>
        {item.source && item.source !== "phone" && (
          <span className="mb-px block text-[9.5px] uppercase tracking-[.08em] text-dim">{item.source}</span>
        )}
        <Redacted text={item.text} />
      </div>
    );
  return (
    <div ref={ref} className={`-mt-0.5 mx-0.5 mb-0.5 flex items-center gap-1.5 self-end text-[10.5px] ${item.t === "note" ? TONE[item.tone] : "text-muted"}`}>
      {item.t === "mem" ? (
        <>
          <span className={`kind k-${item.kind}`}>{kindLabel(item.kind)}</span>
          saved to Qdrant{item.redacted && " · redacted"}
        </>
      ) : (
        item.text
      )}
    </div>
  );
}

/** Left column: a phone mock-up showing what Omi is hearing, live. */
export default function PhoneFeed() {
  const feed = useCouncil((s) => s.feed);
  const omi = useCouncil((s) => s.omi);
  const total = useCouncil((s) => s.memories.length);
  const sealed = useCouncil((s) => s.memories.filter((m) => m.sealed).length);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [feed]);

  return (
    <aside className="left flex min-h-0">
      <div className="phone">
        <div className="notch" />
        <div className="flex items-center justify-between border-b border-[#1f1710] px-1.5 pt-1 pb-2.5">
          <div className="text-[15px] font-bold tracking-[.02em]">
            Omi
            <small className="block text-[10.5px] font-medium uppercase tracking-[.06em] text-dim">live from your phone</small>
          </div>
          <div className="pill h-[26px]! text-[11px]!">
            <span className="status-dot" data-state={omi.state} />
            {omiLabel(omi.state, omi.source)}
          </div>
        </div>
        <div ref={box} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-1 py-3">
          {feed.length === 0 ? (
            <div className="m-auto px-3.5 text-center text-[12.5px] leading-[1.6] text-dim">
              <div className="mx-auto mb-2.5 grid size-[46px] place-items-center rounded-full border border-line2 text-gold">
                <Mic size={20} />
              </div>
              Talk in the Omi app.
              <br />
              Your words stream in here and become memories.
              <br />
              <br />
              Start with <b className="text-gold2">“Sabha…”</b> to give a command.
            </div>
          ) : (
            feed.map((f) => <Row key={f.id} item={f} />)
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[#1f1710] px-1.5 pt-2.5 pb-0.5 text-[11px] text-dim">
          <span>{total ? `${total} memories · ${sealed} sealed` : "— memories"}</span>
          <button className="text-[11.5px] text-gold hover:text-gold2" onClick={() => council.set({ connectOpen: true })}>
            Webhook URLs ›
          </button>
        </div>
      </div>
    </aside>
  );
}
