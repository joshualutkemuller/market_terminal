import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "SFX Terminal — Securities Finance Intelligence Platform",
  description:
    "A Bloomberg-style operating system unifying Securities Lending, Prime Finance, Collateral & Cash Optimization, Sources & Uses Matching, Treasury Analytics and AI decision support.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-term-bg text-term-text antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
