import { Fragment } from "react";

/**
 * Tiny markdown renderer for AI-generated text. Handles:
 *  - # .. ###### headings
 *  - --- / *** / ___ horizontal rules
 *  - GFM pipe tables (| a | b | with a --- separator row)
 *  - lines starting with "• ", "- " or "* " as bullet items
 *  - **bold** spans
 *  - paragraph breaks (blank lines)
 *
 * Intentionally minimal (no raw HTML surface area), but covers the primitives
 * the AI reports actually emit — including the experience tables in the
 * selection report.
 */

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "hr" }
  | { kind: "table"; header: string[]; rows: string[][] };

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** A `| --- | :--: |` style separator row. */
function isSeparatorRow(line: string): boolean {
  const s = line.trim();
  if (!s.includes("-") || !s.includes("|")) return false;
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(s);
}

function looksLikeTableRow(line: string): boolean {
  return line.includes("|");
}

export function RichMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: Block[] = [];

  let pBuf: string[] = [];
  let ulBuf: string[] = [];

  function flushParagraph() {
    if (pBuf.length > 0) {
      blocks.push({ kind: "p", lines: pBuf });
      pBuf = [];
    }
  }
  function flushList() {
    if (ulBuf.length > 0) {
      blocks.push({ kind: "ul", items: ulBuf });
      ulBuf = [];
    }
  }
  function flushAll() {
    flushParagraph();
    flushList();
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushAll();
      blocks.push({ kind: "hr" });
      continue;
    }

    // Heading.
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      blocks.push({
        kind: "h",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    // GFM table: current line is a row and the next non-empty line is a separator.
    const next = lines[i + 1]?.trimEnd() ?? "";
    if (looksLikeTableRow(line) && isSeparatorRow(next)) {
      flushAll();
      const header = splitCells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j].trimEnd();
        if (rowLine.trim() === "" || !looksLikeTableRow(rowLine)) break;
        rows.push(splitCells(rowLine));
        j++;
      }
      blocks.push({ kind: "table", header, rows });
      i = j - 1;
      continue;
    }

    // Bullet item.
    const bulletMatch = line.match(/^\s*(?:•|-|\*)\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      ulBuf.push(bulletMatch[1]);
      continue;
    }

    flushList();
    pBuf.push(line);
  }
  flushAll();

  const headingClass: Record<number, string> = {
    1: "text-lg font-semibold text-foreground mt-2",
    2: "text-base font-semibold text-foreground mt-2",
    3: "text-sm font-semibold text-foreground mt-1",
    4: "text-sm font-semibold text-foreground",
    5: "text-xs font-semibold text-foreground",
    6: "text-xs font-semibold text-muted-foreground",
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.kind === "p") {
          return (
            <p key={i} className="leading-relaxed">
              {block.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {renderInline(l)}
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul
              key={i}
              className="list-disc pl-5 space-y-1 marker:text-muted-foreground/60"
            >
              {block.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "h") {
          const cls = headingClass[block.level] ?? headingClass[3];
          return (
            <p key={i} className={cls}>
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.kind === "hr") {
          return (
            <hr key={i} className="my-3 [border-color:var(--glass-border)]" />
          );
        }
        // table
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="[border-bottom:1px_solid_var(--glass-border)]">
                  {block.header.map((h, j) => (
                    <th
                      key={j}
                      className="text-left font-semibold text-muted-foreground px-2 py-1.5 align-top"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr
                    key={r}
                    className="[border-bottom:1px_solid_var(--glass-border)] last:border-0 align-top"
                  >
                    {block.header.map((_, c) => (
                      <td key={c} className="px-2 py-1.5 leading-relaxed">
                        {renderInline(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
