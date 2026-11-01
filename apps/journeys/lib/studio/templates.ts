import type {TemplateId,StudioTopic} from './contracts';
export type TaskTemplate={id:TemplateId;role:'traveller'|'creator'|'merchant'|'ops';topic:StudioTopic;title:string;en:string;inputs:string;permission:string;output:string;destination:string;difficulty:'入門'|'進階';minutes:string};
type Row=[TemplateId,string,string,string,string,string,string,'入門'|'進階',string];
const groups:{role:TaskTemplate['role'];topic:StudioTopic;rows:Row[]}[]=[
 {role:'traveller',topic:'travel',rows:[
 ['T1','規劃我的行程','Plan my trip','目的地、日期、偏好、已選攻略','訪客可預覽；保存需本人行程權限','可採納日程提案','trip-planner','入門','5–10 分鐘'],
 ['T2','把收藏 guide 變成我的行程','Adopt a saved guide','收藏、特定攻略版本、目的行程','本人收藏／行程及可採用版本','保留作者及版本的採用預覽','saved','入門','3–5 分鐘'],
 ['T3','分享行程，隨時撤回','Share or revoke a trip','自己的行程、已選公開欄位','本人分享權限及每項來源用途','公開投影及原分享收據','trips','入門','3–5 分鐘'],
 ['T4','整理我的收藏','Organize saved guides','自己的收藏、公開攻略','本人收藏權限','整理建議；未支援分類留在私人 brief','saved','入門','3 分鐘'],
 ['T5','留住旅途片刻','Record a moment','原創筆記、自己照片、行程','本人行程／私人媒體權限','筆記與照片描述','record','入門','5 分鐘'],
 ]},
 {role:'creator',topic:'creation',rows:[
 ['C1','撰寫 guide brief','Write a guide brief','原創筆記、自己照片說明、已選來源','私人保存需登入；交接需有效創作者','有證據的私人 brief → 原攻略草稿','studio/guides','入門','8 分鐘'],
 ['C2','發佈前檢查','Check before publishing','已保存草稿、版本及權利聲明','本人攻略及創作者權限','缺項清單；不是發布批准','studio/guides','進階','5 分鐘'],
 ['C3','成效檢討','Review performance','本人收益與合作；自選平台訊號','本人創作者資料；外部訊號另授權','含期間、平台、來源與缺口的私人報告','studio/earnings','入門','10 分鐘'],
 ['C4','回應修訂與交付','Respond to revisions','本人合作、修訂要求及交付證據','已接受的合作參與者及原提交權限','修訂草稿 → 原交付及審核','studio/missions','進階','8 分鐘'],
 ['C5','更新攻略版本','Update a guide version','本人攻略、目前版本、新原創內容','攻略擁有人及創作者權限','差異預覽 → 新的不可變發布版本','studio/guides','進階','8–12 分鐘'],
 ]},
 {role:'merchant',topic:'merchant',rows:[
 ['M1','更新商戶資料','Update business details','公司資料、地址、時間、原創文案','指定公司有效 owner 權限','欄位差異 → 原商戶資料','merchant/profile','入門','5 分鐘'],
 ['M2','處理查詢','Handle enquiries','原收件匣／支援個案','指定個案權限；外部讀取／發送分開','回覆草稿 → 原個案','support','入門','3–5 分鐘'],
 ['M3','製作活動素材','Prepare campaign material','活動、授權圖片及品牌文字','指定公司 owner／marketing','素材 brief → 原活動草稿','merchant/missions','入門','8 分鐘'],
 ['M4','檢查合作 brief','Check a collaboration brief','活動、里程碑、日期、條件','原活動編輯及發布權限','缺項及發布摘要 → 原活動','merchant/missions','進階','6 分鐘'],
 ['M5','檢討活動成果','Review campaign results','原報表／CSV、已授權自有訊號','指定公司有效 owner 報表權限','含分母、期間、幣別及來源的報告','merchants/dashboard/insights','進階','10 分鐘'],
 ]},
 {role:'ops',topic:'review',rows:[
 ['O1','整理審核佇列','Review the queue','原佇列、篩選及指派','資料庫 Ops 及原物件範圍','排序建議 → 原佇列','ops','進階','5 分鐘'],
 ['O2','追蹤異常','Investigate an anomaly','任務狀態、遮蔽收據及 runbook','Ops；不包含私人憑證','分流摘要 → 原監察／支援','ops/monitoring','進階','8 分鐘'],
 ['O3','發佈檢查','Check a release','指定版本、CI、權利及恢復證據','Ops 讀取；發布另行授權','GO/NO_GO 建議；不是部署操作','ops/reports','進階','8 分鐘'],
 ['O4','支援交班','Hand off a support case','指定個案、內部原因及負責人','原個案及指派權限','內部交班與客戶草稿分開','ops/support','入門','5 分鐘'],
 ['O5','查核通知結果','Check notification results','指定請求、通知及收件證據','Ops 及限定事件範圍','已確認／失敗／未知時間線','inbox','進階','6 分鐘'],
 ]},
];
export const templates:TaskTemplate[]=groups.flatMap(g=>g.rows.map(([id,title,en,inputs,permission,output,destination,difficulty,minutes])=>({id,title,en,inputs,permission,output,destination,difficulty,minutes,role:g.role,topic:g.topic})));
export const templateById=(id:string)=>templates.find(t=>t.id===id)??templates.find(t=>t.id==='C1')!;
export function suggestTemplates(question:string):{ids:TemplateId[];needsClarification:boolean}{
 const matches:TemplateId[]=[];
 if(/guide|攻略|寫|創作|publish|brief/i.test(question))matches.push('C1');
 if(/行程|目的地|旅行|trip|travel/i.test(question))matches.push('T1');
 if(/商戶|店舖|店鋪|活動素材|business|merchant/i.test(question))matches.push('M1');
 return{ids:matches.length?matches:['C1','T1','M1'],needsClarification:matches.length!==1};
}
