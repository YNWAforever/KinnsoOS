"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import * as m from "./model";
import { AppContext, Chip, Empty, Icon, Modal } from "./ui";
import { HomePage, ExplorePage, AdventurePage, TripsPage } from "./explore";
import { ConnectedHome } from './ConnectedHome';
import { TripWorkspace } from './TripWorkspace';
import { GuideWorkspace,BookmarkWorkspace } from './GuideWorkspace';
import { AccountSignOut } from './AccountSignOut';
import { CreatorWorkspace } from './CreatorWorkspace';
import { OpsWorkspace as ConnectedOpsWorkspace } from './OpsWorkspace';
import { MerchantWorkspace as RealMerchantWorkspace } from './MerchantWorkspace';
import type { Actor } from '../../lib/auth/actor';
import type { CapabilityMode } from '../../lib/contracts/capabilities';
import type {PublicGuide} from '../../lib/seo/public-guide';
import {InboxWorkspace,SupportWorkspace} from './InboxWorkspace';
import {ReportWorkspace} from './ReportWorkspace';
import {AgentPage} from '../agent/AgentPage';
import {FinanceWorkspace} from './FinanceWorkspace';
import {MonitoringWorkspace} from './MonitoringWorkspace';
import {TelemetryConsent} from './TelemetryConsent';
const TripEditor = dynamic(
  () => import("./editing").then((mod) => mod.TripEditor),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const RecordPage = dynamic(
  () => import("./editing").then((mod) => mod.RecordPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const StudioPage = dynamic(
  () => import("./editing").then((mod) => mod.StudioPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const CreatorToday = dynamic(
  () => import("./connected").then((mod) => mod.CreatorToday),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const MerchantWorkspace = dynamic(
  () => import("./connected").then((mod) => mod.MerchantWorkspace),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const OfferPage = dynamic(
  () => import("./connected").then((mod) => mod.OfferPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const ConnectedOpportunities = dynamic(
  () => import("./connected").then((mod) => mod.ConnectedOpportunities),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const ConnectedOutcomes = dynamic(
  () => import("./connected").then((mod) => mod.ConnectedOutcomes),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const OpsEligibility = dynamic(
  () => import("./connected").then((mod) => mod.OpsEligibility),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const CreatorShell = dynamic(
  () => import("./connected").then((mod) => mod.CreatorShell),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const CanonicalContent = dynamic(
  () => import("./connected").then((mod) => mod.CanonicalContent),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const BookingsPage = dynamic(
  () => import("./commerce").then((mod) => mod.BookingsPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const EarningsPage = dynamic(
  () => import("./commerce").then((mod) => mod.EarningsPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const OpportunitiesPage = dynamic(
  () => import("./commerce").then((mod) => mod.OpportunitiesPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const OperationsPage = dynamic(
  () => import("./commerce").then((mod) => mod.OperationsPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const AccountPage = dynamic(
  () => import("./commerce").then((mod) => mod.AccountPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const CreatorPage = dynamic(
  () => import("./commerce").then((mod) => mod.CreatorPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const SupportPage = dynamic(
  () => import("./commerce").then((mod) => mod.SupportPage),
  {
    loading: () => (
      <div className="os-loading" role="status">
        Loading…
      </div>
    ),
  },
);
const CatalogPanel = dynamic(() =>
  import("../integration/CatalogPanel").then((m) => m.CatalogPanel),
);
const WorkspacePanel = dynamic(() =>
  import("../integration/WorkspacePanel").then((m) => m.WorkspacePanel),
);
export function Workbench({
  locale,
  path,
  mode = 'demo',
  actor = null,
  publicGuide = null,
  features={media:false,sharing:false},
}: {
  locale: m.Locale;
  path: string;
  mode?:CapabilityMode;
  actor?:Actor|null;
  publicGuide?:PublicGuide|null;
  features?:{media:boolean;sharing:boolean;creator?:boolean;ops?:boolean;merchant?:boolean;notifications?:boolean;agent?:boolean;telemetry?:boolean;fieldMetrics?:boolean};
}) {
  const router = useRouter(),
    query = useSearchParams(),
    [store, setStore] = useState<m.Store>(m.blank),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [modal, setModal] = useState<{ title: string; body: ReactNode } | null>(
      null,
    ),
    [storageError, setStorageError] = useState(false);
  const t = (en: string, zh: string) => (locale === "en" ? en : zh),
    href = (p: string) => `/${locale}${mode === 'demo' ? '/demo' : ''}${p ? "/" + p.replace(/^\//, "") : ""}`;
  const refresh = () => {
    try {
      setStore(m.read());
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    setReady(true);
  };
  useEffect(() => {
    if (mode !== 'demo') { setReady(true); return; }
    refresh();
    window.addEventListener("kinnso-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("kinnso-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [locale,mode]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const notify = (message: string, error = false) =>
    setNotice({ message, error });
  const errorText = (e: unknown) => {
    const code = e instanceof m.AppError ? e.code : "UNKNOWN";
    const messages: Record<string, [string, string]> = {
      CAMPAIGN_INCOMPLETE: [
        "Add a campaign name, audience, brief, terms, positive budget and a future validity date.",
        "請填寫活動名稱、對象、簡介、條款、正數預算及未來有效日期。",
      ],
      CONTRACT_UNAVAILABLE: [
        "No eligible agreement matches this action. Nothing was approved.",
        "未有合資格協議配對此操作，未有批准。",
      ],
      CODE_INVALID: [
        "Code not recognised. Nothing was redeemed.",
        "無法識別代碼，未有核銷。",
      ],
      CODE_EXPIRED: [
        "This code has expired. No redemption was created.",
        "代碼已過期，未建立核銷紀錄。",
      ],
      CODE_FOREIGN: [
        "This code belongs to another merchant.",
        "此代碼屬於另一商戶。",
      ],
      CODE_USED: [
        "Already redeemed. Check the original result; do not create another.",
        "已核銷，請核對原有結果，不會重複建立。",
      ],
      REDEMPTION_UNCERTAIN: [
        "The result is uncertain. Check the existing attempt before retrying.",
        "結果未明，重試前請核對現有操作。",
      ],
      EVIDENCE_REQUIRED: [
        "Confirm the qualifying spend and add a verification note.",
        "請確認合資格消費及填寫核實筆記。",
      ],
      REASON_REQUIRED: [
        "Add a specific review reason before continuing.",
        "請先填寫具體審閱原因。",
      ],
      INVITE_QUOTA: [
        "The demo campaign quota of three participants is reached.",
        "已達每個示範活動三位參與者配額。",
      ],
      CAMPAIGN_NOT_ACTIVE: [
        "Activate the demo campaign before inviting.",
        "請先啟用示範活動，再邀請。",
      ],
      STATE_CONFLICT: [
        "This work has changed. Reload its current state before continuing.",
        "工作狀態已變更，請重新載入目前狀態。",
      ],
      OFFER_UNAVAILABLE: [
        "This offer is unavailable or paused.",
        "此優惠尚未提供或已暫停。",
      ],
      OFFER_FULL: [
        "This offer has reached its claim limit.",
        "此優惠已達領取上限。",
      ],
      NETWORK_ERROR: [
        "Connection interrupted. Your input is kept; try again.",
        "連線中斷，輸入已保留，請重試。",
      ],
      REVISION_CONFLICT: [
        "This trip changed. Your edits are kept. Reload the saved version or compare again.",
        "行程已有變更，你的修改仍保留。請重新載入已保存版本或重新比較。",
      ],
      QUOTA_EXCEEDED: [
        "Organising is unavailable right now. You can keep editing manually.",
        "暫時未能整理，你仍可手動記錄及編輯。",
      ],
      APPROVAL_EXPIRED: [
        "This proposal expired. Generate a new comparison.",
        "此建議已過期，請重新產生比較。",
      ],
      CONTRACT_ERROR: [
        "Unexpected data received. No change was accepted.",
        "資料格式不符，未有接受任何修改。",
      ],
      STORAGE_ERROR: [
        "This device could not save your data. Export a copy and free up browser storage.",
        "此裝置未能保存資料，請先匯出副本及騰出瀏覽器空間。",
      ],
      FORBIDDEN: [
        "This account cannot perform this action.",
        "此帳戶沒有執行此操作的權限。",
      ],
      SOURCE_UNAVAILABLE: [
        "This route is no longer available to use.",
        "此路線目前未能套用。",
      ],
      PUBLICATION_INCOMPLETE: [
        "Add a title, destination and at least one selected public stop.",
        "請補上標題、目的地及至少一個已選公開站點。",
      ],
      ALREADY_RESERVED: [
        "This balance is already in a payout request.",
        "這筆餘額已列入款項申請。",
      ],
      SIGN_IN_REQUIRED: [
        "Open a demo account to continue.",
        "請先進入示範帳戶。",
      ],
      IDEMPOTENCY_CONFLICT: [
        "The request changed. Please start a new action.",
        "操作內容已有改變，請開始新的操作。",
      ],
      APPROVAL_INVALID: [
        "This proposal was already applied or cancelled.",
        "此建議已套用或取消。",
      ],
      UPLOAD_FAILED: [
        "This photo could not be processed. Other photos are kept.",
        "此照片未能處理，其他照片仍保留。",
      ],
      NO_MATERIAL: [
        "Add a note or photo before organising.",
        "請先加入筆記或照片。",
      ],
    };
    const msg = messages[code] || [
      "This action could not be completed. Your input is kept.",
      "未能完成此操作，你的輸入仍保留。",
    ];
    return t(msg[0], msg[1]);
  };
  function run<T>(fn: () => T, message?: string): T | undefined {
    try {
      const result = fn();
      refresh();
      if (message) notify(message);
      return result;
    } catch (e) {
      notify(errorText(e), true);
      return undefined;
    }
  }
  const open = (title: string, body: ReactNode) => setModal({ title, body }),
    close = () => setModal(null);
  const auth = (then?: () => void) => {
    if(mode !== 'demo') { router.push(`/${locale}/sign-in?next=${encodeURIComponent(href(path))}`); return; }
    try {
      if (m.read().session) {
        then?.();
        return;
      }
    } catch {}
    open(
      t("Your next trip starts here", "開始你的下一趟旅程"),
      <div className="k-modal-body">
        <div className="k-empty-icon">
          <Icon name="user" size={30} />
        </div>
        <p>
          {t(
            "Use an isolated demo account to save and edit trips on this browser. This does not sign you in to your Kinnso account.",
            "透過獨立示範帳戶，在此瀏覽器保存及編輯行程。這不會登入你的正式 Kinnso 帳戶。",
          )}
        </p>
        <button
          className="k-btn primary wide"
          onClick={() => {
            if (run(() => m.session("owner"))) {
              close();
              then?.();
            }
          }}
        >
          {t("Enter demo account", "進入示範帳戶")}
          <Icon name="arrow" />
        </button>
      </div>,
    );
  };
  useEffect(() => {
    if(mode !== 'demo') return;
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const ac = new AbortController();
    void Promise.resolve(
      ctx.registerTool(
        {
          name: "search_adventures",
          title: "Search travel routes",
          description:
            "Navigate to Explore with a destination query. Searches demo public routes only.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string", maxLength: 160 } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              typeof (input as { query: unknown }).query !== "string"
            )
              throw new Error("Expected query string");
            const q = (input as { query: string }).query;
            if (q.length > 160) throw new Error("Query too long");
            const route = href("explore") + "?q=" + encodeURIComponent(q);
            router.push(route);
            return { mode: "demo", query: q, route };
          },
        },
        { signal: ac.signal },
      ),
    ).catch(() => {});
    return () => ac.abort();
  }, [locale,mode]);
  let content: ReactNode;
  if (path === "library") content = <CatalogPanel />;
  else if (path === "workspace" || path === "admin")
    content = <WorkspacePanel />;
  else if (!path) content = <HomePage />;
  else if (
    path === "explore" ||
    path === "destinations" ||
    path.startsWith("destinations/")
  )
    content = (
      <ExplorePage
        destination={
          path.startsWith("destinations/") ? path.split("/")[1] : undefined
        }
      />
    );
  else if (path.startsWith("g/") || path.startsWith("collections/"))
    content = <AdventurePage slug={path.split("/")[1]} />;
  else if (
    [
      "trips",
      "saved",
      "bookmarks",
      "trip-planner",
      "agent",
      "studio/copilot",
    ].includes(path)
  )
    content = (
      <TripsPage
        saved={["saved", "bookmarks"].includes(path)}
        planner={["trip-planner", "agent", "studio/copilot"].includes(path)}
      />
    );
  else if (path === "record" || path === "studio/adventures/new")
    content = <RecordPage />;
  else if (
    path.startsWith("trips/") ||
    /^studio\/adventures\/.+\/edit$/.test(path)
  )
    content = (
      <TripEditor
        id={path.startsWith("trips/") ? path.split("/")[1] : path.split("/")[2]}
      />
    );
  else if (path === "studio") content = <CreatorToday />;
  else if (["studio/adventures", "studio/guides"].includes(path))
    content = <StudioPage />;
  else if (["studio/earnings", "for-creators/earnings"].includes(path))
    content = <EarningsPage />;
  else if (
    [
      "studio/missions",
      "studio/offers",
      "studio/receipts",
      "missions",
      "receipts",
    ].includes(path)
  )
    content = <OpportunitiesPage initial={path.split("/").at(-1)} />;
  else if (
    path === "bookings" ||
    path === "ticket-wallet" ||
    path.startsWith("bookings/")
  )
    content = <BookingsPage />;
  else if (
    ["articles", "sessions", "merchants"].includes(path) ||
    /^(articles|sessions|m)\//.test(path)
  )
    content = <CanonicalContent path={path} />;
  else if (
    path === "for-business" ||
    path.startsWith("merchants/dashboard") ||
    path === "merchant" ||
    path === "merchant/missions" ||
    path === "merchant/redemption"
  )
    content = <MerchantWorkspace path={path} />;
  else if (path === "offers/demo-offer-hk") content = <OfferPage />;
  else if (path === "studio/opportunities")
    content = <ConnectedOpportunities />;
  else if (path === "studio/outcomes") content = <ConnectedOutcomes />;
  else if (path.startsWith("ops"))
    content = (
      <>
        <OperationsPage kind="ops" />
        <div className="k-page">
          <OpsEligibility />
        </div>
      </>
    );
  else if (["me", "settings", "demo-lab"].includes(path))
    content = <AccountPage lab={path === "demo-lab"} />;
  else if (
    path === "creators" ||
    path.startsWith("c/") ||
    path.startsWith("creators/")
  )
    content = <CreatorPage creator={path.split("/")[1]} />;
  else content = <SupportPage path={path} />;
  if (
    path.startsWith("studio") &&
    !path.endsWith("/edit") &&
    path !== "studio/copilot"
  )
    content = <CreatorShell path={path}>{content}</CreatorShell>;
  if(mode !== 'demo') {
    if(!path) content=<ConnectedHome actorId={actor?.id??null}/>;
    else if(['library','explore','destinations'].includes(path)||path.startsWith('destinations/'))content=<CatalogPanel/>;
    else if(path.startsWith('g/'))content=<GuideWorkspace id={path.split('/')[1]} actorId={actor?.id??null} initialGuide={publicGuide}/>;
    else if(['saved','bookmarks'].includes(path))content=<BookmarkWorkspace actorId={actor?.id??null}/>;
    else if(path==='trips'||path.startsWith('trips/')||path==='record'||path==='trip-planner')content=<TripWorkspace id={path.startsWith('trips/')?path.split('/')[1]:undefined} actorId={actor?.id??null} mediaEnabled={features.media} sharingEnabled={features.sharing}/>;
    else if(path==='studio'||path==='studio/guides'||path==='studio/adventures'||path==='studio/guides/new'||path==='studio/adventures/new'||/^studio\/(guides|adventures)\/[0-9a-f-]{36}\/edit$/.test(path))content=<CreatorWorkspace path={path} actorId={actor?.id??null} enabled={features.creator===true}/>;
    else if(path==='agent'||path==='studio/copilot')content=<AgentPage actorId={actor?.id??null} roles={actor?.roles??[]} enabled={features.agent===true}/>;
    else if(path==='inbox')content=<InboxWorkspace actorId={actor?.id??null} enabled={features.notifications===true}/>;
    else if(path==='reports'||path==='ops/reports')content=<ReportWorkspace actorId={actor?.id??null} enabled={path==='reports'?features.notifications===true:features.ops===true} opsMode={path==='ops/reports'}/>;
    else if(path==='support'||path==='ops/support')content=<SupportWorkspace actorId={actor?.id??null} enabled={features.notifications===true} opsMode={path==='ops/support'}/>;
    else if(path==='ops/monitoring')content=<MonitoringWorkspace actorId={actor?.id??null} enabled={features.ops===true}/>;
    else if(path==='ops/reconciliation'||path==='merchant/reconciliation')content=<FinanceWorkspace actorId={actor?.id??null} enabled={path==='ops/reconciliation'?features.ops===true:features.merchant===true} opsMode={path==='ops/reconciliation'}/>;
    else if(path==='ops'||path.startsWith('ops/'))content=<ConnectedOpsWorkspace actorId={actor?.id??null} enabled={features.ops===true}/>;
    else if(path==='merchant'||path.startsWith('merchant/')||path.startsWith('merchants/dashboard'))content=<RealMerchantWorkspace actorId={actor?.id??null} enabled={features.merchant===true}/>;
    else if(path==='me'||path==='settings')content=<div className="k-page"><h1>{t('Your Kinnso account','你的 Kinnso 帳戶')}</h1>{actor?<><p>{t('Signed in · account data is private','已登入 · 帳戶資料屬私人')}</p><AccountSignOut label={t('Sign out','登出')}/></>:<Link className="k-btn primary" href={`/${locale}/sign-in`}>{t('Sign in','登入')}</Link>}<Link className="k-btn" href={`/${locale}/demo/me`}>{t('Local demo export and recovery','本機示範匯出及復原')}</Link></div>;
    else content=<WorkspacePanel/>;
  }
  return (
    <AppContext.Provider
      value={{
        locale,
        t,
        href,
        store,
        ready,
        open,
        close,
        notify,
        refresh,
        run,
        auth,
      }}
    >
      <div className="k-app">
        <a className="k-skip" href="#k-main">
          {t("Skip to content", "跳至內容")}
        </a>
        <header className="k-header">
          <Link href={href("")} className="k-logo" aria-label="Kinnso home">
            kinnso<span>✳</span>
          </Link>
          <nav aria-label={t("Main navigation", "主導航")}>
            <Link
              className={!path || path === "explore" ? "active" : ""}
              href={href("explore")}
            >
              <Icon name="compass" />
              {t("Explore", "探索路線")}
            </Link>
            <Link
              className={path.startsWith("trips") ? "active" : ""}
              href={href("trips")}
            >
              <Icon name="trip" />
              {t("My trips", "我的行程")}
            </Link>
            <Link
              className={path === "record" ? "active" : ""}
              href={href("record")}
            >
              <Icon name="camera" />
              {t("Record", "記錄旅程")}
            </Link>
          </nav>
          <div className="k-header-end">
            <Link className="k-audience" href={href("studio")}>
              {t("For creators", "創作者")}
            </Link>
            <Link className="k-audience" href={href("merchants/dashboard")}>
              {t("For business", "商戶")}
            </Link>
            <Link
              className="k-language"
              href={`/${locale === "en" ? "zh-HK" : "en"}${path ? "/" + path : ""}${query.toString() ? "?" + query.toString() : ""}`}
            >
              <Icon name="globe" size={18} />
              {locale === "en" ? "繁中" : "EN"}
            </Link>
            {mode !== 'demo' && actor ? <Link className="k-avatar" href={href('me')} aria-label={t('My account','我的帳戶')}><Icon name="user"/></Link> : store.session ? (
              <Link
                className="k-avatar"
                href={href("me")}
                aria-label={t("My account", "我的帳戶")}
              >
                {store.session.name[0]}
              </Link>
            ) : (
              <button className="k-btn compact" onClick={() => auth()}>
                {t("Sign in", "登入")}
              </button>
            )}
          </div>
        </header>
        <div className="k-mode">
          <span>
            {mode !== 'demo' ? (mode==='connected'?t('Kinnso · account connected','Kinnso · 已接通帳戶'):t('Account services unavailable','帳戶服務尚未接通')) : ["library", "workspace", "admin"].includes(path)
              ? t("KinnsoOS · connection workspace", "KinnsoOS · 接駁工作區")
              : t(
                  "Demo — sample data, saved on this device",
                  "示範 — 樣本資料，儲存於此裝置",
                )}
          </span>
          <Link href={`/${locale}/demo`}>
            {t("Open explicit demo", "開啟明示示範")}
            <Icon name="chevron" size={13} />
          </Link>
        </div>
        <div className="os-handoff">
          <Link href={href("library")}>
            {t("Published guides", "已發布攻略")}
          </Link>
          <Link href={href("workspace")}>
            {t("Existing workspaces", "現有工作區")}
          </Link>
          {mode==='connected'&&actor&&features.notifications&&<Link href={href('inbox')}>{t('Inbox','通知')}</Link>}
          {mode==='connected'&&actor&&features.agent&&<Link href={href('agent')}>{t('Task preview','任務預覽')}</Link>}
          <span>
            {mode === 'demo' ? t(
              "Travel editing remains device-local in this first version.",
              "首期行程編輯仍儲存於此裝置。",
            ) : t('Booking and payments are currently unavailable.','訂位及付款目前尚未提供。')}
          </span>
        </div>
        {storageError && (
          <div className="k-alert error" role="alert">
            {t(
              "Saved data could not be read. Export it in account settings before resetting.",
              "未能讀取已保存資料，重設前請於帳戶設定匯出。",
            )}
            <button onClick={refresh}>{t("Retry", "重試")}</button>
          </div>
        )}
        <main id="k-main" className="k-main">
          {storageError ? (
            <Empty
              title={t("Saved data needs recovery", "已儲存資料需要復原")}
              body={t(
                "Your stored data has not been replaced. Retry after restoring browser storage access.",
                "原有資料並未被取代。請恢復瀏覽器儲存權限後重試。",
              )}
            >
              <button className="k-btn" onClick={refresh}>
                {t("Retry", "重試")}
              </button>
            </Empty>
          ) : (
            content
          )}
        </main>
        <footer className="k-footer">
          <span>© Kinnso 2026</span>
          <div>
            <Link href={href("help")}>{t("Help", "支援")}</Link>
            <Link href={href("legal/privacy")}>{t("Privacy", "私隱")}</Link>
            <Link href={href("for-business")}>
              {t("For business", "商戶合作")}
            </Link>
            <Link href={href("credits")}>
              {t("Credits & source", "來源及授權")}
            </Link>
          </div>
        </footer>
        {mode==='connected'&&!path.startsWith('ops')&&<TelemetryConsent enabled={features.telemetry===true} fieldEnabled={features.fieldMetrics===true}/>}
        <nav
          className="k-bottom-nav"
          aria-label={t("Mobile navigation", "手機導航")}
        >
          {[
            ["explore", "compass", "Explore", "探索"],
            ["trips", "trip", "Trips", "行程"],
            ["record", "plus", "Record", "記錄"],
            ["me", "user", "Me", "我的"],
          ].map(([p, icon, en, zh]) => (
            <Link key={p} href={href(p)} className={path === p ? "active" : ""}>
              <Icon name={icon} />
              <span>{t(en, zh)}</span>
            </Link>
          ))}
        </nav>
        {notice && (
          <div
            className={`k-toast ${notice.error ? "error" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            <Icon name={notice.error ? "info" : "check"} />
            <span>{notice.message}</span>
            <button
              aria-label={t("Dismiss", "關閉提示")}
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        )}
        {modal && (
          <Modal title={modal.title} onClose={close}>
            {modal.body}
          </Modal>
        )}
      </div>
    </AppContext.Provider>
  );
}
