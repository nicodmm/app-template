import { Fragment } from "react";

/**
 * Tiny markdown renderer for AI-generated text. Handles:
 *  - **bold** spans
 *  - lines starting with "• " or "- " as bullet items
 *  - paragraph breaks (blank lines)
 *
 * Intentionally minimal: AI prompts only emit these primitives, and a full
 * markdown lib would be overkill (and would also re-introduce raw HTML
 * surface area that we'd rather not ship).
 */
export function RichMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: Array<
    | { kind: "p"; lines: string[] }
    | { kind: "ul"; items: string[] }
  > = [];

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

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const bulletMatch = line.match(/^\s*(?:•|-|\*)\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      ulBuf.push(bulletMatch[1]);
      continue;
    }
    flushList();
    pBuf.push(line);
  }
  flushParagraph();
  flushList();

  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.kind === "p" ? (
          <p key={i} className="leading-relaxed">
            {block.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(l)}
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i} className="list-disc pl-5 space-y-1 marker:text-muted-foreground/60">
            {block.items.map((item, j) => (
              <li key={j} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        )
      )}
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
