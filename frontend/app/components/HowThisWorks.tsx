"use client";
/* The first thing a new Studio Head should read.

   Everything else in this console assumes you already know why disagreement is
   preserved rather than resolved — which is the most distinctive thing the
   system does, and the least guessable. So it says so once, plainly, and then
   gets out of the way permanently. */

import { useEffect, useState } from "react";

const KEY = "genesis.howthisworks.dismissed";

export function HowThisWorks() {
  // Start hidden: rendering then hiding causes a flash for people who already
  // dismissed it, and localStorage is not available during server render.
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(localStorage.getItem(KEY) !== "1"); } catch { setShow(true); }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode — fine, it reappears */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <section className="how">
      <div className="how-top">
        <h2>What this is</h2>
        <button className="how-x" onClick={dismiss} aria-label="Dismiss">Got it</button>
      </div>

      <p className="how-lead">
        A researcher for your studio. Ask it a question about the business — costs, festivals,
        distribution, who is doing what — and it goes and reads the open web to answer it, then
        shows you exactly what it read.
      </p>

      <ol className="how-steps">
        <li>
          <b>It splits your question up.</b> One question becomes several lines of enquiry —
          the money, the people, the industry, the strategy — and it chases them all at once.
        </li>
        <li>
          <b>It reads real sources.</b> Dozens of them, live, and it keeps a link to every one.
          Nothing here is invented; if it could not find something, it says so.
        </li>
        <li>
          <b>It checks facts against each other.</b> When two independent sources say the same
          thing, that is marked confirmed. When only one does, it stays a lead.
        </li>
      </ol>

      <p className="how-thesis">
        <b>And when sources disagree, it does not pick a winner.</b> Most tools quietly average
        the difference away or show you whichever they saw last. This one shows you both numbers,
        side by side, with the source for each — because the disagreement is usually the most
        important thing on the page, and it is your call to make, not a machine&rsquo;s.
      </p>
    </section>
  );
}
