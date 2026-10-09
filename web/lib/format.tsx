import { Fragment } from "react";

/** Render text with `[REDACTED]` markers highlighted. React escapes everything else. */
export function Redacted({ text }: { text: string | null | undefined }) {
  const parts = String(text ?? "").split("[REDACTED]");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="redacted">[REDACTED]</span>}
          {p}
        </Fragment>
      ))}
    </>
  );
}

export const kindLabel = (k: string) => k.replace("_", " ");
export const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;

/** Escape for the few places that build DOM imperatively (GSAP-animated memory cards). */
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const escRedacted = (s: unknown) =>
  esc(s).replace(/\[REDACTED\]/g, '<span class="redacted">[REDACTED]</span>');
