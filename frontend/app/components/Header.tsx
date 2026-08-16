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
      <div>
        <h1><Link href="/">GENESIS OS — SIGNAL INTELLIGENCE</Link></h1>
        <div className="sub">Convergence Studios · External Intelligence · Parallel track</div>
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
