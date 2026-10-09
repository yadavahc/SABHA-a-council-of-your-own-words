import dynamic from "next/dynamic";
import Nav from "@/components/landing/Nav";
import LiveStats from "@/components/landing/LiveStats";
import Reveals from "@/components/landing/Reveals";
import { GhostButton, GoldButton } from "@/components/landing/GoldButton";
import { ADVISORS, FEATURES, PRIVACY, STEPS, SUPPORT } from "@/lib/content";

const HeroScene = dynamic(() => import("@/components/landing/HeroScene"));

const card = "card rounded-[20px]";

function Section({ id, kicker, title, lead, children }: {
  id?: string; kicker?: string; title: string; lead?: string; children?: React.ReactNode;
}) {
  return (
    <section id={id} className="relative mx-auto max-w-[1180px] scroll-mt-16 px-6 py-[110px]">
      {kicker && <div className="reveal text-center text-xs uppercase tracking-[.28em] text-gold">{kicker}</div>}
      <h2 className="reveal mt-2.5 mb-3.5 text-center font-display text-[clamp(30px,4vw,46px)] leading-[1.15] font-semibold">
        {title}
      </h2>
      {lead && <p className="reveal mx-auto mb-14 max-w-[680px] text-center text-muted">{lead}</p>}
      {children}
    </section>
  );
}

export default function Landing() {
  return (
    <main className="overflow-x-hidden scroll-smooth leading-[1.6]">
      <Reveals />
      <Nav />

      <header className="relative h-screen min-h-[620px] overflow-hidden after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[30%] after:bg-linear-to-b after:from-transparent after:to-bg">
        <HeroScene />
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-[2] h-[62%] w-full max-w-[1100px] -translate-x-1/2 bg-[radial-gradient(ellipse_50%_60%_at_50%_70%,#0b0806ee_0%,#0b0806aa_45%,transparent_75%)]" />
        <div className="hero-copy pointer-events-none absolute inset-x-0 bottom-[7vh] z-[5] px-5 text-center [&>*]:pointer-events-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-bg/60 px-3.5 py-1.5 text-xs uppercase tracking-[.24em] text-gold">
            Lyzr × Qdrant × Omi · Multi-agent
          </div>
          <h1 className="text-gilded mt-[18px] font-display text-[clamp(52px,8.5vw,116px)] leading-none font-bold tracking-[.14em]">
            SABHA
          </h1>
          <p className="mx-auto mt-3.5 max-w-[680px] text-[clamp(17px,2vw,22px)]">
            A council of AI advisors that debates your life decisions, <b className="text-gold2">in your own words</b>.
          </p>
          <p className="mx-auto mt-2 max-w-[620px] text-[15px] text-muted">
            Talk to Omi for weeks. Qdrant remembers. When a big decision comes, five Lyzr agents argue it out using your own
            past words, vote, and send the verdict back to your phone.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <GoldButton href="/council">Enter the council →</GoldButton>
            <GhostButton href="#how">How it works</GhostButton>
          </div>
          <LiveStats />
        </div>
      </header>

      <Section id="how" kicker="How it works" title="From a passing thought to a verdict"
        lead="No forms, no journaling. You just talk. Sabha turns weeks of your own words into a council that knows what you actually care about.">
        <div className="relative grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4 lg:before:absolute lg:before:inset-x-[12%] lg:before:top-11 lg:before:h-px lg:before:bg-linear-to-r lg:before:from-transparent lg:before:via-gold/40 lg:before:to-transparent">
          {STEPS.map(({ icon: Icon, title, text, by }) => (
            <div key={title} className="reveal">
              <div className="relative z-[1] mb-[18px] grid size-14 place-items-center rounded-full border border-gold/40 bg-[#1a120a] text-gold2 shadow-[0_0_24px_#e8b64c22]">
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <h3 className="mb-1.5 text-lg font-semibold">{title}</h3>
              <p className="text-[14.5px] text-muted">{text}</p>
              <span className="mt-3 inline-block text-[11px] uppercase tracking-[.14em] text-gold">{by}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="council" kicker="The council" title="Five voices. One of them is you."
        lead="Each advisor is its own Lyzr agent with its own persona and its own slice of your memories. Every claim must cite one of your memories, or be marked a guess.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ADVISORS.map((a) => (
            <div key={a.name} className={`reveal ${card} px-[18px] py-7 text-center`} style={{ "--c": a.color } as React.CSSProperties}>
              <div className="orb-sphere mx-auto mb-4 size-16 rounded-full" />
              <h3 className="mb-1.5 font-display text-base tracking-[.1em]">{a.name}</h3>
              <p className="text-[13.5px] text-muted">{a.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORT.map(({ icon: Icon, color, title, text }) => (
            <div key={title} className={`reveal ${card} flex items-start gap-3.5 p-5`}>
              <Icon size={20} strokeWidth={1.8} color={color} className="shrink-0" />
              <div>
                <b className="mb-0.5 block">{title}</b>
                <span className="text-[13.5px] text-muted">{text}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <section className="mx-auto max-w-[1180px] px-6 py-[110px]">
        <div className="reveal mx-auto max-w-[820px] text-center">
          <blockquote className="font-display text-[clamp(20px,2.4vw,28px)] leading-[1.45]">
            “On Sep 27 you said you care about staying close to your parents in Bengaluru. That changes my vote: Startup.”
          </blockquote>
          <div className="mt-4 text-sm text-muted">The Strategist, round 2, after the user interrupted the debate by voice</div>
        </div>
      </section>

      <Section id="features" kicker="Features" title="Built for real decisions"
        lead="Everything runs on your own words, and the council gets wiser every time you report back.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text, isNew }) => (
            <div key={title} className={`reveal ${card} p-[26px]`}>
              <div className="grid size-11 place-items-center rounded-xl border border-[#5a4020] bg-[#261a0c] text-gold2">
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <h3 className="mt-3.5 mb-1.5 text-[17px] font-semibold">
                {title}
                {isNew && (
                  <span className="ml-2 rounded-full bg-gold px-2 py-0.5 align-middle text-[10px] uppercase tracking-[.14em] text-[#1a1006]">
                    new
                  </span>
                )}
              </h3>
              <p className="text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="privacy" kicker="Privacy" title="Your words, your rules"
        lead="A decision engine is only useful if you can be honest with it.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PRIVACY.map(({ icon: Icon, title, text }) => (
            <div key={title} className={`reveal ${card} flex gap-3.5 p-[26px]`}>
              <Icon size={20} strokeWidth={1.8} className="shrink-0 text-gold2" />
              <div>
                <b className="block">{title}</b>
                <span className="text-sm text-muted">{text}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="px-6 pt-[90px] pb-[120px] text-center">
        <h2 className="reveal mb-3.5 font-display text-[clamp(30px,4vw,46px)] font-semibold">The council is in session</h2>
        <p className="reveal mb-7 text-muted">Bring it a real decision.</p>
        <GoldButton href="/council" className="reveal">Enter the council →</GoldButton>
      </div>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-line px-8 py-7 text-[13px] text-dim">
        <span>SABHA · Dawn of the Autonomous AI Builder · Track 2: Collaborative Multi-Agent Workflows</span>
        <span>Built with Lyzr · Qdrant · Omi · Next.js · Three.js</span>
      </footer>
    </main>
  );
}
