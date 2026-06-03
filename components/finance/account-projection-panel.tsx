import type { ProjectionMonth } from "@/lib/finance/projection";

const MONTHS: Record<number, string> = {
  1: "Ene",
  2: "Feb",
  3: "Mar",
  4: "Abr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Ago",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dic",
};
const arsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const usdFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function AccountProjectionPanel({ months }: { months: ProjectionMonth[] }) {
  const totalArs = months.reduce((s, m) => s + m.totalArs, 0);
  const totalUsd = months.reduce((s, m) => s + m.totalUsd, 0);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Proyección 6 meses
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b [border-color:var(--glass-border)]">
            <th className="py-2 text-left font-semibold text-muted-foreground">Mes</th>
            <th className="py-2 text-right font-semibold text-muted-foreground">ARS</th>
            <th className="py-2 text-right font-semibold text-muted-foreground">USD</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr
              key={`${m.year}-${m.month}`}
              className="border-b last:border-0 [border-color:var(--glass-border)]"
            >
              <td className="py-1.5">
                {MONTHS[m.month]} {m.year}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {arsFmt.format(m.totalArs)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {usdFmt.format(m.totalUsd)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t [border-color:var(--glass-border)]">
            <td className="py-2 font-semibold">Total</td>
            <td className="py-2 text-right font-semibold tabular-nums">
              {arsFmt.format(totalArs)}
            </td>
            <td className="py-2 text-right font-semibold tabular-nums">
              {usdFmt.format(totalUsd)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-[10px] text-muted-foreground">
        Estimación a partir de los fees activos y el TC de cada mes (o el más reciente).
        Si la cuenta tiene fecha de finalización, los meses posteriores proyectan 0.
      </p>
    </div>
  );
}
