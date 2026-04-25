interface ServiceScopeCheckboxesProps {
  options: string[];
  defaultValue?: string | null;
}

/**
 * Checkbox grid for selecting which workspace-managed services apply to
 * an account. The list comes from the workspace's catalog so it stays
 * editable per-tenant — see /app/settings/workspace.
 *
 * Falls back gracefully when the workspace catalog is empty (e.g. an
 * admin removed every service): we still render any names already on
 * the account so they don't disappear silently from the UI.
 */
export function ServiceScopeCheckboxes({
  options,
  defaultValue,
}: ServiceScopeCheckboxesProps) {
  const selected = defaultValue
    ? defaultValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Preserve historical names that aren't in the current catalog so the
  // editor still shows them (and lets the user uncheck) instead of dropping
  // them silently when the workspace catalog drifted.
  const merged = [
    ...options,
    ...selected.filter((s) => !options.includes(s)),
  ];

  if (merged.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aún no hay servicios configurados. Pedile al owner del workspace que
        los agregue desde Settings → Workspace.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {merged.map((option) => (
        <label
          key={option}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
        >
          <input
            type="checkbox"
            name="serviceScope"
            value={option}
            defaultChecked={selected.includes(option)}
            className="rounded border-border text-primary"
          />
          {option}
        </label>
      ))}
    </div>
  );
}
