import {
  ChartLine,
  SquareCheckBig,
  CirclePlus,
  Database,
  EyeOff,
  FileText,
  Hand,
  Lock,
  Mic,
  Monitor,
  Moon,
  Network,
  PenLine,
  Radar,
  Scale,
  Shield,
  Star,
  type LucideIcon,
} from "lucide-react";

export interface Item {
  icon: LucideIcon;
  title: string;
  text: string;
}

export const STEPS: (Item & { by: string })[] = [
  { icon: Mic, title: "1 · You talk", by: "Omi",
    text: "Speak your goals, fears and plans into the Omi app. Live transcripts stream to Sabha over webhooks." },
  { icon: Database, title: "2 · It remembers", by: "Qdrant",
    text: "Each sentence is redacted, labelled as a goal, value, fear, plan, fact or past decision, embedded, and stored as a memory." },
  { icon: Network, title: "3 · The council debates", by: "Lyzr agents",
    text: "“Sabha, should I…?” Five advisors cite your dated memories, answer each other, and get audited for bias." },
  { icon: SquareCheckBig, title: "4 · Verdict & learning", by: "Omi + Qdrant",
    text: "A weighted vote becomes a verdict and an action item in your Omi app. Tell it how things went, and the right advisors gain power." },
];

export const ADVISORS = [
  { name: "Mentor", color: "#F5A524", text: "Long-term growth, and who you'll learn from." },
  { name: "Skeptic", color: "#EF4444", text: "Argues against the option you're leaning toward." },
  { name: "Future-You", color: "#A78BFA", text: "You in five years, using only goals you actually said." },
  { name: "Strategist", color: "#2DD4BF", text: "Money, risk, and whether you can undo it." },
  { name: "Guardian", color: "#60A5FA", text: "Checks every option against your stated values." },
];

export const SUPPORT: (Item & { color: string })[] = [
  { icon: PenLine, color: "#FDE68A", title: "Moderator", text: "Frames the options and guesses your current lean." },
  { icon: Radar, color: "#FB923C", title: "Bias Radar",
    text: "Flags sunk cost, social proof, and “says money doesn't matter, worries about loans”." },
  { icon: FileText, color: "#E7D3A8", title: "Scribe", text: "Writes the verdict, the dissent and one concrete next step." },
];

export const FEATURES: (Item & { isNew?: boolean })[] = [
  { icon: Star, isNew: true, title: "Memory Constellation",
    text: "Your Qdrant memory vectors in 3D. Memories the advisors cite light up as they speak." },
  { icon: Scale, isNew: true, title: "Tipping Point",
    text: "Every verdict shows what would have flipped it: which advisor switching sides, or how much more weight a dissenter needed." },
  { icon: Moon, isNew: true, title: "Omi Day Summary",
    text: "Omi's nightly recap flows in automatically. Decisions become past decisions, and open questions become plans." },
  { icon: ChartLine, title: "Outcome learning",
    text: "“Sabha, the startup decision went well.” Advisors who called it gain vote weight, and you can see the weights change." },
  { icon: Hand, title: "Interrupt by voice",
    text: "“Sabha, I also care about…” mid-debate. It's saved as a value, and round two must weigh it." },
  { icon: CirclePlus, title: "Verdict back to Omi",
    text: "The verdict becomes an Omi memory, and the next step lands in your Omi action items." },
];

export const PRIVACY: Item[] = [
  { icon: Lock, title: "Sealed memories",
    text: "“Sabha, seal that.” Advisors may reason with a sealed memory but can never quote it, and a server-side check enforces that." },
  { icon: EyeOff, title: "Off the record", text: "Nothing is stored until you say “back on”." },
  { icon: Shield, title: "Redacted at the door",
    text: "Phone numbers and emails become [REDACTED] before anything is embedded or stored." },
  { icon: Monitor, title: "Local embeddings",
    text: "Vectors are computed on your machine. Only the memories relevant to a question are sent to the council." },
];

export const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#council", label: "The council" },
  { href: "#features", label: "Features" },
  { href: "#privacy", label: "Privacy" },
];
