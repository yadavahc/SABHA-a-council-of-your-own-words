import Link from "next/link";

const base = "inline-flex items-center gap-2.5 rounded-full font-semibold transition duration-200";

export function GoldButton({ href, small, className = "", children }: {
  href: string; small?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${base} ${small ? "px-[18px] py-[9px] text-[13.5px]" : "px-6 py-[13px] text-[15px]"} bg-linear-to-b from-gold2 to-gold text-[#1a1006] shadow-[0_0_30px_#e8b64c55] hover:-translate-y-px hover:shadow-[0_0_50px_#e8b64c99] ${className}`}
    >
      {children}
    </Link>
  );
}

export function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={`${base} border border-line2 px-6 py-[13px] text-[15px] text-ink hover:border-gold hover:text-gold2`}>
      {children}
    </a>
  );
}
