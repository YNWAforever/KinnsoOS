import type { Metadata } from "next";
import "./globals.css";
import "./travel/workbench.css";
import "./integration/integration.css";
export const metadata: Metadata = {
  title: {
    default: "KINNSO — Explore, plan & record",
    template: "%s | KINNSO",
  },
  description: "Discover creator routes and shape your next trip.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  );
}
