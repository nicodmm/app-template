import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4">
      <Link
        href="/"
        className="mb-8 text-xl font-semibold tracking-tight text-foreground"
      >
        nao.fyi
      </Link>
      <GlassCard variant="strong" className="w-full max-w-sm p-8">
        {children}
      </GlassCard>
    </div>
  );
}
