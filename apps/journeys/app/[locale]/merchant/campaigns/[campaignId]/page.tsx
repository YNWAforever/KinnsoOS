import {notFound,redirect} from 'next/navigation';
import {currentActor} from '../../../../../lib/auth/actor';
import {serverClient} from '../../../../../lib/supabase/server';
import {capabilities} from '../../../../../lib/contracts/capabilities';
import {resolveMerchantCampaignEntry,type CampaignEntryClient} from '../../../../../lib/merchants/campaign-entry';

export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function CampaignEntry({params}:{params:Promise<{locale:string;campaignId:string}>}){
 const{locale,campaignId}=await params;
 if(!['en','zh-HK'].includes(locale)||capabilities(process.env).merchant.mode!=='connected')notFound();
 const actor=await currentActor();
 if(!actor)redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/merchant/campaigns/${campaignId}`)}`);
 // Narrow the generated schema client at this boundary; every returned value is validated by the resolver.
 const entry=await resolveMerchantCampaignEntry(await serverClient() as unknown as CampaignEntryClient|null,actor.id,campaignId);
 if(!entry)notFound();
 redirect(`/${locale}/merchant?${new URLSearchParams({company:entry.merchantId,campaign:entry.campaignId})}`);
}
