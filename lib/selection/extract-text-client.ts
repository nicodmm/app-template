import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

/**
 * Browser-only text extraction for CV files. Mirrors the logic in
 * components/context-upload-form.tsx (mammoth for .docx, pdfjs for .pdf).
 * Returns "" for unsupported types. Safe to import from client components.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  if (file.name.toLowerCase().endsWith(".pdf")) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
      );
    }
    return pages.join("\n");
  }
  if (file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".md")) {
    return file.text();
  }
  return "";
}
