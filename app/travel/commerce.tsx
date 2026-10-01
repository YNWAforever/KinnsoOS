"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as m from "./model";
import { Chip, Empty, Icon, Money, download, useApp } from "./ui";
import { AdventureCard } from "./explore";
import { exportCommerce, clearCommerce } from "./connected-model";
import { StudioNav } from "./editing";
function Gate({
  children,
  roles = ["owner"],
}: {
  children: React.ReactNode;
  roles?: m.Role[];
}) {
  const { t, store, auth, href, ready } = useApp();
  if (!ready)
    return <p role="status">{t("Loading account…", "正在載入帳戶⋯")}</p>;
  if (!store.session)
    return (
      <Empty title={t("Open your demo workspace", "開啟你的示範工作區")}>
        <button className="k-btn primary" onClick={() => auth()}>
          {t("Enter demo account", "進入示範帳戶")}
        </button>
      </Empty>
    );
  if (!roles.includes(store.session.role))
    return (
      <Empty
        title={t(
          "This workspace is not available to this account",
          "此帳戶沒有此工作區的存取權",
        )}
      >
        <Link className="k-btn" href={href("me")}>
          {t("My account", "我的帳戶")}
        </Link>
      </Empty>
    );
  return <>{children}</>;
}
export function EarningsPage() {
  const { t, locale, href, run, store, open, close } = useApp(),
    [currency, setCurrency] = useState<"HKD" | "JPY">("HKD"),
    [from, setFrom] = useState("2026-09-01"),
    [to, setTo] = useState("2026-09-30");
  const view = m.earningsView(currency, from, to),
    requests = store.payouts.filter(
      (p) => p.owner === store.session?.id && p.currency === currency,
    );
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">CREATOR STUDIO</p>
          <h1>{t("Your journeys. Your earnings.", "你的旅程，你的收益。")}</h1>
        </div>
        <Link className="k-btn" href={href("studio/missions")}>
          <Icon name="spark" />
          {t("Find opportunities", "尋找合作機會")}
        </Link>
      </div>
      <StudioNav />
      <Gate>
        <p>
          <Link className="k-btn" href={href("studio/outcomes")}>
            {t("Connected outcome earnings", "已連結成果收益")} →
          </Link>
        </p>
        <div className="k-earnings-filter">
          <div>
            <label>
              {t("From", "由")}
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <span>—</span>
            <label>
              {t("To", "至")}
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <select
            aria-label={t("Earnings currency", "收益貨幣")}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "HKD" | "JPY")}
          >
            <option>HKD</option>
            <option>JPY</option>
          </select>
        </div>
        <div className="k-earnings-summary">
          {[
            [view.pending, "Awaiting confirmation", "待確認", "clock"],
            [view.eligible, "Ready to settle", "可結算", "wallet"],
            [view.paid, "Paid", "已支付", "check"],
          ].map(([amount, en, zh, icon], i) => (
            <div className={i === 1 ? "featured" : ""} key={String(en)}>
              <div>
                <span>{t(String(en), String(zh))}</span>
                <Icon name={String(icon)} />
              </div>
              <strong>
                <Money amount={Number(amount)} currency={currency} />
              </strong>
              <p>
                {i === 0
                  ? t(
                      "Waiting for supplier or mission review",
                      "等待供應商或任務確認",
                    )
                  : i === 1
                    ? t(
                        "After refunds and existing reservations",
                        "已計入退款及現有款項申請",
                      )
                    : t("Confirmed payment history", "已確認的付款歷史")}
              </p>
            </div>
          ))}
        </div>
        <div className="k-earnings-secondary">
          <span>
            {t("Estimated, not confirmed", "預估，尚未確認")}{" "}
            <strong>
              <Money amount={view.estimated} currency={currency} />
            </strong>
          </span>
          <span>
            {t("In progress", "處理中")}{" "}
            <strong>
              <Money amount={view.reserved} currency={currency} />
            </strong>
          </span>
          <span>
            {t("Refunds & adjustments", "退款及調整")}{" "}
            <strong>
              <Money amount={view.adjustment} currency={currency} />
            </strong>
          </span>
        </div>
        <div className="k-section-title">
          <div>
            <h2>{t("Every amount has a story", "每一筆收益，都有來源。")}</h2>
            <p>
              {t(
                "Illustrative transactions, shown in one currency at a time.",
                "示範交易資料，每次以單一貨幣顯示。",
              )}
            </p>
          </div>
          <button
            className="k-btn primary"
            disabled={
              view.eligible <= 0 ||
              requests.some(
                (p) => !["failed", "cancelled"].includes(p.state),
              ) ||
              from !== "2026-09-01" ||
              to !== "2026-09-30"
            }
            onClick={() =>
              open(
                t("Preview a settlement request", "預覽結算申請"),
                <div className="k-modal-body">
                  <p>
                    {t(
                      "Reserve the eligible September demo balance for processing. No money will be transferred.",
                      "將九月份可結算的示範餘額列入處理，不會轉移任何款項。",
                    )}
                  </p>
                  <h2>
                    <Money amount={view.eligible} currency={currency} />
                  </h2>
                  <button
                    className="k-btn primary"
                    onClick={() => {
                      if (
                        run(
                          () => m.payout(currency, m.id("payout")),
                          t(
                            "Demo balance reserved for processing",
                            "示範餘額已列入處理",
                          ),
                        )
                      ) {
                        close();
                      }
                    }}
                  >
                    {t("Request demo settlement", "申請示範結算")}
                  </button>
                </div>,
              )
            }
          >
            {t("Request settlement", "申請結算")}
            <Icon name="arrow" />
          </button>
        </div>
        {requests.map((p) => (
          <div className="k-info-panel" key={p.id}>
            <Icon name="clock" />
            <div>
              <strong>{t("Your settlement request", "你的結算申請")}</strong>
              <p>
                <Money amount={p.amount} currency={p.currency} /> ·{" "}
                {p.allocations.length} {t("linked entries", "項已連結明細")}
              </p>
            </div>
            <Chip>
              {
                {
                  reserved: m.w("Reserved", "已保留"),
                  failed: m.w("Failed", "未能完成"),
                  cancelled: m.w("Cancelled", "已取消"),
                  uncertain: m.w("Being reconciled", "核對中"),
                }[p.state][locale]
              }
            </Chip>
          </div>
        ))}
        {!view.entries.length ? (
          <Empty
            title={t("No earnings in this range", "此日期範圍沒有收益紀錄")}
          />
        ) : (
          <div className="k-table-wrap">
            <table className="k-table">
              <thead>
                <tr>
                  <th>{t("Source", "收益來源")}</th>
                  <th>{t("Date", "日期")}</th>
                  <th>{t("Status", "狀態")}</th>
                  <th>{t("Amount", "金額")}</th>
                  <th>
                    <span className="k-sr-only">{t("Details", "明細")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.title[locale]}</strong>
                      <span>{e.stop}</span>
                    </td>
                    <td>{e.date}</td>
                    <td>
                      <Chip
                        tone={
                          e.state === "paid" || e.state === "eligible"
                            ? "green"
                            : e.state.includes("hold")
                              ? "amber"
                              : ""
                        }
                      >
                        {m.labels[e.state][locale]}
                      </Chip>
                    </td>
                    <td className={e.amount < 0 ? "k-negative" : ""}>
                      <Money amount={e.amount} currency={e.currency} />
                    </td>
                    <td>
                      <button
                        className="k-icon-btn"
                        aria-label={`${t("Details", "明細")} ${e.title[locale]}`}
                        onClick={() =>
                          open(
                            t("Earning details", "收益明細"),
                            <EarningDetail entry={e} />,
                          )
                        }
                      >
                        <Icon name="chevron" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Gate>
    </div>
  );
}
function EarningDetail({ entry: e }: { entry: m.Earning }) {
  const { t, locale, href, store } = useApp(),
    original = e.adjusts
      ? m.earnings.find((x) => x.id === e.adjusts)
      : undefined,
    allocation = store.payouts.find((p) => p.allocations.includes(e.id));
  return (
    <div className="k-modal-body">
      <Chip>{m.labels[e.state][locale]}</Chip>
      <h2>{e.title[locale]}</h2>
      <div className="k-big-money">
        <Money amount={e.amount} currency={e.currency} />
      </div>
      <ol className="k-source-timeline">
        <li>
          <span>{t("Adventure", "公開路線")}</span>
          <Link href={href("g/" + e.slug)}>
            {m.fixtures.find((a) => a.slug === e.slug)?.title[locale]} ↗
          </Link>
        </li>
        <li>
          <span>{t("Stop", "站點")}</span>
          <strong>{e.stop}</strong>
        </li>
        <li>
          <span>{t("Commercial source", "商業來源")}</span>
          <strong>
            {t(
              "Illustrative creator mission · Harbour Studio",
              "示範創作者任務・Harbour Studio",
            )}
          </strong>
          <p>
            {t(
              "A click or a save does not confirm earnings.",
              "點擊或收藏不代表已確認收益。",
            )}
          </p>
        </li>
        <li>
          <span>{t("Confirmation & adjustments", "確認及調整")}</span>
          <strong>{m.labels[e.state][locale]}</strong>
          {original && (
            <p>
              {t("Linked to original paid entry", "連結原有已支付明細")}{" "}
              {original.id}：
              <Money amount={original.amount} currency={original.currency} />.{" "}
              {t(
                "The original payment remains in history.",
                "原付款保留於歷史中。",
              )}
            </p>
          )}
          {e.state === "reconciliation_hold" && (
            <p>
              {t(
                "The payment result is uncertain. Check the existing provider reference before any retry.",
                "付款結果尚未確定，重試前需先核對現有供應商參考。",
              )}
            </p>
          )}
        </li>
        <li>
          <span>{t("Settlement / payment", "結算／付款")}</span>
          <strong>
            {e.reference ||
              allocation?.id ||
              t("No confirmed payment reference", "尚未有已確認付款參考")}
          </strong>
          {allocation && (
            <p>
              {t(
                "This entry is already allocated to the request.",
                "此明細已列入現有申請。",
              )}
            </p>
          )}
        </li>
      </ol>
      <details>
        <summary>{t("Reference details", "參考資料")}</summary>
        <p>
          {e.id} · DEMO-MISSION-01 · {e.date}
        </p>
      </details>
    </div>
  );
}
export function OpportunitiesPage({ initial }: { initial?: string }) {
  const { t, locale, href, store, run, notify } = useApp(),
    [tab, setTab] = useState(
      initial === "receipts"
        ? "receipts"
        : initial === "offers"
          ? "offers"
          : "missions",
    ),
    [note, setNote] = useState(""),
    [receipt, setReceipt] = useState<File | null>(null);
  const mission = store.missions.find(
    (m) => m.id === "demo-mission-01" && m.owner === store.session?.id,
  );
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">CREATOR STUDIO</p>
          <h1>{t("Make more of your journey", "讓旅程，走得更遠。")}</h1>
        </div>
      </div>
      <StudioNav />
      <Gate>
        <div className="k-tabs">
          {[
            ["missions", "Missions", "合作任務"],
            ["offers", "Relevant offers", "相關優惠"],
            ["receipts", "Receipt submissions", "收據提交"],
          ].map(([value, en, zh]) => (
            <button
              className={tab === value ? "active" : ""}
              key={value}
              onClick={() => setTab(value)}
            >
              {t(en, zh)}
            </button>
          ))}
        </div>
        {tab === "missions" ? (
          <div className="k-opportunity-layout">
            <section className="k-panel">
              <div className="k-actions">
                <Chip tone="green">{t("Photography mission", "攝影任務")}</Chip>
                <Chip>{t("Demo brief", "示範簡介")}</Chip>
              </div>
              <h2>
                {t("Kowloon, through your lens", "透過你的鏡頭，看見九龍。")}
              </h2>
              <p>
                {t(
                  "Harbour Studio is looking for a short neighbourhood photo story around Temple Street.",
                  "Harbour Studio 邀請你以廟街一帶的街區故事，製作短篇攝影記錄。",
                )}
              </p>
              <dl className="k-facts-list">
                <div>
                  <dt>{t("Content", "內容")}</dt>
                  <dd>
                    {t(
                      "3 selected photos + a short original note",
                      "3 張自選照片及一段原創筆記",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("Demo reward", "示範報酬")}</dt>
                  <dd>HK$240 · {t("subject to review", "需經審閱")}</dd>
                </div>
                <div>
                  <dt>{t("Submit by", "提交日期")}</dt>
                  <dd>2026-09-30 · Asia/Hong_Kong</dd>
                </div>
              </dl>
              <details className="k-story">
                <summary>
                  {t("Requirements, rights & disclosure", "要求、權利及披露")}
                </summary>
                <p>
                  {t(
                    "This is an illustrative mission only. Submit original work you may share. Identify any commercial partnership. Review is required; submission does not approve earnings. No live merchant campaign is available here.",
                    "此任務僅供示範。請只提交你有權分享的原創內容，並披露商業合作。提交後需經審閱，不代表已批准收益。此處未接通正式商戶活動。",
                  )}
                </p>
              </details>
              <form
                className="k-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => m.submitMission(note, m.id("mission")),
                    t(
                      "Demo mission submitted for review",
                      "示範任務已提交審閱",
                    ),
                  );
                }}
              >
                <label>
                  {t("Your submission note", "提交筆記")}
                  <textarea
                    required
                    maxLength={2000}
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t(
                      "Describe the work and where the photos can be reviewed.",
                      "描述內容，以及審閱照片的位置。",
                    )}
                  />
                </label>
                <div className="k-actions">
                  {mission?.feedback && <p role="status">{mission.feedback}</p>}
                  <button className="k-btn primary" type="submit">
                    {mission
                      ? t("Update demo submission", "更新示範提交")
                      : t("Submit demo for review", "提交示範作審閱")}
                  </button>
                  {mission && (
                    <Chip>
                      {mission.state === "submitted"
                        ? t("Submitted", "已提交")
                        : mission.state === "review"
                          ? t("Under review", "審閱中")
                          : mission.state === "approved"
                            ? t("Approved in demo", "示範已批准")
                            : t("Changes needed", "需要修改")}
                    </Chip>
                  )}
                </div>
              </form>
            </section>
            <aside className="k-panel k-growth-advice">
              <Icon name="spark" size={28} />
              <h2>{t("Your next useful step", "下一步，可以這樣做。")}</h2>
              <p>
                {t(
                  "This mission matches the Hong Kong route. Add your original photos and a practical stop tip before submitting.",
                  "此任務與香港路線相關。提交前，可補上原創照片及實用站點提示。",
                )}
              </p>
              <Link
                className="k-btn"
                href={href("g/hong-kong-after-last-train")}
              >
                {t("Open the route", "開啟路線")}
                <Icon name="arrow" />
              </Link>
              <p className="k-meta">
                {t(
                  "No growth guarantee or projected income is assumed.",
                  "不假設收入增長或保證收益。",
                )}
              </p>
            </aside>
          </div>
        ) : tab === "offers" ? (
          <>
            <div className="k-info-panel">
              <Icon name="info" />
              <div>
                <h3>{t("Offers should fit the stop", "優惠應該配合站點。")}</h3>
                <p>
                  {t(
                    "No live eligible merchant offer is connected. The Temple Street demo shows where a disclosed commercial opportunity belongs.",
                    "尚未接通可使用的正式商戶優惠。廟街示範展示如何在相關站點呈現已披露的商業機會。",
                  )}
                </p>
                <Link href={href("g/hong-kong-after-last-train")}>
                  {t("View the related stop", "查看相關站點")} →
                </Link>
              </div>
            </div>
            <Empty
              title={t("No live offers to redeem", "暫未有可兌換的正式優惠")}
              body={t(
                "Mission submissions remain available in the demo.",
                "你仍可操作示範任務提交。",
              )}
            />
          </>
        ) : (
          <section className="k-panel k-form">
            <h2>{t("Submit a receipt for review", "提交收據作審閱")}</h2>
            <p>
              {t(
                "Receipt review is separate from your private travel journal. This demo stores the filename only.",
                "收據審核與私人旅程記錄分開處理。此示範只儲存檔名。",
              )}
            </p>
            <label>
              {t("Receipt file", "收據檔案")}
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] || null)}
              />
            </label>
            <button
              className="k-btn primary"
              disabled={!receipt}
              onClick={() => {
                if (!receipt) return;
                if (receipt.size > 5 * 1024 * 1024) {
                  notify(
                    t("Choose a file under 5 MB.", "請選擇 5 MB 以下檔案。"),
                    true,
                  );
                  return;
                }
                run(
                  () =>
                    m.command(
                      "receipt:" + m.id("receipt"),
                      { name: receipt.name },
                      (s) => {
                        if (s.session!.role !== "owner")
                          throw new m.AppError("FORBIDDEN");
                        const r = {
                          id: m.id("receipt"),
                          owner: s.session!.id,
                          name: receipt.name,
                          state: "submitted" as const,
                        };
                        s.receipts.push(r);
                        return r;
                      },
                    ),
                  t(
                    "Demo receipt submitted; no cashback is confirmed",
                    "示範收據已提交，尚未確認任何回贈",
                  ),
                );
              }}
            >
              {t("Submit demo receipt", "提交示範收據")}
            </button>
            {store.receipts
              .filter((r) => r.owner === store.session?.id)
              .map((r) => (
                <div className="k-list-row" key={r.id}>
                  <strong>{r.name}</strong>
                  <Chip>{t("Awaiting review", "等待審閱")}</Chip>
                </div>
              ))}
          </section>
        )}
      </Gate>
    </div>
  );
}
const bookingLabels: Record<string, m.I18n> = {
  creating_hold: m.w("Creating hold", "正在保留名額"),
  held: m.w("Held", "已保留名額"),
  payment_pending: m.w("Payment pending", "等待付款"),
  confirmed: m.w("Confirmed by supplier", "供應商已確認"),
  failed: m.w("Failed", "未能完成"),
  expired: m.w("Hold expired", "保留已過期"),
  refunding: m.w("Refund in progress", "退款處理中"),
  refunded: m.w("Refunded", "已退款"),
  needs_reconciliation: m.w("Result being checked", "結果核對中"),
};
export function BookingsPage({ embedded = false }: { embedded?: boolean }) {
  const { t, locale, href, store, notify } = useApp(),
    [state, setState] = useState("payment_pending"),
    [reference, setReference] = useState(""),
    [support, setSupport] = useState(false);
  const body = (
    <>
      <div className="k-info-panel compact">
        <Icon name="info" />
        <p>
          {t(
            "Booking examples only. Live inventory and payments are not connected.",
            "預訂資料只作示範，尚未接通即時名額及付款服務。",
          )}
        </p>
      </div>
      <div className="k-booking-grid">
        <article className="k-panel">
          <div className="k-actions">
            <Chip tone="amber">{bookingLabels[state][locale]}</Chip>
            <span className="k-meta">DEMO-BOOKING-01</span>
          </div>
          <h2>{t("Kyoto neighbourhood walk", "京都街區散步")}</h2>
          <p>
            {t(
              "Demo provider: Kyoto Walking Studio",
              "示範供應商：Kyoto Walking Studio",
            )}
          </p>
          <dl className="k-facts-list">
            <div>
              <dt>{t("Service date", "服務日期")}</dt>
              <dd>2026-10-15 · 10:00 · Asia/Tokyo</dd>
            </div>
            <div>
              <dt>{t("Purchase date", "訂購日期")}</dt>
              <dd>2026-09-08</dd>
            </div>
            <div>
              <dt>{t("Payment", "付款")}</dt>
              <dd>
                {["confirmed", "refunding", "refunded"].includes(state)
                  ? t("Demo payment recorded", "已記錄示範付款")
                  : state === "needs_reconciliation"
                    ? t("Uncertain; do not pay again", "未確定，請勿重複付款")
                    : t("Not confirmed", "尚未確認")}
              </dd>
            </div>
            <div>
              <dt>{t("Supplier confirmation", "供應商確認")}</dt>
              <dd>
                {state === "confirmed"
                  ? t("Confirmed in demo", "示範已確認")
                  : t("Not confirmed", "尚未確認")}
              </dd>
            </div>
          </dl>
          <details className="k-story">
            <summary>{t("Demo booking conditions", "示範預訂條款")}</summary>
            <p>
              {t(
                "Illustrative booking only. A payment result and a supplier confirmation are distinct. No ticket is issued. Expired holds cannot be used. Refunds require a confirmed supplier response.",
                "只作示範。付款結果與供應商確認為不同狀態，不會發出正式票券。過期保留不能使用，退款需有供應商確認回應。",
              )}
            </p>
          </details>
          <div className="k-actions">
            <button className="k-btn" disabled>
              {t("Live booking unavailable", "暫未能正式預訂")}
            </button>
            {state === "confirmed" && (
              <button className="k-btn" onClick={() => setState("refunding")}>
                {t("Preview refund request", "預覽退款申請")}
              </button>
            )}
          </div>
          <details className="k-diagnostics">
            <summary>
              {t("Explore demo booking states", "查看示範預訂狀態")}
            </summary>
            <label>
              {t("Booking status", "預訂狀態")}
              <select value={state} onChange={(e) => setState(e.target.value)}>
                {Object.entries(bookingLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label[locale]}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {state === "held"
                ? t(
                    "Demo hold: review the service time before progressing. This is not an active reservation.",
                    "示範保留：請先核對服務時間，這不是有效預訂。",
                  )
                : state === "expired"
                  ? t(
                      "This hold cannot be extended. A new availability check is required.",
                      "此保留不能延續，需要重新確認名額。",
                    )
                  : state === "needs_reconciliation"
                    ? t(
                        "Check the existing attempt. Do not submit a second payment.",
                        "請核對現有操作，勿提交第二次付款。",
                      )
                    : t(
                        "This selector changes a fixture only.",
                        "此選項只切換示範資料。",
                      )}
            </p>
          </details>
        </article>
        <article className="k-panel">
          <Chip>{t("Historical record", "歷史紀錄")}</Chip>
          <h2>{t("Hong Kong experience", "香港旅遊體驗")}</h2>
          <p>
            {t("Demo provider: Harbour Studio", "示範供應商：Harbour Studio")}
          </p>
          <dl className="k-facts-list">
            <div>
              <dt>{t("Service date", "服務日期")}</dt>
              <dd>{t("Service date to confirm", "服務日期待確認")}</dd>
            </div>
            <div>
              <dt>{t("Purchase date", "訂購日期")}</dt>
              <dd>2026-08-20</dd>
            </div>
          </dl>
          <p>
            {t(
              "The purchase date is not used as the travel date.",
              "訂購日期不會當作服務日期。",
            )}
          </p>
          <button className="k-btn" onClick={() => setSupport(!support)}>
            {t("Get booking help", "查詢預訂支援")}
          </button>
          {support && (
            <div className="k-form">
              <label>
                {t("Your question (demo)", "你的問題（示範）")}
                <textarea
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <button
                className="k-btn"
                disabled={!reference.trim()}
                onClick={() => {
                  download("kinnso-support-draft.txt", reference);
                  notify(
                    t(
                      "Support draft downloaded. Nothing was sent.",
                      "已下載查詢草稿，尚未送出。",
                    ),
                  );
                }}
              >
                {t("Download support draft", "下載查詢草稿")}
              </button>
            </div>
          )}
        </article>
      </div>
    </>
  );
  return embedded ? (
    <div>
      <Gate roles={["owner", "editor", "viewer"]}>{body}</Gate>
    </div>
  ) : (
    <div className="k-page">
      <div className="k-page-heading">
        <h1>{t("My bookings", "我的預訂")}</h1>
        <Link className="k-text-btn" href={href("trips")}>
          {t("Back to trips", "返回行程")} →
        </Link>
      </div>
      <Gate roles={["owner", "editor", "viewer"]}>{body}</Gate>
    </div>
  );
}
export function OperationsPage({ kind }: { kind: "merchant" | "ops" }) {
  const { t, locale, store, run, notify } = useApp(),
    [tab, setTab] = useState(kind === "merchant" ? "missions" : "content"),
    [selected, setSelected] = useState("media"),
    [result, setResult] = useState(""),
    [code, setCode] = useState("");
  const errorRows = [
    [
      "media",
      "Photo processing failed",
      "照片處理失敗",
      "One file is unsupported; other files remain ready.",
      "一個檔案格式不支援，其他素材仍保留。",
    ],
    [
      "ai",
      "Organising request failed",
      "整理請求失敗",
      "The original journal is safe. A new review is required.",
      "原始記錄仍保留，需要重新審閱。",
    ],
    [
      "publication",
      "Publication incomplete",
      "公開內容尚未完整",
      "A selected stop still has no confirmed location.",
      "一個已選站點的位置仍待確認。",
    ],
    [
      "search",
      "Search update delayed",
      "搜尋更新延遲",
      "The demo publication is saved; indexing needs retry.",
      "示範公開版本已保存，搜尋更新需要重試。",
    ],
  ];
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">
            {t("ISOLATED DEMO WORKSPACE", "獨立示範工作區")}
          </p>
          <h1>
            {kind === "merchant"
              ? t("Merchant workspace", "商戶工作區")
              : t("Operations workspace", "營運工作區")}
          </h1>
        </div>
        <Chip>{kind === "merchant" ? "Harbour Studio" : "Kinnso Ops"}</Chip>
      </div>
      <Gate roles={[kind]}>
        <div className="k-tabs">
          {(kind === "merchant"
            ? [
                ["missions", "Mission review", "任務審閱"],
                ["redemption", "Redemption", "核銷"],
              ]
            : [
                ["content", "Content & jobs", "內容及工作"],
                ["conversions", "Conversions", "交易例外"],
                ["payouts", "Reconciliation", "款項對帳"],
              ]
          ).map(([value, en, zh]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => {
                setTab(value);
                setResult("");
              }}
            >
              {t(en, zh)}
            </button>
          ))}
        </div>
        {kind === "merchant" && tab === "missions" ? (
          <section className="k-panel">
            <h2>{t("Temple Street photo mission", "廟街攝影任務")}</h2>
            {!store.missions.length ? (
              <Empty
                title={t("No submissions yet", "暫未收到提交")}
                body={t(
                  "Submit the demo mission from the creator account first.",
                  "請先透過創作者示範帳戶提交任務。",
                )}
              />
            ) : (
              store.missions.map((row) => (
                <div className="k-mission-review" key={row.owner + row.id}>
                  <Chip>
                    {
                      {
                        submitted: m.w("Submitted", "已提交"),
                        review: m.w("Under review", "審閱中"),
                        approved: m.w("Approved in demo", "示範已批准"),
                        rejected: m.w("Changes needed", "需要修改"),
                      }[row.state][locale]
                    }
                  </Chip>
                  <p>{row.note}</p>
                  <div className="k-actions">
                    {(["review", "approved", "rejected"] as const).map(
                      (state) => (
                        <button
                          className="k-btn"
                          key={state}
                          onClick={() =>
                            run(
                              () =>
                                m.command(
                                  "merchantReview:" + m.id("review"),
                                  { id: row.id, owner: row.owner, state },
                                  (s) => {
                                    if (s.session!.role !== "merchant")
                                      throw new m.AppError("FORBIDDEN");
                                    const target = s.missions.find(
                                      (m) =>
                                        m.id === row.id &&
                                        m.owner === row.owner,
                                    )!;
                                    target.state = state;
                                    return target;
                                  },
                                ),
                              t(
                                "Demo review updated; no earnings approved automatically",
                                "已更新示範審閱，不會自動批准收益",
                              ),
                            )
                          }
                        >
                          {state === "review"
                            ? t("Review", "審閱中")
                            : state === "approved"
                              ? t("Approve demo", "批准示範")
                              : t("Request changes", "要求修改")}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        ) : kind === "merchant" ? (
          <section className="k-panel k-form">
            <h2>{t("Check a redemption", "核對核銷紀錄")}</h2>
            <p>
              {t(
                "Use DEMO-VALID to try a valid code. No real benefit is redeemed.",
                "可用 DEMO-VALID 體驗有效編號，不會兌換真實優惠。",
              )}
            </p>
            <label>
              {t("Demo redemption code", "示範核銷編號")}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={80}
              />
            </label>
            <button
              className="k-btn primary"
              onClick={() =>
                setResult(
                  code === "DEMO-VALID"
                    ? t(
                        "Demo validation passed. Merchant: Harbour Studio. No live redemption performed.",
                        "示範核對通過，商戶：Harbour Studio。未執行正式核銷。",
                      )
                    : t(
                        "Code not found. Check the code and try again.",
                        "找不到編號，請核對後重試。",
                      ),
                )
              }
            >
              {t("Check demo code", "核對示範編號")}
            </button>
          </section>
        ) : tab === "content" ? (
          <div className="k-ops-grid">
            <div>
              {errorRows.map(([value, en, zh, body, cn]) => (
                <button
                  className={`k-issue ${selected === value ? "active" : ""}`}
                  key={value}
                  onClick={() => {
                    setSelected(value);
                    setResult("");
                  }}
                >
                  <Icon name="info" />
                  <div>
                    <strong>{t(en, zh)}</strong>
                    <p>{t(body, cn)}</p>
                  </div>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
            <section className="k-panel">
              <Chip tone="amber">{t("Needs attention", "需要跟進")}</Chip>
              <h2>
                {t(
                  errorRows.find((r) => r[0] === selected)![1],
                  errorRows.find((r) => r[0] === selected)![2],
                )}
              </h2>
              <p>
                {t(
                  errorRows.find((r) => r[0] === selected)![3],
                  errorRows.find((r) => r[0] === selected)![4],
                )}
              </p>
              <button
                className="k-btn primary"
                onClick={() => {
                  const r = run(() => {
                    m.check();
                    return true;
                  });
                  if (r)
                    setResult(
                      t(
                        "Demo retry recorded. The required input still needs correction; no live job ran.",
                        "已記錄示範重試，所需輸入仍待修正，沒有執行正式工作。",
                      ),
                    );
                }}
              >
                {t("Retry demo job", "重試示範工作")}
              </button>
            </section>
          </div>
        ) : tab === "conversions" ? (
          <section className="k-panel">
            <Chip tone="amber">
              {t("Unmatched supplier event", "未配對供應商紀錄")}
            </Chip>
            <h2>DEMO-CONVERSION-09</h2>
            <p>
              {t(
                "JPY 4,200 · no matching confirmed booking. Do not create a commission from this event.",
                "JPY 4,200・未找到已確認預訂，不可由此紀錄直接建立佣金。",
              )}
            </p>
            <label>
              {t("Investigation note", "調查筆記")}
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={1000}
              />
            </label>
            <button
              className="k-btn"
              disabled={!code.trim()}
              onClick={() =>
                setResult(
                  t(
                    "Demo note recorded for investigation. The conversion stays unmatched.",
                    "已記錄示範調查筆記，交易維持未配對。",
                  ),
                )
              }
            >
              {t("Record demo note", "記錄示範筆記")}
            </button>
          </section>
        ) : (
          <>
            <div className="k-info-panel">
              <Icon name="info" />
              <p>
                {t(
                  "Uncertain payment results must be reconciled with the existing attempt. No pay-again action is available.",
                  "付款結果未確定時，需核對現有操作，不提供再次派款操作。",
                )}
              </p>
            </div>
            <div className="k-table-wrap">
              <table className="k-table">
                <thead>
                  <tr>
                    <th>{t("Batch", "款項批次")}</th>
                    <th>{t("Amount", "金額")}</th>
                    <th>{t("Status", "狀態")}</th>
                    <th>{t("Action", "操作")}</th>
                  </tr>
                </thead>
                <tbody>
                  {store.payouts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.id}
                        <small>{p.allocations.join(" · ")}</small>
                      </td>
                      <td>
                        <Money currency={p.currency} amount={p.amount} />
                      </td>
                      <td>
                        {
                          {
                            reserved: m.w("Reserved", "已保留"),
                            failed: m.w("Failed", "未能完成"),
                            cancelled: m.w("Cancelled", "已取消"),
                            uncertain: m.w("Being reconciled", "核對中"),
                          }[p.state][locale]
                        }
                      </td>
                      <td>
                        <button
                          className="k-btn"
                          onClick={() =>
                            setResult(
                              t(
                                "Existing request and allocations loaded. A provider reference is required; no payment was sent.",
                                "已載入現有申請及分配明細，仍需供應商參考；尚未派款。",
                              ),
                            )
                          }
                        >
                          {t("Review", "審閱")}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {[
                    ["DEMO-BATCH-02", "HKD", "320", "Reserved", "已保留"],
                    ["DEMO-BATCH-03", "HKD", "90", "Uncertain", "結果未確定"],
                    [
                      "DEMO-BATCH-04",
                      "JPY",
                      "0",
                      "No allocations",
                      "沒有分配明細",
                    ],
                  ].map(([id, currency, amount, en, zh]) => (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>
                        <Money currency={currency} amount={Number(amount)} />
                      </td>
                      <td>{t(en, zh)}</td>
                      <td>
                        <button
                          className="k-btn"
                          onClick={() =>
                            setResult(
                              id === "DEMO-BATCH-04"
                                ? t(
                                    "No allocations. Marking paid is blocked.",
                                    "沒有有效分配明細，不能標示已支付。",
                                  )
                                : t(
                                    "Provider payment reference is still required. The existing attempt remains under reconciliation; no money was sent.",
                                    "仍需供應商付款參考，現有操作維持核對中，未發送款項。",
                                  ),
                            )
                          }
                        >
                          {t("Review", "審閱")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {result && (
          <div className="k-alert" role="status">
            {result}
          </div>
        )}
      </Gate>
    </div>
  );
}
export function AccountPage({ lab = false }: { lab?: boolean }) {
  const { t, href, store, run, auth, open, close, notify } = useApp(),
    router = useRouter();
  return (
    <div className="k-page k-account">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">YOUR TRAVEL SPACE</p>
          <h1>
            {lab
              ? t("Demo test workspace", "示範驗收工作區")
              : t("Your corner of Kinnso", "你的 Kinnso 旅行角落")}
          </h1>
        </div>
      </div>
      <div className="k-account-grid">
        <section className="k-panel">
          <div className="k-account-person">
            <span className="k-avatar large">
              {store.session?.name[0] || "K"}
            </span>
            <div>
              <h2>
                {store.session?.name || t("Welcome, traveller", "歡迎，旅人。")}
              </h2>
              <p>
                {store.session
                  ? t(
                      "Demo account · this browser only",
                      "示範帳戶・只限此瀏覽器",
                    )
                  : t(
                      "Your next journey is waiting.",
                      "下一趟旅程，正等著你。",
                    )}
              </p>
            </div>
          </div>
          {!store.session ? (
            <button className="k-btn primary wide" onClick={() => auth()}>
              {t("Enter demo account", "進入示範帳戶")}
            </button>
          ) : (
            <div className="k-account-links">
              {[
                ["trips", "trip", "My trips", "我的行程"],
                ["saved", "bookmark", "Saved routes", "收藏路線"],
                ["studio", "camera", "Creator studio", "創作者工作室"],
                ["studio/earnings", "wallet", "Earnings", "收益"],
                ["bookings", "calendar", "Bookings", "預訂"],
              ].map(([p, icon, en, zh]) => (
                <Link href={href(p)} key={p}>
                  <Icon name={icon} />
                  <span>{t(en, zh)}</span>
                  <Icon name="chevron" />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="k-panel">
          <h2>{t("About this demo", "關於此示範")}</h2>
          <p>
            {t(
              "Explore, save, edit and preview publications using isolated example data. Your account, trips, photos and actions stay in this browser.",
              "你可以使用獨立示範資料探索、收藏、編輯及預覽公開版本。帳戶、行程、照片及操作只儲存在此瀏覽器。",
            )}
          </p>
          <p>
            {t(
              "Live Kinnso sign-in, AI, publishing, collaboration, payments and commissions are not connected. The demo does not silently replace a failed live request.",
              "尚未接通正式 Kinnso 登入、AI、發布、協作、付款及佣金。示範亦不會在正式請求失敗時自動啟用。",
            )}
          </p>
          <div className="k-actions">
            <button
              className="k-btn"
              disabled={!store.session}
              onClick={() =>
                run(() =>
                  download(
                    "kinnso-demo-backup.json",
                    JSON.stringify(
                      {
                        travel: m.exportAccount(store),
                        commerce: exportCommerce(),
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  ),
                )
              }
            >
              <Icon name="download" />
              {t("Export demo backup", "匯出示範備份")}
            </button>
            {store.session && (
              <button
                className="k-btn danger"
                onClick={() =>
                  open(
                    t("Leave and clear this demo?", "退出並清除此示範？"),
                    <div className="k-modal-body">
                      <p>
                        {t(
                          "This clears this demo account’s trips, photos, notes and session. Shared demo outcome history remains with the traveller identity removed. Export a backup first if you want to keep them. Files already downloaded remain on your device.",
                          "這會清除此示範帳戶的行程、照片、筆記及登入。共用示範成果歷史會保留，但移除旅人身份。如需保留，請先匯出備份。已下載的檔案仍在你的裝置。",
                        )}
                      </p>
                      <button
                        className="k-btn danger"
                        onClick={() => {
                          clearCommerce();
                          m.leaveAccount();
                          close();
                          router.push(href(""));
                        }}
                      >
                        {t("Clear and leave demo", "清除並退出示範")}
                      </button>
                    </div>,
                  )
                }
              >
                {t("Leave demo", "退出示範")}
              </button>
            )}
          </div>
          <details className="k-diagnostics" open={lab}>
            <summary>
              {t("Demo roles & recovery scenarios", "示範角色及復原情境")}
            </summary>
            <p>
              {t(
                "Switch only between isolated fixture personas. This never grants a real Kinnso role.",
                "只切換獨立示範身份，不會取得正式 Kinnso 權限。",
              )}
            </p>
            <label>
              {t("Demo persona", "示範身份")}
              <select
                aria-label={t("Demo persona", "示範身份")}
                value={
                  store.session?.id === "demo-other"
                    ? "other"
                    : store.session?.role || ""
                }
                onChange={(e) =>
                  run(() =>
                    m.session(
                      (e.target.value || null) as m.Role | "other" | null,
                    ),
                  )
                }
              >
                <option value="">{t("Anonymous", "未登入")}</option>
                <option value="owner">Jamie · {t("Owner", "擁有人")}</option>
                <option value="editor">
                  Jamie · {t("Editor scope", "編輯權限")}
                </option>
                <option value="viewer">
                  Jamie · {t("Read only scope", "唯讀權限")}
                </option>
                <option value="other">
                  Alex · {t("Another owner", "另一位擁有人")}
                </option>
                <option value="merchant">
                  Harbour Studio · {t("Merchant", "商戶")}
                </option>
                {lab && (
                  <option value="ops">
                    Kinnso Ops · {t("Operations test scope", "營運測試範圍")}
                  </option>
                )}
              </select>
            </label>
            {store.session?.role === "merchant" && (
              <Link className="k-btn" href={href("merchant")}>
                {t("Open merchant workspace", "開啟商戶工作區")}
              </Link>
            )}
            {store.session?.role === "ops" && (
              <Link className="k-btn" href={href("ops")}>
                {t("Open operations workspace", "開啟營運工作區")}
              </Link>
            )}
            <label>
              {t("Next operation", "下一次操作")}
              <select
                aria-label={t("Next operation scenario", "下一次操作情境")}
                defaultValue="none"
                onChange={(e) => {
                  m.fault(e.target.value as m.Fault);
                  notify(
                    t(
                      "Scenario armed for the next operation",
                      "下一次操作將使用此情境",
                    ),
                  );
                }}
              >
                {[
                  ["none", "Normal", "正常"],
                  ["network", "Connection failure", "連線失敗"],
                  ["conflict", "Revision conflict", "版本衝突"],
                  ["quota", "AI quota unavailable", "AI 額度不可用"],
                  ["expired", "Approval expired", "審閱過期"],
                  ["contract", "Invalid response", "回應格式異常"],
                  ["upload", "Photo failed", "照片處理失敗"],
                ].map(([v, en, zh]) => (
                  <option key={v} value={v}>
                    {t(en, zh)}
                  </option>
                ))}
              </select>
            </label>
          </details>
        </section>
      </div>
    </div>
  );
}
export function CreatorPage({ creator }: { creator?: string }) {
  const { t, locale, store, href } = useApp(),
    [tab, setTab] = useState("adventures"),
    [page, setPage] = useState(1);
  if (!creator)
    return (
      <div className="k-page">
        <div className="k-page-heading">
          <h1>{t("Travel through people", "透過不同的人，認識世界。")}</h1>
        </div>
        <p className="k-muted">
          {t(
            "Sample creator profiles for exploring the product.",
            "以下為產品體驗用的示範創作者。",
          )}
        </p>
        <div className="k-trip-grid">
          {m.creators.map((c) => (
            <Link className="k-trip-card" href={href("c/" + c.id)} key={c.id}>
              <span className={`k-avatar large ${c.id}`}>{c.initials}</span>
              <h2>{c.name}</h2>
              <p>{c.bio[locale]}</p>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      </div>
    );
  const c =
    m.creators.find((c) => c.id === creator) ||
    (creator === "creator-passport"
      ? m.creators[0]
      : creator === "you"
        ? {
            id: "you",
            name: t("You", "你"),
            initials: "J",
            bio: m.w(
              "Your selected demo adventures.",
              "你已選取的示範公開路線。",
            ),
          }
        : undefined);
  if (!c) return <Empty title={t("Creator not found", "找不到此創作者")} />;
  const a = m.publications(store).filter((a) => a.creator === c.id),
    pages = Math.max(1, Math.ceil(a.length / 9));
  return (
    <div className="k-page">
      <div className="k-creator-hero">
        <span className={`k-avatar large ${c.id}`}>{c.initials}</span>
        <div>
          <Chip>{t("Sample creator", "示範創作者")}</Chip>
          <h1>{c.name}</h1>
          <p>{c.bio[locale]}</p>
        </div>
        <span>
          {a.length} {t("demo adventures", "條示範路線")}
        </span>
      </div>
      <div className="k-tabs">
        {[
          ["adventures", "Adventures", "公開路線"],
          ["map", "Places", "地點"],
          ["tips", "Tips", "旅行提示"],
          ["work", "Work with me", "合作查詢"],
        ].map(([value, en, zh]) => (
          <button
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >
            {t(en, zh)}
          </button>
        ))}
      </div>
      {tab === "adventures" ? (
        <>
          <div className="k-card-grid">
            {a.slice((page - 1) * 9, page * 9).map((a) => (
              <AdventureCard key={a.id} a={a} />
            ))}
          </div>
          {!a.length && (
            <Empty title={t("No public adventures yet", "暫未有公開路線")} />
          )}
          <div className="k-pagination">
            <button
              className="k-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("Previous", "上一頁")}
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              className="k-btn"
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("Next", "下一頁")}
            </button>
          </div>
        </>
      ) : tab === "map" ? (
        <div className="k-trip-grid">
          {[...new Set(a.map((a) => a.destination))].map((d) => (
            <Link
              className="k-trip-card"
              key={d}
              href={href("explore?destination=" + d)}
            >
              <Icon name="pin" />
              <h2>{a.find((a) => a.destination === d)!.city[locale]}</h2>
              <span>{t("Explore routes", "探索路線")} →</span>
            </Link>
          ))}
        </div>
      ) : tab === "tips" ? (
        <section className="k-panel">
          <h2>{t("Leave room to wander", "為漫遊留一點空間。")}</h2>
          <p>
            {t(
              "Check opening hours and transport before travelling. Keep important booking details in your private trip, separate from public travel notes.",
              "出發前確認開放時間及交通。重要預訂資料可保留在私人行程，與公開旅行筆記分開。",
            )}
          </p>
        </section>
      ) : (
        <section className="k-panel">
          <h2>
            {t(
              "A collaboration starts with a clear brief",
              "合作，由清晰的簡介開始。",
            )}
          </h2>
          <p>
            {t(
              "Prepare the destination, scope, dates and usage rights. Live enquiry delivery is not connected in this demo.",
              "請準備目的地、合作範圍、日期及使用權利。此示範尚未接通正式查詢發送。",
            )}
          </p>
          <Link className="k-btn" href={href("for-business")}>
            {t("Prepare a collaboration", "準備合作資料")}
            <Icon name="arrow" />
          </Link>
        </section>
      )}
    </div>
  );
}
export function SupportPage({ path }: { path: string }) {
  const { t, href } = useApp();
  if (path === "credits")
    return (
      <div className="k-page k-prose">
        <h1>{t("Credits & source", "來源及授權")}</h1>
        <h2>AdventureLog</h2>
        <p>
          Map conversion adapted from AdventureLog. Copyright © 2023–2026 Sean
          Morley. Modified 10 September 2026. This covered application is
          distributed under GPL v3, without warranty.
        </p>
        <div className="k-actions">
          <a
            className="k-btn"
            href="/licenses/GPL-3.0.txt"
            download="GPL-3.0.txt"
          >
            GNU GPL v3
          </a>
          <a
            className="k-btn"
            href="/source/kinnsoos-source.zip"
            download="kinnsoos-source.zip"
          >
            {t("Download corresponding source", "下載對應原始碼")}
          </a>
        </div>
        <h2>{t("Photography", "攝影")}</h2>
        <p>
          Kyoto: Nakaharu Line / Unsplash. Tokyo: Vinh Nguyen / Unsplash. Hong
          Kong, Lisbon, Seoul and Singapore photography reused from the original
          Kinnso Site.
        </p>
        <a
          href="https://unsplash.com/photos/people-walking-on-pathway-between-trees-during-daytime-6Q4-jOZxhM4"
          target="_blank"
          rel="noreferrer"
        >
          {t("Kyoto photo and licence", "京都照片及授權")} ↗
        </a>
        <h2>{t("Places & maps", "地點及地圖")}</h2>
        <p>
          © OpenStreetMap contributors. Demo coordinates are approximate.
          Opening hours, prices and availability are not live.
        </p>
      </div>
    );
  const commerce = ["experiences", "tickets", "events", "gift-cards"].includes(
      path,
    ),
    original =
      [
        "experiences",
        "tickets",
        "events",
        "gift-cards",
        "for-business",
        "for-creators",
        "about",
        "contact",
        "help",
        "booking-support",
        "creator-stories",
        "how-kinnso-works",
      ].includes(path) ||
      path.startsWith("legal/") ||
      path.startsWith("for-business/") ||
      path.startsWith("for-creators/");
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <h1>
          {commerce
            ? t("Experiences along the way", "沿途值得體驗的事")
            : path === "articles"
              ? t("Travel reads", "旅行閱讀")
              : path.startsWith("legal")
                ? t("Privacy & travel policies", "私隱與旅遊政策")
                : path.startsWith("for-business")
                  ? t("Travel, with local businesses", "與在地商戶一起旅行")
                  : path.startsWith("for-creators")
                    ? t("Your journeys, worth sharing", "你的旅程，值得分享")
                    : t("How can we help?", "有甚麼可以幫你？")}
        </h1>
      </div>
      {commerce ? (
        <>
          <p className="k-muted">
            {t(
              "Plan with real places. Confirm availability with the provider before booking.",
              "用真實地點規劃，預訂前請向供應商確認名額。",
            )}
          </p>
          <div className="k-card-grid">
            {m.fixtures.slice(0, 3).map((a) => (
              <AdventureCard key={a.id} a={a} />
            ))}
          </div>
          <div className="k-info-panel">
            <Icon name="info" />
            <div>
              <h3>{t("Live booking is not connected", "即時預訂尚未接通")}</h3>
              <p>
                {t(
                  "Explore booking and refund states in the demo. No payment will be collected.",
                  "你可在示範中查看預訂及退款狀態，不會收取款項。",
                )}
              </p>
              <Link href={href("bookings")}>
                {t("View booking demo", "查看預訂示範")} →
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="k-support-grid">
            {[
              [
                "record",
                "camera",
                "Record a trip",
                "記錄旅程",
                "Start with one photo or one note.",
                "由一張照片或一句筆記開始。",
              ],
              [
                "studio/adventures",
                "note",
                "Creator studio",
                "創作者工作室",
                "Organise, review and preview a publication.",
                "整理、審閱及預覽公開內容。",
              ],
              [
                "studio/missions",
                "wallet",
                "Missions & opportunities",
                "任務及合作機會",
                "Understand requirements and submit a demo.",
                "了解要求並提交示範素材。",
              ],
              [
                "bookings",
                "trip",
                "Booking help",
                "預訂支援",
                "Check service dates, payment and refund states.",
                "查看服務日期、付款及退款狀態。",
              ],
            ].map(([p, icon, en, zh, body, cn]) => (
              <Link className="k-support-card" href={href(p)} key={p}>
                <Icon name={icon} size={28} />
                <h2>{t(en, zh)}</h2>
                <p>{t(body, cn)}</p>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
          <details className="k-story" open={path.startsWith("legal")}>
            <summary>
              {t("About your data in this demo", "關於此示範的資料")}
            </summary>
            <p>
              {t(
                "Trips, media and earnings previews are isolated on this browser. Do not enter sensitive personal or payment information. Demo publications are viewable on this browser only. Export or clear your local data from your account.",
                "行程、素材及收益預覽均獨立儲存在此瀏覽器。請勿輸入敏感個人或付款資料。示範公開版本只在此瀏覽器可見。你可在帳戶匯出或清除本地資料。",
              )}
            </p>
            <Link href={href("me")}>
              {t("Manage demo data", "管理示範資料")} →
            </Link>
          </details>
        </>
      )}
      {original && (
        <div className="k-info-panel">
          <p>
            {t(
              "The original site content is retained in English.",
              "原站內容保留英文版本。",
            )}
          </p>
          <Link className="k-btn" href={`/en/legacy/${path}`}>
            {t("Read original page", "閱讀原有頁面")}
            <Icon name="external" size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
