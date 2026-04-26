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
