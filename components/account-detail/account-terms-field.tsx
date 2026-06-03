"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Sparkles } from "lucide-react";
import { saveTermsRawText, structureTerms } from "@/app/actions/finance-terms";

interface Props {
  accountId: string;
  initialText: string | null;
}

export function AccountTermsField({ accountId, initialText }: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialText ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setStatus("idle");
    setError(null);
    startTransition(async () => {
      const res = await saveTermsRawText({ accountId, rawText: text });
      if (!res.success) {
        setStatus("error");
        setError(res.error ?? "Error");
        return;
      }
      // Re-estructurar automáticamente al guardar (mantiene engagements al día).
      await structureTerms({ accountId });
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus("idle");
        }}
        placeholder="Modo de contratación y novedades. Ej: este mes aplica un descuento por…, el mes que viene se suma el cargo por…"
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-y"
        disabled={isPending}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <Save size={13} aria-hidden />
          {isPending ? "Guardando…" : "Guardar términos"}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Sparkles size={12} aria-hidden /> Guardado · reestructurando
          </span>
        )}
        {status === "error" && error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
    </div>
  );
}
