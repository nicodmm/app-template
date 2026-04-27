import type { Metadata } from "next";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DemoSidebar } from "@/components/demo/demo-sidebar";
import { DemoHeader } from "@/components/demo/demo-header";

export const metadata: Metadata = {
  title: "Demo · nao.fyi",
  description:
    "Vista demo de la plataforma nao.fyi con datos ficticios.",
  robots: { index: false, follow: false },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <DemoBanner />
      <DemoHeader />
      <div className="flex flex-1 overflow-hidden">
        <DemoSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
