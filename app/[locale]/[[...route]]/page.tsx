import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Workbench } from "../../travel/Workbench";
import { isKnownRoute } from "../../travel/routes";
import { fixtures } from "../../travel/model";
import type { Metadata } from "next";
type Props = { params: Promise<{ locale: string; route?: string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, route = [] } = await params;
  const guide =
    route[0] === "g" ? fixtures.find((g) => g.slug === route[1]) : undefined;
  return {
    title: guide
      ? guide.title[locale === "en" ? "en" : "zh-HK"]
      : locale === "en"
        ? "Explore, plan & record"
        : "探索、規劃及記錄旅程",
    robots: { index: false, follow: false },
  };
}
export default async function Page({ params }: Props) {
  const { locale, route = [] } = await params;
  const path = route.join("/");
  if (
    !["en", "zh-HK"].includes(locale) ||
    (!["library", "workspace", "admin"].includes(path) &&
      !isKnownRoute(path)) ||
    path.startsWith("legacy/")
  )
    notFound();
  return (
    <Suspense fallback={<main className="k-page">Loading Kinnso…</main>}>
      <Workbench
        key={locale + path}
        locale={locale as "en" | "zh-HK"}
        path={path}
      />
    </Suspense>
  );
}
