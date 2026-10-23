# PD15 A0：PR89 review 及同候選驗證 — 2026-10-23

本增量接續 PR89 已驗基線 ce6f7d3886e1d4b470f31cb295251a599978cc71；保留原 stacked base PR88 @2adc2550d11e421c06fa29c5b3e613a9a23e462b。最終 head、tree、PR test-merge parents、CI、source ZIP 及完整測試結果，由本輪具 SHA-256 的 delivery receipt 綁定。ce6 的歷史成功不能當新 candidate 結果。

## 角色可觀察成果

- Creator：從裝置恢復的未送出交付草稿，亦須等待一次性 milestone 的較早 submission 載完。不能以 form submit 繞過準備按鈕。草稿／proof 保留；明確選取舊 revision 後使用原 submissionId／expectedUpdatedAt。repeatable、完整空頁首次交付、已選 revision 仍可操作。
- Creator：真正 pending／unknown command 保持同一 payload／requestId；失敗 fresh read 不解鎖，不以較新未送出草稿取代既有寫入意圖。沒有更改 send／recovery／CAS 合同。
- Customer／Ops：沿用既有 k-form，讓新 case、回覆、Ops 決定、恢復文字及失敗通知表格在窄螢幕／雙倍文字時正常換行；沒有改 case 權限、草稿、owner、審批或內部訊息邊界。
- 公開讀者：footer／prose 次要文字改用既有較深綠色；Credits 標題可換行；logo 行高1.2令雙倍文字的93px字形不再超出81.6px line box及頂部viewport；底部導覽使用實色白底，對比不受下方捲動內容影響。Skip to content 目標 main 加上 tabIndex=-1，讓 Enter 真正移動焦點，維持一般 Tab 順序；兩個實際 focused-main 斷言先 FAIL。D01 現行 notice 及支援／私隱文案沒有改動。

## Review、原始 FAIL 與修正

獨立 source review 發現 recovered form 的 P2：submissionId=null 草稿可繞過 PD09 分頁保護，造成無效新 command／revision_conflict，並非已證明重複 DB row。先取得4個真斷言 FAIL，再修正；12個新增 component tests 覆蓋雙語、缺頁／已有證明、repeatable／首次／revision 及 immutable pending 重試。新增2個真 Chromium requestSubmit／分頁／明確 revision 選取案例。

PD15 matrix 找到 Support／Ops 真實 reflow FAIL（320px／雙倍文字下 scrollWidth 395／341），以及公開細字3.57:1低於4.5:1、Credits 標題溢出。保留原始失敗；只修實際樣式，沒有新增測試 CSS 去遮蓋溢出。

獨立 review 另發現驗證器兩項 P2：永久 outline 可被誤當焦點提示；被 overflow:hidden 裁切的 input 缺少超界斷言。兩個原生 browser 負面控制先取得2FAIL；helper 現要求 outline／shadow／border 有實際 focus 差異，並斷言表格 boxes 及文字均不超界。負面控制納入日後 CI。

axe 的 incomplete 一律保留，不當 PASS。畫面／element stack 先識別 Next dev indicator 遮擋，按 installed devIndicators 文件，只在既有 KINNSO_SYNTHETIC_RUN=true 的 owned fixture 關閉開發工具列，compile／runtime errors 仍可見。移除工具列後仍有半透明導覽對比不確定項，另以明確 color-contrast incomplete 斷言取得真 FAIL，再把該底色改為實色；不排除任何 axe 規則。

## 同候選整合與 source

本機完整 unit/component 為1004 PASS、0FAIL／SKIP；其餘最終結果見 receipt，不預填尚未執行的 CI。既有 root 與 Journeys push／PR workflow 全數保留；owned ephemeral Supabase 的 ownership／loopback／container label／schema／actor gates 不變。本輪沒有新 SQL 或 shared target 動作。

新 optional axe-core4.12.1 auditor 有獨立 package-lock，安裝使用 --ignore-scripts，不加入產品 dependency 或 performance lock。兩個 Playwright config 現保存 JSON reporter 的逐項附件；workspace artifact 在成功及失敗時均上傳。原 timeout、retries、worker、數字門檻及既有測試不縮減。

來源 manifest 使用 canonical staged Git blob SHA-256、自身排除以免遞迴；新增6個 app source／test／tool files 加入既有 Journeys 對應 source manifest。歷史 manifests 及18N／53列 traceability 保留原 hash；舊的「final receipt」須按各自 source／head 解讀。

## 可達性方法與限制

- U24：EN／zh-HK ×320／640／1280 ×7種真 React component，使用實際 globals／workbench／integration CSS；另6項 loading status／error alert／Tab 到 Retry／Enter 恢復。transport／storage／router 為 owned fixture，禁止 command，沒有 Auth／DB。
- U25：EN／zh-HK ×320／640／1280 ×6個真 Next 公開路徑，backend 全部關閉；包含頁面語言／title、keyboard focus、WCAG2 A／AA、2.1 A／AA、2.2 AA 自動掃描、雙倍文字 reflow 及0 API writes。既有90個 direct／client navigation／reload／Back／404／native/private routing 案例保留。
- 42個 component 與36個公開頁面各測正常及雙倍文字，另6個錯誤狀態；共84個產品矩陣案例，加2個驗證器負面控制。guide 靜態閱讀 component 無互動項，keyboard scope 記 NOT_APPLICABLE；真 Next shell 另有鍵盤測試。
- 雙倍文字是各 DOM element 原 computed font size ×2 的真 Chromium rendering probe，**不是** browser 自身文字縮放設定、physical device、Safari／WebKit、NVDA 或 VoiceOver 驗收。收益分類的既有 aria-label 容器補上 role=group，先以實際具名 group 斷言取得 FAIL。所有 axe incomplete 現亦阻止自動驗證通過，原始檢查資料及畫面先保存。沒有宣稱 full WCAG conformance。
- 鍵盤焦點、text resize、每次 axe violations／incomplete／passing rule IDs／engine version 均保存；不確定項另保存渲染資料及 viewport screenshot。JSON reporter body 以 base64 保存，receipt 另列實際 scope 及數量。

## 性能口徑

沿用既有 operations runner，在新候選 owned Ubuntu CI 執行完整48 navigation／8 interactions／24 equivalent reads及獨立18 first-usable slots；cold／warm、實際 anonymous／Creator／Merchant owner、390×844／DPR1／4xCPU／150ms／1600／750條件不變。16組LCP median≤2500ms及CLS≤0.1仍是原數字 gate。45秒 load、60秒單次 collection deadline、45分鐘 job 不增加；失敗樣本不補填，無最快樣本挑選。

receipt 從完整 artifact 列各角色／cache 的 LCP／CLS、JavaScript transfer bytes，以及6組 first-usable medians。這是同候選 cold/warm 比較；不是跨版本或 field 改善證明。Synthetic guide 無真 cover，image bytes=0 不代表真圖片性能。

960個 warm-read／72 warmups 保留 API／PostgREST／PostgreSQL 分層和 transactionMode。budget 仍為 null／MEASURED_BUDGET_NOT_SET；不得把收集成功寫成 latency gate PASS、cloud p95 或已承諾 SLO。

本輪沒有聲稱性能優化。歷史不同 runner 的 ce6／foundation 結果不作受控 before/after；未跑的 frozen A1→B1→B2→A2 比較保持 NOT_RUN。既有 compareOperationsBatch、6A／6B每組、50ms／5% non-regression 邊界保留；需要改善聲明或完整原始比較驗收時，仍須完整新 frozen batch，不能用本輪同候選或歷史數據替代。

## 四欄及保留的依賴

| code_status | test_status | deployment_status | runtime_status |
|---|---|---|---|
| PR89 review fixes／PD15 source及matrix；最終head見receipt | local及exact-candidate CI分開，以receipt記實際PASS／FAIL／SKIP | branch exact no-deploy guard保留；無merge／production deploy | owned fixtures／CI與原Remix hosted、physical／AT分開；PD15完整原驗收仍OPEN |

PD06 的原 HTTP403 不重試、不以CLI／UI繞過；管理員 metadata／schema／keyring／hosted gate 保持 BLOCKED。A1–A5未執行，不新增Supabase projects。真攻略同意及圖片權利維持 BLOCKED，沒有 Synthetic replacement。D06 NOT_PROMISED，RPO／RTO null；T08／N16 OPEN；PD18 NO_GO。

PD15 未解部分仍是：真攻略及指定 hosted角色／cross-device acceptance、field／real cover、實體iOS／Android與實際NVDA／VoiceOver、完整受控跨版本比較，以及原政策／管理員／恢復輸入。各項分別列 NOT_RUN／BLOCKED，不能因本輪 CI 或 axe 通過就關閉。

Rollback：以另一次最小 revert 回到已知 source，保留 records／草稿／receipts／immutable versions／keyring；回退後新 SHA 重新驗證。本輪未改原target，因此沒有 shared SQL／設定需要回退。

## 首候選 Linux CI 發現及修正

41b719cc09b85e8f9395bdf11d962c8cb3c0cba4 的 push／PR workspace-fixtures均取得真 FAIL：英文320px／雙倍文字，Operations h2 clientWidth230／scrollWidth233；各125公開案例PASS、1FAIL，native162PASS。這是Linux實際字型下的卡片截字，不是browser launch或基建問題。原job logs及官方digest核對artifact保留。只在既有.os-workspace h2補overflow-wrap:anywhere，所有斷言／字級／卡片寬度／sample／timeout不變。後續候選須重新執行完整四個workflow，41b結果不可借用。
