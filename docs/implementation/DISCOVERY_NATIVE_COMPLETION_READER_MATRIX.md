# 原生來源讀寫接線矩陣

2026-11-01，延續 `DISCOVERY_NATIVE_READER_INVENTORY.md` 的歷史清單。以下是**未套用 SQL 候選**的程式落點，全部 DB/runtime 欄仍為 NOT_RUN；不能因有程式或靜態測試便開啟 licensed ingestion。

| 入口 | 候選保護 | 授權／原交易 |
|---|---|---|
| Journeys guide RPC／SEO／JSON-LD | `public.kinnso_guide` wrapper + `discovery_guide_visible` + version bindings；原匿名 fetch 已 no-store | public_guide；root title、summary、city 及所有來源欄位不能脫離 provenance |
| Web guide／listing／作者／搜尋／目錄 | guides／guide_versions restrictive SELECT policies；公開 Supabase transport no-store | public_guide；direct REST 無繞過 |
| Definer 聚合／歸因／作者內部讀取 | 七函式 continuation 中的 creator_insights、merchant_insights、admin_creator_detail、get_attributed_guides_for_merchant、kinnso_guide_authoring 加入受保護子查詢 | 沿用原角色及回傳形狀；原函式 hash 列於 migration |
| Web guide OG／sitemap | OG force-dynamic + Cache-Control no-store；sitemap revalidate=0；共享 public client 逐次重讀 | 舊授權文字不進新的持久回應快取；hosted CDN 尚待驗收 |
| Studio source／message／brief／handoff／draft | `studio_source_snapshot`、`studio_refs_current`、`assert_studio_refs`；ingest permit 與 immutable licensed source trigger | private_brief／public_guide 分開；來源不可改為 own；grant ID／版本釘在 match 與來源上 |
| 原 guide save／publish | 原 server client 的預設關閉 transport → reference refresh → bound RPC → 既有 handoff／permit writer；新增 `guide_versions` INSERT trigger | 原參數與 UUID 綁定觀察；一個原交易驗證並建立 lineage，任何 grant 失敗應回滾整次寫入。穩定 block marker 留在私有 map，原內容 schema 不變 |
| 原 adopt | 保留 guide/version/trip 舊 lock order 與 NOWAIT；新 day／stop 來源 ID；原 INSERT triggers，重驗來源後由同交易呼叫 | trip_adoption；只傳遞該 upstream stop 的綁定，自有站點不繼承其他 stop 的授權。原 adoption request replay 也經 projection |
| 私人 trip／Agent／媒體／匯出 | 中央 `kinnso_internal.snapshot` projection；原 apply command replay projection；direct raw row restrictive SELECT | trip_adoption；僅隱藏來源 title／day title／sourceDescription，travellerNote 保留 |
| 原 share／舊公開分享與收據 | trip_shares INSERT trigger；`get_shared_trip`、`kinnso_share_api.receipt` projection | trip_share；同來源在多個 day／stop 用不同 projection_slot，不能被 unique key 合併掉；原分享撤回保留 |
| Discovery public／company／match reads | owner scope、用途與 source-current 檢查；match 儲存參照。配對只向 SME 重驗 refs，再從經簽署核對的本地 immutable import 讀文字 | 沒有把私人 trip intent 送到商戶／SME；公司讀取依 DB owner；不使用 evidence:read 代替引用重驗 |

上述以 `100600`／`100700` 的最終函式定義為準，覆蓋 `100200` 較早的整份 guide 綁定。內部 marker 不可被任意刪除；根標題／摘要仍採保守的整份 guide 來源關聯。源自 C1 的日標題原先為空，後加的自有日標題不承接無關 stop 的來源。

仍需獲准後執行：各角色／跨租戶直接 SQL 與 REST、原 writer 同 UUID 並發、撤權與採用／分享交錯、完整 rollback、舊 receipt、時鐘邊界、缺少 gate／key／rights row、過期來源、metadata/OG 快取，以及自有內容與私人筆記未受影響。現有五個 DB harness 項目預設 SKIP，尚未覆蓋上述全部原生案例。

單次來源觀察最長有效 60 秒，不表示跨系統原子撤權。真實 SME membership/epoch/issuer、事件失效及權利核准服務仍是啟用前依賴。
