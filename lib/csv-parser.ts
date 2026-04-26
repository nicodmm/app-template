/**
 * Minimal RFC 4180-style CSV/TSV parser. No dependencies. Supports:
 *  - LF and CRLF line endings
 *  - Quoted values with " (doubled "" escapes a literal quote)
 *  - Comma OR tab as field separator (auto-detected from the header line)
 *
 * Returns rows as arrays of strings. The caller maps headers → fields.
 */

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  delimiter: "," | "\t";
}

export function detectDelimiter(headerLine: string): "," | "\t" {
  // Compare counts; prefer tab when it appears at all in the header line
  // because tabs are rare in user content and very common in spreadsheet
  // exports. Falls back to comma otherwise.
  return headerLine.includes("\t") ? "\t" : ",";
}

export function parseCsv(input: string): CsvParseResult {
  // Strip BOM if present
  const text = input.replace(/^﻿/, "");
  if (!text.trim()) {
    return { headers: [], rows: [], delimiter: "," };
  }

  // Detect delimiter from first non-empty line
  const firstNewline = text.indexOf("\n");
  const headerLine =
    firstNewline === -1 ? text : text.slice(0, firstNewline).replace(/\r$/, "");
  const delimiter = detectDelimiter(headerLine);

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 1;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (ch === "\r") {
      // Treat as part of CRLF line ending; the actual break happens on \n
      continue;
    }

    if (ch === "\n") {
      currentRow.push(currentField);
      allRows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += ch;
  }

  // Flush the last field/row if the file doesn't end with a newline
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    allRows.push(currentRow);
  }

  // Drop empty rows (where every field is empty)
  const nonEmpty = allRows.filter((r) => r.some((f) => f.trim() !== ""));

  if (nonEmpty.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const [headerRow, ...dataRows] = nonEmpty;
  const headers = headerRow.map((h) => h.trim());
  return { headers, rows: dataRows, delimiter };
}

/**
 * Normalizes a CSV header to a canonical field key by stripping case,
 * accents, spaces, and underscores. Used to match header synonyms.
 */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}
