"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV_LINKS } from "@/lib/content";
import { GoldButton } from "./GoldButton";

export default function Nav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(scrollY > 40);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-20 flex items-center gap-7 border-b px-4 py-3.5 transition-colors duration-300 sm:px-8 sm:py-4 ${
        solid ? "border-line bg-bg/90 backdrop-blur-md" : "border-transparent"
      }`}
    >
      <Link href="/" className="font-display text-[21px] font-bold tracking-[.16em] text-gold2">
        SABHA
      </Link>
      <div className="hidden gap-6 text-sm text-muted md:flex">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="hover:text-gold2">
            {l.label}
          </a>
        ))}
      </div>
      <div className="flex-1" />
      <GoldButton href="/council" small>
        Open the council →
      </GoldButton>
    </nav>
  );
}
