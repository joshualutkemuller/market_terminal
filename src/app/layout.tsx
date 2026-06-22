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
      <body className="bg-term-bg text-term-text antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
