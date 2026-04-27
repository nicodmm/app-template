"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";

interface Props {
  entityId: string;
  internalName: string;
  initialPublicName: string | null;
  onSave: (entityId: string, publicName: string | null) => Promise<void>;
}

export function PublicNameEditor({
  entityId,
  internalName,
  initialPublicName,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialPublicName ?? "");
  const [current, setCurrent] = useState(initialPublicName);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  function commit(e?: React.MouseEvent | React.KeyboardEvent) {
    e?.stopPropagation();
    startTransition(async () => {
      setPending(true);
      try {
        const trimmed = value.trim();
        await onSave(entityId, trimmed.length > 0 ? trimmed : null);
        setCurrent(trimmed.length > 0 ? trimmed : null);
        setEditing(false);
      } finally {
        setPending(false);
      }
    });
  }

  if (editing) {
    return (
      <span
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit(e);
            if (e.key === "Escape") {
              setValue(current ?? "");
              setEditing(false);
            }
          }}
          placeholder="Nombre público"
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={(e) => commit(e)}
          disabled={pending}
          className="text-primary"
          aria-label="Guardar"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setValue(current ?? "");
            setEditing(false);
          }}
          className="text-muted-foreground"
          aria-label="Cancelar"
        >
          <X size={12} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0">
      <span className="inline-flex items-center gap-1.5 group/name">
        <span className="truncate">{internalName}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="opacity-0 group-hover/name:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
          aria-label="Editar nombre público"
        >
          <Pencil size={11} />
        </button>
      </span>
      {current && (
        <span className="text-[10px] text-muted-foreground truncate">
          Público: {current}
        </span>
      )}
    </span>
  );
}
