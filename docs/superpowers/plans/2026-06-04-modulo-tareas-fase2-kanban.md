# Módulo de Tareas — Fase 2: Kanban por cuenta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tablero Kanban de 6 columnas por cuenta (`/app/tareas/[accountId]`) con drag & drop, alta/edición de tareas (responsable, fecha de entrega, prioridad, tilde público, borrar) vía un drawer; índice de cuentas en `/app/tareas`; ítem "Tareas" en el sidebar; y reemplazo del panel viejo embebido en el detalle de cuenta.

**Architecture:** El campo `tasks.status` pasa a ser la columna del board (`auto|backlog|evaluacion|en_proceso|por_aprobar|listas`). Para evitar ventana de rotura con la base compartida dev/prod, se usa **normalización en lectura**: una función pura mapea los valores legacy (`pending→backlog`, `completed→listas`) al leer, así el código nuevo funciona con datos sin migrar. Los escritores nuevos usan las keys nuevas. El backfill de datos es limpieza final opcional. Drag & drop con `@dnd-kit`. El board es un componente cliente reutilizado por la ruta dedicada y por el detalle de cuenta.

**Tech Stack:** Next.js 15 (App Router, RSC + Server Actions), Drizzle, `@dnd-kit/core` + `@dnd-kit/sortable`, Tailwind v4, sistema glassmorphism existente (`components/ui/glass-card.tsx`), lucide-react.

**Verificación:** `npm run type-check` + `npm run build` (NO hay test runner; `npm run lint` cae en wizard interactivo — no usar). dev y prod comparten Supabase; el único migrate es `npm run db:migrate`.

**Convenciones de estilo:** seguir `components/tasks-panel.tsx` (que vamos a borrar) como referencia de estética para badges de prioridad, selector de responsable y tarjetas; y el sistema glass de `components/sidebar.tsx` / `GlassCard`.

---

### Task 1: Instalar @dnd-kit

**Files:**
- Modify: `package.json` (vía npm)

- [ ] **Step 1: Instalar las dependencias**

Run: `npm install @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3`
Expected: agrega las 3 deps a `package.json`, sin errores de peer-deps que rompan (React 19 es compatible; si npm tira `ERESOLVE`, reintentar con `npm install ... --legacy-peer-deps` y anotarlo como concern).

- [ ] **Step 2: Verificar que el build sigue OK**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(tareas): agregar @dnd-kit para el tablero Kanban"
```

---

### Task 2: Modelo de columnas (client-safe)

**Files:**
- Create: `lib/tareas/columns.ts`

- [ ] **Step 1: Escribir el archivo**

```ts
// Modelo de columnas del Kanban. Client-safe (sin imports de servidor):
// se usa tanto en RSC como en componentes cliente.

export const TAREA_COLUMNS = [
  { key: "auto", label: "Automáticas de Meets" },
  { key: "backlog", label: "Backlog" },
  { key: "evaluacion", label: "Evaluación" },
  { key: "en_proceso", label: "En proceso" },
  { key: "por_aprobar", label: "Por Aprobar" },
  { key: "listas", label: "Listas" },
] as const;

export type TareaColumnKey = (typeof TAREA_COLUMNS)[number]["key"];

export const TAREA_COLUMN_KEYS: TareaColumnKey[] = TAREA_COLUMNS.map(
  (c) => c.key
);

const COLUMN_LABEL: Record<TareaColumnKey, string> = TAREA_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key] = c.label;
    return acc;
  },
  {} as Record<TareaColumnKey, string>
);

export function columnLabel(key: TareaColumnKey): string {
  return COLUMN_LABEL[key];
}

/**
 * Normaliza el `status` crudo de la DB a una columna del board. Mapea los
 * valores legacy (`pending`/`completed`) a las columnas nuevas para que el
 * tablero funcione aun con datos sin migrar. Cualquier valor desconocido cae
 * en `backlog`.
 */
export function normalizeColumn(status: string): TareaColumnKey {
  if ((TAREA_COLUMN_KEYS as string[]).includes(status)) {
    return status as TareaColumnKey;
  }
  if (status === "completed") return "listas";
  // 'pending', 'in_progress' y cualquier otro → backlog
  return "backlog";
}

/** Una tarea está terminada cuando vive en la columna `listas`. */
export function isDoneColumn(key: TareaColumnKey): boolean {
  return key === "listas";
}

/**
 * Config de prioridad (label + clases Tailwind). Centralizado acá para que la
 * tarjeta y el drawer lo compartan sin depender del viejo `tasks-panel.tsx`
 * (que se elimina en esta misma fase). Es el mismo objeto que usaba el panel.
 */
export const PRIORITY_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: "Crítica", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  2: { label: "Alta", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  3: { label: "Media", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  4: { label: "Baja", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  5: { label: "Mínima", className: "bg-muted text-muted-foreground" },
};
```

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/tareas/columns.ts
git commit -m "feat(tareas): modelo de columnas + normalizeColumn (read-time)"
```

---

### Task 3: Query del tablero por cuenta

**Files:**
- Create: `lib/queries/tareas.ts`

- [ ] **Step 1: Escribir la query**

Reutiliza el join existente (tareas + transcript + responsable) pero agrega el conteo de menciones de meets (`task_meeting_mentions`) para el badge "mencionada N veces", y la columna normalizada. Devuelve las tareas ordenadas por `sortOrder` asc dentro de cada columna.

```ts
import { db } from "@/lib/drizzle/db";
import {
  tasks,
  transcripts,
  users,
  taskMeetingMentions,
} from "@/lib/drizzle/schema";
import { eq, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Task } from "@/lib/drizzle/schema";
import { normalizeColumn, type TareaColumnKey } from "@/lib/tareas/columns";

export type KanbanTask = Task & {
  column: TareaColumnKey;
  meetingDate: string | null;
  meetingCreatedAt: Date | null;
  transcriptFileName: string | null;
  assigneeName: string | null;
  mentionCount: number;
};

export async function getAccountKanbanTasks(
  accountId: string
): Promise<KanbanTask[]> {
  const assigneeUser = alias(users, "assignee_user");

  const rows = await db
    .select({
      task: tasks,
      meetingDate: transcripts.meetingDate,
      meetingCreatedAt: transcripts.createdAt,
      transcriptFileName: transcripts.fileName,
      assigneeName: assigneeUser.fullName,
      mentionCount: sql<number>`(
        select count(*) from ${taskMeetingMentions}
        where ${taskMeetingMentions.taskId} = ${tasks.id}
      )`,
    })
    .from(tasks)
    .leftJoin(transcripts, eq(tasks.transcriptId, transcripts.id))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(eq(tasks.accountId, accountId))
    .orderBy(asc(tasks.sortOrder), asc(tasks.priority));

  return rows.map((r) => ({
    ...r.task,
    column: normalizeColumn(r.task.status),
    meetingDate: r.meetingDate ?? null,
    meetingCreatedAt: r.meetingCreatedAt ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    assigneeName: r.assigneeName ?? null,
    mentionCount: Number(r.mentionCount ?? 0),
  }));
}
```

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/tareas.ts
git commit -m "feat(tareas): query getAccountKanbanTasks (columna + mentionCount)"
```

---

### Task 4: Server Actions del tablero

**Files:**
- Create: `app/actions/tareas.ts`

- [ ] **Step 1: Escribir las actions**

Todas validan acceso con `canAccessAccountTasks` (de `lib/queries/task-access.ts`). Patrón base copiado de `app/actions/tasks.ts` (requireUserId + getWorkspaceByUserId + revalidatePath). Revalidan tanto la ruta del tablero como el detalle de cuenta.

```ts
"use server";

import { db } from "@/lib/drizzle/db";
import { tasks } from "@/lib/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { canAccessAccountTasks } from "@/lib/queries/task-access";
import {
  TAREA_COLUMN_KEYS,
  isDoneColumn,
  type TareaColumnKey,
} from "@/lib/tareas/columns";
import { revalidatePath } from "next/cache";

async function authorize(accountId: string): Promise<{ workspaceId: string; userId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const ok = await canAccessAccountTasks(userId, workspace.id, accountId);
  if (!ok) throw new Error("Sin acceso a las tareas de esta cuenta");
  return { workspaceId: workspace.id, userId };
}

function revalidate(accountId: string): void {
  revalidatePath(`/app/tareas/${accountId}`);
  revalidatePath("/app/tareas");
  revalidatePath(`/app/accounts/${accountId}`);
}

function isColumn(value: string): value is TareaColumnKey {
  return (TAREA_COLUMN_KEYS as string[]).includes(value);
}

export async function moveTask(
  taskId: string,
  accountId: string,
  toColumn: string,
  newSortOrder: number
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  if (!isColumn(toColumn)) return { error: "Columna inválida" };
  await db
    .update(tasks)
    .set({
      status: toColumn,
      sortOrder: newSortOrder,
      completedAt: isDoneColumn(toColumn) ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)));
  revalidate(accountId);
  return {};
}

export async function createKanbanTask(
  accountId: string,
  column: string,
  description: string,
  priority: number,
  assigneeId: string | null,
  dueDate: string | null
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);
  if (!isColumn(column)) return { error: "Columna inválida" };
  if (!description.trim()) return { error: "La descripción es requerida" };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.status, column)));

  await db.insert(tasks).values({
    accountId,
    workspaceId,
    createdBy: userId,
    assigneeId: assigneeId || null,
    description: description.trim(),
    priority,
    status: column,
    source: "manual",
    sortOrder: Number(maxOrder) + 1,
    dueDate: dueDate || null,
  });
  revalidate(accountId);
  return {};
}

export async function updateTaskFields(
  taskId: string,
  accountId: string,
  fields: {
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (fields.description !== undefined) {
    if (!fields.description.trim()) return { error: "La descripción es requerida" };
    patch.description = fields.description.trim();
  }
  if (fields.priority !== undefined) patch.priority = fields.priority;
  if (fields.assigneeId !== undefined) patch.assigneeId = fields.assigneeId || null;
  if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate || null;
  if (fields.isPublic !== undefined) patch.isPublic = fields.isPublic;

  await db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)));
  revalidate(accountId);
  return {};
}

export async function deleteKanbanTask(
  taskId: string,
  accountId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)));
  revalidate(accountId);
  return {};
}
```

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions/tareas.ts
git commit -m "feat(tareas): server actions del tablero (move/create/update/delete, access-checked)"
```

---

### Task 5: Tarjeta del Kanban

**Files:**
- Create: `components/tareas/task-card.tsx`

- [ ] **Step 1: Escribir la tarjeta (presentational + sortable)**

Componente cliente. Usa `useSortable` de `@dnd-kit/sortable` con `id={task.id}`. Muestra: descripción (2 líneas máx), badge de prioridad (reusar el `PRIORITY_CONFIG` de `tasks-panel.tsx` — copiar el objeto), avatar/nombre de responsable si hay, `dueDate` con color (rojo si vencida, ámbar si ≤2 días, gris si futura), badge `🔁 ×N` si `mentionCount > 1`, y un ícono de "público" (lucide `Eye` si `isPublic`, `EyeOff` si no) bien visible. Click en la tarjeta (no en el handle de drag) llama `onOpen(task)`.

Interface:
```ts
import type { KanbanTask } from "@/lib/queries/tareas";

interface TaskCardProps {
  task: KanbanTask;
  onOpen: (task: KanbanTask) => void;
}
```

Patrón dnd-kit obligatorio:
```tsx
"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// ...
export function TaskCard({ task, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="...glass card...">
      {/* drag handle: spread {...attributes} {...listeners} on a grip icon button */}
      {/* contenido clickeable: onClick={() => onOpen(task)} */}
    </div>
  );
}
```

Reglas de estilo: usar clases Tailwind del sistema (bordes `border-border`, `bg-card`, `rounded-lg`, texto `text-sm`). Importar `PRIORITY_CONFIG` de `@/lib/tareas/columns` (Task 2). Para la fecha:
```ts
function dueDateColor(due: string | null): string {
  if (!due) return "";
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "text-red-600 dark:text-red-400";
  if (days <= 2) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}
```

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS (puede haber warning de import no usado si el board aún no existe; está bien mientras type-check pase).

- [ ] **Step 3: Commit**

```bash
git add components/tareas/task-card.tsx
git commit -m "feat(tareas): TaskCard (sortable, prioridad/fecha/responsable/público/menciones)"
```

---

### Task 6: Tablero Kanban con drag & drop

**Files:**
- Create: `components/tareas/kanban-board.tsx`

- [ ] **Step 1: Escribir el board**

Componente cliente. Props:
```ts
import type { KanbanTask } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface KanbanBoardProps {
  accountId: string;
  initialTasks: KanbanTask[];
  members: WorkspaceMemberWithUser[];
}
```

Comportamiento:
- Estado local `cols: Record<TareaColumnKey, KanbanTask[]>` derivado de `initialTasks` (agrupar por `task.column`, ya vienen ordenados por sortOrder). `useEffect` para re-derivar cuando cambia `initialTasks` (tras `router.refresh()`).
- `DndContext` (de `@dnd-kit/core`) con `PointerSensor` (activationConstraint `{ distance: 5 }`) para no robar los clicks. Render: las 6 columnas de `TAREA_COLUMNS` en un contenedor `flex gap-3 overflow-x-auto`. Cada columna es un drop target con `useDroppable({ id: column.key })` y envuelve sus tarjetas en `SortableContext` (items = ids, strategy `verticalListSortingStrategy`).
- `onDragEnd(event)`: resolver la columna destino (si `over.id` es una key de columna, esa; si es un id de tarea, la columna que la contiene). Reordenar/mover en el estado local (optimista) y luego llamar `moveTask(taskId, accountId, toColumn, newIndex)` y `router.refresh()`. El `newSortOrder` = índice destino dentro de la columna.
- Cada columna tiene header con `columnLabel(key)` + contador, y un botón "+ Nueva" que abre un `NewTaskInline` (form compacto: textarea descripción + selector prioridad + selector responsable + input date) que llama `createKanbanTask`.
- Click en una tarjeta abre el `TaskDrawer` (Task 7) con la tarea seleccionada (estado `selected: KanbanTask | null`).

Esqueleto de la lógica de drag (incluir tal cual, completar el resto siguiendo el ejemplo "multiple containers" de @dnd-kit):
```tsx
function findColumnOf(id: string, cols: Record<TareaColumnKey, KanbanTask[]>): TareaColumnKey | null {
  for (const key of TAREA_COLUMN_KEYS) {
    if (cols[key].some((t) => t.id === id)) return key;
  }
  return null;
}

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;
  const activeId = String(active.id);
  const overId = String(over.id);
  const from = findColumnOf(activeId, cols);
  const to = (TAREA_COLUMN_KEYS as string[]).includes(overId)
    ? (overId as TareaColumnKey)
    : findColumnOf(overId, cols);
  if (!from || !to) return;

  setCols((prev) => {
    const next = { ...prev, [from]: [...prev[from]], [to]: [...prev[to]] };
    const moving = next[from].find((t) => t.id === activeId);
    if (!moving) return prev;
    next[from] = next[from].filter((t) => t.id !== activeId);
    const overIndex = next[to].findIndex((t) => t.id === overId);
    const insertAt = overIndex >= 0 ? overIndex : next[to].length;
    next[to].splice(insertAt, 0, { ...moving, column: to });
    void moveTask(activeId, accountId, to, insertAt).then(() => router.refresh());
    return next;
  });
}
```

Reusar `WorkspaceMemberWithUser` para los selectores de responsable (mismo patrón que `tasks-panel.tsx`). Estilo de columnas: tarjeta glass por columna (`rounded-xl border bg-muted/30`), ancho fijo `w-72 shrink-0`.

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/tareas/kanban-board.tsx
git commit -m "feat(tareas): KanbanBoard con drag & drop (@dnd-kit) + alta inline por columna"
```

---

### Task 7: Drawer de detalle de tarea

**Files:**
- Create: `components/tareas/task-drawer.tsx`

- [ ] **Step 1: Escribir el drawer**

Componente cliente. Panel lateral (fixed right, `w-full max-w-md`, overlay glass) que se abre cuando hay una tarea seleccionada. Props:
```ts
import type { KanbanTask } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface TaskDrawerProps {
  task: KanbanTask | null;
  accountId: string;
  members: WorkspaceMemberWithUser[];
  onClose: () => void;
}
```

Contenido (todo edición en vivo, llamando `updateTaskFields` + `router.refresh()`):
- Descripción editable (textarea, guardar al blur).
- Selector de responsable (mismo `select` que tasks-panel).
- Input `date` para `dueDate`.
- Selector de prioridad (PRIORITY_CONFIG).
- Toggle "Visible para el cliente" (`isPublic`) — switch bien visible con `Eye`/`EyeOff` y texto explicativo.
- Sección "Menciones en reuniones": si `mentionCount > 0`, texto "Mencionada N veces" + (si hay) `transcriptFileName` / fecha. (El listado detallado de menciones es Fase 3 — acá solo el conteo y el origen de la tarea: `sourceExcerpt`/`sourceContext` si existen, igual que el bloque expandido de `tasks-panel.tsx`.)
- Botón "Eliminar" (con `confirm`) → `deleteKanbanTask` → `onClose` + `router.refresh()`.
- **Placeholder explícito**: un bloque deshabilitado "Comentarios y adjuntos — próximamente" (se implementa en Fase 4). NO construir comentarios/adjuntos en esta fase (YAGNI).

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/tareas/task-drawer.tsx
git commit -m "feat(tareas): TaskDrawer (editar responsable/fecha/prioridad/público, borrar)"
```

---

### Task 8: Ruta del tablero por cuenta

**Files:**
- Create: `app/(protected)/app/tareas/[accountId]/page.tsx`

- [ ] **Step 1: Escribir la página**

RSC. Guard de acceso con `canAccessAccountTasks`; si no, `redirect("/unauthorized")`. Carga cuenta (`getAccountById`), tareas (`getAccountKanbanTasks`) y miembros (`getWorkspaceMembers`). Renderiza header con back-link a `/app/tareas`, nombre de cuenta, y el `KanbanBoard`.

```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceWithMember, getWorkspaceMembers } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { canAccessAccountTasks } from "@/lib/queries/task-access";
import { getAccountKanbanTasks } from "@/lib/queries/tareas";
import { KanbanBoard } from "@/components/tareas/kanban-board";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function TareasAccountPage({ params }: PageProps) {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member } = result;

  const { accountId } = await params;
  const allowed = await canAccessAccountTasks(userId, workspace.id, accountId);
  if (!allowed) redirect("/unauthorized");

  const account = await getAccountById(accountId, workspace.id, { userId, role: member.role });
  if (!account) notFound();

  const [boardTasks, members] = await Promise.all([
    getAccountKanbanTasks(accountId),
    getWorkspaceMembers(workspace.id),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/app/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Tareas
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Tablero de tareas</p>
      </div>
      <KanbanBoard accountId={accountId} initialTasks={boardTasks} members={members} />
    </div>
  );
}
```

(Confirmar la firma de `getAccountById` leyendo `lib/queries/accounts.ts`; si difiere, adaptar. Si `getAccountById` ya valida acceso por rol y devuelve null para cuentas sin acceso, igual mantener el guard explícito de `canAccessAccountTasks`.)

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS, ruta `/app/tareas/[accountId]` aparece en la tabla de rutas.

- [ ] **Step 3: Commit**

```bash
git add "app/(protected)/app/tareas/[accountId]/page.tsx"
git commit -m "feat(tareas): ruta /app/tareas/[accountId] con el tablero"
```

---

### Task 9: Índice de cuentas /app/tareas

**Files:**
- Create: `app/(protected)/app/tareas/page.tsx`

- [ ] **Step 1: Escribir el índice**

RSC. Lista las cuentas accesibles (`getTaskAccessibleAccountIds`) como grid de `GlassCard` clickeables que linkean a `/app/tareas/[id]`. Es un placeholder funcional; la vista global con tablero/lista llega en Fase 6.

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getTaskAccessibleAccountIds } from "@/lib/queries/task-access";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { inArray } from "drizzle-orm";
import { GlassCard } from "@/components/ui/glass-card";

export default async function TareasIndexPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const { accountIds } = await getTaskAccessibleAccountIds(userId, workspace.id);
  const rows =
    accountIds.length > 0
      ? await db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(inArray(accounts.id, accountIds))
          .orderBy(accounts.name)
      : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">
          Elegí una cuenta para abrir su tablero. (La vista global llega pronto.)
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenés cuentas con tareas asignadas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((a) => (
            <Link key={a.id} href={`/app/tareas/${a.id}`}>
              <GlassCard className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
                <span className="font-medium">{a.name}</span>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(protected)/app/tareas/page.tsx"
git commit -m "feat(tareas): índice /app/tareas (selector de cuenta, placeholder de la global)"
```

---

### Task 10: Navegación (sidebar + mobile)

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `components/mobile-tab-bar.tsx`

- [ ] **Step 1: Sidebar — agregar el ítem "Tareas"**

En `components/sidebar.tsx`, importar `ListChecks` de lucide-react (sumarlo a la línea de import existente de `lucide-react`) y agregar al array `navItems`, entre Portfolio y Finanzas:
```ts
  { label: "Tareas", href: "/app/tareas", icon: ListChecks },
```

- [ ] **Step 2: Mobile tab bar — agregar el ítem**

En `components/mobile-tab-bar.tsx`, importar `ListChecks` y agregar al array `tabs`, entre Portfolio y Finanzas:
```ts
  { label: "Tareas", href: "/app/tareas", Icon: ListChecks },
```

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar.tsx components/mobile-tab-bar.tsx
git commit -m "feat(tareas): ítem 'Tareas' en sidebar y mobile tab bar"
```

---

### Task 11: Reemplazar el panel en el detalle de cuenta + limpieza

**Files:**
- Modify: `components/account-detail/tasks-section.tsx`
- Delete: `components/tasks-panel.tsx`
- Delete: `app/actions/tasks.ts`
- Modify (si hace falta): `lib/queries/tasks.ts`

- [ ] **Step 1: Reescribir `tasks-section.tsx` para usar el board nuevo**

Reemplaza el render de `TasksPanel` por el `KanbanBoard`. Mantiene el patrón server-component (fetch + pasar a cliente), pero ahora usa `getAccountKanbanTasks` y un header con el conteo por columna. Conserva la firma `{ accountId, members }`.

```tsx
import { getAccountKanbanTasks } from "@/lib/queries/tareas";
import { KanbanBoard } from "@/components/tareas/kanban-board";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Props {
  accountId: string;
  members: WorkspaceMemberWithUser[];
}

export async function TasksSection({ accountId, members }: Props) {
  const boardTasks = await getAccountKanbanTasks(accountId);
  const total = boardTasks.length;
  const done = boardTasks.filter((t) => t.column === "listas").length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tareas {total > 0 && <span>· {done}/{total} listas</span>}
        </h2>
      </div>
      <KanbanBoard accountId={accountId} initialTasks={boardTasks} members={members} />
    </section>
  );
}
```

(Si `tasks-section.tsx` tenía un wrapper colapsable/encabezado con ícono, conservar ese envoltorio y solo cambiar el cuerpo. Leer el archivo actual antes de reescribir para no perder estructura.)

- [ ] **Step 2: Borrar el panel viejo y sus actions**

Confirmar primero que no quedan importadores:
Run: `git grep -n "tasks-panel\|from \"@/app/actions/tasks\"\|getAccountTasks" -- "*.ts" "*.tsx"`
Expected: tras el Step 1, NO debe haber referencias a `components/tasks-panel` ni a `@/app/actions/tasks`. `getAccountTasks` puede seguir si algo lo usa; si nada lo usa, se puede borrar de `lib/queries/tasks.ts` (pero NO borrar el archivo si exporta el tipo `Task` u otros que se reexporten — verificar).

Luego:
```bash
git rm components/tasks-panel.tsx app/actions/tasks.ts
```
Si `lib/queries/tasks.ts` queda sin consumidores de `getAccountTasks`, borrar esa función (dejar el archivo solo si reexporta algo aún usado; si no, `git rm lib/queries/tasks.ts`). Verificar con type-check.

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS, sin imports rotos.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tareas): detalle de cuenta usa el Kanban; baja del panel y actions viejas"
```

---

### Task 12: Compat de la vista pública + verificación final

**Files:**
- Modify: `components/public-account-view/tasks-section.tsx`

- [ ] **Step 1: Ajustar el mapeo de estados de la vista pública**

Hoy mapea `completed` ⇒ "Completadas" y `pending|in_progress` ⇒ "En curso". Tras escribir keys nuevas, las tareas reales terminadas tienen `status === "listas"` (y las viejas, `completed`). Ajustar para que ambas cuenten como completadas, y todo lo demás como "en curso". El demo (`mock-data.ts`) sigue usando `completed`/`pending`/`in_progress` y debe seguir andando con este mapeo.

En `components/public-account-view/tasks-section.tsx`:
- Donde filtra completadas (línea ~100): `(t) => t.status === "completed" || t.status === "listas"`.
- Donde filtra "en curso" (línea ~94): `(t) => t.status !== "completed" && t.status !== "listas"`.
- Donde determina `isCompleted` (línea ~211): `task.status === "completed" || task.status === "listas"`.

(Leer el archivo y aplicar exactamente en esos tres puntos. No tocar nada más de la vista pública — el Kanban público real es Fase 7.)

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/public-account-view/tasks-section.tsx
git commit -m "fix(tareas): vista pública/demo cuenta 'listas' como completada (compat keys nuevas)"
```

- [ ] **Step 4: Verificación funcional manual (controller)**

Antes de mergear, levantar `npm run dev` y verificar en el navegador:
- `/app/tareas` lista las cuentas accesibles.
- `/app/tareas/[id]` muestra las 6 columnas; tareas existentes (status legacy) aparecen en Backlog/Listas por la normalización.
- Crear, mover (drag&drop entre columnas), editar (drawer: responsable/fecha/prioridad/público) y borrar funcionan y persisten tras refresh.
- El detalle de cuenta muestra el board embebido.
- El enlace público de una cuenta sigue mostrando las tareas sin romperse.

---

## Migración de datos (opcional, al final)

La normalización en lectura hace que el backfill **no sea necesario** para funcionar. Como limpieza (para que los valores almacenados queden en las keys nuevas), se puede correr una migración custom DESPUÉS de mergear y desplegar:

- [ ] (Opcional) `npm run db:generate:custom`, crear SQL:
```sql
UPDATE "tasks" SET "status" = 'listas' WHERE "status" = 'completed';
UPDATE "tasks" SET "status" = 'backlog' WHERE "status" = 'pending';
```
con su `down.sql` (no reversible de forma exacta; dejar un `down.sql` no-op documentado: `-- backfill de datos, no reversible`). Luego `npm run db:migrate`. No agregar CHECK constraint en esta fase (consistente con cómo el resto de `tasks`/`transcripts` tratan `status` como texto; se validará a nivel app).

## Verificación final de la Fase 2

- [ ] `npm run type-check` → PASS
- [ ] `npm run build` → PASS
- [ ] Verificación funcional manual (Task 12 Step 4) OK
- [ ] **Trigger.dev:** esta fase NO toca `trigger/tasks/extract-tasks.ts` (eso es Fase 3). Pero al escribir tareas con keys nuevas y leer con normalización, el worker viejo (que aún inserta `pending`) sigue siendo compatible porque `normalizeColumn` mapea `pending→backlog`. No se requiere redeploy de trigger en esta fase.
- [ ] Merge a master + push (auto-push).

## Fuera de alcance (fases siguientes)

- Dedup en extracción + badge de menciones detallado → Fase 3 (ahí se toca `extract-tasks.ts`).
- Comentarios / @menciones / adjuntos (el drawer deja el placeholder) → Fase 4.
- Centro de notificaciones → Fase 5.
- Vista global tablero/lista (el índice es placeholder) → Fase 6.
- Kanban público + filtro `isPublic` → Fase 7.
