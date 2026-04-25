// Pure (no DB, no node-only deps) — safe to import from client components.

export function driveViewLinkForFile(fileId: string, mimeType?: string): string {
  if (mimeType === "application/vnd.google-apps.document") {
    return `https://docs.google.com/document/d/${fileId}/edit`;
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    return `https://docs.google.com/presentation/d/${fileId}/edit`;
  }
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Parse the Drive file ID from any of the common URL shapes:
 *   https://drive.google.com/file/d/<ID>/view
 *   https://docs.google.com/{document,spreadsheets,presentation}/d/<ID>/edit
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/drive/folders/<ID>   ← rejected
 *
 * Returns null if the URL isn't recognized or points at a folder.
 */
export function parseDriveFileIdFromUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "drive.google.com" &&
      parsed.hostname !== "docs.google.com"
    ) {
      return null;
    }
    if (parsed.pathname.includes("/folders/")) return null;

    const dMatch = parsed.pathname.match(/\/d\/([^/]+)/);
    if (dMatch && dMatch[1]) return decodeURIComponent(dMatch[1]);

    const idParam = parsed.searchParams.get("id");
    if (idParam) return decodeURIComponent(idParam);
  } catch {
    return null;
  }
  return null;
}
