// Compiled with apps/journeys as resolveDir. Actual product components, demo shell only.
import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ConversationHome} from './app/workroom/ConversationHome';
import {WorkroomShell} from './app/workroom/WorkroomShell';
import {StudioCreatorEditor,CreatorWorkspace} from './app/travel/CreatorWorkspace';
import {CreatorMissionsWorkspace} from './app/travel/CreatorMissionsWorkspace';
import {CreatorEarningsWorkspace} from './app/travel/CreatorEarningsWorkspace';
import {localCreatorReportStore} from '../../docs/prototypes/conversation-studio-local/report-store';
import {localDiscoveryStore} from '../../docs/prototypes/conversation-studio-local/discovery-store';
import {localMerchantStore} from '../../docs/prototypes/conversation-studio-local/merchant-store';
import {ExampleMerchantWorkspace} from '../../docs/prototypes/conversation-studio-local/merchant-workspace';
import {localTravellerStore} from '../../docs/prototypes/conversation-studio-local/traveller-store';
import {TripWorkspace} from './app/travel/TripWorkspace';
import {GuideWorkspace,BookmarkWorkspace} from './app/travel/GuideWorkspace';
import {UnsavedDraftNavigationProvider} from './app/travel/UnsavedDraftGuard';
import {PublicTravellerPreview} from './app/workroom/TravellerTaskFlow';
import './app/globals.css';
import './app/travel/workbench.css';

const actor = '22222222-2222-4222-8222-222222222222';
const notes = [
  {title: 'D1｜海旁散步（示例）', text: '這是一段專為本機預覽編寫的示例筆記：從海旁出發，慢慢步行，找一個位置欣賞海面與城市景色。這不是經實地查證的旅遊建議。'},
  {title: 'D2｜私人備忘（示例）', text: 'PRIVATE_DEMO_NOTE：這段私人備忘只留在 brief，請不要選取它加入公開攻略。沒有真實個人資料。'}
];
function fillField(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  // Commit each controlled input before filling the next field of the same brief.
  flushSync(() => el.dispatchEvent(new Event('input', {bubbles: true})));
}
function App() {
  const [url, setUrl] = useState(location.pathname + location.search);
  const [hint, setHint] = useState('從首頁的「寫 guide」開始。');
  const navigate = (next: string) => {history.pushState(null, '', next); setUrl(next); window.scrollTo(0, 0);};
  window.fixtureNavigate = navigate;
  useEffect(() => {const pop = () => setUrl(location.pathname + location.search); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);}, []);
  const path = url.split('?')[0].replace(/^\/zh-HK\/?/, '');
  const isGuide = /^studio\/guides\/[^/]+\/edit$/.test(path);
  const query=new URLSearchParams(url.split('?')[1]??''),returnTask=query.get('returnTask'),returnReport=query.get('report');
  const isWorkroom = path === 'workroom' || path.startsWith('workroom/') || path === 'settings/connections' || path === 'merchant/offer-discovery';
  function fillNote(index: number) {
    const section = document.querySelector('section[aria-label="選擇文件"]');
    if (!section) {setHint('先按「寫 guide」，再填入示例文件。'); return;}
    fillField(section.querySelector('input:not([type="checkbox"])'), notes[index].title);
    fillField(section.querySelector('textarea'), notes[index].text);
    setHint('已填入示例。勾選模擬的原創聲明，再按「加入文件」；可加入兩份，示範私人資料不公開。');
  }
  function fillBrief() {
    const section = document.querySelector('section[aria-label="Guide brief"]');
    if (!section) {setHint('先選文件、查看證據，再按「另開 brief」。'); return;}
    const inputs = section.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])');
    ['海旁慢步｜示例攻略', '香港（示例）', '用自有示例筆記練習把證據整理成攻略；內容未經實地查證。', '海旁散步（示例站點）'].forEach((value, index) => fillField(inputs[index], value));
    setHint('基本資料已填好。只勾選第一項加入公開預覽，保留 D2 私人，再按「保存私人 brief」。');
  }
  async function reset() {
    if (!window.confirm('清除本機示例進度，回到共用首頁？')) return;
    const response = await fetch('/__preview/reset', {method: 'POST'});
    if (!response.ok) {setHint('未能重設，請稍後再試。'); return;}
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('kinnso.studio.')||key.startsWith('kinnso:unconfirmed-share:')) sessionStorage.removeItem(key);
    window.onbeforeunload = null;
    location.href = '/zh-HK/';
  }
  return <div className="k-app">
    <header className="preview-banner" aria-label="本機預覽狀態">
      <div><strong>本機示例預覽</strong><span> · 模擬旅人、創作者與商戶</span><p>所有「保存／發佈」只在本機記憶體模擬，沒有公開上線。未連接資料庫、AI 或外部帳號；請只用示例文字。</p></div>
      <div className="preview-actions"><a href="/zh-HK/">共用首頁</a><a href="/zh-HK/workroom/discovery">旅程與優惠配對</a><a href="/zh-HK/merchant/offer-discovery">商戶優惠展示</a><a href="/zh-HK/workroom/templates">任務範本</a><a href="/zh-HK/workroom/reports">私人示例成果庫</a><a href="/zh-HK/workroom/traveller-results">旅人 brief 庫</a><a href="/zh-HK/workroom/merchant-results">商戶 brief 庫</a><button onClick={() => void reset()}>重設示例</button></div>
    </header>
    <details className="preview-help" open={!query.get('template')||!/^[TM][1-5]$/.test(query.get('template')??'')}>
      <summary>試走指引與示例文字</summary>
      <p>首頁「寫 guide」 → 加入文件 → 討論已選文件／展開證據 → 另開 brief → 保存私人 brief → 預覽交到 guide → 編輯 → 發佈確認。</p>
      <div className="preview-actions"><button onClick={() => fillNote(0)}>填入示例文件 D1</button><button onClick={() => fillNote(1)}>填入私人示例 D2</button><button onClick={fillBrief}>填入 brief 基本資料</button></div>
      <p role="status">{hint}</p><small>按鈕只填文字，不代替你的來源選擇、保存或發佈確認。C2–C5 可用下列範本；成果保留到本機程序重啟或你重設示例。</small>
      <nav className="preview-actions" aria-label="創作者示例任務">{[['C2','發佈前檢查'],['C3','成效檢討'],['C4','回應修訂與交付'],['C5','更新攻略版本']].map(([id,title])=><a key={id} href={'/zh-HK/workroom?template='+id}>{id} {title}</a>)}</nav>
      <p>C2：補齊缺項後重新檢查；C3：保存含資料缺口的報告；C4：預覽交付後提交待審核；C5：差異預覽後到原編輯器確認發佈。</p>
      <nav className="preview-actions" aria-label="旅人示例任務">{[['T1','規劃行程'],['T2','收藏 guide 轉行程'],['T3','分享與撤回'],['T4','整理收藏'],['T5','旅途片刻']].map(([id,title])=><a key={id} href={'/zh-HK/workroom?template='+id}>{id} {title}</a>)}</nav>
      <p>旅人：選擇資料 → 查看證據 → 私人 brief → 確認存回。T2 先保留作者及版本；T3 逐項選擇公開內容，再試走撤回。T5 只提供固定示例圖。</p>
      <nav className="preview-actions" aria-label="商戶示例任務">{[['M1','更新商戶資料'],['M2','處理查詢'],['M3','活動素材'],['M4','檢查及發佈'],['M5','檢討活動成果']].map(([id,title])=><a key={id} href={'/zh-HK/workroom?template='+id}>{id} {title}</a>)}</nav>
      <p>商戶：選公司 → 讀取證據 → 私人 brief → 核對完整內容 → 存回原流程。WhatsApp／Instagram 只製作草稿，仍未連接。</p>
      {returnTask&&returnReport&&<a href={'/zh-HK/workroom?template='+encodeURIComponent(returnTask)+'&report='+encodeURIComponent(returnReport)}>返回私人報告</a>}
      {isGuide&&<a href={'/zh-HK/studio/guides/'+path.split('/')[2]+'/versions'} style={{marginLeft:12}}>查看版本與採用副本</a>}
    </details>
    <main>{['merchant','merchant/profile','merchant/missions','merchants/dashboard/insights','support','inbox'].includes(path)?<ExampleMerchantWorkspace key={url} path={path} actorId={actor} company={query.get('company')??''}/>:/^s\/[^/]+$/.test(path)?<ExamplePublicShare key={path} token={path.split('/')[1]}/>:path==='trips'||path==='trip-planner'||path==='record'||/^trips\/[^/]+$/.test(path)?<UnsavedDraftNavigationProvider><TripWorkspace key={path} id={path.startsWith('trips/')?path.split('/')[1]:undefined} actorId={actor} sharingEnabled shareRecoveryEnabled/></UnsavedDraftNavigationProvider>:path==='saved'?<BookmarkWorkspace actorId={actor}/>:path.startsWith('g/')?<UnsavedDraftNavigationProvider><GuideWorkspace key={path} id={path.split('/')[1]} actorId={actor}/></UnsavedDraftNavigationProvider>:!path ? <ConversationHome discoveryEnabled/> : isGuide ? <StudioCreatorEditor key={path} path={path} actorId={actor}/> : /^studio\/guides\/[^/]+\/versions$/.test(path)?<ExampleVersions key={path} id={path.split('/')[2]}/>:path==='studio/earnings'?<CreatorEarningsWorkspace actorId={actor} enabled/>:path==='studio/missions'||path.startsWith('studio/missions/')||path==='studio/outcomes'?<CreatorMissionsWorkspace key={path} path={path} actorId={actor} enabled/>:path==='studio'||path==='studio/guides'?<CreatorWorkspace path={path} actorId={actor} enabled/>:isWorkroom ? <WorkroomShell key={url} path={path} actorId={actor} roles={['creator','merchant']} enabled handoffEnabled creatorReportStore={localCreatorReportStore} travellerStore={localTravellerStore} merchantStore={localMerchantStore} discoveryStore={localDiscoveryStore}/> : <section className="cs-card"><h1>此工作區未放進本機示例</h1><p>原有功能仍保留。本次預覽試走創作者 C1–C5、旅人 T1–T5 及商戶 M1–M5，沒有連接真實服務。</p><a href="/zh-HK/">回到共用首頁</a></section>}</main>
  </div>;
}
function ExamplePublicShare({token}:{token:string}) {
 const [data,setData]=useState<any>(null),[status,setStatus]=useState('正在核對示例分享…');
 useEffect(()=>{let active=true;void localTravellerStore.publicRead(location.origin+'/zh-HK/s/'+token).then(r=>{if(!active)return;if(r.ok){setData(r.data);setStatus('唯讀示例分享 · 私人筆記不公開');}else{setData(null);setStatus(r.code==='NOT_FOUND'?'分享已撤回、到期或不存在。':'未能確認分享，請重新載入。');}});return()=>{active=false;};},[token]);
 return <section className="cs-card tt-flow"><h1>唯讀示例行程</h1><p role="status">{status}</p>{data&&<PublicTravellerPreview value={data} mediaBase={'/api/shared-media/'+token+'/'}/>}<a href="/zh-HK/">回到共用首頁</a></section>;
}
function ExampleVersions({id}:{id:string}) {
 const [data,setData]=useState<any>(null);
 useEffect(()=>{let active=true;void fetch('/__preview/versions/'+id).then(r=>r.json()).then(r=>{if(active&&r.ok)setData(r.data);});return()=>{active=false;};},[id]);
 return <section className="cs-card"><h1>示例攻略版本與採用副本</h1><p>每次發佈另存快照，旅人已採用副本不會跟著改變。以下全是本機示例。</p>{data?.items.map((v:any)=><article className="ct-evidence" key={v.version}><h2>發佈版本 v{v.version}</h2><p>{v.title}</p><p>{v.summary}</p></article>)}{data?.adopted?<article className="ct-evidence"><h2>旅人已採用副本 · v{data.adopted.version}</h2><p>{data.adopted.summary}</p></article>:<p>此示例攻略尚未有旅人採用副本。</p>}<a href={'/zh-HK/studio/guides/'+id+'/edit'}>返回既有編輯器</a></section>;
}
// Remove the previous preview's native cache before mounting any original editor.
// New editor recovery is served from session memory via the build-time adapter.
async function startPreview(){
 await new Promise<void>((resolve,reject)=>{const request=indexedDB.deleteDatabase('kinnso_account_cache_v1');request.onsuccess=()=>resolve();request.onerror=()=>reject(Error('未能清除舊示例暫存。'));request.onblocked=()=>reject(Error('請關閉舊預覽分頁，再重新整理以清除示例暫存。'));});
 createRoot(document.getElementById('root')!).render(<App/>);
}
void startPreview().catch(error=>{document.getElementById('root')!.textContent=error.message;});
