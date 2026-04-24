# Sub-project E — Deploy a Vercel + dominio nao.fyi

**Date:** 2026-04-24
**Status:** Design + runbook (auto-mode, approved)
**Parent scope:** plani.fyi UX refresh (note: brand renamed to **nao.fyi** — domain bought on GoDaddy)

---

## Goal

Move the app from local dev to a public deployment at `https://nao.fyi`. Keep the dev cycle intact (local devs continue against the same Supabase/Trigger projects unless we explicitly split them later).

## Decisions

- **Deployment target**: Vercel (user already has account; Next.js 15 App Router is a first-class target).
- **Domain**: nao.fyi, registered at GoDaddy → DNS pointed at Vercel.
- **Backing services for first deploy**: reuse the existing Supabase project, the existing Trigger.dev project (we'll deploy it), and the existing Anthropic key. We can split prod-vs-dev later.
- **Trigger.dev**: deployed via `npx trigger.dev@latest deploy` to the same project, then the prod env vars (`TRIGGER_SECRET_KEY` for the prod env, not dev) go into Vercel.
- **Brand rename**: change "plani.fyi" → "nao.fyi" only where users see it (header logo, page title/metadata, HTTP User-Agent). Historical specs/plans/internal type names are not touched.

## Code changes (this commit)

| File | Change |
|---|---|
| `components/app-header.tsx` | Logo text → "nao.fyi" |
| `app/layout.tsx` | `metadata.title` and `description` set for nao.fyi; `lang="es"` |
| `trigger/tasks/enrich-account.ts` | User-Agent string → nao.fyi |
| `.env.local.example` | Synced with everything `lib/env.ts` validates + the loose `ANTHROPIC_API_KEY` and `TRIGGER_*` vars used in Trigger tasks |

## Runbook (user actions, in order)

### 1. Push the repo to GitHub

If not already pushed:

```bash
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin master
```

### 2. Vercel project

1. https://vercel.com → "Add New" → "Project" → import the repo.
2. Framework: Next.js (auto-detected). Build command: default (`next build`). Install command: default.
3. **Do not deploy yet** — first set env vars (next step).

### 3. Production env vars in Vercel

In Vercel → Project → Settings → Environment Variables, add **all** of these for the **Production** environment (and ideally the same for Preview if you want preview deploys to work):

| Var | Value source / notes |
|---|---|
| `DATABASE_URL` | Supabase Pooler URL (transaction mode, port 6543) — Vercel needs the pooler, **not** the direct 5432 URL we use for migrations. |
| `NEXT_PUBLIC_SUPABASE_URL` | From `.env.local`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From `.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | From `.env.local`. |
| `NEXT_PUBLIC_APP_URL` | `https://nao.fyi` |
| `ANTHROPIC_API_KEY` | From `.env.local`. |
| `TRIGGER_PROJECT_ID` | Same as dev for now. |
| `TRIGGER_SECRET_KEY` | **Use the prod env's secret key from the Trigger.dev dashboard**, not the dev one. After step 6 below this exists. |
| `META_APP_ID`, `META_APP_SECRET` | Same Meta app for now. |
| `META_OAUTH_REDIRECT_URI` | `https://nao.fyi/api/auth/meta/callback` |
| `CRM_STATE_SECRET` | At least 32 chars, can reuse dev value. |
| `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET` | Same as dev. |
| `PIPEDRIVE_REDIRECT_URI` | `https://nao.fyi/api/auth/crm/pipedrive/callback` |

### 4. First deploy

Trigger a deploy from Vercel. The build should pass — we already verify locally with `npm run build` after every sub-project. If anything fails, the most likely culprit is an env var not set or the wrong `DATABASE_URL` (use the pooler, not the direct URL).

### 5. Add the domain in Vercel + DNS at GoDaddy

In Vercel → Settings → Domains, add `nao.fyi` (and optionally `www.nao.fyi`).

Vercel gives you DNS instructions. The recommended setup for an apex domain on GoDaddy:

- **A record**: `@` → `76.76.21.21` (Vercel's apex IP)
- **CNAME**: `www` → `cname.vercel-dns.com`

In GoDaddy → DNS Management for nao.fyi:
1. Delete the parking-page A records GoDaddy adds by default.
2. Add the A record above for `@`.
3. Add the CNAME for `www`.
4. SSL certificate provisions automatically once DNS resolves (a few minutes to a couple of hours).

### 6. Deploy Trigger.dev project

In a terminal at the repo root:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest deploy
```

This builds and deploys the tasks in `./trigger` to Trigger.dev's prod environment. After deploy, copy the **prod** secret key from the Trigger.dev dashboard and put it into Vercel's `TRIGGER_SECRET_KEY` env var (step 3). Re-deploy Vercel so it picks it up.

### 7. Update OAuth callback URLs

For the OAuth flows to work in prod, the third-party consoles need the new redirect URIs:

- **Meta for Developers** → your app → "Use cases" / "Facebook Login" / "Marketing API" → add `https://nao.fyi/api/auth/meta/callback` to Valid OAuth Redirect URIs.
- **Pipedrive** → developer hub → your app → add `https://nao.fyi/api/auth/crm/pipedrive/callback`.

(Keep the local URLs there too so dev keeps working.)

### 8. Smoke test in prod

- Sign up / log in (Supabase Auth).
- Create an account with a website URL → see Contexto enrichment populate (confirms Trigger deploy + Anthropic key).
- Connect Meta or Pipedrive (confirms OAuth redirect URIs).

## Risks / things to watch

- **Database connection limit**: Supabase free tier allows ~60 direct connections. Vercel's serverless functions can blow past this in bursts. Use the **Supabase Pooler URL** (port 6543, transaction mode) for `DATABASE_URL` in Vercel.
- **Trigger.dev concurrency**: free tier is 1 concurrent batch. If enrichment + transcript pipeline run together, things queue. Acceptable for now.
- **Cost**: Vercel Hobby plan free for personal use, $0/month. Vercel charges if function execution exceeds Hobby limits — given this is one-user it's fine.
- **CORS / cookie domain**: Supabase Auth uses the `NEXT_PUBLIC_SUPABASE_URL` directly; no extra config needed.

## Future (not in this sub-project)

- Split prod and dev into separate Supabase projects + separate Trigger.dev projects. Defer until we actually have prod traffic worth protecting from dev breakage.
- Add a `vercel.json` with explicit function regions if latency to Supabase becomes a concern.
- Add a status page / uptime check (Better Uptime, etc.) once we have real users.
