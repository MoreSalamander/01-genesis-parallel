"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getStatus, SystemStatus } from "@/lib/api";
import { Pulse, RuntimeBar, proofItems, proofState } from "@/lib/alive";

export default function Header() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    const load = () => getStatus().then(setStatus).catch(() => setStatus(null));
    load();
    const timer = setInterval(load, 5000);  // self-heal when the backend comes up
    return () => clearInterval(timer);
  }, []);
  return (
    <header className="masthead">
      {/* The title card. This is the first thing on screen and the thing a room
          reads from the back, so the system's name carries the size and the suite
          sits above it as the mark it is — 01 of Genesis OS, which is a real
          hierarchy and not decoration. Written in sentence case and capitalised
          by the stylesheet: literal caps get spelled out letter by letter by
          some screen readers. */}
      <h1>
        <Link href="/">
          <span className="suite">Genesis OS</span>
          <span className="system">Signal Intelligence</span>
        </Link>
      </h1>
      <div className="sub">
        Research for Convergence Studios — every answer traceable to its sources
        <span className="track" title="Built on Parallel web retrieval and Google Gemini">Parallel track</span>
      </div>
      <div className="mode">
        <Pulse signal={`${status?.missions ?? -1}|${status?.episodic ?? -1}`} />
        {status
          ? `Parallel ${proofState(status.runtime_proof, "parallel", status.parallel_live)} · Gemini ${proofState(status.runtime_proof, "gemini", status.gemini_live)}`
          : "backend offline — start uvicorn on :8000"}
      </div>
      <RuntimeBar items={proofItems(status?.runtime_proof, [
        ["gemini", "Gemini"],
        ["parallel", "Parallel"],
        ["temporal", "Temporal"],
        ["datahub", "DataHub"],
      ])} />
    </header>
  );
}
