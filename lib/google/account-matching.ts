/**
 * Resolución de "este archivo/transcripción pertenece a qué cuenta".
 * Lógica pura (sin DB, sin red) para razonarla y testearla aislada.
 */

const ACCENT_MAP: Record<string, string> = {
  á: "a", à: "a", ä: "a", â: "a", ã: "a",
  é: "e", è: "e", ë: "e", ê: "e",
  í: "i", ì: "i", ï: "i", î: "i",
  ó: "o", ò: "o", ö: "o", ô: "o", õ: "o",
  ú: "u", ù: "u", ü: "u", û: "u",
  ñ: "n",
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("");
}

export interface AccountMatchOption {
  id: string;
  name: string;
  normalizedName: string;
  domain: string | null;
}

const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

export function deriveDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function resolveAccountByFilename(
  fileName: string,
  options: AccountMatchOption[]
): AccountMatchOption | null {
  const norm = normalize(fileName);
  const matches = options.filter((a) => a.normalizedName && norm.includes(a.normalizedName));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.normalizedName.length - a.normalizedName.length)[0];
}

export type ContentMatch =
  | { kind: "matched"; account: AccountMatchOption }
  | { kind: "ambiguous" }
  | { kind: "none" };

const EMAIL_RE = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi;

/**
 * Matchea por el cuerpo del transcript. Precedencia:
 *  1) dominio de email del cliente (señal fuerte) — 1 cuenta gana; varias → ambiguo.
 *  2) nombre de la cuenta en el texto — normalizedName más largo gana; empate entre
 *     cuentas distintas en el largo máximo → ambiguo.
 */
export function resolveAccountByContent(
  text: string,
  options: AccountMatchOption[]
): ContentMatch {
  const lower = text.toLowerCase();

  const domainsInText = new Set<string>();
  for (const m of lower.matchAll(EMAIL_RE)) {
    const d = m[1].toLowerCase();
    if (!GENERIC_DOMAINS.has(d)) domainsInText.add(d);
  }
  const byDomainIds = new Map<string, AccountMatchOption>();
  for (const a of options) {
    if (a.domain && domainsInText.has(a.domain)) byDomainIds.set(a.id, a);
  }
  if (byDomainIds.size === 1) {
    return { kind: "matched", account: [...byDomainIds.values()][0] };
  }
  if (byDomainIds.size > 1) return { kind: "ambiguous" };

  const norm = normalize(text);
  const byName = options.filter((a) => a.normalizedName && norm.includes(a.normalizedName));
  if (byName.length === 0) return { kind: "none" };
  const sorted = [...byName].sort((a, b) => b.normalizedName.length - a.normalizedName.length);
  const top = sorted[0];
  const tieDifferent = sorted.filter(
    (a) => a.id !== top.id && a.normalizedName.length === top.normalizedName.length
  );
  if (tieDifferent.length > 0) return { kind: "ambiguous" };
  return { kind: "matched", account: top };
}
