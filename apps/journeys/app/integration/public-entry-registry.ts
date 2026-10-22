/** Public navigation only: configuration is never account/company permission. */
export type EntryLocale = 'en' | 'zh-HK';
export type EntryCapabilities = {creator:boolean;merchant:boolean;support:boolean};
type Text = readonly [en:string,zh:string];
type Definition = {title:Text;body:readonly Text[];service?:keyof EntryCapabilities;target?:string;label?:Text;unavailable?:boolean;demo?:string};
export type PublicEntryView = {
 kind:'information'|'workspace-link'|'unavailable';title:string;bodyKey:string;body:string[];notice:string|null;
 primary:{label:string;href:string};secondary?:{label:string;href:string};
};
// A literal allowlist keeps route recognition independent of the lazy content chunk.
export const PUBLIC_ENTRY_PATHS = [
 'about','contact','help','booking-support','creator-stories','how-kinnso-works','credits',
 'for-creators','for-creators/apply','for-creators/host-an-experience','for-creators/how-it-works','for-creators/earnings','for-creators/quality-standards',
 'for-business','for-business/work-with-creators','for-business/post-a-mission','for-business/list-an-experience','for-business/ticketing','for-business/merchant-offers','for-business/attribution','for-business/pricing','for-business/case-studies','for-business/contact',
 'legal/booking-terms','legal/creator-terms','legal/merchant-terms','legal/refund-policy','legal/privacy','legal/traveller-terms','legal/payment-handling',
 'experiences','tickets','events','gift-cards','creators','articles','sessions','merchants',
 'missions','receipts','studio/offers','studio/receipts','bookings','ticket-wallet','offers/demo-offer-hk','demo-lab',
] as const;
export type PublicEntryPath = typeof PUBLIC_ENTRY_PATHS[number];
export function isPublicEntryPath(path:string):path is PublicEntryPath {
 return PUBLIC_ENTRY_PATHS.some(entry=>entry===path);
}
const workspace:Text=['Workspace directory','工作區導覽'];
const creator:Text=['Creator workspace','創作者工作區'];
const merchant:Text=['Merchant workspace','商戶工作區'];
const support:Text=['Open support requests','開啟支援要求'];
const unavailable:Text=['This service is not available here. Browse published guides or check the workspace directory for available services.','本網站目前未提供這項服務。你可瀏覽已發布攻略，或在工作區導覽查看可用服務。'];
const commerce:Text=['This site does not accept bookings or payments, issue tickets, or make automatic payouts. For an existing purchase, contact the provider that issued your confirmation.','本網站目前不接受訂位或付款、不發出門票，亦不自動出款。已有購買紀錄請向發出確認的服務提供者查詢。'];
const policy:Text=['Approved full terms for this service are not published here. This information is not a contract, refund promise or payment authorisation.','本網站尚未刊載這項服務的完整核准條款。本資訊不是合約、退款承諾或付款授權。'];
const creatorFlow:Text=['Use the creator workspace to complete onboarding, edit guides, check publication readiness and follow collaborations. Publishing requires your explicit action and the relevant account access.','透過創作者工作區完成初始設定、編輯攻略、檢查發布條件及跟進合作。發布需要你明確操作，並具備相應帳戶權限。'];
const merchantFlow:Text=['Apply for a company workspace, then use your authorised company role to prepare briefs, review applications and follow delivery. Service configuration does not grant company membership.','先申請公司工作區，再按獲授權的公司角色準備合作簡介、審閱申請及跟進交付。服務配置不會授予公司成員資格。'];
const definitions:Record<PublicEntryPath,Definition>={
 'about':{title:['About Kinnso Journeys','關於 Kinnso Journeys'],body:[['Discover published guides, explicitly adopt a structured version into your private trip, and keep your own notes. Creator and merchant workspaces support the collaboration workflow when connected.','探索已發布攻略，明確採用結構化版本成為私人行程，並保存自己的筆記。已接通的創作者及商戶工作區提供合作流程。']]},
 'how-kinnso-works':{title:['How Kinnso works','Kinnso 如何運作'],body:[['Browse a guide → check its source and version → preview a structured itinerary → choose your private trip → confirm adoption. Summary guides are reading material and cannot be adopted as an itinerary.','瀏覽攻略 → 核對來源及版本 → 預覽結構化行程 → 選擇私人行程 → 確認採用。摘要攻略供閱讀，不能當作行程採用。'],['Your private notes and photos stay separate from published author content. Saving, sharing and creator collaboration require the corresponding connected service and account access.','私人筆記及照片與作者公開內容分開。保存、分享及創作者合作需要相應服務已接通及帳戶權限。']]},
 'contact':{title:['Contact and support','聯絡與支援'],body:[['A dedicated public contact and privacy-request channel have not yet been published. Do not send private evidence through demo pages. If support is connected, use your account support workspace.','專門的公開聯絡及私隱要求渠道尚未刊載。請勿透過示範頁提供私人證明。如支援服務已接通，請使用帳戶支援工作區。']],service:'support',target:'support',label:support},
 'help':{title:['Help & support','支援與協助'],body:[]},
 'credits':{title:['Credits & source','來源及授權'],body:[]},
 'booking-support':{title:['Help with an existing booking','已有訂位的支援'],body:[commerce,['Use the provider and reference on your original confirmation. Kinnso support cannot promise a refund or change a provider booking.','請使用原有確認中的服務提供者及參考編號。Kinnso 支援不能承諾退款或更改提供者的訂位。']],unavailable:true},
 'creator-stories':{title:['Creator stories','創作者故事'],body:[['No consented creator case studies are published on this page yet. Read published guides and their author credits; sample profiles are not customer testimonials.','本頁暫未刊載獲同意的創作者案例。你可閱讀已發布攻略及作者資料；示範檔案不是客戶見證。']],unavailable:true},
 'for-creators':{title:['Create with Kinnso','與 Kinnso 一起創作'],body:[creatorFlow],service:'creator',target:'studio',label:creator},
 'for-creators/apply':{title:['Start as a creator','開始成為創作者'],body:[creatorFlow,['Complete the existing onboarding in your workspace. Opening this page does not submit an application or approve an account.','請在工作區完成現有初始設定。開啟本頁不會提交申請或核准帳戶。']],service:'creator',target:'studio',label:creator},
 'for-creators/how-it-works':{title:['How creator collaboration works','創作者合作流程'],body:[['Read the brief and deadlines → apply or accept an invitation → submit evidence for the selected milestone → respond to revision feedback → read the review result. Approval confirms delivery; it is not payment.','閱讀合作簡介及期限 → 申請或接受邀請 → 按所選里程碑提交證明 → 回應修訂意見 → 查看審核結果。核准代表交付獲接納，不等於付款。']],service:'creator',target:'studio/missions',label:['Creator collaborations','創作者合作']},
 'for-creators/earnings':{title:['Understanding creator earnings','了解創作者收益'],body:[['Tracked activity, settlement records and historical payout batches are separate. Amounts are shown per currency. Approval does not create a payment, and this site does not enable withdrawals or automatic payouts.','追蹤活動、結算紀錄及歷史付款批次分開呈現，金額逐幣別列出。核准不會建立付款；本網站不提供提款或自動出款。']],service:'creator',target:'studio/earnings',label:['Earnings records','收益紀錄']},
 'for-creators/quality-standards':{title:['Creator quality standards','創作者內容準則'],body:[['Check that your structured guide has usable days and stops, accurate source credits and image rights. Review the existing publication-readiness checks before publishing.','請確認結構化攻略有可用的日程及站點、正確來源及圖片權利，並在發布前核對現有發布條件檢查。'],['A publication date is not a place-verification date. Missing opening hours, prices, source language or verification dates remain unknown. Author content is not automatically translated.','發布日期不等於地點查核日期。缺少的營業時間、價格、原文語言或查核日期維持未知；作者內容不會自動翻譯。']],service:'creator',target:'studio/guides',label:['Your guides','你的攻略']},
 'for-creators/host-an-experience':{title:['Hosting experiences','提供旅遊體驗'],body:[commerce,['Experience hosting and booking are not available in this phase. You can create guides or follow existing collaborations in the creator workspace.','本階段未提供體驗供應及訂位。你可在創作者工作區編寫攻略或跟進既有合作。']],unavailable:true},
 'for-business':{title:['Work with Kinnso','與 Kinnso 合作'],body:[merchantFlow],service:'merchant',target:'merchant',label:merchant},
 'for-business/work-with-creators':{title:['Work with creators','與創作者合作'],body:[merchantFlow,['Review the brief, deliverables and schedule with the creator. Review feedback and approved delivery remain recorded; approval is not a payout.','請與創作者核對簡介、交付內容及時間。審核意見及獲接納的交付會保留紀錄；核准不等於出款。']],service:'merchant',target:'merchant',label:merchant},
 'for-business/post-a-mission':{title:['Prepare a collaboration brief','準備合作簡介'],body:[['Prepare requirements, deliverables, milestones and the schedule time zone in your company workspace. Check the publication summary before explicitly publishing. The server checks your role and current revision.','請在公司工作區準備要求、交付內容、里程碑及時間表時區，核對發布摘要後明確發布。伺服器會檢查角色及目前版本。']],service:'merchant',target:'merchant',label:merchant},
 'for-business/attribution':{title:['Understanding collaboration results','了解合作成果'],body:[['Insights distinguish current snapshots from events in a selected period. Check the company, time window, as-of time, coverage and numerator/denominator. Unavailable attribution stays unknown; approvals and redemptions do not prove revenue or causal ROI.','成果資料會區分目前快照及所選期間事件。請核對公司、時間範圍、截至時間、涵蓋範圍及分子／分母。缺少歸因維持未知；核准或核銷不代表收入或因果 ROI。']],service:'merchant',target:'merchant',label:merchant},
 'for-business/contact':{title:['Business support','商戶支援'],body:[['Use the connected support workspace for a specific company or collaboration reference. A public sales contact is not published here yet.','請使用已接通的支援工作區，提供具體公司或合作參考編號。本頁尚未刊載公開銷售聯絡方式。']],service:'support',target:'support',label:support},
 'for-business/pricing':{title:['Business pricing','商戶收費資訊'],body:[['Approved pricing and commercial terms are not published here. No price, free plan, trial or purchase is offered by this page.','本頁尚未刊載核准收費及商業條款，亦不提供價格、免費方案、試用或購買。']],unavailable:true},
 'for-business/case-studies':{title:['Business case studies','商戶案例'],body:[['No verified, consented business case studies are published here yet. Demo earnings, conversions and sample companies are not evidence of customer results.','本頁暫未刊載經核實及獲同意的商戶案例。示範收益、轉化及樣本公司不代表客戶成果。']],unavailable:true},
 'for-business/list-an-experience':{title:['Experience listings','體驗上架'],body:[commerce,unavailable],unavailable:true},
 'for-business/ticketing':{title:['Business ticketing','商戶票務'],body:[commerce,unavailable],unavailable:true},
 'for-business/merchant-offers':{title:['Merchant offers','商戶優惠'],body:[['Existing company access controls govern redemption records. This public page does not create offers, sell vouchers or accept payment. Check the merchant workspace for your authorised tools.','既有公司權限控制核銷紀錄。本公開頁不會建立優惠、售賣禮券或接受付款；請在商戶工作區查看獲授權工具。']],service:'merchant',target:'merchant',label:merchant},
 'legal/privacy':{title:['Privacy information','私隱資訊'],body:[]},
 'legal/booking-terms':{title:['Booking terms','訂位條款'],body:[policy,commerce],unavailable:true},
 'legal/creator-terms':{title:['Creator terms information','創作者條款資訊'],body:[policy,['Published collaboration requirements and current account permissions still apply to existing workflows. This page does not add new commercial terms.','既有流程仍須遵守已發布合作要求及目前帳戶權限。本頁不會新增商業條款。']],unavailable:true},
 'legal/merchant-terms':{title:['Merchant terms information','商戶條款資訊'],body:[policy],unavailable:true},
 'legal/refund-policy':{title:['Refund information','退款資訊'],body:[policy,commerce],unavailable:true},
 'legal/traveller-terms':{title:['Traveller terms information','旅客條款資訊'],body:[policy,['Check guide sources and current provider information before travel. A saved guide is not a reservation or a guarantee of availability.','出發前請核對攻略來源及提供者最新資訊。保存攻略不等於訂位或供應保證。']],unavailable:true},
 'legal/payment-handling':{title:['Payment handling information','付款處理資訊'],body:[policy,commerce],unavailable:true},
 'experiences':{title:['Experience availability','體驗服務狀態'],body:[commerce],unavailable:true},
 'tickets':{title:['Tickets','門票'],body:[commerce],unavailable:true},
 'events':{title:['Events','活動'],body:[['Event booking is not connected here. Published guides may describe events; check dates, admission and availability with the event provider.','本網站尚未接通活動訂位。已發布攻略可能介紹活動；日期、入場要求及供應請向活動提供者核實。']],unavailable:true},
 'gift-cards':{title:['Gift cards','禮品卡'],body:[commerce],unavailable:true},
 'creators':{title:['Find published creators','尋找已發布的創作者'],body:[['Find author credits and public profiles through published guides. Demo creator profiles are sample data. This page does not expose private applications or contact details.','可透過已發布攻略查看作者資料及公開檔案。示範創作者檔案屬樣本資料；本頁不公開私人申請或聯絡資料。']]},
 'articles':{title:['Articles and travel reading','文章及旅遊閱讀'],body:[['Explore published travel content and follow its source. Article text is not a structured itinerary and is not automatically adopted into a trip.','探索已發布旅遊內容並查看來源。文章文字不等於結構化行程，亦不會自動採用到行程。']]},
 'sessions':{title:['Travel sessions','旅遊活動場次'],body:[commerce],unavailable:true},
 'merchants':{title:['Merchant participation','商戶參與'],body:[merchantFlow],service:'merchant',target:'merchant',label:merchant},
 'missions':{title:['Creator collaborations','創作者合作'],body:[creatorFlow],service:'creator',target:'studio/missions',label:['Creator collaborations','創作者合作']},
 'receipts':{title:['Collaboration records','合作紀錄'],body:[['Review submissions and feedback in your creator collaborations. A submission approval is not a payment receipt.','請在創作者合作查看交付及審核意見。交付核准不等於付款收據。']],service:'creator',target:'studio/outcomes',label:['My collaborations','我的合作']},
 'studio/receipts':{title:['Creator delivery records','創作者交付紀錄'],body:[['Delivery evidence and review history are in your collaborations. This page does not issue payment receipts.','交付證明及審核紀錄在你的合作內。本頁不發出付款收據。']],service:'creator',target:'studio/outcomes',label:['My collaborations','我的合作']},
 'studio/offers':{title:['Creator offers','創作者優惠'],body:[commerce],unavailable:true},
 'bookings':{title:['Booking availability','訂位服務狀態'],body:[commerce],unavailable:true},
 'ticket-wallet':{title:['Ticket wallet availability','票夾服務狀態'],body:[commerce],unavailable:true},
 'offers/demo-offer-hk':{title:['Sample offer information','示範優惠資訊'],body:[['This offer is sample data. Open the explicitly labelled demo to inspect its layout; it cannot create a real booking, redemption or payment.','此優惠屬樣本資料。你可開啟明示的示範版查看版面；它不能建立真實訂位、核銷或付款。']],unavailable:true,demo:'offers/demo-offer-hk'},
 'demo-lab':{title:['Explore sample workspaces','探索示範工作區'],body:[['Demo routes use sample data and local browser storage. A demo identity grants no account, company or operations permission.','示範路徑使用樣本資料及瀏覽器本機儲存。示範身份不會授予帳戶、公司或營運權限。']],demo:'demo-lab'},
};
export function resolvePublicEntry(path:string,locale:EntryLocale,enabled:EntryCapabilities):PublicEntryView|null {
 if(!isPublicEntryPath(path))return null;
 const definition=definitions[path],text=(value:Text)=>value[locale==='en'?0:1];
 const connected=definition.service?enabled[definition.service]:false;
 const href=(route:string)=>`/${locale}/${route}`;
 const notice=definition.service?connected
  ?text(['Service enabled. The workspace checks your account and, where needed, company permission.','服務已啟用。工作區會核對帳戶及所需公司權限。'])
  :text(['This service is not connected yet. Signing in cannot enable it.','這項服務尚未接通，登入不能啟用服務。']):null;
 return {kind:definition.unavailable||definition.service&&!connected?'unavailable':connected?'workspace-link':'information',
  title:text(definition.title),bodyKey:path,body:definition.body.map(text),notice,
  primary:connected&&definition.target?{label:text(definition.label??workspace),href:href(definition.target)}:{label:text(['Explore guides','探索攻略']),href:href('explore')},
  secondary:definition.demo?{label:text(['Open sample demo','開啟示範版']),href:href(`demo/${definition.demo}`)}:{label:text(workspace),href:href('workspace')},
 };
}
