import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import {
  refreshGoogleAccessToken,
  tokenExpiryDate,
  type GoogleTokenResponse,
} from "./oauth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export interface DriveFolder {
  id: string;
  name: string;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

async function driveFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith("http") ? path : `${DRIVE_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Drive API ${res.status}: ${detail.substring(0, 200)}`);
  }
  return res.json();
}

export async function ensureFreshAccessToken(
  connectionId: string
): Promise<string> {
  const [connection] = await db
    .select()
    .from(driveConnections)
    .where(eq(driveConnections.id, connectionId))
    .limit(1);
  if (!connection) throw new Error("Drive connection not found");

  // Refresh if expired or close to expiry.
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() < Date.now()) {
    const refreshed = await refreshGoogleAccessToken(connection.refreshToken);
    await db
      .update(driveConnections)
      .set({
        accessToken: refreshed.access_token,
        tokenExpiresAt: tokenExpiryDate(refreshed),
        updatedAt: new Date(),
      })
      .where(eq(driveConnections.id, connectionId));
    return refreshed.access_token;
  }

  return connection.accessToken;
}

export async function listDriveFolders(
  accessToken: string,
  search?: string
): Promise<DriveFolder[]> {
  const baseQuery =
    "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const query = search
    ? `${baseQuery} and name contains '${search.replace(/'/g, "\\'")}'`
    : baseQuery;
  const params = new URLSearchParams({
    q: query,
    pageSize: "100",
    fields: "files(id,name)",
    orderBy: "name",
  });
  const res = await driveFetch<{ files: DriveFolder[] }>(
    `/files?${params.toString()}`,
    accessToken
  );
  return res.files;
}

export async function listDriveFolderFiles(
  accessToken: string,
  folderId: string
): Promise<DriveFileMeta[]> {
  const query = `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const params = new URLSearchParams({
    q: query,
    pageSize: "100",
    fields: "files(id,name,mimeType,modifiedTime,size)",
    orderBy: "modifiedTime desc",
  });
  const res = await driveFetch<{ files: DriveFileMeta[] }>(
    `/files?${params.toString()}`,
    accessToken
  );
  return res.files;
}

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDE_MIME = "application/vnd.google-apps.presentation";

export async function downloadDriveFileAsArrayBuffer(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<{ data: ArrayBuffer; mimeType: string }> {
  // Google native docs require export, not download.
  if (mimeType === GOOGLE_DOC_MIME) {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive export failed: ${res.status}`);
    return { data: await res.arrayBuffer(), mimeType: "text/plain" };
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive export failed: ${res.status}`);
    return { data: await res.arrayBuffer(), mimeType: "text/csv" };
  }
  if (mimeType === GOOGLE_SLIDE_MIME) {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive export failed: ${res.status}`);
    return { data: await res.arrayBuffer(), mimeType: "text/plain" };
  }

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return { data: await res.arrayBuffer(), mimeType };
}

export interface DriveFileShape {
  /** transcript candidate (text-extractable, will go through summary pipeline) */
  isTranscriptShaped: boolean;
  /** docType for context_documents when not a transcript */
  contextDocType: string;
}

export function classifyDriveFile(name: string, mimeType: string): DriveFileShape {
  const lower = name.toLowerCase();
  if (
    mimeType === GOOGLE_DOC_MIME ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/pdf" ||
    lower.endsWith(".docx") ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md")
  ) {
    return { isTranscriptShaped: true, contextDocType: "report" };
  }
  if (
    mimeType === GOOGLE_SHEET_MIME ||
    mimeType.includes("spreadsheet") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv")
  ) {
    return { isTranscriptShaped: false, contextDocType: "spreadsheet" };
  }
  if (
    mimeType === GOOGLE_SLIDE_MIME ||
    mimeType.includes("presentation") ||
    lower.endsWith(".pptx") ||
    lower.endsWith(".ppt") ||
    lower.endsWith(".key")
  ) {
    return { isTranscriptShaped: false, contextDocType: "presentation" };
  }
  return { isTranscriptShaped: false, contextDocType: "other" };
}

export type { GoogleTokenResponse };
