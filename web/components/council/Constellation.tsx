"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { escRedacted, kindLabel } from "@/lib/format";
import { council } from "@/lib/council/store";
import type { ConstellationPoint } from "@/lib/types";
import { SearchBox } from "./SidePanel";

const KIND_COLORS: Record<string, string> = {
  goal: "#a78bfa", value: "#60a5fa", fear: "#f87171", plan: "#2dd4bf", fact: "#d6c7a8", past_decision: "#fbbf24",
};

interface Star { sprite: THREE.Sprite; m: ConstellationPoint; base: number; hl: boolean; used: boolean }

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,.85)");
  r.addColorStop(0.6, "rgba(255,255,255,.18)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Qdrant memory vectors (384-d) projected to 3D by PCA on the server. Similar meanings sit close together. */
export default function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const stars = useRef<Star[]>([]);
  const [q, setQ] = useState("");
  const [footer, setFooter] = useState("drag to orbit · scroll to zoom");
  const close = () => council.set({ constellationOpen: false });

  useEffect(() => {
    const canvas = canvasRef.current!, tip = tipRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 6.2);
    const ctrl = new OrbitControls(cam, canvas);
    Object.assign(ctrl, { enableDamping: true, autoRotate: true, autoRotateSpeed: 0.6, minDistance: 2.5, maxDistance: 12 });
    const tex = glowTexture();

    // distant background stars
    const N = 900, p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 6 + Math.random() * 14, t = Math.random() * 6.28, u = Math.acos(2 * Math.random() - 1);
      p.set([r * Math.sin(u) * Math.cos(t), r * Math.cos(u), r * Math.sin(u) * Math.sin(t)], i * 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: "#f6d58a", size: 0.03, transparent: true, opacity: 0.45 })));

    const size = () => {
      renderer.setSize(innerWidth, innerHeight, false);
      cam.aspect = innerWidth / innerHeight;
      cam.updateProjectionMatrix();
    };
    size();
    addEventListener("resize", size);

    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(-9, -9);
    let px = 0, py = 0;
    const onMove = (e: PointerEvent) => {
      ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      px = e.clientX;
      py = e.clientY;
    };
    canvas.addEventListener("pointermove", onMove);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);

    const halos: THREE.Sprite[] = [];
    let disposed = false;
    api.constellation().then((data) => {
      if (disposed) return;
      const used = council.get().used;
      const group = new THREE.Group();
      scene.add(group);
      const P = data.map((m) => new THREE.Vector3(m.pos[0] * 2.4, m.pos[1] * 2.4, m.pos[2] * 2.4));

      // join each star to its two nearest neighbours
      const lp: number[] = [];
      P.forEach((a, i) => {
        P.map((b, j) => [a.distanceTo(b), j] as const).filter(([, j]) => j !== i).sort((x, y) => x[0] - y[0]).slice(0, 2)
          .forEach(([, j]) => { if (j > i) lp.push(a.x, a.y, a.z, P[j].x, P[j].y, P[j].z); });
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
      group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#e8b64c", transparent: true, opacity: 0.14 })));

      stars.current = data.map((m, i) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, color: m.sealed ? "#e8b64c" : KIND_COLORS[m.kind] ?? "#ffffff", transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: m.sealed ? 0.55 : 0.95,
        }));
        const base = m.sealed ? 0.16 : 0.22;
        sprite.position.copy(P[i]);
        sprite.scale.setScalar(base);
        group.add(sprite);
        if (used.has(m.id)) {
          const h = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
          }));
          h.position.copy(P[i]);
          h.scale.setScalar(0.62);
          group.add(h);
          halos.push(h);
        }
        return { sprite, m, base, hl: false, used: used.has(m.id) };
      });
      const sealed = data.filter((m) => m.sealed).length;
      const cited = stars.current.filter((s) => s.used).length;
      setFooter(`${data.length} memories · ${sealed} sealed · ${cited} cited in the current debate (white halos) · drag to orbit, scroll to zoom`);
    });

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctrl.update();
      const t = performance.now() / 1000;
      for (const s of stars.current)
        s.sprite.scale.setScalar(s.base * (1 + (s.hl ? 0.9 + Math.sin(t * 5) * 0.25 : 0) + (s.used ? 0.35 + Math.sin(t * 3) * 0.12 : 0)));
      for (const h of halos) h.material.opacity = 0.3 + Math.sin(t * 3) * 0.2;

      ray.setFromCamera(ptr, cam);
      const hit = ray.intersectObjects(stars.current.map((s) => s.sprite))[0];
      const star = hit && stars.current.find((s) => s.sprite === hit.object);
      if (star) {
        const m = star.m;
        tip.style.display = "block";
        tip.style.left = `${px + 14}px`;
        tip.style.top = `${py + 14}px`;
        tip.innerHTML =
          `<div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px;color:${m.sealed ? "#e8b64c" : KIND_COLORS[m.kind]}">` +
          `${m.sealed ? "🔒 sealed" : kindLabel(m.kind)} · ${m.date}</div>` +
          (m.sealed ? '<i style="color:var(--color-muted)">Private: used for reasoning, never shown.</i>' : escRedacted(m.text));
      } else tip.style.display = "none";
      renderer.render(scene, cam);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointermove", onMove);
      ctrl.dispose();
      scene.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
        ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.();
      });
      tex.dispose();
      renderer.dispose();
      stars.current = [];
    };
  }, []);

  // semantic search: matching stars pulse
  useEffect(() => {
    const query = q.trim();
    stars.current.forEach((s) => (s.hl = false));
    if (!query) return;
    const t = setTimeout(async () => {
      const ids = new Set((await api.memories(query, 6)).map((r) => r.id));
      stars.current.forEach((s) => (s.hl = ids.has(s.m.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="fixed inset-0 z-48 bg-[radial-gradient(ellipse_at_50%_50%,#170f08,#050302_75%)]">
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
      <div className="absolute inset-x-0 top-0 z-[2] flex flex-wrap items-center gap-3.5 px-5 py-4">
        <div>
          <div className="font-display text-lg font-bold tracking-[.08em] text-gold2">Memory Constellation</div>
          <div className="text-xs text-dim">
            Your Qdrant memory vectors (384-d bge-small) projected to 3D. Nearby stars have similar meaning.
          </div>
        </div>
        <div className="flex-1" />
        <SearchBox value={q} onChange={setQ} placeholder="Search, and matches light up…" className="w-[260px]" />
        <button className="hbtn icon" onClick={close} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
      <div className="absolute top-[74px] left-5 z-[2] flex flex-wrap gap-3 text-[11.5px] text-muted">
        {Object.entries(KIND_COLORS).map(([k, c]) => (
          <span key={k}>
            <i className="mr-[5px] inline-block size-2 rounded-full" style={{ background: c }} />
            {kindLabel(k)}
          </span>
        ))}
        <span>
          <i className="mr-[5px] inline-block size-2 rounded-full border border-dashed border-gold" />
          sealed
        </span>
      </div>
      <div ref={tipRef} className="pointer-events-none absolute z-[3] hidden max-w-[280px] rounded-[10px] border border-line2 bg-[#140e09f2] px-[11px] py-[9px] text-xs" />
      <div className="absolute bottom-[18px] left-1/2 z-[2] -translate-x-1/2 text-center text-xs text-dim">{footer}</div>
    </div>
  );
}
