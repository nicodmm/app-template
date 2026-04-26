"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Submit button for the new-account form. Uses useFormStatus to disable
 * the button + show a spinner while the server action is in flight,
 * preventing duplicate submissions.
 */
export function NewAccountSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="flex-1 sm:flex-none sm:px-8"
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Creando…
        </span>
      ) : (
        "Crear cuenta"
      )}
    </Button>
  );
}
