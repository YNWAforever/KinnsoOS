"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as m from "./model";
import { Chip, Empty, Icon, PublicPreview, download, useApp } from "./ui";
import TripMap from "./TripMap";
import { AdventureCard } from "./explore";
import { BookingsPage } from "./commerce";
async function processPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new m.AppError("UPLOAD_FAILED");
  if (file.size > 3 * 1024 * 1024) throw new m.AppError("UPLOAD_FAILED");
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}
export function Capture({
  note,
  setNote,
  media,
  setMedia,
}: {
  note: string;
  setNote: (v: string) => void;
  media: m.Media[];
  setMedia: (v: m.Media[]) => void;
}) {
  const { t, notify } = useApp(),
    [mode, setMode] = useState("note"),
    files = useRef(new Map<string, File>()),
    latest = useRef(media),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    [recording, setRecording] = useState(false);
  useEffect(() => {
    latest.current = media;
  }, [media]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const update = (id: string, p: Partial<m.Media>) => {
    latest.current = latest.current.map((m) =>
      m.id === id ? { ...m, ...p } : m,
    );
    setMedia(latest.current);
  };
  async function process(id: string, file: File) {
    try {
      update(id, { status: "uploading" });
      m.check();
      await new Promise((r) => setTimeout(r, 150));
      update(id, { status: "processing" });
      const url = await processPhoto(file);
      update(id, { url, status: "ready", error: undefined });
    } catch {
      update(id, {
        status: "failed",
        error: t(
          "Use JPG, PNG or WebP up to 3 MB.",
          "請使用 3 MB 以下的 JPG、PNG 或 WebP。",
        ),
      });
    }
  }
  async function add(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list).slice(0, 8)) {
      const duplicate = latest.current.some((m) => m.name === file.name);
      if (duplicate) {
        notify(
          t(
            "A file with this name is already here; both copies are kept.",
            "已有同名檔案，兩份素材均會保留。",
          ),
        );
      }
      const id = m.id("media");
      files.current.set(id, file);
      latest.current = [
        ...latest.current,
        { id, name: file.name, url: "", status: "queued", public: false },
      ];
      setMedia(latest.current);
      void process(id, file);
    }
  }
  async function voice() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error();
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const rec = new MediaRecorder(stream.current);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          latest.current = [
            ...latest.current,
            {
              id: m.id("voice"),
              name: t("Voice note", "語音筆記"),
              url: String(reader.result),
              status: "ready",
              public: false,
            },
          ];
          setMedia(latest.current);
        };
        reader.readAsDataURL(blob);
        stream.current?.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      setRecording(true);
      setTimeout(() => {
        if (rec.state === "recording") {
          rec.stop();
          setRecording(false);
        }
      }, 30000);
    } catch {
      notify(
        t(
          "Microphone unavailable. You can type a note or add a photo instead.",
          "未能使用麥克風。你仍可輸入筆記或選擇照片。",
        ),
        true,
      );
    }
  }
  return (
    <div className="k-capture">
      <div className="k-capture-modes">
        {[
          ["note", "note", "Write a note", "寫筆記"],
          ["photo", "camera", "Add photos", "加照片"],
          ["voice", "mic", "Voice note", "語音記錄"],
        ].map(([value, icon, en, zh]) => (
          <button
            key={value}
            className={mode === value ? "active" : ""}
            onClick={() => setMode(value)}
            type="button"
          >
            <Icon name={icon} size={23} />
            {t(en, zh)}
          </button>
        ))}
      </div>
      {mode === "note" && (
        <label className="k-capture-note">
          <span className="k-sr-only">{t("Private note", "私人筆記")}</span>
          <textarea
            value={note}
            maxLength={10000}
            rows={6}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(
              "What would you like to remember? A place, a little detail, a favourite moment…",
              "有甚麼想記住？一個地方、一個小細節、一個喜歡的時刻⋯",
            )}
          />
          <span className="k-meta">{note.length} / 10,000</span>
        </label>
      )}
      {mode === "photo" && (
        <label className="k-upload">
          <Icon name="camera" size={34} />
          <strong>
            {t("Choose photos from your trip", "選擇旅途上的照片")}
          </strong>
          <span>
            {t(
              "JPG, PNG, WebP · up to 3 MB each",
              "JPG、PNG、WebP・每張最多 3 MB",
            )}
          </span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => void add(e.target.files)}
          />
        </label>
      )}
      {mode === "voice" && (
        <div className="k-voice">
          <Icon name="mic" size={38} />
          <p>
            {t(
              "A private voice note, up to 30 seconds. Transcription is not connected.",
              "最多 30 秒私人語音筆記。文字轉錄尚未接通。",
            )}
          </p>
          <button
            type="button"
            className={`k-btn ${recording ? "danger" : "primary"}`}
            onClick={() => void voice()}
          >
            {recording
              ? t("Stop recording", "停止錄音")
              : t("Start recording", "開始錄音")}
          </button>
        </div>
      )}
      {media.length > 0 && (
        <div className="k-media-grid">
          {media.map((item) => (
            <div className="k-media-item" key={item.id}>
              {item.url.startsWith("data:image/") ? (
                <img src={item.url} alt={item.name} />
              ) : item.url ? (
                <audio controls src={item.url} />
              ) : (
                <div className="k-media-placeholder">
                  <Icon name="camera" />
                </div>
              )}
              <strong>{item.name}</strong>
              <span className="k-meta">
                {
                  {
                    queued: t("Queued", "等候處理"),
                    uploading: t("Reading file…", "正在讀取⋯"),
                    processing: t("Preparing preview…", "正在處理預覽⋯"),
                    ready: t("Ready on this device", "已備妥於此裝置"),
                    failed: t("Could not process", "處理失敗"),
                  }[item.status]
                }
              </span>
              {item.error && <p className="k-error-text">{item.error}</p>}
              <div className="k-actions">
                {item.status === "failed" && files.current.has(item.id) && (
                  <button
                    type="button"
                    className="k-text-btn"
                    onClick={() =>
                      void process(item.id, files.current.get(item.id)!)
                    }
                  >
                    {t("Retry", "重試")}
                  </button>
                )}
                <button
                  type="button"
                  className="k-text-btn"
                  onClick={() => {
                    latest.current = latest.current.filter(
                      (m) => m.id !== item.id,
                    );
                    setMedia(latest.current);
                  }}
                >
                  {t("Remove", "移除")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function RecordPage() {
  const { t, href, auth, run, store } = useApp(),
    router = useRouter(),
    [note, setNote] = useState(""),
    [media, setMedia] = useState<m.Media[]>([]),
    [target, setTarget] = useState(""),
    [pending, setPending] = useState(false),
    created = useRef<m.Trip | null>(null),
    key = useRef(m.id("capture"));
  const canSave =
    note.trim().length > 0 || media.some((m) => m.status === "ready");
  function save() {
    auth(() => {
      setPending(true);
      setTimeout(() => {
        let trip = target
          ? m.read().trips.find((t) => t.id === target)
          : created.current;
        if (!trip) {
          trip = run(() =>
            m.create(
              t("A new travel memory", "一段新的旅行記錄"),
              "journal",
              "",
              key.current,
            ),
          );
          if (trip) created.current = trip;
        }
        if (trip) {
          const saved = run(() =>
            m.save(
              {
                ...trip!,
                note: [trip!.note, note].filter(Boolean).join("\n"),
                media: [...trip!.media, ...media],
              },
              trip!.revision,
              key.current + "-save",
            ),
          );
          if (saved)
            router.push(href("studio/adventures/" + saved.id + "/edit"));
        }
        setPending(false);
      }, 200);
    });
  }
  return (
    <div className="k-page k-record-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">A MOMENT WORTH KEEPING</p>
          <h1>{t("Record your journey", "記錄你的旅程")}</h1>
          <p>
            {t(
              "Start with one photo or one thought. Organise it later.",
              "由一張照片或一個念頭開始，之後再慢慢整理。",
            )}
          </p>
        </div>
        <Chip>
          <Icon name="lock" size={13} />
          {t("Private by default", "預設私人")}
        </Chip>
      </div>
      <div className="k-record-layout">
        <section className="k-panel">
          <Capture
            note={note}
            setNote={(v) => {
              setNote(v);
              key.current = m.id("capture");
            }}
            media={media}
            setMedia={(v) => {
              setMedia(v);
              key.current = m.id("capture");
            }}
          />
          <div className="k-capture-footer">
            <label>
              {t("Save to", "儲存至")}
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  key.current = m.id("capture");
                }}
              >
                <option value="">
                  {t("New private journal", "新的私人記錄")}
                </option>
                {m
                  .tripsFor(store)
                  .filter((t) => m.permission(store.session, t).edit)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="k-btn primary"
              disabled={
                !canSave ||
                pending ||
                media.some((m) =>
                  ["queued", "uploading", "processing"].includes(m.status),
                )
              }
              onClick={save}
            >
              {pending
                ? t("Saving…", "正在保存⋯")
                : t("Save demo draft", "儲存示範草稿")}
              <Icon name="arrow" />
            </button>
          </div>
        </section>
        <aside className="k-record-aside">
          <span className="k-number-accent">01</span>
          <h2>{t("Keep the moment.", "先記住這一刻。")}</h2>
          <p>
            {t(
              "You don’t need a title, dates or a perfect itinerary to begin.",
              "不需要想好標題、日期或完整行程，現在就可以開始。",
            )}
          </p>
          <div className="k-aside-line" />
          <Icon name="lock" size={23} />
          <p>
            {t(
              "Only the content you select and review can become a demo publication.",
              "只有你選取並審閱的內容，才會成為示範公開版本。",
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
export function StudioNav() {
  const { t, href } = useApp();
  return (
    <nav className="k-studio-nav">
      {[
        ["studio", "Today", "今日"],
        ["studio/adventures", "My adventures", "我的旅程記錄"],
        ["studio/opportunities", "Opportunities", "合作機會"],
        ["studio/earnings", "Earnings", "收益"],
      ].map(([p, en, zh]) => (
        <Link href={href(p)} key={p}>
          {t(en, zh)}
        </Link>
      ))}
    </nav>
  );
}
export function StudioPage() {
  const { t, href, store, auth, ready } = useApp(),
    [tab, setTab] = useState("all"),
    trips = m
      .tripsFor(store)
      .filter((t) => t.purpose === "journal")
      .filter((t) =>
        tab === "draft"
          ? !t.publicationSlug
          : tab === "published"
            ? !!t.publicationSlug
            : true,
      );
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">CREATOR STUDIO</p>
          <h1>{t("My adventures", "我的旅程記錄")}</h1>
        </div>
        <Link className="k-btn primary" href={href("record")}>
          <Icon name="plus" />
          {t("Record a new journey", "記錄新旅程")}
        </Link>
      </div>
      <StudioNav />
      <div className="k-tabs">
        {[
          ["all", "All", "全部"],
          ["draft", "Drafts", "草稿"],
          ["published", "Published", "已發布"],
        ].map(([value, en, zh]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {t(en, zh)}
          </button>
        ))}
      </div>
      {!ready ? (
        <p role="status">{t("Loading…", "正在載入⋯")}</p>
      ) : !store.session ? (
        <Empty
          title={t(
            "Your memories, ready to take shape",
            "把你的旅行記憶慢慢整理好",
          )}
        >
          <button className="k-btn primary" onClick={() => auth()}>
            {t("Enter demo account", "進入示範帳戶")}
          </button>
        </Empty>
      ) : !trips.length ? (
        <Empty
          title={t(
            "Every journey starts with a moment",
            "每段旅程，都由一刻開始",
          )}
          body={t(
            "Save a photo or a note. No creator profile is required.",
            "先儲存照片或筆記，不需先完成創作者檔案。",
          )}
        >
          <Link className="k-btn primary" href={href("record")}>
            {t("Record a moment", "記錄這一刻")}
          </Link>
        </Empty>
      ) : (
        <div className="k-trip-grid">
          {trips.map((trip) => {
            const p =
                trip.publicationSlug &&
                m.findPublic(store, trip.publicationSlug),
              cover = trip.media.find(
                (x) => x.status === "ready" && x.url.startsWith("data:image/"),
              );
            return (
              <Link
                className="k-trip-card"
                href={href("studio/adventures/" + trip.id + "/edit")}
                key={trip.id}
              >
                {cover && (
                  <img
                    className="k-studio-cover"
                    src={cover.url}
                    alt={trip.title}
                  />
                )}
                <Chip tone={p ? "green" : ""}>
                  {p
                    ? trip.publishedRevision === trip.revision
                      ? t("Published demo", "已發布示範")
                      : t("Unpublished changes", "有未發布修改")
                    : t("Private draft", "私人草稿")}
                </Chip>
                <h2>{trip.title}</h2>
                <p>
                  {trip.destination || t("Destination to add", "目的地待填")} ·{" "}
                  {m.count(trip)} {t("stops", "站")}
                </p>
                <div className="k-trip-card-footer">
                  <span>{t("Continue organising", "繼續整理")}</span>
                  <Icon name="arrow" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
export function TripEditor({ id }: { id: string }) {
  const { t, locale, store, ready, href, run, open, close, auth, notify } =
      useApp(),
    saved = store.trips.find((t) => t.id === id),
    [draft, setDraft] = useState<m.Trip | null>(null),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState("saved"),
    [tab, setTab] = useState("days"),
    [dayIndex, setDayIndex] = useState(0),
    [selected, setSelected] = useState(""),
    [undo, setUndo] = useState<{
      stop: m.Stop;
      dayId: string;
      index: number;
    } | null>(null),
    [mapFail, setMapFail] = useState(false),
    key = useRef(m.id("save")),
    draftRef = useRef(draft);
  useEffect(() => {
    if (m.permission(store.session, saved).read) {
      draftRef.current = structuredClone(saved!);
      setDraft(draftRef.current);
      setDirty(false);
      setStatus("saved");
    } else setDraft(null);
  }, [id, store.session?.id, store.session?.role, ready]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    if (
      !dirty &&
      saved &&
      m.permission(store.session, saved).read &&
      saved.revision !== draftRef.current?.revision
    ) {
      draftRef.current = structuredClone(saved);
      setDraft(draftRef.current);
      setStatus("saved");
    }
  }, [saved?.revision]);
  useEffect(() => {
    if (!dirty || ["failed", "saving"].includes(status) || !draft) return;
    const timer = setTimeout(() => saveDraft(), 1200);
    return () => clearTimeout(timer);
  }, [draft, dirty, status]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(fn: (t: m.Trip) => void) {
    if (!draft || !m.permission(store.session, draft).edit) return;
    const next = structuredClone(draftRef.current || draft);
    fn(next);
    draftRef.current = next;
    setDraft(next);
    setDirty(true);
    setStatus("unsaved");
    key.current = m.id("save");
  }
  function saveDraft(): m.Trip | undefined {
    const current = draftRef.current || draft;
    if (!current) return;
    setStatus("saving");
    const result = run(() => m.save(current, current.revision, key.current));
    if (result) {
      setDraft(result);
      draftRef.current = result;
      setDirty(false);
      setStatus("saved");
    } else setStatus("failed");
    return result;
  }
  if (!ready)
    return (
      <div className="k-page k-loading" role="status">
        {t("Opening your trip…", "正在開啟行程⋯")}
      </div>
    );
  if (!saved || !m.permission(store.session, saved).read || !draft)
    return (
      <div className="k-page">
        <Empty
          title={t(
            "This private trip is not available to this account",
            "此帳戶未能開啟這個私人行程",
          )}
          body={t(
            "Open the account that owns it, or return to your trips.",
            "請使用擁有此行程的帳戶，或返回你的行程。",
          )}
        >
          <Link className="k-btn" href={href("trips")}>
            {t("My trips", "我的行程")}
          </Link>
          {!store.session && (
            <button className="k-btn primary" onClick={() => auth()}>
              {t("Enter demo account", "進入示範帳戶")}
            </button>
          )}
        </Empty>
      </div>
    );
  const perms = m.permission(store.session, draft),
    day = draft.days[Math.min(dayIndex, draft.days.length - 1)],
    publication = draft.publicationSlug
      ? m.findPublic(store, draft.publicationSlug)
      : undefined,
    pendingProposal = store.proposals.find(
      (p) => p.tripId === id && p.status === "needs_review",
    ),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: draft.timezone || "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    todayOffset = draft.date
      ? Math.floor((Date.parse(today) - Date.parse(draft.date)) / 86400000)
      : -1;
  const selectedStop = day?.stops.find((s) => s.id === selected);
  function organise(kind: m.Proposal["kind"]) {
    let current = draftRef.current!;
    if (dirty) {
      const result = saveDraft();
      if (!result) return;
      current = result;
    }
    open(
      t("Organise with AI · demo", "AI 幫我整理・示範"),
      <ProposalFlow
        trip={current}
        kind={kind}
        onApplied={(trip) => {
          setDraft(trip);
          draftRef.current = trip;
          setDirty(false);
          setStatus("saved");
        }}
      />,
    );
  }
  function exportTrip() {
    open(
      t("Download a private snapshot", "下載私人行程快照"),
      <div className="k-modal-body">
        <p>
          {t(
            "Includes the itinerary and your private notes. Keep this file private. Maps and audio are not available offline.",
            "包含行程及私人筆記，請妥善保管檔案。離線快照不包含地圖及語音。",
          )}
        </p>
        <button
          className="k-btn primary"
          onClick={() => {
            const safe = {
              title: draft!.title,
              date: draft!.date,
              timezone: draft!.timezone,
              snapshotAt: new Date().toISOString(),
              scope: "private; itinerary and notes; no offline maps",
              days: draft!.days.map((d) => ({
                ...d,
                stops: d.stops.map((s) => m.effectiveStop(store, s)),
              })),
              privateNote: draft!.note,
            };
            download(
              "kinnso-private-trip.json",
              JSON.stringify(safe, null, 2),
              "application/json",
            );
            close();
            notify(t("Private snapshot downloaded", "已下載私人行程快照"));
          }}
        >
          <Icon name="download" />
          {t("Download private file", "下載私人檔案")}
        </button>
      </div>,
    );
  }
  return (
    <div className="k-editor">
      <div className="k-editor-top">
        <Link
          className="k-back"
          href={href(
            draft.purpose === "journal" ? "studio/adventures" : "trips",
          )}
        >
          ←{" "}
          {draft.purpose === "journal"
            ? t("My adventures", "我的旅程記錄")
            : t("My trips", "我的行程")}
        </Link>
        <div className="k-actions">
          <span
            className={`k-save-status ${status === "failed" ? "error" : ""}`}
            role="status"
          >
            <Icon name={status === "saved" ? "check" : "clock"} size={15} />
            {status === "saved"
              ? t("Saved on this browser", "已儲存於此瀏覽器")
              : status === "saving"
                ? t("Saving…", "正在保存⋯")
                : status === "failed"
                  ? t("Not saved · retry", "未保存・請重試")
                  : t("Unsaved changes", "尚未保存修改")}
          </span>
          {perms.edit && (
            <button
              className="k-btn compact"
              onClick={saveDraft}
              disabled={!dirty && status === "saved"}
            >
              {status === "failed"
                ? t("Retry save", "重試保存")
                : t("Save", "儲存")}
            </button>
          )}
          <button
            className="k-icon-btn"
            aria-label={t("Download private snapshot", "下載私人行程快照")}
            onClick={exportTrip}
          >
            <Icon name="download" />
          </button>
        </div>
      </div>
      <div className="k-editor-heading">
        <div>
          <div className="k-actions">
            <Chip>
              <Icon name="lock" size={12} />
              {t("Private", "私人")}
            </Chip>
            <span className="k-meta">
              {draft.purpose === "journal"
                ? t("Travel journal", "旅程記錄")
                : t("Personal trip", "個人行程")}
            </span>
            {!perms.edit && <Chip>{t("Read only", "唯讀")}</Chip>}
          </div>
          <input
            className="k-title-input"
            aria-label={t("Trip title", "行程標題")}
            value={draft.title}
            maxLength={120}
            disabled={!perms.edit}
            onChange={(e) =>
              change((t) => {
                t.title = e.target.value;
              })
            }
          />
          <div className="k-editor-facts">
            <label>
              <Icon name="pin" size={16} />
              <input
                aria-label={t("Trip destination", "行程目的地")}
                value={draft.destination}
                maxLength={80}
                placeholder={t("Add destination", "加入目的地")}
                disabled={!perms.edit}
                onChange={(e) =>
                  change((t) => {
                    t.destination = e.target.value;
                  })
                }
              />
            </label>
            <label>
              <Icon name="calendar" size={16} />
              <input
                type="date"
                aria-label={t("Departure date", "出發日期")}
                value={draft.date}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  change((t) => {
                    t.date = value;
                  });
                }}
                disabled={!perms.edit}
                onBlur={(e) => {
                  const value = e.currentTarget.value;
                  if (value !== (draftRef.current?.date || ""))
                    change((t) => {
                      t.date = value;
                    });
                }}
                onChange={(e) =>
                  change((t) => {
                    t.date = e.target.value;
                  })
                }
              />
            </label>
            <select
              aria-label={t("Trip timezone", "行程時區")}
              value={draft.timezone}
              disabled={!perms.edit}
              onChange={(e) =>
                change((t) => {
                  t.timezone = e.target.value;
                })
              }
            >
              {[
                "Asia/Hong_Kong",
                "Asia/Tokyo",
                "Asia/Seoul",
                "Asia/Singapore",
                "Europe/Lisbon",
                "Etc/UTC",
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
        </div>
        {perms.edit && (
          <button
            className="k-btn dark"
            onClick={() =>
              organise(draft.purpose === "journal" ? "organise" : "relax")
            }
          >
            <Icon name="spark" />
            {t("Help me organise", "幫我整理")}
          </button>
        )}
      </div>
      {status === "failed" && (
        <div className="k-alert error">
          <span>
            {t(
              "Your edits are kept here. Compare with the saved trip before replacing anything.",
              "你的修改仍在這裏保留，請先比較已保存版本。",
            )}
          </span>
          <button
            onClick={() =>
              open(
                t("Compare saved version", "比較已保存版本"),
                <div className="k-modal-body">
                  <div className="k-diff-grid">
                    <div>
                      <h3>{t("Your edits", "你的修改")}</h3>
                      <p>
                        {draft.title} · {m.count(draft)} {t("stops", "站")}
                      </p>
                      <pre>{draft.note}</pre>
                    </div>
                    <div>
                      <h3>{t("Saved version", "已保存版本")}</h3>
                      <p>
                        {saved.title} · {m.count(saved)} {t("stops", "站")}
                      </p>
                      <pre>{saved.note}</pre>
                    </div>
                  </div>
                  <button
                    className="k-btn"
                    onClick={() => {
                      setDraft(structuredClone(saved));
                      draftRef.current = structuredClone(saved);
                      setDirty(false);
                      setStatus("saved");
                      close();
                    }}
                  >
                    {t("Load saved version", "載入已保存版本")}
                  </button>
                </div>,
              )
            }
          >
            {t("Compare", "比較")}
          </button>
        </div>
      )}
      {publication && (
        <div className="k-publication-strip">
          <Chip tone="green">
            {t("Demo publication", "示範公開版本")} v{publication.version}
          </Chip>
          <span>
            {draft.publishedRevision === draft.revision && !dirty
              ? t("Your public version is up to date.", "公開版本已更新。")
              : t(
                  "Your private edits are not published yet.",
                  "私人修改尚未發布。",
                )}
          </span>
          <Link href={href("g/" + publication.slug)}>
            {t("View public version", "查看公開版本")} →
          </Link>
        </div>
      )}
      {todayOffset >= 0 && todayOffset < draft.days.length && (
        <button
          className="k-today"
          onClick={() => {
            setDayIndex(todayOffset);
            setTab("days");
          }}
        >
          <Icon name="compass" />
          {t("Today", "今日")} · {draft.days[todayOffset].name[locale]}
          <span>
            {t("Next stop", "下一站")}：
            {draft.days[todayOffset].stops[0]?.name[locale] ||
              t("No stops yet", "尚未有站點")}
          </span>
          <Icon name="arrow" />
        </button>
      )}
      <div className="k-tabs">
        {[
          ["days", "Days", "逐日行程"],
          ["map", "Map", "地圖"],
          ["notes", "Notes & media", "筆記及素材"],
          ["saved", "Saved routes", "收藏路線"],
          ["bookings", "Bookings", "預訂"],
        ].map(([value, en, zh]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {t(en, zh)}
          </button>
        ))}
        {perms.publish && (
          <button
            className="k-publish-tab"
            onClick={() => {
              let current = draft;
              if (dirty) {
                const saved = saveDraft();
                if (!saved) return;
                current = saved;
              }
              open(
                t("Preview publication", "預覽公開內容"),
                <PublishFlow
                  trip={current}
                  onUpdated={() => {
                    const updated = m.read().trips.find((t) => t.id === id)!;
                    setDraft(updated);
                    draftRef.current = updated;
                  }}
                />,
              );
            }}
          >
            <Icon name="globe" size={16} />
            {t("Preview publication", "預覽公開內容")}
          </button>
        )}
      </div>
      {tab === "notes" ? (
        <div className="k-panel">
          {perms.edit ? (
            <Capture
              note={draft.note}
              setNote={(note) =>
                change((t) => {
                  t.note = note;
                })
              }
              media={draft.media}
              setMedia={(media) =>
                change((t) => {
                  t.media = media;
                })
              }
            />
          ) : (
            <div>
              <h3>{t("Private notes", "私人筆記")}</h3>
              <p className="k-personal-note">
                {draft.note || t("No notes yet.", "尚未有筆記。")}
              </p>
              <p>
                {draft.media.length}{" "}
                {t("saved media items", "個已保存媒體項目")}
              </p>
            </div>
          )}
          {draft.media.length > 0 && (
            <div className="k-media-permissions">
              <h3>{t("Choose public images", "選擇公開照片")}</h3>
              {draft.media
                .filter((m) => m.url.startsWith("data:image/"))
                .map((media) => (
                  <div className="k-media-permission" key={media.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={media.public}
                        disabled={!perms.edit || media.status !== "ready"}
                        onChange={(e) =>
                          change((t) => {
                            t.media.find((m) => m.id === media.id)!.public =
                              e.target.checked;
                          })
                        }
                      />
                      {media.name}
                    </label>
                    <select
                      aria-label={t("Assign photo to stop", "照片歸屬站點")}
                      value={media.stopId || ""}
                      disabled={!perms.edit}
                      onChange={(e) =>
                        change((t) => {
                          t.media.find((m) => m.id === media.id)!.stopId =
                            e.target.value || undefined;
                        })
                      }
                    >
                      <option value="">{t("Cover only", "只作封面")}</option>
                      {draft.days
                        .flatMap((d) => d.stops)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name[locale]}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : tab === "bookings" ? (
        <BookingsPage embedded />
      ) : tab === "saved" ? (
        <div className="k-card-grid">
          {m
            .publications(store)
            .filter((a) =>
              (store.bookmarks[store.session!.id] || []).includes(a.slug),
            )
            .map((a) => (
              <AdventureCard a={a} key={a.id} />
            ))}
        </div>
      ) : (
        <div className={`k-editor-layout ${tab === "map" ? "map-only" : ""}`}>
          <aside className="k-day-sidebar">
            <p className="k-eyebrow">{t("ITINERARY", "逐日行程")}</p>
            {draft.days.map((d, i) => (
              <button
                key={d.id}
                className={i === dayIndex ? "active" : ""}
                onClick={() => {
                  setDayIndex(i);
                  setSelected("");
                }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{d.name[locale]}</strong>
                  <small>
                    {d.stops.length} {t("stops", "站")}
                  </small>
                </div>
              </button>
            ))}
            {perms.edit && (
              <button
                className="k-add-day"
                onClick={() =>
                  change((t) => {
                    t.days.push({
                      id: m.id("day"),
                      name: m.w(
                        `Day ${t.days.length + 1}`,
                        `第 ${t.days.length + 1} 日`,
                      ),
                      stops: [],
                    });
                  })
                }
              >
                <Icon name="plus" />
                {t("Add day", "新增日次")}
              </button>
            )}
            <div className="k-sidebar-ai">
              <Icon name="spark" />
              <strong>{t("A little help?", "想調整一下？")}</strong>
              {perms.edit && (
                <>
                  <button onClick={() => organise("relax")}>
                    {t("Make Day 1 more relaxed", "第一日輕鬆啲")}
                  </button>
                  <button onClick={() => organise("three")}>
                    {t("Make it a 3-day trip", "改成三日行程")}
                  </button>
                </>
              )}
              {pendingProposal && (
                <button
                  onClick={() =>
                    open(
                      t("Review saved suggestion", "審閱已保存建議"),
                      <ProposalFlow
                        trip={draft}
                        kind={pendingProposal.kind}
                        existing={pendingProposal}
                        onApplied={(trip) => {
                          setDraft(trip);
                          draftRef.current = trip;
                          setDirty(false);
                        }}
                      />,
                    )
                  }
                >
                  {t("Resume suggestion", "繼續審閱建議")}
                </button>
              )}
            </div>
          </aside>
          <section className="k-editor-stops">
            <div className="k-section-title">
              <input
                className="k-day-name"
                aria-label={t("Day name", "日次名稱")}
                value={day.name[locale]}
                disabled={!perms.edit}
                maxLength={80}
                onChange={(e) =>
                  change((t) => {
                    t.days[dayIndex].name = m.w(e.target.value, e.target.value);
                  })
                }
              />
              <span className="k-meta">
                {day.stops.length} {t("stops", "站")}
              </span>
            </div>
            {!day.stops.length && (
              <Empty
                title={t("A day with possibilities", "這一天，充滿可能")}
                body={t(
                  "Add a stop or organise your notes.",
                  "加入站點，或整理你的筆記。",
                )}
              />
            )}
            {day.stops.map((raw, i) => {
              const s = m.effectiveStop(store, raw),
                withdrawn =
                  !!raw.origin && !m.findPublic(store, raw.origin.slug);
              return (
                <article
                  className={`k-edit-stop ${selected === s.id ? "selected" : ""}`}
                  key={s.id}
                >
                  <div className="k-edit-stop-head">
                    <button
                      className="k-stop-number"
                      aria-label={`${t("Select", "選取")} ${s.name[locale]}`}
                      onClick={() => setSelected(s.id)}
                    >
                      {i + 1}
                    </button>
                    <div>
                      <h3>{s.name[locale]}</h3>
                      <span className="k-meta">
                        {s.lat === null
                          ? t("Location to confirm", "位置待確認")
                          : t("Location provided", "已提供位置")}{" "}
                        ·{" "}
                        {s.status === "suggested"
                          ? t("AI suggestion", "AI 建議")
                          : s.status === "visited"
                            ? t("Marked visited", "已標示到訪")
                            : t("Planned", "計劃到訪")}
                      </span>
                    </div>
                    {perms.edit && (
                      <button
                        className="k-icon-btn"
                        aria-label={`${t("Edit", "編輯")} ${s.name[locale]}`}
                        onClick={() =>
                          setSelected(selected === s.id ? "" : s.id)
                        }
                      >
                        <Icon name="note" size={17} />
                      </button>
                    )}
                  </div>
                  {s.note[locale] && <p>{s.note[locale]}</p>}
                  {raw.personalNote && (
                    <p className="k-personal-note">
                      <Icon name="lock" size={14} />
                      {raw.personalNote}
                    </p>
                  )}
                  {raw.origin && (
                    <details className="k-origin">
                      <summary>
                        {t("Source", "來源")} ·{" "}
                        {m.creators.find((c) => c.id === raw.origin?.creator)
                          ?.name || raw.origin.creator}{" "}
                        · v{raw.origin.version}
                        {withdrawn
                          ? " · " + t("Withdrawn", "已撤回")
                          : m.findPublic(store, raw.origin.slug)!.version >
                              raw.origin.version
                            ? " · " + t("Update available", "來源有更新")
                            : ""}
                      </summary>
                      {!withdrawn && (
                        <Link href={href("g/" + raw.origin.slug)}>
                          {t("Open original route", "開啟原作")} →
                        </Link>
                      )}
                      <p>
                        {t(
                          "Your changes stay independent of the original.",
                          "你的修改與原作保持獨立。",
                        )}
                      </p>
                    </details>
                  )}
                  {selected === s.id && perms.edit && (
                    <StopFields
                      stop={raw}
                      withdrawn={withdrawn}
                      update={(patch) =>
                        change((t) => {
                          Object.assign(
                            t.days[dayIndex].stops.find(
                              (x) => x.id === raw.id,
                            )!,
                            patch,
                          );
                        })
                      }
                    />
                  )}
                  <div className="k-edit-stop-actions">
                    {perms.edit && (
                      <>
                        <button
                          aria-label={`${t("Move up", "上移")} ${s.name[locale]}`}
                          disabled={i === 0}
                          onClick={() =>
                            change((t) => {
                              const arr = t.days[dayIndex].stops;
                              [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`${t("Move down", "下移")} ${s.name[locale]}`}
                          disabled={i === day.stops.length - 1}
                          onClick={() =>
                            change((t) => {
                              const arr = t.days[dayIndex].stops;
                              [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                            })
                          }
                        >
                          ↓
                        </button>
                        <select
                          aria-label={`${t("Move to day", "移至日次")} ${s.name[locale]}`}
                          value={day.id}
                          onChange={(e) => {
                            const target = e.target.value;
                            change((t) => {
                              const st = t.days[dayIndex].stops.splice(i, 1)[0];
                              t.days
                                .find((d) => d.id === target)!
                                .stops.push(st);
                            });
                          }}
                        >
                          {draft.days.map((d, j) => (
                            <option value={d.id} key={d.id}>
                              {t("Day", "第")} {j + 1}
                              {locale === "zh-HK" ? " 日" : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          className="k-delete"
                          aria-label={`${t("Delete", "刪除")} ${s.name[locale]}`}
                          onClick={() => {
                            setUndo({
                              stop: structuredClone(raw),
                              dayId: day.id,
                              index: i,
                            });
                            change((t) => {
                              t.days[dayIndex].stops.splice(i, 1);
                            });
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    )}
                    {s.lat !== null && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name="external" size={16} />
                        {t("Directions", "查看導航")}
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
            {undo && (
              <div className="k-alert">
                <span>{t("Stop removed.", "已移除站點。")}</span>
                <button
                  onClick={() => {
                    change((t) => {
                      const target = t.days.find((d) => d.id === undo.dayId);
                      if (
                        target &&
                        !t.days.some((d) =>
                          d.stops.some((s) => s.id === undo.stop.id),
                        )
                      )
                        target.stops.splice(
                          Math.min(undo.index, target.stops.length),
                          0,
                          structuredClone(undo.stop),
                        );
                    });
                    setUndo(null);
                  }}
                >
                  {t("Undo", "撤銷")}
                </button>
              </div>
            )}
            {perms.edit && (
              <button
                className="k-add-stop"
                onClick={() => {
                  const sid = m.id("stop");
                  change((t) => {
                    t.days[dayIndex].stops.push({
                      id: sid,
                      name: m.w("New stop", "新站點"),
                      note: m.w("", ""),
                      personalNote: "",
                      lat: null,
                      lng: null,
                      status: "planned",
                      public: false,
                    });
                  });
                  setSelected(sid);
                }}
              >
                <Icon name="plus" />
                {t("Add a stop", "新增站點")}
              </button>
            )}
          </section>
          <aside className="k-editor-map">
            <TripMap
              stops={day.stops.map((s) => m.effectiveStop(store, s))}
              locale={locale}
              selected={selected}
              onSelect={setSelected}
              failed={mapFail}
            />
            <details className="k-diagnostics">
              <summary>{t("Demo recovery options", "示範復原選項")}</summary>
              <label>
                <input
                  type="checkbox"
                  checked={mapFail}
                  onChange={(e) => setMapFail(e.target.checked)}
                />
                {t("Map unavailable", "模擬地圖未能載入")}
              </label>
              <select
                aria-label={t("Next action scenario", "下一步操作情境")}
                onChange={(e) => m.fault(e.target.value as m.Fault)}
                defaultValue="none"
              >
                <option value="none">
                  {t("Normal operation", "正常操作")}
                </option>
                {[
                  ["network", "Connection failure", "連線失敗"],
                  ["conflict", "Saved version conflict", "保存版本衝突"],
                  ["quota", "AI limit reached", "AI 額度已用完"],
                  ["expired", "Expired approval", "審閱已過期"],
                  ["contract", "Unexpected response", "回應格式異常"],
                ].map(([value, en, zh]) => (
                  <option key={value} value={value}>
                    {t(en, zh)}
                  </option>
                ))}
              </select>
            </details>
          </aside>
        </div>
      )}
    </div>
  );
}
function StopFields({
  stop,
  withdrawn,
  update,
}: {
  stop: m.Stop;
  withdrawn: boolean;
  update: (v: Partial<m.Stop>) => void;
}) {
  const { t, locale } = useApp(),
    [lat, setLat] = useState(stop.lat === null ? "" : String(stop.lat)),
    [lng, setLng] = useState(stop.lng === null ? "" : String(stop.lng)),
    [err, setErr] = useState(false);
  return (
    <div className="k-stop-fields k-form">
      {!withdrawn && (
        <>
          <label>
            {t("Place name", "地點名稱")}
            <input
              value={stop.name[locale]}
              maxLength={120}
              onChange={(e) =>
                update({ name: m.w(e.target.value, e.target.value) })
              }
            />
          </label>
          <label>
            {t("Public tip", "公開提示")}
            <textarea
              value={stop.note[locale]}
              maxLength={2000}
              rows={2}
              onChange={(e) =>
                update({ note: m.w(e.target.value, e.target.value) })
              }
            />
          </label>
          <div className="k-coordinate-fields">
            <label>
              {t("Latitude", "緯度")}
              <input
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              {t("Longitude", "經度")}
              <input
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
            <button
              className="k-btn"
              onClick={() => {
                if (lat === "" && lng === "") {
                  update({ lat: null, lng: null });
                  setErr(false);
                } else if (
                  lat !== "" &&
                  lng !== "" &&
                  Number.isFinite(Number(lat)) &&
                  Number.isFinite(Number(lng)) &&
                  Math.abs(Number(lat)) <= 90 &&
                  Math.abs(Number(lng)) <= 180
                ) {
                  update({ lat: Number(lat), lng: Number(lng) });
                  setErr(false);
                } else setErr(true);
              }}
            >
              {t("Confirm location", "確認位置")}
            </button>
          </div>
          {err && (
            <p className="k-error-text" role="alert">
              {t(
                "Enter valid latitude and longitude together.",
                "請同時輸入有效緯度及經度。",
              )}
            </p>
          )}
          <label>
            {t("Visit status", "到訪狀態")}
            <select
              value={stop.status}
              onChange={(e) =>
                update({ status: e.target.value as m.Stop["status"] })
              }
            >
              <option value="planned">{t("Planned visit", "計劃到訪")}</option>
              <option value="visited">{t("I have visited", "我已到訪")}</option>
              <option value="suggested">
                {t("Suggestion to review", "建議待確認")}
              </option>
            </select>
          </label>
          <label className="k-check-label">
            <input
              type="checkbox"
              checked={stop.public}
              onChange={(e) => update({ public: e.target.checked })}
            />
            {t(
              "Include this stop in publication preview",
              "將此站加入公開預覽",
            )}
          </label>
        </>
      )}
      <label>
        {t("Private note", "私人筆記")}
        <textarea
          value={stop.personalNote}
          maxLength={2000}
          rows={2}
          onChange={(e) => update({ personalNote: e.target.value })}
        />
      </label>
    </div>
  );
}
function ProposalFlow({
  trip,
  kind,
  existing,
  onApplied,
}: {
  trip: m.Trip;
  kind: m.Proposal["kind"];
  existing?: m.Proposal;
  onApplied: (t: m.Trip) => void;
}) {
  const { t, run, close, notify } = useApp(),
    [phase, setPhase] = useState(existing ? "review" : "idle"),
    [proposal, setProposal] = useState<m.Proposal | undefined>(existing),
    [current, setCurrent] = useState(trip),
    key = useRef(m.id("propose")),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function generate() {
    setPhase("running");
    timer.current = setTimeout(() => {
      const fresh = m.read().trips.find((t) => t.id === trip.id) || trip;
      setCurrent(fresh);
      const p = run(() => m.propose(fresh, kind, key.current));
      if (p) {
        setProposal(p);
        setPhase("review");
      } else setPhase("failed");
    }, 600);
  }
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    if (proposal) run(() => m.cancelProposal(proposal.id));
    setPhase("cancelled");
  }
  return (
    <div className="k-modal-body k-proposal">
      <div className="k-info-panel compact">
        <Icon name="spark" />
        <p>
          {t(
            "Demo suggestions use your notes and existing stops. No live AI service is connected.",
            "示範建議以你的筆記及現有站點整理，尚未接通真實 AI 服務。",
          )}
        </p>
      </div>
      {phase === "idle" && (
        <>
          <h3>
            {kind === "organise"
              ? t("Turn notes into draft stops", "將筆記整理成草稿站點")
              : kind === "relax"
                ? t("Leave a little more room on Day 1", "為第一日留多一點空間")
                : t("Spread this trip across three days", "將行程分成三日")}
          </h3>
          <p>
            {t(
              "Review every change before it is applied.",
              "你可以在套用前審閱每項修改。",
            )}
          </p>
          <button className="k-btn primary wide" onClick={generate}>
            <Icon name="spark" />
            {t("Prepare demo suggestions", "產生示範建議")}
          </button>
        </>
      )}
      {phase === "running" && (
        <div className="k-empty">
          <div className="k-spinner" />
          <h3 role="status">{t("Organising your trip…", "正在整理行程⋯")}</h3>
          <button className="k-btn" onClick={cancel}>
            {t("Cancel", "取消")}
          </button>
        </div>
      )}
      {phase === "cancelled" && (
        <Empty
          title={t(
            "Cancelled. Your trip is unchanged.",
            "已取消，行程保持原樣。",
          )}
        >
          <button
            className="k-btn"
            onClick={() => {
              key.current = m.id("propose");
              generate();
            }}
          >
            {t("Try again", "再試一次")}
          </button>
        </Empty>
      )}
      {phase === "failed" && (
        <Empty
          title={t("Could not organise this time", "這次未能完成整理")}
          body={t(
            "Your notes and stops are kept. You can retry or edit manually.",
            "筆記及站點仍保留，你可以重試或繼續手動編輯。",
          )}
        >
          <button
            className="k-btn primary"
            onClick={() => {
              key.current = m.id("propose");
              generate();
            }}
          >
            {t("Retry suggestions", "重試建議")}
          </button>
          <button className="k-btn" onClick={close}>
            {t("Continue editing", "繼續編輯")}
          </button>
        </Empty>
      )}
      {phase === "review" && proposal && (
        <>
          <div className="k-section-title">
            <h3>{t("Review changes", "審閱修改")}</h3>
            <Chip>
              {proposal.changes.filter((c) => c.selected).length}{" "}
              {t("selected", "項已選")}
            </Chip>
          </div>
          <div className="k-diff-summary">
            <div>
              <span>{t("Before", "修改前")}</span>
              <strong>
                {current.days.length} {t("days", "日")} · {m.count(current)}{" "}
                {t("stops", "站")}
              </strong>
            </div>
            <Icon name="arrow" />
            <div>
              <span>{t("After approval", "確認後")}</span>
              <strong>
                {proposal.kind === "three"
                  ? Math.max(3, current.days.length)
                  : proposal.kind === "relax"
                    ? Math.max(2, current.days.length)
                    : current.days.length}{" "}
                {t("days", "日")} ·{" "}
                {m.count(current) +
                  (proposal.kind === "organise"
                    ? proposal.changes.filter((c) => c.selected).length
                    : 0)}{" "}
                {t("stops", "站")}
              </strong>
            </div>
          </div>
          {proposal.changes.map((c) => (
            <div className="k-proposal-change" key={c.id}>
              <label className="k-check-label">
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={(e) =>
                    setProposal({
                      ...proposal,
                      changes: proposal.changes.map((x) =>
                        x.id === c.id
                          ? { ...x, selected: e.target.checked }
                          : x,
                      ),
                    })
                  }
                />
                <strong>
                  {proposal.kind === "organise"
                    ? t("Add a draft stop", "新增草稿站點")
                    : proposal.kind === "three"
                      ? t(
                          "Add Day 3 and move Day 1’s last stop",
                          "新增第 3 日並移入第 1 日最後一站",
                        )
                      : t(
                          "Move Day 1’s last stop to Day 2",
                          "將第 1 日最後一站移至第 2 日",
                        )}
                </strong>
              </label>
              {proposal.kind === "organise" && (
                <input
                  aria-label={t("Suggested stop name", "建議站點名稱")}
                  value={c.name}
                  maxLength={120}
                  onChange={(e) =>
                    setProposal({
                      ...proposal,
                      changes: proposal.changes.map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              )}
              <p className="k-meta">
                {proposal.kind === "organise"
                  ? t(
                      "Source: your private note or filename. Location and date remain unconfirmed.",
                      "來源：你的私人筆記或檔名，位置及日期仍待確認。",
                    )
                  : t(
                      "Source: your saved itinerary. No new place or visit is invented.",
                      "來源：你已保存的行程，不新增推測地點或到訪紀錄。",
                    )}
              </p>
            </div>
          ))}
          <div className="k-actions">
            <button
              className="k-btn primary"
              disabled={!proposal.changes.some((c) => c.selected)}
              onClick={() => {
                const result = run(() =>
                  m.apply(proposal, key.current + "-apply"),
                );
                if (result) {
                  onApplied(result);
                  setPhase("applied");
                  notify(
                    t("Demo changes applied and saved", "已套用並保存示範修改"),
                  );
                } else setPhase("failed");
              }}
            >
              {t("Apply changes", "套用修改")}
              <Icon name="check" />
            </button>
            <button className="k-btn" onClick={cancel}>
              {t("Reject suggestions", "略過建議")}
            </button>
          </div>
          <p className="k-meta">
            {t(
              "Approval expires after 10 minutes. Changes to the trip require a new comparison.",
              "審閱有效期為 10 分鐘。行程有修改時需重新比較。",
            )}
          </p>
        </>
      )}
      {phase === "applied" && (
        <Empty title={t("Your trip is updated", "行程已更新")}>
          <button className="k-btn primary" onClick={close}>
            {t("Back to my trip", "返回我的行程")}
          </button>
        </Empty>
      )}
    </div>
  );
}
function PublishFlow({
  trip,
  onUpdated,
}: {
  trip: m.Trip;
  onUpdated: () => void;
}) {
  const { t, locale, run, store, href, notify, close } = useApp(),
    [phase, setPhase] = useState("preview"),
    [publication, setPublication] = useState<m.Adventure | null>(null),
    key = useRef(m.id("publish")),
    preview = m.preview(trip),
    history = store.publications.filter((p) => p.slug === preview.slug),
    missing = [
      !trip.title.trim() ? t("Trip title", "行程標題") : "",
      !trip.destination ? t("Destination", "目的地") : "",
      !preview.days.length
        ? t(
            "Select at least one public stop in the editor",
            "請在編輯器選取至少一個公開站點",
          )
        : "",
    ].filter(Boolean),
    version = Math.max(0, ...history.map((p) => p.version)) + 1;
  function publish() {
    setPhase("preparing");
    setTimeout(() => {
      const p = run(() => m.publish(trip, key.current));
      if (p) {
        setPublication(p);
        onUpdated();
        setPhase("indexing");
        setTimeout(() => setPhase("ready"), 300);
      } else setPhase("preview");
    }, 350);
  }
  return (
    <div className="k-modal-body k-publish-flow">
      {phase === "preview" ? (
        <>
          <div className="k-info-panel compact">
            <Icon name="lock" />
            <p>
              {t(
                "Private notes, receipts, audio and original photo metadata are excluded. Only your selected public fields appear below.",
                "私人筆記、收據、語音及原始相片資料均不會公開。下方只顯示你已選取的公開欄位。",
              )}
            </p>
          </div>
          <div className="k-section-title">
            <Chip tone="green">
              {t("Next version", "下一版本")} v{version}
            </Chip>
            <Chip>
              {preview.cloneEligible
                ? t("Can be used as an itinerary", "可供套用為行程")
                : t(
                    "Readable; places still need confirmation",
                    "可閱讀；地點仍待確認",
                  )}
            </Chip>
          </div>
          <PublicPreview adventure={preview} />
          {missing.length > 0 && (
            <div className="k-alert error">
              <strong>{t("Before publishing", "發布前請補上")}</strong>
              <ul>
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="k-btn primary wide"
            disabled={!!missing.length}
            onClick={publish}
          >
            {t("Confirm demo publication", "確認發布示範版本")} v{version}
            <Icon name="globe" />
          </button>
          <p className="k-meta">
            {t(
              "Saved only in this browser. This does not publish to your live Kinnso account.",
              "只儲存於此瀏覽器，不會發布至正式 Kinnso 帳戶。",
            )}
          </p>
          {history.length > 0 && (
            <details className="k-story">
              <summary>{t("Earlier demo versions", "較早示範版本")}</summary>
              {history.map((p) => (
                <button
                  className="k-text-btn"
                  key={p.version}
                  onClick={() => {
                    setPublication(p);
                    setPhase("history");
                  }}
                >
                  v{p.version} · {p.updated} · {m.count(p)} {t("stops", "站")}
                </button>
              ))}
              <button
                className="k-btn danger"
                onClick={() => setPhase("withdraw")}
              >
                {t("Withdraw this demo publication", "撤回此示範公開版本")}
              </button>
            </details>
          )}
        </>
      ) : phase === "preparing" || phase === "indexing" ? (
        <div className="k-empty">
          <div className="k-spinner" />
          <h3 role="status">
            {phase === "preparing"
              ? t("Preparing selected public content…", "正在準備已選公開內容⋯")
              : t("Updating demo search…", "正在更新示範搜尋⋯")}
          </h3>
        </div>
      ) : phase === "history" ? (
        <>
          <PublicPreview adventure={publication!} />
          <button className="k-btn" onClick={() => setPhase("preview")}>
            {t("Back to preview", "返回預覽")}
          </button>
        </>
      ) : phase === "withdraw" ? (
        <>
          <h3>{t("Withdraw this publication?", "撤回這個公開版本？")}</h3>
          <p>
            {t(
              "It will stop appearing in demo search and new copies will be blocked. Files already downloaded cannot be recalled.",
              "此版本將不再出現在示範搜尋，亦不能再建立新副本。已下載的檔案無法收回。",
            )}
          </p>
          <button
            className="k-btn danger"
            onClick={() => {
              if (run(() => m.withdraw(preview.slug, m.id("withdraw")))) {
                onUpdated();
                close();
                notify(t("Demo publication withdrawn", "已撤回示範公開版本"));
              }
            }}
          >
            {t("Confirm withdrawal", "確認撤回")}
          </button>
        </>
      ) : (
        <>
          <Empty
            title={t("Your demo route is ready", "你的示範路線已備妥")}
            body={t(
              "The public snapshot is separate from your private journal.",
              "公開快照與私人記錄分開保存。",
            )}
          >
            <Link
              className="k-btn primary"
              href={href("g/" + publication!.slug)}
              onClick={close}
            >
              {t("View demo route", "查看示範路線")}
              <Icon name="arrow" />
            </Link>
          </Empty>
          <div className="k-actions">
            <button
              className="k-btn"
              onClick={() => {
                (navigator.clipboard
                  ? navigator.clipboard.writeText(
                      location.origin + href("g/" + publication!.slug),
                    )
                  : Promise.reject(new Error("Clipboard unavailable"))
                )
                  .then(() =>
                    notify(
                      t(
                        "Demo link copied; it needs this browser’s demo data.",
                        "已複製示範連結，需在此瀏覽器的示範資料中開啟。",
                      ),
                    ),
                  )
                  .catch(() =>
                    notify(
                      t(
                        "Copy is unavailable. Open the route and copy its address.",
                        "未能複製，請開啟路線並複製網址。",
                      ),
                      true,
                    ),
                  );
              }}
            >
              {t("Copy demo link", "複製示範連結")}
            </button>
            <button
              className="k-btn"
              onClick={() =>
                download(
                  "kinnso-public-adventure.json",
                  JSON.stringify(publication, null, 2),
                  "application/json",
                )
              }
            >
              {t("Download public snapshot", "下載公開快照")}
            </button>
          </div>
          <p className="k-meta">
            {t(
              "This local demo link does not transfer your browser data to another device.",
              "此本地示範連結不會將瀏覽器資料傳送至另一裝置。",
            )}
          </p>
        </>
      )}
    </div>
  );
}
