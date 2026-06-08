// Contenedor de una tarea: cuenta-cliente, proyecto interno, o suelta.
// Client-safe: lo usan tanto RSC como componentes cliente.

export type TaskScope =
  | { kind: "account"; accountId: string }
  | { kind: "project"; projectId: string }
  | { kind: "loose" };

/** Ruta del board para un scope. */
export function scopeBoardPath(scope: TaskScope): string {
  switch (scope.kind) {
    case "account":
      return `/app/tareas/${scope.accountId}`;
    case "project":
      return `/app/tareas/proyecto/${scope.projectId}`;
    case "loose":
      return "/app/tareas/mias";
  }
}

/** Igualdad de scopes (para detectar "no cambió el contenedor"). */
export function sameScope(a: TaskScope, b: TaskScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "account" && b.kind === "account")
    return a.accountId === b.accountId;
  if (a.kind === "project" && b.kind === "project")
    return a.projectId === b.projectId;
  return true; // ambos loose
}
