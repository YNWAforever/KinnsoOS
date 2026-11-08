"use client";
import Link from "next/link";
import { useApp } from "../travel/ui";
import { canonicalRoot } from "../../lib/canonical";
import type { CapabilityMode } from "../../lib/contracts/capabilities";

type Features = { catalog?: boolean; trips?: boolean; creator?: boolean; merchant?: boolean; ops?: boolean };

export function WorkspacePanel({ features = {}, mode = "unavailable" }: { features?: Features; mode?: CapabilityMode }) {
  const { t, locale } = useApp();
  const root = canonicalRoot(locale);
  const demo = mode === "demo";
  const roles = [
    { key: "creator", label: t("Creator studio", "創作者工作室"), route: "studio", demo: "studio",
      text: t("Write guides and follow your collaborations and earnings records.", "編寫攻略、跟進合作及收益紀錄。") },
    { key: "merchant", label: t("Merchant workspace", "商戶工作區"), route: "merchant", demo: "merchants/dashboard",
      text: t("Manage your company, team and creator collaborations.", "管理公司、團隊及創作者合作。") },
    { key: "ops", label: t("Operations", "營運管理"), route: "ops", demo: "demo-lab",
      text: t("Review applications, submissions and reconciliation records.", "處理申請、審閱提交及核對結算紀錄。") },
  ] as const;
  return (
    <div className="k-page">
      <div className="os-eyebrow">{t("Your workspace", "你的工作區")}</div>
      <h1>{demo ? t("Demo workspace directory", "示範工作區導覽") : t("One place to find your next step.", "每個角色，都有清楚的下一步。")}</h1>
      <p className="os-intro">{t("Choose your KinnsoOS workspace. Sample demos have separate links below.", "選擇你的 KinnsoOS 工作區；以下另設示範版連結。")}</p>
      <aside className="os-note">{t("Service availability is shown below. Account access is checked when you open a workspace; an enabled service does not grant a role or company membership.", "以下列出服務啟用狀態。開啟工作區時仍會核對帳戶權限；服務已啟用不代表你已獲授角色或公司存取權。")}</aside>
      <div className="os-workspace-grid">
        {roles.map(role => (
          <section className="os-workspace" key={role.key} aria-labelledby={`workspace-${role.key}`}>
            <h2 id={`workspace-${role.key}`}>{role.label}</h2>
            <p>{role.text}</p>
            <p>{demo ? t("Sample data only; no account access is granted.", "只含示範資料，不會授予帳戶權限。") : features[role.key] ? t("Service enabled · account permission required", "服務已啟用 · 需要帳戶權限") : t("Service not connected yet", "服務尚未接通")}</p>
            <Link className="k-btn primary" href={`${root}/${role.route}`}>
              {features[role.key] && !demo ? t("Open KinnsoOS workspace", "開啟 KinnsoOS 工作區") : t("View KinnsoOS workspace status", "查看 KinnsoOS 工作區狀態")}
            </Link>
            <Link href={`/${locale}/demo/${role.demo}`}>{t("Open sample demo", "開啟示範版")} →</Link>
          </section>
        ))}
      </div>
      <section className="os-note" aria-labelledby="workspace-services">
        <h2 id="workspace-services">{t("Services on this site", "本網站服務狀態")}</h2>
        {demo ? <p>{t("This is the sample demo. Open KinnsoOS to check account services.", "這是示範版。請開啟 KinnsoOS 查看帳戶服務狀態。")}</p> : <>
          <p>{features.catalog ? t("Published guides: connected", "已發布攻略：已接通") : t("Published guides: not connected yet", "已發布攻略：尚未接通")}</p>
          <p>{features.trips ? t("Account trip sync: enabled · sign in required", "帳戶行程同步：已啟用 · 需要登入") : t("Account trip sync: not connected yet", "帳戶行程同步：尚未接通")}</p>
        </>}
        <p>{t("Booking and payments are not available. Demos use sample data and do not create real transactions.", "目前未提供訂位及付款。示範版使用樣本資料，不會產生真實交易。")}</p>
        <Link href={`/${locale}/explore`}>{t("Explore guides", "探索攻略")} →</Link>
      </section>
    </div>
  );
}
