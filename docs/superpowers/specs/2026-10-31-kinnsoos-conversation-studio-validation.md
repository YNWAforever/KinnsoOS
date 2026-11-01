# 對話式工作室：研究與原型驗證紀錄

日期：2026-10-31，Asia/Hong_Kong。所有時間如下以 HKT 表示；JSON 同時保留 UTC。

## 範圍及平台

- 倉庫基線：`b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`。開始時乾淨；完成後只有新增 docs 文件與原型，原有 tracked files 無 diff。
- 研究：Chrome DevTools 獨立未登入 context，公開網頁 DOM 與本機 MCP graph/source；沒有登入正式帳號、讀取憑證、提交訊息或執行 provider。
- 原型：Windows／Chrome `156.0.0.0`，本機 `file:` HTML。JavaScript 固定示例及記憶體狀態；實際 DOM 互動、原生鍵盤事件、viewport 模擬與畫面檢視。這不是 React／Next／DB／RLS／RPC 測試。
- [設計文件](2026-10-31-kinnsoos-conversation-studio-design.md) 有研究問題、來源連結、現況／推斷／阻擋的完整區分。

## 實際測試與結果

| HKT 時間 | 實際問題／平台 | 結果 | 證據與界線 |
|---|---|---|---|
| 本輪研究，早於 04:03 | 公開首頁定位、導覽、登入入口是否可見？Chrome 未登入 | PASS | 首次 web reader 失敗後 browser 成功；未做登入成功、資料品質或部署 SHA 對齊驗收 |
| 本輪研究，早於 04:03 | 能否讀到指定路線圖及 Ads Copilot 工作室？ | BLOCKED_AUTH | 路線圖導向 Grok 登入；Ads 只見登入頁。沒有用登入頁推斷內部 UI；路線圖摘要使用倉庫 PD/N ledger |
| 本輪研究，早於 04:03 | 共享參考是否可讀？ | PASS_TEXT / MOCKUP_NOT_RUN | 共享對話可讀，但沒有可取得的互動 mockup iframe／獨立網址；只參考可見文字結構 |
| 04:03:44 | 四種身份是否保留共用首頁；訪客可否保存；取消來源／修改後狀態是否誠實？ | 2 PASS／2 FAIL | 初次失敗保留，見 initial JSON；未記錄當時 source hash，不當成 release evidence |
| 04:06:17 | 30 項有意義的原型互動檢查，1280×1000 CSS px | **30 PASS** | 共用首頁、提問→範本、登入／角色、引用、獨立 brief、逐項公開確認、未知 UUID、衝突、來源撤權、MCP、Ops、切帳號清除等；其後有焦點與 placeholder 呈現修正 |
| 04:06–04:07 | 320／390／768／1280 px 的首頁、範本、brief、editor、連接、功能目錄是否溢出？ | **24 PASS** | document／frame scrollWidth 與控件邊界檢查；body scrollbar 所佔寬度另保留，不以 requested width 冒充實際內容寬度 |
| 04:07:39 | 390×844、DPR2、mobile/touch，能否走完整 C1？reduce-motion 是否停止徽章動畫？ | PASS | 示例發布完成，`animation: none`；是 Chrome 模擬，實機及 Safari NOT_RUN |
| 04:09:02 | 1280 px 深色畫面是否跟隨外觀並可閱讀？ | PASS_VISUAL_INSPECTION | 實際 screenshot／computed colors，無橫溢。placeholder 後續改為產品次要文字色；完整 contrast/axe audit NOT_RUN |
| 04:09:46 | 原生 Tab／Enter 能否合理移動焦點？ | Tab PASS；轉場焦點 FAIL | Tab 從提問框到文件按鈕；Enter 開 C1 後 focus 跌回 BODY，已記錄並修正 |
| 04:10:52–04:11:06 | 修正後重試原生 Enter | **PASS** | 開 C1 → focus 在 start；開始討論 → focus 在 D1 summary；Enter 可展開證據，不新增 tabindex |
| 04:12:29 | 最終版本受影響流程再次驗證 | **14 PASS** | template／來源／brief／逐項確認／publish 焦點，dirty 狀態、未知同 UUID、完整 C1、撤權、未選來源、訪客 gate、無外部資源；綁下方最終 hash |
| 最終整理 | `node --check`、console／network、Git diff | PASS | JavaScript 語法可解析；原型 console 無 error/warn，沒有 fetch/XHR/ping；app／SQL／配置沒有變更 |

時間早於 04:03 的研究沒有逐次保留精確秒數，故不補造時間。瀏覽器沒有請求外部服務與 CSP 阻止 connect 是此原型的實際邊界，不代表未來產品有完整 prompt-injection 或 provider 防護。

## 初次失敗與修復

1. **未選來源仍被引用**：C1 取消 D2 後仍可開串，固定 brief 含 D2。修正為此完整示例必須明選 D1＋D2；其它範本只列自己選定的來源，且使用角色相關的輸出框架。最終 negative control PASS。
2. **已保存標籤過期**：修改 brief 已使內部保存狀態失效，但畫面仍顯示已保存。修正為即時顯示「有修改待保存」，前一次示例 receipt 清楚標示只屬較早版本，公開確認也失效。最終回歸 PASS。
3. **鍵盤焦點遺失**：重繪把 focus 丟回 BODY。修正為原生可操作元素間的 focus 保留／合理下一步；沒有用新 tabindex 改寫 tab order。原生鍵盤及最終回歸 PASS。

另做呈現修正：隱藏非 Ops 身份的 Ops 導覽、避免未修改草稿重複保存、手機示例提示至少 11px、明暗主題 placeholder 使用次要文字色。沒有為了通過而減低保存／權限／unknown-write 斷言。

## 來源檔與指紋

原型：`docs/prototypes/kinnsoos-conversation-studio.html`  
SHA-256：`c621d23f4710be274fb49e49aa2b79226d225689a61e5973d3ab8698f4941531`

對話內嵌 fragment：`C:/Users/laich/.codex/visualizations/2026/10/30/01a18e54-2283-7333-ba73-7ea0c0949198/kinnso-conversation-studio.html`  
SHA-256：`a4a205d11e45b6955f615052a4f81da695641992a42bed2e6f7293ee118abcf2`

證據：

- `docs/prototypes/conversation-studio-qa-initial.json`：2 PASS／2 FAIL 及其後焦點 FAIL，原樣保留。
- `docs/prototypes/conversation-studio-qa-final.json`：04:06 的 30 項結果；名稱 final 指該次主要流程批次，不是其後焦點修正的 hash。
- `docs/prototypes/conversation-studio-qa-layout.json`：24 個 layout probes、mobile、dark 觀察；限定於其測試時的原型。
- `docs/prototypes/conversation-studio-qa-final-delta.json`：最終 prototype hash、14 個回歸及原生鍵盤觀察。**最後來源綁定以此檔為準。**

獨立 builder check 已閱讀設計文件，回覆 `nothing important left`。這是設計可規劃性檢查，不是正式 security／code review 或政策批准。

## 仍未執行的驗收

**NOT_RUN**：真 Auth／DB／RLS／RPC、跨 app 身份、真正保存與新 session 讀回、正式 guide publish／分享撤回、provider OAuth／MCP／發送、真機、Safari/WebKit、讀屏／AT、全面 WCAG、真實使用者時間、部署及 migration／restore、third-party rights clearance。

**BLOCKED／OPEN 沿用原紀錄**：真攻略與圖片權利、指定 hosted target／roles／recovery、原 PD06 停止點、PD15–17 完整驗收、PD18 NO_GO。沒有因本原型通過而改寫任何產品 ledger。

## 如何試用

開啟原型，先看相同首頁的三組入口。切換「示例身份」到創作者 Mika →「寫 guide」→ 開始討論 → 展開來源 → 另開 brief → 保存私人 brief → 逐項確認公開內容 → 原編輯流程示例保存 → 獨立發布確認。頁面底部「原型檢查」可選逾時、衝突、未接通及來源撤銷。

切換 persona 會清除前一身份的私人示例內容；重新載入會重設所有資料。原型沒有真實保存功能，此行為不是資料遺失 bug。旅人／商戶／Ops 各有五張範本及入口預覽；此輪只完成創作者 C1 的完整交接示例。
