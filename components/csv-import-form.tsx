"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  importAccountsFromCsv,
  type ImportResult,
} from "@/app/actions/accounts-import";

const EXAMPLE_CSV = `name,email,fee,start_date,website,service_scope
Acme Corp,nico@miagencia.com,3500,2025-09-01,https://acme.com,Growth;Paid Media
Globex,maria@miagencia.com,2000,2025-11-15,globex.com,SEO;Content
Initech,,1500,,initech.com,Paid Media`;

export function CsvImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsv(text);
      setResult(null);
    };
    reader.readAsText(file);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!csv.trim() || pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("csv", csv);
      const res = await importAccountsFromCsv(fd);
      setResult(res);
      if (res.success && res.warnings.length === 0) {
        // Clean exit: redirect right away when there's nothing to review.
        router.push("/app/portfolio");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {result && !result.success && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-medium">{result.error}</p>
              {result.rowErrors && result.rowErrors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs space-y-0.5">
                  {result.rowErrors.map((e, i) => (
                    <li key={i}>
                      Fila {e.line}: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {result && result.success && (
        <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2
              size={16}
              className="mt-0.5 shrink-0 text-success"
              aria-hidden
            />
            <div className="flex-1">
              <p className="font-medium">
                Se crearon {result.created} cuenta
                {result.created !== 1 ? "s" : ""}.
              </p>
              {result.warnings.length > 0 && (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {result.warnings.length} aviso
                    {result.warnings.length !== 1 ? "s" : ""}:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5 text-muted-foreground">
                    {result.warnings.slice(0, 10).map((w, i) => (
                      <li key={i}>
                        Fila {w.line} · {w.field}: {w.reason}
                      </li>
                    ))}
                    {result.warnings.length > 10 && (
                      <li>
                        … y {result.warnings.length - 10} aviso
                        {result.warnings.length - 10 !== 1 ? "s" : ""} más
                      </li>
                    )}
                  </ul>
                  <button
                    type="button"
                    onClick={() => router.push("/app/portfolio")}
                    className="mt-3 text-xs font-medium underline"
                  >
                    Ir al portfolio →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md p-4 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
        <p className="text-sm font-medium mb-2">Columnas soportadas</p>
        <p className="text-xs text-muted-foreground mb-3">
          La primera fila debe ser cabeceras. Solo <strong>name</strong> es
          obligatorio. Sinónimos aceptados (case-insensitive):
        </p>
        <ul className="text-xs space-y-1 text-muted-foreground">
          <li>
            <code>name</code> · nombre, cuenta, cliente, account
          </li>
          <li>
            <code>email</code> · responsable, owner, am — debe existir como
            miembro del workspace
          </li>
          <li>
            <code>fee</code> · monto, precio, tarifa
          </li>
          <li>
            <code>start_date</code> · fecha_inicio, inicio — formato
            YYYY-MM-DD o DD/MM/YYYY
          </li>
          <li>
            <code>website</code> · web, sitio, url
          </li>
          <li>
            <code>linkedin</code> · linkedin_url
          </li>
          <li>
            <code>goals</code> · objetivos
          </li>
          <li>
            <code>service_scope</code> · servicios, scope, services — múltiples
            servicios separados por <strong>;</strong> (no por coma)
          </li>
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium select-none">
            Ver ejemplo
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-background/50 p-2 text-[11px] [border:1px_solid_var(--glass-tile-border)]">
            {EXAMPLE_CSV}
          </pre>
          <button
            type="button"
            onClick={() => {
              setCsv(EXAMPLE_CSV);
              setResult(null);
            }}
            className="mt-2 text-xs font-medium underline"
          >
            Cargar ejemplo en el textarea
          </button>
        </details>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="csv-textarea" className="text-sm font-medium">
            CSV / TSV
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Upload size={13} aria-hidden />
            Cargar archivo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={onFileChange}
            className="hidden"
          />
        </div>
        <textarea
          id="csv-textarea"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setResult(null);
          }}
          placeholder="Pegá tu CSV o TSV acá. Primera fila debe ser cabeceras."
          rows={14}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={!csv.trim() || pending}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {pending ? "Importando…" : "Importar"}
        </button>
      </div>
    </form>
  );
}
