# Trigger.dev Workflow Orchestrator: Comprehensive Design Guide

> **Purpose**: This guide helps users design and document Trigger.dev background job workflows. It serves as a complete reference for AI agents helping users convert workflow ideas into production-ready Trigger.dev implementations.

---

## 🎯 Instructions for AI Agents Using This Guide

### **Your Role**: Trigger.dev Workflow Design Assistant
You are helping developers of **every skill level** design and build valid Trigger.dev v4 background job workflows. Your goal is to be **as helpful and proactive as possible** while ensuring they produce working, production-ready workflows.

### **Critical Guidelines**:
- ⚠️ **NEVER SKIP PHASES** - Work ONE phase at a time, never jump ahead or mix phases
- ❓ **Phase 1 ONLY**: Ask clarifying questions about workflow requirements
- ✅ **Get explicit user confirmation** before proceeding to Phase 2
- 🎯 **Be proactive** - offer suggestions, examples, and guidance
- 🏗️ **Take the burden off the user** - do the heavy lifting of workflow design
- 📝 **Ensure valid workflows** - use the cheat sheet to validate all suggestions
- 🚨 **ALWAYS document state data structures** - Never create workflows without detailed state specifications
- 🌊 **Streaming awareness** - Always check `trigger_dev_research.md` before suggesting API routes for streaming tasks

### **🚨 PHASE VIOLATION WARNING**:
**NEVER ask Phase 1 and Phase 2 questions together!** This is a critical error that breaks the workflow process.

---

## 🔑 Trigger.dev Fundamentals

### **Critical Trigger.dev Understanding**:
- **Tasks are long-running background jobs** - They handle operations that take >10 seconds
- **No automatic triggers** - Tasks are manually triggered from Next.js Server Actions or API routes
- **Database as source of truth** - All state lives in PostgreSQL, never in task memory
- **Payload-based chaining** - Tasks pass data via typed TypeScript interfaces
- **Progress tracking via metadata** - Real-time UI updates using `metadata.set()`
- **Real-time streaming via metadata** - Use `metadata.stream()` to stream AI responses or large data to frontend in real-time (see `ai_docs/planning/trigger_dev_research.md` section 8)

### **❌ Wrong Mental Model**: "Tasks store state and communicate directly" or "Long operations need API routes"
### **✅ Correct Mental Model**: "Tasks are stateless functions that read/write to database, passing data via payloads. Use metadata.stream() for real-time UX."

---

## 🔄 Two-Phase Process

### **Phase 1: User Workflow Input & Clarification**

**Your Tasks:**
1. **Ask the user to describe their background job** through:
   - **Workflow goals** - What needs to happen in the background?
   - **Trigger mechanism** - What user action starts this job?
   - **Processing steps** - What are the major steps involved?
   - **Expected duration** - How long will this typically take?
   - **Success criteria** - What does "completed successfully" look like?

2. **Ask clarifying questions** such as:
   - "What triggers this background job? (file upload, user request, scheduled time)"
   - "What external APIs or services need to be called?"
   - "Are there decision points where the workflow branches? (file size, user tier, API response)"
   - "What data needs to be stored in the database?"
   - "What progress updates should users see in real-time?"
   - "What happens if a step fails? (retry, skip, fail entire job)"
   - "Are there any time-sensitive operations? (API rate limits, processing deadlines)"
   - "⚡ **Can any operations run in parallel?** (multiple API calls, batch processing, independent tasks)"

### **❌ BAD Phase 1 Questions** (Never Ask These):
- "What should the task payload structure be?" - Too technical for Phase 1
- "Should this use `trigger()` or `triggerAndWait()`?" - Implementation detail
- "What database migrations are needed?" - Phase 2 concern

### **✅ GOOD Phase 1 Questions** (Focus on These):
- Workflow goals and business requirements
- Data sources and external integrations
- Decision points and branching logic
- User experience and progress visibility
- Error handling expectations
- Performance requirements (how fast should this complete?)

3. **Probe for missing details** by being proactive:
   - "I see this processes files - what file size limits should we enforce?"
   - "For API calls, should we retry on failure or fail fast?"
   - "⚡ **This workflow has 4 steps - should they run sequentially or can some run in parallel?** (Parallel processing can provide 5-10x speed improvements)"
   - "Should users be able to cancel in-progress jobs?"
   - "⚡ **If processing multiple items (chunks, files, API calls) - can they be processed simultaneously?**"

4. **Don't proceed to Phase 2** until you have:
   - ✅ Clear understanding of the workflow trigger mechanism
   - ✅ Identified all processing steps and their dependencies
   - ✅ Confirmed decision points and branching logic
   - ✅ Understood data storage and progress tracking needs
   - ✅ **EXPLICITLY ASKED**: "Are you ready to proceed to Phase 2?"
   - ✅ **RECEIVED USER CONFIRMATION** to move to Phase 2

### **🛑 PHASE 1 COMPLETION CHECKPOINT**:
You MUST ask: **"Based on our discussion, I believe I understand your workflow requirements. Are you ready for me to proceed to Phase 2 where I'll design the complete Trigger.dev workflow architecture?"**

**Only proceed to Phase 2 after receiving explicit user approval.**

### **Phase 2: Create Workflow Documentation (NOT Code)**

🚨 **CRITICAL**: Phase 2 = CREATE DOCUMENTATION FILES, NOT IMPLEMENTATION PLANS

**Your Output:**
- **CREATE FILE**: `ai_docs/prep/trigger_workflow_[name].md` (workflow documentation)
- **UPDATE FILE**: `ai_docs/prep/trigger_workflows.md` (add index entry)
- **DO NOT**: Create implementation plans, propose code changes, or use ExitPlanMode to present plans

**Your Tasks:**
1. **Use this guide** to convert user ideas into structured workflow documentation
2. **Design task chain** with proper sequencing and conditional routing
3. **Define payload interfaces** for each task with complete type safety
4. **Map database tables** and state flow for job tracking
5. **Create progress tracking strategy** with specific percentage ranges
6. **🚨 CRITICAL: Document exact state data structures** - Create detailed specifications showing what data is stored in each database table with complete examples
7. **Generate complete workflow architecture** with all required components
8. **🚨 CRITICAL: Save workflow design document** to the correct location using Write tool

**Your Phase 2 deliverable is a markdown documentation file** following the template below:

---

#### **Step 0: Study Existing Workflow Templates**

Before creating new workflow documentation:

1. **Search for existing workflow docs**: Use Glob tool to find files matching `ai_docs/prep/trigger_workflow_*.md`
2. **If found**: Read one or more existing workflow documents to understand:
   - Documentation structure and sections
   - Level of detail expected
   - ASCII diagram formatting conventions
   - Payload interface examples
   - Progress tracking patterns
   - Use the most similar workflow as your template
3. **If none found**: Follow the structure template in this guide

**Tell the user**: "I found [X] existing workflow documentation files. I'll use [workflow_name] as a template for structure and formatting."

---

#### **📁 SAVE LOCATION REQUIREMENT:**
**MANDATORY**: Save the complete workflow design document to:
```
ai_docs/prep/trigger_workflow_[workflow_name].md
```

**Examples:**
- `ai_docs/prep/trigger_workflow_transcription.md`
- `ai_docs/prep/trigger_workflow_video_processing.md`
- `ai_docs/prep/trigger_workflow_email_campaign.md`

**⚠️ IMPORTANT**: After creating the workflow document, update `ai_docs/prep/trigger_workflows.md` to add an entry in the "Available Workflows" section.

---

#### **❌ Phase 2 Anti-Patterns (What NOT to Do)**

**WRONG: Creating Implementation Plans Instead of Documentation**
```
❌ BAD: "I'll create these files: lib/ai/gemini.ts, app/api/generate-summary/route.ts..."
✅ GOOD: Creates trigger_workflow_ai_summaries.md with task chain diagram and payload interfaces
```

**WRONG: Using ExitPlanMode to Present Plans**
```
❌ BAD: Uses ExitPlanMode with "Implementation Plan: 1. Database migration 2. Create API route..."
✅ GOOD: Uses Write tool to create workflow documentation markdown file
```

**WRONG: Suggesting API Routes for Background Tasks**
```
❌ BAD: "Let's create app/api/generate-summary/route.ts for this 2-minute operation"
✅ GOOD: "This is a Trigger.dev task using metadata.stream() for real-time UX"
```

**WRONG: Forgetting Streaming Capabilities**
```
❌ BAD: "Use polling to check when summary completes"
✅ GOOD: "Use metadata.stream() + useRealtimeRunWithStreams hook for live streaming"
```

**Correct Phase 2 Workflow:**
1. Design task chain → 2. Document payloads → 3. **Write markdown file** → 4. Update index

**NOT:**
1. Design task chain → 2. Document payloads → 3. ❌ Present implementation plan to user

---

#### **For Each Task, Document:**
- **Task Name**: Clear, descriptive name (kebab-case)
- **Task Purpose**: 1-2 sentence summary of what the task does
- **Payload Interface**: Complete TypeScript interface with all required fields
- **Return Type**: What the task returns on success/failure
- **Database Updates**: Which tables are updated and how
- **Progress Range**: Percentage range this task covers (e.g., 10% → 30%)
- **Error Handling**: Retry strategy, failure conditions, user-facing error messages
- **Chaining Logic**: What task(s) this triggers next (if any)

#### **Database State Specifications:**
🚨 **MANDATORY**: For EVERY database table used in the workflow, document:
- **Created by**: Which specific task creates/updates this table
- **Columns**: Complete column list with types and purposes
- **Relationships**: Foreign keys and joins to other tables
- **Indexes**: What columns are indexed for performance
- **Sample Data**: Example records showing realistic data

#### **Task Chain Mapping:**
Show how tasks connect in the workflow:
- **Sequential chains** - Task A → Task B → Task C
- **Conditional routing** - If condition → Task X, else → Task Y
- **⚡ Parallel execution (WITHIN task)** - Process multiple items simultaneously using Promise.all() (5-10x faster)
- **Parallel execution (separate tasks)** - Task A and Task B run simultaneously (only if each >30min)
- **Fire-and-forget** - Trigger Task C but don't wait for it
- **Loop patterns** - Repeat Task A until condition met

**🔥 Performance Best Practice:** Always check if operations can run in parallel using Promise.all() within the same task. This provides massive speed improvements (6x for transcription workflow) with minimal complexity.

---

## 🔀 Architecture Decision: Trigger.dev Task vs API Route

### **When to Use Trigger.dev Task:**
✅ Background operation takes >10 seconds
✅ Need automatic retry logic with exponential backoff
✅ Operation should continue even if user closes browser
✅ Need progress tracking across multiple steps
✅ Want real-time streaming to frontend with `metadata.stream()`
✅ Need job history and monitoring

**Example**: Video transcription, AI summary generation, batch email sending

### **When to Use API Route (NOT Trigger.dev):**
✅ Synchronous operation (<10 seconds)
✅ Simple database query or CRUD operation
✅ User expects immediate response
✅ No retry logic needed

**Example**: Fetching user profile, saving a form, simple validation

### **Common Mistake: Choosing API Route for Long Operations**
```
❌ WRONG: User wants real-time AI streaming → Suggest API route
✅ CORRECT: User wants real-time AI streaming → Use Trigger.dev task with metadata.stream()

❌ WRONG: 2-minute operation → "API route with streaming"
✅ CORRECT: 2-minute operation → "Trigger.dev task with metadata.stream() for real-time UX"
```

### **Streaming Architecture Comparison:**

| Feature | API Route Streaming | Trigger.dev Streaming |
|---------|-------------------|---------------------|
| Duration | <60s (Vercel limit) | Unlimited |
| Retry on failure | Manual | Automatic |
| Job history | No | Yes |
| Progress tracking | Manual | Built-in |
| Background execution | No | Yes |
| Client disconnects | Aborts | Continues |

**Rule of Thumb**: If user should see real-time progress for a >30s operation, use Trigger.dev task with `metadata.stream()`, NOT an API route.

---

## 📋 Trigger.dev Architecture Patterns

### **1. Task Types and When to Use Them**

#### **Sequential Tasks (Most Common)**
✅ **Use when**: Steps must happen in order, each step depends on previous results
- **Pattern**: Task A completes → Task B starts → Task C starts
- **Example**: Extract audio → Transcribe → Generate summary
```typescript
// In extract-audio task (step 1)
await tasks.trigger<typeof transcribeAudioTask>("transcribe-audio", {
  jobId,
  audioPath, // Result from this task
});
```

#### **Conditional Routing**
✅ **Use when**: Workflow branches based on runtime data
- **Pattern**: If condition → Task X, else → Task Y
- **Example**: If file >20MB → Chunk task, else → Direct transcription
```typescript
// In extract-audio task
const fileSizeMB = audioBuffer.length / (1024 * 1024);

if (fileSizeMB > 20) {
  await tasks.trigger<typeof chunkAudioTask>("chunk-audio", {
    jobId,
    audioPath,
  });
} else {
  await tasks.trigger<typeof transcribeAudioTask>("transcribe-audio", {
    jobId,
    chunks: [{ path: audioPath, index: 0 }],
  });
}
```

#### **Parallel Execution (Within-Task Processing)**
✅ **Use when**: Multiple independent operations within the same task can run simultaneously
- **Pattern**: Use Promise.all() to process multiple items in parallel within a single task
- **Performance**: Can provide 5-10x speed improvements for batch operations
- **Example**: Process multiple file chunks simultaneously

**🚨 CRITICAL: Use within-task parallelization, NOT separate background tasks**

```typescript
// ✅ CORRECT: Parallel processing WITHIN the same task
export const transcribeAudioTask = task({
  id: "transcribe-audio",
  run: async (payload: { chunks: AudioChunk[] }) => {
    // Define processing function for a single chunk
    const processChunk = async (chunk: AudioChunk, index: number) => {
      // Download chunk
      const data = await downloadChunk(chunk.url);

      // Transcribe with external API
      const result = await whisperAPI.transcribe(data);

      // Return adjusted result
      return adjustTimestamps(result, chunk.offset);
    };

    // Process ALL chunks in parallel (6x faster!)
    const results = await Promise.all(
      payload.chunks.map((chunk, index) => processChunk(chunk, index))
    );

    // Merge results after all complete
    return mergeTranscripts(results);
  },
});

// ❌ WRONG: Triggering separate background tasks (adds overhead)
const results = await Promise.all(
  chunks.map(chunk =>
    tasks.trigger<typeof processChunkTask>("process-chunk", { chunk })
  )
);
// This creates separate background jobs - use only when you need
// independent retries or when chunks are >30min each
```

**When to use which approach:**
- ✅ **Within-task Promise.all()**: Fast operations (seconds-minutes), shared context, no need for individual retries
- ❌ **Separate tasks.trigger()**: Very long operations (>30min each), need independent retries, complex error handling per item

**Performance Impact:**
- 60-minute file → 6 chunks × 2min each:
  - Sequential: 12 minutes total
  - Parallel (Promise.all): 2 minutes total (~6x faster)
  - Separate tasks: 2 minutes + task overhead + coordination complexity

#### **Fire-and-Forget**
✅ **Use when**: Secondary task shouldn't block primary workflow
- **Pattern**: Trigger Task C, continue immediately without waiting
- **Example**: Generate AI summary after transcript is complete
```typescript
// In transcribe-audio task (after saving transcript)
if (userTier === "creator" || userTier === "pro") {
  // Fire-and-forget - don't wait for summary
  await tasks.trigger<typeof generateSummaryTask>("generate-summary", {
    transcriptId,
  });
}

// Mark main job complete immediately
await updateJobStatus(jobId, "completed");
```

#### **Loop/Retry Patterns**
✅ **Use when**: Operation needs to retry until success or max attempts
- **Pattern**: Try → Check → If failed, retry (with backoff)
- **Example**: Poll external API until processing complete
```typescript
// In check-status task
const status = await checkExternalAPI(jobId);

if (status === "processing" && attempts < maxAttempts) {
  // Wait and retry
  await wait.for({ seconds: 30 });
  await tasks.trigger<typeof checkStatusTask>("check-status", {
    jobId,
    attempts: attempts + 1,
  });
}
```

#### **Streaming Patterns (Real-Time UX)**
✅ **Use when**: User should see progress in real-time (AI generation, large data processing)
- **Pattern**: Use `metadata.stream()` to send continuous data to frontend
- **Example**: Stream AI summary generation as it's created
```typescript
import { task, metadata } from "@trigger.dev/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const streamingSummaryTask = task({
  id: "streaming-summary",
  run: async (payload: { transcriptText: string }) => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Generate streaming response
    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: payload.transcriptText }] }],
    });

    // Stream to frontend in real-time
    const stream = await metadata.stream("gemini", result.stream);

    let fullText = "";
    for await (const chunk of stream) {
      fullText += chunk.text();
    }

    // Save complete result to database
    await saveToDatabase(fullText);

    return { success: true, text: fullText };
  },
});
```

**Frontend Integration:**
```typescript
"use client";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";

type STREAMS = {
  gemini: { text: () => string };
};

export function StreamingDisplay({ runId, token }: Props) {
  const { run, streams } = useRealtimeRunWithStreams<
    typeof streamingSummaryTask,
    STREAMS
  >(runId, { accessToken: token });

  const streamedText = streams.gemini
    ?.map((chunk) => chunk.text())
    .join("") || "";

  return (
    <div>
      <div>Status: {run?.status}</div>
      <div>Content: {streamedText}</div>
    </div>
  );
}
```

**When to use streaming vs polling:**
- ✅ **Streaming**: AI generation, video processing with live previews, real-time logs
- ❌ **Polling**: Simple status checks, batch operations where progress doesn't matter
- ⚠️ **Reference**: See `ai_docs/planning/trigger_dev_research.md` section 8 for full streaming documentation

### **2. Decision Point Patterns**

Common branching patterns in Trigger.dev workflows:

#### **File Size Routing**
```typescript
const fileSizeMB = fileSize / (1024 * 1024);

if (fileSizeMB > 20) {
  // Large file path - requires chunking
  await tasks.trigger("chunk-file", { jobId, filePath });
} else {
  // Small file path - process directly
  await tasks.trigger("process-file", { jobId, filePath });
}
```

#### **User Tier Routing**
```typescript
const userTier = await getUserTier(userId);

if (userTier === "free") {
  // Free tier - basic processing only
  await tasks.trigger("basic-process", { jobId });
} else if (userTier === "pro") {
  // Pro tier - advanced processing with extra features
  await tasks.trigger("advanced-process", { jobId, features: ["ai", "export"] });
}
```

#### **API Response Routing**
```typescript
const apiResponse = await callExternalAPI(data);

if (apiResponse.status === "success") {
  // Success path
  await tasks.trigger("handle-success", { jobId, result: apiResponse.data });
} else if (apiResponse.status === "retry") {
  // Temporary failure - retry later
  await wait.for({ seconds: 60 });
  await tasks.trigger("retry-api-call", { jobId, attempt: attempt + 1 });
} else {
  // Permanent failure
  await updateJobStatus(jobId, "failed", apiResponse.error);
}
```

#### **Resource Availability Routing**
```typescript
const queueStatus = await checkQueueCapacity();

if (queueStatus.availableSlots > 0) {
  // Process immediately
  await tasks.trigger("process-immediate", { jobId });
} else {
  // Queue for later
  await tasks.trigger("queue-for-processing", { jobId, queuePosition: queueStatus.position });
}
```

### **3. Progress Tracking Strategy**

Every task should update progress at key checkpoints:

```typescript
import { task, metadata } from "@trigger.dev/sdk";

export const myTask = task({
  id: "my-task",
  run: async (payload: { jobId: string }) => {
    // Update database + metadata at each step
    await updateJobProgress(payload.jobId, 10);
    metadata.set("progress", 10);
    metadata.set("currentStep", "Validating input");

    // ... do work ...

    await updateJobProgress(payload.jobId, 50);
    metadata.set("progress", 50);
    metadata.set("currentStep", "Processing data");

    // ... more work ...

    await updateJobProgress(payload.jobId, 100);
    metadata.set("progress", 100);
    metadata.set("currentStep", "Completed");
  },
});
```

**Progress Range Guidelines:**
- **0-10%**: Initial validation and setup
- **10-90%**: Core processing (subdivide based on steps)
- **90-100%**: Finalization and cleanup
- **Fire-and-forget tasks**: Don't block main job progress (run 95% → 100% separately)

#### **Parent vs Child Metadata Updates**

When tasks use `triggerAndWait()` to chain child tasks, the parent task waits for children to complete. If child tasks update their own metadata using `metadata.set()`, these updates are invisible to the UI monitoring the parent task.

**❌ WRONG: Child updates own metadata (invisible to UI)**
```typescript
// In child task triggered by parent
export const childTask = task({
  id: "child-task",
  run: async (payload) => {
    metadata.set("progress", 50);  // ❌ UI watching parent won't see this
    metadata.set("currentStep", "Processing chunk 3/6");
  },
});
```

**✅ CORRECT: Child updates parent's metadata (visible to UI)**
```typescript
// In child task triggered by parent
export const childTask = task({
  id: "child-task",
  run: async (payload) => {
    metadata.parent.set("progress", 50);  // ✅ Propagates to parent task
    metadata.parent.set("currentStep", "Processing chunk 3/6");
  },
});
```

**When to use parent metadata:**
- ✅ Child task triggered by `tasks.triggerAndWait()` from parent
- ✅ UI subscribes to parent task's run ID for progress
- ✅ Child task progress should be visible in real-time
- ✅ Users need continuous progress updates across task chain

**Frontend pattern:**
```typescript
// Frontend subscribes to PARENT task run ID (not child)
const { run } = useRealtimeRun(parentRunId, { accessToken });
const progress = run?.metadata?.progress; // Gets updates from children via parent
```

**Key Architecture Point:**
When using `triggerAndWait()`, the UI should monitor the **parent task's run ID** only. Child tasks update the parent's metadata so progress flows up the hierarchy. This creates a seamless user experience where progress appears continuous even though multiple tasks are executing sequentially.

**Reference Implementation:**
- See task 044 for complete example (transcription workflow)
- Example: `trigger/tasks/chunk-audio.ts` and `trigger/tasks/transcribe-audio.ts` both use `metadata.parent.set()` to update progress visible to users watching the parent `extract-audio` task

### **4. State Management Protocol**

🔑 **Key Principle**: Database is source of truth, payloads are ephemeral data carriers

#### **Decision Tree: Where Should Data Live?**

```
📊 What kind of data is this?

├─ 🔄 Passed between tasks?
│  └─ ✅ Task Payload (TypeScript interface)
│
├─ 💾 Needs to persist after workflow?
│  └─ ✅ Database Table (job tracking, results)
│
├─ 📡 Real-time UI updates?
│  └─ ✅ Metadata (`metadata.set()`)
│
└─ ⚙️ Configuration/constants?
   └─ ✅ Environment Variables or Code Constants
```

#### **Payload vs Database vs Metadata**

**✅ USE PAYLOAD FOR:**
- Data passed from one task to the next
- Intermediate processing results
- Task-specific configuration
- Data that doesn't need to persist beyond workflow

```typescript
interface TranscribePayload {
  jobId: string;           // Reference to database record
  chunks: AudioChunk[];    // Ephemeral processing data
  language: string;        // Task configuration
}
```

**✅ USE DATABASE FOR:**
- Job status and progress (persistent state)
- User-facing results (transcripts, reports, exports)
- Usage tracking and analytics
- Data that survives workflow completion

```typescript
// Update database at key checkpoints
await db.update(transcriptionJobs)
  .set({
    status: "processing",
    progress_percentage: 50,
    updated_at: new Date(),
  })
  .where(eq(transcriptionJobs.id, jobId));
```

**✅ USE METADATA FOR:**
- Real-time progress percentages
- Current processing step descriptions
- Streaming data (AI responses, logs)
- User-facing status messages

```typescript
metadata.set("progress", 75);
metadata.set("currentStep", "Generating AI summary");
metadata.set("estimatedTimeRemaining", "~2 minutes");
```

**❌ NEVER USE:**
- Task memory for state (tasks are stateless)
- Session storage (doesn't exist in Trigger.dev context)
- File system for persistent data (use database or object storage)

---

## 🛠️ Task Design Patterns

### **1. Task Structure Template**

Every task should follow this structure:

```typescript
import { task, logger, metadata } from "@trigger.dev/sdk";
import { db } from "@/lib/drizzle/db";
import { jobs } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

// 1. Define payload interface
interface MyTaskPayload {
  jobId: string;
  // ... other required fields
}

// 2. Define task
export const myTask = task({
  id: "my-task",  // Unique, stable ID (kebab-case)
  run: async (payload: MyTaskPayload) => {
    // 3. Log start
    logger.info("Task started", { jobId: payload.jobId });

    try {
      // 4. Update progress - Step 1
      await updateProgress(payload.jobId, 10, "Starting processing");

      // 5. Load data from database (if needed)
      const job = await db.query.jobs.findFirst({
        where: eq(jobs.id, payload.jobId),
      });

      if (!job) {
        throw new Error(`Job ${payload.jobId} not found`);
      }

      // 6. Do work
      const result = await doSomeWork(job.data);

      // 7. Update progress - Step 2
      await updateProgress(payload.jobId, 50, "Processing complete");

      // 8. Save results to database
      await db.update(jobs)
        .set({ result, status: "completed" })
        .where(eq(jobs.id, payload.jobId));

      // 9. Update progress - Complete
      await updateProgress(payload.jobId, 100, "Finished");

      // 10. Trigger next task (if needed)
      if (shouldTriggerNext) {
        await tasks.trigger<typeof nextTask>("next-task", {
          jobId: payload.jobId,
          data: result,
        });
      }

      // 11. Return success
      return { success: true, result };

    } catch (error) {
      // 12. Handle errors
      logger.error("Task failed", { jobId: payload.jobId, error });

      await db.update(jobs)
        .set({
          status: "failed",
          error_message: error.message,
        })
        .where(eq(jobs.id, payload.jobId));

      metadata.set("error", error.message);

      throw error; // Let Trigger.dev handle retries
    }
  },
});

// Helper function for progress updates
async function updateProgress(jobId: string, percentage: number, step: string) {
  await db.update(jobs)
    .set({ progress_percentage: percentage })
    .where(eq(jobs.id, jobId));

  metadata.set("progress", percentage);
  metadata.set("currentStep", step);
}
```

### **2. Utility Organization**

**Task-specific utilities** → `trigger/utils/[feature].ts`

```typescript
// trigger/utils/ffmpeg.ts
export async function extractAudio(videoUrl: string): Promise<Buffer> {
  // FFmpeg-specific logic
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  // Duration detection logic
}

export async function splitAudioIntoChunks(audioPath: string, chunkDuration: number): Promise<Chunk[]> {
  // Chunking logic
}
```

**Shared utilities** → `lib/[feature].ts` (can be used by tasks AND Next.js)

```typescript
// lib/jobs.ts
export async function createTranscriptionJob(userId: string, fileData: FileData) {
  // Database operation - usable by Server Actions AND tasks
}

export async function updateJobStatus(jobId: string, status: string) {
  // Database operation - usable by tasks
}
```

**Database operations** → `lib/drizzle/db.ts` (singleton client)

```typescript
// All tasks use the same Supabase client with service role
import { db } from "@/lib/drizzle/db";
```

### **3. Error Handling Patterns**

#### **Retryable Errors (Let Trigger.dev Handle)**
```typescript
try {
  const result = await callExternalAPI();
} catch (error) {
  logger.error("API call failed, will retry", { error });
  throw error; // Trigger.dev retries automatically
}
```

#### **Non-Retryable Errors (Fail Fast)**
```typescript
try {
  const file = await downloadFile(url);
} catch (error) {
  if (error.code === "FILE_NOT_FOUND") {
    // Don't retry - file doesn't exist
    await updateJobStatus(jobId, "failed", "File not found");
    return { success: false, error: "File not found" };
  }
  throw error; // Other errors can retry
}
```

#### **User-Facing Error Messages**
```typescript
catch (error) {
  let userMessage = "An unexpected error occurred";

  if (error.code === "FILE_TOO_LARGE") {
    userMessage = "File exceeds maximum size for your tier. Upgrade to Pro for larger files.";
  } else if (error.code === "QUOTA_EXCEEDED") {
    userMessage = "Monthly upload limit reached. Quota resets on [date].";
  }

  await db.update(jobs)
    .set({
      status: "failed",
      error_message: userMessage, // User-friendly message
    })
    .where(eq(jobs.id, jobId));
}
```

### **4. External API Integration Patterns**

#### **API Clients (Singleton Pattern)**
```typescript
// trigger/utils/openai.ts
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Use in tasks
const client = getOpenAIClient();
const result = await client.audio.transcriptions.create({ ... });
```

#### **Rate Limiting with Retry**
```typescript
import { retry } from "@trigger.dev/sdk";

const result = await retry.fetch("https://api.example.com/data", {
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 1000,
    condition: (response) => response?.status === 429 || response?.status >= 500,
  },
});
```

### **5. File Handling Patterns**

#### **Download Files from Storage**
```typescript
import { createClient } from "@/lib/supabase/server";

const supabase = createClient();
const { data, error } = await supabase.storage
  .from("media-uploads")
  .download(`uploads/${userId}/${jobId}/original.mp3`);

if (error) throw error;

// Convert to buffer for processing
const buffer = Buffer.from(await data.arrayBuffer());
```

#### **Upload Processed Results**
```typescript
const { error } = await supabase.storage
  .from("transcripts")
  .upload(`transcripts/${jobId}/transcript.txt`, transcriptText, {
    contentType: "text/plain",
    upsert: true,
  });
```

---

## 🚨 Common Anti-Patterns to Avoid

### **1. Session State Anti-Pattern**
❌ **WRONG**: Storing state in task memory
```typescript
let currentProgress = 0; // This is lost when task retries!

export const badTask = task({
  id: "bad-task",
  run: async (payload) => {
    currentProgress = 50; // ❌ Lost on retry
  },
});
```

✅ **CORRECT**: Store state in database
```typescript
export const goodTask = task({
  id: "good-task",
  run: async (payload) => {
    await db.update(jobs)
      .set({ progress_percentage: 50 })
      .where(eq(jobs.id, payload.jobId));
  },
});
```

### **2. Complex Chaining Anti-Pattern**
❌ **WRONG**: Deep nesting and complex conditionals
```typescript
if (condition1) {
  if (condition2) {
    if (condition3) {
      await tasks.trigger("task-a", { ... });
    } else {
      await tasks.trigger("task-b", { ... });
    }
  }
}
```

✅ **CORRECT**: Flat, explicit routing
```typescript
if (shouldProcessLargeFile) {
  await tasks.trigger("chunk-file", { jobId });
  return;
}

if (shouldGenerateSummary) {
  await tasks.trigger("generate-summary", { jobId });
  return;
}

// Default path
await tasks.trigger("standard-process", { jobId });
```

### **3. Blocking Operations Anti-Pattern**
❌ **WRONG**: Waiting for non-critical tasks
```typescript
// Wait for AI summary before completing main job
await tasks.triggerAndWait("generate-summary", { jobId });
await updateJobStatus(jobId, "completed"); // User waits for summary
```

✅ **CORRECT**: Fire-and-forget for secondary tasks
```typescript
// Trigger summary but don't wait
await tasks.trigger("generate-summary", { jobId });

// Main job completes immediately
await updateJobStatus(jobId, "completed"); // User can view transcript now
```

### **4. Missing Progress Updates Anti-Pattern**
❌ **WRONG**: No progress tracking
```typescript
export const silentTask = task({
  id: "silent-task",
  run: async (payload) => {
    // ... lots of work ...
    // User has no idea what's happening
  },
});
```

✅ **CORRECT**: Regular progress updates
```typescript
export const verboseTask = task({
  id: "verbose-task",
  run: async (payload) => {
    await updateProgress(jobId, 10, "Validating file");
    // ... validation ...

    await updateProgress(jobId, 30, "Extracting audio");
    // ... extraction ...

    await updateProgress(jobId, 60, "Transcribing");
    // ... transcription ...

    await updateProgress(jobId, 100, "Complete");
  },
});
```

### **5. Shared Mutable State Anti-Pattern**
❌ **WRONG**: Multiple tasks modifying same data concurrently
```typescript
// Task A and Task B both update same field
await db.update(jobs).set({ result: resultA });
await db.update(jobs).set({ result: resultB }); // Overwrites A!
```

✅ **CORRECT**: Separate fields or merge results
```typescript
// Each task updates its own field
await db.update(jobs).set({ result_a: resultA });
await db.update(jobs).set({ result_b: resultB });

// Or merge in a final task
await tasks.triggerAndWait("merge-results", { jobId });
```

---

## 📊 Workflow Design Checklist

When creating a workflow document, ensure you cover all these areas:

### **1. Workflow Overview**
- [ ] **Core Flow**: 1-2 sentence summary of entire workflow
- [ ] **Trigger Mechanism**: What starts this workflow?
- [ ] **Expected Duration**: Typical completion time (note if parallel processing reduces this)
- [ ] **Key Decision Points**: What causes workflow to branch?
- [ ] **⚡ Performance Optimizations**: Document any parallel processing that speeds up workflow

### **2. Task Chain Diagram**
- [ ] **ASCII Visual**: Flow diagram showing task sequence
- [ ] **Decision Points Marked**: Show where workflow branches
- [ ] **Percentage Ranges**: Show progress ranges for each task

### **3. Task Definitions**
For each task:
- [ ] **Task ID**: Unique kebab-case identifier
- [ ] **Payload Interface**: Complete TypeScript interface
- [ ] **Purpose**: What this task accomplishes
- [ ] **Progress Range**: Percentage range (e.g., 10% → 30%)
- [ ] **⚡ Parallel Processing**: If processing multiple items, document use of Promise.all() for performance
- [ ] **Database Updates**: What tables are modified
- [ ] **Chaining Logic**: What task(s) are triggered next
- [ ] **Error Handling**: Retry strategy and failure conditions

### **4. Database Schema**
- [ ] **Job Tracking Table**: Status, progress, metadata columns
- [ ] **Results Tables**: Where processed data is stored
- [ ] **Usage Tracking**: If quota enforcement is needed
- [ ] **Relationships**: Foreign keys and joins
- [ ] **Indexes**: Performance-critical columns

### **5. File Locations**
- [ ] **Task Files**: `trigger/tasks/[task-name].ts`
- [ ] **Utility Files**: `trigger/utils/[feature].ts`
- [ ] **Database Schema**: `lib/drizzle/schema/[table].ts`
- [ ] **Server Actions**: `app/actions/[feature].ts` (for triggering)

### **6. Progress Tracking**
- [ ] **Database Updates**: How progress_percentage is updated
- [ ] **Metadata Updates**: Real-time UI communication via `metadata.set()`
- [ ] **Frontend Integration**: Streaming (`metadata.stream()` + `useRealtimeRunWithStreams`) or polling (database queries every 3s)

### **7. Common Failure Points**
- [ ] **External API Failures**: Rate limits, timeouts
- [ ] **File Processing Errors**: Invalid formats, corruption
- [ ] **Quota Exceeded**: User tier limits
- [ ] **Concurrency Issues**: Multiple jobs competing

### **8. Quick Implementation Checklist**
- [ ] **Prerequisites**: Environment variables, extensions needed
- [ ] **Setup Steps**: Database migrations, configuration
- [ ] **Testing Strategy**: How to verify workflow works
- [ ] **Deployment Notes**: Production considerations

---

## 🎨 Example Workflow Conversion

### **User Request** (Phase 1 Input):
"I need to process uploaded PDF documents by extracting text, generating summaries, and allowing users to ask questions about them."

### **Phase 1 Clarification Questions**:
1. "What triggers this workflow - immediate upload or user initiates processing?"
2. "How large are typical PDFs? Should we chunk very large documents?"
3. "What AI model for summaries - GPT-4o, Claude, or other?"
4. "Should users see real-time progress or just completion notification?"
5. "What happens if PDF is scanned image with no text?"
6. "Are there tier-based limits on document size or monthly uploads?"

### **Phase 2: Create Workflow Documentation** (after clarification):

**Step 1**: Search for existing workflow templates
```bash
# Use Glob tool to find: ai_docs/prep/trigger_workflow_*.md
# Found: trigger_workflow_transcription.md
# Action: Read it to understand structure and formatting
```

**Step 2**: Create new workflow documentation file

**ACTION**: Use **Write tool** to create file `ai_docs/prep/trigger_workflow_pdf_processing.md`

**FILE CONTENTS**:
````markdown
# 📄 PDF Document Processing Workflow: Trigger.dev Quick Reference

> **Purpose**: Quick-reference "digital twin" of the PDF processing workflow to help AI understand the system without re-reading all code files.

---

## 📋 Workflow Overview

This is a Trigger.dev v4 background job workflow that processes PDF documents by extracting text, detecting if OCR is needed, generating AI summaries, and creating embeddings for Q&A. The workflow uses **conditional branching** based on document type and subscription tier.

**Core Flow**: Upload → Extract Text → [OCR if scanned] → Generate Summary → [Embeddings if Pro] → Complete

**Key Decisions**:
- **Document Type**: Scanned PDFs require OCR processing
- **Subscription Tier**: Pro users get vector embeddings for Q&A functionality

**Tech Stack**:
- Trigger.dev v4 (background jobs)
- pdfplumber (text extraction)
- Tesseract (OCR)
- GPT-4o (summaries)
- OpenAI Embeddings (Q&A)

---

## 🔗 Task Chain Diagram

```
[USER UPLOADS PDF]
        ↓
[createDocumentJob() + triggerBackgroundJob()]
        ↓
┌────────────────────────────────────────┐
│ extract-text                           │
│ • Download PDF from storage            │
│ • Extract text with pdfplumber         │
│ • Detect if scanned (OCR needed)       │
│ • Progress: 10% → 40%                  │
└──────────┬─────────────────────────────┘
           │
           ├──── Is scanned PDF? ─────┐
           │                           │
          YES                         NO
           │                           │
           ↓                           ↓
    ┌──────────────┐        ┌─────────────────┐
    │ ocr-pdf      │        │ chunk-text      │
    │ • Tesseract  │        │ • Split by size │
    │ • Progress:  │        │ • Progress:     │
    │   40% → 60%  │        │   40% → 50%     │
    └──────┬───────┘        └────────┬────────┘
           │                         │
           └─────────┬───────────────┘
                     ↓
         ┌───────────────────────────┐
         │ generate-summary          │
         │ • GPT-4o API call         │
         │ • Save to database        │
         │ • Progress: 60% → 90%     │
         └───────────┬───────────────┘
                     │
         ┌──── Tier = Pro? ───┐
         │                    │
        YES                  NO
         │                    │
         ↓                    ↓
    ┌────────────┐      [Job completed]
    │ generate-  │      [Progress: 100%]
    │ embeddings │
    │ • OpenAI   │
    │ • 90→100%  │
    └────────────┘
```

---

## 🌳 Critical Decision Points

### Decision 1: OCR Detection (extract-text task)
[Full decision logic with code snippets...]

### Decision 2: Tier-Based Embeddings (generate-summary task)
[Full decision logic with code snippets...]

---

## 📊 Core Data Flow

### Task Payloads
[Complete TypeScript interfaces...]

### Database Tables
[Full schema definitions...]

---

[... Additional sections following template structure ...]

**Last Updated**: January 2025
**Current State**: Design Phase - Documentation Complete
````

**Step 3**: Update workflow index

**ACTION**: Use **Edit tool** to update `ai_docs/prep/trigger_workflows.md`

Add this entry to the "Available Workflows" section:
```markdown
### 📄 PDF Document Processing Workflow
**File**: `trigger_workflow_pdf_processing.md`
**Purpose**: PDF upload → Text extraction → OCR (if scanned) → AI summary → Embeddings (Pro tier)
**Trigger**: User uploads PDF via web UI
**Duration**: 2-5 minutes (depends on PDF size and whether OCR is needed)
**Key Tasks**:
- `extract-text` - Download PDF and extract text with pdfplumber
- `ocr-pdf` - Tesseract OCR for scanned documents (conditional)
- `generate-summary` - GPT-4o summary generation
- `generate-embeddings` - OpenAI embeddings for Q&A (conditional: Pro tier)

**Key Decision Points**:
- Text extraction < 100 words → OCR path
- User tier = Pro → Generate embeddings
```

Update "Total Workflows" count: `2` → `3`

**Step 4**: Inform user

**MESSAGE TO USER**:
```
✅ Phase 2 Complete: Workflow documentation created

I've created the following files:
- `ai_docs/prep/trigger_workflow_pdf_processing.md` - Complete workflow documentation
- Updated `ai_docs/prep/trigger_workflows.md` - Added workflow index entry

The documentation includes:
- Complete task chain with ASCII diagram
- 4 tasks with conditional routing (OCR and embeddings paths)
- Decision point logic for scanned PDFs and Pro tier features
- Database schema for document_jobs and documents tables
- Progress tracking ranges (0-100%)

Next steps:
1. **Review the documentation** - Check if the workflow design matches your expectations
2. **Proceed with implementation** - I can create tasks, migrations, and UI components
3. **Modify the design** - Request changes to the workflow architecture

What would you like to do?
```

This example demonstrates the complete Phase 2 process: studying existing templates, creating documentation files with the Write tool, updating the index, and informing the user.

---

## 📚 Reference Documentation

### **Related Files**:
- **Task Implementation**: `ai_docs/dev_templates/task_template.md`
- **Trigger.dev API Reference**: `ai_docs/planning/trigger_dev_research.md`
- **Example Workflow**: `ai_docs/prep/trigger_workflow_transcription.md`
- **Workflow Index**: `ai_docs/prep/trigger_workflows.md`

### **External Resources**:
- **Trigger.dev v4 Docs**: https://trigger.dev/docs
- **Tasks Overview**: https://trigger.dev/docs/tasks/overview
- **Queue & Concurrency**: https://trigger.dev/docs/queue-concurrency
- **Realtime SDK**: https://trigger.dev/docs/realtime

---

## ✅ Phase 2 Completion Checklist & Message

After creating workflow documentation, verify:

- [ ] **Created workflow doc**: `ai_docs/prep/trigger_workflow_[name].md` with complete structure
- [ ] **Updated index**: `ai_docs/prep/trigger_workflows.md` with new workflow entry
- [ ] **All sections present**: Overview, Task Chain, Decision Points, Payloads, Database Schema, Progress Tracking, etc.
- [ ] **ASCII diagrams formatted**: Proper alignment and box drawing
- [ ] **Payload interfaces complete**: All fields typed with TypeScript
- [ ] **Progress ranges cover 0-100%**: All tasks account for full progress range
- [ ] **Streaming documented**: If workflow uses `metadata.stream()`, it's explained with frontend integration
- [ ] **Used existing template**: Read and followed structure from existing `trigger_workflow_*.md` files (if available)

### **Message Template for User:**

After completing Phase 2, inform the user with this message:

```
✅ Phase 2 Complete: Workflow documentation created

I've created the following files:
- `ai_docs/prep/trigger_workflow_[name].md` - Complete workflow documentation
- Updated `ai_docs/prep/trigger_workflows.md` - Added workflow index entry

The documentation includes:
- [List key features: e.g., "Complete task chain with ASCII diagram"]
- [List task count: e.g., "3 tasks with conditional routing"]
- [List decision points: e.g., "File size routing and tier-based features"]
- [List database tables: e.g., "Schema for jobs and results tables"]
- [List progress tracking: e.g., "Progress ranges (0-100%)"]

Next steps:
1. **Review the documentation** - Check if the workflow design matches your expectations
2. **Proceed with implementation** - I can create tasks, migrations, and UI components
3. **Modify the design** - Request changes to the workflow architecture

What would you like to do?
```

Customize the message based on the specific workflow created, but always include:
- ✅ Files created/updated
- ✅ Key features included
- ✅ Three clear next step options

---

## 🎯 Final Checklist for AI Agents

Before completing workflow documentation creation:

- [ ] **Phase 1 completed** with explicit user approval to proceed
- [ ] **All decision points** clearly identified and documented
- [ ] **Task chain diagram** shows complete flow with percentages
- [ ] **Payload interfaces** defined for every task
- [ ] **Database schema** fully documented with sample data
- [ ] **Progress tracking** strategy covers 0-100% range
- [ ] **Error handling** addresses common failure scenarios
- [ ] **File locations** specified for all code components
- [ ] **Anti-patterns** avoided (session state, blocking operations)
- [ ] **Saved to correct location**: `ai_docs/prep/trigger_workflow_[name].md`
- [ ] **Updated index file**: Added entry to `ai_docs/prep/trigger_workflows.md`

---

*Template Version: 1.0*
*Last Updated: January 2025*
*Created By: Brandon Hancock*
