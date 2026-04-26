/**
 * Skeleton for /app/accounts/[accountId]/paid-media. Renders instantly on
 * navigation while KPIs, campaigns, ads, and change history stream in.
 */
export default function PaidMediaLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      {/* Breadcrumb */}
      <div className="h-4 w-32 rounded bg-muted/40 mb-6" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="h-7 w-72 rounded bg-muted/40 mb-2" />
          <div className="h-3 w-56 rounded bg-muted/30" />
        </div>
        <div className="h-9 w-36 rounded-md bg-muted/40" />
      </div>

      {/* KPI grid (top row of 6) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-xl p-3 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
          >
            <div className="h-3 w-16 rounded bg-muted/30 mb-2" />
            <div className="h-6 w-20 rounded bg-muted/40" />
          </div>
        ))}
      </div>

      {/* KPI grid (bottom row of 4) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl p-3 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
          >
            <div className="h-3 w-16 rounded bg-muted/30 mb-2" />
            <div className="h-6 w-20 rounded bg-muted/40" />
          </div>
        ))}
      </div>

      {/* Campaigns table */}
      <div className="h-4 w-28 rounded bg-muted/40 mb-3" />
      <div className="rounded-xl p-4 mb-8 space-y-2 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-full rounded bg-muted/30" />
        ))}
      </div>

      {/* Ads table */}
      <div className="h-4 w-32 rounded bg-muted/40 mb-3 mt-8" />
      <div className="rounded-xl p-4 space-y-2 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 w-full rounded bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
