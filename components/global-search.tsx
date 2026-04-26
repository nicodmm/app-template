"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  FileText,
  Briefcase,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { fetchSearchResults } from "@/app/actions/search";
import type { SearchResult } from "@/lib/queries/search";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 220;
const MIN_QUERY_LEN = 2;

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform);
}

function HighlightMatch({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  // Avoid SSR hydration mismatch on the keyboard hint
  useEffect(() => setMounted(true), []);

  // Global keyboard listener: Cmd+K / Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isOpen = open;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (isOpen && e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when opened, reset when closed
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, [open]);

  // Debounced server fetch
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          const r = await fetchSearchResults(trimmed);
          setResults(r);
          setActiveIndex(0);
        } catch {
          setResults([]);
        }
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  function hrefForResult(r: SearchResult): string {
    if (r.type === "account") return `/app/accounts/${r.accountId}`;
    return `/app/accounts/${r.accountId}#archivos`;
  }

  function navigate(r: SearchResult) {
    setOpen(false);
    router.push(hrefForResult(r));
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) navigate(r);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/40 dark:hover:bg-white/5 [border:1px_solid_var(--glass-border)] [background:var(--glass-bg)]"
      >
        <Search size={13} aria-hidden />
        <span className="hidden sm:inline">Buscar…</span>
        {mounted && (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {isMac() ? "⌘" : "Ctrl"}K
          </kbd>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            aria-label="Buscar"
            className="fixed inset-x-0 top-[10vh] z-50 mx-auto w-full max-w-xl px-4"
          >
            <div className="rounded-xl overflow-hidden backdrop-blur-[18px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:0_24px_64px_-16px_rgba(15,18,53,0.35)]">
              <div className="flex items-center gap-2 px-4 py-3 [border-bottom:1px_solid_var(--glass-border)]">
                <Search
                  size={16}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Buscá cuentas, reuniones, palabras…"
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                />
                {isPending && (
                  <Loader2
                    size={14}
                    className="shrink-0 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="rounded-md p-1 text-muted-foreground hover:bg-white/30 dark:hover:bg-white/5"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-auto">
                {query.trim().length < MIN_QUERY_LEN ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Escribí al menos 2 letras para buscar.
                  </p>
                ) : results.length === 0 && !isPending ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Sin resultados para “{query}”.
                  </p>
                ) : (
                  <ul role="listbox">
                    {results.map((r, i) => {
                      const active = i === activeIndex;
                      const key =
                        r.type === "account"
                          ? `a-${r.accountId}`
                          : `t-${r.transcriptId}`;
                      return (
                        <li key={key}>
                          <Link
                            href={hrefForResult(r)}
                            role="option"
                            aria-selected={active}
                            onClick={() => setOpen(false)}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={cn(
                              "flex items-start gap-3 px-4 py-2.5 text-sm transition-colors",
                              active && "bg-primary/10"
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                r.type === "account"
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted/40 text-muted-foreground"
                              )}
                              aria-hidden
                            >
                              {r.type === "account" ? (
                                <Briefcase size={14} />
                              ) : (
                                <FileText size={14} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              {r.type === "account" ? (
                                <span className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "font-medium truncate",
                                      r.closed && "text-muted-foreground"
                                    )}
                                  >
                                    <HighlightMatch
                                      text={r.accountName}
                                      term={query.trim().toLowerCase()}
                                    />
                                  </span>
                                  {r.closed && (
                                    <span className="shrink-0 rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                                      Archivada
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <>
                                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="truncate">
                                      {r.accountName}
                                    </span>
                                    <span aria-hidden>·</span>
                                    <span>
                                      {r.meetingDate
                                        ? formatDate(r.meetingDate)
                                        : formatDate(r.createdAt)}
                                    </span>
                                  </span>
                                  <span className="block mt-0.5 leading-snug text-foreground/90">
                                    <HighlightMatch
                                      text={r.snippet}
                                      term={r.matchTerm}
                                    />
                                  </span>
                                </>
                              )}
                            </span>
                            <ArrowRight
                              size={13}
                              className={cn(
                                "shrink-0 mt-1 text-muted-foreground transition-opacity",
                                active ? "opacity-100" : "opacity-0"
                              )}
                              aria-hidden
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {results.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 [border-top:1px_solid_var(--glass-border)] text-[10px] uppercase tracking-wider text-muted-foreground">
                  <kbd className="rounded bg-muted/50 px-1 py-0.5 font-mono">
                    ↑↓
                  </kbd>
                  <span>navegar</span>
                  <kbd className="rounded bg-muted/50 px-1 py-0.5 font-mono">
                    ↵
                  </kbd>
                  <span>abrir</span>
                  <kbd className="rounded bg-muted/50 px-1 py-0.5 font-mono">
                    Esc
                  </kbd>
                  <span>cerrar</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
