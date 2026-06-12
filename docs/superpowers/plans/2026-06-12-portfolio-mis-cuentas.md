# Portfolio "Mis cuentas" (#6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a owner/admin un toggle "Todas / Mis cuentas" en el portfolio, donde "Mis cuentas" = cuentas donde son dueños o consultores; members quedan igual.

**Architecture:** Filtro vía URL param `?mine=1` leído por la página (solo se aplica a roles elevados). Las queries del portfolio ganan un flag `onlyMine` que, para roles elevados, restringe a `ownerId = userId OR EXISTS(account_consultants)`. Un nuevo client component renderiza el toggle, visible solo para elevados, preservando el `status` actual.

**Tech Stack:** Next.js 15 (App Router, RSC), Drizzle ORM + Postgres, Tailwind, `cn()` util.

**Compuerta (no hay framework de test):** cada tarea cierra con `npm run type-check`; la UI agrega `npm run build`. Verificación funcional = manual.

---

## Estructura de archivos
- Modificar: `lib/queries/accounts.ts` — `onlyMine` en `PortfolioScope` + condición owner-or-consultant.
- Crear: `components/portfolio-scope-toggle.tsx` — toggle Todas/Mis cuentas (client).
- Modificar: `app/(protected)/app/portfolio/page.tsx` — leer `mine`, pasar `onlyMine`, render del toggle.

---

### Task 1: Queries — flag `onlyMine` con condición owner-or-consultant

**Files:**
- Modify: `lib/queries/accounts.ts`

- [ ] **Step 1: Extender imports y el tipo `PortfolioScope`**

En la línea de import de drizzle, agregar `or` y `exists`:
```ts
import { eq, and, or, exists, desc, isNull, isNotNull, sql } from "drizzle-orm";
```
Agregar `accountConsultants` al import del schema:
```ts
import { accounts, users, accountConsultants } from "@/lib/drizzle/schema";
```
Agregar el campo opcional a la interfaz `PortfolioScope` (después de `status?`):
```ts
  /**
   * Solo para roles elevados (owner/admin): restringe a las cuentas "mías"
   * (dueño O consultor). Ignorado para members (su scope ya es owner-only).
   */
  onlyMine?: boolean;
```

- [ ] **Step 2: Aplicar la condición en `scopeBaseConditions`**

Reemplazar la función `scopeBaseConditions` por:
```ts
function scopeBaseConditions(scope: PortfolioScope) {
  const conditions = [eq(accounts.workspaceId, scope.workspaceId)];
  if (!canSeeAllAccounts(scope.role)) {
    // Member: solo cuentas propias (sin cambios).
    conditions.push(eq(accounts.ownerId, scope.userId));
  } else if (scope.onlyMine) {
    // Owner/Admin con filtro "Mis cuentas": dueño O consultor asignado.
    const mine = or(
      eq(accounts.ownerId, scope.userId),
      exists(
        db
          .select({ one: sql`1` })
          .from(accountConsultants)
          .where(
            and(
              eq(accountConsultants.accountId, accounts.id),
              eq(accountConsultants.userId, scope.userId)
            )
          )
      )
    );
    // `or(...)` puede ser undefined en teoría según los tipos de drizzle;
    // siempre tiene dos args acá, pero el push lo tratamos como condición.
    if (mine) conditions.push(mine);
  }
  return conditions;
}
```

Nota: `getPortfolioAccounts` y `getPortfolioAccountCounts` ya usan `scopeBaseConditions`, así que ambos heredan el filtro. `getPortfolioAccountCounts` recibe `Omit<PortfolioScope, "status">`, que conserva `onlyMine` — verificá que el `Omit` no lo excluya (solo excluye `status`, así que `onlyMine` pasa OK).

- [ ] **Step 3: type-check**

Run: `npm run type-check`
Expected: PASS. Si drizzle se queja del tipo de retorno de `or(...)` al hacer `push`, dejá el guard `if (mine) conditions.push(mine);` como está (ya cubre el caso). Si se queja del tipo del array `conditions` (mezcla de tipos de condición), tipá el array explícitamente: `const conditions: (ReturnType<typeof eq> | NonNullable<ReturnType<typeof or>>)[] = [...]` — pero probá primero sin anotación; drizzle suele inferir `SQL`.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/accounts.ts
git commit -m "feat(portfolio): flag onlyMine (dueño o consultor) en queries"
```

---

### Task 2: Toggle UI + wiring en la página

**Files:**
- Create: `components/portfolio-scope-toggle.tsx`
- Modify: `app/(protected)/app/portfolio/page.tsx`

- [ ] **Step 1: Crear el componente toggle**

Modelado sobre `components/portfolio-status-tabs.tsx` (mismo patrón: `useSearchParams` + `router.push`, preserva los demás params). Crear `components/portfolio-scope-toggle.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface PortfolioScopeToggleProps {
  /** true = "Mis cuentas" activo; false = "Todas". */
  mine: boolean;
}

export function PortfolioScopeToggle({ mine }: PortfolioScopeToggleProps) {
  const router = useRouter();
  const params = useSearchParams();

  const setMine = useCallback(
    (next: boolean) => {
      const qp = new URLSearchParams(params);
      if (next) qp.set("mine", "1");
      else qp.delete("mine");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const optClass = (selected: boolean) =>
    cn(
      "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      selected
        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
        : "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50"
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setMine(false)}
        className={optClass(!mine)}
        aria-pressed={!mine}
      >
        Todas
      </button>
      <button
        type="button"
        onClick={() => setMine(true)}
        className={optClass(mine)}
        aria-pressed={mine}
      >
        Mis cuentas
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wiring en `app/(protected)/app/portfolio/page.tsx`**

a) Extender el tipo de `searchParams`:
```ts
interface PageProps {
  searchParams: Promise<{ status?: string; mine?: string }>;
}
```

b) Después de `const isElevated = ...`, calcular `onlyMine`:
```ts
  const onlyMine = isElevated && params.mine === "1";
```

c) Pasar `onlyMine` a ambas queries (agregar el campo en los objetos que ya se pasan a `getPortfolioAccounts` y `getPortfolioAccountCounts`):
```ts
    getPortfolioAccounts({
      workspaceId: workspace.id,
      userId,
      role: member.role,
      status,
      onlyMine,
    }),
    getPortfolioAccountCounts({
      workspaceId: workspace.id,
      userId,
      role: member.role,
      onlyMine,
    }),
```

d) Importar el toggle:
```ts
import { PortfolioScopeToggle } from "@/components/portfolio-scope-toggle";
```

e) Renderizar el toggle junto a las status tabs, solo para elevados. Reemplazar el bloque:
```tsx
      <div className="mb-6">
        <PortfolioStatusTabs
          active={counts.active}
          archived={counts.archived}
          current={status}
        />
      </div>
```
por:
```tsx
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PortfolioStatusTabs
          active={counts.active}
          archived={counts.archived}
          current={status}
        />
        {isElevated && <PortfolioScopeToggle mine={onlyMine} />}
      </div>
```

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Verificación manual**

`npm run dev`, entrar a `/app/portfolio` como owner/admin:
- Aparece el toggle "Todas / Mis cuentas"; default "Todas" muestra todo.
- "Mis cuentas" → solo cuentas donde sos dueño o consultor; los contadores de Activas/Archivadas se ajustan; alternar Activas/Archivadas preserva `mine` y viceversa.
- Como member: no aparece el toggle; el listado sigue mostrando solo cuentas propias (poné `?mine=1` a mano → no cambia nada).

- [ ] **Step 5: Commit**

```bash
git add components/portfolio-scope-toggle.tsx "app/(protected)/app/portfolio/page.tsx"
git commit -m "feat(portfolio): toggle Todas/Mis cuentas para owner-admin"
```

---

## Cierre
- [ ] `npm run type-check && npm run build` en verde.
- [ ] Merge `feat/portfolio-mis-cuentas` a master + push. Avisar al user qué probar (los 3 escenarios de la verificación manual). Sin migración ni deploy de Trigger.

## Notas
- Sin cambios de schema, sin migración.
- No se toca `getAccountById` ni la visibilidad de members.
