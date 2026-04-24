# Sub-project B — "Resumen de situación" prompt rewrite

**Date:** 2026-04-24
**Status:** Design (auto-mode, approved)
**Parent scope:** plani.fyi UX refresh

---

## Goal

Reformat the `accountSituation` output of `generate-summary` into two clearly-labeled sections that match the wording nico gave on 2026-04-24. The underlying analysis is considered "already good" — this is primarily a format/structure change, enriched with facts we now capture in Sub-project A (months as client, fee, services) plus participants.

## Out of scope

- Ad-spend data in the prompt (requires pulling from `meta_insights_daily`; deferred).
- Schema changes. We keep a single `accounts.ai_summary` text column and write both sections into it.
- Changes to `meetingSummary` (still feeds `detect-signals` — leave alone).

## Target output shape

A single string written to `accounts.ai_summary` in this format (the detail page already renders `**bold**` + newlines):

```
**Contexto del cliente**
{N} meses como cliente. Fee mensual USD {fee}. Servicios contratados: {service scope}. Hoy el proyecto está enfocado en {focus per last meeting(s)}. Atención: {item to watch}.

**Estado de la cuenta**
Cuenta en estado {color} porque {reason}. Le interesa principalmente {X}. {Nombre interlocutor} se lo nota {vibe}. Próximos pasos: {steps}.
```

Prose, not bullets — matches the user's example. Each section is one paragraph. Omit clauses gracefully when data is missing (e.g. no `startDate` → skip "N meses como cliente" rather than saying "0 meses").

## Changes

### `trigger/tasks/generate-summary.ts`

1. After entering `run()`, fetch:
   - The `accounts` row by `payload.accountId`, selecting name, startDate, fee, serviceScope, healthSignal, healthJustification.
   - Top 5 participants by `lastSeenAt` desc → gives us interlocutor candidates (name + role).
2. Compute `monthsAsClient` from `startDate` (integer months, floor). Null if no startDate.
3. Build a deterministic "account facts" block separate from the prompt instructions, and pass it as context.
4. Replace the prompt: instruct Claude to emit `accountSituation` in the two-section format above, using the facts verbatim where provided (months, fee, scope) and filling in the narrative fields from the transcript analysis (focus, attention items, state reason, interlocutor vibe, next steps).
5. `meetingSummary` shape stays the same.

### No other files touched

- `finalize-transcript.ts` already writes `payload.accountSituation` to `accounts.aiSummary` — no change.
- Detail page renderer already handles `**bold**` + newlines — no change.

## Verification

- `npm run type-check`
- `npm run build`
- Manual: user runs a new transcript upload for a client with `startDate` + `fee` + `serviceScope` + participants. Expect the profile's "Resumen de situación" to show the two new labeled sections.

## Risks

- If Claude doesn't adhere to the format, the detail page still renders the text (worst case: just no bold headers). Not a breaking failure.
- Fee is always presented as "USD X/mes" — Sub-project A keeps it simple, we inherit that assumption here.
- Participants with low confidence can produce a wrong interlocutor name. The prompt will instruct Claude to pick the highest-confidence client-side (non-agency) name; we accept it's best-effort.
