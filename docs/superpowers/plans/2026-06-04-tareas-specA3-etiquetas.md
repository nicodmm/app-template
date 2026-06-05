# Tareas Spec A3 — Etiquetas con color

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etiquetas con color **reutilizables a nivel workspace**: un catálogo de etiquetas (nombre + color de una paleta fija), varias por tarea, visibles como chips de color en la tarjeta y editables en el drawer.

**Architecture:** Dos tablas nuevas: `task_labels` (catálogo del workspace) y `task_label_assignments` (tarea↔etiqueta). Paleta fija client-safe en `lib/tareas/labels.ts`. La query del board adjunta las etiquetas asignadas por tarea (segunda consulta + map, para no multiplicar filas). El board (modelo optimista de A1) mantiene el **catálogo** en estado y las asignaciones por tarea; asignar/desasignar/crear son optimistas. Aditivo → sin ventana de rotura.

**Tech Stack:** Next 15 + React 19, Drizzle, Tailwind.

**Verificación:** `npm run type-check` + `npm run build` (no lint). dev/prod comparten Supabase: único migrate `npm run db:migrate`.

**Fuera de alcance:** etiquetas en la vista pública (Fase 7).

---

### Task 1: Schema + migración (task_labels, task_label_assignments)

**Files:**
- Create: `lib/drizzle/schema/task_labels.ts`
- Create: `lib/drizzle/schema/task_label_assignments.ts`
- Modify: `lib/drizzle/schema/index.ts`
- Create: migración + `down.sql`

- [ ] **Step 1: `task_labels.ts`**
```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const taskLabels = pgTable(
  "task_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("task_labels_workspace_idx").on(table.workspaceId)]
);

export type TaskLabelRow = typeof taskLabels.$inferSelect;
export type NewTaskLabelRow = typeof taskLabels.$inferInsert;
```

- [ ] **Step 2: `task_label_assignments.ts`**
```ts
import { pgTable, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { taskLabels } from "./task_labels";

export const taskLabelAssignments = pgTable(
  "task_label_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => taskLabels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_label_assignments_unique").on(table.taskId, table.labelId),
    index("task_label_assignments_task_idx").on(table.taskId),
  ]
);

export type TaskLabelAssignment = typeof taskLabelAssignments.$inferSelect;
export type NewTaskLabelAssignment = typeof taskLabelAssignments.$inferInsert;
```

- [ ] **Step 3: Exportar en `index.ts`**

Agregar al final de `lib/drizzle/schema/index.ts`:
```ts
export * from "./task_labels";
export * from "./task_label_assignments";
```

- [ ] **Step 4: type-check, generar, down.sql, migrar**

Run: `npm run type-check` → PASS.
Run: `npm run db:generate` → crea la migración (`0037_*`) con `CREATE TABLE "task_labels"` + `CREATE TABLE "task_label_assignments"` + FKs + índices. Revisar que sea solo eso (additivo).
Identificar `<DIR>` con `git status --porcelain drizzle/migrations`. Crear `drizzle/migrations/<DIR>/down.sql`:
```sql
DROP TABLE IF EXISTS "task_label_assignments";
DROP TABLE IF EXISTS "task_labels";
```
Run: `npm run db:migrate` → OK. Run: `npm run build` → PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/drizzle/schema drizzle/migrations
git commit -m "feat(tareas): tablas task_labels + task_label_assignments + migración"
```

---

### Task 2: Paleta de colores (client-safe)

**Files:**
- Create: `lib/tareas/labels.ts`

- [ ] **Step 1: Escribir la paleta**
```ts
// Paleta fija de colores para etiquetas. Client-safe.

export const LABEL_COLORS = [
  { key: "slate", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-400" },
  { key: "red", chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  { key: "orange", chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
  { key: "amber", chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  { key: "green", chip: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500" },
  { key: "teal", chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", dot: "bg-teal-500" },
  { key: "blue", chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
  { key: "indigo", chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", dot: "bg-indigo-500" },
  { key: "purple", chip: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  { key: "pink", chip: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", dot: "bg-pink-500" },
] as const;

export type LabelColorKey = (typeof LABEL_COLORS)[number]["key"];

export const LABEL_COLOR_KEYS: LabelColorKey[] = LABEL_COLORS.map((c) => c.key);

const BY_KEY = new Map(LABEL_COLORS.map((c) => [c.key, c]));

export function isLabelColor(value: string): value is LabelColorKey {
  return BY_KEY.has(value as LabelColorKey);
}

export function labelChipClass(color: string): string {
  return (BY_KEY.get(color as LabelColorKey) ?? LABEL_COLORS[0]).chip;
}

export function labelDotClass(color: string): string {
  return (BY_KEY.get(color as LabelColorKey) ?? LABEL_COLORS[0]).dot;
}
```

- [ ] **Step 2: type-check + commit**
```bash
npm run type-check
git add lib/tareas/labels.ts
git commit -m "feat(tareas): paleta de colores de etiquetas (client-safe)"
```

---

### Task 3: Query — etiquetas por tarea + catálogo del workspace

**Files:**
- Modify: `lib/queries/tareas.ts`

- [ ] **Step 1: Tipo `TaskLabel` + `labels` en `KanbanTask`**

En `lib/queries/tareas.ts`, agregar el import de las tablas nuevas y un tipo, y extender `KanbanTask`:
```ts
import {
  tasks,
  transcripts,
  users,
  taskMeetingMentions,
  taskLabels,
  taskLabelAssignments,
  accounts,
} from "@/lib/drizzle/schema";
import { eq, asc, sql, inArray } from "drizzle-orm";
```
```ts
export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}
```
Agregar `labels: TaskLabel[];` al tipo `KanbanTask`.

- [ ] **Step 2: Adjuntar `labels` en `getAccountKanbanTasks`**

Después de construir `rows` (las tareas) y antes del `return rows.map(...)`, traer las asignaciones de esas tareas y armar un mapa. Reemplazar el `return rows.map(...)` final por:
```ts
  const taskIds = rows.map((r) => r.task.id);
  const labelRows =
    taskIds.length > 0
      ? await db
          .select({
            taskId: taskLabelAssignments.taskId,
            id: taskLabels.id,
            name: taskLabels.name,
            color: taskLabels.color,
          })
          .from(taskLabelAssignments)
          .innerJoin(taskLabels, eq(taskLabelAssignments.labelId, taskLabels.id))
          .where(inArray(taskLabelAssignments.taskId, taskIds))
      : [];

  const labelsByTask = new Map<string, TaskLabel[]>();
  for (const l of labelRows) {
    const arr = labelsByTask.get(l.taskId) ?? [];
    arr.push({ id: l.id, name: l.name, color: l.color });
    labelsByTask.set(l.taskId, arr);
  }

  return rows.map((r) => ({
    ...r.task,
    column: normalizeColumn(r.task.status),
    meetingDate: r.meetingDate ?? null,
    meetingCreatedAt: r.meetingCreatedAt ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    assigneeName: r.assigneeName ?? null,
    mentionCount: Number(r.mentionCount ?? 0),
    labels: labelsByTask.get(r.task.id) ?? [],
  }));
```

- [ ] **Step 3: `listAccountTaskLabels` (catálogo del workspace de la cuenta)**

Agregar al final del archivo:
```ts
export async function listAccountTaskLabels(
  accountId: string
): Promise<TaskLabel[]> {
  const [acc] = await db
    .select({ workspaceId: accounts.workspaceId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!acc) return [];
  const rows = await db
    .select({ id: taskLabels.id, name: taskLabels.name, color: taskLabels.color })
    .from(taskLabels)
    .where(eq(taskLabels.workspaceId, acc.workspaceId))
    .orderBy(asc(taskLabels.name));
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}
```

- [ ] **Step 4: type-check**

Run: `npm run type-check`
Expected: FALLA — el board construye objetos `KanbanTask` (el literal optimista) que ahora les falta `labels`. Es esperado; se arregla en la Task 5 (mismo lote board). No commitear todavía; seguir a la Task 4 y 5 y commitear juntos al final de la 5.

---

### Task 4: Actions de etiquetas

**Files:**
- Modify: `app/actions/tareas.ts`

- [ ] **Step 1: Agregar las actions** (al final del archivo, reusando `authorize`/`revalidate`/imports existentes; agregar imports de `taskLabels`, `taskLabelAssignments`, `isLabelColor`)

Agregar a los imports del archivo:
```ts
import { tasks, taskLabels, taskLabelAssignments } from "@/lib/drizzle/schema";
import { isLabelColor } from "@/lib/tareas/labels";
import type { TaskLabel } from "@/lib/queries/tareas";
```
(Combinar con el import existente de `tasks` — no duplicar.)

```ts
export async function createLabel(
  accountId: string,
  name: string,
  color: string
): Promise<{ label?: TaskLabel; error?: string }> {
  const { workspaceId } = await authorize(accountId);
  if (!name.trim()) return { error: "El nombre es requerido" };
  if (!isLabelColor(color)) return { error: "Color inválido" };
  const [created] = await db
    .insert(taskLabels)
    .values({ workspaceId, name: name.trim(), color })
    .returning({ id: taskLabels.id, name: taskLabels.name, color: taskLabels.color });
  revalidate(accountId);
  return { label: { id: created.id, name: created.name, color: created.color } };
}

export async function assignLabel(
  taskId: string,
  accountId: string,
  labelId: string
): Promise<{ error?: string }> {
  await authorize(accountId);
  await db
    .insert(taskLabelAssignments)
    .values({ taskId, labelId })
    .onConflictDoNothing();
  revalidate(accountId);
  return {};
}

export async function unassignLabel(
  taskId: string,
  accountId: string,
  labelId: string
): Promise<{ error?: string }> {
  await authorize(accountId);
  await db
    .delete(taskLabelAssignments)
    .where(
      and(
        eq(taskLabelAssignments.taskId, taskId),
        eq(taskLabelAssignments.labelId, labelId)
      )
    );
  revalidate(accountId);
  return {};
}
```
(`and`/`eq` ya están importados.)

- [ ] **Step 2: type-check** — seguirá fallando por el board (Task 5). Continuar.

---

### Task 5: Board — catálogo + handlers optimistas + wiring de páginas

**Files:**
- Modify: `components/tareas/kanban-board.tsx`
- Modify: `app/(protected)/app/tareas/[accountId]/page.tsx`
- Modify: `components/account-detail/tasks-section.tsx`
- (commit junto con Tasks 3 y 4)

- [ ] **Step 1: Nueva prop `labels` (catálogo) + estado en el board**

En `KanbanBoardProps` agregar `labels: TaskLabel[];` (importar `TaskLabel` de `@/lib/queries/tareas`). En el componente, agregar estado del catálogo:
```ts
  const [labelCatalog, setLabelCatalog] = useState<TaskLabel[]>(labels);
  useEffect(() => setLabelCatalog(labels), [labels]);
```

- [ ] **Step 2: `labels: []` en el objeto optimista de `createTask`**

En el literal `optimistic` de `createTask`, agregar `labels: [],` (junto a los demás campos).

- [ ] **Step 3: Handlers de etiquetas (optimistas)**

Importar las actions: `import { moveTask, createKanbanTask, updateTaskFields, deleteKanbanTask, createLabel, assignLabel, unassignLabel } from "@/app/actions/tareas";`

Agregar handlers:
```ts
  function assignTaskLabel(taskId: string, label: TaskLabel): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId && !t.labels.some((l) => l.id === label.id)
          ? { ...t, labels: [...t.labels, label] }
          : t
      )
    );
    applyServer(prevTasks, () => assignLabel(taskId, accountId, label.id), "No se pudo asignar la etiqueta.");
  }

  function unassignTaskLabel(taskId: string, labelId: string): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId ? { ...t, labels: t.labels.filter((l) => l.id !== labelId) } : t
      )
    );
    applyServer(prevTasks, () => unassignLabel(taskId, accountId, labelId), "No se pudo quitar la etiqueta.");
  }

  function createAndAssignLabel(taskId: string, name: string, color: string): void {
    createLabel(accountId, name, color)
      .then((res) => {
        if (res.error || !res.label) {
          setError(res.error ?? "No se pudo crear la etiqueta.");
          return;
        }
        const label = res.label;
        setLabelCatalog((cur) => [...cur, label].sort((a, b) => a.name.localeCompare(b.name)));
        assignTaskLabel(taskId, label);
      })
      .catch(() => setError("No se pudo crear la etiqueta."));
  }
```

- [ ] **Step 4: Pasar el catálogo + handlers al drawer y las etiquetas a la tarjeta**

En el render del `TaskDrawer`, agregar props:
```tsx
        labelCatalog={labelCatalog}
        onAssignLabel={(label) => { if (selectedId) assignTaskLabel(selectedId, label); }}
        onUnassignLabel={(labelId) => { if (selectedId) unassignTaskLabel(selectedId, labelId); }}
        onCreateLabel={(name, color) => { if (selectedId) createAndAssignLabel(selectedId, name, color); }}
```
(El `TaskCard` ya recibe `task`, que ahora incluye `labels` — la tarjeta los renderiza en la Task 6, sin cambios de props.)

- [ ] **Step 5: Wiring de las dos páginas que montan el board**

En `app/(protected)/app/tareas/[accountId]/page.tsx`: importar `getAccountKanbanTasks, listAccountTaskLabels` de `@/lib/queries/tareas`, cargar el catálogo en el `Promise.all` y pasarlo:
```tsx
  const [boardTasks, members, labels] = await Promise.all([
    getAccountKanbanTasks(accountId),
    getWorkspaceMembers(workspace.id),
    listAccountTaskLabels(accountId),
  ]);
  ...
      <KanbanBoard accountId={accountId} initialTasks={boardTasks} members={members} labels={labels} />
```

En `components/account-detail/tasks-section.tsx`: importar `listAccountTaskLabels`, cargarlo y pasarlo:
```tsx
  const [boardTasks, labels] = await Promise.all([
    getAccountKanbanTasks(accountId),
    listAccountTaskLabels(accountId),
  ]);
  ...
      <KanbanBoard accountId={accountId} initialTasks={boardTasks} members={members} labels={labels} />
```

- [ ] **Step 6: type-check + build (cubre Tasks 3,4,5)**

Run: `npm run type-check && npm run build`
Expected: PASS (el drawer aún no usa las props nuevas pero TypeScript las acepta si la interfaz del drawer ya las declara — ver Task 6; si el build se queja porque el drawer no declara las props nuevas, hacer la Task 6 antes de verificar y commitear todo junto). Para evitar el problema de orden: **hacer la Task 6 y recién después verificar/commitear Tasks 3-6 juntas.**

- [ ] **Step 7: (Commit diferido a la Task 6.)**

---

### Task 6: Tarjeta con chips + sección de etiquetas en el drawer

**Files:**
- Modify: `components/tareas/task-card.tsx`
- Modify: `components/tareas/task-drawer.tsx`
- (commit final cubre Tasks 3,4,5,6)

- [ ] **Step 1: Chips en la tarjeta**

En `components/tareas/task-card.tsx`, importar `labelChipClass` de `@/lib/tareas/labels`. Justo ANTES del `<p>` del título, renderizar los chips si hay:
```tsx
          {task.labels.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {task.labels.map((l) => (
                <span
                  key={l.id}
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${labelChipClass(l.color)}`}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
```

- [ ] **Step 2: Props nuevas del drawer**

En `components/tareas/task-drawer.tsx`, importar `labelChipClass, labelDotClass, LABEL_COLORS, type LabelColorKey` de `@/lib/tareas/labels` y `type TaskLabel` de `@/lib/queries/tareas`. Extender `TaskDrawerProps`:
```ts
  labelCatalog: TaskLabel[];
  onAssignLabel: (label: TaskLabel) => void;
  onUnassignLabel: (labelId: string) => void;
  onCreateLabel: (name: string, color: string) => void;
```
y agregarlas a la desestructuración de props de la función.

- [ ] **Step 3: Sección "Etiquetas" en el drawer**

Insertar después del bloque del toggle público y antes del "Meeting origin", una sección de etiquetas. Incluye: los chips asignados (`task.labels`) con una `x` para quitar (`onUnassignLabel`), y un control "+ Etiqueta" que abre un mini-panel con: las etiquetas del catálogo NO asignadas (click → `onAssignLabel`) y un form "crear" (input de nombre + fila de puntos de color de `LABEL_COLORS` para elegir; al confirmar → `onCreateLabel(name, color)`). Estado local del drawer para abrir/cerrar el panel, el nombre nuevo y el color elegido (default `LABEL_COLORS[0].key`). Esqueleto:
```tsx
          {/* Labels */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etiquetas</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {task.labels.map((l) => (
                <span key={l.id} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${labelChipClass(l.color)}`}>
                  {l.name}
                  <button type="button" onClick={() => onUnassignLabel(l.id)} aria-label="Quitar etiqueta">
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setLabelPanelOpen((v) => !v)} className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent">
                <Plus size={11} /> Etiqueta
              </button>
            </div>
            {/* panel: catálogo no asignado + crear nueva (nombre + dots de color) */}
          </div>
```
Completar el panel siguiendo este comportamiento: filtrar `labelCatalog` por las no asignadas (no presentes en `task.labels`); cada una es un botón que llama `onAssignLabel(label)` y cierra el panel; el form de crear tiene `<input>` de nombre + una fila de botones-punto (`labelDotClass(c.key)`) para elegir color, y un botón "Crear" que llama `onCreateLabel(name, color)` y limpia/cierra. Importar `Plus`, `X` de lucide (X ya está). Usar `useState` para `labelPanelOpen`, `newLabelName`, `newLabelColor: LabelColorKey`.

- [ ] **Step 4: type-check + build (cubre Tasks 3-6)**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit (Tasks 3,4,5,6 juntas)**
```bash
git add lib/queries/tareas.ts app/actions/tareas.ts components/tareas/kanban-board.tsx "app/(protected)/app/tareas/[accountId]/page.tsx" components/account-detail/tasks-section.tsx components/tareas/task-card.tsx components/tareas/task-drawer.tsx
git commit -m "feat(tareas): etiquetas con color — query/actions/board/tarjeta/drawer"
```

---

## Verificación final de A3

- [ ] `npm run type-check` → PASS
- [ ] `npm run build` → PASS
- [ ] Verificación funcional (deploy): en el drawer se pueden crear etiquetas (nombre + color), asignarlas/quitarlas; aparecen como chips de color en la tarjeta; las etiquetas creadas quedan disponibles para otras tareas/cuentas del workspace; filtrar por etiqueta llega en A5.
- [ ] Merge a master + push (default de cierre).

## Fuera de alcance (próximos planes)

- A4: Subtareas anidadas.
- A5: Filtros + búsqueda (incluye filtrar por etiqueta).
