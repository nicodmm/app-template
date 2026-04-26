import type { ReactNode } from "react";

interface SectionSkeletonProps {
  title: string;
  icon?: ReactNode;
}

/**
 * Suspense fallback for streamed account-detail sections. Mirrors the closed
 * `<CollapsibleSection>` shape so the layout doesn't shift when the real
 * section resolves and replaces this placeholder.
 */
export function SectionSkeleton({ title, icon }: SectionSkeletonProps) {
  return (
    <section className="rounded-xl overflow-hidden backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="w-full flex items-center gap-3 px-6 py-4 text-left">
        <span className="shrink-0 text-muted-foreground">›</span>
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <span className="font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">cargando…</span>
      </div>
    </section>
  );
}
