# Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this size) to implement task-by-task.

**Goal:** Build `/app/profile` (currently 404) with name editing, password change, workspace info, and a sign-out button.

**Architecture:** Server Component page guards auth and fetches user + workspace + member; three client islands handle the forms and sign-out; two server actions in `app/actions/profile.ts` handle the writes. No new dependencies, no schema changes.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase Auth (`@/lib/supabase/server` + `@/lib/supabase/client`), Drizzle ORM, Tailwind + glass tokens.

**Spec reference:** `docs/superpowers/specs/2026-04-26-profile-page-design.md`

---

## File Structure

| Path | Action |
|---|---|
| `app/actions/profile.ts` | Create |
| `components/profile-name-form.tsx` | Create |
| `components/profile-password-form.tsx` | Create |
| `components/profile-signout-button.tsx` | Create |
| `app/(protected)/app/profile/page.tsx` | Create |

---

## Task 1: Server actions (`app/actions/profile.ts`)

**Goal:** Two writes — update `users.fullName` and update auth password (with current-password re-auth verification).

**Files:**
- Create: `app/actions/profile.ts`

- [ ] **Step 1: Create the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { users } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateUserName(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const raw = (formData.get("fullName") as string | null) ?? "";
  const trimmed = raw.trim();
  if (trimmed.length > 120) {
    return { success: false, error: "El nombre no puede tener más de 120 caracteres." };
  }
  await db
    .update(users)
    .set({ fullName: trimmed === "" ? null : trimmed, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/app/profile");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/settings/workspace");
  return { success: true };
}

export async function updateUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  if (newPassword.length < 8) {
    return { success: false, error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }
  if (newPassword === currentPassword) {
    return { success: false, error: "La nueva contraseña debe ser distinta de la actual." };
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.email) {
    return { success: false, error: "No se pudo identificar al usuario." };
  }

  // Verify current password by re-authenticating. A successful signIn rotates
  // the session in place; a failure leaves the existing session untouched.
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (signInErr) {
    return { success: false, error: "La contraseña actual no es correcta." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```
git add app/actions/profile.ts
git commit -m "feat(profile): server actions for name and password updates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Client components (3 files)

**Goal:** Three client islands — name form, password form, sign-out button.

**Files:**
- Create: `components/profile-name-form.tsx`
- Create: `components/profile-password-form.tsx`
- Create: `components/profile-signout-button.tsx`

- [ ] **Step 1: `components/profile-name-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserName } from "@/app/actions/profile";

interface ProfileNameFormProps {
  initialName: string | null;
}

export function ProfileNameForm({ initialName }: ProfileNameFormProps) {
  const [value, setValue] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pristine = value.trim() === (initialName ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("fullName", value);
      const res = await updateUserName(fd);
      if (res.success) {
        setSuccess("Nombre actualizado.");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-sm">
          {success}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuccess(null);
          }}
          placeholder="Cómo querés que te vean"
          maxLength={120}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pristine || isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: `components/profile-password-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserPassword } from "@/app/actions/profile";

export function ProfilePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function clear() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (next.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (next === current) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }
    if (next !== confirm) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    startTransition(async () => {
      const res = await updateUserPassword(current, next);
      if (res.success) {
        setSuccess("Contraseña actualizada.");
        clear();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-sm">
          {success}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Contraseña actual</Label>
        <Input
          id="currentPassword"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">Nueva contraseña</Label>
        <Input
          id="newPassword"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending || !current || !next || !confirm}
        >
          {isPending ? "Actualizando…" : "Actualizar contraseña"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: `components/profile-signout-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfileSignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] disabled:opacity-60"
    >
      <LogOut size={14} />
      {pending ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
```

- [ ] **Step 4: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 5: Commit + push**

```
git add components/profile-name-form.tsx components/profile-password-form.tsx components/profile-signout-button.tsx
git commit -m "feat(profile): client components for name, password, sign-out

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Profile page

**Goal:** Server Component that wires it all together.

**Files:**
- Create: `app/(protected)/app/profile/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/drizzle/db";
import { users, workspaceMembers } from "@/lib/drizzle/schema";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { ProfileNameForm } from "@/components/profile-name-form";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import { ProfileSignOutButton } from "@/components/profile-signout-button";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Administrador",
  member: "Miembro",
};

function formatMonth(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function ProfilePage() {
  const userId = await requireUserId();
  const userRow = (
    await db.select().from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  if (!userRow) redirect("/auth/login");

  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const memberRow = (
    await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .limit(1)
  )[0];
  if (!memberRow) redirect("/auth/login");

  const displayName = userRow.fullName?.trim() || null;
  const initial = (displayName ?? userRow.email).charAt(0).toUpperCase();
  const roleLabel = ROLE_LABEL[memberRow.role] ?? "Miembro";
  const isElevated = memberRow.role === "owner" || memberRow.role === "admin";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Perfil</h1>

      <div className="flex flex-col gap-4">
        {/* Header card */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-semibold shadow-md shadow-primary/30 ring-2 ring-white/30">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={
                  displayName
                    ? "text-lg font-semibold truncate"
                    : "text-lg italic text-muted-foreground"
                }
              >
                {displayName ?? "Sin nombre"}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground truncate">
                  {userRow.email}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-primary/10 text-primary">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Datos personales */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="text-sm font-semibold mb-1">Datos personales</h2>
          <p className="text-xs text-muted-foreground mb-4">
            El nombre se muestra en cuentas, dashboard y miembros del workspace.
          </p>
          <ProfileNameForm initialName={userRow.fullName} />
          <div className="mt-5 pt-4 [border-top:1px_solid_var(--glass-border)]">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Email
            </p>
            <p className="text-sm">{userRow.email}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Para cambiar tu email escribinos a{" "}
              <a
                href="mailto:hola@nao.fyi"
                className="underline underline-offset-2 hover:text-primary"
              >
                hola@nao.fyi
              </a>
              .
            </p>
          </div>
        </section>

        {/* Cambiar contraseña */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="text-sm font-semibold mb-1">Cambiar contraseña</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Mínimo 8 caracteres. Te vamos a pedir tu contraseña actual para
            confirmar.
          </p>
          <ProfilePasswordForm />
        </section>

        {/* Mi workspace */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="text-sm font-semibold mb-3">Mi workspace</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Workspace
              </dt>
              <dd className="text-sm">{workspace.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tu rol
              </dt>
              <dd className="text-sm">{roleLabel}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Miembro desde
              </dt>
              <dd className="text-sm">
                {formatMonth(memberRow.createdAt)}
              </dd>
            </div>
          </dl>
          {isElevated && (
            <Link
              href="/app/settings/workspace"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ir a configuración del workspace
              <ChevronRight size={14} />
            </Link>
          )}
        </section>

        {/* Sign out */}
        <div className="flex justify-end mt-2">
          <ProfileSignOutButton />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```
git add app/\(protected\)/app/profile/page.tsx
git commit -m "feat(profile): page wiring all sections together

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: E2E verification

- [ ] **Step 1: Type-check final**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 2: Manual walkthrough**

Open `npm run dev` and visit `/app/profile`:

- Header card shows email + initials + role badge.
- Name form: setting "Nicolás Matute" + Guardar → page revalidates with the new name; the dashboard top-activity owner names + sidebar menu also reflect it.
- Email read-only with the mailto note rendered correctly.
- Password form: wrong current password shows "La contraseña actual no es correcta."; correct change succeeds; new password works on next login.
- Workspace card shows name + role + "Miembro desde Mes Año".
- "Ir a configuración" link only visible when role is owner/admin.
- Sign-out button signs out and redirects to `/auth/login`.
- No console errors.

---

## Self-review

- [x] Spec coverage: header, name form, email note, password form, workspace card, sign-out, file list — all present. ✓
- [x] No placeholders. ✓
- [x] Types consistent: `ActionResult` discriminated union, used in both forms. ✓
- [x] Imports check: `Button`, `Input`, `Label` all exist in `@/components/ui/*`; `requireUserId`, `db`, `createClient` (server + client), `users`, `workspaceMembers`, `getWorkspaceByUserId` are all already used elsewhere in the project. ✓
