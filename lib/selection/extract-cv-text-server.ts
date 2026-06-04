import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { createAdminClient, SELECTION_CV_BUCKET } from "@/lib/supabase/admin";
import { toDownloadableCvUrl } from "@/lib/selection/cv-url";

// El pdf.js que trae unpdf usa `Promise.try`, que no existe en el runtime de
// Node del worker de Trigger.dev → lanza un unhandledRejection que cuelga la
// task (MAX_DURATION). Polyfill mínimo antes de invocar unpdf.
const P = Promise as unknown as { try?: unknown };
if (typeof P.try !== "function") {
  P.try = (fn: (...a: unknown[]) => unknown, ...args: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (e) {
        reject(e);
      }
    });
}

type CvSource = {
  cvStoragePath: string | null;
  cvUrl: string | null;
  cvExtractedText: string | null;
};

/** Sniff file kind from the leading magic bytes. */
function sniffKind(bytes: Uint8Array): "pdf" | "docx" | "text" {
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf";
  }
  // PK\x03\x04 (zip → docx)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "docx";
  }
  return "text";
}

async function extractFromBytes(
  buffer: ArrayBuffer,
  hint: "pdf" | "docx" | "text" | "unknown"
): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const kind = hint === "unknown" ? sniffKind(bytes) : hint;

  if (kind === "pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return value;
  }
  // Plain text fallback.
  return new TextDecoder().decode(bytes);
}

/**
 * Returns CV text for the report. If the candidate already has extracted text
 * (uploaded files extract client-side), it's returned as-is. Otherwise we fetch
 * the bytes — from Supabase Storage or the external/Drive URL — and extract
 * server-side (unpdf for PDF, mammoth for .docx). Returns null if nothing can be
 * read (e.g. a Drive file not shared publicly).
 */
export async function resolveCvText(c: CvSource): Promise<string | null> {
  if (c.cvExtractedText && c.cvExtractedText.trim()) {
    return c.cvExtractedText;
  }

  try {
    if (c.cvStoragePath) {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(SELECTION_CV_BUCKET)
        .download(c.cvStoragePath);
      if (error || !data) return null;
      const buffer = await data.arrayBuffer();
      const text = await extractFromBytes(buffer, "unknown");
      return text.trim() || null;
    }

    if (c.cvUrl) {
      const { url, kind } = toDownloadableCvUrl(c.cvUrl);
      // Timeout para no colgar la task si Drive no responde o devuelve un
      // interstitial que mantiene la conexión abierta.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let res: Response;
      try {
        res = await fetch(url, { redirect: "follow", signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) return null;
      // Si Drive devuelve una página HTML (login / "no se puede escanear" /
      // confirmación), no es el archivo: no la usamos como CV.
      const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("text/html")) return null;
      const buffer = await res.arrayBuffer();
      const text = await extractFromBytes(buffer, kind);
      return text.trim() || null;
    }
  } catch {
    return null;
  }

  return null;
}
