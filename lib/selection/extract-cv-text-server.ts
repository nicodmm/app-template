import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { createAdminClient, SELECTION_CV_BUCKET } from "@/lib/supabase/admin";
import { toDownloadableCvUrl } from "@/lib/selection/cv-url";

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
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const text = await extractFromBytes(buffer, kind);
      return text.trim() || null;
    }
  } catch {
    return null;
  }

  return null;
}
