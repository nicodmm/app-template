# Setup Guide

## Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

## 1. Clone and install

Copy this template folder and rename it, then install deps:

```
cp -r app-template my-new-app
cd my-new-app
npm install
```

## 2. Configure environment variables

```
cp .env.local.example .env.local
```

Fill in `.env.local` with your Supabase project values:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings
- `DATABASE_URL` — Supabase PostgreSQL connection string (Session mode, port 5432)
- `NEXT_PUBLIC_APP_URL` — `http://localhost:3000` for local dev

## 3. Run database migrations

```
npm run db:migrate
```

## 4. Start the dev server

```
npm run dev
```

Open http://localhost:3000.

## 5. Planning your app (optional)

Before building, use the planning workflow. Run `/01_generate_master_idea` in Claude Code and follow the 10-step workflow.
