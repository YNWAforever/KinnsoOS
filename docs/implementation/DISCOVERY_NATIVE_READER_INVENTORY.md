# 原生 licensed 來源的 reader／writer 清單

2026-11-01。本輪以本機 source 追蹤；graph service 無法回應，改讀直接 callers／RPC／cache 設定。這是開啟前的阻擋清單，**不是原生撤權已通過的報告**。

`discovery_source_provenance` trigger 拒絕新增／修改，既有 studio `own/unknown` constraint 不放寬，五個 native capability 保持 unavailable。以下舊入口原檔保留，未接入 licensed 文字。不能移除 SQL gate 後便宣稱整合完成。

| 入口 | 現有落點／資料來源 | 必須完成的原生驗收 |
|---|---|---|
| Journeys guide 正文、SEO、metadata、JSON-LD | `lib/seo/public-guide.ts`、`guide-publication.ts`；`app/api/guides/[id]/route.ts`；匿名 guide RPC/REST | 本地逐用途 grant 重驗；標題、摘要、城市、章節及封面無撤權殘留；授權後 no-store |
| Journeys catalog | `lib/catalog.ts`、`app/api/catalog/route.ts` | listing 本文、摘要和卡片的授權 projection；失效不是空白成功 |
| 私人 trip／採用內容 | `app/api/trips/[id]/route.ts`、`lib/trips/private-heading.ts`、`location-data.ts`；`get_trip_snapshot` | trip_day、trip_stop 與 sourceDescription 綁定；撤權仍保留 travellerNote 與 own blocks |
| Agent／媒體間接讀取 trip | `lib/agent/tools.ts`、`lib/media/service.ts`、`app/api/media/[id]/route.ts`、trip reports route | 沿用同一受保護 snapshot，不能在 agent/export 繞過 |
| 採用 writer | `app/api/trips/[id]/adopt/route.ts`；`adopt_guide_to_trip` | 原交易內衍生綁定、穩定鎖序、來源 ≤60 秒核對；整次拒絕不能部分採用 |
| 分享與最小收據 | `app/api/shares/route.ts`、`shares/receipts/route.ts`、`app/share/[token]/page.tsx`；`create_trip_share_v2` 及 snapshot helpers | 原交易內 share_projection；公開讀回/撤回；舊 receipt 不回私人正文；排除意向 |
| 原 guide writer／舊版本 | `lib/studio/server.ts`、`evidence.ts`；既有 studio SQL；web `lib/guides/studio-adapter.ts`、`studio-actions.ts`、`actions.ts`、`versions.ts` | guide root_metadata 與每欄綁定；原 save/publish 交易一致；不追加另一 HTTP writer |
| Web guide、OG 圖片 | `lib/guides/queries.ts` → `app/[locale]/g/[slug]/page.tsx`、`opengraph-image.tsx` | 同一授權 projection；metadata、圖片不沿用已撤權 cache |
| Web 列表／作者／商戶關聯 | `lib/guides/queries.ts`、`lib/creators/queries.ts`、`lib/merchants/creator-search.ts`；home/explore/destinations/articles 相關讀取 | 直接 `guides` 讀取與 revalidate 快取安全；不可只改 detail 頁 |
| Web sitemap／匯出／原私人 editor | `app/sitemap.ts`（6h）、`app/[locale]/studio/guides/*`；現有 trip export | 既有目錄及私人 editor 的 title/summary/版本 projection；匯出沒有舊 licensed 正文 |

新增 `native-projection.ts` 只驗證投影邏輯，不是以上入口已掛接。`native-bridge.ts` 只提供一份限時來源核對結果，不代表跨資料庫原子撤權。上表任一項未完成，licensed ingestion 保持阻擋。

目前沒有來源事件消費器、真實 scope epoch、權利審核服務或全部讀取入口的 SQL projection。後續需在獲准隔離 DB 上把它們接入原交易，逐入口測撤權、過期、並發、舊版本與快取，再交審閱；不在此候選偷偷放寬權限。
