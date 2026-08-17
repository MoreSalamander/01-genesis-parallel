"use client";
/* The project's documents, inside the running system.

   A reviewer should not have to leave the console to find out how the thing they
   are looking at works — and the documents that explain it are files in this
   repository, so what is on screen here is what is in the repo, read at request
   time. There is no second copy to go stale.

   Each document says its path and when it was last written, because a document's
   date next to a running system is information: if the architecture note is older
   than the behaviour it describes, a reader should be able to see that rather than
   discover it. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { DocEntry, DocPage, getDoc, getDocsIndex } from "@/lib/api";
import { Markdown } from "../components/Markdown";

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export default function DocsPage() {
  const [index, setIndex] = useState<DocEntry[]>([]);
  const [slug, setSlug] = useState<string>("readme");
  const [doc, setDoc] = useState<DocPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDocsIndex().then(setIndex).catch(() => setIndex([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setDoc(null);
    setError("");
    getDoc(slug)
      .then((d) => { if (alive) setDoc(d); })
      .catch((err) => { if (alive) setError(String(err)); });
    return () => { alive = false; };
  }, [slug]);

  const current = index.find((d) => d.slug === slug);

  return (
    <main className="docs">
      <nav className="docs-nav">
        <Link href="/">← back to the board</Link>
      </nav>

      <div className="docs-layout">
        <aside className="docs-index">
          <div className="docs-index-head">documents</div>
          {index.length === 0 && <p className="docs-empty">No documents found in this checkout.</p>}
          {index.map((d) => (
            <button
              key={d.slug}
              className={`docs-item${d.slug === slug ? " on" : ""}`}
              onClick={() => setSlug(d.slug)}
              aria-current={d.slug === slug}
            >
              <span className="di-title">{d.title}</span>
              <span className="di-meta">
                {Math.round(d.bytes / 1024)}kb · written {ago(d.modified)}
              </span>
            </button>
          ))}
          <p className="docs-note">
            Read from the repository at request time — this is the same file a reviewer
            gets from the repo, not a copy of it.
          </p>
        </aside>

        <article className="docs-body">
          {error && <p className="docs-error">Could not load that document: {error}</p>}
          {!doc && !error && <p className="docs-empty">Loading…</p>}
          {doc && (
            <>
              <p className="docs-path">{doc.path}{current && <> · written {ago(current.modified)}</>}</p>
              <Markdown source={doc.markdown} />
            </>
          )}
        </article>
      </div>
    </main>
  );
}
