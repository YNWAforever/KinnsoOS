'use client';
import Link from 'next/link';
import {useApp} from '../travel/ui';
export function ConnectionsPage({discoveryEnabled=false}:{discoveryEnabled?:boolean}={}){
 const {t,href}=useApp();
 const candidates=[['SMEAssistant','商戶優惠與來源版本；六個唯讀工具的本機替身'],['Firecrawl','選定公開頁面的證據'],['Search Console','自己網站的搜尋訊號'],['Google Drive','自己明選的文件'],['Google Calendar','選定日曆及時段'],['Gmail','選定郵件，唯讀'],['Instagram','自有內容與成效；創作者／商戶'],['TikTok','創作者自有內容'],['YouTube','創作者自有內容'],['Telegram','獲授權的指定頻道'],['WhatsApp Business','商戶指定對話']];
 return <section className="cs-content"><p className="cs-eyebrow">{t('Optional skills','選擇想解鎖的技能')}</p><h1>{t('Connected accounts','已連接帳號')}</h1><p>{t('These connections are not available yet. Keep working with your own manual documents.','以下連接尚未開放；你仍可使用手動文件及基本範本。')}</p><Link className="k-btn" href={href('workroom/documents')}>{t('Use manual documents','使用手動文件')}</Link>{discoveryEnabled&&<Link className="k-btn" href={href('merchant/offer-discovery')}>管理 SMEAssistant 示例範圍、核對時間及撤銷</Link>}<div className="cs-template-grid">{candidates.map(([name,purpose])=><article key={name} className="cs-card"><span className="cs-chip">未連接 · 未驗證</span><h2>{name}</h2><p>{purpose}</p><dl><dt>授權範圍</dt><dd>未授權</dd><dt>最後同步</dt><dd>未同步</dd></dl><p className="cs-note">連接資格與權限待驗證</p></article>)}</div></section>;
}
