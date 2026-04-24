"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  StickyNote,
  Paperclip,
  Presentation as PresentationIcon,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { deleteContextDocument } from "@/app/actions/context-documents";
import type { ContextDocument } from "@/lib/queries/context-documents";

interface ContextDocumentsListProps {
  documents: ContextDocument[];
}

const DOC_TYPE_META: Record<string, { label: string; Icon: typeof FileText }> = {
  note: { label: "Nota", Icon: StickyNote },
  presentation: { label: "Presentación", Icon: PresentationIcon },
  report: { label: "Reporte", Icon: FileText },
  spreadsheet: { label: "Planilla", Icon: FileSpreadsheet },
  other: { label: "Archivo", Icon: Paperclip },
};

export function ContextDocumentsList({ documents }: ContextDocumentsListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no cargaste ningún archivo de contexto.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const meta = DOC_TYPE_META[doc.docType] ?? DOC_TYPE_META.other;
        const { Icon, label } = meta;
        const isOpen = expanded === doc.id;
        const hasBody = !!(doc.notes || doc.extractedText);

        return (
          <div
            key={doc.id}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => hasBody && setExpanded(isOpen ? null : doc.id)}
                className={`flex items-start gap-2 text-left flex-1 min-w-0 ${
                  hasBody ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <Icon size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{doc.title}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(doc.createdAt).toLocaleDateString("es-AR", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {doc.fileName && doc.fileName !== doc.title && ` · ${doc.fileName}`}
                    {doc.fileSize ? ` · ${Math.round(doc.fileSize / 1024)} KB` : ""}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Eliminar "${doc.title}"?`)) return;
                  startTransition(async () => {
                    await deleteContextDocument(doc.id);
                  });
                }}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isOpen && hasBody && (
              <div className="mt-3 pt-3 border-t border-border">
                {doc.notes && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{doc.notes}</p>
                )}
                {doc.extractedText && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Ver texto extraído ({doc.extractedText.length.toLocaleString()} caracteres)
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {doc.extractedText}
                    </p>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
