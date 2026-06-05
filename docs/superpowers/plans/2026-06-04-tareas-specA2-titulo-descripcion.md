# Tareas Spec A2 — Título + descripción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar **título** (corto, lo único que se previsualiza en la tarjeta) de **descripción** (larga, en el drawer). La tarjeta muestra `title || description` (fallback para tareas viejas sin título). El alta inline pide título; la descripción se completa en el drawer.

**Architecture:** Columna aditiva `tasks.title` (text, nullable). `description` sigue `notNull` (las tareas nuevas nacen con `description = ""`). La tarjeta y el drawer leen `title` con fallback a `description`. La extracción de meets sigue poblando `description` (title queda null → la tarjeta cae a description). Build sobre el board optimista de A1.

**Tech Stack:** Next 15 + React 19, Drizzle, Tailwind.

**Verificación:** `npm run type-check` + `npm run build` (no lint). dev/prod comparten Supabase: el único migrate es `npm run db:migrate`. Migración aditiva → sin ventana de rotura.

**Fuera de alcance:** la vista pública (`public-account-view/tasks-section.tsx`) sigue mostrando `description`; el manejo de `title` en público se hace en Fase 7 (Kanban público). Caso borde conocido: una tarea creada solo-con-título y marcada pública mostraría descripción vacía hasta completarla — aceptable hasta Fase 7.

---

### Task 1: Schema + migración (columna `title`)

**Files:**
- Modify: `lib/drizzle/schema/tasks.ts`
- Create: `drizzle/migrations/<NNNN>_<auto>/...` + `down.sql`

- [ ] **Step 1: Agregar la columna al schema**

En `lib/drizzle/schema/tasks.ts`, agregar `title` justo antes de `description`:
```ts
    title: text("title"),
    description: text("description").notNull(),
```
(`text` ya está importado.)

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS. El tipo `Task` ahora incluye `title: string | null`.

- [ ] **Step 3: Generar la migración**

Run: `npm run db:generate`
Expected: nueva carpeta en `drizzle/migrations/` (la siguiente después de `0035_nice_silk_fever`). El SQL debe ser solo `ALTER TABLE "tasks" ADD COLUMN "title" text;`.

- [ ] **Step 4: Identificar la carpeta y escribir `down.sql`**

Run: `git status --porcelain drizzle/migrations` para ver la carpeta nueva (`<DIR>`). Crear `drizzle/migrations/<DIR>/down.sql` con:
```sql
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "title";
```

- [ ] **Step 5: Aplicar la migración**

Run: `npm run db:migrate`
Expected: aplica sin error (additivo).

- [ ] **Step 6: build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/drizzle/schema/tasks.ts drizzle/migrations
git commit -m "feat(tareas): columna title en tasks + migración"
```

---

### Task 2: Actions — crear con título, editar título

**Files:**
- Modify: `app/actions/tareas.ts`

- [ ] **Step 1: `createKanbanTask` pasa a recibir `title` (y deja de recibir `description`)**

Reemplazar la firma y el cuerpo de `createKanbanTask`. La firma nueva:
```ts
export async function createKanbanTask(
  accountId: string,
  column: string,
  title: string,
  priority: number,
  assigneeId: string | null,
  dueDate: string | null
): Promise<{ id?: string; error?: string }> {
```
Reemplazar la validación `if (!description.trim()) return { error: "La descripción es requerida" };` por:
```ts
  if (!title.trim()) return { error: "El título es requerido" };
```
Y en el `.values({...})` del insert, reemplazar `description: description.trim(),` por:
```ts
      title: title.trim(),
      description: "",
```
(El resto del insert/return queda igual — sigue devolviendo `{ id: created.id }`.)

- [ ] **Step 2: `updateTaskFields` acepta `title`**

En `updateTaskFields`, agregar `title?: string;` al tipo del parámetro `fields`:
```ts
  fields: {
    title?: string;
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }
```
Y en el armado del `patch`, agregar (junto a los demás campos):
```ts
  if (fields.title !== undefined) patch.title = fields.title.trim() || null;
```

- [ ] **Step 3: type-check**

Run: `npm run type-check`
Expected: FALLA — el board (`kanban-board.tsx`) todavía llama a `createKanbanTask` con `description`. Es esperado; se arregla en la Task 3 (mismo lote). No commitear todavía; pasar a la Task 3.

---

### Task 3: Board — alta con título (optimista)

**Files:**
- Modify: `components/tareas/kanban-board.tsx`
- (commit junto con la Task 2)

- [ ] **Step 1: `NewTaskForm` pide título en vez de descripción**

En `NewTaskForm`, reemplazar el estado `description` por `title` y el `<textarea>` de descripción por un `<input type="text">` de título. Firma de props nueva:
```tsx
interface NewTaskFormProps {
  members: WorkspaceMemberWithUser[];
  onCreate: (input: { title: string; priority: number; assigneeId: string | null; dueDate: string | null }) => void;
  onDone: () => void;
}

function NewTaskForm({ members, onCreate, onDone }: NewTaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(3);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title, priority, assigneeId, dueDate: dueDate || null });
    onDone();
  }
```
Reemplazar el `<textarea ...>` de descripción por:
```tsx
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la tarea..."
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
```
Y el botón submit: `disabled={!title.trim()}`.

- [ ] **Step 2: `createTask` del board usa título**

Reemplazar la firma e implementación de `createTask`:
```tsx
  function createTask(
    column: TareaColumnKey,
    input: { title: string; priority: number; assigneeId: string | null; dueDate: string | null }
  ): void {
    const prevTasks = tasks;
    const tempId = `temp-${column}-${tasks.length}-${input.title.slice(0, 8)}`;
    const m = input.assigneeId ? members.find((mm) => mm.userId === input.assigneeId) : null;
    const optimistic: KanbanTask = {
      id: tempId,
      accountId,
      workspaceId: "",
      transcriptId: null,
      contextDocumentId: null,
      createdBy: null,
      assigneeId: input.assigneeId,
      title: input.title.trim(),
      description: "",
      status: column,
      source: "manual",
      sourceExcerpt: null,
      sourceContext: null,
      priority: input.priority,
      isPublic: false,
      dueDate: input.dueDate,
      sortOrder: Number.MAX_SAFE_INTEGER,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      column,
      meetingDate: null,
      meetingCreatedAt: null,
      transcriptFileName: null,
      assigneeName: m ? m.displayName : null,
      mentionCount: 0,
    };
    setTasks((cur) => [...cur, optimistic]);
    createKanbanTask(
      accountId,
      column,
      input.title,
      input.priority,
      input.assigneeId,
      input.dueDate
    )
      .then((res) => {
        if (res.error || !res.id) {
          setTasks(prevTasks);
          setError(res.error ?? "No se pudo crear la tarea.");
          return;
        }
        const realId = res.id;
        setTasks((cur) => cur.map((t) => (t.id === tempId ? { ...t, id: realId } : t)));
      })
      .catch(() => {
        setTasks(prevTasks);
        setError("No se pudo crear la tarea.");
      });
  }
```
(El campo `title` debe ir en el objeto `optimistic`; el resto de los campos quedan como están. Verificar contra el tipo `KanbanTask` que estén todos.)

- [ ] **Step 2b: `updateTask` ya soporta title automáticamente** — usa `Parameters<typeof updateTaskFields>[2]`, que ahora incluye `title`. No requiere cambios.

- [ ] **Step 3: type-check + build (cubre Task 2 + Task 3)**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit (actions + board juntos)**

```bash
git add app/actions/tareas.ts components/tareas/kanban-board.tsx
git commit -m "feat(tareas): alta por título (create sin description); updateTaskFields acepta title"
```

---

### Task 4: Tarjeta muestra título; drawer edita título + descripción

**Files:**
- Modify: `components/tareas/task-card.tsx`
- Modify: `components/tareas/task-drawer.tsx`

- [ ] **Step 1: Tarjeta — mostrar `title || description`**

En `components/tareas/task-card.tsx`, reemplazar:
```tsx
          <p className="line-clamp-2 leading-snug">{task.description}</p>
```
por:
```tsx
          <p className="line-clamp-2 leading-snug font-medium">{task.title || task.description}</p>
```

- [ ] **Step 2: Drawer — agregar campo Título + ampliar `onUpdate`**

En `components/tareas/task-drawer.tsx`:

(a) Ampliar el tipo de `onUpdate` en `TaskDrawerProps` para incluir `title`:
```ts
  onUpdate: (fields: { title?: string; description?: string; priority?: number; assigneeId?: string | null; dueDate?: string | null; isPublic?: boolean }) => void;
```

(b) Agregar estado local de título junto al de descripción, y resetearlo en el `useEffect`:
```tsx
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
  }, [task?.id, task?.title, task?.description]);
```

(c) Insertar un campo "Título" **antes** del bloque de Descripción (dentro de `<div className="space-y-5 p-4">`, arriba del `{/* Description */}`):
```tsx
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() !== (task.title ?? "")) onUpdate({ title });
              }}
              placeholder="Título de la tarea"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
```

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/tareas/task-card.tsx components/tareas/task-drawer.tsx
git commit -m "feat(tareas): tarjeta muestra título (fallback descripción); drawer edita título"
```

---

## Verificación final de A2

- [ ] `npm run type-check` → PASS
- [ ] `npm run build` → PASS
- [ ] Verificación funcional (deploy): crear una tarea pide **título**; la tarjeta muestra el título; el drawer permite editar título y descripción por separado; tareas viejas (sin título) siguen mostrando su descripción en la tarjeta.
- [ ] Merge a master + push (default de cierre).

## Fuera de alcance (próximos planes de Spec A)

- A3: Etiquetas con color.
- A4: Subtareas anidadas.
- A5: Filtros + búsqueda.
