"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { handleEvent } from "@/lib/council/events";
import { connectSocket } from "@/lib/council/socket";
import { useCouncil } from "@/lib/council/store";
import { clearQueue, initVoices } from "@/lib/council/voice";
import ConnectModal from "./ConnectModal";
import Dock from "./Dock";
import Dust from "./Dust";
import Header from "./Header";
import Intro from "./Intro";
import PhoneFeed from "./PhoneFeed";
import QuestionBar from "./QuestionBar";
import SidePanel from "./SidePanel";
import Stage from "./Stage";
import Toasts from "./Toasts";
import VerdictScroll from "./VerdictScroll";

// three.js only loads when the constellation is opened
const Constellation = dynamic(() => import("./Constellation"), { ssr: false });

export default function CouncilApp() {
  const offRecord = useCouncil((s) => !!s.omi.off_record);
  const entered = useCouncil((s) => s.entered);
  const constellation = useCouncil((s) => s.constellationOpen);

  useEffect(() => {
    initVoices();
    const stop = connectSocket(handleEvent);
    return () => {
      stop();
      clearQueue();
    };
  }, []);

  return (
    <div className={`council ${offRecord ? "offrec" : ""} ${entered ? "entered" : ""}`}>
      <Dust />
      {!entered && <Intro />}
      <div className="shell">
        <Header />
        <PhoneFeed />
        <section className="flex min-h-0 min-w-0 flex-col">
          <QuestionBar />
          <Stage />
          <Dock />
        </section>
        <SidePanel />
      </div>
      <VerdictScroll />
      <ConnectModal />
      {constellation && <Constellation />}
      <Toasts />
    </div>
  );
}
