export type StudioNav={path:string;en:string;zh:string};
const common:StudioNav[]=[
 {path:'workroom',en:'Conversation studio',zh:'對話工作室'},
 {path:'explore',en:'Explore',zh:'探索'}, {path:'trips',en:'My trips',zh:'我的行程'},
 {path:'saved',en:'Saved guides',zh:'我的收藏'}, {path:'record',en:'Record a moment',zh:'記錄旅程'},
 {path:'studio',en:'Create',zh:'創作'}, {path:'merchant',en:'Merchants',zh:'商戶'},
 {path:'inbox',en:'Inbox',zh:'收件匣'}, {path:'support',en:'Support',zh:'支援'},
 {path:'agent',en:'Existing agent tasks',zh:'既有任務助手'},
 {path:'settings/connections',en:'Connected accounts',zh:'已連接帳號'},
 {path:'workspace',en:'All workspaces',zh:'所有功能'}, {path:'credits',en:'Source and licence',zh:'來源及授權'},
];
/** Discoverability only; the server independently authorizes each command. */
export function getStudioNavigation(actor:{roles:string[]}|null):StudioNav[]{return [...common,...actor?.roles.includes('ops')?[{path:'ops',en:'Operations',zh:'營運工作區'}]:[]];}
export function isStudioRoute(path:string):boolean {
 return ['workroom','workroom/templates','workroom/documents','workroom/merchant-results','workroom/traveller-results','workroom/reports','settings/connections','workroom/discovery','merchant/offer-discovery'].includes(path)||/^workroom\/(?:t|discovery\/intents)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path);
}
