import type { Metadata } from "next";
import CouncilApp from "@/components/council/CouncilApp";
import "./council.css";

export const metadata: Metadata = { title: "Council of Your Own Words" };

export default function CouncilPage() {
  return <CouncilApp />;
}
