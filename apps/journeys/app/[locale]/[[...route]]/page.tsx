import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { Workbench } from "../../travel/Workbench";
import { isKnownRoute } from "../../travel/routes";
import { fixtures } from "../../travel/model";
import type { Metadata } from "next";
import {currentActor} from '../../../lib/auth/actor';
import {capabilities} from '../../../lib/contracts/capabilities';
import {readPublicGuidePage,guidePageMetadata} from '../../../lib/seo/guide-publication';
import {serverClient} from '../../../lib/supabase/server';
import {readPrivateTripHeading} from '../../../lib/trips/private-heading';
type Props = { params: Promise<{ locale: string; route?: string[] }> };
const publishedGuide=cache((id:string)=>readPublicGuidePage(id,process.env));
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, route = [] } = await params;
  if(route[0]==='g') {
    const published=await publishedGuide(route[1]);
    if(!published)notFound();
    return guidePageMetadata(published);
  }
  const guide = route[0]==='demo'&&route[1]==='g'?fixtures.find(g=>g.slug===route[2]):undefined;
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
  const demo=route[0]==='demo';
  const path = (demo?route.slice(1):route).join("/");
  if (
    !["en", "zh-HK"].includes(locale) ||
    (!["library", "workspace", "admin"].includes(path) &&
      !isKnownRoute(path) && !(/^g\/[0-9a-f-]{36}$/.test(path) && !demo)) ||
    path.startsWith("legacy/")
  )
    notFound();
  const actor=demo?null:await currentActor();
  const tripHeading=!demo&&actor&&route[0]==='trips'&&route.length===2&&capabilities(process.env).trips.mode==='connected'
    ?await readPrivateTripHeading(await serverClient(),actor.id,route[1]):null;
  const publicGuide=!demo&&route[0]==='g'?await publishedGuide(route[1]):null;
  if(!demo&&route[0]==='g'&&!publicGuide)notFound();
  return (
    <Suspense fallback={<main className="k-page">Loading Kinnso…</main>}>
      <Workbench
        key={locale + path}
        locale={locale as "en" | "zh-HK"}
        path={path}
        mode={demo?'demo':capabilities(process.env).trips.mode}
        actor={actor}
        publicGuide={publicGuide}
        tripHeading={tripHeading}
        features={{media:capabilities(process.env).media.mode==='connected',sharing:capabilities(process.env).sharing.mode==='connected',creator:capabilities(process.env).creator.mode==='connected',ops:capabilities(process.env).ops.mode==='connected',merchant:capabilities(process.env).merchant.mode==='connected',notifications:capabilities(process.env).notifications.mode==='connected',agent:capabilities(process.env).agent.mode==='connected',telemetry:capabilities(process.env).telemetry.mode==='connected',fieldMetrics:process.env.KINNSO_ENVIRONMENT!=='local'&&process.env.KINNSO_SYNTHETIC_RUN!=='true'&&!actor?.roles.includes('ops')}}
      />
    </Suspense>
  );
}
