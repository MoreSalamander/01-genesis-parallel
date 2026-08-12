"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getStatus, SystemStatus } from "@/lib/api";

export default function Header() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  return (
    <header className="masthead">
      <div>
        <h1><Link href="/">GENESIS OS — SIGNAL INTELLIGENCE</Link></h1>
        <div className="sub">Convergence Studios · External Intelligence · Parallel track</div>
      </div>
      <div className="mode">
        {status
          ? `Parallel ${status.parallel_live ? "LIVE" : "MOCK"} · Gemini ${status.gemini_live ? "LIVE" : "MOCK"}`
          : "backend offline — start uvicorn on :8000"}
      </div>
    </header>
  );
}
