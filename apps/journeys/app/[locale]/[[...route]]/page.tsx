import { cache, Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Workbench } from "../../travel/Workbench";
import { isKnownRoute } from "../../travel/routes";
import { fixtures } from "../../travel/model";
import type { Metadata } from "next";
import {publicEntryMetadata} from "../../../lib/seo/public-entry";
import {currentActor} from '../../../lib/auth/actor';
import {capabilities} from '../../../lib/contracts/capabilities';
import {readPublicGuidePage,guidePageMetadata} from '../../../lib/seo/guide-publication';
import {isGuideSlug,resolvePublishedGuideId} from '../../../lib/seo/legacy-guide';
import {readPublicCreator,creatorPageMetadata} from '../../../lib/seo/public-creator';
import {PublicCreatorContent} from '../../../lib/seo/PublicCreatorContent';
import {readPublicArticle} from '../../../lib/seo/public-article';
import {publicLanguage} from '../../../lib/seo/public-language';
import {PublicArticleContent} from '../../../lib/seo/PublicArticleContent';
import {articleCategories,articleListQuery,readArticleListing,type ArticleCategory} from '../../../lib/seo/article-listing';
import {PublicArticleListing,PublicArticlesHub} from '../../../lib/seo/PublicArticleListing';
import {articleLabels} from '../../../lib/seo/article-labels';
import {articlePageMetadata} from '../../../lib/seo/article-presentation';
import {PublicGuideContent} from '../../../lib/seo/PublicGuideContent';
import {parsePublicRoute} from '../../../lib/seo/public-routes';
import {readPublicExperience,readMerchantExperiences,experiencePageMetadata} from '../../../lib/seo/public-experiences';
import {readPublicMerchant,merchantPageMetadata} from '../../../lib/seo/public-merchants';
import {PublicExperienceContent} from '../../../lib/seo/PublicExperienceContent';
import {PublicMerchantContent} from '../../../lib/seo/PublicMerchantContent';
import {readPublicSessionDiscovery,readPublicSession,sessionIndexMetadata,sessionPageMetadata} from '../../../lib/seo/public-sessions';
import {PublicSessionsContent,PublicSessionContent,PublicSessionUnavailable} from '../../../lib/seo/PublicSessionContent';
import {readDestinationListing,readPublicDestination,destinationIndexMetadata,destinationPageMetadata} from '../../../lib/seo/public-destinations';
import {readDestinationRelated} from '../../../lib/seo/destination-related';
import {PublicDestinationIndex,PublicDestinationDetail,PublicDestinationUnavailable} from '../../../lib/seo/PublicDestinationContent';
import {serverClient} from '../../../lib/supabase/server';
import {readPrivateTripHeading} from '../../../lib/trips/private-heading';
import{readPrivateMerchantEntry}from '../../../lib/merchants/private-entry';
import{readPrivateCreatorMissionEntry}from '../../../lib/creators/private-mission-entry';
type Props = { params: Promise<{ locale: string; route?: string[] }>;searchParams?:Promise<Record<string,string|string[]|undefined>> };
const publishedGuide=cache(async(reference:string)=>{
 const id=isGuideSlug(reference)?await resolvePublishedGuideId(reference,process.env):reference;
 return id?readPublicGuidePage(id,process.env):null;
});
const publishedCreator=cache((handle:string,page=1)=>readPublicCreator(handle,process.env,fetch,page));
const publishedArticle=cache((category:string,slug:string,locale:string)=>readPublicArticle(category,slug,locale,process.env));
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, route = [] } = await params;
  if(route[0]==='articles'&&route.length<=2){
    const language=publicLanguage(locale);if(!language||(route.length===2&&!Object.hasOwn(articleCategories,route[1])))notFound();
    const labels=articleLabels[language];return{title:route.length===2?labels.categories[route[1] as ArticleCategory]:labels.title,robots:{index:false,follow:false},alternates:{canonical:`https://kinnso-os.vercel.app/${language}/${route.join('/')}`}};
  }
  if(route[0]==='articles'&&route.length===3) {
    const article=await publishedArticle(route[1],route[2],locale);
    if(!article)notFound();
    return articlePageMetadata(article);
  }
  const publicRoute=parsePublicRoute(locale,route,new URLSearchParams());
  if(publicRoute?.kind==='experience') {
    const experience=await readPublicExperience(publicRoute.slug,process.env);
    if(!experience)notFound();
    return experiencePageMetadata(experience,locale);
  }
  if(publicRoute?.kind==='merchant') {
    const merchant=await readPublicMerchant(publicRoute.slug,process.env);
    if(!merchant)notFound();
    return merchantPageMetadata(merchant,locale);
  }
  if(publicRoute?.kind==='sessions-index') return sessionIndexMetadata(locale);
  if(publicRoute?.kind==='session') {
    const session=await readPublicSession(publicRoute.slug,process.env);
    if(!session)notFound();
    return sessionPageMetadata(session,locale);
  }
  if(publicRoute?.kind==='destinations-index') return destinationIndexMetadata(locale);
  if(publicRoute?.kind==='destination') {
    const destination=await readPublicDestination(publicRoute.slug,process.env);
    if(!destination)notFound();
    return destinationPageMetadata(destination,locale);
  }
  if(publicRoute?.kind==='creator') {
    const creator=await publishedCreator(publicRoute.handle,publicRoute.page);
    if(!creator)notFound();
    return creatorPageMetadata(creator,locale);
  }
  if(publicRoute?.kind==='guide') {
    const published=await publishedGuide(publicRoute.reference);
    if(!published)notFound();
    return guidePageMetadata(published,locale);
  }
  if(!['en','zh-HK'].includes(locale))notFound();
  const entryMetadata=route[0]!=='demo'?publicEntryMetadata(route.join('/'),locale as 'en'|'zh-HK'):null;
  if(entryMetadata)return entryMetadata;
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
export default async function Page({ params,searchParams }: Props) {
  const { locale, route = [] } = await params;
  if(route[0]==='articles'&&route.length<=2){
    const language=publicLanguage(locale);if(!language)notFound();
    if(route.length===1){
      const sections=await Promise.all((Object.keys(articleCategories) as ArticleCategory[]).map(async category=>{
        const listing=await readArticleListing(language,category,articleListQuery(new URLSearchParams()),process.env,fetch,6);if(!listing)notFound();return{category,listing};
      }));return <PublicArticlesHub locale={language} sections={sections}/>;
    }
    if(!Object.hasOwn(articleCategories,route[1]))notFound();
    const params=new URLSearchParams();for(const[key,value]of Object.entries(await searchParams??{})){if(Array.isArray(value))value.forEach(item=>params.append(key,item));else if(value!==undefined)params.append(key,value);}
    let query;try{query=articleListQuery(params);}catch{notFound();}
    const listing=await readArticleListing(language,route[1],query,process.env);if(!listing||(listing.page>1&&!listing.items.length))notFound();
    return <PublicArticleListing locale={language} category={route[1] as ArticleCategory} listing={listing}/>;
  }
  if(route[0]==='articles'&&route.length===3){
    const language=publicLanguage(locale);if(!language)notFound();
    const article=await publishedArticle(route[1],route[2],locale);if(!article)notFound();
    return <main><PublicArticleContent article={article} locale={language}/></main>;
  }
  const entryQuery=await searchParams??{};
  const publicQuery=new URLSearchParams();
  for(const[key,value]of Object.entries(entryQuery)){if(Array.isArray(value))value.forEach(item=>publicQuery.append(key,item));else if(value!==undefined)publicQuery.append(key,value);}
  const publicRoute=parsePublicRoute(locale,route,publicQuery);
  if(publicRoute?.kind==='experience') {
    const experience=await readPublicExperience(publicRoute.slug,process.env);
    if(!experience)notFound();
    return <PublicExperienceContent experience={experience} locale={locale}/>;
  }
  if(publicRoute?.kind==='merchant') {
    const merchant=await readPublicMerchant(publicRoute.slug,process.env);
    if(!merchant)notFound();
    const experiences=await readMerchantExperiences(merchant.id,process.env);
    return <PublicMerchantContent locale={locale} merchant={merchant} experiences={experiences}/>;
  }
  if(publicRoute?.kind==='sessions-index') {
    const discovery=await readPublicSessionDiscovery(process.env);
    return <PublicSessionsContent locale={locale} discovery={discovery}/>;
  }
  if(publicRoute?.kind==='session') {
    let session;
    try {
      session=await readPublicSession(publicRoute.slug,process.env);
    } catch {
      return <PublicSessionUnavailable locale={locale}/>;
    }
    if(!session)notFound();
    return <PublicSessionContent locale={locale} session={session}/>;
  }
  if(publicRoute?.kind==='destinations-index') {
    let listing;
    try {
      listing=await readDestinationListing(publicRoute.page,process.env);
    } catch {
      return <PublicDestinationUnavailable locale={locale}/>;
    }
    if(publicRoute.page>1&&!listing.items.length)notFound();
    return <PublicDestinationIndex locale={locale} page={listing.page} hasNext={listing.hasNext} destinations={listing.items}/>;
  }
  if(publicRoute?.kind==='destination') {
    let destination;
    try {
      destination=await readPublicDestination(publicRoute.slug,process.env);
    } catch {
      return <PublicDestinationUnavailable locale={locale}/>;
    }
    if(!destination)notFound();
    const related=await readDestinationRelated(destination,locale,process.env);
    return <PublicDestinationDetail locale={locale} destination={destination} related={related}/>;
  }
  if(publicRoute?.kind==='creator') {
    const creator=await publishedCreator(publicRoute.handle,publicRoute.page);
    if(!creator)notFound();
    if(publicRoute.page>1&&!creator.guides.length)notFound();
    return <PublicCreatorContent creator={creator} locale={locale}/>;
  }
  if(publicRoute?.kind==='guide') {
    const guide=await publishedGuide(publicRoute.reference);
    if(!guide)notFound();
    if(isGuideSlug(publicRoute.reference))redirect(`/${locale}/g/${guide.id}`);
    return <PublicGuideContent guide={guide} locale={locale}/>;
  }
  const demo=route[0]==='demo';
  const path = (demo?route.slice(1):route).join("/");
  if (
    !["en", "zh-HK"].includes(locale) ||
    (!["library", "workspace", "admin"].includes(path) &&
      !isKnownRoute(path) && !(route[0]==='g'&&route.length===2&&!demo&&(/^g\/[0-9a-f-]{36}$/i.test(path)||isGuideSlug(route[1])))) ||
    path.startsWith("legacy/")
  )
    notFound();
  const actor=demo?null:await currentActor();
  const requestedCompany=typeof entryQuery?.company==='string'?entryQuery.company:null;
  const merchantEntry=!demo&&actor&&path==='merchant'&&capabilities(process.env).merchant.mode==='connected'
    ?await readPrivateMerchantEntry(await serverClient(),actor.id,requestedCompany):null;
  const creatorMissionEntry=!demo&&actor&&route[0]==='studio'&&route[1]==='missions'&&route.length===3&&capabilities(process.env).creator.mode==='connected'
    ?await readPrivateCreatorMissionEntry(await serverClient(),actor.id,route[2]):null;
  const tripHeading=!demo&&actor&&route[0]==='trips'&&route.length===2&&capabilities(process.env).trips.mode==='connected'
    ?await readPrivateTripHeading(await serverClient(),actor.id,route[1]):null;
  return (
    <Suspense fallback={<main className="k-page">Loading Kinnso…</main>}>
      <Workbench
        key={locale + path}
        locale={locale as "en" | "zh-HK"}
        path={path}
        mode={demo?'demo':capabilities(process.env).trips.mode}
        actor={actor}
        tripHeading={tripHeading}
        merchantEntry={merchantEntry}
        creatorMissionEntry={creatorMissionEntry}
        features={{catalog:capabilities(process.env).catalog.mode==='connected',trips:capabilities(process.env).trips.mode==='connected',media:capabilities(process.env).mediaUpload.mode==='connected',sharing:capabilities(process.env).sharing.mode==='connected',shareRecovery:capabilities(process.env).shareRecovery.mode==='connected',creator:capabilities(process.env).creator.mode==='connected',ops:capabilities(process.env).ops.mode==='connected',merchant:capabilities(process.env).merchant.mode==='connected',notifications:capabilities(process.env).notifications.mode==='connected',agent:capabilities(process.env).agent.mode==='connected',telemetry:capabilities(process.env).telemetry.mode==='connected',fieldMetrics:process.env.KINNSO_ENVIRONMENT!=='local'&&process.env.KINNSO_SYNTHETIC_RUN!=='true'&&!actor?.roles.includes('ops')}}
      />
    </Suspense>
  );
}
