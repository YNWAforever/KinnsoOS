"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import * as m from "./model";
import * as c from "./connected-model";
import { useApp, Chip, Empty, Icon, Money } from "./ui";
import { StudioNav } from "./editing";

export function useCommerce() {
  const [data, setData] = useState<c.Commerce | null>(null),
    [error, setError] = useState(false);
  function refresh() {
    try {
      setData(c.readCommerce());
      setError(false);
    } catch {
      setError(true);
      setData(null);
    }
  }
  useEffect(() => {
    refresh();
    window.addEventListener("kinnso-commerce-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("kinnso-commerce-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return { data, error, refresh };
}
function Load({ error, retry }: { error: boolean; retry: () => void }) {
  const { t } = useApp();
  return error ? (
    <Empty
      title={t("Saved work could not be read", "未能讀取已保存工作")}
      body={t(
        "Your existing data has been kept. Retry reading it.",
        "現有資料已保留，請重試讀取。",
      )}
    >
      <button className="k-btn" onClick={retry}>
        {t("Retry", "重試")}
      </button>
    </Empty>
  ) : (
    <p role="status">{t("Loading saved work…", "正在載入已保存工作⋯")}</p>
  );
}
export function WorkspaceGate({
  role,
  children,
}: {
  role: "merchant" | "owner";
  children: ReactNode;
}) {
  const { t, store, run, ready } = useApp();
  if (!ready)
    return <p role="status">{t("Loading account…", "正在載入帳戶⋯")}</p>;
  if (store.session?.role !== role)
    return (
      <Empty
        title={
          role === "merchant"
            ? t("Your merchant workspace", "你的商戶工作區")
            : t("Your Creator Studio", "你的創作者工作室")
        }
        body={t(
          "Open the sample workspace on this device. This does not change any production role or account.",
          "在此裝置開啟示範工作區，不會更改正式帳戶或角色。",
        )}
      >
        <button
          className="k-btn primary"
          onClick={() => run(() => m.session(role))}
        >
          {role === "merchant"
            ? t("Enter merchant demo", "進入商戶示範")
            : t("Enter creator demo", "進入創作者示範")}
        </button>
      </Empty>
    );
  return <>{children}</>;
}
const stateWords: Record<string, [string, string]> = {
  draft: ["Draft", "草稿"],
  active: ["In progress", "進行中"],
  completed: ["Completed", "已完成"],
  shortlisted: ["Shortlisted", "已加入候選"],
  invited: ["Invited", "已邀請"],
  applied: ["Application to review", "申請待審閱"],
  submitted: ["Submission to review", "作品待審閱"],
  changes: ["Changes requested", "需要修改"],
  approved: ["Work approved · not paid", "作品已批准・未支付"],
  rejected: ["Not accepted", "未獲接納"],
  pending: ["Awaiting eligibility review", "等待資格審閱"],
  eligible: ["Eligible · not paid", "可結算・未支付"],
  reversed: ["Reversed", "已撤銷"],
};
function State({ value }: { value: string }) {
  const { t } = useApp();
  const words = stateWords[value] || ["Unknown state", "狀態未明"];
  return (
    <Chip
      tone={
        value === "eligible" || value === "approved"
          ? "green"
          : value === "changes" || value === "pending"
            ? "amber"
            : ""
      }
    >
      {t(...words)}
    </Chip>
  );
}
function Metric({
  name,
  value,
  note,
}: {
  name: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="cj-metric">
      <span>{name}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Row({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="cj-row">
      <div>
        <strong>{title}</strong>
        {body && <p>{body}</p>}
      </div>
      {children}
    </div>
  );
}
export function CreatorToday() {
  const { t, href, store } = useApp(),
    { data, error, refresh } = useCommerce(),
    journals = m.tripsFor(store).filter((x) => x.purpose === "journal"),
    draft = journals.find((j) => j.publishedRevision !== j.revision),
    work =
      data?.participants.filter((p) => p.creatorId === store.session?.id) || [],
    urgent = work.find((p) =>
      ["changes", "invited", "active"].includes(p.state),
    ),
    view = m.earningsView("HKD", "2026-09-01", "2026-09-30");
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">{t("CREATOR STUDIO", "創作者工作室")}</p>
          <h1>
            {t(
              "Good things start with your knowledge.",
              "好旅程，從你的見識開始。",
            )}
          </h1>
          <p>
            {t(
              "Your work, your next step, your earnings.",
              "你的作品、下一步，以及每筆收益。",
            )}
          </p>
        </div>
        <Link href={href("record")} className="k-btn primary">
          <Icon name="plus" />
          {t("Record a journey", "記錄旅程")}
        </Link>
      </div>
      <StudioNav />
      <WorkspaceGate role="owner">
        {!data ? (
          <Load error={error} retry={refresh} />
        ) : (
          <>
            <section className="cj-next">
              <div>
                <p className="k-eyebrow">
                  {t("YOUR NEXT USEFUL STEP", "下一件值得做的事")}
                </p>
                <h2>
                  {urgent
                    ? t("Move your collaboration forward", "推進你的合作")
                    : draft
                      ? t(
                          "Turn a private note into a useful route.",
                          "將私人筆記，整理成有用路線。",
                        )
                      : t(
                          "Keep one place worth sharing.",
                          "記下一個值得分享的地方。",
                        )}
                </h2>
                <p>
                  {urgent
                    ? t(
                        "Review the brief or feedback before your next submission.",
                        "下一次提交前，先審閱簡介或修改意見。",
                      )
                    : t(
                        "Keep your original notes private. Choose what people see, then preview it.",
                        "原始筆記保持私人。選擇公開內容，再預覽。",
                      )}
                </p>
              </div>
              <Link
                className="k-btn dark"
                href={href(
                  urgent
                    ? "studio/opportunities"
                    : draft
                      ? "studio/adventures/" + draft.id + "/edit"
                      : "record",
                )}
              >
                {t("Continue creating", "繼續創作")}
                <Icon name="arrow" />
              </Link>
            </section>
            <div className="cj-metrics">
              <Metric
                name={t("Pending confirmation · HKD", "待確認・HKD")}
                value={<Money currency="HKD" amount={view.pending} />}
                note={t("Illustrative records", "示範紀錄")}
              />
              <Metric
                name={t("Eligible · HKD", "可結算・HKD")}
                value={<Money currency="HKD" amount={view.eligible} />}
                note={t("Not a withdrawal balance", "並非可提取餘額")}
              />
              <Metric
                name={t("Paid · HKD", "已支付・HKD")}
                value={<Money currency="HKD" amount={view.paid} />}
                note={t("Sample reconciled references", "示範已對帳參考")}
              />
            </div>
            <div className="cj-columns">
              <section className="k-panel">
                <h2>
                  {t("Your work, moving forward", "你的工作，逐步向前。")}
                </h2>
                {journals.slice(0, 3).map((j) => (
                  <Row
                    key={j.id}
                    title={j.title}
                    body={
                      j.publicationSlug
                        ? t(
                            "Private changes stay separate from the public version",
                            "私人修改與公開版本分開",
                          )
                        : t(
                            "Private draft · saved on this device",
                            "私人草稿・儲存於此裝置",
                          )
                    }
                  >
                    <Link
                      className="k-btn"
                      href={href("studio/adventures/" + j.id + "/edit")}
                    >
                      {t("Continue", "繼續")}
                    </Link>
                  </Row>
                ))}
                {work.map((p) => (
                  <Row
                    key={p.id}
                    title={
                      data.campaigns.find((c) => c.id === p.campaignId)?.name ||
                      p.campaignId
                    }
                  >
                    <State value={p.state} />
                    <Link className="k-btn" href={href("studio/opportunities")}>
                      {t("View", "查看")}
                    </Link>
                  </Row>
                ))}
                {!journals.length && !work.length && (
                  <p className="cj-quiet">
                    {t(
                      "No active work yet. A note or a suitable opportunity is a good place to start.",
                      "暫未有進行中的工作，由一則筆記或合適合作開始。",
                    )}
                  </p>
                )}
                <Link href={href("studio/adventures")} className="k-text-btn">
                  {t("All adventures", "全部旅程記錄")} →
                </Link>
              </section>
              <section className="k-panel">
                <p className="k-eyebrow">
                  {t("AN OPPORTUNITY THAT FITS", "適合你的合作機會")}
                </p>
                <h2>
                  {t(
                    "Help travellers discover a slower evening.",
                    "讓旅人慢慢認識街區的夜晚。",
                  )}
                </h2>
                <p>
                  {t(
                    "Hong Kong · hybrid mission · a route recommendation and three original photos.",
                    "香港・混合報酬任務・一段路線推薦及三張原創照片。",
                  )}
                </p>
                <p>
                  <strong>HKD 600</strong>{" "}
                  {t("content fee · sample terms", "內容費・示範條款")}
                </p>
                <Link className="k-btn" href={href("studio/opportunities")}>
                  {t("Review the opportunity", "審閱合作機會")} →
                </Link>
              </section>
            </div>
            <section className="k-panel cj-section">
              <h2>{t("What your routes led to", "你的路線，帶來甚麼？")}</h2>
              <div className="cj-metrics">
                <Metric
                  name={t("Saves", "收藏")}
                  value="—"
                  note={t("Live reporting unavailable", "正式報告尚未接通")}
                />
                <Metric
                  name={t("Trip adoptions", "行程套用")}
                  value="—"
                  note={t("Live reporting unavailable", "正式報告尚未接通")}
                />
                <Metric
                  name={t("Connected demo outcomes", "已連結示範成果")}
                  value={
                    data.outcomes.filter(
                      (o) => o.partnerId === store.session?.id,
                    ).length
                  }
                  note={t("Inspect source and eligibility", "查看來源及資格")}
                />
              </div>
              <Link href={href("studio/outcomes")} className="k-btn">
                {t("Inspect outcome-linked earnings", "查看成果收益明細")}
              </Link>
            </section>
          </>
        )}
      </WorkspaceGate>
    </div>
  );
}

const merchantNav = [
  ["", "Today", "今日", "compass"],
  ["missions", "Campaigns", "活動", "note"],
  ["creators", "Creators", "創作者", "user"],
  ["offers", "Offers & visits", "優惠及到訪", "pin"],
  ["insights", "Results", "成果", "wallet"],
];
export function MerchantWorkspace({ path }: { path: string }) {
  const { t, href } = useApp();
  const section =
    path === "merchant/missions"
      ? "missions"
      : path === "merchant/redemption"
        ? "redeem"
        : path.replace(/^merchants\/dashboard\/?/, "").split("/")[0];
  return (
    <div className="cj-workspace">
      <aside className="cj-sidebar">
        <p className="k-eyebrow">HARBOUR STUDIO</p>
        <nav aria-label={t("Merchant navigation", "商戶導航")}>
          {merchantNav.map(([p, en, zh, icon]) => (
            <Link
              className={
                section === p || (p === "offers" && section === "redeem")
                  ? "active"
                  : ""
              }
              key={p}
              href={href("merchants/dashboard" + (p ? "/" + p : ""))}
            >
              <Icon name={icon} />
              {t(en, zh)}
            </Link>
          ))}
        </nav>
        <details className="cj-secondary">
          <summary>{t("Business tools", "業務工具")}</summary>
          {[
            ["profile", "Profile", "商戶檔案"],
            ["experiences", "Experiences", "體驗"],
            ["bookings", "Bookings", "預訂"],
            ["budget", "Budget", "預算"],
          ].map(([p, en, zh]) => (
            <Link key={p} href={href("merchants/dashboard/" + p)}>
              {t(en, zh)}
            </Link>
          ))}
          <Link href={href("help")}>{t("Support", "支援")}</Link>
        </details>
        <Link className="cj-leave" href={href("explore")}>
          ← {t("Explore as a traveller", "以旅人身份探索")}
        </Link>
      </aside>
      <div className="cj-work-content">
        <WorkspaceGate role="merchant">
          {section === "post" ? (
            <CampaignBuilder />
          ) : section === "missions" ? (
            <Campaigns />
          ) : section === "creators" ? (
            <MerchantCreators />
          ) : section === "offers" ? (
            <MerchantOffers />
          ) : section === "redeem" ? (
            <Redemption />
          ) : section === "insights" ? (
            <MerchantResults />
          ) : ["profile", "experiences", "bookings", "budget"].includes(
              section,
            ) ? (
            <BusinessTool section={section} />
          ) : (
            <MerchantToday />
          )}
        </WorkspaceGate>
      </div>
    </div>
  );
}
function MerchantHeading({
  title,
  body,
  action = true,
}: {
  title: string;
  body?: string;
  action?: boolean;
}) {
  const { t, href } = useApp();
  return (
    <div className="k-page-heading">
      <div>
        <p className="k-eyebrow">
          {t("HARBOUR STUDIO / SAMPLE BUSINESS", "HARBOUR STUDIO / 示範商戶")}
        </p>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
      {action && (
        <Link className="k-btn primary" href={href("merchants/dashboard/post")}>
          <Icon name="plus" />
          {t("New campaign", "新活動")}
        </Link>
      )}
    </div>
  );
}
function MerchantToday() {
  const { t, href, store } = useApp(),
    { data, error, refresh } = useCommerce();
  if (!data) return <Load error={error} retry={refresh} />;
  const campaigns = data.campaigns.filter(
      (c) => c.merchant === store.session?.id,
    ),
    ids = new Set(campaigns.map((c) => c.id)),
    work = data.participants.filter(
      (p) =>
        ids.has(p.campaignId) && ["applied", "submitted"].includes(p.state),
    ),
    outcomes = data.outcomes.filter((o) => o.merchant === store.session?.id);
  return (
    <>
      <MerchantHeading
        title={t(
          "Your next customers, your next step.",
          "下一位客人，下一個行動。",
        )}
        body={t(
          "See what needs attention and which recommendations lead to verified actions.",
          "先處理需要跟進的工作，再了解哪些推薦帶來核實成果。",
        )}
      />
      <div className="cj-metrics four">
        <Metric
          name={t("Valid redemptions", "有效核銷")}
          value={outcomes.filter((o) => o.state !== "reversed").length}
          note={t("In this local demo", "此本機示範")}
        />
        <Metric
          name={t("Active campaigns", "進行中活動")}
          value={campaigns.filter((c) => c.state === "active").length}
          note={t("Sample campaign records", "示範活動紀錄")}
        />
        <Metric
          name={t("Awaiting review", "待審閱")}
          value={work.length}
          note={t("Creator action queue", "創作者工作清單")}
        />
        <Metric
          name={t("Available budget", "可用預算")}
          value="—"
          note={t("Live budget unavailable", "正式預算尚未接通")}
        />
      </div>
      <div className="cj-columns">
        <section className="k-panel">
          <h2>{t("What needs you today", "今日需要你處理")}</h2>
          {work.map((p) => (
            <Row
              key={p.id}
              title={partnersName(p.creatorId)}
              body={t(...stateWords[p.state])}
            >
              <Link
                href={href(
                  "merchants/dashboard/missions?campaign=" + p.campaignId,
                )}
                className="k-btn"
              >
                {t("Review", "審閱")}
              </Link>
            </Row>
          ))}
          <Row
            title={t("Ready for your next traveller", "準備迎接下一位旅人")}
            body={t(
              "Keep the offer valid. Verify the code when they arrive.",
              "保持優惠有效，到訪時核對代碼。",
            )}
          >
            <Link className="k-btn" href={href("merchants/dashboard/redeem")}>
              {t("Open redemption", "開啟核銷")}
            </Link>
          </Row>
          <h3>{t("Latest verified visits", "最新核實到訪")}</h3>
          {outcomes.some((o) => o.state !== "reversed") ? (
            outcomes
              .filter((o) => o.state !== "reversed")
              .slice(-3)
              .reverse()
              .map((o) => (
                <Row
                  key={o.id}
                  title={t(
                    "Temple Street → Harbour Studio",
                    "廟街 → Harbour Studio",
                  )}
                  body={t(
                    "One matched demo claim · no private trip data",
                    "一項已配對示範領取・不含私人行程資料",
                  )}
                >
                  <Link
                    className="k-btn"
                    href={href("merchants/dashboard/insights?outcome=" + o.id)}
                  >
                    {t("View source", "查看來源")}
                  </Link>
                </Row>
              ))
          ) : (
            <p>
              {t(
                "No verified visits yet. Claims appear separately.",
                "暫未有核實到訪，領取優惠會獨立列出。",
              )}
            </p>
          )}
        </section>
        <section className="k-panel">
          <p className="k-eyebrow">{t("CURRENT CAMPAIGN", "目前活動")}</p>
          <h2>
            {campaigns.find((c) => c.state === "active")?.name ||
              t("Choose your customer outcome", "選擇你的客戶成果")}
          </h2>
          <p>{t("Goal: relevant traveller visits", "目標：合適旅人的到訪")}</p>
          <div className="cj-stages">
            <span className="done">{t("Brief", "簡介")}</span>
            <span className="done">{t("Creators", "創作者")}</span>
            <span>{t("Review", "審閱")}</span>
            <span>{t("Result", "成果")}</span>
          </div>
          <Link
            href={href("merchants/dashboard/missions")}
            className="k-text-btn"
          >
            {t("Open campaign pipeline", "開啟活動進度")} →
          </Link>
        </section>
      </div>
      <section className="cj-next cj-section">
        <div>
          <p className="k-eyebrow">
            {t("RECOMMENDATIONS INTO ACTIONS", "推薦，帶來行動")}
          </p>
          <h2>
            {t(
              "A claim is interest. Verify the visit.",
              "領取代表興趣，到訪需要核實。",
            )}
          </h2>
          <p>
            {t(
              "Track redemptions, eligible rewards and payment separately.",
              "分開追蹤核銷、合资格報酬及付款。",
            )}
          </p>
        </div>
        <Link
          className="k-btn dark"
          href={href("merchants/dashboard/insights")}
        >
          {t("See results", "查看成果")} →
        </Link>
      </section>
    </>
  );
}
function partnersName(id: string) {
  return c.partners.find((p) => p.id === id)?.name || id;
}
function CampaignBuilder() {
  const { t, store, run, href } = useApp(),
    router = useRouter(),
    q = useSearchParams(),
    { data, error, refresh } = useCommerce(),
    [draft, setDraft] = useState<c.Campaign | null>(null),
    [saved, setSaved] = useState(false),
    key = useRef(m.id("campaign-save"));
  useEffect(() => {
    if (!data || draft) return;
    const existing = data.campaigns.find(
      (c) => c.id === q.get("campaign") && c.merchant === store.session?.id,
    );
    setDraft(
      existing
        ? structuredClone(existing)
        : {
            id: m.id("campaign"),
            merchant: "demo-merchant",
            revision: 0,
            name: "",
            goal: "visits",
            audience: "",
            benefit: "",
            budget: 0,
            reward: 0,
            validUntil: "",
            brief: "",
            terms: "",
            state: "draft",
            funding: "unfunded",
            step: 1,
          },
    );
  }, [data]);
  if (!data || !draft) return <Load error={error} retry={refresh} />;
  const update = (p: Partial<c.Campaign>) => {
    setDraft({ ...draft, ...p });
    setSaved(false);
    key.current = m.id("campaign-save");
  };
  function save() {
    const result = run(
      () => c.saveCampaign(draft!, draft!.revision, key.current),
      t("Demo brief saved on this device", "示範簡介已儲存於此裝置"),
    );
    if (result) {
      setDraft(result);
      setSaved(true);
      key.current = m.id("campaign-save");
    }
    return result;
  }
  return (
    <>
      <MerchantHeading
        title={t("Start with the outcome.", "由成果開始。")}
        body={t(
          "Four short steps. Save the brief at any point.",
          "四個簡單步驟，可隨時保存簡介。",
        )}
        action={false}
      />
      <div
        className="cj-wizard"
        role="group"
        aria-label={t("Campaign steps", "活動步驟")}
      >
        {[
          ["Goal & audience", "目標及對象"],
          ["Offer & budget", "優惠及預算"],
          ["Work & creators", "工作及創作者"],
          ["Review", "審閱"],
        ].map(([en, zh], i) => (
          <button
            key={en}
            className={draft.step === i + 1 ? "active" : ""}
            onClick={() => update({ step: i + 1 })}
          >
            {i + 1}
            <span>{t(en, zh)}</span>
          </button>
        ))}
      </div>
      <form
        className="k-panel k-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {draft.step === 1 ? (
          <>
            <label>
              {t("Campaign name", "活動名稱")}
              <input
                maxLength={120}
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label>
              {t("Customer outcome", "客戶成果")}
              <select
                value={draft.goal}
                onChange={(e) =>
                  update({ goal: e.target.value as c.Campaign["goal"] })
                }
              >
                <option value="visits">
                  {t("Qualified visits", "合資格到訪")}
                </option>
                <option value="enquiries">{t("Enquiries", "查詢")}</option>
                <option value="bookings" disabled>
                  {t("Native bookings — unavailable", "站內預訂 — 尚未接通")}
                </option>
                <option value="content">
                  {t("Useful content production", "實用內容製作")}
                </option>
              </select>
            </label>
            <label>
              {t("Destination and audience", "目的地及目標對象")}
              <input
                maxLength={300}
                value={draft.audience}
                placeholder={t(
                  "Hong Kong · independent evening travellers",
                  "香港・喜歡夜間探索的獨立旅人",
                )}
                onChange={(e) => update({ audience: e.target.value })}
              />
            </label>
          </>
        ) : draft.step === 2 ? (
          <>
            <label>
              {t("Traveller benefit", "旅人優惠")}
              <input
                maxLength={300}
                value={draft.benefit}
                onChange={(e) => update({ benefit: e.target.value })}
              />
            </label>
            <div className="cj-fields">
              <label>
                {t("Campaign budget · HKD", "活動預算・HKD")}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.budget || ""}
                  onChange={(e) => update({ budget: Number(e.target.value) })}
                />
              </label>
              <label>
                {t("Creator reward per outcome · HKD", "每項成果報酬・HKD")}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.reward || ""}
                  onChange={(e) => update({ reward: Number(e.target.value) })}
                />
              </label>
            </div>
            <label>
              {t("Valid until", "有效期至")}
              <input
                type="date"
                value={draft.validUntil}
                onChange={(e) => update({ validUntil: e.target.value })}
              />
            </label>
            <p>
              {t(
                "Draft numbers only. Saving does not fund the campaign or reserve a real balance.",
                "只作草稿數字，儲存不會注資或保留正式餘額。",
              )}
            </p>
          </>
        ) : draft.step === 3 ? (
          <>
            <label>
              {t("Deliverables and effort", "交付內容及工作量")}
              <textarea
                maxLength={2000}
                value={draft.brief}
                onChange={(e) => update({ brief: e.target.value })}
                placeholder={t(
                  "One route recommendation, 3 photographs · about 2 hours",
                  "一段路線推薦、三張照片・約兩小時",
                )}
              />
            </label>
            <label>
              {t("Reward, rights and review terms", "報酬、使用權及審閱條款")}
              <textarea
                maxLength={2000}
                value={draft.terms}
                onChange={(e) => update({ terms: e.target.value })}
              />
            </label>
            <p>
              {t(
                "Shortlist after saving. Suggestions never send invitations.",
                "儲存後可挑選候選，建議不會發送邀請。",
              )}
            </p>
          </>
        ) : (
          <>
            <h2>{draft.name || t("Untitled campaign", "未命名活動")}</h2>
            <dl className="cj-definition">
              <dt>{t("Goal", "目標")}</dt>
              <dd>
                {
                  {
                    visits: t("Qualified visits", "合資格到訪"),
                    enquiries: t("Enquiries", "查詢"),
                    content: t("Content", "內容"),
                    bookings: t("Bookings — unavailable", "預訂 — 尚未接通"),
                  }[draft.goal]
                }
              </dd>
              <dt>{t("Audience", "對象")}</dt>
              <dd>{draft.audience || "—"}</dd>
              <dt>{t("Benefit", "優惠")}</dt>
              <dd>{draft.benefit || "—"}</dd>
              <dt>{t("Budget", "預算")}</dt>
              <dd>
                <Money currency="HKD" amount={draft.budget} />
              </dd>
              <dt>{t("Valid until", "有效期至")}</dt>
              <dd>{draft.validUntil || "—"}</dd>
            </dl>
            <p>{draft.brief}</p>
            <p>{draft.terms}</p>
            <Chip>
              {t(
                "Local demo activation only · no funding or invitations",
                "只啟用本機示範・不會注資或邀請",
              )}
            </Chip>
            <button
              type="button"
              className="k-btn primary"
              onClick={() => {
                const row = save();
                if (row) {
                  const result = run(() =>
                    c.activateCampaign(row.id, row.revision, m.id("activate")),
                  );
                  if (result)
                    router.push(
                      href(
                        "merchants/dashboard/missions?campaign=" + result.id,
                      ),
                    );
                }
              }}
            >
              {t("Activate demo campaign", "啟用示範活動")}
            </button>
          </>
        )}
        <div className="cj-form-footer">
          <button type="submit" className="k-btn">
            {t("Save demo draft", "儲存示範草稿")}
          </button>
          {draft.step < 4 && (
            <button
              type="button"
              className="k-btn primary"
              onClick={() => update({ step: draft.step + 1 })}
            >
              {t("Continue", "繼續")} →
            </button>
          )}
          <span role="status">
            {saved
              ? t("Saved on this device", "已儲存於此裝置")
              : t("Draft changes", "草稿修改")}
          </span>
        </div>
      </form>
    </>
  );
}
function Campaigns() {
  const { t, href, store, open } = useApp(),
    { data, error, refresh } = useCommerce(),
    q = useSearchParams();
  if (!data) return <Load error={error} retry={refresh} />;
  const rows = data.campaigns.filter((c) => c.merchant === store.session?.id);
  return (
    <>
      <MerchantHeading
        title={t("Campaigns", "活動")}
        body={t(
          "A clear brief, suitable creators and a reviewable result.",
          "清晰簡介、合適創作者，以及可審閱成果。",
        )}
      />
      {rows.map((row) => (
        <section
          className={`k-panel cj-section ${q.get("campaign") === row.id ? "cj-highlight" : ""}`}
          key={row.id}
        >
          <div className="cj-between">
            <h2>{row.name || t("Untitled draft", "未命名草稿")}</h2>
            <State value={row.state} />
          </div>
          <p>{row.audience}</p>
          <div className="k-actions">
            <Link
              className="k-btn"
              href={href("merchants/dashboard/post?campaign=" + row.id)}
            >
              {t("Edit brief", "修改簡介")}
            </Link>
            <Link
              className="k-btn"
              href={href("merchants/dashboard/creators?campaign=" + row.id)}
            >
              {t("Find creators", "尋找創作者")}
            </Link>
          </div>
          <div className="cj-stages">
            {[
              "shortlisted",
              "invited",
              "applied",
              "active",
              "submitted",
              "approved",
            ].map((state) => (
              <span key={state}>
                {t(...stateWords[state])}
                <b>
                  {
                    data.participants.filter(
                      (p) => p.campaignId === row.id && p.state === state,
                    ).length
                  }
                </b>
              </span>
            ))}
          </div>
          {data.participants
            .filter((p) => p.campaignId === row.id)
            .map((p) => (
              <Row
                key={p.id}
                title={partnersName(p.creatorId)}
                body={p.feedback || undefined}
              >
                <State value={p.state} />
                {["submitted", "applied"].includes(p.state) && (
                  <button
                    className="k-btn primary"
                    onClick={() =>
                      open(
                        t("Review participant", "審閱參與者"),
                        <ReviewParticipant row={p} campaign={row} />,
                      )
                    }
                  >
                    {t("Review", "審閱")}
                  </button>
                )}
              </Row>
            ))}
        </section>
      ))}
      <RetainedMissions />
    </>
  );
}
function ReviewParticipant({
  row,
  campaign,
}: {
  row: c.Participation;
  campaign: c.Campaign;
}) {
  const { t, locale, run, close } = useApp(),
    [reason, setReason] = useState(""),
    intent = useRef(m.id("review"));
  function act(action: "approve" | "changes" | "reject") {
    if (
      run(
        () =>
          c.partnerAction(
            campaign.id,
            row.creatorId,
            action,
            reason,
            intent.current,
            row.revision,
          ),
        t(
          "Demo review saved. Approval is not payment.",
          "示範審閱已儲存，批准不代表付款。",
        ),
      )
    )
      close();
  }
  return (
    <div className="k-modal-body k-form">
      <h3>{partnersName(row.creatorId)}</h3>
      <p>
        {row.submission ||
          t("Application awaiting your review.", "申請等待你的審閱。")}
      </p>
      <p>{c.fixtureText(campaign.terms, locale)}</p>
      <label>
        {t(
          "Feedback (required for changes or rejection)",
          "意見（修改或拒絕時必填）",
        )}
        <textarea
          value={reason}
          maxLength={1000}
          onChange={(e) => {
            setReason(e.target.value);
            intent.current = m.id("review");
          }}
        />
      </label>
      <div className="k-actions">
        <button className="k-btn primary" onClick={() => act("approve")}>
          {row.state === "applied"
            ? t("Accept demo application", "接納示範申請")
            : t("Approve demo work", "批准示範作品")}
        </button>
        <button
          className="k-btn"
          disabled={!reason.trim()}
          onClick={() => act(row.state === "submitted" ? "changes" : "reject")}
        >
          {row.state === "submitted"
            ? t("Request changes", "要求修改")
            : t("Decline", "拒絕")}
        </button>
      </div>
    </div>
  );
}
function MerchantCreators() {
  const { t, locale, href, run, store, open } = useApp(),
    { data, error, refresh } = useCommerce(),
    q = useSearchParams(),
    [campaignId, setCampaignId] = useState(
      q.get("campaign") || "demo-campaign-hk",
    ),
    [search, setSearch] = useState(""),
    [destination, setDestination] = useState("");
  if (!data) return <Load error={error} retry={refresh} />;
  const campaigns = data.campaigns.filter(
      (c) => c.merchant === store.session?.id,
    ),
    campaign = campaigns.find((c) => c.id === campaignId),
    matches = c.partners.filter(
      (p) =>
        (
          p.name +
          " " +
          p.language +
          " " +
          p.reason.en +
          " " +
          p.reason["zh-HK"]
        )
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!destination || p.destination === destination),
    );
  return (
    <>
      <MerchantHeading
        title={t("Find the right people.", "找到合適的人。")}
        body={t(
          "Match on destination, language and useful work. All profiles here are sample personas.",
          "按目的地、語言及實用作品配對，以下均為示範身份。",
        )}
        action={false}
      />
      <div className="k-panel k-form">
        <label>
          {t("Campaign", "活動")}
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || t("Untitled", "未命名")}
              </option>
            ))}
          </select>
        </label>
        <div className="cj-fields">
          <label>
            {t("Search creators", "搜尋創作者")}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Name or language", "姓名或語言")}
            />
          </label>
          <label>
            {t("Destination", "目的地")}
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">{t("All destinations", "全部目的地")}</option>
              <option value="hong-kong">{t("Hong Kong", "香港")}</option>
              <option value="kyoto">{t("Kyoto", "京都")}</option>
              <option value="lisbon">{t("Lisbon", "里斯本")}</option>
            </select>
          </label>
        </div>
      </div>
      <div className="cj-creator-grid">
        {matches.map((p) => {
          const row = data.participants.find(
            (r) => r.creatorId === p.id && r.campaignId === campaignId,
          );
          return (
            <section className="k-panel" key={p.id}>
              <div className="cj-between">
                <span className="k-avatar large">{p.name.slice(0, 2)}</span>
                {row && <State value={row.state} />}
              </div>
              <h2>{p.name}</h2>
              <p>{p.reason[locale]}</p>
              <Link href={href("g/" + p.route)} className="k-text-btn">
                {t("Relevant sample work", "相關示範作品")} ↗
              </Link>
              <div className="k-actions">
                <button
                  className="k-btn"
                  disabled={!!row}
                  onClick={() =>
                    run(() =>
                      c.partnerAction(
                        campaignId,
                        p.id,
                        "shortlist",
                        "",
                        m.id("shortlist"),
                      ),
                    )
                  }
                >
                  {row
                    ? t("Shortlisted", "已加入候選")
                    : t("Shortlist", "加入候選")}
                </button>
                <button
                  className="k-btn primary"
                  disabled={
                    !campaign ||
                    campaign.state !== "active" ||
                    (!!row && row.state !== "shortlisted")
                  }
                  onClick={() =>
                    open(
                      t("Review demo invitation", "審閱示範邀請"),
                      <DemoInvite
                        campaign={campaign!}
                        partner={p}
                        expected={row?.revision || 0}
                      />,
                    )
                  }
                >
                  {t("Invite in demo", "示範邀請")}
                </button>
                <button
                  className="k-text-btn"
                  onClick={() =>
                    open(
                      t("Private merchant note", "商戶私人筆記"),
                      <PartnerNote
                        campaignId={campaignId}
                        partnerId={p.id}
                        initial={row?.note || ""}
                      />,
                    )
                  }
                >
                  {t("Private note", "私人筆記")}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      {!matches.length && (
        <Empty title={t("No matching creators", "沒有符合的創作者")} />
      )}
      <p className="k-meta">
        {t(
          "Demo quota: 3 invited or participating creators per campaign. No external invitation is sent.",
          "示範配額：每個活動最多三位受邀或參與創作者，不會向外發送邀請。",
        )}
      </p>
    </>
  );
}
function DemoInvite({
  campaign,
  partner,
  expected,
}: {
  campaign: c.Campaign;
  partner: c.Partner;
  expected: number;
}) {
  const { t, locale, run, close } = useApp(),
    intent = useRef(m.id("invite"));
  return (
    <div className="k-modal-body">
      <h3>
        {partner.name} → {c.fixtureText(campaign.name, locale)}
      </h3>
      <p>{c.fixtureText(campaign.brief, locale)}</p>
      <p>{c.fixtureText(campaign.terms, locale)}</p>
      <p>
        {t(
          "The invitation is saved only in this demo. No message or email will be sent.",
          "邀請只保存於此示範，不會發送訊息或電郵。",
        )}
      </p>
      <button
        className="k-btn primary"
        onClick={() => {
          if (
            run(() =>
              c.partnerAction(
                campaign.id,
                partner.id,
                "invite",
                "",
                intent.current,
                expected,
              ),
            )
          )
            close();
        }}
      >
        {t("Save demo invitation", "儲存示範邀請")}
      </button>
    </div>
  );
}
function PartnerNote({
  campaignId,
  partnerId,
  initial,
}: {
  campaignId: string;
  partnerId: string;
  initial: string;
}) {
  const { t, run, close } = useApp(),
    [note, setNote] = useState(initial);
  return (
    <form
      className="k-modal-body k-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          run(() =>
            c.partnerAction(campaignId, partnerId, "note", note, m.id("note")),
          )
        )
          close();
      }}
    >
      <label>
        {t("Only shown in the merchant demo", "只在商戶示範顯示")}
        <textarea
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button className="k-btn primary">
        {t("Save private demo note", "儲存私人示範筆記")}
      </button>
    </form>
  );
}
export function OfferPage() {
  const { t, locale, href, store, auth, run } = useApp(),
    { data, error, refresh } = useCommerce(),
    key = useRef(m.id("claim"));
  if (!data) return <Load error={error} retry={refresh} />;
  const offer = data.offers[0],
    claim = data.claims.find(
      (c) => c.offerId === offer.id && c.owner === store.session?.id,
    );
  return (
    <div className="k-page cj-offer-page">
      <Link href={href("g/" + offer.slug)} className="k-back">
        ← {t("Return to the route", "返回路線")}
      </Link>
      <div className="cj-columns">
        <section className="k-panel">
          <p className="k-eyebrow">
            {t("RELEVANT TO YOUR TEMPLE STREET STOP", "適合你的廟街站點")}
          </p>
          <h1>{offer.name[locale]}</h1>
          <p>
            {t(
              "Harbour Studio · fictional merchant",
              "Harbour Studio・虛構示範商戶",
            )}
          </p>
          <h2>{offer.benefit[locale]}</h2>
          <dl className="cj-definition">
            <dt>{t("Validity", "有效期")}</dt>
            <dd>{offer.validUntil}</dd>
            <dt>{t("Limit", "限額")}</dt>
            <dd>
              {t(
                "One claim per demo traveller · limited capacity",
                "每位示範旅人一次・名額有限",
              )}
            </dd>
            <dt>{t("Eligibility", "資格")}</dt>
            <dd>
              {t(
                "HKD 80 qualifying spend; merchant verification required. No cash alternative.",
                "合資格消費滿 HKD 80，需商戶核實，不設現金代替。",
              )}
            </dd>
            <dt>{t("Why here", "推薦原因")}</dt>
            <dd>
              {t(
                "An optional tea break near the route’s Temple Street stop. Paid participation is disclosed.",
                "路線廟街站附近的自選茶歇，商業合作已披露。",
              )}
            </dd>
          </dl>
          {!claim ? (
            <button
              className="k-btn primary"
              disabled={!offer.enabled}
              onClick={() =>
                auth(() =>
                  run(
                    () => c.claimOffer(offer.id, key.current),
                    t(
                      "Demo offer claimed. No visit or earning recorded.",
                      "已領取示範優惠，未記錄到訪或收益。",
                    ),
                  ),
                )
              }
            >
              {t("Claim demo offer", "領取示範優惠")}
            </button>
          ) : (
            <div className="cj-voucher">
              <Chip>
                {claim.state === "redeemed"
                  ? t("Redeemed in demo", "已在示範核銷")
                  : t("Claimed · not a verified visit", "已領取・並非核實到訪")}
              </Chip>
              <p>
                {t(
                  "Show this sample code to the merchant demo.",
                  "在商戶示範輸入此樣本代碼。",
                )}
              </p>
              <strong>{claim.code}</strong>
              <Link className="k-btn" href={href("merchants/dashboard/redeem")}>
                {t("Continue to merchant demo", "繼續商戶示範")} →
              </Link>
            </div>
          )}
        </section>
        <aside>
          <img
            className="cj-offer-photo"
            src="/photos/hongKong.jpg"
            alt={t("Hong Kong destination photo", "香港目的地照片")}
          />
          <div className="k-panel cj-section">
            <h3>{t("Know the source", "了解來源")}</h3>
            <p>
              {t(
                "Route credit: Chloe. Sample referral contract: Jamie. Credit alone never establishes commission.",
                "路線署名：Chloe。示範推薦合約：Jamie。署名本身不會產生佣金。",
              )}
            </p>
            <p>
              {t(
                "Claim → merchant verification → eligibility review → separate payment reconciliation.",
                "領取 → 商戶核實 → 資格審閱 → 獨立付款對帳。",
              )}
            </p>
            <p>
              {t(
                "No real voucher, payment or booking is issued.",
                "不會發出正式禮券、付款或預訂。",
              )}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function MerchantOffers() {
  const { t, locale, href, store, open } = useApp(),
    { data, error, refresh } = useCommerce();
  if (!data) return <Load error={error} retry={refresh} />;
  const offers = data.offers.filter((o) => o.merchant === store.session?.id);
  return (
    <>
      <MerchantHeading
        title={t("Offers & visits", "優惠及到訪")}
        action={false}
      />
      <div className="k-actions">
        <Link
          className="k-btn primary"
          href={href("merchants/dashboard/redeem")}
        >
          {t("Verify a demo code", "核對示範代碼")}
          <Icon name="arrow" />
        </Link>
        <Link className="k-btn" href={href("merchants/dashboard/insights")}>
          {t("Review verified outcomes", "查看核實成果")}
        </Link>
      </div>
      {offers.map((o) => (
        <section className="k-panel cj-section" key={o.id}>
          <div className="cj-between">
            <h2>{o.name[locale]}</h2>
            <Chip>
              {o.enabled
                ? t("Active sample offer", "有效示範優惠")
                : t("Paused", "已暫停")}
            </Chip>
          </div>
          <p>{o.benefit[locale]}</p>
          <p>
            {t("Valid until", "有效期至")} {o.validUntil} ·{" "}
            {t("Capacity", "名額")} {o.capacity}
          </p>
          <div className="cj-metrics">
            <Metric
              name={t("Claims", "已領取")}
              value={data.claims.filter((c) => c.offerId === o.id).length}
              note={t("Includes DEMO-VALID sample", "包括 DEMO-VALID 樣本")}
            />
            <Metric
              name={t("Verified redemptions", "已核實核銷")}
              value={data.outcomes.filter((v) => v.offerId === o.id).length}
              note={t("Unique matched outcomes", "獨立已配對成果")}
            />
            <Metric
              name={t("Completed bookings", "已完成預訂")}
              value="—"
              note={t("Booking service unavailable", "預訂服務尚未接通")}
            />
          </div>
          <div className="k-actions">
            <button
              className="k-btn"
              onClick={() =>
                open(
                  t("Maintain sample offer", "管理示範優惠"),
                  <EditOffer offer={o} />,
                )
              }
            >
              {t("Edit validity & capacity", "修改有效期及名額")}
            </button>
            <Link className="k-btn" href={href("offers/" + o.id)}>
              {t("Traveller view", "旅人畫面")}
            </Link>
          </div>
        </section>
      ))}
    </>
  );
}
function EditOffer({ offer }: { offer: c.Offer }) {
  const { t, run, close } = useApp(),
    [draft, setDraft] = useState({ ...offer });
  return (
    <form
      className="k-modal-body k-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (run(() => c.updateOffer(draft, m.id("offer")))) close();
      }}
    >
      <label>
        {t("Valid until", "有效期至")}
        <input
          type="date"
          required
          value={draft.validUntil}
          onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
        />
      </label>
      <label>
        {t("Capacity", "名額")}
        <input
          type="number"
          min="1"
          step="1"
          required
          value={draft.capacity}
          onChange={(e) =>
            setDraft({ ...draft, capacity: Number(e.target.value) })
          }
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        {t("Offer enabled in demo", "於示範啟用優惠")}
      </label>
      <button className="k-btn primary">
        {t("Save demo offer", "儲存示範優惠")}
      </button>
    </form>
  );
}
function Redemption() {
  const { t, locale, run, href } = useApp(),
    [code, setCode] = useState(""),
    [match, setMatch] = useState<ReturnType<typeof c.inspectCode> | null>(null),
    [spend, setSpend] = useState("80"),
    [evidence, setEvidence] = useState(""),
    [result, setResult] = useState<ReturnType<typeof c.redeem> | null>(null),
    key = useRef(m.id("redeem"));
  return (
    <>
      <MerchantHeading
        title={t("Verify a traveller action.", "核實一次旅人行動。")}
        body={t(
          "Paste the code, review the match, then confirm once. Camera scanning is unavailable.",
          "貼上代碼、審閱配對，再確認一次。暫未提供相機掃描。",
        )}
        action={false}
      />
      <section className="k-panel k-form cj-redeem">
        <form
          className="k-form"
          onSubmit={(e) => {
            e.preventDefault();
            setResult(null);
            setMatch(null);
            const found = run(() => c.inspectCode(code));
            if (found) setMatch(found);
          }}
        >
          <label>
            {t("Demo redemption code", "示範核銷代碼")}
            <input
              autoCapitalize="characters"
              value={code}
              maxLength={80}
              placeholder="DEMO-VALID"
              onChange={(e) => {
                setCode(e.target.value);
                setMatch(null);
                setResult(null);
                key.current = m.id("redeem");
              }}
            />
          </label>
          <button className="k-btn primary" type="submit">
            {t("Check demo code", "核對示範代碼")}
          </button>
        </form>
        {match && (
          <div className="cj-section">
            <Chip>
              {match.claim.state === "redeemed"
                ? t("Already redeemed", "已核銷")
                : t("Valid claim · not yet redeemed", "有效領取・尚未核銷")}
            </Chip>
            <h2>{match.offer.name[locale]}</h2>
            <p>{t("Merchant: Harbour Studio", "商戶：Harbour Studio")}</p>
            <p>{match.offer.benefit[locale]}</p>
            {match.outcome ? (
              <>
                <p>
                  {t(
                    "This code already has a verified result. No second visit or reward can be created.",
                    "此代碼已有核實結果，不會重複建立到訪或報酬。",
                  )}
                </p>
                <Link
                  className="k-btn"
                  href={href(
                    "merchants/dashboard/insights?outcome=" + match.outcome.id,
                  )}
                >
                  {t("Open original result", "查看原有結果")}
                </Link>
              </>
            ) : (
              <form
                className="k-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const outcome = run(() =>
                    c.redeem(code, Number(spend), evidence, key.current),
                  );
                  if (outcome) {
                    setResult(outcome);
                    setMatch(c.inspectCode(code));
                  }
                }}
              >
                <label>
                  {t(
                    "Confirmed qualifying spend · HKD",
                    "已確認合資格消費・HKD",
                  )}
                  <input
                    type="number"
                    step="1"
                    min={match.offer.minimumSpend}
                    required
                    value={spend}
                    onChange={(e) => {
                      setSpend(e.target.value);
                      key.current = m.id("redeem");
                    }}
                  />
                </label>
                <label>
                  {t(
                    "Verification note (no personal details)",
                    "核實筆記（不含個人資料）",
                  )}
                  <textarea
                    maxLength={500}
                    required
                    value={evidence}
                    placeholder={t(
                      "Sample receipt checked at counter",
                      "已於櫃位核對示範收據",
                    )}
                    onChange={(e) => {
                      setEvidence(e.target.value);
                      key.current = m.id("redeem");
                    }}
                  />
                </label>
                <button className="k-btn primary">
                  {t("Redeem demo code once", "核銷示範代碼一次")}
                </button>
              </form>
            )}
          </div>
        )}
        {result && (
          <div className="k-alert" role="status">
            <strong>
              {result.reused
                ? t("Existing result recovered", "已讀取原有結果")
                : t("Demo redemption verified once", "已核實示範核銷一次")}
            </strong>
            <p>
              {t(
                "HKD 20 pending eligibility review. Nothing has been paid.",
                "HKD 20 等待資格審閱，尚未支付。",
              )}
            </p>
            <Link
              href={href(
                "merchants/dashboard/insights?outcome=" + result.outcome.id,
              )}
            >
              {t("See result and source", "查看成果及來源")} →
            </Link>
          </div>
        )}
      </section>
      <details className="cj-section">
        <summary>
          {t("Sample codes and exception states", "樣本代碼及例外狀態")}
        </summary>
        <p>
          DEMO-VALID · DEMO-EXPIRED · DEMO-FOREIGN · DEMO-USED · DEMO-UNCERTAIN
        </p>
        <p>
          {t(
            "An uncertain result stays unconfirmed. Check the existing attempt before trying again.",
            "結果未明會維持未確認，重試前須先核對現有操作。",
          )}
        </p>
      </details>
    </>
  );
}
function OutcomeDetail({
  outcome: o,
  merchant = false,
}: {
  outcome: c.Outcome;
  merchant?: boolean;
}) {
  const { t, locale, href } = useApp();
  return (
    <div className="k-modal-body">
      <State value={o.state} />
      <h2>{t("A recommendation, with evidence.", "一段推薦，一份證據。")}</h2>
      <ol className="k-source-timeline">
        <li>
          <span>{t("Route credit", "路線署名")}</span>
          <Link href={href("g/" + o.source.slug)}>
            Chloe · {t("Hong Kong route", "香港路線")} · v{o.source.version} ↗
          </Link>
        </li>
        <li>
          <span>{t("Eligible commercial context", "合資格商業來源")}</span>
          <strong>
            {t("Jamie · sample referral agreement", "Jamie・示範推薦合約")}
          </strong>
          <p>
            {t(
              "The contracted referral partner is separate from the credited route author.",
              "合約推薦伙伴與路線署名作者分開。",
            )}
          </p>
          <small>{o.contractId}</small>
          <p>{c.fixtureText(o.termsSnapshot, locale)}</p>
        </li>
        <li>
          <span>{t("Verified outcome", "已核實成果")}</span>
          <strong>
            {t("One matched offer redemption", "一次已配對優惠核銷")}
          </strong>
          <p>{o.verifiedAt}</p>
          {merchant && <p>{o.evidence}</p>}
          <small>{o.id}</small>
        </li>
        <li>
          <span>{t("Reward & adjustments", "報酬及調整")}</span>
          <strong>
            <Money
              currency="HKD"
              amount={o.state === "reversed" ? -o.reward : o.reward}
            />
          </strong>
          <p>
            {o.adjustmentReason ||
              t(
                "Awaiting authorised eligibility review",
                "等待授權人員審閱資格",
              )}
          </p>
        </li>
        <li>
          <span>{t("Payment", "付款")}</span>
          <strong>
            {t("No reconciled payment reference", "尚未有已對帳付款參考")}
          </strong>
          <p>
            {t(
              "Approval and eligibility do not send money.",
              "批准及符合資格均不會發送款項。",
            )}
          </p>
        </li>
      </ol>
    </div>
  );
}
function MerchantResults() {
  const { t, href, store, open } = useApp(),
    { data, error, refresh } = useCommerce(),
    q = useSearchParams(),
    [from, setFrom] = useState("2026-09-01"),
    [to, setTo] = useState("2026-12-31");
  if (!data) return <Load error={error} retry={refresh} />;
  const outcomes = data.outcomes.filter(
      (o) =>
        o.merchant === store.session?.id &&
        o.verifiedAt.slice(0, 10) >= from &&
        o.verifiedAt.slice(0, 10) <= to,
    ),
    claims = data.claims.filter(
      (c) =>
        c.merchant === store.session?.id &&
        c.createdAt.slice(0, 10) >= from &&
        c.createdAt.slice(0, 10) <= to,
    );
  return (
    <>
      <MerchantHeading
        title={t("Know what led to a result.", "了解每項成果的來源。")}
        body={t(
          "HKD · attributed results, not proof of incremental lift.",
          "HKD・歸因成果，並非已證實的增量效益。",
        )}
        action={false}
      />
      <div className="k-panel k-form cj-fields">
        <label>
          {t("From", "由")}
          <input
            type="date"
            max={to}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("To", "至")}
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <div className="cj-metrics four">
        <Metric
          name={t("Claims", "已領取")}
          value={claims.length}
          note={t("Interest only", "只代表興趣")}
        />
        <Metric
          name={t("Verified redemptions", "核實核銷")}
          value={outcomes.length}
          note={t("One result per claim", "每次領取一項結果")}
        />
        <Metric
          name={t("Reversed rewards", "已撤銷報酬")}
          value={outcomes.filter((o) => o.state === "reversed").length}
          note={t("History preserved", "保留歷史紀錄")}
        />
        <Metric
          name={t("Recorded eligible value", "已記錄合資格價值")}
          value={
            <Money
              currency="HKD"
              amount={outcomes
                .filter((o) => o.state === "eligible")
                .reduce((n, o) => n + o.spend, 0)}
            />
          }
          note={t(
            "Merchant value, not platform revenue",
            "商戶價值，並非平台收入",
          )}
        />
      </div>
      <section className="k-panel">
        <h2>{t("Outcome evidence", "成果證據")}</h2>
        {outcomes.length ? (
          outcomes.map((o) => (
            <div
              key={o.id}
              className={q.get("outcome") === o.id ? "cj-highlight" : ""}
            >
              <Row
                title={t(
                  "Harbour Studio · matched redemption",
                  "Harbour Studio・已配對核銷",
                )}
                body={o.verifiedAt.slice(0, 10)}
              >
                <State value={o.state} />
                <button
                  className="k-btn"
                  onClick={() =>
                    open(
                      t("Outcome source", "成果來源"),
                      <OutcomeDetail outcome={o} merchant />,
                    )
                  }
                >
                  {t("View source", "查看來源")}
                </button>
              </Row>
            </div>
          ))
        ) : (
          <Empty
            title={t(
              "No verified outcomes in this window",
              "此時段未有核實成果",
            )}
            body={t(
              "A claim or navigation click does not create a visit.",
              "領取優惠或點擊導航不會建立到訪紀錄。",
            )}
          >
            <Link className="k-btn" href={href("merchants/dashboard/redeem")}>
              {t("Try demo redemption", "試用示範核銷")}
            </Link>
          </Empty>
        )}
      </section>
      <div className="cj-columns cj-section">
        <section className="k-panel">
          <h3>{t("Costs & contribution", "成本及貢獻")}</h3>
          <dl className="cj-definition">
            <dt>{t("Actual campaign cost", "實際活動成本")}</dt>
            <dd>{t("Unavailable", "尚未接通")}</dd>
            <dt>{t("Creator eligible rewards", "創作者合資格報酬")}</dt>
            <dd>
              <Money
                currency="HKD"
                amount={outcomes
                  .filter((o) => o.state === "eligible")
                  .reduce((n, o) => n + o.reward, 0)}
              />
            </dd>
            <dt>{t("Platform recognised fees", "平台已確認費用")}</dt>
            <dd>{t("Unavailable", "尚未接通")}</dd>
            <dt>{t("Completed bookings / refunds", "已完成預訂／退款")}</dt>
            <dd>{t("Unavailable", "尚未接通")}</dd>
          </dl>
        </section>
        <section className="k-panel">
          <h3>{t("Before you repeat", "下次活動前")}</h3>
          <p>
            {t(
              "Review who acted, what was verified and the actual cost. Broader attribution coverage and unmatched events are unavailable until provider integration.",
              "先審閱誰採取行動、核實了甚麼，以及實際成本。完整歸因及未配對事件需待供應商整合。",
            )}
          </p>
          <Link className="k-btn" href={href("merchants/dashboard/post")}>
            {t("Draft the next campaign", "草擬下一個活動")}
          </Link>
        </section>
      </div>
    </>
  );
}
export function ConnectedOpportunities() {
  const { t, href, store } = useApp(),
    { data, error, refresh } = useCommerce();
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">{t("CREATOR STUDIO", "創作者工作室")}</p>
          <h1>{t("Good work, with clear terms.", "好的合作，清楚的條款。")}</h1>
        </div>
      </div>
      <StudioNav />
      <WorkspaceGate role="owner">
        {!data ? (
          <Load error={error} retry={refresh} />
        ) : (
          data.campaigns
            .filter((c) => c.state === "active")
            .map((campaign) => (
              <Opportunity
                key={campaign.id}
                campaign={campaign}
                participation={data.participants.find(
                  (p) =>
                    p.campaignId === campaign.id &&
                    p.creatorId === store.session?.id,
                )}
              />
            ))
        )}
        <section className="k-panel cj-section">
          <h2>{t("Other ways to contribute", "其他合作方式")}</h2>
          <div className="cj-creator-grid">
            {[
              [
                "studio/missions",
                "Paid missions",
                "付費任務",
                "Fixed work, reviewed deliverables and agreed fees.",
                "固定工作、審閱交付及約定費用。",
              ],
              [
                "studio/offers",
                "Affiliate referrals",
                "推薦佣金",
                "Provider-confirmed eligible outcomes; estimates are not earnings.",
                "由供應商確認合資格成果，預估不等於收益。",
              ],
              [
                "studio/receipts",
                "Receipt cashback",
                "收據回贈",
                "Private receipt evidence and a separate review; no live upload service.",
                "私人收據證明及獨立審閱，尚未接通正式上傳。",
              ],
            ].map(([p, en, zh, body, cn]) => (
              <div key={p}>
                <h3>{t(en, zh)}</h3>
                <p>{t(body, cn)}</p>
                <Link className="k-btn" href={href(p)}>
                  {t("Review details", "審閱詳情")} →
                </Link>
              </div>
            ))}
          </div>
        </section>
      </WorkspaceGate>
    </div>
  );
}
function Opportunity({
  campaign,
  participation: p,
}: {
  campaign: c.Campaign;
  participation?: c.Participation;
}) {
  const { t, locale, run, store, href } = useApp(),
    [submission, setSubmission] = useState("");
  return (
    <section className="k-panel cj-section">
      <div className="cj-between">
        <Chip>{c.campaignLabel(campaign, locale)}</Chip>
        {p && <State value={p.state} />}
      </div>
      <h2>{c.fixtureText(campaign.name, locale)}</h2>
      <p>{c.fixtureText(campaign.audience, locale)}</p>
      <p>{c.fixtureText(campaign.brief, locale)}</p>
      <div className="cj-next">
        <div>
          <h3>{t("What you will do", "你需要完成")}</h3>
          <p>{c.fixtureText(campaign.brief, locale)}</p>
          <dl className="cj-definition">
            <dt>
              {t(
                "Reward per eligible outcome · HKD",
                "每項合資格成果報酬・HKD",
              )}
            </dt>
            <dd>
              <Money currency="HKD" amount={campaign.reward} />
            </dd>
            <dt>{t("Valid until", "有效期至")}</dt>
            <dd>{campaign.validUntil}</dd>
          </dl>
          <p className="k-meta">
            {t(
              "Merchant-authored wording is kept in its original language. Confirm effort, eligibility and rights in the terms before joining.",
              "商戶撰寫的內容保留原有語言。參加前，請於條款確認工作量、資格及使用權。",
            )}
          </p>
          <p>{c.fixtureText(campaign.terms, locale)}</p>
          <p>
            {t(
              "Eligibility: relevant destination knowledge, original work and rights to the materials. Merchant reviews applications and work.",
              "資格：相關目的地知識、原創作品及素材使用權。商戶負責審閱申請及作品。",
            )}
          </p>
        </div>
      </div>
      {!p || ["shortlisted", "rejected"].includes(p.state) ? (
        <button
          className="k-btn primary"
          onClick={() =>
            run(() =>
              c.partnerAction(
                campaign.id,
                store.session!.id,
                "apply",
                "",
                m.id("apply"),
              ),
            )
          }
        >
          {t("Apply in demo", "提交示範申請")}
        </button>
      ) : p.state === "invited" ? (
        <button
          className="k-btn primary"
          onClick={() =>
            run(() =>
              c.partnerAction(
                campaign.id,
                store.session!.id,
                "accept",
                "",
                m.id("accept"),
              ),
            )
          }
        >
          {t("Accept demo invitation", "接受示範邀請")}
        </button>
      ) : ["active", "changes"].includes(p.state) ? (
        <form
          className="k-form cj-section"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              c.partnerAction(
                campaign.id,
                store.session!.id,
                "submit",
                submission,
                m.id("submission"),
              ),
            );
          }}
        >
          {p.feedback && <div className="k-alert">{p.feedback}</div>}
          <label>
            {t("Submission for merchant review", "供商戶審閱的作品")}
            <textarea
              value={submission}
              maxLength={2000}
              required
              onChange={(e) => setSubmission(e.target.value)}
              placeholder={t(
                "Describe your approved public content and deliverables. Do not paste private receipts.",
                "說明已批准公開內容及交付作品，請勿貼上私人收據。",
              )}
            />
          </label>
          <button className="k-btn primary">
            {t("Submit demo work", "提交示範作品")}
          </button>
        </form>
      ) : (
        <p>
          {p.state === "approved"
            ? t(
                "The work is approved in the demo. Commercial eligibility and payment require separate review.",
                "示範作品已批准，商業資格及付款需獨立審閱。",
              )
            : t(
                "Current reviewer: Harbour Studio. Your next task will appear after review.",
                "目前審閱人：Harbour Studio。審閱後會顯示你的下一步。",
              )}
        </p>
      )}
      <div className="k-actions cj-section">
        <Link className="k-btn" href={href("studio/outcomes")}>
          {t("Inspect earnings evidence", "查看收益證據")}
        </Link>
      </div>
    </section>
  );
}
export function ConnectedOutcomes() {
  const { t, store, open, href } = useApp(),
    { data, error, refresh } = useCommerce();
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <h1>{t("From outcome to earnings", "由成果到收益")}</h1>
        <Link className="k-btn" href={href("studio/earnings")}>
          {t("Full earnings history", "完整收益紀錄")}
        </Link>
      </div>
      <StudioNav />
      <WorkspaceGate role="owner">
        {!data ? (
          <Load error={error} retry={refresh} />
        ) : (
          <>
            <p>
              {t(
                "HKD · connected demo events. No withdrawable balance or live payment.",
                "HKD・已連結示範事件，並非可提取餘額或正式付款。",
              )}
            </p>
            {data.outcomes
              .filter((o) => o.partnerId === store.session?.id)
              .map((o) => (
                <section className="k-panel cj-section" key={o.id}>
                  <Row
                    title={t("Temple Street referral", "廟街推薦")}
                    body={t(
                      "Verified merchant redemption → authorised eligibility review",
                      "商戶核實核銷 → 授權資格審閱",
                    )}
                  >
                    <State value={o.state} />
                    <strong>
                      <Money
                        currency="HKD"
                        amount={o.state === "reversed" ? -o.reward : o.reward}
                      />
                    </strong>
                    <button
                      className="k-btn"
                      onClick={() =>
                        open(
                          t("Earning source", "收益來源"),
                          <OutcomeDetail outcome={o} />,
                        )
                      }
                    >
                      {t("View source", "查看來源")}
                    </button>
                  </Row>
                </section>
              ))}
            {!data.outcomes.some((o) => o.partnerId === store.session?.id) && (
              <Empty
                title={t(
                  "No connected demo earnings yet",
                  "暫未有已連結示範收益",
                )}
                body={t(
                  "Claims alone do not create earnings. A valid redemption is required.",
                  "領取優惠本身不會產生收益，需先有有效核銷。",
                )}
              >
                <Link className="k-btn" href={href("offers/demo-offer-hk")}>
                  {t("View sample offer", "查看示範優惠")}
                </Link>
              </Empty>
            )}
          </>
        )}
      </WorkspaceGate>
    </div>
  );
}
export function OpsEligibility() {
  const { t, store, run } = useApp(),
    { data, error, refresh } = useCommerce(),
    [reason, setReason] = useState("");
  if (store.session?.role !== "ops") return null;
  if (!data) return <Load error={error} retry={refresh} />;
  return (
    <section className="k-panel cj-section">
      <h2>{t("Connected demo eligibility review", "已連結示範資格審閱")}</h2>
      <p>
        {t(
          "Confirm the contract and event, or reverse with a reason. Neither action records a payment.",
          "確認合約及事件，或填寫原因撤銷。兩者均不會記錄付款。",
        )}
      </p>
      <label>
        {t("Review reason", "審閱原因")}
        <textarea
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {data.outcomes.map((o) => (
        <Row key={o.id} title={o.id}>
          <State value={o.state} />
          <button
            className="k-btn"
            disabled={!reason.trim() || o.state !== "pending"}
            onClick={() =>
              run(() =>
                c.reconcileEligibility(
                  o.id,
                  "eligible",
                  reason,
                  m.id("eligibility"),
                ),
              )
            }
          >
            {t("Confirm demo eligibility", "確認示範資格")}
          </button>
          <button
            className="k-btn danger"
            disabled={!reason.trim() || o.state === "reversed"}
            onClick={() =>
              run(() =>
                c.reconcileEligibility(
                  o.id,
                  "reversed",
                  reason,
                  m.id("reverse"),
                ),
              )
            }
          >
            {t("Reverse demo reward", "撤銷示範報酬")}
          </button>
        </Row>
      ))}
    </section>
  );
}
function BusinessTool({ section }: { section: string }) {
  const { t, href } = useApp();
  const names: Record<string, [string, string]> = {
    profile: ["Merchant profile", "商戶檔案"],
    experiences: ["Experience inventory", "體驗項目"],
    bookings: ["Merchant bookings", "商戶預訂"],
    budget: ["Campaign budget", "活動預算"],
  };
  const target: Record<string, string> = {
    profile: "profile",
    experiences: "experiences",
    bookings: "bookings",
    budget: "budget",
  };
  return (
    <>
      <MerchantHeading title={t(...names[section])} action={false} />
      <section className="k-panel">
        <h2>
          {t(
            "Continue in the existing Kinnso application",
            "在現有 Kinnso 應用程式繼續",
          )}
        </h2>
        <p>
          {t(
            "This operational tool uses the existing account and permissions. Sign in there if requested; seamless cross-site return is not connected.",
            "此業務工具使用現有帳戶及權限，如有需要請於原站登入，尚未接通跨站無縫返回。",
          )}
        </p>
        <a
          className="k-btn primary"
          href={
            "https://remix-kinnso-web.vercel.app/en/merchants/dashboard/" +
            target[section]
          }
          target="_blank"
          rel="noreferrer"
        >
          {t("Open existing business tool", "開啟現有業務工具")}
          <Icon name="external" />
        </a>
        <p className="k-meta">
          {t(
            "Source-verified route; live account access is not tested. No private data is passed in the URL.",
            "路線已核對原始碼，正式帳戶存取尚未測試。網址不會傳送私人資料。",
          )}
        </p>
        {section === "bookings" && (
          <Link className="k-btn" href={href("bookings")}>
            {t(
              "Review booking and refund demo states",
              "查看預訂及退款示範狀態",
            )}
          </Link>
        )}
        {section === "budget" && (
          <p>
            {t(
              "Funded campaign value, creator rewards and platform fees must be reported separately. No real balance is shown in this preview.",
              "活動資金、創作者報酬及平台費用需分開報告，此預覽不會顯示正式餘額。",
            )}
          </p>
        )}
      </section>
    </>
  );
}
export function CreatorShell({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  const { t, href } = useApp();
  return (
    <div className="cj-workspace cj-creator-shell">
      <aside className="cj-sidebar">
        <p className="k-eyebrow">{t("YOUR STUDIO", "你的工作室")}</p>
        <nav aria-label={t("Creator navigation", "創作者導航")}>
          {[
            ["studio", "Today", "今日", "compass"],
            ["studio/adventures", "My adventures", "我的旅程記錄", "map"],
            ["studio/opportunities", "Opportunities", "合作機會", "trip"],
            ["studio/earnings", "Earnings", "收益", "wallet"],
          ].map(([p, en, zh, icon]) => (
            <Link
              key={p}
              className={
                p === path ||
                (p === "studio/earnings" && path === "studio/outcomes")
                  ? "active"
                  : ""
              }
              href={href(p)}
            >
              <Icon name={icon} />
              {t(en, zh)}
            </Link>
          ))}
        </nav>
        <details className="cj-secondary">
          <summary>{t("Profile & tools", "檔案及工具")}</summary>
          {[
            ["record", "Record", "記錄"],
            ["studio/receipts", "Receipts", "收據"],
            ["studio/copilot", "Planning assistant", "規劃助理"],
            ["me", "Profile & connected accounts", "檔案及已連結帳戶"],
            ["help", "Support", "支援"],
          ].map(([p, en, zh]) => (
            <Link key={p} href={href(p)}>
              {t(en, zh)}
            </Link>
          ))}
        </details>
        <Link className="cj-leave" href={href("explore")}>
          ← {t("Explore as a traveller", "以旅人身份探索")}
        </Link>
      </aside>
      <div className="cj-work-content">{children}</div>
    </div>
  );
}
export function CanonicalContent({ path }: { path: string }) {
  const { t } = useApp(),
    label = path.startsWith("articles")
      ? t("Travel reads", "旅行閱讀")
      : path.startsWith("sessions")
        ? t("Sessions & events", "活動及分享會")
        : t("Local merchants", "在地商戶");
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <h1>{label}</h1>
      </div>
      <section className="k-panel">
        <h2>
          {t("Explore the existing Kinnso collection", "探索現有 Kinnso 內容")}
        </h2>
        <p>
          {t(
            "Continue to the original English application for this retained collection. Content and session availability are not connected to the demo.",
            "前往原有英文應用程式查看此保留內容，示範尚未接通內容及活動名額。",
          )}
        </p>
        <a
          className="k-btn primary"
          href={
            "https://remix-kinnso-web.vercel.app/en/" +
            path.split("/").map(encodeURIComponent).join("/")
          }
          target="_blank"
          rel="noreferrer"
        >
          {t("Open existing collection", "開啟現有內容")}
          <Icon name="external" />
        </a>
      </section>
    </div>
  );
}

function RetainedMissions() {
  const { t, store, open } = useApp();
  return (
    <section className="k-panel cj-section">
      <h2>{t("Photography mission submissions", "攝影任務提交")}</h2>
      <p>
        {t(
          "Retained creator work · HKD 240 subject to review. Approval does not create a payment.",
          "保留創作者作品・HKD 240 需經審閱。批准不會建立付款。",
        )}
      </p>
      {store.missions.length ? (
        store.missions.map((row) => (
          <Row
            key={row.owner + row.id}
            title={t("Kowloon, through your lens", "透過你的鏡頭，看見九龍。")}
            body={row.feedback || row.note}
          >
            <Chip>
              {
                {
                  submitted: t("Submitted", "已提交"),
                  review: t("Under review", "審閱中"),
                  approved: t("Approved · not paid", "已批准・未支付"),
                  rejected: t("Changes requested", "需要修改"),
                }[row.state]
              }
            </Chip>
            {["submitted", "review"].includes(row.state) && (
              <button
                className="k-btn"
                onClick={() =>
                  open(
                    t("Review photography submission", "審閱攝影作品"),
                    <RetainedMissionReview row={row} />,
                  )
                }
              >
                {t("Review submission", "審閱提交")}
              </button>
            )}
          </Row>
        ))
      ) : (
        <p>
          {t(
            "No photography submissions yet. Creators can submit from Paid missions.",
            "暫未有攝影作品提交，創作者可於付費任務提交。",
          )}
        </p>
      )}
    </section>
  );
}
function RetainedMissionReview({ row }: { row: m.Store["missions"][number] }) {
  const { t, run, close } = useApp(),
    [reason, setReason] = useState(""),
    key = useRef(m.id("mission-review"));
  function review(state: "approved" | "rejected") {
    if (
      run(
        () => m.reviewMission(row, state, reason, key.current),
        t("Demo review saved. Nothing was paid.", "示範審閱已儲存，尚未支付。"),
      )
    )
      close();
  }
  return (
    <div className="k-modal-body k-form">
      <p>{row.note}</p>
      <label>
        {t("Review feedback", "審閱意見")}
        <textarea
          maxLength={1000}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            key.current = m.id("mission-review");
          }}
        />
      </label>
      <p>
        {t(
          "Feedback is required when requesting changes.",
          "要求修改時須填寫意見。",
        )}
      </p>
      <div className="k-actions">
        <button className="k-btn primary" onClick={() => review("approved")}>
          {t("Approve demo work", "批准示範作品")}
        </button>
        <button
          className="k-btn"
          disabled={!reason.trim()}
          onClick={() => review("rejected")}
        >
          {t("Request changes", "要求修改")}
        </button>
      </div>
    </div>
  );
}
