"use client";

import { council, toast, useCouncil } from "@/lib/council/store";

function UrlBox({ label, url }: { label: string; url?: string }) {
  const text = url || "tunnel starting…";
  return (
    <>
      <div className="mt-3 text-[11.5px] text-dim">{label}</div>
      <button
        onClick={() => url && navigator.clipboard.writeText(url).then(() => toast("Copied"))}
        className="mt-[5px] w-full cursor-pointer rounded-[9px] border border-line bg-[#0a0705] px-[11px] py-[9px] text-left font-mono text-xs break-all hover:border-gold"
      >
        {text}
      </button>
    </>
  );
}

/** The webhook URLs to paste into the Omi app's developer settings. */
export default function ConnectModal() {
  const open = useCouncil((s) => s.connectOpen);
  const w = useCouncil((s) => s.tunnel);
  const status = useCouncil((s) => s.tunnelStatus);
  if (!open) return null;
  const close = () => council.set({ connectOpen: false });

  return (
    <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-[3px]" onClick={close}>
      <div className="card w-[min(600px,94vw)] rounded-[18px] p-[22px]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-bold text-gold2">Connect your Omi app</div>
        <ol className="mt-2.5 ml-[18px] list-decimal text-[13px] leading-[1.8] text-muted">
          <li>Omi app → Settings → <b className="text-ink">Developer Mode</b> → Developer Settings</li>
          <li>Paste the URLs below (click to copy), then start talking</li>
          <li>The <b className="text-ink">Omi Link</b> pill turns green when your words arrive</li>
        </ol>
        <UrlBox label="Realtime transcript" url={w?.realtime} />
        <UrlBox label="Conversation events (memory created)" url={w?.memory_created} />
        <UrlBox label="Day summary (optional, nightly recap becomes memories)" url={w?.day_summary} />
        <div className="mt-2.5 text-[11.5px] text-dim">Audio bytes: leave empty.</div>
        <div className="mt-1.5 text-[11.5px] text-dim">
          {w ? `Public URL: ${w.app}` : `Tunnel: ${status || "off"}. Use the mic or demo replays as a backup.`}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="hbtn on" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}
