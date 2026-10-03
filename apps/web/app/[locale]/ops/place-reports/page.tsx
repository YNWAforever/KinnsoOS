import Link from 'next/link'
import {notFound} from 'next/navigation'
import {revalidatePath} from 'next/cache'
import {createSupabaseServerClient} from '@/lib/supabase/server'
import {requireOpsPage} from '@/lib/admin/guard'
import {isLocale} from '@/lib/i18n/config'
import {noindexMetadata} from '@/lib/seo/metadata'
export const metadata=noindexMetadata()
type Report={id:string;placeId:string;reason:string;status:string;createdAt:string}
export default async function PlaceReports({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{after?:string;afterId?:string}>}){
 const {locale}=await params;if(!isLocale(locale))notFound()
 const client=await createSupabaseServerClient();await requireOpsPage(client,locale)
 const {after,afterId}=await searchParams
 const result=await client.rpc('list_kinnso_place_reports',{p_after:after??null,p_after_id:afterId??null});if(result.error)throw new Error('Report queue unavailable')
 const loc=locale, reports=result.data as unknown as Report[],zh=locale.startsWith('zh')
 async function review(form:FormData){'use server';const current=await createSupabaseServerClient();await requireOpsPage(current,loc);const saved=await current.rpc('review_kinnso_place_report',{p_report_id:String(form.get('reportId')),p_status:String(form.get('status')),p_reason:String(form.get('reason'))});if(saved.error)throw new Error('Report review was not saved');revalidatePath(`/${loc}/ops/place-reports`)}
 const last=reports.at(-1)
 return <main className="p-6"><h1>{zh?'地點資料回報':'Place correction reports'}</h1><p>{zh?'覆核須有理由，不會自動修改私人行程。':'Review requires a reason and does not automatically change private itineraries.'}</p>{reports.map(row=><article key={row.id}><h2>{row.placeId}</h2><p>{row.reason}</p><p>{row.status}</p><form action={review}><input type="hidden" name="reportId" value={row.id}/><label>{zh?'處理狀態':'Review status'}<select name="status"><option value="reviewed">{zh?'已覆核':'Reviewed'}</option><option value="resolved">{zh?'已解決':'Resolved'}</option></select></label><label>{zh?'覆核理由':'Review reason'}<textarea name="reason" required minLength={10} maxLength={2000}/></label><button type="submit">{zh?'保存覆核':'Save review'}</button></form></article>)}{last&&reports.length===50&&<Link href={`/${locale}/ops/place-reports?after=${encodeURIComponent(last.createdAt)}&afterId=${last.id}`}>{zh?'下一頁':'Next page'}</Link>}</main>
}
