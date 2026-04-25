import Link from "next/link";
import { Mail } from "lucide-react";

export default function VerifyEmailPage() {
  return (
    <div className="flex flex-col gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail size={22} aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Revisá tu email</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Te enviamos un link de confirmación. Hacé clic en el link para
          activar tu cuenta y acceder a nao.fyi.
        </p>
      </div>

      <div className="rounded-md bg-muted px-4 py-3 text-xs text-muted-foreground text-left">
        <p className="font-medium text-foreground mb-1">¿No llegó el email?</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Revisá la carpeta de spam o correo no deseado</li>
          <li>Puede demorar hasta 2 minutos</li>
        </ul>
      </div>

      <Link
        href="/auth/login"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Volver al login
      </Link>
    </div>
  );
}
