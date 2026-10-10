"use client";
import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import { Adventure, Locale, Store, Stop } from "./model";
export type Context = {
  locale: Locale;
  t: (en: string, zh: string) => string;
  href: (path: string) => string;
  store: Store;
  ready: boolean;
  open: (title: string, body: ReactNode) => void;
  close: () => void;
  notify: (message: string, error?: boolean) => void;
  refresh: () => void;
  run: <T>(fn: () => T, message?: string) => T | undefined;
  auth: (then?: () => void) => void;
};
export const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    search: "m21 21-5-5 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    bookmark: "M6 3h12v18l-6-4-6 4Z",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    plus: "M12 4v16M4 12h16",
    camera: "M3 7h4l2-3h6l2 3h4v14H3Z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    note: "M5 3h14v18H5Z M8 8h8M8 12h8M8 16h5",
    mic: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0Z M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
    trip: "M4 6h16v15H4Z M9 6V3h6v3M8 10v7M16 10v7",
    compass: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M16 8l-3 5-5 3 3-5Z",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3",
    clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 6v6l4 2",
    calendar: "M3 5h18v16H3Z M3 10h18M7 2v6M17 2v6",
    spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
    lock: "M6 10h12v11H6Z M8 10V6a4 4 0 0 1 8 0v4M12 14v3",
    check: "m4 12 5 5L20 6",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16M15 5v16",
    close: "m6 6 12 12M6 18 18 6",
    chevron: "m9 5 7 7-7 7",
    globe:
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
    wallet: "M3 5h17v16H3Z M16 10h5v6h-5Z",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
    external: "M13 3h8v8M21 3 10 14M9 4H3v17h17v-6",
    info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 10v7M12 6v1",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.compass} />
    </svg>
  );
}
export function Modal({
  title,
  children,
  onClose,
  returnFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: HTMLElement|null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog=ref.current;
    const opener=returnFocus??(document.activeElement instanceof HTMLElement?document.activeElement:null);
    dialog?.showModal();
    return () => {dialog?.close();if(opener?.isConnected)opener.focus();};
  }, []);
  return (
    <dialog
      className="k-modal"
      ref={ref}
      onCancel={event=>{event.preventDefault();onClose();}}
      onKeyDown={event=>{
        if(event.key!=='Tab')return;
        const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length>0);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }}
      aria-labelledby="modal-title"
    >
      <div className="k-modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          className="k-icon-btn"
          aria-label="Close / 關閉"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  body,
  children,
  icon = "trip",
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="k-empty">
      <div className="k-empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      <div className="k-actions">{children}</div>
    </div>
  );
}
export function Chip({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`k-chip ${tone}`}>{children}</span>;
}
export function Money({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) {
  return (
    <>
      {new Intl.NumberFormat("en-HK", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount)}
    </>
  );
}
export function download(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PublicPreview({ adventure: a }: { adventure: Adventure }) {
  const { locale, t } = useApp();
  return (
    <div className="k-public-preview">
      {a.image && <img src={a.image} alt={a.title[locale]} />}
      <Chip tone="green">{t("Selected public fields", "已選公開內容")}</Chip>
      <h2>{a.title[locale]}</h2>
      <p>
        {a.city[locale]} · {a.days.length} {t("days", "日")}
      </p>
      {a.days.map((d, i) => (
        <section key={d.id}>
          <h3>
            {t("Day", "第")} {i + 1}
            {locale === "zh-HK" ? " 日" : ""} · {d.name[locale]}
          </h3>
          {d.stops.map((s, j) => (
            <article key={s.id}>
              <PublicStopBody stop={s} number={j + 1} />
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Shared public stop renderer. Both the detail page and approved preview use this. */
export function PublicStopBody({
  stop: s,
  number,
}: {
  stop: Stop;
  number?: number;
}) {
  const { locale, t } = useApp();
  return (
    <>
      <p className="k-stop-status">
        {s.status === "visited"
          ? t("Author marked visited", "作者標示已到訪")
          : s.status === "suggested"
            ? t("Suggestion to review", "建議待審閱")
            : t("Planned stop · demo itinerary", "計劃到訪・示範行程")}
      </p>
      <h3>
        {number ? `${number}. ` : ""}
        {s.name[locale]}
      </h3>
      <p>{s.note[locale]}</p>
      {s.image && (
        <img className="k-studio-cover" src={s.image} alt={s.name[locale]} />
      )}
    </>
  );
}
