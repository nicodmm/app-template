"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { accounts, usageTracking } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import { getAccountsCount } from "@/lib/queries/accounts";
import { parseCsv, normalizeHeader } from "@/lib/csv-parser";

export interface RowError {
  line: number;
  reason: string;
}

export interface ImportWarning {
  line: number;
  field: string;
  reason: string;
}

export type ImportResult =
  | { success: true; created: number; warnings: ImportWarning[] }
  | { success: false; error: string; rowErrors?: RowError[] };

const MAX_ROWS = 1000;

/**
 * Header synonyms — values are the normalized form of any accepted header
 * spelling, mapped to the canonical field key used downstream.
 */
const HEADER_MAP: Record<string, string> = {
  name: "name",
  nombre: "name",
  cuenta: "name",
  cliente: "name",
  account: "name",

  email: "email",
  responsable: "email",
  owner: "email",
  am: "email",

  fee: "fee",
  monto: "fee",
  precio: "fee",
  tarifa: "fee",

  startdate: "startDate",
  fechainicio: "startDate",
  inicio: "startDate",

  website: "website",
  web: "website",
  sitio: "website",
  url: "website",

  linkedin: "linkedin",
  linkedinurl: "linkedin",

  goals: "goals",
  objetivos: "goals",

  servicescope: "serviceScope",
  servicios: "serviceScope",
  scope: "serviceScope",
  services: "serviceScope",
};

function parseFee(raw: string): { value: string | null; warned: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, warned: false };
  const cleaned = trimmed.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return { value: null, warned: true };
  return { value: n.toFixed(2), warned: false };
}

function parseStartDate(raw: string): { value: string | null; warned: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, warned: false };
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { value: trimmed, warned: false };
  }
  // DD/MM/YYYY
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return {
      value: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      warned: false,
    };
  }
  return { value: null, warned: true };
}

function parseUrl(raw: string): { value: string | null; warned: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, warned: false };
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:")
      return { value: null, warned: true };
    return { value: u.toString(), warned: false };
  } catch {
    return { value: null, warned: true };
  }
}

function parseServiceScope(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

export async function importAccountsFromCsv(
  formData: FormData
): Promise<ImportResult> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { success: false, error: "Sin workspace activo." };

  const raw = (formData.get("csv") as string | null) ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return { success: false, error: "Pegá un CSV antes de importar." };

  const parsed = parseCsv(raw);
  if (parsed.headers.length === 0) {
    return { success: false, error: "No se detectaron columnas." };
  }
  if (parsed.rows.length === 0) {
    return { success: false, error: "El CSV no tiene filas de datos." };
  }
  if (parsed.rows.length > MAX_ROWS) {
    return {
      success: false,
      error: `Máximo ${MAX_ROWS} filas por import. Tu archivo tiene ${parsed.rows.length}.`,
    };
  }

  // Resolve headers → canonical field keys
  const fieldByCol: Array<string | null> = parsed.headers.map((h) => {
    const norm = normalizeHeader(h);
    return HEADER_MAP[norm] ?? null;
  });

  if (!fieldByCol.includes("name")) {
    return {
      success: false,
      error:
        "No se detectó la columna `name` (o sinónimo: nombre, cuenta, cliente, account). La primera fila debe ser cabeceras.",
    };
  }

  // Workspace member email → userId map
  const members = await getWorkspaceMembers(workspace.id);
  const ownerByEmail = new Map<string, string>();
  for (const m of members) {
    ownerByEmail.set(m.email.trim().toLowerCase(), m.userId);
  }

  const rowErrors: RowError[] = [];
  const warnings: ImportWarning[] = [];
  const toInsert: Array<typeof accounts.$inferInsert> = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const lineNumber = i + 2; // header is line 1

    const fields: Record<string, string> = {};
    for (let j = 0; j < row.length; j++) {
      const key = fieldByCol[j];
      if (key) fields[key] = row[j];
    }

    const name = fields.name?.trim() ?? "";
    if (!name) {
      rowErrors.push({ line: lineNumber, reason: "falta el nombre" });
      continue;
    }

    let ownerId: string | null = null;
    if (fields.email) {
      const lookup = fields.email.trim().toLowerCase();
      const match = ownerByEmail.get(lookup);
      if (match) {
        ownerId = match;
      } else {
        warnings.push({
          line: lineNumber,
          field: "email",
          reason: `el email ${fields.email} no es miembro del workspace; cuenta queda sin responsable`,
        });
      }
    }

    let fee: string | null = null;
    if (fields.fee) {
      const r = parseFee(fields.fee);
      fee = r.value;
      if (r.warned) {
        warnings.push({
          line: lineNumber,
          field: "fee",
          reason: `fee inválido (${fields.fee})`,
        });
      }
    }

    let startDate: string | null = null;
    if (fields.startDate) {
      const r = parseStartDate(fields.startDate);
      startDate = r.value;
      if (r.warned) {
        warnings.push({
          line: lineNumber,
          field: "start_date",
          reason: `fecha inválida (${fields.startDate})`,
        });
      }
    }

    let websiteUrl: string | null = null;
    if (fields.website) {
      const r = parseUrl(fields.website);
      websiteUrl = r.value;
      if (r.warned) {
        warnings.push({
          line: lineNumber,
          field: "website",
          reason: `URL inválida (${fields.website})`,
        });
      }
    }

    let linkedinUrl: string | null = null;
    if (fields.linkedin) {
      const r = parseUrl(fields.linkedin);
      linkedinUrl = r.value;
      if (r.warned) {
        warnings.push({
          line: lineNumber,
          field: "linkedin",
          reason: `LinkedIn URL inválida (${fields.linkedin})`,
        });
      }
    }

    const goals = fields.goals?.trim() || null;
    const serviceScope = fields.serviceScope
      ? parseServiceScope(fields.serviceScope)
      : null;

    toInsert.push({
      workspaceId: workspace.id,
      name,
      goals,
      serviceScope,
      ownerId,
      startDate,
      fee,
      enabledModules: {},
      websiteUrl,
      linkedinUrl,
      enrichmentStatus: null,
    });
  }

  if (toInsert.length === 0) {
    return {
      success: false,
      error: "Ninguna fila válida para importar.",
      rowErrors,
    };
  }

  await db.insert(accounts).values(toInsert);

  // Sync usage_tracking.accounts_count once
  const newCount = await getAccountsCount(workspace.id);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  await db
    .insert(usageTracking)
    .values({
      workspaceId: workspace.id,
      month: monthStart,
      accountsCount: newCount,
    })
    .onConflictDoUpdate({
      target: [usageTracking.workspaceId, usageTracking.month],
      set: { accountsCount: newCount, updatedAt: new Date() },
    });

  revalidatePath("/app/portfolio");
  revalidatePath("/app/dashboard");

  // If there were row errors mixed in, surface them as warnings (we still
  // committed the valid ones successfully).
  const allWarnings = [
    ...warnings,
    ...rowErrors.map((e) => ({
      line: e.line,
      field: "name",
      reason: e.reason,
    })),
  ];

  return { success: true, created: toInsert.length, warnings: allWarnings };
}
