/**
 * Skeleton for /app/accounts/[accountId]. Renders instantly on navigation so
 * the click feels responsive while the server resolves the account, summary,
 * and the streamed sub-sections.
 */
export default function AccountDetailLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto animate-pulse">
      {/* Breadcrumb */}
      <div className="h-4 w-24 rounded bg-muted/40 mb-6" />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-7 w-56 rounded bg-muted/40" />
          <div className="h-5 w-16 rounded-full bg-muted/40" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-16 rounded-md bg-muted/40" />
          <div className="h-7 w-20 rounded-md bg-muted/40" />
        </div>
      </div>

      {/* AI summary card */}
      <div className="rounded-xl p-6 mb-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <div className="h-4 w-40 rounded bg-muted/40 mb-3" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted/30" />
          <div className="h-3 w-11/12 rounded bg-muted/30" />
          <div className="h-3 w-9/12 rounded bg-muted/30" />
        </div>
      </div>

      {/* Context card */}
      <div className="rounded-xl p-6 mb-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <div className="h-4 w-44 rounded bg-muted/40 mb-4" />
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted/30" />
            <div className="h-3 w-full rounded bg-muted/40" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted/30" />
            <div className="h-3 w-full rounded bg-muted/40" />
          </div>
        </div>
      </div>

      {/* Collapsibles */}
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl px-4 py-3.5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded bg-muted/40" />
              <div className="h-3 w-20 rounded bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
