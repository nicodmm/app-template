import Link from "next/link";
import { DEMO_USER } from "@/lib/demo/mock-data";

export function DemoHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-4 backdrop-blur-[18px] [background:var(--glass-bg)] [border-bottom:1px_solid_var(--glass-border)]">
      <Link
        href="/demo/portfolio"
        className="font-semibold text-sm tracking-tight"
      >
        nao.fyi
      </Link>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col text-right">
          <span className="text-xs font-medium leading-tight">
            {DEMO_USER.fullName}
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {DEMO_USER.email}
          </span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-md shadow-primary/30 ring-2 ring-white/30">
          {DEMO_USER.initial}
        </div>
      </div>
    </header>
  );
}
