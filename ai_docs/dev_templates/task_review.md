# Task Review Checklist (worker-saas)

> **Note:** This checklist is tailored for the **worker-saas** template, which uses **Trigger.dev** for background job processing (audio/video transcription). This is a standard Next.js app (not a monorepo) with all paths at root level.

Use this checklist to verify implementation quality before marking a task complete. Run through each section systematically.

---

## 1. Type Safety

### 1.1 No `any` Types
```bash
# Search for any types in changed files
grep -r "any" --include="*.ts" --include="*.tsx" <changed-files>
```

**Check for:**
- [ ] No explicit `any` type annotations
- [ ] No implicit `any` from missing types
- [ ] Proper generics used where needed

### 1.2 Explicit Return Types
```typescript
// ❌ Bad
async function getUser(id: string) {
  return await db.query.users.findFirst({ where: eq(users.id, id) });
}

// ✅ Good
async function getUser(id: string): Promise<User | undefined> {
  return await db.query.users.findFirst({ where: eq(users.id, id) });
}
```

**Check for:**
- [ ] All functions have explicit return types
- [ ] Async functions return `Promise<T>`
- [ ] Void functions explicitly return `void` or `Promise<void>`

### 1.3 No Type Assertions Without Justification
```typescript
// ❌ Bad - hiding potential issues
const user = data as User;

// ✅ Good - validate first
if (isUser(data)) {
  const user = data;
}
```

---

## 2. Drizzle ORM

### 2.1 Type-Safe Operators (No Raw SQL)
```typescript
// ❌ Bad - SQL injection risk
sql`${column} = ANY(${array})`;
where: sql`user_id = ${userId}`;

// ✅ Good - Type-safe operators
import { eq, inArray, and, or, isNull, like, between } from 'drizzle-orm';
where: eq(users.id, userId);
where: inArray(posts.status, ['draft', 'published']);
```

**Available operators:** `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `inArray`, `notInArray`, `and`, `or`, `isNull`, `isNotNull`, `like`, `ilike`, `between`

### 2.2 Proper Transaction Usage
```typescript
// ✅ Good - atomic operations
await db.transaction(async (tx) => {
  await tx.insert(orders).values(orderData);
  await tx.update(inventory).set({ quantity: sql`quantity - 1` });
});
```

### 2.3 Select Only Needed Columns
```typescript
// ❌ Bad - fetching everything
const users = await db.select().from(usersTable);

// ✅ Good - specific columns
const users = await db.select({
  id: usersTable.id,
  email: usersTable.email,
}).from(usersTable);
```

---

## 3. Next.js 15 Patterns

### 3.1 Async Params/SearchParams
```typescript
// ✅ Server Components - await the promises
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ query?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { query } = await searchParams;
}

// ✅ Client Components - use React's use() hook
'use client';
import { use } from 'react';

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
}
```

### 3.2 revalidatePath with Dynamic Routes

**Only dynamic routes need the type parameter.** Static paths do not require it.

```typescript
// ✅ Dynamic routes - MUST include type parameter
revalidatePath('/transcripts/[jobId]', 'page');
revalidatePath('/api/users/[id]', 'layout');

// ✅ Static routes - type parameter NOT needed
revalidatePath('/history');
revalidatePath('/transcripts');
revalidatePath('/profile');
```

### 3.3 No Async Client Components
```typescript
// ❌ Bad - async client component
'use client';
export default async function Component() { // ERROR
  const data = await fetchData();
}

// ✅ Good - use hooks for data fetching
'use client';
import { useEffect, useState } from 'react';

export default function Component() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData().then(setData);
  }, []);
}
```

---

## 4. Server/Client Separation

### 4.1 File Naming Convention
```
lib/
├── storage-client.ts    # Client-safe: constants, types, pure functions
├── storage.ts           # Server-only: DB access, can re-export from -client
├── auth-client.ts       # Client-safe auth utilities
└── auth.ts              # Server-only auth (createClient, etc.)
```

### 4.2 No Mixed Imports
```typescript
// ❌ Bad - mixed concerns in one file
// lib/utils.ts
import { createClient } from '@/lib/supabase/server';  // Server-only
export const MAX_SIZE = 10 * 1024 * 1024;              // Client-safe

// ✅ Good - separate files
// lib/utils-client.ts
export const MAX_SIZE = 10 * 1024 * 1024;

// lib/utils.ts
import { createClient } from '@/lib/supabase/server';
export { MAX_SIZE } from './utils-client';
```

### 4.3 Server-Only Imports Check
```typescript
// These imports are SERVER-ONLY - never import in 'use client' files:
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/drizzle';
import { headers, cookies } from 'next/headers';
```

---

## 5. Security

### 5.1 Authentication on Protected Routes
```typescript
// ✅ Every protected API route must check auth
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ... rest of handler
}
```

### 5.2 Public Routes Configuration
Public routes are configured in `lib/supabase/middleware.ts`:

```typescript
// lib/supabase/middleware.ts
const publicRoutes = ["/", "/cookies", "/privacy", "/terms"];
const publicPatterns = ["/auth"];

const isPublicRoute =
  publicRoutes.includes(request.nextUrl.pathname) ||
  publicPatterns.some((pattern) =>
    request.nextUrl.pathname.startsWith(pattern)
  );
```

**When adding new public routes:**
- [ ] Add exact paths to `publicRoutes` array
- [ ] Add prefix patterns to `publicPatterns` array
- [ ] Webhooks are auto-skipped: `/api/webhooks/*`

### 5.3 Input Validation
```typescript
// ✅ Validate all user input
import { z } from 'zod';

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  published: z.boolean().default(false),
});

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const result = CreatePostSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.issues }, { status: 400 });
  }

  // Use result.data - it's typed!
}
```

### 5.4 No Secrets in Client Code
```typescript
// ❌ Bad - exposing secrets
const apiKey = process.env.STRIPE_SECRET_KEY; // In client component

// ✅ Good - only NEXT_PUBLIC_ vars in client
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
```

---

## 6. Trigger.dev Background Jobs

> **This template uses Trigger.dev v4 for background job processing.** Tasks are defined in the `trigger/tasks/` directory.

### 6.1 Task Structure
```typescript
// ✅ Proper task definition with typed payload
import { task, metadata, logger } from "@trigger.dev/sdk";

export interface MyTaskPayload {
  jobId: string;
  userId: string;
  // ... other typed fields
}

export const myTask = task({
  id: "my-task-id",
  run: async (payload: MyTaskPayload) => {
    const { jobId, userId } = payload;

    // Task implementation
    return { success: true };
  },
});
```

### 6.2 Progress Tracking with Metadata
```typescript
// ✅ Use metadata for real-time progress updates
import { metadata } from "@trigger.dev/sdk";

// Update progress percentage (0-100)
metadata.root.set("progress", 35);
metadata.root.set("currentStep", "Processing audio");

// On completion
metadata.root.set("progress", 100);
metadata.root.set("currentStep", "Complete");

// On error
metadata.root.set("progress", 0);
metadata.root.set("currentStep", "Failed");
metadata.root.set("error", error.message);
```

### 6.3 Error Handling in Tasks
```typescript
// ✅ Proper error handling with status updates
export const myTask = task({
  id: "my-task",
  run: async (payload: MyTaskPayload) => {
    try {
      // Task logic

      // Update database status on success
      await supabase
        .from("transcription_jobs")
        .update({ status: "completed", progress_percentage: 100 })
        .eq("id", payload.jobId);

      return { success: true };
    } catch (error) {
      // Update metadata for UI
      metadata.root.set("progress", 0);
      metadata.root.set("currentStep", "Failed");
      metadata.root.set("error", error instanceof Error ? error.message : String(error));

      // Update database status on failure
      await supabase
        .from("transcription_jobs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", payload.jobId);

      throw error; // Re-throw for Trigger.dev retry logic
    }
  },
});
```

### 6.4 User-Scoped Security Tags
```typescript
// ✅ Always include user tags when triggering tasks
import { tasks } from "@trigger.dev/sdk";

const handle = await tasks.trigger(
  "extract-audio",
  {
    jobId: jobData.id,
    userId: jobData.user_id,
    // ... other payload
  },
  {
    tags: [`user:${jobData.user_id}`], // User scoping for security
  }
);
```

### 6.5 Use Trigger.dev Logger
```typescript
// ✅ Use the Trigger.dev logger in tasks (not console.log)
import { logger } from "@trigger.dev/sdk";

logger.info("Starting task", { jobId, userId });
logger.error("Task failed", { error, jobId });
```

**Check for:**
- [ ] Tasks have typed payloads
- [ ] Progress tracked via `metadata.root.set()`
- [ ] Both success and failure update database status
- [ ] User tags included when triggering tasks
- [ ] Trigger.dev `logger` used instead of `console.log`

---

## 7. Error Handling

### 7.1 Consistent Error Responses
```typescript
// ✅ Standard error response format
return Response.json(
  { error: 'Resource not found' },
  { status: 404 }
);

// ✅ With details for validation errors
return Response.json(
  { error: 'Validation failed', details: result.error.issues },
  { status: 400 }
);
```

### 7.2 Try-Catch for External Calls
```typescript
// ✅ Wrap external API calls
try {
  const response = await stripe.customers.create({ email });
  return Response.json({ customerId: response.id });
} catch (error) {
  console.error('Stripe error:', error);
  return Response.json(
    { error: 'Payment service unavailable' },
    { status: 503 }
  );
}
```

### 7.3 Database Error Handling
```typescript
// ✅ Handle database errors gracefully
try {
  await db.insert(users).values(userData);
} catch (error) {
  if (error.code === '23505') { // Unique violation
    return Response.json({ error: 'Email already exists' }, { status: 409 });
  }
  console.error('Database error:', error);
  return Response.json({ error: 'Database error' }, { status: 500 });
}
```

---

## 8. Server Actions

### 8.1 Proper Server Action Structure
```typescript
// ✅ Server action with auth check
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  const name = formData.get('name') as string;

  // Validate input
  if (!name || name.length < 2) {
    return { error: 'Name must be at least 2 characters' };
  }

  // Perform action
  await db.update(profiles)
    .set({ name, updatedAt: new Date() })
    .where(eq(profiles.userId, user.id));

  revalidatePath('/profile');
  return {};
}
```

### 8.2 Return Types for Actions
```typescript
// ✅ Define clear return types
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createPost(data: CreatePostInput): Promise<ActionResult<{ id: string }>> {
  // ...
  return { success: true, data: { id: post.id } };
}
```

---

## 9. Logging

> **This template has a logger utility at `lib/logger.ts`** for environment-aware logging.

### 9.1 Use the Logger Utility
```typescript
// ✅ Use the logger for server-side logging (NOT in Trigger.dev tasks)
import { logger } from "@/lib/logger";

logger.debug("Debug info", data);  // Development only
logger.info("Info message");       // Development only
logger.warn("Warning message");    // Development only
logger.error("Error occurred", error);  // Development only (production suppressed)
```

### 9.2 Logger vs Console
```typescript
// ❌ Bad - raw console statements
console.log('user:', user);

// ✅ Good - use logger utility
logger.debug('user:', user);

// ✅ OK - console.error for critical errors that must appear in production logs
console.error('Failed to process payment:', error);
```

### 9.3 Trigger.dev Tasks Use Their Own Logger
```typescript
// In Trigger.dev tasks, use the SDK logger
import { logger } from "@trigger.dev/sdk";

// NOT the lib/logger.ts utility
```

---

## 10. Code Quality

### 10.1 No TODO/FIXME in Production Code
```bash
# Check for leftover TODOs
grep -r "TODO\|FIXME\|XXX\|HACK" --include="*.ts" --include="*.tsx" <changed-files>
```

### 10.2 No Console Statements (Except Error Logging)
```typescript
// ❌ Bad - debug logging
console.log('user:', user);

// ✅ OK - error logging
console.error('Failed to process payment:', error);

// ✅ Better - use logger utility
import { logger } from "@/lib/logger";
logger.error('Failed to process payment:', error);
```

### 10.3 No Commented-Out Code
```typescript
// ❌ Bad - dead code
// const oldImplementation = () => { ... };

// ✅ Good - remove it entirely, git has history
```

### 10.4 Consistent Naming
- **Files:** kebab-case (`user-profile.tsx`)
- **Components:** PascalCase (`UserProfile`)
- **Functions:** camelCase (`getUserProfile`)
- **Constants:** SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Types/Interfaces:** PascalCase (`UserProfile`, `CreateUserInput`)

---

## 11. Testing Checklist

### 11.1 Manual Testing
- [ ] Happy path works as expected
- [ ] Error states handled gracefully
- [ ] Loading states display correctly
- [ ] Auth redirects work properly

### 11.2 Edge Cases
- [ ] Empty states handled
- [ ] Invalid input rejected
- [ ] Unauthorized access blocked
- [ ] Network errors handled

### 11.3 Trigger.dev Task Testing
- [ ] Task triggers successfully
- [ ] Progress updates appear in UI
- [ ] Failure states update database correctly
- [ ] Retries work as expected

### 11.4 Type Checking
```bash
# Run TypeScript compiler
npm run type-check
# or
npx tsc --noEmit
```

---

## 12. Final Verification

Before marking complete, verify:

- [ ] `npm run type-check` passes (or `npx tsc --noEmit`)
- [ ] `npm run lint` passes
- [ ] No `any` types introduced
- [ ] All functions have explicit return types
- [ ] Server/client separation maintained
- [ ] Auth checks on all protected routes
- [ ] Input validation on all user input
- [ ] Error handling is consistent
- [ ] No debug console.logs left behind
- [ ] revalidatePath includes type parameter for **dynamic routes only**
- [ ] Trigger.dev tasks use metadata for progress tracking
- [ ] Trigger.dev tasks handle errors and update database status

---

## Quick Reference: Common Mistakes

| Mistake | Fix |
|---------|-----|
| `any` type | Use specific type or generic |
| Missing return type | Add explicit `: ReturnType` |
| Raw SQL in Drizzle | Use `eq`, `inArray`, etc. |
| Async client component | Use `useEffect` + `useState` |
| Missing auth check | Add `getUser()` check first |
| `revalidatePath('/path/[id]')` | `revalidatePath('/path/[id]', 'page')` |
| Server import in client | Create `-client.ts` file |
| `console.log` debugging | Use `logger` utility or remove |
| Missing task progress | Use `metadata.root.set()` |
| Missing user tags | Add `tags: [\`user:${userId}\`]` when triggering |
| Using console.log in tasks | Use `logger` from `@trigger.dev/sdk` |
