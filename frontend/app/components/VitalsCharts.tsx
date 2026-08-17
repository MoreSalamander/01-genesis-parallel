"use client";
/* How the research is holding up — in the shapes the data actually has.

   Three percentages could not say the thing that decides whether to trust any of
   this: how much of it rests on one page. "39% held up" reads fine until you see
   that 910 of 1,503 claims were said once and never corroborated. A studio
   betting a slate on this needs the distribution, not the average.

   Design notes, because they are deliberate rather than taste:

   - Bar length carries magnitude and text carries identity, so these charts use
     ONE hue. The console's four domain colours failed a colourblind-separation
     check on this surface once darkened into the legible band (tritan ΔE 3.4,
     against a floor of 8) — and they were never needed here: the domain names are
     already written beside their bars.
   - The verification mix is the one place colour means something, because the
     three states are a status: confirmed, disputed, single-source. Every segment
     carries its own words and number, so nothing is encoded in colour alone.
   - Every figure is counted from the missions themselves (/api/vitals). A claim
     is attributed to one line of enquiry — the first source that produced it —
     so the domain bars are shares of the same total and not double counted. */

import { useEffect, useState } from "react";
import { VitalsReport, getVitals } from "@/lib/api";

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

/* Evidence gathered for a nested question is recorded under the domain
   "follow-up" — a key written into provenance on every past mission, so it is
   matched here rather than renamed at the source, where it would split the
   history in two. The Studio Head's word is what shows. */
const DOMAIN_LABEL: Record<string, string> = { "follow-up": "nested" };

export function VitalsCharts({ running }: { running: boolean }) {
  const [v, setVitals] = useState<VitalsReport | null>(null);

  useEffect(() => {
    const load = () => { getVitals().then(setVitals).catch(() => {}); };
    load();
    const timer = setInterval(load, running ? 4000 : 30000);
    return () => clearInterval(timer);
  }, [running]);

  if (!v) return null;

  const claims = v.claims.verified + v.claims.conflicted + v.claims.unverified;
  if (claims === 0) return null;

  const mix = [
    { key: "confirmed", n: v.claims.verified, cls: "ok",
      hint: "more than one independent source said it" },
    { key: "disputed", n: v.claims.conflicted, cls: "warn",
      hint: "sources contradicted each other and both were kept" },
    { key: "single-source", n: v.claims.unverified, cls: "thin",
      hint: "one page said it and nothing else has agreed or disagreed" },
  ].filter((s) => s.n > 0);

  const depth = [
    { label: "1 source", n: v.depth["1"] },
    { label: "2", n: v.depth["2"] },
    { label: "3", n: v.depth["3"] },
    { label: "4+", n: v.depth["4+"] },
  ];
  const depthPeak = Math.max(1, ...depth.map((d) => d.n));

  const domains = v.domains.filter((d) => d.claims > 0);
  const domainPeak = Math.max(1, ...domains.map((d) => d.claims));

  return (
    <div className="vitals-charts">
      {/* --- what every claim's standing is, as one bar ------------------- */}
      <figure className="vc">
        <figcaption>
          What the {claims.toLocaleString()} claims stand on
        </figcaption>
        <div className="mix" role="img"
             aria-label={mix.map((s) => `${s.n} ${s.key}`).join(", ")}>
          {mix.map((s) => (
            <span key={s.key} className={`seg ${s.cls}`}
                  style={{ width: `${pct(s.n, claims)}%` }}
                  title={`${s.n.toLocaleString()} ${s.key} — ${s.hint}`} />
          ))}
        </div>
        <ul className="mix-key">
          {mix.map((s) => (
            <li key={s.key}>
              <span className={`dot ${s.cls}`} aria-hidden="true" />
              <b>{s.n.toLocaleString()}</b> {s.key}
              <span className="p">{Math.round(pct(s.n, claims))}%</span>
            </li>
          ))}
        </ul>
      </figure>

      {/* --- the distribution the average was hiding ----------------------- */}
      <figure className="vc">
        <figcaption>
          How many sources agree, claim by claim
          <span className="sub">
            {Math.round(pct(v.depth["1"], claims))}% rests on a single page
          </span>
        </figcaption>
        <div className="bars">
          {depth.map((d) => (
            <div className="bar-col" key={d.label}
                 title={`${d.n.toLocaleString()} claims from ${d.label.replace(" source", " source")}`}>
              <span className="bn">{d.n.toLocaleString()}</span>
              <span className="bar" style={{ height: `${(d.n / depthPeak) * 100}%` }} />
              <span className="bl">{d.label}</span>
            </div>
          ))}
        </div>
      </figure>

      {/* --- which lines of enquiry produce claims that survive ------------ */}
      <figure className="vc">
        <figcaption>
          What each line of enquiry brought back, and how much of it held
        </figcaption>
        <ul className="hbars">
          {domains.map((d) => (
            <li key={d.domain}>
              <span className="hl">{DOMAIN_LABEL[d.domain] ?? d.domain}</span>
              <span className="htrack">
                <span className="hbar" style={{ width: `${(d.claims / domainPeak) * 100}%` }}
                      title={`${d.claims} claims traced to ${DOMAIN_LABEL[d.domain] ?? d.domain}`} />
                <span className="hheld" style={{ width: `${(d.held / domainPeak) * 100}%` }}
                      title={`${d.held} of them confirmed by more than one source`} />
              </span>
              <span className="hn">
                {d.held}<span className="of">/{d.claims}</span>
                <span className="p">{Math.round(pct(d.held, d.claims))}%</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="vc-note">
          The filled part of each bar is what held up. A claim counts once, under the
          line of enquiry whose source produced it.
        </p>
      </figure>

      <div className="vc-figs">
        <span>
          <b>{v.findings.supported}</b> of <b>{v.findings.total}</b> findings rest on something confirmed
        </span>
        <span>
          confidence <b>{Math.round(v.confidence.mean * 100)}%</b> on average, ranging{" "}
          {Math.round(v.confidence.low * 100)}–{Math.round(v.confidence.high * 100)}%
        </span>
      </div>
    </div>
  );
}
