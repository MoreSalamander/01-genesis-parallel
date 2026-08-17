"use client";
/* A markdown renderer for the subset this project's documents actually use.

   The console has no dependencies beyond React, and a markdown library is a large
   one to add for six files. So this covers exactly what a survey of the docs found
   — 49 headings, 54 table rows, 27 fenced blocks, 151 inline-code spans, 97 bold
   spans, 40 bullets, 24 numbered items, 8 blockquotes, 12 links — and nothing else.

   It is a renderer, not a sanitiser, and it does not need to be: every document it
   renders is a file in this repository, served from a fixed whitelist, and nothing
   here injects HTML — the output is React elements, so an unclosed tag in a
   document is text rather than markup. */

import { Fragment, ReactNode } from "react";

/* Inline: `code`, **bold**, [text](href). Applied in that order, because code
   spans win — a backtick around asterisks is code, not emphasis. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-i${i++}`;
    if (token.startsWith("`")) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      out.push(<b key={key}>{token.slice(2, -2)}</b>);
    } else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      const external = /^https?:/.test(href);
      out.push(
        <a key={key} href={href}
           {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
          {label}
        </a>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Taken verbatim, including the ASCII architecture diagram,
    // which is the one block where every space is load-bearing.
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;   // closing fence
      blocks.push(
        <pre key={key++} className={lang ? `md-code lang-${lang}` : "md-code"}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const content = inline(heading[2], `h${key}`);
      blocks.push(
        depth === 1 ? <h1 key={key++}>{content}</h1>
        : depth === 2 ? <h2 key={key++}>{content}</h2>
        : depth === 3 ? <h3 key={key++}>{content}</h3>
        : <h4 key={key++}>{content}</h4>,
      );
      i++;
      continue;
    }

    // A table: a header row, a divider of dashes, then rows until the block ends.
    if (line.startsWith("|") && /^\|[\s:|-]+\|$/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push(
        <div className="md-table-wrap" key={key++}>
          <table className="md-table">
            <thead>
              <tr>{head.map((c, n) => <th key={n}>{inline(c, `th${key}-${n}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, rn) => (
                <tr key={rn}>{r.map((c, cn) => <td key={cn}>{inline(c, `td${key}-${rn}-${cn}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith("> ")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++}>{inline(body.join(" "), `bq${key}`)}</blockquote>,
      );
      continue;
    }

    // Lists. A continuation line indented under an item belongs to that item,
    // which matters here: the ADRs wrap their numbered points over three lines.
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: string[] = [];
      while (i < lines.length) {
        const b = /^[-*]\s+(.*)$/.exec(lines[i]);
        const n = /^(\d+)\.\s+(.*)$/.exec(lines[i]);
        if (b && !ordered) { items.push(b[1]); i++; }
        else if (n && ordered) { items.push(n[2]); i++; }
        else if (/^\s+\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`; i++;
        } else break;
      }
      const rendered = items.map((it, n) => <li key={n}>{inline(it, `li${key}-${n}`)}</li>);
      blocks.push(ordered ? <ol key={key++}>{rendered}</ol> : <ul key={key++}>{rendered}</ul>);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    // A paragraph runs until a blank line or the start of any other block.
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== ""
      && !lines[i].startsWith("```") && !lines[i].startsWith("|")
      && !lines[i].startsWith("> ") && !/^#{1,4}\s/.test(lines[i])
      && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(<p key={key++}>{inline(para.join(" "), `p${key}`)}</p>);
  }

  return <Fragment>{blocks}</Fragment>;
}
