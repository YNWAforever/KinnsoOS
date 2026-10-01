"use client";
import Link from "next/link";
import { useApp } from "../travel/ui";
import { canonicalRoot } from "../../lib/canonical";
export function WorkspacePanel() {
  const { t, locale, href } = useApp();
  const origin = canonicalRoot(locale);
  const roles = [
    {
      key: "creator",
      label: t("Creator studio", "創作者工作室"),
      text: t(
        "Publish guides, review missions, track earnings.",
        "發布攻略、查看任務及跟進收益。",
      ),
      route: "studio",
      demo: "studio",
      links: [
        ["studio/guides", t("My guides", "我的攻略")],
        ["studio/missions", t("Missions", "任務")],
        ["studio/earnings", t("Earnings", "收益")],
      ],
    },
    {
      key: "merchant",
      label: t("Merchant workspace", "商戶工作區"),
      text: t(
        "Manage experiences, campaigns and verified visits.",
        "管理體驗、合作活動及核實到訪。",
      ),
      route: "merchants/dashboard",
      demo: "merchants/dashboard",
      links: [
        ["merchants/dashboard/missions", t("Campaigns", "合作活動")],
        ["merchants/dashboard/offers", t("Offers", "優惠")],
        ["merchants/dashboard/redeem", t("Redemption", "核銷")],
      ],
    },
    {
      key: "ops",
      label: t("Operations", "營運管理"),
      text: t(
        "Review applications, submissions and settlement exceptions.",
        "處理申請、審閱提交及跟進結算例外。",
      ),
      route: "admin",
      demo: "demo-lab",
      links: [
        ["admin/creators/directory", t("Creators", "創作者")],
        ["admin/missions/review", t("Review queue", "待審閱")],
        ["admin/creators/payouts", t("Payout batches", "付款批次")],
      ],
    },
  ];
  return (
    <div className="k-page">
      <div className="os-eyebrow">YOUR WORKSPACE</div>
      <h1>
        {t("One place to find your next step.", "每個角色，都有清楚的下一步。")}
      </h1>
      <p className="os-intro">
        {t(
          "Use the new journey experience and continue established work in the existing Kinnso application.",
          "以新版體驗規劃旅程，並在現有 Kinnso 系統繼續日常工作。",
        )}
      </p>
      <aside className="os-note">
        {t(
          "These links open the existing application. Sign in there with your usual account. A demo profile here never grants access to real records.",
          "以下連結會開啟現有系統，需要以原有帳戶登入。本頁的示範身份不會授予正式資料權限。",
        )}
      </aside>
      <div className="os-workspace-grid">
        {roles.map((role) => (
          <section className="os-workspace" key={role.key}>
            <h2>{role.label}</h2>
            <p>{role.text}</p>
            <a className="k-btn primary" href={origin + "/" + role.route}>
              {t("Open existing workspace ↗", "開啟現有工作區 ↗")}
            </a>
            <ul>
              {role.links.map(([route, label]) => (
                <li key={route}>
                  <a href={origin + "/" + route}>{label} ↗</a>
                </li>
              ))}
            </ul>
            <Link href={href(role.demo)}>
              {t("Preview new demo layout", "預覽新版示範版面")} →
            </Link>
          </section>
        ))}
      </div>
      <section className="os-note">
        <h2>{t("What works in this first version", "首期功能狀態")}</h2>
        <p>
          {t(
            "Local itinerary editing, maps and private export: available. Published-guide connection: awaiting configuration. Cross-device trip sync and payments are not available here. Existing backend work opens in the original application.",
            "本機行程編輯、地圖及私人匯出：可使用。已發布攻略接駁：待配置。本版未提供跨裝置行程同步或付款；現有後台工作會於原有系統開啟。",
          )}
        </p>
      </section>
    </div>
  );
}
