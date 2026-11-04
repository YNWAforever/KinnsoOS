import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {retainGuestQuestionForRoute} from '../../lib/studio/guest-draft';
import {ConversationHome} from '../../app/workroom/ConversationHome';
import {WorkroomShell} from '../../app/workroom/WorkroomShell';
import {StudioCreatorEditor} from '../../app/travel/CreatorWorkspace';
import '../../app/globals.css';
import '../../app/travel/workbench.css';
declare global{interface Window{fixtureNavigate:(url:string)=>void;fixtureActor:string|null;}}
function Fixture(){const [url,setUrl]=useState(location.pathname+location.search);window.fixtureNavigate=(url:string)=>{history.pushState(null,'',url);setUrl(url);};useEffect(()=>{const change=()=>setUrl(location.pathname+location.search);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);const path=url.split('?')[0].replace(/^\/zh-HK\/?/,'');const actorId=window.fixtureActor;useEffect(()=>retainGuestQuestionForRoute(path,actorId),[path,actorId]);return <div className="k-app"><p style={{background:'#fff0b8',padding:'12px',margin:0}}>本機示例測試 · 模擬資料 · 未連接資料庫／AI／外部帳號</p><main>{!path?<ConversationHome actorId={window.fixtureActor}/>:path.startsWith('studio/guides/')?<StudioCreatorEditor key={path} path={path} actorId={window.fixtureActor}/>:<WorkroomShell key={path} path={path} actorId={window.fixtureActor} roles={window.fixtureActor?['creator']:[]} enabled handoffEnabled/>}</main></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
