# Tareas Spec A1 — UI optimista + drawer ancho

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el patrón "editar → `router.refresh()` → esperar" y el bug del toggle "Visible para el cliente": el tablero pasa a ser la única fuente de verdad con estado optimista, el drawer deriva su tarea viva por id, y el panel del drawer se ensancha.

**Architecture:** `KanbanBoard` mantiene un estado plano `tasks: KanbanTask[]` (fuente de verdad) y deriva las columnas. Todas las mutaciones (mover, crear, editar campos, borrar) actualizan el estado local **al instante** y disparan la server action en background; si falla, se revierte y se muestra el banner de error. El `TaskDrawer` se vuelve presentacional: recibe la tarea **viva** (derivada por id en el board) + callbacks `onUpdate`/`onDelete`, sin imports de servidor ni `router`. Se elimina `router.refresh()` de las ediciones y del drag.

**Tech Stack:** Next 15 + React 19 (client components), @dnd-kit, Drizzle (un solo cambio de action), Tailwind.

**Verificación:** `npm run type-check` + `npm run build` (no hay test runner; no usar `lint` — wizard interactivo). El drag&drop y la sensación optimista los prueba el usuario en el deploy.

**Sin cambios de schema en A1.**

---

### Task 1: `createKanbanTask` devuelve el id creado

**Files:**
- Modify: `app/actions/tareas.ts`

Para poder hacer alta optimista (insertar una tarjeta temporal y luego reemplazar su id por el real), la action de crear debe devolver el id.

- [ ] **Step 1: Cambiar el insert para que devuelva el id y la firma de retorno**

En `app/actions/tareas.ts`, en `createKanbanTask`, reemplazar el bloque del insert + return final:
```ts
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
```
por:
```ts
  const [created] = await db
    .insert(tasks)
    .values({
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
    })
    .returning({ id: tasks.id });
  revalidate(accountId);
  return { id: created.id };
}
```

- [ ] **Step 2: Actualizar el tipo de retorno de la firma**

En la misma función, cambiar la anotación de retorno de `Promise<{ error?: string }>` a `Promise<{ id?: string; error?: string }>`. (Los `return { error: ... }` tempranos siguen siendo válidos con el tipo ampliado.)

- [ ] **Step 3: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/tareas.ts
git commit -m "feat(tareas): createKanbanTask devuelve el id (para alta optimista)"
```

---

### Task 2: Board como fuente de verdad + handlers optimistas

**Files:**
- Modify: `components/tareas/kanban-board.tsx`

Refactor del board para que tenga un estado plano `tasks` y exponga mutaciones optimistas. Leer el archivo actual antes de editar.

- [ ] **Step 1: Reemplazar el estado y el sync del board**

En `KanbanBoard`, reemplazar el bloque de estado actual:
```ts
  const router = useRouter();
  const [cols, setCols] = useState<Cols>(() => groupByColumn(initialTasks));
  const [selected, setSelected] = useState<KanbanTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCols(groupByColumn(initialTasks));
  }, [initialTasks]);
```
por:
```ts
  const [tasks, setTasks] = useState<KanbanTask[]>(initialTasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync con el servidor cuando cambian los datos iniciales (navegación / carga).
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const cols = useMemo(() => groupByColumn(tasks), [tasks]);
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
```
y agregar `useMemo` al import de react (línea 3): `import { useEffect, useState, useMemo } from "react";` (quitar `useTransition` si ya no se usa en el board — el form inline lo sigue usando, así que dejarlo si `NewTaskForm` queda en este archivo; ver Step 4). Quitar el import de `useRouter` (`next/navigation`) del board si ya no se usa (el form inline lo dejará de usar también).

- [ ] **Step 2: Reescribir `handleDragEnd` en versión optimista (sin router.refresh)**

Reemplazar la función `handleDragEnd` completa por:
```ts
  function applyServer(
    prevTasks: KanbanTask[],
    run: () => Promise<{ error?: string } | undefined>,
    failMsg: string
  ): void {
    run()
      .then((res) => {
        if (res?.error) {
          setTasks(prevTasks);
          setError(res.error);
        }
      })
      .catch(() => {
        setTasks(prevTasks);
        setError(failMsg);
      });
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

    const prevTasks = tasks;
    // Reconstruir el orden plano a partir del movimiento optimista por columnas.
    const next = { ...cols, [from]: [...cols[from]], [to]: [...cols[to]] };
    const moving = next[from].find((t) => t.id === activeId);
    if (!moving) return;
    next[from] = next[from].filter((t) => t.id !== activeId);
    const overIndex = next[to].findIndex((t) => t.id === overId);
    const insertAt = overIndex >= 0 ? overIndex : next[to].length;
    next[to].splice(insertAt, 0, { ...moving, column: to });
    // Aplanar respetando el orden de columnas.
    const flat = TAREA_COLUMN_KEYS.flatMap((k) => next[k]);
    setTasks(flat);
    applyServer(
      prevTasks,
      () => moveTask(activeId, accountId, to, insertAt),
      "No se pudo mover la tarea."
    );
  }
```

- [ ] **Step 3: Agregar los handlers optimistas de update/create/delete**

Justo debajo de `handleDragEnd`, agregar:
```ts
  function updateTask(
    taskId: string,
    fields: Parameters<typeof updateTaskFields>[2]
  ): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) => {
        if (t.id !== taskId) return t;
        const patched: KanbanTask = { ...t, ...fields };
        // Mantener coherentes los campos derivados que la tarjeta/drawer muestran.
        if (fields.assigneeId !== undefined) {
          const m = members.find((mm) => mm.userId === fields.assigneeId);
          patched.assigneeName = m ? m.displayName : null;
        }
        return patched;
      })
    );
    applyServer(
      prevTasks,
      () => updateTaskFields(taskId, accountId, fields),
      "No se pudo guardar el cambio."
    );
  }

  function deleteTask(taskId: string): void {
    const prevTasks = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== taskId));
    applyServer(
      prevTasks,
      () => deleteKanbanTask(taskId, accountId),
      "No se pudo eliminar la tarea."
    );
  }

  function createTask(
    column: TareaColumnKey,
    input: { description: string; priority: number; assigneeId: string | null; dueDate: string | null }
  ): void {
    const prevTasks = tasks;
    const tempId = `temp-${column}-${tasks.length}-${input.description.slice(0, 8)}`;
    const m = input.assigneeId ? members.find((mm) => mm.userId === input.assigneeId) : null;
    const optimistic: KanbanTask = {
      id: tempId,
      accountId,
      workspaceId: "",
      transcriptId: null,
      contextDocumentId: null,
      createdBy: null,
      assigneeId: input.assigneeId,
      description: input.description.trim(),
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
      input.description,
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
        setTasks((cur) =>
          cur.map((t) => (t.id === tempId ? { ...t, id: realId } : t))
        );
      })
      .catch(() => {
        setTasks(prevTasks);
        setError("No se pudo crear la tarea.");
      });
  }
```
**Nota de tipos:** el objeto `optimistic` debe incluir TODOS los campos de `KanbanTask`. `KanbanTask = Task & { column, meetingDate, meetingCreatedAt, transcriptFileName, assigneeName, mentionCount }`. Verificar contra `lib/drizzle/schema/tasks.ts` que la lista de campos de `Task` arriba esté completa (id, accountId, workspaceId, transcriptId, contextDocumentId, createdBy, assigneeId, description, status, source, sourceExcerpt, sourceContext, priority, isPublic, dueDate, sortOrder, completedAt, createdAt, updatedAt). Si falta/sobra alguno, ajustar para que type-check pase.

- [ ] **Step 4: Actualizar los imports de actions y el render**

Imports (línea 27): `import { moveTask, createKanbanTask, updateTaskFields, deleteKanbanTask } from "@/app/actions/tareas";`

Cambiar el render del drawer y de las columnas: el drawer ahora recibe la tarea viva + callbacks; `Column` recibe `onOpen={(t) => setSelectedId(t.id)}`. Reemplazar el bloque de retorno del drawer:
```tsx
      <TaskDrawer
        task={selected}
        accountId={accountId}
        members={members}
        onClose={() => setSelected(null)}
      />
```
por:
```tsx
      <TaskDrawer
        task={selectedTask}
        members={members}
        onUpdate={(fields) => {
          if (selectedId) updateTask(selectedId, fields);
        }}
        onDelete={() => {
          if (selectedId) {
            deleteTask(selectedId);
            setSelectedId(null);
          }
        }}
        onClose={() => setSelectedId(null)}
      />
```
Y en el map de columnas cambiar `onOpen={setSelected}` por `onOpen={(t) => setSelectedId(t.id)}`.

- [ ] **Step 5: Reescribir `NewTaskForm` para usar el handler optimista del board**

`NewTaskForm` ya no llama a la action ni a `router.refresh()`: recibe un `onCreate` del board y cierra. Reemplazar su firma + `handleSubmit`:
```tsx
interface NewTaskFormProps {
  members: WorkspaceMemberWithUser[];
  onCreate: (input: { description: string; priority: number; assigneeId: string | null; dueDate: string | null }) => void;
  onDone: () => void;
}

function NewTaskForm({ members, onCreate, onDone }: NewTaskFormProps) {
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    onCreate({ description, priority, assigneeId, dueDate: dueDate || null });
    onDone();
  }
```
(Quitar de `NewTaskForm` los imports/uso de `useTransition`, `useRouter`, `createKanbanTask`, `error`/`isPending`. El botón "Agregar" queda `disabled={!description.trim()}` y sin estado "..." de pending —la creación es optimista e instantánea.) Quitar el bloque `{error && ...}` del form.

Actualizar `Column` para pasar `onCreate`: `Column` recibe del board un `onCreate: (column, input) => void`; en su `NewTaskForm` usa `onCreate={(input) => onCreate(columnKey, input)}`. Ajustar `ColumnProps` (quitar `accountId` si ya no se usa en Column, agregar `onCreate`) y el render del board para pasar `onCreate={createTask}`.

- [ ] **Step 6: NO verificar ni commitear todavía**

El board ahora pasa props nuevas (`onUpdate`/`onDelete`, sin `accountId`) al drawer, cuya interfaz se actualiza en la Task 3. **`type-check` va a fallar acá por el desajuste de interfaz board↔drawer — es esperado.** Board y drawer son un refactor atómico: pasar directo a la Task 3 y verificar/commitear los dos juntos al final de la Task 3.

---

### Task 3: Drawer presentacional + más ancho (mismo commit que Task 2)

**Files:**
- Modify: `components/tareas/task-drawer.tsx`
- (commit incluye también `components/tareas/kanban-board.tsx` de la Task 2)

El drawer deja de importar server actions / router y de manejar su propia persistencia: recibe la tarea viva + `onUpdate`/`onDelete`. Como la tarea es viva, `task.isPublic` (y todo) se actualiza al instante → arregla el bug del toggle.

- [ ] **Step 1: Nueva firma de props + quitar imports de servidor**

Reemplazar el bloque de imports de actions/router y la interface de props. Quitar:
```ts
import { useRouter } from "next/navigation";
import { updateTaskFields, deleteKanbanTask } from "@/app/actions/tareas";
```
Cambiar la interface:
```ts
interface TaskDrawerProps {
  task: KanbanTask | null;
  members: WorkspaceMemberWithUser[];
  onUpdate: (fields: { description?: string; priority?: number; assigneeId?: string | null; dueDate?: string | null; isPublic?: boolean }) => void;
  onDelete: () => void;
  onClose: () => void;
}
```

- [ ] **Step 2: Reescribir el cuerpo de la función para usar los callbacks**

Reemplazar la firma de la función y los handlers internos `save`/`handleDelete`:
```tsx
export function TaskDrawer({ task, members, onUpdate, onDelete, onClose }: TaskDrawerProps) {
  const [description, setDescription] = useState("");

  useEffect(() => {
    setDescription(task?.description ?? "");
  }, [task?.id, task?.description]);

  if (task === null) return null;

  function handleDelete(): void {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    onDelete();
  }
```
(Quitar `useRouter`, `useTransition`, `isPending`, `error`/`setError` y el banner de error local — los errores ahora los muestra el board detrás. Mantener `useState`/`useEffect` en el import de react.)

- [ ] **Step 3: Cambiar todos los call sites de `save(...)` por `onUpdate(...)` y quitar `isPending`**

- Descripción `onBlur`: `if (description.trim() && description.trim() !== task.description) onUpdate({ description });`
- Responsable `onChange`: `onUpdate({ assigneeId: e.target.value || null })`
- Fecha `onChange`: `onUpdate({ dueDate: e.target.value || null })`
- Prioridad `onChange`: `onUpdate({ priority: Number(e.target.value) })`
- Toggle público `onClick`: `onUpdate({ isPublic: !task.isPublic })`
- Botón eliminar `onClick`: `handleDelete`
- Quitar todos los `disabled={isPending}` de selects/inputs/botones.
- Quitar el bloque `{error && (...)}` del cuerpo.

- [ ] **Step 4: Ensanchar el panel**

Cambiar la clase del panel:
```tsx
<div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-xl">
```
por:
```tsx
<div className="absolute right-0 top-0 h-full w-full sm:max-w-2xl overflow-y-auto border-l border-border bg-card shadow-xl">
```

- [ ] **Step 5: type-check + build (cubre board + drawer)**

Run: `npm run type-check && npm run build`
Expected: PASS (ahora que board y drawer están consistentes). Si type-check marca campos faltantes en el objeto `optimistic` del board, completarlos según `Task`.

- [ ] **Step 6: Commit (board + drawer juntos)**

```bash
git add components/tareas/kanban-board.tsx components/tareas/task-drawer.tsx
git commit -m "feat(tareas): UI optimista board+drawer (tarea viva, sin refresh) + drawer ancho — fix toggle público"
```

---

## Verificación final de A1

- [ ] `npm run type-check` → PASS
- [ ] `npm run build` → PASS
- [ ] **Verificación funcional manual (controller / usuario en deploy):**
  - Toggle "Visible para el cliente" cambia **al instante**, sin cerrar/reabrir.
  - Editar prioridad/fecha/responsable/descripción se ve al instante, sin "refrescar".
  - Crear una tarea aparece al instante; sigue editable (id real) tras crearse.
  - Mover (drag) entre columnas no parpadea ni requiere refresh.
  - Si una action falla, el cambio se revierte y aparece el banner de error.
- [ ] Merge a master + push (auto-push).

## Fuera de alcance (próximos planes de Spec A)

- A2: Título + descripción.
- A3: Etiquetas con color.
- A4: Subtareas anidadas.
- A5: Filtros + búsqueda.
