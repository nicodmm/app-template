/**
 * Helpers for displaying a candidate CV that may come from an uploaded file
 * (a Supabase signed URL) or an external link the recruiter pasted (often a
 * Google Drive / Docs share URL).
 */

/**
 * Convert a Google Drive / Google Docs share URL into its embeddable
 * `/preview` form so it can be shown inside an `<iframe>`. Non-Google URLs
 * (e.g. Supabase signed URLs) are returned unchanged.
 *
 * NOTE: for a Drive link to load at all the file must be shared as
 * "Cualquier persona con el enlace → Lector". A `/view` or `/edit` link, or a
 * file restricted to specific accounts, will show Google's "Necesitas acceso"
 * wall regardless of this transform.
 */
export function toEmbeddableCvUrl(url: string): string {
  if (/drive\.google\.com/.test(url)) {
    const fileId =
      url.match(/\/file\/d\/([^/?#]+)/)?.[1] ?? url.match(/[?&]id=([^&]+)/)?.[1];
    if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  const docsMatch = url.match(
    /docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([^/?#]+)/
  );
  if (docsMatch) {
    return `https://docs.google.com/${docsMatch[1]}/d/${docsMatch[2]}/preview`;
  }
  return url;
}

/**
 * Whether the CV can be previewed inside an iframe. Google Drive/Docs links
 * always can (via the /preview form); otherwise we rely on the mime type
 * (uploaded files) or a `.pdf` extension in the URL.
 */
export function isEmbeddableCv(url: string, mimeType: string | null): boolean {
  if (/drive\.google\.com|docs\.google\.com/.test(url)) return true;
  if (mimeType) return mimeType.toLowerCase().includes("pdf");
  return /\.pdf($|[?#])/i.test(url);
}
