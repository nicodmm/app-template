# /task_template - AI Task Template for Worker-SaaS Development

> **Slash Command:** Use this template when creating comprehensive task documents for AI-driven development in the worker-saas template.
>
> **Usage:** `/task_template` to invoke this template and start creating a new task document
>
> **Purpose:** This template includes worker-saas specific guidance for Trigger.dev background jobs, task orchestration, and async workflows.

---
# AI Task Template

> **Instructions:** This template helps you create comprehensive task documents for AI-driven development. Fill out each section thoroughly to ensure the AI agent has all necessary context and can execute the task systematically.

---

## 1. Task Overview

### Task Title
<!-- Provide a clear, specific title for this task -->
**Title:** [Brief, descriptive title of what you're building/fixing]

### Goal Statement
<!-- One paragraph describing the high-level objective -->
**Goal:** [Clear statement of what you want to achieve and why it matters]

---

## 2. Strategic Analysis & Solution Options

### When to Use Strategic Analysis
<!-- 
AI Agent: Use your judgement to determine when strategic analysis is needed vs direct implementation.

**✅ CONDUCT STRATEGIC ANALYSIS WHEN:**
- Multiple viable technical approaches exist
- Trade-offs between different solutions are significant
- User requirements could be met through different UX patterns
- Architectural decisions will impact future development
- Implementation approach affects performance, security, or maintainability significantly
- Change touches multiple systems or has broad impact
- User has expressed uncertainty about the best approach

**❌ SKIP STRATEGIC ANALYSIS WHEN:**
- Only one obvious technical solution exists
- It's a straightforward bug fix or minor enhancement 
- The implementation pattern is clearly established in the codebase
- Change is small and isolated with minimal impact
- User has already specified the exact approach they want

**DEFAULT BEHAVIOR:** When in doubt, provide strategic analysis. It's better to over-communicate than to assume.
-->

### Problem Context
<!-- Restate the problem and why it needs strategic consideration -->
[Explain the problem and why multiple solutions should be considered - what makes this decision important?]

### Solution Options Analysis

#### Option 1: [Solution Name]
**Approach:** [Brief description of this solution approach]

**Pros:**
- ✅ [Advantage 1 - specific benefit]
- ✅ [Advantage 2 - quantified when possible]
- ✅ [Advantage 3 - why this is better]

**Cons:**
- ❌ [Disadvantage 1 - specific limitation]
- ❌ [Disadvantage 2 - trade-off or cost]
- ❌ [Disadvantage 3 - risk or complexity]

**Implementation Complexity:** [Low/Medium/High] - [Brief justification]
**Risk Level:** [Low/Medium/High] - [Primary risk factors]

#### Option 2: [Solution Name]
**Approach:** [Brief description of this solution approach]

**Pros:**
- ✅ [Advantage 1]
- ✅ [Advantage 2]
- ✅ [Advantage 3]

**Cons:**
- ❌ [Disadvantage 1]
- ❌ [Disadvantage 2]
- ❌ [Disadvantage 3]

**Implementation Complexity:** [Low/Medium/High] - [Brief justification]
**Risk Level:** [Low/Medium/High] - [Primary risk factors]

#### Option 3: [Solution Name] (if applicable)
**Approach:** [Brief description of this solution approach]

**Pros:**
- ✅ [Advantage 1]
- ✅ [Advantage 2]

**Cons:**
- ❌ [Disadvantage 1]
- ❌ [Disadvantage 2]

**Implementation Complexity:** [Low/Medium/High] - [Brief justification]
**Risk Level:** [Low/Medium/High] - [Primary risk factors]

### Recommendation & Rationale

**🎯 RECOMMENDED SOLUTION:** Option [X] - [Solution Name]

**Why this is the best choice:**
1. **[Primary reason]** - [Specific justification]
2. **[Secondary reason]** - [Supporting evidence]
3. **[Additional reason]** - [Long-term considerations]

**Key Decision Factors:**
- **Performance Impact:** [How this affects app performance]
- **User Experience:** [How this affects users]
- **Maintainability:** [How this affects future development]
- **Scalability:** [How this handles growth]
- **Security:** [Security implications]

**Alternative Consideration:**
[If there's a close second choice, explain why it wasn't selected and under what circumstances it might be preferred]

### Decision Request

**👤 USER DECISION REQUIRED:**
Based on this analysis, do you want to proceed with the recommended solution (Option [X]), or would you prefer a different approach? 

**Questions for you to consider:**
- Does the recommended solution align with your priorities?
- Are there any constraints or preferences I should factor in?
- Do you have a different timeline or complexity preference?

**Next Steps:**
Once you approve the strategic direction, I'll update the implementation plan and present you with next step options.

---

## 3. Project Analysis & Current State

### Technology & Architecture
<!-- 
AI Agent: Analyze the project to fill this out.
- Check `package.json` for versions and dependencies.
- Check `tsconfig.json` for TypeScript configuration.
- Check `tailwind.config.ts` for styling and theme.
- Check `drizzle/schema/` for database schema.
- Check `middleware.ts` for authentication and routing.
- Check `components/` for existing UI patterns. 
-->
- **Frameworks & Versions:** [e.g., Next.js 15.3, React 19]
- **Language:** [e.g., TypeScript 5.4 with strict mode]
- **Database & ORM:** [e.g., Supabase (Postgres) via Drizzle ORM]
- **UI & Styling:** [e.g., shadcn/ui components with Tailwind CSS v4 for styling]
- **Authentication:** [e.g., Supabase Auth managed by `middleware.ts` for protected routes]
- **Background Jobs:** [e.g., Trigger.dev v4 for async task orchestration, retries, progress tracking, real-time metadata updates]
- **AI Integration:** [e.g., OpenAI API (Whisper for transcription, GPT-4o for summaries)]
- **Media Processing:** [e.g., FFmpeg extension for audio/video extraction and chunking]
- **Key Architectural Patterns:** [e.g., Next.js App Router, Server Components for data fetching, **Server Actions (app/actions/) trigger background jobs (preferred pattern)**, Background task chaining (extract → transcribe → summarize), Real-time progress tracking via Trigger.dev metadata, Tasks update database directly using Supabase client with service role, **Type-only imports for task references to avoid bundling dependencies**]
- **Task Triggering Pattern:**
  - **Server Actions (`app/actions/`)**: Preferred method for internal task triggers from Next.js app
  - **API Routes (`app/api/`)**: Only for external service webhooks (Stripe, Trigger.dev callbacks)
  - **Type-Only Imports**: Use `import type { taskName } from "@/trigger/tasks"` to avoid bundling task dependencies
- **Relevant Existing Components:** [e.g., `components/ui/button.tsx` for base styles, `trigger/tasks/extract-audio.ts` for task patterns, `trigger/utils/ffmpeg.ts` for utility patterns]

### Current State
<!-- Describe what exists today based on actual analysis -->
[Describe the current situation, existing code, and what's working/not working - based on actual file analysis, not assumptions]

### Existing Codebase Analysis
<!--
AI Agent: Analyze the existing codebase to understand current implementation.
Check the areas below that are RELEVANT to your task - you don't need to analyze everything.
-->

**🔍 Analysis Checklist - Check What's Relevant:**

- [ ] **Context Providers** (`contexts/`, `app/(protected)/layout.tsx`)
  - What data is available via context? (useUser, useUsage, custom contexts)
  - Which components are inside which context providers?
  - Do you need data that's already in context vs. fetching it again?

- [ ] **Server Actions** (`app/actions/*.ts`)
  - What mutations exist? (create, update, delete operations)
  - What data fetching patterns are used?
  - Can you reuse existing actions or do you need new ones?

- [ ] **Database Schema** (`lib/drizzle/schema/*.ts`)
  - What tables exist and their relationships?
  - What columns are available on relevant tables?
  - Are there indexes, RLS policies, constraints to consider?

- [ ] **Authentication/Authorization** (`lib/auth.ts`, `middleware.ts`)
  - How is auth handled? (requireUserId, requireAdminAccess, etc.)
  - What user roles exist?
  - What routes are protected?

- [ ] **Lib Utilities** (`lib/*.ts`, `lib/*-client.ts`)
  - What helper functions exist that you can reuse?
  - Server-only vs. client-safe utilities?
  - Any existing patterns for your use case?

- [ ] **Trigger.dev Tasks** (`trigger/tasks/`, `trigger/utils/`)
  - What tasks already exist and how do they chain?
  - What utilities are available for reuse?
  - What extensions are configured in trigger.config.ts?
  - How are tasks currently triggered (Server Actions? API routes?)

- [ ] **Component Patterns** (`components/ui/`, `components/[feature]/`)
  - What reusable components exist (buttons, forms, dialogs)?
  - What patterns are used (loading states, error boundaries)?
  - Any feature-specific components you can extend?

- [ ] **API Routes** (`app/api/`)
  - What webhooks exist? (Stripe, Trigger.dev callbacks)
  - Any public APIs?
  - Patterns for handling external requests?

**🎯 Agent Decision Guide:**
- Implementing UI? → Focus on Context Providers, Components, Server Actions
- Building background jobs? → Focus on Trigger.dev Tasks, Database Schema
- Adding auth features? → Focus on Authentication, Server Actions, Database Schema
- Modifying data flow? → Focus on Database Schema, Server Actions, Context Providers

## 4. Context & Problem Definition

### Problem Statement
<!-- What specific problem are you solving? -->
[Detailed explanation of the problem, including pain points, user impact, and why this needs to be solved now]

### Success Criteria
<!-- How will you know this is complete and successful? -->
- [ ] [Specific, measurable outcome 1]
- [ ] [Specific, measurable outcome 2]
- [ ] [Specific, measurable outcome 3]

---

## 5. Development Mode Context

### Development Mode Context
- **🚨 IMPORTANT: This is a new application in active development**
- **No backwards compatibility concerns** - feel free to make breaking changes
- **Data loss acceptable** - existing data can be wiped/migrated aggressively
- **Users are developers/testers** - not production users requiring careful migration
- **Priority: Speed and simplicity** over data preservation
- **Aggressive refactoring allowed** - delete/recreate components as needed

---

## 6. Technical Requirements

### Functional Requirements
<!-- What should the system do? -->
- [Requirement 1: User can...]
- [Requirement 2: System will...]
- [Requirement 3: When X happens, then Y...]

### Non-Functional Requirements
<!-- Performance, security, usability, etc. -->
- **Performance:** [Response time, throughput, etc.]
- **Security:** [Authentication, authorization, data protection]
- **Usability:** [User experience requirements]
- **Responsive Design:** Must work on mobile (320px+), tablet (768px+), and desktop (1024px+)
- **Theme Support:** Must support both light and dark mode using existing theme system
- **Compatibility:** [Browser support, device support, etc.]

### Technical Constraints
<!-- What limitations exist? -->
- [Constraint 1: Must use existing X system]
- [Constraint 2: Cannot modify Y database table]
- [Constraint 3: Must be backward compatible with Z]

---

## 7. Data & Database Changes

### Database Schema Changes
<!-- If any database changes are needed -->
```sql
-- Example: New table creation
-- Include all DDL statements, migrations, indexes
```

### Data Model Updates
<!-- Changes to TypeScript types, Drizzle schemas, etc. -->
```typescript
// Example: New types or schema updates.
// When defining Drizzle schemas, consider adding indexes for frequently queried columns.
// e.g. import { index } from "drizzle-orm/pg-core";
//      pgTable(..., (table) => ([ index("name_idx").on(table.name) ]));
```

### Data Migration Plan
<!-- How to handle existing data -->
- [ ] [Migration step 1]
- [ ] [Migration step 2]
- [ ] [Data validation steps]

### 🚨 MANDATORY: Down Migration Safety Protocol
**CRITICAL REQUIREMENT:** Before running ANY database migration, you MUST create the corresponding down migration file following the `drizzle_down_migration.md` template process:

- [ ] **Step 1: Generate Migration** - Run `npm run db:generate` to create the migration file
- [ ] **Step 2: Create Down Migration** - Follow `drizzle_down_migration.md` template to analyze the migration and create the rollback file
- [ ] **Step 3: Create Subdirectory** - Create `drizzle/migrations/[timestamp_name]/` directory  
- [ ] **Step 4: Generate down.sql** - Create the `down.sql` file with safe rollback operations
- [ ] **Step 5: Verify Safety** - Ensure all operations use `IF EXISTS` and include appropriate warnings
- [ ] **Step 6: Apply Migration** - Only after down migration is created, run `npm run db:migrate`

**🛑 NEVER run `npm run db:migrate` without first creating the down migration file!**

---

## 8. Backend Changes & Background Jobs

### Data Access Patterns - CRITICAL ARCHITECTURE RULES

**🚨 MANDATORY: Follow these rules strictly:**

#### **MUTATIONS (Server Actions)** → `app/actions/[feature].ts`
- [ ] **Server Actions File** - ONLY mutations (create, update, delete)
- [ ] Must use `'use server'` directive and `revalidatePath()` after mutations
- [ ] **What qualifies**: POST/PUT/DELETE operations, form submissions, data modifications
- [ ] **Triggering Tasks**: Server Actions trigger Trigger.dev tasks (preferred pattern)

#### **QUERIES (Data Fetching)** → Choose based on complexity:

**Simple Queries** → Direct in Server Components
- [ ] Direct `await db.select().from(table)` calls
- [ ] Use when: Single table, simple WHERE clause, 1-2 places

**Complex Queries** → `lib/[feature].ts`
- [ ] Query functions for complex/reused logic
- [ ] Use when: JOINs, aggregations, 3+ places, business logic

#### **API Routes** → `app/api/[endpoint]/route.ts` - **RARELY NEEDED**
🛑 **Only for:**
- [ ] Webhooks (Stripe, Trigger.dev callbacks)
- [ ] Non-HTML responses (file downloads, exports)
- [ ] External API proxies (hide API keys)
- [ ] Public APIs (external consumption)

❌ **NOT for:** Internal data fetching, form submissions, auth flows

#### **DECISION FLOWCHART - "Where should this code go?"**

```
📝 What are you building?
│
├─ 🔄 Modifying data? (POST/PUT/DELETE)
│  └─ ✅ Server Actions: `app/actions/[feature].ts`
│
├─ 📊 Fetching data? (GET operations)
│  ├─ Simple query (1 table, basic WHERE)?
│  │  └─ ✅ Direct in Server Component
│  └─ Complex query (JOINs, reused, business logic)?
│     └─ ✅ lib function: `lib/[feature].ts`
│
└─ 🌐 External integration?
   ├─ Webhook from 3rd party?
   │  └─ ✅ API Route: `app/api/webhooks/[service]/route.ts`
   └─ Internal app feature?
      └─ ❌ NO API ROUTE! Use Server Actions or lib/
```

### Server Actions
- [ ] **`create[Model]`** - [Description]
- [ ] **`update[Model]`** - [Description]
- [ ] **`delete[Model]`** - [Description]
- [ ] **`trigger[Task]Job`** - [Trigger background task, store run ID]

### Database Queries
- [ ] **Direct in Server Components** - Simple queries
- [ ] **Query Functions in lib/** - Complex queries

### API Routes (Only for Special Cases)
- [ ] **Webhooks** - Third-party callbacks
- [ ] **Non-HTML Responses** - File downloads, exports
- [ ] **Public APIs** - External consumption

---

## 8.1. Trigger.dev Task Architecture

**📋 For detailed workflow patterns, see `ai_docs/prep/trigger_workflows.md` (index) or specific workflow files like `ai_docs/prep/trigger_workflow_transcription.md`**

### When to Use Trigger.dev?

```
🤔 Evaluating operation...
│
├─ ⏱️ Operation takes >2 seconds? → ✅ Use Trigger.dev
├─ 🤖 AI API calls? → ✅ Use Trigger.dev
├─ 🎥 Media processing? → ✅ Use Trigger.dev
├─ 🔄 Requires retry logic? → ✅ Use Trigger.dev
├─ ⚡ Fast DB query (<2s)? → ❌ Server Action
└─ 🔒 Synchronous workflow? → ❌ Server Action
```

### Task Definition Pattern

```typescript
// trigger/tasks/example-task.ts
import { task, metadata } from "@trigger.dev/sdk";

export const exampleTask = task({
  id: "example-task",
  run: async (payload: { jobId: string }) => {
    metadata.set("progress", 50);
    metadata.set("currentStep", "Processing...");

    // Task logic

    return { success: true };
  },
});
```

### Triggering Tasks from Server Actions

```typescript
// app/actions/process-file.ts
"use server";
import { tasks } from "@trigger.dev/sdk";
import type { processFileTask } from "@/trigger/tasks/process-file";

export async function triggerFileProcessing(fileId: string) {
  const handle = await tasks.trigger<typeof processFileTask>(
    "process-file",
    { fileId }
  );

  // Store run ID for tracking
  await db.update(jobs).set({ triggerRunId: handle.id }).where(eq(jobs.id, fileId));

  return { runId: handle.id };
}
```

### Extensions (Add to trigger.config.ts)

- **FFmpeg** - Audio/video processing (`FFMPEG_PATH`, `FFPROBE_PATH`)
- **Playwright** - Browser automation (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`)
- **Puppeteer** - Alternative browser automation
- **Prisma** - Database ORM support
- **Python** - Run Python scripts (`PYTHON_PATH`)
- **Resend** - Email sending (uses `RESEND_API_KEY`)

**Add to trigger.config.ts:**
```typescript
import { ffmpeg } from "@trigger.dev/build/extensions/core";
export default defineConfig({
  build: { extensions: [ffmpeg()] }
});
```

### Real-time Progress Tracking

- **`metadata.set()`** - Discrete updates (progress %, step descriptions)
- **`streams.pipe()`** - Streaming data (AI responses, logs) - **Current API (v4.1+)**
  - ⚠️ **Note:** `metadata.stream()` is deprecated, use `streams.pipe()` instead
  - Returns an object with `{ stream }` property - must destructure to access the iterable
- **`metadata.root.set()`** - Child tasks update root task's metadata (multi-task workflows)
- **Frontend**: Use `useRealtimeRun()` from `@trigger.dev/react-hooks`

#### **Streaming Pattern (v4.1+)**

```typescript
import { logger, task, metadata, streams } from "@trigger.dev/sdk";

// Inside task run function:
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: prompt }],
  stream: true, // Enable streaming
});

// Register stream with Trigger.dev (v4.1+ API)
const { stream } = await streams.pipe("streamKey", completion);

// Iterate over stream chunks
for await (const chunk of stream) {
  // Process chunk data
  const content = chunk.choices[0]?.delta?.content || "";
  // Accumulate or process...
}
```

**Key Points:**
- Import `streams` from `@trigger.dev/sdk` (not just `metadata`)
- Use `await streams.pipe(key, asyncIterable)` to register the stream
- **Destructure** `{ stream }` from the return value (this is critical!)
- The `stream` property is the async iterable you can `for await` over
- Frontend can subscribe to the stream using `useRealtimeRunWithStreams` hook

#### **Frontend Real-time Run Tracking Best Practices**

**🚨 CRITICAL: Proper useRealtimeRun Callback Handling**

The `onComplete` callback from `useRealtimeRun()` fires prematurely when the SDK detects internal state transitions, but BEFORE the run status is truly 'COMPLETED'. This causes race conditions where completion callbacks trigger while the run is still queued or processing.

**❌ WRONG PATTERN - Do NOT rely on onComplete callback:**
```typescript
const { run, error } = useRealtimeRun(runId, {
  accessToken,
  onComplete: () => {
    // ❌ Fires too early - run may still be QUEUED or EXECUTING
    // This causes jobs to move to "completed" section prematurely
    onComplete?.();
    router.refresh();
  }
});
```

**✅ CORRECT PATTERN - Use useEffect to watch run.status:**
```typescript
const { run, error } = useRealtimeRun(runId, {
  accessToken,
  // Don't use onComplete callback - it fires prematurely
});

// Watch for true completion via status check
useEffect(() => {
  if (run?.status === 'COMPLETED') {
    // ✅ Only fires when status is truly COMPLETED
    // Database updates are finished, safe to update UI
    onComplete?.();
    router.refresh();
  }
}, [run?.status, onComplete]);
```

**Why this matters:**
- `onComplete` callback fires based on SDK internal logic, not actual run status
- Database updates may still be in-flight when callback fires
- `run.status === 'COMPLETED'` guarantees the run is fully finished
- Prevents race conditions, premature UI updates, and stale data issues
- Same pattern applies to error states: check `run?.status === 'FAILED'`

**Real-world impact:** Without this pattern, jobs appear in "Completed" section while still showing "Queued" status, requiring manual page refresh to see correct state.

#### **Root Metadata Updates (Multi-Task Workflows)**

When child tasks need to update progress visible to users monitoring the root task:

**Pattern:**
```typescript
export const childTask = task({
  id: "child-task",
  run: async (payload) => {
    // Update root task's metadata (propagates all the way up)
    metadata.root.set("progress", 50);
    metadata.root.set("currentStep", "Child task processing");
  },
});
```

**Use this pattern when:**
- Root task uses `triggerAndWait()` to call child tasks in a chain
- UI monitors root task's run ID
- Users need to see progress from nested child tasks
- **Important:** Use `metadata.root.set()` instead of `metadata.parent.set()` to ensure updates propagate through all nesting levels to the root task that the frontend subscribes to

**Documentation:** See `ai_docs/dev_templates/trigger_workflow_orchestrator.md` section 3 "Progress Tracking Strategy" for full pattern details and examples.

**📋 For detailed examples, see `ai_docs/planning/trigger_dev_research.md`**

---

### 8.1.1 Task Utilities & Dependencies

#### Task Utility Organization
<!-- Utilities used by background tasks in trigger/utils/ -->

**Example from worker-saas:**
- [ ] **`trigger/utils/openai.ts`** - OpenAI client singleton for Whisper + GPT-4o
- [ ] **`trigger/utils/ffmpeg.ts`** - Audio extraction, chunking, metadata functions
- [ ] **`trigger/utils/prompts.ts`** - AI prompt templates for summaries
- [ ] **`trigger/utils/formats.ts`** - Whisper response to SRT/VTT/JSON converters

**Your Utilities:**
- [ ] **`trigger/utils/[feature].ts`** - Purpose and exports
- [ ] **Example:** Singleton API clients, media processing, data transformation

**Utility Requirements:**
- **Node.js APIs:** Can use `fs`, `stream`, `path`, `os`, etc. (server-only environment)
- **External APIs:** Singleton clients for OpenAI, Anthropic, etc.
- **Type Safety:** Export TypeScript interfaces and types
- **Reusability:** Functions used by multiple tasks
- **Binary Configuration:** Set binary paths using extension environment variables

#### New Tasks to Create
<!-- Tasks to create in trigger/tasks/ directory -->
- [ ] **`trigger/tasks/task-name.ts`** - Purpose, payload type, chaining logic
  - **Task ID:** `task-name` (kebab-case)
  - **Payload Interface:** Define all required fields with types
  - **Return Type:** Define success/error response structure
  - **Chaining:** Which tasks does this trigger? Use `trigger()` or `triggerAndWait()`?
  - **Progress Tracking:** Update metadata at key steps (10%, 30%, 50%, 90%, 100%)
  - **Database Updates:** Which tables are updated? (jobs table, results table, usage tracking)

#### Task Modifications
<!-- Existing tasks that need changes -->
- [ ] **`trigger/tasks/existing-task.ts`** - What changes are needed
  - **Modifications:** Update payload, add new logic, change chaining

#### External API Dependencies
<!-- Third-party APIs used by tasks -->
- **OpenAI API** - Whisper, GPT-4o (API key required)
- **Anthropic API** - Claude models (if needed)
- **Custom APIs** - Any other services

---

### External Integrations
- [Service: Purpose and configuration]
- [API keys and setup required]

**🚨 MANDATORY: Use Latest AI Models**
- OpenAI: **gpt-4o** (never gpt-3.5-turbo)
- Anthropic: **claude-sonnet-4** or **claude-opus-4**

---

## 9. Frontend Changes

### New Components
<!-- Components to create in components/ directory, organized by feature -->
- [ ] **`components/[feature]/ComponentName.tsx`** - [Purpose and props]
- [ ] **`components/[feature]/AnotherComponent.tsx`** - [Functionality description]

**Component Organization Pattern:**
- Use `components/[feature]/` directories for feature-specific components
- Example: `components/chat/`, `components/auth/`, `components/dashboard/`
- Keep shared/reusable components in `components/ui/` (existing pattern)
- Import into pages from the global components directory

**Component Requirements:**
- **Responsive Design:** Use mobile-first approach with Tailwind breakpoints (`sm:`, `md:`, `lg:`)
- **Theme Support:** Use CSS variables for colors, support `dark:` classes for dark mode
- **Accessibility:** Follow WCAG AA guidelines, proper ARIA labels, keyboard navigation
- **Text Sizing & Readability:**
  - Main content (transcripts, messages, articles): Use `text-base` (16px) or larger for comfortable reading
  - UI chrome (timestamps, metadata, secondary labels): Can use `text-sm` (14px) or `text-xs` (12px)
  - Prose content: Use default `prose` class, not `prose-sm`, unless space is severely constrained
  - Prioritize readability over compact layouts - users shouldn't strain to read content

### Page Updates
<!-- Pages that need changes -->
- [ ] **`/path/to/page`** - [What changes are needed]
- [ ] **`/another/page`** - [Modifications required]

### State Management
<!-- How data flows through the app -->
- [Context providers, global state, local state decisions]
- [Data fetching strategies]

#### Real-time Run State Management

**When using `useRealtimeRun()` for Trigger.dev task tracking:**

- [ ] **Never rely on `onComplete` callback** - fires prematurely before run status is truly 'COMPLETED'
- [ ] **Always use `useEffect` to watch `run?.status`** - only trigger actions when status changes to 'COMPLETED'
- [ ] **Pattern**: Check `run?.status === 'COMPLETED'` in useEffect dependency array
- [ ] **Parent callbacks**: Only call `onComplete?.()` or `router.refresh()` after verifying completion status
- [ ] **Error handling**: Similarly watch `run?.status === 'FAILED'` for error states
- [ ] **Avoid race conditions**: Never move items between state arrays (in-progress → completed) based on `onComplete` callback timing

**Example Pattern:**
```typescript
const { run } = useRealtimeRun(runId, { accessToken });

// ✅ Correct: Watch status in useEffect
useEffect(() => {
  if (run?.status === 'COMPLETED' && onComplete) {
    onComplete();
  }
}, [run?.status, onComplete]);
```

### 🚨 CRITICAL: Multi-Stage Workflow State Management

When implementing workflows where items move through multiple stages (Upload → In Progress → Completed), follow these critical patterns to avoid common state synchronization issues.

#### Architecture Pattern: Parent-Owned State

**Rule**: Parent component owns canonical state for ALL workflow stages. Child components either render props directly (stateless) OR maintain internal state that syncs via useEffect.

**✅ CORRECT: Parent owns state, children sync properly**
```typescript
// TranscriptsPageClient.tsx (Parent Component)
export default function TranscriptsPageClient({
  initialInProgressJobs,
  initialCompletedJobs
}) {
  // Parent owns canonical state for entire workflow
  const [inProgressJobs, setInProgressJobs] = useState(initialInProgressJobs);
  const [completedJobs, setCompletedJobs] = useState(initialCompletedJobs);

  // Parent handles state transitions between stages
  const handleJobComplete = useCallback((jobId: string) => {
    const completedJob = inProgressJobs.find(job => job.id === jobId);
    if (!completedJob) return;

    const updatedJob = { ...completedJob, status: "completed", completed_at: new Date() };

    // Remove from in-progress
    setInProgressJobs(prev => prev.filter(job => job.id !== jobId));

    // Add to completed
    setCompletedJobs(prev => [updatedJob, ...prev]);
  }, [inProgressJobs]);

  return (
    <>
      <InProgressJobsList
        jobs={inProgressJobs}
        onJobComplete={handleJobComplete}
      />
      <CompletedJobsList initialJobs={completedJobs} />
    </>
  );
}
```

**❌ WRONG: Child component ignores parent state updates**
```typescript
// CompletedJobsList.tsx - ANTI-PATTERN
export default function CompletedJobsList({ initialJobs }) {
  // ❌ Initialized from props but never syncs with parent updates
  const [jobs, setJobs] = useState(initialJobs);

  // ❌ When parent adds new job to initialJobs, this component won't show it!
  // Jobs will disappear from UI until page refresh
  return jobs.map(job => <JobCard job={job} />);
}
```

#### Child Component State Synchronization Patterns

**Pattern 1: Stateless Child (Preferred - Use When Possible)**
```typescript
// Child receives props and renders directly - no internal state
export default function InProgressJobsList({ jobs, onJobComplete }) {
  return jobs.map(job => (
    <JobListItem
      key={job.id}
      job={job}
      onJobComplete={onJobComplete}
    />
  ));
}
```

**When to use**: Child only displays data without pagination, sorting, or filtering

**Pattern 2: Stateful Child with Merge Sync (When Child Needs Internal State)**
```typescript
// CompletedJobsList.tsx - Child needs pagination/sorting state
export default function CompletedJobsList({ initialJobs }) {
  // Child maintains state for pagination and sorting
  const [jobs, setJobs] = useState(initialJobs);
  const [sortOrder, setSortOrder] = useState("newest");

  // ✅ CRITICAL: Sync with parent updates via useEffect with MERGE strategy
  useEffect(() => {
    setJobs(current => {
      // Deduplicate: only add jobs not already in state
      const currentIds = new Set(current.map(j => j.id));
      const newJobs = initialJobs.filter(j => !currentIds.has(j.id));

      // Merge: preserve existing jobs (pagination) + add new ones
      return [...newJobs, ...current]; // New jobs first (typically newer)
    });
  }, [initialJobs]);

  // Apply sorting to merged state
  const sortedJobs = useMemo(() =>
    [...jobs].sort((a, b) => sortOrder === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt),
    [jobs, sortOrder]
  );

  return sortedJobs.map(job => <JobCard job={job} />);
}
```

**When to use**: Child manages pagination, sorting, filtering, or "Load More" functionality

**Pattern 3: Server Data Merge (Preserve Client-Side Optimistic Updates)**
```typescript
// Parent component - merge server data with optimistic client updates
export default function TranscriptsPageClient({ initialInProgressJobs }) {
  const [inProgressJobs, setInProgressJobs] = useState(initialInProgressJobs);

  // Track jobs completed locally (optimistic update)
  const locallyCompletedJobs = useRef(new Set());

  // Sync with server updates while preserving client-side changes
  useEffect(() => {
    setInProgressJobs(currentJobs => {
      // Filter out jobs completed locally (don't re-add them)
      const filteredServerJobs = initialInProgressJobs.filter(
        job => !locallyCompletedJobs.current.has(job.id)
      );

      // Merge server updates with local state
      const currentJobsMap = new Map(currentJobs.map(j => [j.id, j]));
      const mergedJobs = filteredServerJobs.map(serverJob => {
        const currentJob = currentJobsMap.get(serverJob.id);
        // If job exists locally, merge server updates (e.g., trigger_job_id)
        return currentJob ? { ...currentJob, ...serverJob } : serverJob;
      });

      return mergedJobs;
    });
  }, [initialInProgressJobs]);
}
```

**When to use**: Optimistic UI updates may conflict with server data (avoid re-adding completed jobs)

#### Decision Flowchart: Should My Child Component Have Internal State?

```
📊 Does my child component need internal state?
│
├─ 📝 Does it manage pagination, sorting, or filtering?
│  └─ ✅ YES: Use Pattern 2 (Stateful with Merge Sync)
│     - Add useEffect to sync with parent props
│     - Use merge strategy to preserve pagination
│     - Deduplicate using Set-based ID tracking
│
├─ 🔄 Does parent make optimistic updates that could conflict with server?
│  └─ ✅ YES: Use Pattern 3 (Server Data Merge)
│     - Track local changes in ref
│     - Filter server data to exclude local changes
│     - Merge remaining server updates
│
└─ 🎯 Does it just display data without modification?
   └─ ✅ YES: Use Pattern 1 (Stateless - props only)
      - No internal state needed
      - Simplest and most reliable pattern
```

#### Common Anti-Patterns to Avoid

**❌ ANTI-PATTERN 1: Child initialized from props, never syncs**
```typescript
// Component becomes stale when parent updates state
const [jobs, setJobs] = useState(initialJobs); // ❌ Missing useEffect sync!

// Result: New jobs added by parent won't appear until page refresh
```

**❌ ANTI-PATTERN 2: Parent tries to control child state via props**
```typescript
// Parent component
<CompletedJobsList jobs={completedJobs} />

// Child component
const [jobs, setJobs] = useState(initialJobs); // ❌ Ignores 'jobs' prop updates!

// Result: Parent and child states are out of sync
```

**❌ ANTI-PATTERN 3: Replacing state instead of merging**
```typescript
// ❌ Loses pagination, user scroll position, loaded items
useEffect(() => {
  setJobs(initialJobs); // Replaces everything! Pagination lost!
}, [initialJobs]);

// ✅ Merge new items instead
useEffect(() => {
  setJobs(current => {
    const currentIds = new Set(current.map(j => j.id));
    const newJobs = initialJobs.filter(j => !currentIds.has(j.id));
    return [...newJobs, ...current]; // Preserves existing items
  });
}, [initialJobs]);
```

**❌ ANTI-PATTERN 4: Using onComplete callback from useRealtimeRun**
```typescript
// ❌ SDK callback fires prematurely (when status is QUEUED, not COMPLETED)
const { run } = useRealtimeRun(runId, {
  onComplete: () => handleJobComplete(jobId) // Fires too early!
});

// ✅ Watch run.status in useEffect instead
useEffect(() => {
  if (run?.status === 'COMPLETED') {
    handleJobComplete(jobId); // Only when truly complete
  }
}, [run?.status]);
```

#### Verification Checklist

When implementing multi-stage workflows, verify:

- [ ] **Parent owns canonical state** for all stages (in-progress, completed, failed)
- [ ] **State transitions handled by parent** via callbacks passed to children
- [ ] **Child components are either**:
  - [ ] Stateless (use props directly) OR
  - [ ] Stateful with useEffect sync (merge strategy)
- [ ] **Deduplication logic** prevents duplicate items (Set-based ID tracking)
- [ ] **Merge strategy** preserves pagination, sorting, and "Load More" state
- [ ] **Optimistic updates** tracked separately (ref or Set) to prevent re-adding
- [ ] **Real-time completion callbacks** watch `run?.status`, not SDK `onComplete`
- [ ] **Server data merging** handles race conditions between client and server state

#### Real-World Example: The Bug We Fixed

**Symptom**: Jobs disappeared from UI after completion (until page refresh)

**Root Cause**: CompletedJobsList had internal state but never synced with parent updates

**The Fix**:
```typescript
// CompletedJobsList.tsx - BEFORE (broken)
const [jobs, setJobs] = useState(initialJobs); // ❌ No sync

// CompletedJobsList.tsx - AFTER (fixed)
useEffect(() => {
  setJobs(current => {
    const currentIds = new Set(current.map(j => j.id));
    const newJobs = initialJobs.filter(j => !currentIds.has(j.id));
    return [...newJobs, ...current]; // ✅ Merge strategy
  });
}, [initialJobs]);
```

**Result**: Jobs now transition seamlessly from "In Progress" to "Completed" without refresh

### 🚨 CRITICAL: Context Usage Strategy

**MANDATORY: Before creating any component props or planning data fetching, verify existing context availability**

#### Context-First Design Pattern
- [ ] **✅ Check Available Contexts:** Analyze what data is already available via existing context providers
- [ ] **✅ Use Context Over Props:** If data is available via context, use hooks instead of props
- [ ] **✅ Avoid Prop Drilling:** Don't pass data through multiple component levels when context is available
- [ ] **✅ Minimize Data Fetching:** Don't duplicate data fetching in child components when parent already has data
- [ ] **✅ Context Provider Analysis:** Check ALL context providers, not just UserContext/UsageContext

#### Decision Flowchart - "Should this be a prop or use context?"
```
📊 Do I need this data in my component?
│
├─ 🔍 Is component rendered inside a provider that has this data?
│  ├─ ✅ YES: Use context hook (useUser, useUsage, etc.) - NO PROPS NEEDED
│  └─ ❌ NO: Check if parent component could provide context or if prop is necessary
│
├─ 🔄 Is this data already fetched by parent layout/component?
│  ├─ ✅ YES: Use context or pass via props (strongly prefer context)
│  └─ ❌ NO: Component may need to fetch data directly
│
└─ 📝 Is this data specific to this component only?
   ├─ ✅ YES: Local data fetching or props appropriate
   └─ ❌ NO: Consider expanding context or using higher-level data source
```

#### Context Provider Mapping Strategy
**Before implementing any component:**
1. **Map the provider tree** - Which providers are available at the component's location?
2. **Identify available data** - What data can be accessed via context hooks?
3. **Check for duplicates** - Is the component receiving props for data available in context?
4. **Verify hook usage** - Are context hooks being used properly?

#### Common Anti-Patterns to Avoid
```typescript
// ❌ BAD: Component inside UserProvider but receives user data as props
interface ProfileProps {
  user: UserData;           // This is already in UserContext!
  subscription: SubData;    // This is already in UsageContext!
}

function ProfileComponent({ user, subscription }: ProfileProps) {
  return <div>{user.email}</div>;
}

// Parent component unnecessarily passes context data as props
<UserProvider value={userData}>
  <UsageProvider value={usageData}>
    <ProfileComponent user={userData} subscription={usageData} />
  </UsageProvider>
</UserProvider>

// ✅ GOOD: Component uses context directly
function ProfileComponent() {
  const user = useUser();           // Gets data from UserContext
  const { subscription } = useUsage(); // Gets data from UsageContext
  return <div>{user.email}</div>;
}

// Parent component just renders - no prop drilling needed
<UserProvider value={userData}>
  <UsageProvider value={usageData}>
    <ProfileComponent />
  </UsageProvider>
</UserProvider>

// ❌ BAD: Duplicate data fetching in protected route
async function ProtectedPage() {
  const user = await getCurrentUser();     // Layout already authenticated!
  const subscription = await getSubscription(); // Already in UsageContext!
}

// ✅ GOOD: Use layout's authentication and context
function ProtectedPage() {
  // No auth needed - layout already verified user
  const user = useUser();           // From layout's UserProvider
  const { subscription } = useUsage(); // From layout's UsageProvider
}
```

#### Universal Context Examples (Apply to All Applications)
- **UserContext (`useUser()`):** User authentication, profile, role data
- **UsageContext (`useUsage()`):** Billing, subscription, usage tracking data
- **[Application-Specific Contexts]:** Search for additional contexts in `contexts/` directory

#### Context Analysis Checklist
- [ ] **Scan contexts/ directory** for all available context providers
- [ ] **Map provider hierarchy** from layouts down to components
- [ ] **Identify hook availability** for each context provider
- [ ] **Check for prop drilling** where context hooks could be used instead
- [ ] **Verify no duplicate data fetching** when context already provides the data
- [ ] **Review protected route patterns** to avoid re-authentication when layout handles it

---

## 10. Code Changes Overview

### 🚨 MANDATORY: Always Show High-Level Code Changes Before Implementation

**AI Agent Instructions:** Before presenting the task document for approval, you MUST provide a clear overview of the code changes you're about to make. This helps the user understand exactly what will be modified without having to approve first.

**Requirements:**
- [ ] **Always include this section** for any task that modifies existing code
- [ ] **Show actual code snippets** with before/after comparisons
- [ ] **Focus on key changes** - don't show every line, but show enough to understand the transformation
- [ ] **Use file paths and line counts** to give context about scope of changes
- [ ] **Explain the impact** of each major change

### Format to Follow:

#### 📂 **Current Implementation (Before)**
```typescript
// Show current code that will be changed
// Include file paths and key logic
// Focus on the parts that will be modified
```

#### 📂 **After Refactor**
```typescript
// Show what the code will look like after changes
// Same files, but with new structure/logic
// Highlight the improvements
```

#### 🎯 **Key Changes Summary**
- [ ] **Change 1:** Brief description of what's being modified and why
- [ ] **Change 2:** Another major change with rationale  
- [ ] **Files Modified:** List of files that will be changed
- [ ] **Impact:** How this affects the application behavior

**Note:** If no code changes are required (pure documentation/planning tasks), state "No code changes required" and explain what will be created or modified instead.

---

## 11. Implementation Plan

### Phase 1: Database Changes (If Required)
**Goal:** Prepare and apply database schema changes with safe rollback capability

- [ ] **Task 1.1:** Generate Database Migration
  - Files: `lib/drizzle/schema/*.ts`
  - Details: Update schema files with new fields, tables, or indexes
- [ ] **Task 1.2:** Create Down Migration (MANDATORY)
  - Files: `drizzle/migrations/[timestamp]/down.sql`
  - Details: Follow `drizzle_down_migration.md` template to create safe rollback
- [ ] **Task 1.3:** Apply Migration
  - Command: `npm run db:migrate`
  - Details: Only run after down migration is created and verified

### Phase 2: [Phase Name]
**Goal:** [What this phase accomplishes]

- [ ] **Task 2.1:** [Specific task with file paths]
  - Files: `path/to/file.ts`, `another/file.tsx`
  - Details: [Technical specifics]
- [ ] **Task 2.2:** [Another task]
  - Files: [Affected files]
  - Details: [Implementation notes]

### Phase 3: [Phase Name]
**Goal:** [What this phase accomplishes]

- [ ] **Task 3.1:** [Specific task]
- [ ] **Task 3.2:** [Another task]

### Phase 4: Task Testing & Validation
**Goal:** Test background tasks in development environment

- [ ] **Task 4.1:** Start Trigger.dev Dev Server
  - Command: `npx trigger.dev@latest dev` (start in separate terminal if not already running)
  - Details: Verify Trigger.dev CLI connects to project and watches for task changes
  - Verification: Check terminal for "✓ Connected to Trigger.dev" message
- [ ] **Task 4.2:** Trigger Task with Sample Payload
  - Files: Modified task files in `trigger/tasks/`
  - Details: Execute task from dev environment with test payload
  - Verification: Task runs without errors, completes successfully
- [ ] **Task 4.3:** Verify Task Chaining
  - Files: Parent and child tasks
  - Details: Ensure parent task triggers child tasks correctly
  - Verification: Check Trigger.dev dashboard shows complete task chain execution
- [ ] **Task 4.4:** Monitor Progress Tracking
  - Files: Task files using `metadata.set()`
  - Details: Verify metadata updates appear in Trigger.dev dashboard real-time
  - Verification: Progress percentages (0-100%) and step descriptions update correctly
- [ ] **Task 4.5:** Database Verification
  - Files: Database tables updated by tasks
  - Details: Confirm database records created/updated correctly by tasks
  - Verification: Check job status, progress, results saved properly using database client

🛑 **CRITICAL WORKFLOW CHECKPOINT**
After completing Phase 4, you MUST:
1. Present "Implementation Complete!" message (exact text from section 16)
2. Wait for user approval of code review
3. Execute comprehensive code review process
4. NEVER proceed to user testing without completing code review first

### Phase 5: Comprehensive Code Review (Mandatory)
**Goal:** Present implementation completion and request thorough code review

- [ ] **Task 5.1:** Present "Implementation Complete!" Message (MANDATORY)
  - Template: Use exact message from section 16, step 7
  - Details: STOP here and wait for user code review approval
- [ ] **Task 5.2:** Execute Comprehensive Code Review (If Approved)
  - Process: Follow step 8 comprehensive review checklist from section 16
  - Details: Read all files, verify requirements, integration testing, provide detailed summary

### Phase 6: User Browser Testing (Only After Code Review)
**Goal:** Request human testing for UI/UX functionality that requires browser interaction

- [ ] **Task 6.1:** Present AI Testing Results
  - Files: Summary of automated test results
  - Details: Provide comprehensive results of all AI-verifiable testing
- [ ] **Task 6.2:** Request User UI Testing
  - Files: Specific browser testing checklist for user
  - Details: Clear instructions for user to verify UI behavior, interactions, visual changes
- [ ] **Task 6.3:** Wait for User Confirmation
  - Files: N/A
  - Details: Wait for user to complete browser testing and confirm results

...

---

## 12. Task Completion Tracking - MANDATORY WORKFLOW

### Task Completion Tracking - MANDATORY WORKFLOW
🚨 **CRITICAL: Real-time task completion tracking is mandatory**

- [ ] **🗓️ GET TODAY'S DATE FIRST** - Before adding any completion timestamps, use the `time` tool to get the correct current date (fallback to web search if time tool unavailable)
- [ ] **Update task document immediately** after each completed subtask
- [ ] **Mark checkboxes as [x]** with completion timestamp using ACTUAL current date (not assumed date)
- [ ] **Add brief completion notes** (file paths, key changes, etc.) 
- [ ] **This serves multiple purposes:**
  - [ ] **Forces verification** - You must confirm you actually did what you said
  - [ ] **Provides user visibility** - Clear progress tracking throughout implementation
  - [ ] **Prevents skipped steps** - Systematic approach ensures nothing is missed
  - [ ] **Creates audit trail** - Documentation of what was actually completed
  - [ ] **Enables better debugging** - If issues arise, easy to see what was changed

### Example Task Completion Format
```
### Phase 1: Database Cleanup
**Goal:** Remove usage tracking infrastructure and simplify subscription schema

- [x] **Task 1.1:** Create Database Migration for Usage Table Removal ✓ 2025-07-24
  - Files: `drizzle/migrations/0009_flashy_risque.sql` ✓
  - Details: Dropped user_usage table, simplified users subscription_tier enum ✓
- [x] **Task 1.2:** Update Database Schema Files ✓ 2025-07-24  
  - Files: `lib/drizzle/schema/users.ts` (updated enum), `lib/drizzle/schema/ai_models.ts` (removed is_premium_model) ✓
  - Details: Binary free/paid system implemented ✓
- [x] **Task 1.3:** Apply Migration ✓ 2025-07-24
  - Command: `npm run db:migrate` executed successfully ✓
  - Details: Schema changes applied to development database ✓
```

---

## 13. File Structure & Organization

### New Files to Create
```
project-root/
├── app/[route]/
│   ├── page.tsx                      # The route's main UI
│   ├── loading.tsx                   # Instant loading state UI
│   └── error.tsx                     # Route-specific error boundary
├── components/[feature]/
│   ├── FeatureComponent.tsx          # Feature-specific components
│   └── AnotherComponent.tsx
├── app/actions/
│   └── [feature].ts                  # Server actions (mutations, trigger tasks)
├── lib/
│   ├── [feature].ts                  # Complex query functions
│   └── utility.ts                    # Shared utilities
└── trigger/
    ├── tasks/
    │   └── [task-name].ts            # Background task definitions
    └── utils/
        └── [feature].ts              # Task utilities (API clients, helpers)
```

**File Organization Rules:**
- **Components**: Always in `components/[feature]/` directories
- **Pages**: Only `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` in `app/` routes  
- **Server Actions**: In `app/actions/[feature].ts` files (mutations only)
- **Complex Queries**: In `lib/[feature].ts` files (when needed)
- **Utilities**: In `lib/` directory
- **Types**: Co-located with components or in `lib/types.ts`

#### **LIB FILE SERVER/CLIENT SEPARATION - CRITICAL ARCHITECTURE RULE**

**🚨 MANDATORY: Prevent Server/Client Boundary Violations**

When creating lib files, **NEVER mix server-only imports with client-safe utilities** in the same file.

**Server-Only Imports (Cannot be used by client components):**
- `next/headers` (cookies, headers)
- `@/lib/supabase/server` 
- `@/lib/drizzle/db` (database operations)
- Server Actions or other server-side functions
- Node.js modules (fs, path, etc.)

**Decision Flowchart - "Should I split this lib file?"**
```
📁 What's in your lib/[feature].ts file?
│
├─ 🔴 Server-only imports + Client-safe utilities?
│  └─ ✅ SPLIT: Create lib/[feature]-client.ts for client utilities
│
├─ 🟢 Only server-side operations?
│  └─ ✅ KEEP: Single lib/[feature].ts file (server-only)
│
└─ 🟢 Only client-safe utilities?
   └─ ✅ KEEP: Single lib/[feature].ts file (client-safe)
```

**File Naming Pattern:**
- `lib/[feature].ts` - Server-side operations and re-exports
- `lib/[feature]-client.ts` - Client-safe utilities only
- Example: `lib/attachments.ts` + `lib/attachments-client.ts`

### Files to Modify
- [ ] **`existing/file.ts`** - [What changes to make]
- [ ] **`another/file.tsx`** - [Modifications needed]

### Dependencies to Add
```json
{
  "dependencies": {
    "new-package": "^1.0.0"
  },
  "devDependencies": {
    "dev-package": "^2.0.0"
  }
}
```

---

## 14. Potential Issues & Security Review

### Error Scenarios to Analyze
- [ ] **Error Scenario 1:** [What could go wrong when...] 
  - **Code Review Focus:** [Which files/functions to examine for this issue]
  - **Potential Fix:** [If issue found, suggest this approach]
- [ ] **Error Scenario 2:** [Another potential failure point]
  - **Code Review Focus:** [Where to look for gaps in error handling]
  - **Potential Fix:** [Recommended solution if needed]

### Edge Cases to Consider
- [ ] **Edge Case 1:** [Unusual scenario that could break functionality]
  - **Analysis Approach:** [How to identify if this is handled in the code]
  - **Recommendation:** [What should be implemented if missing]
- [ ] **Edge Case 2:** [Another boundary condition]
  - **Analysis Approach:** [Where to check for this scenario]
  - **Recommendation:** [How to address if found]

### Security & Access Control Review
- [ ] **Admin Access Control:** Are admin-only features properly restricted to admin users?
  - **Check:** Route protection in middleware, server action authorization
- [ ] **Authentication State:** Does the system handle logged-out users appropriately?
  - **Check:** Redirect behavior, error handling for unauthenticated requests
- [ ] **Form Input Validation:** Are user inputs validated before processing?
  - **Check:** Client-side validation, server-side validation, error messages
- [ ] **Permission Boundaries:** Can users access data/features they shouldn't?
  - **Check:** Data filtering by user role, proper authorization checks

### AI Agent Analysis Approach
**Focus:** Review existing code to identify potential failure points and security gaps. When issues are found, provide specific recommendations with file paths and code examples. This is code analysis and gap identification - not writing tests or test procedures.

**Priority Order:**
1. **Critical:** Security and access control issues
2. **Important:** User-facing error scenarios and edge cases  
3. **Nice-to-have:** UX improvements and enhanced error messaging

---

## 15. Deployment & Configuration

### Environment Variables
```bash
# Add these to .env
NEW_API_KEY=your_api_key_here
DATABASE_URL=your_database_url
```

---

## 16. AI Agent Instructions

### Default Workflow - STRATEGIC ANALYSIS FIRST
🎯 **STANDARD OPERATING PROCEDURE:**
When a user requests any new feature, improvement, or significant change, your **DEFAULT BEHAVIOR** should be:

1. **EVALUATE STRATEGIC NEED** - Determine if multiple solutions exist or if it's straightforward
2. **STRATEGIC ANALYSIS** (if needed) - Present solution options with pros/cons and get user direction
3. **CREATE A TASK DOCUMENT** in `ai_docs/` using this template
4. **GET USER APPROVAL** of the task document  
5. **IMPLEMENT THE FEATURE** only after approval

**DO NOT:** Present implementation plans in chat without creating a proper task document first.  
**DO:** Always create comprehensive task documentation that can be referenced later.  
**DO:** Present strategic options when multiple viable approaches exist.

### Communication Preferences
- [ ] Ask for clarification if requirements are unclear
- [ ] Provide regular progress updates
- [ ] Flag any blockers or concerns immediately
- [ ] Suggest improvements or alternatives when appropriate

### Task-Specific Workflow

**For Trigger.dev task implementation patterns, see Section 8.1 (Trigger.dev Task Architecture) and Section 8.1.1 (Task Utilities & Dependencies). When uncertain about current APIs, use the Library & Dependency Verification workflow below.**

### Library & Dependency Verification

**🔍 CONDITIONAL REQUIREMENT: Verify current library patterns when uncertain**

Before implementing features using external libraries, follow this verification workflow:

#### When to Use Context7
- [ ] **Not 100% confident** in current library patterns or APIs
- [ ] **Library is rapidly evolving** (Trigger.dev, AI SDKs, framework updates)
- [ ] **Haven't used this library recently** or unsure of breaking changes
- [ ] **Package version is unknown** or potentially outdated

#### Version-Aware Verification Workflow

**Step 1: Check Current Version**
```bash
# Check package.json for library version
cat package.json | grep "library-name"
```

**Step 2: Use Context7 with Version-Specific Library ID**
```typescript
// Use context7 to fetch current patterns for specific version
// Format: /org/project or /org/project/version
// Examples:
//   - Trigger.dev v4: /trigger.dev/sdk (or /trigger.dev/sdk/v4.0.5)
//   - OpenAI: /openai/openai-node
//   - Supabase: /supabase/supabase-js
//   - Next.js: /vercel/next.js
```

**Step 3: Verify Implementation Patterns**
- [ ] Check if import paths match current version
- [ ] Verify API methods haven't changed
- [ ] Confirm configuration patterns are current
- [ ] Review any breaking changes or deprecations

#### Common Libraries to Verify
- **Trigger.dev SDK** (`@trigger.dev/sdk`) - Rapidly evolving, check before task implementation
- **AI SDKs** (OpenAI, Anthropic, OpenRouter) - API changes frequently
- **Supabase Client** (`@supabase/supabase-js`) - Auth and client patterns
- **Drizzle ORM** (`drizzle-orm`) - Query syntax and migrations
- **Next.js** (`next`) - Major version differences (App Router patterns)

#### Example Workflow
```
📦 Planning to implement Trigger.dev task...

1. Check package.json: "@trigger.dev/sdk": "4.0.5"
2. Use context7: Fetch /trigger.dev/sdk patterns
3. Verify:
   ✅ Import from "@trigger.dev/sdk" (not "@trigger.dev/sdk/v3")
   ✅ Use task({ id, run }) pattern (not older patterns)
   ✅ metadata.set() for progress (current API)
4. Proceed with implementation using verified patterns
```

**🎯 DECISION RULE:**
- **100% Confident?** → Proceed with implementation
- **Any Uncertainty?** → Use context7 to verify (30 seconds now saves hours of debugging later)

### Implementation Approach - CRITICAL WORKFLOW
🚨 **MANDATORY: Always follow this exact sequence:**

1. **EVALUATE STRATEGIC NEED FIRST (Required)**
   - [ ] **Assess complexity** - Is this a straightforward change or are there multiple viable approaches?
   - [ ] **Review the criteria** in "Strategic Analysis & Solution Options" section
   - [ ] **Decision point**: Skip to step 3 if straightforward, proceed to step 2 if strategic analysis needed

2. **STRATEGIC ANALYSIS SECOND (If needed)**
   - [ ] **Present solution options** with pros/cons analysis for each approach
   - [ ] **Include implementation complexity, time estimates, and risk levels** for each option
   - [ ] **Provide clear recommendation** with rationale
   - [ ] **Wait for user decision** on preferred approach before proceeding
   - [ ] **Document approved strategy** for inclusion in task document

3. **CREATE TASK DOCUMENT THIRD (Required)**
   - [ ] **Create a new task document** in the `ai_docs/tasks/` directory using this template
   - [ ] **Fill out all sections** with specific details for the requested feature
   - [ ] **Include strategic analysis** (if conducted) in the appropriate section
   - [ ] **🔢 FIND LATEST TASK NUMBER**: Use `list_dir` to examine ai_docs/tasks/ directory and find the highest numbered task file (e.g., if highest is 028, use 029)
   - [ ] **Name the file** using the pattern `XXX_feature_name.md` (where XXX is the next incremental number)
   - [ ] **🚨 MANDATORY: POPULATE CODE CHANGES OVERVIEW**: Always read existing files and show before/after code snippets in section 9
   - [ ] **Present a summary** of the task document to the user for review

4. **PRESENT IMPLEMENTATION OPTIONS (Required)**
   - [ ] **After incorporating user feedback**, present these 3 exact options:
   
   **👤 IMPLEMENTATION OPTIONS:**
   
   **A) Preview High-Level Code Changes** 
   Would you like me to show you detailed code snippets and specific changes before implementing? I'll walk through exactly what files will be modified and show before/after code examples.
   
   **B) Proceed with Implementation**
   Ready to begin implementation? Say "Approved" or "Go ahead" and I'll start implementing phase by phase.
   
   **C) Provide More Feedback** 
   Have questions or want to modify the approach? I can adjust the plan based on additional requirements or concerns.
   
   - [ ] **Wait for explicit user choice** (A, B, or C) - never assume or default
   - [ ] **If A chosen**: Provide detailed code snippets showing exact changes planned
   - [ ] **If B chosen**: Begin phase-by-phase implementation immediately  
   - [ ] **If C chosen**: Address feedback and re-present options

5. **IMPLEMENT PHASE-BY-PHASE (Only after Option B approval)**

   **MANDATORY PHASE WORKFLOW:**
   
   For each phase, follow this exact pattern:
   
   a. **Execute Phase Completely** - Complete all tasks in current phase
   b. **Update Task Document** - Mark all completed tasks as [x] with timestamps
   c. **Provide Specific Phase Recap** using this format:
   
   ```
   ✅ **Phase [X] Complete - [Phase Name]**
   - Modified [X] files with [Y] total line changes
   - Key changes: [specific file paths and what was modified]
   - Files updated: 
     • file1.ts (+15 lines): [brief description of changes]
     • file2.tsx (-3 lines, +8 lines): [brief description of changes]
   - Commands executed: [list any commands run]
   - Linting status: ✅ All files pass / ❌ [specific issues found]
   
   **🔄 Next: Phase [X+1] - [Phase Name]**
   - Will modify: [specific files]  
   - Changes planned: [brief description]
   - Estimated scope: [number of files/changes expected]
   
   **Say "proceed" to continue to Phase [X+1]**
   ```
   
   d. **Wait for "proceed"** before starting next phase
   e. **Repeat for each phase** until all implementation complete
   f. **🚨 CRITICAL:** After final implementation phase, you MUST proceed to Phase 5 (Comprehensive Code Review) before any user testing
   
   **🚨 PHASE-SPECIFIC REQUIREMENTS:**
   - [ ] **Real-time task completion tracking** - Update task document immediately after each subtask
   - [ ] **Mark checkboxes as [x]** with completion timestamps
   - [ ] **Add specific completion notes** (file paths, line counts, key changes)
   - [ ] **Run linting on each modified file** during the phase (static analysis only - no dev server/build commands)
   - [ ] **🚨 MANDATORY: For ANY database changes, create down migration file BEFORE running `npm run db:migrate`**
     - [ ] Follow `drizzle_down_migration.md` template process
     - [ ] Create `drizzle/migrations/[timestamp]/down.sql` file
     - [ ] Verify all operations use `IF EXISTS` and include warnings
     - [ ] Only then run `npm run db:migrate`
   - [ ] **For any new page route, create `loading.tsx` and `error.tsx` files alongside `page.tsx`**
   - [ ] **Always create components in `components/[feature]/` directories**
   - [ ] **🚨 TRIGGER.DEV TASK REQUIREMENTS:**
     - [ ] **Task Definition:** Create tasks in `trigger/tasks/` with proper payload interfaces
     - [ ] **Task Utilities:** Extract reusable logic to `trigger/utils/` for cross-task usage
     - [ ] **Binary Configuration:** Set extension paths (FFmpeg, Playwright) in utils initialization
     - [ ] **Progress Tracking:** Use `metadata.set()` for progress/step/error updates
     - [ ] **Database Integration:** Use Supabase service role client in tasks for DB access
     - [ ] **Task Chaining:** Use `tasks.trigger()` or `tasks.triggerAndWait()` appropriately
     - [ ] **Error Handling:** Wrap task logic in try-catch, update metadata on errors
     - [ ] **Server Actions:** Create trigger functions in `app/actions/` to start tasks
     - [ ] **Extension Config:** Update `trigger.config.ts` if new extensions needed
   - [ ] **🚨 MANDATORY WORKFLOW SEQUENCE:** After implementation phases, follow this exact order:
     - [ ] **Phase 4 Complete** → Present "Implementation Complete!" message (section 16, step 7)
     - [ ] **Wait for user approval** → Execute comprehensive code review (section 16, step 8)
     - [ ] **Code review complete** → ONLY THEN request user browser testing
     - [ ] **NEVER skip comprehensive code review** - Phase 4 task testing ≠ comprehensive review
   - [ ] **NEVER plan manual browser testing as AI task** - always mark as "👤 USER TESTING" and wait for user confirmation

6. **VERIFY LIB FILE ARCHITECTURE (For any lib/ changes)**
   - [ ] **Audit new lib files** for server/client mixing
   - [ ] **Check import chains** - trace what server dependencies are pulled in
   - [ ] **Test client component imports** - ensure no boundary violations
   - [ ] **Split files if needed** using `[feature]-client.ts` pattern
   - [ ] **Update import statements** in client components to use client-safe files

7. **FINAL CODE REVIEW RECOMMENDATION (Mandatory after all phases)**
   - [ ] **Present this exact message** to user after all implementation complete:
   
   ```
   🎉 **Implementation Complete!**
   
   All phases have been implemented successfully. I've made changes to [X] files across [Y] phases.
   
   **📋 I recommend doing a thorough code review of all changes to ensure:**
   - No mistakes were introduced
   - All goals were achieved  
   - Code follows project standards
   - Everything will work as expected
   
   **Would you like me to proceed with the comprehensive code review?**
   
   This review will include:
   - Verifying all changes match the intended goals
   - Running linting and type-checking on all modified files
   - Checking for any integration issues
   - Confirming all requirements were met
   ```
   
   - [ ] **Wait for user approval** of code review
   - [ ] **If approved**: Execute comprehensive code review process below

8. **COMPREHENSIVE CODE REVIEW PROCESS (If user approves)**
   - [ ] **Read all modified files** and verify changes match task requirements exactly
   - [ ] **Run linting and type-checking** on all modified files using appropriate commands
   - [ ] **Check for integration issues** between modified components
   - [ ] **Verify all success criteria** from task document are met
   - [ ] **Test critical workflows** affected by changes
   - [ ] **Provide detailed review summary** using this format:
   
   ```
   ✅ **Code Review Complete**
   
   **Files Reviewed:** [list all modified files with line counts]
   **Linting Status:** ✅ All files pass / ❌ [specific issues found]
   **Type Checking:** ✅ No type errors / ❌ [specific type issues]
   **Integration Check:** ✅ Components work together properly / ❌ [issues found]
   **Requirements Met:** ✅ All success criteria achieved / ❌ [missing requirements]
   
   **Summary:** [brief summary of what was accomplished and verified]
   **Confidence Level:** High/Medium/Low - [specific reasoning]
   **Recommendations:** [any follow-up suggestions or improvements]
   ```

### What Constitutes "Explicit User Approval"

#### For Strategic Analysis
**✅ STRATEGIC APPROVAL RESPONSES (Proceed to task document creation):**
- "Option 1 looks good"
- "Go with your recommendation"
- "I prefer Option 2"
- "Proceed with [specific option]"
- "That approach works"
- "Yes, use that strategy"

#### For Implementation Options (A/B/C Choice)
**✅ OPTION A RESPONSES (Show detailed code previews):**
- "A" or "Option A"
- "Preview the changes"
- "Show me the code changes"
- "Let me see what will be modified"
- "Walk me through the changes"

**✅ OPTION B RESPONSES (Start implementation immediately):**
- "B" or "Option B"
- "Proceed" or "Go ahead"
- "Approved" or "Start implementation"
- "Begin" or "Execute the plan"
- "Looks good, implement it"

**✅ OPTION C RESPONSES (Provide more feedback):**
- "C" or "Option C"
- "I have questions about..."
- "Can you modify..."
- "What about..." or "How will you handle..."
- "I'd like to change..."
- "Wait, let me think about..."

#### For Phase Continuation
**✅ PHASE CONTINUATION RESPONSES:**
- "proceed"
- "continue"
- "next phase"
- "go ahead"
- "looks good"

**❓ CLARIFICATION NEEDED (Do NOT continue to next phase):**
- Questions about the completed phase
- Requests for changes to completed work
- Concerns about the implementation
- No response or silence

#### For Final Code Review
**✅ CODE REVIEW APPROVAL:**
- "proceed"
- "yes, review the code"
- "go ahead with review"
- "approved"

🛑 **NEVER start coding without explicit A/B/C choice from user!**  
🛑 **NEVER continue to next phase without "proceed" confirmation!**  
🛑 **NEVER skip comprehensive code review after implementation phases!**  
🛑 **NEVER proceed to user testing without completing code review first!**  
🛑 **NEVER run `npm run db:migrate` without first creating the down migration file using `drizzle_down_migration.md` template!**
🛑 **NEVER run application execution commands - user already has app running!**

### 🚨 CRITICAL: Command Execution Rules
**NEVER run application execution commands - the user already has their development environment running!**

**❌ FORBIDDEN COMMANDS (Will cause conflicts with running dev server):**
- `npm run dev` / `npm start` / `next dev` - User already running
- `npm run build` / `next build` - Expensive and unnecessary for validation
- Any command that starts/serves the application
- Any command that compiles/builds for production
- Any long-running processes or servers

**✅ ALLOWED COMMANDS (Safe static analysis only):**
- `npm run lint` - Static code analysis, safe to run
- `npm run type-check` / `tsc --noEmit` - Type checking only, no compilation
- Database commands (when explicitly needed): `npm run db:generate`, `npm run db:migrate`
- File reading/analysis tools

**🎯 VALIDATION STRATEGY:**
- Use linting for code quality issues
- Read files to verify logic and structure
- Check syntax and dependencies statically
- Let the user handle all application testing manually

### Code Quality Standards
- [ ] Follow TypeScript best practices
- [ ] Add proper error handling
- [ ] **🚨 MANDATORY: Write Professional Comments - Never Historical Comments**
  - [ ] **❌ NEVER write change history**: "Fixed this", "Removed function", "Updated to use new API" 
  - [ ] **❌ NEVER write migration artifacts**: "Moved from X", "Previously was Y"
  - [ ] **✅ ALWAYS explain business logic**: "Calculate discount for premium users", "Validate permissions before deletion"
  - [ ] **✅ Write for future developers** - explain what/why the code does what it does, not what you changed
  - [ ] **Remove unused code completely** - don't leave comments explaining what was removed
- [ ] **🚨 MANDATORY: Use early returns to keep code clean and readable**
  - [ ] **Prioritize early returns** over nested if-else statements
  - [ ] **Validate inputs early** and return immediately for invalid cases
  - [ ] **Handle error conditions first** before proceeding with main logic
  - [ ] **Exit early for edge cases** to reduce nesting and improve readability
  - [ ] **Example pattern**: `if (invalid) return error; // main logic here`
- [ ] **🚨 MANDATORY: Use async/await instead of .then() chaining**
  - [ ] **Avoid Promise .then() chains** - use async/await for better readability
  - [ ] **Use try/catch blocks** for error handling instead of .catch() chaining
  - [ ] **Use Promise.all()** for concurrent operations instead of chaining multiple .then()
  - [ ] **Create separate async functions** for complex operations instead of long chains
  - [ ] **Example**: `const result = await operation();` instead of `operation().then(result => ...)`
- [ ] **🚨 MANDATORY: NO FALLBACK BEHAVIOR - Always throw errors instead**
  - [ ] **Never handle "legacy formats"** - expect the current format or fail fast
  - [ ] **No "try other common fields"** fallback logic - if expected field missing, throw error
  - [ ] **Fail fast and clearly** - don't mask issues with fallback behavior
  - [ ] **Single expected response format** - based on current API contract
  - [ ] **Throw descriptive errors** - explain exactly what format was expected vs received
  - [ ] **Example**: `if (!expectedFormat) throw new Error('Expected X format, got Y');`
- [ ] **🚨 MANDATORY: Create down migration files before running ANY database migration**
  - [ ] Follow `drizzle_down_migration.md` template process
  - [ ] Use `IF EXISTS` clauses for safe rollback operations
  - [ ] Include appropriate warnings for data loss risks
- [ ] **Ensure responsive design (mobile-first approach with Tailwind breakpoints)**
- [ ] **Test components in both light and dark mode**
- [ ] **Verify mobile usability on devices 320px width and up**
- [ ] Follow accessibility guidelines (WCAG AA)
- [ ] Use semantic HTML elements
- [ ] **🚨 MANDATORY: Clean up removal artifacts**
  - [ ] **Never leave placeholder comments** like "// No usage tracking needed" or "// Removed for simplicity"
  - [ ] **Delete empty functions/components** completely rather than leaving commented stubs
  - [ ] **Remove unused imports** and dependencies after deletions
  - [ ] **Clean up empty interfaces/types** that no longer serve a purpose
  - [ ] **Remove dead code paths** rather than commenting them out
  - [ ] **If removing code, remove it completely** - don't leave explanatory comments about what was removed

### Architecture Compliance
- [ ] **✅ VERIFY: Used correct Trigger.dev task patterns**
  - [ ] Background jobs → Trigger.dev tasks (`trigger/tasks/[feature].ts`)
  - [ ] Task utilities → Reusable logic (`trigger/utils/[feature].ts`)
  - [ ] Server Actions → Task triggers (`app/actions/[feature].ts`)
  - [ ] API routes → Only for Trigger.dev webhooks (`app/api/webhooks/trigger/route.ts`), file exports
- [ ] **🚨 VERIFY: Proper task structure and patterns**
  - [ ] Tasks use `task({ id, run })` from `@trigger.dev/sdk`
  - [ ] Payload interfaces defined with all required fields typed
  - [ ] Return types defined for success/error responses
  - [ ] Logger used for all key operations (`logger.info`, `logger.error`)
  - [ ] Progress tracking via `metadata.set()` at each major step
- [ ] **🚨 VERIFY: Task chaining patterns correct**
  - [ ] Fire-and-forget uses `tasks.trigger()` appropriately
  - [ ] Sequential chaining uses `tasks.triggerAndWait()` when results needed
  - [ ] Conditional routing implemented based on runtime data (file size, user tier, flags)
  - [ ] Type-safe task imports using `typeof taskName` pattern
- [ ] **🚨 VERIFY: Database integration follows patterns**
  - [ ] Supabase client initialized with service role key in tasks
  - [ ] Job status/progress updated in database during task execution
  - [ ] Results saved to appropriate tables after task completion
  - [ ] Usage tracking updated for billing/quota enforcement
- [ ] **🚨 VERIFY: Extension configuration correct**
  - [ ] Required extensions added to `trigger.config.ts` (ffmpeg, playwright, etc.)
  - [ ] Binary paths set in utilities using environment variables (`FFMPEG_PATH`, `FFPROBE_PATH`)
  - [ ] Extensions properly imported from `@trigger.dev/build/extensions/core`
- [ ] **🚨 VERIFY: Server Actions trigger tasks correctly**
  - [ ] Server Actions import tasks using `typeof taskName` for type safety
  - [ ] Tasks triggered with `tasks.trigger<typeof taskName>()`
  - [ ] Trigger.dev run IDs stored in database for tracking
  - [ ] Realtime tokens generated for frontend progress tracking
- [ ] **❌ AVOID: Creating synchronous operations for long-running jobs**
  - [ ] Never block Server Actions with long-running operations
  - [ ] Always use Trigger.dev tasks for AI API calls, media processing, external API calls
  - [ ] Never process files synchronously in Server Actions
- [ ] **🔍 DOUBLE-CHECK: Should this be a task or can it run synchronously?**
  - [ ] Does it take >2 seconds? → Trigger.dev task
  - [ ] Does it call external APIs? → Trigger.dev task
  - [ ] Does it process media files? → Trigger.dev task
  - [ ] Does it need retry logic? → Trigger.dev task
- [ ] **🔍 DOUBLE-CHECK: Is task chaining logic correct?**
  - [ ] Parent task correctly routes to child tasks based on conditions
  - [ ] Using `trigger()` for fire-and-forget, `triggerAndWait()` when result needed
  - [ ] Payload types match between parent and child tasks
- [ ] **🚨 VERIFY: Proper useRealtimeRun usage patterns**
  - [ ] Components using `useRealtimeRun()` do NOT use `onComplete` callback
  - [ ] Instead, use `useEffect` to watch `run?.status` for 'COMPLETED' state
  - [ ] Parent callbacks only triggered when `run?.status === 'COMPLETED'`
  - [ ] Router refresh and state updates occur after true completion verification
  - [ ] Error states handled via `run?.status === 'FAILED'` checks
  - [ ] No race conditions in state management (jobs moving between lists prematurely)
- [ ] **🚨 VERIFY: Multi-stage workflow state management patterns**
  - [ ] Parent component owns canonical state for all workflow stages (upload, in-progress, completed, failed)
  - [ ] State transitions (moving items between stages) handled by parent callbacks
  - [ ] Child components either stateless (props only) OR sync via useEffect with merge strategy
  - [ ] Deduplication logic prevents duplicate items (Set-based ID tracking in useEffect)
  - [ ] Merge strategy preserves child state (pagination, sorting, "Load More" loaded items)
  - [ ] Optimistic updates tracked separately (ref or Set) to prevent server re-adding
  - [ ] Real-time completion callbacks watch `run?.status`, not SDK `onComplete` callback
  - [ ] Server data merging handles race conditions between client and server state
- [ ] **❌ AVOID: Multi-stage workflow anti-patterns**
  - [ ] Child component initialized from props but never syncs updates (missing useEffect)
  - [ ] Parent updates props but child has internal state that ignores them
  - [ ] Replacing child state wholesale instead of merging new items (loses pagination)
  - [ ] Using onComplete callback from useRealtimeRun (fires prematurely before COMPLETED status)
  - [ ] Moving items between stages based on SDK callbacks instead of status checks
  - [ ] Parent and child both trying to own the same state (state ownership conflict)

---

## 17. Notes & Additional Context

### Research Links
- **Trigger.dev Documentation:** https://trigger.dev/docs
- **Trigger.dev v3 Tasks:** https://trigger.dev/docs/tasks
- **Trigger.dev Extensions:** https://trigger.dev/docs/run/machine-configuration/extensions
- **Trigger.dev Realtime SDK:** https://trigger.dev/docs/realtime
- **FFmpeg Extension:** https://trigger.dev/docs/run/machine-configuration/extensions/ffmpeg
- [Reference implementations from worker-saas codebase]
- [Design mockups or wireframes]

### **⚠️ Common Trigger.dev Task Pitfalls to Avoid**

**❌ NEVER DO:**
- Run long-running operations synchronously in Server Actions (use Trigger.dev tasks instead)
- Forget to set binary paths for extensions (FFmpeg, Playwright) in utility initialization
- Mix payload types between parent and child tasks (causes runtime type errors)
- Skip progress tracking updates (`metadata.set()`) - users need real-time feedback
- Use client-side Supabase in tasks (always use service role key for full access)
- Forget to store Trigger.dev run ID in database (needed for progress tracking)
- Skip error metadata updates (users won't know why task failed)
- Create API routes for task triggering (use Server Actions instead)

**✅ ALWAYS DO:**
- Extract reusable logic to `trigger/utils/` for cross-task usage
- Define TypeScript payload interfaces with all required fields
- Update `metadata.set()` at each major step (10%, 30%, 50%, 90%, 100%)
- Use `logger.info` and `logger.error` for debugging task execution
- Initialize Supabase client with service role key in tasks
- Use `tasks.trigger()` for fire-and-forget, `tasks.triggerAndWait()` when results needed
- Configure extensions in `trigger.config.ts` before using them
- Set binary paths using extension environment variables (`FFMPEG_PATH`, etc.)
- Wrap task logic in try-catch blocks and update metadata on errors
- Store Trigger.dev run IDs in database for frontend progress tracking

### **📚 Reference Implementations from worker-saas**

**Task Structure Pattern:**
- See `/trigger/tasks/extract-audio.ts` for conditional routing example (file size-based)
- See `/trigger/tasks/transcribe-audio.ts` for progress tracking pattern and chunking
- See `/trigger/tasks/generate-summary.ts` for tier-based conditional execution

**Utility Pattern:**
- See `/trigger/utils/openai.ts` for API client singleton pattern
- See `/trigger/utils/ffmpeg.ts` for binary path configuration and FFmpeg operations
- See `/trigger/utils/formats.ts` for data transformation utilities

**Integration Pattern:**
- See `/lib/jobs.ts` for Server Action task triggering pattern
- See `/app/actions/transcriptions.ts` for realtime token generation
- See `/trigger.config.ts` for extension configuration example

---

## 18. Second-Order Consequences & Impact Analysis

### AI Analysis Instructions
🔍 **MANDATORY: The AI agent must analyze this section thoroughly before implementation**

Before implementing any changes, the AI must systematically analyze potential second-order consequences and alert the user to any significant impacts. This analysis should identify ripple effects that might not be immediately obvious but could cause problems later.

### Impact Assessment Framework

#### 1. **Breaking Changes Analysis**
- [ ] **Existing API Contracts:** Will this change break existing API endpoints or data contracts?
- [ ] **Database Dependencies:** Are there other tables/queries that depend on data structures being modified?
- [ ] **Component Dependencies:** Which other components consume the interfaces/props being changed?
- [ ] **Authentication/Authorization:** Will this change affect existing user permissions or access patterns?

#### 2. **Ripple Effects Assessment**
- [ ] **Data Flow Impact:** How will changes to data models affect downstream consumers?
- [ ] **UI/UX Cascading Effects:** Will component changes require updates to parent/child components?
- [ ] **State Management:** Will new data structures conflict with existing state management patterns?
- [ ] **Routing Dependencies:** Are there route dependencies that could be affected by page structure changes?

#### 3. **Performance Implications**
- [ ] **Database Query Impact:** Will new queries or schema changes affect existing query performance?
- [ ] **Bundle Size:** Are new dependencies significantly increasing the client-side bundle?
- [ ] **Server Load:** Will new endpoints or operations increase server resource usage?
- [ ] **Caching Strategy:** Do changes invalidate existing caching mechanisms?

#### 4. **Security Considerations**
- [ ] **Attack Surface:** Does this change introduce new potential security vulnerabilities?
- [ ] **Data Exposure:** Are there risks of inadvertently exposing sensitive data?
- [ ] **Permission Escalation:** Could new features accidentally bypass existing authorization checks?
- [ ] **Input Validation:** Are all new data entry points properly validated?

#### 5. **User Experience Impacts**
- [ ] **Workflow Disruption:** Will changes to familiar interfaces confuse existing users?
- [ ] **Data Migration:** Do users need to take action to migrate existing data?
- [ ] **Feature Deprecation:** Are any existing features being removed or significantly changed?
- [ ] **Learning Curve:** Will new features require additional user training or documentation?

#### 6. **Maintenance Burden**
- [ ] **Code Complexity:** Are we introducing patterns that will be harder to maintain?
- [ ] **Dependencies:** Are new third-party dependencies reliable and well-maintained?
- [ ] **Testing Overhead:** Will this change require significant additional test coverage?
- [ ] **Documentation:** What new documentation will be required for maintainers?

### Critical Issues Identification

#### 🚨 **RED FLAGS - Alert User Immediately**
These issues must be brought to the user's attention before implementation:
- [ ] **Database Migration Required:** Changes that require data migration in production
- [ ] **Breaking API Changes:** Modifications that will break existing integrations
- [ ] **Performance Degradation:** Changes likely to significantly impact application speed
- [ ] **Security Vulnerabilities:** New attack vectors or data exposure risks
- [ ] **User Data Loss:** Risk of losing or corrupting existing user data

#### ⚠️ **YELLOW FLAGS - Discuss with User**
These issues should be discussed but may not block implementation:
- [ ] **Increased Complexity:** Changes that make the codebase harder to understand
- [ ] **New Dependencies:** Additional third-party packages that increase bundle size
- [ ] **UI/UX Changes:** Modifications that change familiar user workflows
- [ ] **Maintenance Overhead:** Features that will require ongoing maintenance attention

### Mitigation Strategies

#### Database Changes
- [ ] **Backup Strategy:** Ensure database backups before schema changes
- [ ] **Rollback Plan:** Define clear rollback procedures for database migrations
- [ ] **Staging Testing:** Test all database changes in staging environment first
- [ ] **Gradual Migration:** Plan for gradual data migration if needed

#### API Changes
- [ ] **Versioning Strategy:** Use API versioning to maintain backward compatibility
- [ ] **Deprecation Timeline:** Provide clear timeline for deprecated features
- [ ] **Client Communication:** Notify API consumers of breaking changes in advance
- [ ] **Graceful Degradation:** Ensure old clients can still function during transition

#### UI/UX Changes
- [ ] **Feature Flags:** Use feature flags to gradually roll out UI changes
- [ ] **User Communication:** Notify users of interface changes through appropriate channels
- [ ] **Help Documentation:** Update help documentation before releasing changes
- [ ] **Feedback Collection:** Plan for collecting user feedback on changes

### AI Agent Checklist

Before presenting the task document to the user, the AI agent must:
- [ ] **Complete Impact Analysis:** Fill out all sections of the impact assessment
- [ ] **Identify Critical Issues:** Flag any red or yellow flag items
- [ ] **Propose Mitigation:** Suggest specific mitigation strategies for identified risks
- [ ] **Alert User:** Clearly communicate any significant second-order impacts
- [ ] **Recommend Alternatives:** If high-risk impacts are identified, suggest alternative approaches

### Example Analysis Template

```
🔍 **SECOND-ORDER IMPACT ANALYSIS:**

**Breaking Changes Identified:**
- Database schema change will require migration of 10,000+ existing records
- API endpoint `/api/users` response format changing (affects mobile app)

**Performance Implications:**
- New JOIN query may slow down dashboard load time by 200ms
- Additional React components will increase bundle size by 15KB

**Security Considerations:**
- New user input field requires XSS protection
- API endpoint needs rate limiting to prevent abuse

**User Experience Impacts:**
- Navigation menu restructure may confuse existing users
- New required field will interrupt existing signup flow

**Mitigation Recommendations:**
- Implement database migration script with rollback capability
- Use API versioning to maintain backward compatibility
- Add performance monitoring for new queries
- Plan user communication strategy for UI changes

**🚨 USER ATTENTION REQUIRED:**
The database migration will require approximately 30 minutes of downtime. Please confirm if this is acceptable for your deployment schedule.
```

---

*Template Version: 1.0*
*Last Updated: 11/03/2025*
*Created By: Brandon Hancock*
