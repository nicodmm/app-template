import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { CsvImportForm } from "@/components/csv-import-form";

export default async function ImportAccountsPage() {
  await requireUserId();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        href="/app/portfolio"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        Volver al portfolio
      </Link>

      <h1 className="text-2xl font-semibold mb-1">Importar cuentas desde CSV</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Pegá un CSV (o subí un archivo) con tus cuentas. Las creamos en bloque y
        después podés enriquecerlas individualmente con la web del cliente.
      </p>

      <CsvImportForm />
    </div>
  );
}
