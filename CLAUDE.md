# CLAUDE.md

## App Overview

[Fill in after completing ai_docs/prep_templates workflow]

Run the planning commands in order:
1. `/01_generate_master_idea` — define your app vision
2. `/02_generate_app_name` — name + domain research
3. `/03_generate_ui_theme` — color theme generation
4. `/04_chatgpt_logo_generation` — logo prompts
5. `/05_generate_app_pages_and_functionality` — feature specs
6. `/06_generate_trigger_workflows` — background jobs design
7. `/07_generate_wireframe` — UI wireframes
8. `/08_generate_initial_data_models` — database schema design
9. `/09_generate_system_design` — architecture diagram
10. `/10_generate_build_order_worker` — development roadmap

After completing the planning workflow, update this section with your app description.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Auth:** Supabase Auth with SSR (@supabase/ssr)
- **Database:** Supabase PostgreSQL + Drizzle ORM
- **UI:** shadcn/ui + Tailwind CSS v4
- **Env validation:** @t3-oss/env-nextjs + Zod
- **TypeScript:** Strict mode

## Development Commands

npm run dev              # Start dev server with Turbopack
npm run build            # Production build
npm run type-check       # TypeScript type checking
npm run lint             # ESLint
npm run format           # Prettier

## Database Operations (Drizzle ORM)

CRITICAL WORKFLOW: Every migration MUST have a down migration BEFORE running db:migrate.

npm run db:generate        # Generate migrations from schema changes
npm run db:generate:custom # Generate custom SQL migrations (RLS, functions)
npm run db:migrate         # Run pending migrations (ONLY after creating down migration!)
npm run db:rollback        # Rollback last migration (requires down.sql)
npm run db:status          # Check migration status

Correct workflow:
1. Modify schema in lib/drizzle/schema/*
2. npm run db:generate
3. Create drizzle/migrations/<name>/down.sql
4. npm run db:migrate

## Critical Next.js 15 Requirements

In Next.js 15, both params and searchParams are Promises that MUST be awaited:

interface PageProps {
  params: Promise<{ id: string }>;
}
export default async function Page({ params }: PageProps) {
  const { id } = await params;
}

revalidatePath with dynamic routes:
revalidatePath("/path/[id]", "page");

## Authentication

Server-side utilities in lib/auth.ts:

- getCurrentUserId() — Get authenticated user ID (nullable)
- requireUserId() — Require auth, redirects to /auth/login if not authenticated
- getCurrentUser() — Get full user object from database
- getCurrentUserRole() — Get user role string
- isCurrentUserAdmin() — Check if admin
- requireAdminAccess() — Enforce admin, redirects to /unauthorized

## Database Best Practices

Use Drizzle type-safe operators. NEVER raw SQL for basic operations.

BAD: sql`${column} = ANY(${array})`
GOOD: import { inArray } from "drizzle-orm"; inArray(column, array)

Common operators: eq, ne, gt, gte, lt, lte, inArray, notInArray, and, or, isNull, like, between

## Server/Client Separation

- *-client.ts — Client-safe constants, types, pure functions
- *.ts — Server-only functions (may use next/headers, Supabase server client)

## Code Quality

- No any types
- No @ts-expect-error or eslint-disable
- No inline styles — use cn() with Tailwind
- Explicit return types for functions
- Use next/image for images
- No toasts in Server Actions (client components only)
- Redirect calls outside try-catch blocks

## Common Patterns

Protected page:
export default async function ProtectedPage() {
  await requireUserId();
  // render page
}

Admin page:
export default async function AdminPage() {
  await requireAdminAccess();
  // render admin content
}

Server Action:
"use server";
export async function myAction(): Promise<{ success: boolean; error?: string }> {
  const userId = await requireUserId();
  return { success: true };
}
