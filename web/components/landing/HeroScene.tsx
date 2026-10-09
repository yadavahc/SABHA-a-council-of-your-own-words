"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const COLORS = ["#F5A524", "#EF4444", "#A78BFA", "#2DD4BF", "#60A5FA"];

/** Bloom-lit 3D council: a golden table, five advisor orbs taking turns to "speak", reply arcs and dust. */
export default function HeroScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      canvas.style.background = "radial-gradient(circle at 50% 45%,#3a2410,#0b0806 70%)";
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0806");
    scene.fog = new THREE.FogExp2("#0b0806", 0.055);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    cam.position.set(0, 3.6, 8.6);

    scene.add(new THREE.AmbientLight("#ffe7b8", 0.25));
    const key = new THREE.PointLight("#e8b64c", 18, 14, 2);
    key.position.set(0, 3.2, 0);
    scene.add(key);

    // table
    const table = new THREE.Group();
    scene.add(table);
    table.add(new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.6, 0.16, 128),
      new THREE.MeshStandardMaterial({ color: "#2a1a0c", metalness: 0.35, roughness: 0.55 }),
    ));
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.53, 0.035, 16, 200),
      new THREE.MeshStandardMaterial({ color: "#e8b64c", emissive: "#e8b64c", emissiveIntensity: 1.1, metalness: 1, roughness: 0.3 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    table.add(rim);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.008, 8, 200),
      new THREE.MeshBasicMaterial({ color: "#e8b64c", transparent: true, opacity: 0.35 }),
    );
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.09;
    table.add(inner);

    // centre sigil
    const sigil = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 1),
      new THREE.MeshBasicMaterial({ color: "#f6d58a", wireframe: true, transparent: true, opacity: 0.75 }),
    );
    sigil.position.y = 0.75;
    scene.add(sigil);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 24), new THREE.MeshBasicMaterial({ color: "#fff1c9" }));
    core.position.y = 0.75;
    scene.add(core);

    // advisors
    const orbs = COLORS.map((c, i) => {
      const g = new THREE.Group();
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 48, 48),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 }),
      );
      g.add(m);
      g.add(new THREE.PointLight(c, 3, 3.5, 2));
      g.position.set(Math.cos(a) * 2.55, 0.62, Math.sin(a) * 2.55);
      scene.add(g);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.75, 0), g.position.clone()]),
        new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0 }),
      );
      scene.add(line);
      return { g, m, line, base: 0.62, phase: i * 1.3 };
    });

    // reply arcs between advisors
    const arcs: { mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];
    const arc = (i: number, j: number) => {
      const A = orbs[i].g.position, B = orbs[j].g.position;
      const mid = A.clone().add(B).multiplyScalar(0.5).multiplyScalar(0.35);
      mid.y = 1.6;
      const curve = new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone());
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.012, 6, false),
        new THREE.MeshBasicMaterial({ color: COLORS[i], transparent: true, opacity: 0 }),
      );
      scene.add(mesh);
      arcs.push({ mesh, t: 0 });
    };

    // dust
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 3 + Math.random() * 9, t = Math.random() * Math.PI * 2, y = (Math.random() - 0.3) * 7;
      pos.set([Math.cos(t) * r, y, Math.sin(t) * r], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dc = document.createElement("canvas");
    dc.width = dc.height = 32;
    const g2 = dc.getContext("2d")!, rg = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, "#fff");
    rg.addColorStop(0.4, "rgba(255,255,255,.5)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = rg;
    g2.fillRect(0, 0, 32, 32);
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(dc), color: "#f6d58a", size: 0.06, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(dust);

    // post
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.5, 0.22));

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      cam.aspect = w / h;
      cam.position.z = w < 700 ? 12.5 : 9.6;
      cam.updateProjectionMatrix();
    };
    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / innerWidth - 0.5;
      mouse.y = e.clientY / innerHeight - 0.5;
    };
    addEventListener("resize", resize);
    addEventListener("pointermove", onMove);
    resize();

    let speaker = 0, lastSwitch = 0, raf = 0;
    const clock = new THREE.Clock();
    const frame = () => {
      const t = clock.getElapsedTime();
      if (t - lastSwitch > 2.2) {
        lastSwitch = t;
        const prev = speaker;
        speaker = (speaker + 1 + Math.floor(Math.random() * 3)) % 5;
        if (Math.random() < 0.6) arc(prev, speaker);
      }
      orbs.forEach((o, i) => {
        const on = i === speaker;
        const mat = o.m.material as THREE.MeshStandardMaterial;
        o.g.position.y = o.base + Math.sin(t * 1.4 + o.phase) * 0.06;
        o.g.scale.setScalar(THREE.MathUtils.lerp(o.g.scale.x, on ? 1.35 : 0.92, 0.08));
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, on ? 2.1 + Math.sin(t * 14) * 0.4 : 0.6, 0.12);
        const lm = o.line.material as THREE.LineBasicMaterial;
        lm.opacity = THREE.MathUtils.lerp(lm.opacity, on ? 0.55 : 0, 0.08);
        const p = o.line.geometry.attributes.position as THREE.BufferAttribute;
        p.setXYZ(1, o.g.position.x, o.g.position.y, o.g.position.z);
        p.needsUpdate = true;
      });
      for (let k = arcs.length - 1; k >= 0; k--) {
        const a = arcs[k];
        a.t += 0.012;
        a.mesh.material.opacity = Math.sin(Math.min(a.t, 1) * Math.PI) * 0.8;
        if (a.t > 1) {
          scene.remove(a.mesh);
          a.mesh.geometry.dispose();
          a.mesh.material.dispose();
          arcs.splice(k, 1);
        }
      }
      sigil.rotation.y = t * 0.4;
      sigil.rotation.x = t * 0.25;
      core.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      table.rotation.y = t * 0.03;
      dust.rotation.y = t * 0.015;
      cam.position.x += (mouse.x * 1.6 - cam.position.x) * 0.04;
      cam.position.y += (3.6 - mouse.y * 1.2 - cam.position.y) * 0.04;
      cam.lookAt(0, -1.25, 0);
      composer.render();
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      composer.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 block h-full w-full" />;
}
