"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "../travel/ui";
import type { CatalogResult } from "../../lib/catalog";
import { canonicalRoot } from "../../lib/canonical";

export function CatalogPanel() {
  const { t, locale, href } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [city, setCity] = useState(params.get("city") ?? "");
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setQ(params.get("q") ?? "");
    setCity(params.get("city") ?? "");
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    fetch("/api/catalog?" + query, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!["ready", "error", "unconfigured"].includes(data.status))
          throw new Error("invalid");
        if (!controller.signal.aborted) setResult(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ status: "error", code: "connection_failed" });
      });
    return () => controller.abort();
  }, [query, retry]);
  function navigate(page: number) {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (city.trim()) next.set("city", city.trim());
    if (page > 1) next.set("page", String(page));
    router.push(href("library") + (next.size ? "?" + next : ""));
  }
  const sourceRoot = canonicalRoot(locale);
  return (
    <div className="k-page os-library">
      <div className="os-eyebrow">KINNSO LIBRARY</div>
      <h1>{t("Real guides. A clear source.", "真實攻略，清楚來源。")}</h1>
      <p className="os-intro">
        {t(
              "Browse published creator guides. Structured versions can become your own trip.",
              "瀏覽創作者已發布的攻略。結構化版本可套用成你的行程。",
        )}
      </p>
      <div className="os-tabs">
        <Link href={`/${locale}/demo/explore`}>
          {t("Sample itineraries", "示範行程")}
        </Link>
        <span aria-current="page">{t("Published guides", "已發布攻略")}</span>
      </div>
      <form
        className="os-search"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(1);
        }}
      >
        <label>
          {t("Destination or interest", "目的地或興趣")}
          <input
            name="q"
            value={q}
            maxLength={120}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(
              "Kyoto, coffee, a quieter weekend…",
              "京都、咖啡、慢活週末…",
            )}
          />
        </label>
        <label>
          {t("City (exact name)", "城市（完整名稱）")}
          <input
            name="city"
            value={city}
            maxLength={80}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Kyoto"
          />
        </label>
        <button className="k-btn primary">{t("Find guides", "找攻略")}</button>
      </form>
      {!result ? (
        <p role="status" className="os-state">
          {t("Loading published guides…", "正在載入已發布攻略…")}
        </p>
      ) : result.status === "unconfigured" ? (
        <div className="os-state">
          <h2>
            {t("Published content is not connected yet.", "正式內容尚未接通。")}
          </h2>
          <p>
            {t(
              "Your sample itineraries still work. You can browse the existing library while this connection is prepared.",
              "你仍可使用示範行程，亦可先到現有網站瀏覽已發布攻略。",
            )}
          </p>
          <a
            className="k-btn primary"
            href={
              sourceRoot + "/explore"
            }
          >
            {t("Open existing Kinnso ↗", "前往現有 Kinnso ↗")}
          </a>
          <Link className="k-btn" href={`/${locale}/demo/explore`}>
            {t("Explore sample routes", "探索示範路線")}
          </Link>
        </div>
      ) : result.status === "error" ? (
        <div className="os-state" role="alert">
          <h2>{t("We could not load these guides.", "暫時未能載入攻略。")}</h2>
          <p>
            {t(
              "This is a connection problem, not an empty library. Your search is kept.",
              "這是連線問題，並不代表沒有內容。你的搜尋條件已保留。",
            )}
          </p>
          <button className="k-btn" onClick={() => setRetry((n) => n + 1)}>
            {t("Try again", "重試")}
          </button>
        </div>
      ) : (
        <>
          <p role="status">
            {t("Page", "第")} {result.query.page} · {result.items.length}{" "}
            {t("guides on this page", "篇攻略")}
          </p>
          {result.items.length ? (
            <div className="os-guide-grid">
              {result.items.map((item) => (
                <article className="os-guide" key={item.id}>
                  <div className="os-guide-image">
                    {item.cover ? (
                      <Image
                        src={item.cover}
                        alt=""
                        fill
                        sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="os-image-fallback">{item.city}</div>
                    )}
                  </div>
                  <div className="os-guide-body">
                    <span className="os-eyebrow">{item.city}</span>
                    <h2>
                      <a
                        href={
                          href('g/'+encodeURIComponent(item.id))
                        }
                      >
                        {item.title}
                      </a>
                    </h2>
                    <p>{item.summary}</p>
                    <span>
                      {item.creator ||
                        item.creatorHandle ||
                        t("Kinnso creator", "Kinnso 創作者")}
                    </span>
                    <small>
                      {t(
                        "Open to check the published format and source",
                        "開啟以核對已發布格式及來源",
                      )}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="os-state">
              <h2>
                {t("No guides match this search.", "暫未找到符合條件的攻略。")}
              </h2>
              <Link className="k-btn" href={href("library")}>
                {t("Clear filters", "清除篩選")}
              </Link>
            </div>
          )}
          <nav
            className="os-pagination"
            aria-label={t("Guide pages", "攻略分頁")}
          >
            <button
              className="k-btn"
              disabled={result.query.page === 1}
              onClick={() => navigate(result.query.page - 1)}
            >
              {t("Previous", "上一頁")}
            </button>
            <button
              className="k-btn"
              disabled={!result.hasMore}
              onClick={() => navigate(result.query.page + 1)}
            >
              {t("Next", "下一頁")}
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
