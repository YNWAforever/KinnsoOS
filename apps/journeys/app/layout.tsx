import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./travel/workbench.css";
import "./integration/integration.css";
import {UnsavedDraftNavigationProvider} from './travel/UnsavedDraftGuard';
import {DocumentLanguage} from './DocumentLanguage';
export const metadata: Metadata = {
  title: {
    default: "KINNSO — Explore, plan & record",
    template: "%s | KINNSO",
  },
  description: "Discover creator routes and shape your next trip.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  const locale = (await headers()).get('x-kinnso-locale') === 'en' ? 'en' : 'zh-HK';
  return (
    <html lang={locale}>
      <body><DocumentLanguage/><UnsavedDraftNavigationProvider>{children}</UnsavedDraftNavigationProvider></body>
    </html>
  );
}
