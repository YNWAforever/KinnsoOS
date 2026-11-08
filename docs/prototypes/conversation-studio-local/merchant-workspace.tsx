// Preview navigation only: reuse the existing profile, campaign, case and report screens.
import {useEffect,useState} from 'react';
import {merchants,type Membership} from '../../../apps/journeys/lib/merchants/repository';
import {MerchantProfile} from '../../../apps/journeys/app/travel/MerchantProfile';
import {MerchantCampaigns} from '../../../apps/journeys/app/travel/MerchantCampaigns';
import {MerchantInsights} from '../../../apps/journeys/app/travel/MerchantInsights';
import {SupportWorkspace,InboxWorkspace} from '../../../apps/journeys/app/travel/InboxWorkspace';
import {UnsavedDraftNavigationProvider} from '../../../apps/journeys/app/travel/UnsavedDraftGuard';
const noop=()=>{},changed=async()=>{};
export function ExampleMerchantWorkspace({path,actorId,company}:{path:string;actorId:string;company:string}){
 const [members,setMembers]=useState<Membership[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;void merchants.memberships().then(r=>{if(!active)return;if(r.ok)setMembers(r.data);else setError('未能核對公司權限。');});return()=>{active=false;};},[]);
 const selected=members.find(m=>m.merchantId===company)??(!company?members[0]:undefined),id=selected?.merchantId;
 if(path==='support'||path==='inbox')return <UnsavedDraftNavigationProvider>{path==='support'?<SupportWorkspace actorId={actorId} enabled/>:<InboxWorkspace actorId={actorId} enabled/>}</UnsavedDraftNavigationProvider>;
 return <section className="cs-card mt-flow"><h1>原有商戶流程 · 本機示例</h1><p>以下使用原商戶畫面與資料格式。只有本次示例的檔案、活動、個案及彙總資料可操作。</p>{error&&<p role="alert">{error}</p>}<label>目前公司<select aria-label="原流程目前公司" value={id??''} onChange={e=>window.fixtureNavigate('/zh-HK/'+path+'?company='+e.target.value)}>{members.map(m=><option key={m.merchantId} value={m.merchantId}>{m.name} · {m.role}</option>)}</select></label>{id&&<><nav className="mt-links"><a href={'/zh-HK/merchant/profile?company='+id}>商戶資料</a><a href={'/zh-HK/merchant/missions?company='+id}>活動及合作</a><a href={'/zh-HK/merchants/dashboard/insights?company='+id}>活動成果</a><a href={'/zh-HK/workroom?template=M3&company='+id}>M3 活動素材</a><a href={'/zh-HK/workroom?template=M4&company='+id}>M4 發佈檢查</a></nav>{path==='merchant/profile'?selected.role==='owner'?<MerchantProfile key={id} actorId={actorId} merchantId={id} onLockChange={noop}/>:<p role="alert">此功能需要公司 owner。</p>:path==='merchants/dashboard/insights'?selected.role==='owner'?<MerchantInsights key={id} actorId={actorId} merchantId={id}/>:<p role="alert">此功能需要公司 owner。</p>:['owner','marketing'].includes(selected.role)?<UnsavedDraftNavigationProvider><MerchantCampaigns key={id} actorId={actorId} merchantId={id} refreshKey={0} locked={false} onLockChange={noop} onChanged={changed} onDenied={code=>setError(code)}/></UnsavedDraftNavigationProvider>:<p role="alert">活動編輯需要公司 owner／marketing。</p>}</>}<p>團隊、分店、邀請、人才探索、核銷及歷史財務功能仍保留在原應用；此示例未接駁其資料或寫入。Booking／payment 關閉。</p><a href="/zh-HK/workroom/templates">回到全部範本</a></section>;
}
