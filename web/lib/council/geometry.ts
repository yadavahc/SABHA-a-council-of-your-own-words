import { ADV_ORDER } from "../types";
import type { Geo } from "./store";

/** Fit the round table and five seats (a pentagon, Mentor at the top) into the stage; "you" sits at the bottom. */
export function computeGeo(W: number, H: number): Geo {
  const orb = Math.round(Math.max(44, Math.min(82, Math.min(W, H) * 0.13)));
  const size = Math.max(200, Math.min(W - orb - 190, H - orb - 50, 640));
  const R = size / 2;
  const cx = W / 2;
  const cy = orb / 2 + 10 + R + Math.max(0, (H - (size + orb + 50)) / 2);
  const pos: Geo["pos"] = {};
  ADV_ORDER.forEach((k, i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    pos[k] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  pos.you = { x: cx, y: cy + R };
  return { W, H, cx, cy, R, orb, pos };
}
