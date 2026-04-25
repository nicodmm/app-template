import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Suspense } from "react";
import { AppBackground } from "@/components/app-background";
import { NavProgress } from "@/components/nav-progress";

export const metadata: Metadata = {
  title: "nao.fyi",
  description: "Inteligencia de cuentas para agencias de growth.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <AppBackground />
        <Suspense>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
