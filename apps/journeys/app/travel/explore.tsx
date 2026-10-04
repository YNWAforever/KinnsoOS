"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as m from "./model";
import { Chip, Empty, Icon, useApp, PublicStopBody } from "./ui";
import TripMap from "./TripMap";
export function styleLabel(s: string, l: m.Locale) {
  const a: Record<string, [string, string]> = {
    slow: ["Slow travel", "慢旅行"],
    night: ["After dark", "夜遊"],
    culture: ["Culture & walks", "文化散步"],
    family: ["Family time", "親子時光"],
  };
  return (a[s] || ["Discover", "探索"])[l === "en" ? 0 : 1];
}
function SearchForm() {
  const { t, href } = useApp(),
    router = useRouter(),
    [q, setQ] = useState(""),
    [days, setDays] = useState("");
  return (
    <form
      className="k-search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          href(
            `explore?q=${encodeURIComponent(q)}${days ? "&duration=" + days : ""}`,
          ),
        );
      }}
    >
      <div className="k-search-field">
        <Icon name="search" size={24} />
        <label>
          <span>{t("Where would you like to go?", "下一站想去哪裏？")}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={160}
            placeholder={t(
              "Try Kyoto, Hong Kong, Tokyo…",
              "搜尋京都、香港、東京⋯",
            )}
            aria-label={t("Destination or interest", "目的地或興趣")}
          />
        </label>
      </div>
      <label className="k-search-days">
        <span>{t("Trip length", "旅程長度")}</span>
        <select
          aria-label={t("Trip length", "旅程長度")}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="">{t("Any duration", "不限日數")}</option>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n} {t("days", "日")}
            </option>
          ))}
        </select>
      </label>
      <button className="k-btn primary" type="submit">
        {t("Find a route", "找路線")}
        <Icon name="arrow" />
      </button>
    </form>
  );
}
export function AdventureCard({
  a,
  selected,
  onSelect,
}: {
  a: m.Adventure;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { t, locale, href, store, auth, run } = useApp(),
    saved =
      !!store.session &&
      (store.bookmarks[store.session.id] || []).includes(a.slug),
    creator = m.creators.find((c) => c.id === a.creator);
  return (
    <article className={`k-adventure-card ${selected ? "selected" : ""}`}>
      <div className="k-card-image">
        {a.image ? (
          <Link href={href("g/" + a.slug)}>
            <img src={a.image} alt={a.city[locale]} loading="lazy" />
          </Link>
        ) : (
          <Link href={href("g/" + a.slug)} className="k-text-cover">
            <Icon name="compass" size={40} />
            <strong>{a.city[locale]}</strong>
          </Link>
        )}
        <span className="k-image-label">
          {a.days.length} {t(a.days.length === 1 ? "DAY" : "DAYS", "日")} ·{" "}
          {m.count(a)} {t("STOPS", "站")}
        </span>
        <button
          className={`k-save ${saved ? "saved" : ""}`}
          aria-label={`${saved ? t("Unsave", "取消收藏") : t("Save", "收藏")} ${a.title[locale]}`}
          aria-pressed={saved}
          onClick={() =>
            auth(() =>
              run(
                () => m.bookmark(a.slug, m.id("bookmark")),
                t("Saved routes updated", "已更新收藏"),
              ),
            )
          }
        >
          <Icon name="bookmark" size={19} />
        </button>
      </div>
      <div className="k-card-body">
        <p className="k-location">
          <Icon name="pin" size={14} />
          {a.city[locale]}
        </p>
        <Link href={href("g/" + a.slug)}>
          <h3>{a.title[locale]}</h3>
        </Link>
        <div className="k-card-bottom">
          <Link href={href("c/" + a.creator)}>
            <span className={`k-mini-avatar ${a.creator}`}>
              {creator?.initials || "J"}
            </span>
            {creator?.name || t("You", "你")}
          </Link>
          {onSelect ? (
            <button
              className="k-text-btn"
              aria-pressed={!!selected}
              onClick={onSelect}
            >
              <Icon name="map" size={16} />
              {t("Map", "地圖")}
            </button>
          ) : (
            <span className="k-card-style">{styleLabel(a.style, locale)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
export function HomePage() {
  const { t, href, store } = useApp(),
    trips = m.tripsFor(store).filter((t) => t.purpose === "personal"),
    latest = [...trips].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
  return (
    <div className="k-home">
      <div className="k-home-heading">
        <div>
          <p className="k-eyebrow">
            {t(
              "TRAVEL THROUGH PEOPLE WHO KNOW THE PLACE.",
              "透過熟悉這裏的人，認識每個地方。",
            )}
          </p>
          <h1>
            {t("Find your kind of place.", "找到屬於你的地方。")}
            <em>{t("Make the trip your own.", "走出自己的旅程。")}</em>
          </h1>
          <p>
            {t(
              "Find a route you love. Make the journey yours.",
              "找到喜歡的路線，走出自己的旅程。",
            )}
          </p>
        </div>
        <Link className="k-subtle-link" href={href("saved")}>
          <Icon name="bookmark" />
          {t("Your saved routes", "我的收藏")}
        </Link>
      </div>
      {latest && (
        <Link className="k-continue" href={href("trips/" + latest.id)}>
          <div className="k-continue-icon">
            <Icon name="trip" size={26} />
          </div>
          <div>
            <span>{t("PICK UP WHERE YOU LEFT OFF", "繼續上次的旅程")}</span>
            <h3>{latest.title}</h3>
            <p>
              {latest.date || t("Dates to decide", "未定日期")} ·{" "}
              {latest.days.length} {t("days", "日")} · {m.count(latest)}{" "}
              {t("stops", "站")}
            </p>
          </div>
          <span className="k-btn dark">
            {t("Continue trip", "繼續行程")}
            <Icon name="arrow" />
          </span>
        </Link>
      )}
      <SearchForm />
      <div className="k-quick-destinations">
        <span>{t("A good place to start", "由這裏開始")}</span>
        {[
          ["kyoto", "Kyoto", "京都"],
          ["hong-kong", "Hong Kong", "香港"],
          ["lisbon", "Lisbon", "里斯本"],
          ["tokyo", "Tokyo", "東京"],
        ].map(([slug, en, zh]) => (
          <Link href={href(`explore?destination=${slug}`)} key={slug}>
            {t(en, zh)}
            <Icon name="arrow" size={14} />
          </Link>
        ))}
      </div>
      <div className="k-section-title">
        <div>
          <h2>{t("Good routes. Great days.", "好路線，走出好時光。")}</h2>
          <p>
            {t(
              "A few ideas for your next adventure",
              "為你的下一趟旅程，找一點靈感",
            )}
          </p>
        </div>
        <Link className="k-text-btn" href={href("explore")}>
          {t("Explore all routes", "探索全部路線")}
          <Icon name="arrow" size={18} />
        </Link>
      </div>
      <div className="k-card-grid home">
        {m
          .publications(store)
          .slice(0, 4)
          .map((a) => (
            <AdventureCard key={a.id} a={a} />
          ))}
      </div>
      <section className="k-record-banner">
        <div className="k-banner-icon">
          <Icon name="camera" size={36} />
        </div>
        <div>
          <p className="k-eyebrow">KEEP THE LITTLE THINGS.</p>
          <h2>
            {t(
              "A photo. A note. A place worth remembering.",
              "一張照片、一句筆記，記住值得的地方。",
            )}
          </h2>
          <p>
            {t(
              "Start with a small moment. Put your journey together later.",
              "隨手記下一刻，再慢慢整理成旅程。",
            )}
          </p>
        </div>
        <Link className="k-btn light" href={href("record")}>
          {t("Record a moment", "記錄這一刻")}
          <Icon name="plus" />
        </Link>
      </section>
    </div>
  );
}
export function ExplorePage({ destination }: { destination?: string }) {
  const { t, locale, href, store, run } = useApp(),
    query = useSearchParams(),
    router = useRouter(),
    [q, setQ] = useState(query.get("q") || ""),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false);
  const dest = destination || query.get("destination") || "",
    duration = query.get("duration") || "",
    style = query.get("style") || "",
    party = query.get("party") || "",
    view = query.get("view") === "map" ? "map" : "list",
    page = Math.max(1, Math.min(100, Number(query.get("page")) || 1));
  const committedQuery = query.get("q") || "";
  useEffect(() => setQ(committedQuery), [committedQuery]);
  function update(values: Record<string, string>) {
    const p = new URLSearchParams(query.toString());
    Object.entries(values).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (!("page" in values)) p.set("page", "1");
    router.push(href("explore") + "?" + p.toString());
  }
  const term = (query.get("q") || "").trim().toLowerCase(),
    results = m
      .publications(store)
      .filter(
        (a) =>
          (!term ||
            [
              a.title.en,
              a.title["zh-HK"],
              a.city.en,
              a.city["zh-HK"],
              a.destination,
              styleLabel(a.style, locale),
            ]
              .join(" ")
              .toLowerCase()
              .includes(term)) &&
          (!dest || a.destination === dest) &&
          (!duration || a.days.length === Number(duration)) &&
          (!style || a.style === style) &&
          (!party || a.party.includes(party)),
      ),
    pages = Math.max(1, Math.ceil(results.length / 6)),
    safePage = Math.min(page, pages),
    items = results.slice((safePage - 1) * 6, safePage * 6),
    selected = items.find((a) => a.slug === query.get("selected")) || items[0];
  const mapStops = items
    .filter((a) => a.days[0]?.stops[0])
    .map((a) => ({ ...a.days[0].stops[0], id: a.slug, name: a.title }));
  const search = () => {
    setLoading(true);
    setError(false);
    const r = run(() => {
      m.check();
      return true;
    });
    if (!r) setError(true);
    else update({ q });
    setTimeout(() => setLoading(false), 250);
  };
  return (
    <div className="k-explore">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">FIND YOUR KIND OF JOURNEY</p>
          <h1>{t("Explore routes", "探索路線")}</h1>
        </div>
        <div className="k-segment">
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => update({ view: "list" })}
          >
            <Icon name="note" />
            {t("List", "列表")}
          </button>
          <button
            className={view === "map" ? "active" : ""}
            onClick={() => update({ view: "map" })}
          >
            <Icon name="map" />
            {t("Map", "地圖")}
          </button>
        </div>
      </div>
      <form
        className="k-filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label className="k-query">
          <Icon name="search" />
          <input
            aria-label={t("Search destinations", "搜尋目的地")}
            value={q}
            maxLength={160}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Destination or interest", "目的地或興趣")}
          />
          <button type="submit" aria-label={t("Search", "搜尋")}>
            <Icon name="arrow" size={18} />
          </button>
        </label>
        <select
          aria-label={t("Destination", "目的地")}
          value={dest}
          onChange={(e) => update({ destination: e.target.value })}
        >
          <option value="">{t("All destinations", "全部目的地")}</option>
          {[
            ["kyoto", "Kyoto", "京都"],
            ["hong-kong", "Hong Kong", "香港"],
            ["lisbon", "Lisbon", "里斯本"],
            ["tokyo", "Tokyo", "東京"],
            ["seoul", "Seoul", "首爾"],
            ["singapore", "Singapore", "新加坡"],
          ].map(([v, en, zh]) => (
            <option value={v} key={v}>
              {t(en, zh)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Duration", "日數")}
          value={duration}
          onChange={(e) => update({ duration: e.target.value })}
        >
          <option value="">{t("Any duration", "不限日數")}</option>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n} {t("days", "日")}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Travel style", "旅行風格")}
          value={style}
          onChange={(e) => update({ style: e.target.value })}
        >
          <option value="">{t("Any style", "不限風格")}</option>
          {["slow", "culture", "night", "family"].map((s) => (
            <option value={s} key={s}>
              {styleLabel(s, locale)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Travel party", "同行者")}
          value={party}
          onChange={(e) => update({ party: e.target.value })}
        >
          <option value="">{t("Any company", "不限同行者")}</option>
          <option value="solo">{t("Solo", "獨遊")}</option>
          <option value="couple">{t("Two people", "二人同行")}</option>
          <option value="family">{t("Family", "家庭")}</option>
        </select>
      </form>
      <nav className="k-explore-subnav">
        {[
          ["explore", "Routes", "路線"],
          ["destinations", "Destinations", "目的地"],
          ["experiences", "Experiences", "體驗"],
          ["tickets", "Tickets", "票券"],
          ["creators", "Creators", "創作者"],
          ["articles", "Travel reads", "旅行閱讀"],
          ["sessions", "Sessions", "活動"],
          ["merchants", "Merchants", "商戶"],
        ].map(([p, en, zh]) => (
          <Link href={href(p)} key={p}>
            {t(en, zh)}
          </Link>
        ))}
      </nav>
      {loading ? (
        <div className="k-loading" role="status">
          {t("Finding routes…", "正在尋找路線⋯")}
        </div>
      ) : error ? (
        <Empty
          title={t("Search could not be completed", "暫時未能完成搜尋")}
          body={t("Your filters are kept.", "搜尋條件已保留。")}
        >
          <button className="k-btn primary" onClick={search}>
            {t("Retry search", "重試搜尋")}
          </button>
        </Empty>
      ) : !results.length ? (
        <Empty
          title={t("No routes match yet", "暫時沒有符合的路線")}
          body={t(
            "Try another destination or remove the filters.",
            "試試其他目的地，或移除搜尋條件。",
          )}
        >
          <button
            className="k-btn"
            onClick={() => {
              setQ("");
              router.push(href("explore"));
            }}
          >
            {t("Clear all filters", "清除全部條件")}
          </button>
        </Empty>
      ) : (
        <>
          <p className="k-result-count">
            {results.length} {t("demo routes", "條示範路線")}
          </p>
          <div className={`k-explore-grid ${view === "map" ? "map-view" : ""}`}>
            <div className="k-explore-results">
              <div className="k-card-grid explore">
                {items.map((a) => (
                  <AdventureCard
                    key={a.id}
                    a={a}
                    selected={a.slug === selected?.slug}
                    onSelect={() =>
                      update({
                        selected: a.slug,
                        view: "map",
                        page: String(safePage),
                      })
                    }
                  />
                ))}
              </div>
              <div className="k-pagination">
                <button
                  className="k-btn"
                  disabled={safePage === 1}
                  onClick={() => update({ page: String(safePage - 1) })}
                >
                  {t("Previous", "上一頁")}
                </button>
                <span>
                  {safePage} / {pages}
                </span>
                <button
                  className="k-btn"
                  disabled={safePage === pages}
                  onClick={() => update({ page: String(safePage + 1) })}
                >
                  {t("Next", "下一頁")}
                </button>
              </div>
            </div>
            <aside className="k-explore-map">
              <TripMap
                stops={mapStops}
                locale={locale}
                selected={selected?.slug}
                onSelect={(slug) =>
                  update({ selected: slug, page: String(safePage) })
                }
              />
              {selected && (
                <Link
                  className="k-map-selected"
                  href={href("g/" + selected.slug)}
                >
                  <div>
                    <strong>{selected.title[locale]}</strong>
                    <p>
                      {selected.city[locale]} · {m.count(selected)}{" "}
                      {t("stops", "站")}
                    </p>
                  </div>
                  <Icon name="arrow" />
                </Link>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
export function AdventurePage({ slug }: { slug: string }) {
  const { t, locale, store, href, open, auth, run } = useApp(),
    [day, setDay] = useState(0),
    [selected, setSelected] = useState(""),
    [view, setView] = useState("list"),
    a = m.findPublic(store, slug);
  if (!a)
    return (
      <Empty
        title={t("This route is unavailable", "此路線目前無法開啟")}
        body={t(
          "It may have been withdrawn. Your own trips remain in My trips.",
          "此路線可能已撤回。你的個人行程仍可在「我的行程」開啟。",
        )}
      >
        <Link className="k-btn" href={href("explore")}>
          {t("Explore routes", "探索路線")}
        </Link>
      </Empty>
    );
  const d = a.days[Math.min(day, a.days.length - 1)],
    saved =
      store.session && (store.bookmarks[store.session.id] || []).includes(slug),
    creator = m.creators.find((c) => c.id === a.creator);
  return (
    <div className="k-detail">
      <Link className="k-back" href={href("explore")}>
        ← {t("Explore routes", "探索路線")}
      </Link>
      <div className="k-detail-heading">
        <div>
          <p className="k-eyebrow">
            {a.city[locale]} · {styleLabel(a.style, locale)}
          </p>
          <h1>{a.title[locale]}</h1>
          <div className="k-detail-facts">
            <Link href={href("c/" + a.creator)}>
              <span className="k-mini-avatar">{creator?.initials || "J"}</span>
              {creator?.name || t("You", "你")}
            </Link>
            <span>
              <Icon name="calendar" size={17} />
              {a.days.length} {t("days", "日")}
            </span>
            <span>
              <Icon name="pin" size={17} />
              {m.count(a)} {t("stops", "站")}
            </span>
            <span>
              v{a.version} · {a.updated}
            </span>
          </div>
          <div className="k-actions">
            <button
              className="k-btn primary"
              disabled={!a.cloneEligible}
              onClick={() =>
                auth(() =>
                  open(
                    t("Make this trip yours", "將這趟旅程變成你的"),
                    <CloneForm a={a} />,
                  ),
                )
              }
            >
              {t("Use this itinerary", "套用此行程")}
              <Icon name="arrow" />
            </button>
            <button
              className="k-btn"
              onClick={() =>
                auth(() => run(() => m.bookmark(slug, m.id("bookmark"))))
              }
            >
              <Icon name="bookmark" />
              {saved ? t("Saved", "已收藏") : t("Save adventure", "收藏路線")}
            </button>
          </div>
          {!a.cloneEligible && (
            <p className="k-muted">
              {t(
                "Some stops need confirmation before this route can be copied. You can still save it.",
                "部分站點仍待確認，暫未能套用，你仍可收藏路線。",
              )}
            </p>
          )}
        </div>
        {a.image && (
          <img className="k-detail-cover" src={a.image} alt={a.city[locale]} />
        )}
      </div>
      <div className="k-detail-toolbar">
        <div className="k-day-tabs">
          {a.days.map((d, i) => (
            <button
              key={d.id}
              className={day === i ? "active" : ""}
              onClick={() => {
                setDay(i);
                setSelected("");
              }}
            >
              {t("Day", "第")} {i + 1}
              {locale === "zh-HK" ? " 日" : ""}
              <span>
                {d.stops.length} {t("stops", "站")}
              </span>
            </button>
          ))}
        </div>
        <div className="k-segment">
          <button
            onClick={() => setView("list")}
            className={view === "list" ? "active" : ""}
          >
            {t("Itinerary", "行程")}
          </button>
          <button
            onClick={() => setView("map")}
            className={view === "map" ? "active" : ""}
          >
            {t("Map", "地圖")}
          </button>
        </div>
      </div>
      <div className={`k-route-layout ${view === "map" ? "show-map" : ""}`}>
        <div className="k-stops">
          <h2>{d?.name[locale]}</h2>
          {d?.stops.map((s, i) => (
            <article
              className={`k-stop ${selected === s.id ? "selected" : ""}`}
              key={s.id}
            >
              <button
                className="k-stop-number"
                aria-label={`${t("Select", "選取")} ${s.name[locale]}`}
                onClick={() => setSelected(s.id)}
              >
                {i + 1}
              </button>
              <div className="k-stop-content">
                <PublicStopBody stop={s} />
                <div className="k-stop-links">
                  {s.lat !== null ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="pin" size={16} />
                      {t("Open map", "查看地圖")}
                    </a>
                  ) : (
                    <span>{t("Location to confirm", "位置待確認")}</span>
                  )}
                  <button
                    onClick={() =>
                      auth(() =>
                        open(
                          t("Add this stop", "加入這一站"),
                          <AddStopForm a={a} stopId={s.id} />,
                        ),
                      )
                    }
                  >
                    <Icon name="plus" size={16} />
                    {t("Add to my trip", "加入我的行程")}
                  </button>
                </div>
                {s.id === "h-2" && (
                  <details className="k-offer">
                    <summary>
                      {t(
                        "A tea break nearby · sample offer",
                        "附近飲杯茶・示範優惠",
                      )}
                    </summary>
                    <p>
                      {t(
                        "Optional tea break from the fictional Harbour Studio. Review qualifying spend, validity and disclosure before claiming.",
                        "由虛構商戶 Harbour Studio 提供的自選茶歇。領取前，請審閱合資格消費、有效期及商業披露。",
                      )}
                    </p>
                    <Link href={href("offers/demo-offer-hk")}>
                      {t("View offer and terms", "查看優惠及條款")} →
                    </Link>
                  </details>
                )}
              </div>
            </article>
          ))}
          <details className="k-story">
            <summary>
              {t("About this route & sources", "路線說明及資料來源")}
            </summary>
            <p>
              {t(
                "An illustrative itinerary using real places, not verified firsthand travel. Coordinates are approximate; opening hours, prices, accessibility and transport are not verified.",
                "使用真實地點的示範行程，並非已核實親訪紀錄。座標只供位置參考；開放時間、價格、無障礙安排及交通尚未核實。",
              )}
            </p>
            <a
              href="https://www.openstreetmap.org"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap ↗
            </a>
          </details>
        </div>
        <aside className="k-route-map">
          <TripMap
            stops={d?.stops || []}
            locale={locale}
            selected={selected}
            onSelect={setSelected}
          />
          <p className="k-meta">
            {t(
              "Select a number to match it to the itinerary.",
              "選取數字，即可對照行程站點。",
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
export function CloneForm({ a }: { a: m.Adventure }) {
  const { t, locale, href, close, run } = useApp(),
    router = useRouter(),
    [title, setTitle] = useState(a.title[locale]),
    [date, setDate] = useState(""),
    [pending, setPending] = useState(false),
    key = useRef(m.id("clone"));
  return (
    <form
      className="k-modal-body k-form"
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setTimeout(() => {
          const trip = run(() => m.clone(a.slug, title, date, key.current));
          setPending(false);
          if (trip) {
            close();
            router.push(href("trips/" + trip.id));
          }
        }, 200);
      }}
    >
      <p>
        {t(
          "Your own editable copy. Creator credit stays with each stop.",
          "建立你的獨立可編輯副本，每一站保留原作者來源。",
        )}
      </p>
      <label>
        {t("Trip name", "行程名稱")}
        <input
          value={title}
          maxLength={120}
          required
          onChange={(e) => {
            setTitle(e.target.value);
            key.current = m.id("clone");
          }}
        />
      </label>
      <label>
        {t("Departure date (optional)", "出發日期（可稍後決定）")}
        <input
          type="date"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
          onBlur={(e) => setDate(e.currentTarget.value)}
          onChange={(e) => {
            setDate(e.target.value);
            key.current = m.id("clone");
          }}
        />
      </label>
      <button className="k-btn primary wide" type="submit" disabled={pending}>
        {pending
          ? t("Creating your trip…", "正在建立行程⋯")
          : t("Create demo trip", "建立示範行程")}
        <Icon name="arrow" />
      </button>
    </form>
  );
}
function AddStopForm({ a, stopId }: { a: m.Adventure; stopId: string }) {
  const { t, locale, store, run, close, href } = useApp(),
    router = useRouter(),
    trips = m
      .tripsFor(store)
      .filter((t) => m.permission(store.session, t).edit),
    [tripId, setTripId] = useState(trips[0]?.id || ""),
    trip = trips.find((t) => t.id === tripId),
    [dayId, setDayId] = useState(trip?.days[0].id || ""),
    created = useRef<m.Trip | null>(null),
    key = useRef(m.id("add-stop"));
  return (
    <form
      className="k-modal-body k-form"
      onSubmit={(e) => {
        e.preventDefault();
        let target = trip || created.current;
        if (!target) {
          target =
            run(() =>
              m.create(
                t("My new trip", "我的新旅程"),
                "personal",
                "",
                m.id("new-trip"),
              ),
            ) || null;
          created.current = target;
        }
        if (!target) return;
        const result = run(() =>
          m.addStop(
            a.slug,
            stopId,
            target!.id,
            trip ? dayId : target!.days[0].id,
            target!.revision,
            key.current,
          ),
        );
        if (result) {
          close();
          router.push(href("trips/" + result.id));
        }
      }}
    >
      <label>
        {t("Choose a trip", "選擇行程")}
        <select
          value={tripId}
          onChange={(e) => {
            setTripId(e.target.value);
            setDayId(
              trips.find((t) => t.id === e.target.value)?.days[0].id || "",
            );
            key.current = m.id("add-stop");
          }}
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
          <option value="">{t("Create a new trip", "建立新行程")}</option>
        </select>
      </label>
      {trip && (
        <label>
          {t("Choose a day", "選擇日次")}
          <select
            value={dayId}
            onChange={(e) => {
              setDayId(e.target.value);
              key.current = m.id("add-stop");
            }}
          >
            {trip.days.map((d, i) => (
              <option key={d.id} value={d.id}>
                {i + 1} · {d.name[locale]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="k-btn primary" type="submit">
        {t("Add stop to demo trip", "加入示範行程")}
        <Icon name="plus" />
      </button>
    </form>
  );
}
export function NewTripForm() {
  const { t, run, href, close } = useApp(),
    router = useRouter(),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(""),
    key = useRef(m.id("new"));
  return (
    <form
      className="k-modal-body k-form"
      onSubmit={(e) => {
        e.preventDefault();
        const result = run(() =>
          m.create(
            title || t("My new trip", "我的新旅程"),
            "personal",
            date,
            key.current,
          ),
        );
        if (result) {
          close();
          router.push(href("trips/" + result.id));
        }
      }}
    >
      <label>
        {t("Trip name (optional)", "行程名稱（可稍後填寫）")}
        <input
          value={title}
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value);
            key.current = m.id("new");
          }}
        />
      </label>
      <label>
        {t("Departure date (optional)", "出發日期（可稍後決定）")}
        <input
          type="date"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
          onBlur={(e) => setDate(e.currentTarget.value)}
          onChange={(e) => {
            setDate(e.target.value);
            key.current = m.id("new");
          }}
        />
      </label>
      <button className="k-btn primary" type="submit">
        {t("Create demo trip", "建立示範行程")}
      </button>
    </form>
  );
}
export function TripsPage({
  saved = false,
  planner = false,
}: {
  saved?: boolean;
  planner?: boolean;
}) {
  const { t, href, store, auth, open, ready } = useApp(),
    [tab, setTab] = useState(saved ? "saved" : "planning"),
    trips = m.tripsFor(store).filter((t) => t.purpose === "personal"),
    bookmarks = store.session ? store.bookmarks[store.session.id] || [] : [],
    rows = trips.filter((t) =>
      tab === "planning"
        ? !t.date
        : tab === "upcoming"
          ? !!t.date &&
            Date.parse(t.date) + t.days.length * 86400000 >= Date.now()
          : tab === "past"
            ? !!t.date &&
              Date.parse(t.date) + t.days.length * 86400000 < Date.now()
            : true,
    );
  return (
    <div className="k-page">
      <div className="k-page-heading">
        <div>
          <p className="k-eyebrow">YOUR PLACES. YOUR PACE.</p>
          <h1>
            {planner
              ? t("Plan your next trip", "規劃下一趟旅程")
              : t("My trips", "我的行程")}
          </h1>
        </div>
        <button
          className="k-btn primary"
          onClick={() =>
            auth(() => open(t("Create a trip", "建立行程"), <NewTripForm />))
          }
        >
          <Icon name="plus" />
          {t("New trip", "建立行程")}
        </button>
      </div>
      {planner && (
        <p className="k-muted">
          {t(
            "Open a trip to see suggestions with a before-and-after comparison.",
            "開啟行程，即可取得建議並審閱修改前後的差異。",
          )}
        </p>
      )}
      <div className="k-tabs">
        {[
          ["planning", "Planning", "規劃中"],
          ["upcoming", "Upcoming", "即將出發"],
          ["past", "Past", "已完成"],
          ["saved", "Saved routes", "收藏路線"],
        ].map(([v, en, zh]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={tab === v ? "active" : ""}
          >
            {t(en, zh)}
          </button>
        ))}
        <Link href={href("bookings")}>
          {t("Bookings", "我的預訂")}
          <Icon name="chevron" size={16} />
        </Link>
      </div>
      {!ready ? (
        <p role="status">{t("Loading your trips…", "正在載入行程⋯")}</p>
      ) : !store.session ? (
        <Empty
          title={t("Your next trip starts here", "你的下一趟旅程，由這裏開始")}
          body={t(
            "Save a route or create a trip, then make it your own.",
            "收藏路線或建立行程，再按你的步調修改。",
          )}
        >
          <button className="k-btn primary" onClick={() => auth()}>
            {t("Enter demo account", "進入示範帳戶")}
          </button>
        </Empty>
      ) : tab === "saved" ? (
        <>
          {bookmarks.length ? (
            <div className="k-card-grid">
              {m
                .publications(store)
                .filter((a) => bookmarks.includes(a.slug))
                .map((a) => (
                  <AdventureCard key={a.id} a={a} />
                ))}
            </div>
          ) : (
            <Empty
              title={t("A place for your favourites", "把喜歡的路線留在這裏")}
            >
              <Link className="k-btn" href={href("explore")}>
                {t("Find a route", "尋找路線")}
              </Link>
            </Empty>
          )}
        </>
      ) : rows.length ? (
        <div className="k-trip-grid">
          {rows.map((trip) => (
            <Link
              className="k-trip-card"
              href={href("trips/" + trip.id)}
              key={trip.id}
            >
              <div className="k-trip-card-top">
                <Icon name="trip" size={26} />
                <Chip>
                  <Icon name="lock" size={12} />
                  {t("Private", "私人")}
                </Chip>
              </div>
              <h2>{trip.title}</h2>
              <p>{trip.date || t("Dates to decide", "未定日期")}</p>
              <div className="k-trip-card-footer">
                <span>
                  {trip.days.length} {t("days", "日")} · {m.count(trip)}{" "}
                  {t("stops", "站")}
                </span>
                <Icon name="arrow" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title={t("Room for your next adventure", "為下一趟旅程，留一點空間")}
          body={t(
            "Start from a route, or build a blank itinerary.",
            "從喜歡的路線開始，或建立空白行程。",
          )}
        >
          <Link className="k-btn primary" href={href("explore")}>
            {t("Explore routes", "探索路線")}
          </Link>
          <button
            className="k-btn"
            onClick={() =>
              open(t("Create a trip", "建立行程"), <NewTripForm />)
            }
          >
            {t("Start a blank trip", "建立空白行程")}
          </button>
        </Empty>
      )}
    </div>
  );
}
