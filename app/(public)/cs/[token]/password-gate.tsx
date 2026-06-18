"use client";

import { useFormStatus } from "react-dom";
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  token: string;
  error?: string;
  action: (formData: FormData) => Promise<void>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Verificando..." : "Entrar"}
    </button>
  );
}

export function PasswordGate({ token, error, action }: Props) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <GlassCard className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold mb-1">Vista privada</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Ingresá la contraseña que te dio tu agencia.
        </p>
        <form action={action} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton />
        </form>
      </GlassCard>
    </div>
  );
}
