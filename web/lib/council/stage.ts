/**
 * The council table's transient effects: speech bubbles, beams, reply arcs, flying memory cards, votes and the
 * vote ring. These are short-lived GSAP animations on DOM nodes, so they live outside React; persistent state
 * (who sits where, stances, which panel is open) stays in the store and is rendered by components.
 */
import gsap from "gsap";
import { ADV_ORDER, type AdvisorKey, type MemoryCard } from "../types";
import { escRedacted, esc, kindLabel } from "../format";
import { council, optColor, OPT_COLORS, restCore, whoInfo } from "./store";
import { estimate, sleep, speakText, typeText } from "./voice";

export interface StageEls {
  root: HTMLDivElement;
  table: HTMLDivElement;
  links: SVGSVGElement;
  fx: HTMLDivElement;
  bubble: HTMLDivElement;
  bubbleText: HTMLDivElement;
  ringSegs: SVGGElement;
}

const SVG = "http://www.w3.org/2000/svg";
const TABLE_SHADOW = "0 0 0 2px #6b4a1f,0 0 0 8px #160f08,0 0 0 10px #8a642999";

let els: StageEls | null = null;
export const attachStage = (e: StageEls | null) => void (els = e);

const geo = () => council.get().geo;
const isAdvisor = (who: string): who is AdvisorKey => (ADV_ORDER as string[]).includes(who);
export const seatEl = (who: string, sel = "") => els?.root.querySelector<HTMLElement>(`[data-seat="${who}"] ${sel}`.trim()) ?? null;

export interface SpeakOpts {
  round?: number;
  vote?: string;
  confidence?: number;
  memories?: MemoryCard[];
  replies_to?: AdvisorKey | null;
}

function beam(who: string, color: string) {
  const g = geo(), p = g?.pos[who];
  if (!els || !g || !p) return null;
  const l = document.createElementNS(SVG, "line");
  Object.entries({ x1: g.cx, y1: g.cy, x2: p.x, y2: p.y, "stroke-width": 2, "stroke-linecap": "round" })
    .forEach(([k, v]) => l.setAttribute(k, String(v)));
  Object.assign(l.style, { stroke: color, opacity: "0", filter: `drop-shadow(0 0 6px ${color})` });
  els.links.appendChild(l);
  gsap.to(l, { opacity: 0.55, duration: 0.4 });
  return l;
}

/** One speaker's turn: bubble + typing + voice + beam + memory cards. Resolves when they've finished. */
export async function speakAs(who: string, text: string, opts: SpeakOpts = {}) {
  if (!els) return;
  const { bubble, bubbleText, table } = els;
  const info = whoInfo(who), adv = isAdvisor(who), seat = seatEl(who);

  council.set({
    bubble: { label: (info.title || info.name).toUpperCase(), color: info.color, round: opts.round, vote: opts.vote,
      confidence: opts.confidence, done: false },
    core: "bubble", focus: adv ? who : null, speaking: seat ? who : null,
  });
  bubbleText.textContent = "";
  gsap.fromTo(bubble, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.3 });
  if (!adv)
    gsap.fromTo(table, { boxShadow: `${TABLE_SHADOW},0 0 110px ${info.color},inset 0 0 80px #000c` },
      { boxShadow: `${TABLE_SHADOW},0 0 60px #e8b64c40,inset 0 0 80px #000c`, duration: 3 });

  const line = adv ? beam(who, info.color) : null;
  const halo = seat?.querySelector(".halo");
  const breathe = halo ? gsap.to(halo, { opacity: 0.9, scale: 1.22, duration: 0.6, yoyo: true, repeat: -1 }) : null;
  (opts.memories ?? []).forEach((m, i) => setTimeout(() => memCard(m, adv ? who : null), 400 + i * 650));
  if (opts.replies_to) drawLink(who, opts.replies_to, info.color);

  const orb = seat?.querySelector(".orb");
  const onWord = () => orb && gsap.fromTo(orb, { filter: "brightness(1.6)" }, { filter: "brightness(1)", duration: 0.3 });
  await Promise.all([typeText(bubbleText, text, estimate(text) * 0.85), speakText(text, who, onWord)]);

  council.set((s) => ({ bubble: { ...s.bubble, done: true }, speaking: null }));
  if (breathe && halo) {
    breathe.kill();
    gsap.to(halo, { opacity: 0, scale: 1, duration: 0.3 });
  }
  if (opts.vote && adv) setStance(who, opts.vote);
  await sleep(450);
  if (line) gsap.to(line, { opacity: 0, duration: 0.4, onComplete: () => line.remove() });
  await gsap.to(bubble, { opacity: 0, duration: 0.25 });
  restCore();
}

export const setStance = (who: AdvisorKey, option: string) =>
  council.set((s) => ({ stances: { ...s.stances, [who]: option } }));

/** A memory card flies out of the speaker's seat (or the table centre), lingers, then floats away. */
export function memCard(m: MemoryCard, who: string | null) {
  const g = geo();
  if (!els || !g) return;
  const src = who && g.pos[who] ? g.pos[who] : { x: g.cx, y: g.cy - g.R * 0.3 };
  const c = document.createElement("div");
  c.className = "memcard" + (m.sealed ? " sealed" : "");
  c.innerHTML = m.sealed
    ? `<b>🔒 private memory · ${esc(m.date)}</b>used for reasoning, never quoted`
    : `<b>${esc(kindLabel(String(m.kind)))} · ${esc(m.date)}</b>“${escRedacted(m.text)}”`;
  els.fx.appendChild(c);
  const dx = src.x - g.cx, dy = src.y - g.cy, len = Math.hypot(dx, dy) || 1;
  let tx = src.x + (dx / len) * g.orb * 1.1 - 95 + (Math.random() * 30 - 15);
  let ty = src.y + (dy / len) * g.orb * 0.9 - 40 - Math.random() * 30;
  if (!who) ty = g.cy - g.R - 10;
  tx = Math.max(4, Math.min(g.W - 194, tx));
  ty = Math.max(4, Math.min(g.H - 90, ty));
  gsap.fromTo(c, { left: src.x - 95, top: src.y - 20, opacity: 0, scale: 0.6, rotation: Math.random() * 8 - 4 },
    { left: tx, top: ty, opacity: 1, scale: 1, duration: 1, ease: "power3.out" });
  gsap.to(c, { opacity: 0, y: -30, delay: 4.4, duration: 0.9, onComplete: () => c.remove() });
}

/** A glowing arc from one advisor to the one they're answering. */
export function drawLink(a: string, b: string, color: string) {
  const g = geo(), A = g?.pos[a], B = g?.pos[b];
  if (!els || !g || !A || !B) return;
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const qx = mx + (g.cx - mx) * 0.55, qy = my + (g.cy - my) * 0.55;
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", `M${A.x},${A.y} Q${qx},${qy} ${B.x},${B.y}`);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke-width", "3");
  p.setAttribute("stroke-linecap", "round");
  Object.assign(p.style, { stroke: color, filter: `drop-shadow(0 0 6px ${color})` });
  els.links.appendChild(p);
  const L = p.getTotalLength();
  p.style.strokeDasharray = String(L);
  p.style.strokeDashoffset = String(L);
  gsap.to(p, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" });

  const dot = document.createElementNS(SVG, "circle");
  dot.setAttribute("r", "5");
  dot.style.fill = color;
  els.links.appendChild(dot);
  const o = { t: 0 };
  gsap.to(o, {
    t: 1, duration: 1.1, ease: "power2.inOut",
    onUpdate: () => {
      const pt = p.getPointAtLength(o.t * L);
      dot.setAttribute("cx", String(pt.x));
      dot.setAttribute("cy", String(pt.y));
    },
    onComplete: () => dot.remove(),
  });
  const target = seatEl(b, ".orbbox");
  if (target) gsap.fromTo(target, { scale: 1.2 }, { scale: 1, duration: 0.6, delay: 1 });
  gsap.to(p, { opacity: 0.15, delay: 5, duration: 1.5 });
}

/** Weighted vote ring. Before the verdict, segments fill against the expected total so it grows vote by vote. */
export function drawRing(totals: Record<string, number>, final = false) {
  if (!els) return;
  const s = council.get();
  const C = 2 * Math.PI * 60;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const expected = ADV_ORDER.reduce((a, k) => a + (s.advisors[k]?.weight ?? 1) * 0.75, 0);
  let off = 0;
  els.ringSegs.innerHTML = "";
  s.options.forEach((o, i) => {
    const len = Math.min(1, (totals[o] ?? 0) / (final ? sum : Math.max(sum, expected))) * C;
    const c = document.createElementNS(SVG, "circle");
    Object.entries({ cx: 75, cy: 75, r: 60, fill: "none", "stroke-width": 13 }).forEach(([k, v]) => c.setAttribute(k, String(v)));
    c.style.stroke = OPT_COLORS[i];
    c.setAttribute("stroke-dasharray", `0 ${C}`);
    c.setAttribute("stroke-dashoffset", String(-off));
    els!.ringSegs.appendChild(c);
    gsap.to(c, { attr: { "stroke-dasharray": `${len} ${C}` }, duration: 0.8, ease: "power2.out" });
    off += len;
  });
  const lead = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  council.set({
    ringShown: true,
    ring: lead && lead[1] ? { lead: lead[0], pct: `${Math.round((lead[1] / sum) * 100)}% of vote` } : { lead: "—", pct: "votes" },
    core: s.core === "bubble" ? "bubble" : "ring",
  });
}

export function clearRing() {
  if (els) els.ringSegs.innerHTML = "";
}

export function clearLinks() {
  if (els) els.links.innerHTML = "";
}

/** A coloured token flies from the advisor's seat into the centre of the table. */
export function voteFly(who: string, option: string) {
  const g = geo(), p = g?.pos[who];
  if (!els || !g || !p) return;
  const d = document.createElement("div");
  const c = optColor(option);
  d.style.cssText = `position:absolute;width:14px;height:14px;border-radius:50%;background:${c};box-shadow:0 0 14px ${c};z-index:12`;
  els.fx.appendChild(d);
  gsap.fromTo(d, { left: p.x - 7, top: p.y - 7 },
    { left: g.cx - 7, top: g.cy - 7, duration: 0.7, ease: "power2.in", onComplete: () => d.remove() });
}

export function pulse(who: string, sel: string, from: gsap.TweenVars, to: gsap.TweenVars) {
  const el = seatEl(who, sel);
  if (el) gsap.fromTo(el, from, to);
}
