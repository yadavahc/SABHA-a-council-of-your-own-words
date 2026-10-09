"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/** Scroll-in animation for every `.reveal` element, plus the hero copy intro. */
export default function Reveals() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) =>
        gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } }),
      );
      gsap.from(".hero-copy > *", { opacity: 0, y: 24, duration: 1, stagger: 0.12, delay: 0.3, ease: "power3.out" });
    });
    return () => ctx.revert();
  }, []);
  return null;
}
