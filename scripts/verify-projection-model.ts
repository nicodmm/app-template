import {
  baseActiveAtUsd,
  computeProjection,
  buildMonths,
  buildMepResolver,
  type PortfolioRow,
  type Assumptions,
} from "@/lib/finance/projection-model";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

const rows: PortfolioRow[] = [
  { accountId: "a", name: "A", neurona: "IC", ticketUsd: 1000, estado: "Activo", bajaMonth: null },
  { accountId: "b", name: "B", neurona: "Growth", ticketUsd: 500, estado: "Se va", bajaMonth: "2026-06" },
];

// Base month = Jun 2026 (start 2026,6).
check("baseActiveAt month0 includes B (baja Jun)", baseActiveAtUsd(rows, 2026, 6, 0) === 1500);
check("baseActiveAt month1 drops B (gone after Jun)", baseActiveAtUsd(rows, 2026, 6, 1) === 1000);

const a: Assumptions = {
  breakevenUsd: 2000,
  otrosIngresosUsd: 0,
  clientesNuevosMes: 1,
  ticketMedioNuevoUsd: 600,
  churnUsdMes: 0,
  horizonteMeses: 6,
};
const R = computeProjection(rows, a, 2026, 6);
check("6 projected months", R.months.length === 6 && R.mrrUsd.length === 6);
check("first projected label is Jul-26", R.months[0].label === "Jul-26");
check("mrrNow = baseNow + otros", R.mrrNowUsd === 1500);
// month1 (Jul): base 1000 + growth (1*600)*1 = 1600 ; month2: 1000 + 1200 = 2200 >= 2000
check("month1 MRR = 1600", R.mrrUsd[0] === 1600);
check("crosses breakeven at Ago-26", R.crossLabel === "Ago-26");

check("buildMonths count", buildMonths(2026, 12, 2)[0].label === "Ene-27");

const mep = buildMepResolver([
  { year: 2026, month: 6, mepRate: 1000, ipcCoefficient: 1.05 },
]);
check("known month MEP", mep(2026, 6) === 1000);
check("forward MEP compounds IPC once", Math.abs((mep(2026, 7) ?? 0) - 1050) < 1e-6);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll projection-model checks passed.");
