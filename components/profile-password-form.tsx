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
