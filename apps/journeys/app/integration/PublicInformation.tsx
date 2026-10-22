"use client";
import Link from "next/link";
import { useApp } from "../travel/ui";

/** Public information must never inherit the demo's data or transaction claims. */
export function PublicInformation({ path, merchantEnabled = false, supportEnabled = false }: {
  path: string; merchantEnabled?: boolean; supportEnabled?: boolean;
}) {
  const { locale, t } = useApp();
  const href = (route: string) => `/${locale}/${route}`;
  if (path === "credits") return (
    <div className="k-page k-prose">
      <h1>{t("Credits & source", "來源及授權")}</h1>
      <h2>AdventureLog</h2>
      <p>Map conversion adapted from AdventureLog. Copyright © 2023–2026 Sean Morley. Modified 10 September 2026. This covered application is distributed under GPL v3, without warranty.</p>
      <div className="k-actions">
        <a className="k-btn" href="/licenses/GPL-3.0.txt" download="GPL-3.0.txt">GNU GPL v3</a>
        <a className="k-btn" href="/source/kinnsoos-source.zip" download="kinnsoos-source.zip">{t("Download corresponding source", "下載對應原始碼")}</a>
      </div>
      <h2>{t("Photography", "攝影")}</h2>
      <p>Kyoto: Nakaharu Line / Unsplash. Tokyo: Vinh Nguyen / Unsplash. Hong Kong, Lisbon, Seoul and Singapore photography reused from the original Kinnso Site.</p>
      <a href="https://unsplash.com/photos/people-walking-on-pathway-between-trees-during-daytime-6Q4-jOZxhM4" target="_blank" rel="noreferrer">{t("Kyoto photo and licence", "京都照片及授權")} ↗</a>
      <h2>{t("Places & maps", "地點及地圖")}</h2>
      <p>© OpenStreetMap contributors.</p>
      <p>{t("Sample demo coordinates are approximate. Check opening hours, prices and availability with the provider before you travel.", "示範座標僅供參考。出發前請向服務提供者核實營業時間、價格及供應情況。")}</p>
    </div>
  );
  if (path === "legal/privacy") return (
    <div className="k-page k-prose">
      <h1>{t("Privacy information", "私隱資訊")}</h1>
      <p className="os-note" role="status">{t("The full privacy notice and a dedicated privacy-request contact are not yet published on this site. This page is a service information notice, not a complete privacy policy.", "本網站尚未刊載完整私隱政策及專門處理私隱要求的聯絡方式。本頁提供服務資訊，並非完整私隱政策。")}</p>
      <h2>{t("Account services and public content", "帳戶服務及公開內容")}</h2>
      <p>{t("When an account service is connected, it can read and save data on Kinnso's backend. Account data is not limited to this browser. Published guides and public creator profiles can be viewed by other visitors.", "已接通的帳戶服務會在 Kinnso 後端讀取及儲存資料，帳戶資料並非只存於這個瀏覽器。已發布攻略及公開創作者檔案可供其他訪客瀏覽。")}</p>
      <h2>{t("Sample demos", "示範版")}</h2>
      <p>{t("Routes labelled Demo use sample data and local browser storage. A demo profile does not grant access to an account or a company.", "標示為示範的頁面使用樣本資料及瀏覽器本機儲存。示範身份不會授予帳戶或公司存取權。")}</p>
      <Link className="k-btn" href={href("help")}>{t("Help & support", "支援與協助")}</Link>
    </div>
  );
  if (path === "for-business") return (
    <div className="k-page k-prose">
      <h1>{t("Work with Kinnso", "與 Kinnso 合作")}</h1>
      <p>{t("Use the merchant workspace to apply for a company workspace, manage your team and follow creator collaborations when the service is enabled. Access depends on your account and company membership.", "商戶服務啟用後，可透過商戶工作區申請公司工作區、管理團隊及跟進創作者合作。存取權限取決於你的帳戶及公司成員資格。")}</p>
      <p role="status">{merchantEnabled ? t("Merchant service enabled · sign in to check your access.", "商戶服務已啟用，請登入核對存取權限。") : t("Merchant service is not connected yet.", "商戶服務尚未接通。")}</p>
      <p>{t("Booking, payments and automatic payouts are not available here. Demo earnings and redemptions are sample records.", "本網站目前未提供訂位、付款及自動出款。示範收益及核銷均為樣本紀錄。")}</p>
      <div className="k-actions">
        <Link className="k-btn primary" href={href("merchant")}>{t("Merchant workspace", "商戶工作區")}</Link>
        <Link className="k-btn" href={`/${locale}/demo/merchants/dashboard`}>{t("Open sample demo", "開啟示範版")}</Link>
      </div>
    </div>
  );
  return (
    <div className="k-page k-prose">
      <h1>{t("Help & support", "支援與協助")}</h1>
      <h2>{t("Find the right workspace", "找到合適的工作區")}</h2>
      <p>{t("Browse published guides without signing in. Private trips, creator work and merchant records require the relevant service and account access. Signing in cannot enable a service that is not connected yet.", "毋須登入即可瀏覽已發布攻略。私人行程、創作者工作及商戶紀錄需要相應服務及帳戶權限；登入並不能啟用尚未接通的服務。")}</p>
      <div className="k-actions">
        <Link className="k-btn" href={href("explore")}>{t("Explore guides", "探索攻略")}</Link>
        <Link className="k-btn" href={href("workspace")}>{t("Workspace directory", "工作區導覽")}</Link>
        <Link className="k-btn" href={href("forgot-password")}>{t("Reset your password", "重設密碼")}</Link>
      </div>
      <h2>{t("Support requests", "支援要求")}</h2>
      {supportEnabled ? <><p>{t("Sign in to open or follow your support requests.", "登入後可提交或跟進支援要求。")}</p><Link className="k-btn" href={href("support")}>{t("Open support requests", "開啟支援要求")}</Link></> : <p role="status">{t("Support requests are not connected yet. You can still browse guides and check workspace availability.", "支援要求服務尚未接通。你仍可瀏覽攻略及查看工作區啟用狀態。")}</p>}
      <p>{t("For an existing booking, contact the provider that issued your confirmation. This site does not accept bookings or payments.", "如需跟進已有訂位，請聯絡發出確認的服務提供者。本網站目前不接受訂位或付款。")}</p>
    </div>
  );
}
