export const SERVICE_OPTIONS = [
  "Growth",
  "Marketing",
  "Sherpa",
  "Reingeniera Comercial",
  "AI",
  "Black Opps",
  "Seleccion",
  "People",
] as const;

export type ServiceOption = (typeof SERVICE_OPTIONS)[number];

interface ServiceScopeCheckboxesProps {
  defaultValue?: string | null;
}

export function ServiceScopeCheckboxes({ defaultValue }: ServiceScopeCheckboxesProps) {
  const selected = defaultValue
    ? defaultValue.split(",").map((s) => s.trim())
    : [];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SERVICE_OPTIONS.map((option) => (
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
