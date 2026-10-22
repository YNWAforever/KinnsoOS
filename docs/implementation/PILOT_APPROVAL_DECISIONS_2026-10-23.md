# KinnsoOS 已選準備方向及待核實輸入 — 2026-10-23

用戶已選 **D02、D03、D05、D06 = A；D01保留現行notice；D04沿用原有Remix-Kinnso，不新增Supabase projects**。這些是準備方向，並非已補交私有證據、已核准文案或已授權實際操作。毋須重選上述選項。

本批以既有branch `codex/pd-policy-staging-preparation-20261023` 的 HEAD `ed47c6cf18d37d8f00ffbeb30d645ebea8221b97` 為修訂起點；最終publication head／PR／CI及受測內容差異由publication receipt另行綁定，本文件不聲稱publication結果。文案/packet不會自動發送訊息、建立Auth身份/派角色、執行SQL、改provider/排程、merge或production deploy。真攻略作者同意及圖片權利繼續 **BLOCKED**，原T08/N16仍open，PD18仍 **NO_GO**。

| ID | 已選方向 | 已選與仍未核實的界線 | 下一個具體動作 |
|---|---|---|---|
| D01 | **保留現行notice**；雙語草稿維持未核准、未啟用 | 法律實體、私隱職務負責人、真實聯絡、primary/backup owner仍unknown；亦未選定查閱費用政策 | 繼續內部review及保留unknown slots；未有核實事實和內容審批前不替換notice、不以此開放真人pilot收集 |
| D02 | **A**：既有app case＋受控mailbox後備；香港工作日10:00–18:00作準備窗口，首次回應兩工作日只作內部目標 | 真channel、收件/交班、primary/backup與輪值/假期/absence安排仍未提供；不是已有人當值或對外SLA | 先完成route/receipt及handoff操作包；取得真channel與owner refs後才安排另獲准的收件驗證/對外copy |
| D03 | **A**：不新增optional measurement、外部AI分析或marketing；沿用現有四項AI任務、provider及budget | 不停用或更換既有AI；不因此聲稱現有processing已關閉、無training或無marketing；processor/region/retention/backup事實仍unknown | 按實際已啟用服務逐項核對inventory與刪除/保留程序，再送審31組copy的事實slots |
| D04 | **既有Remix-Kinnso**；不新增Supabase projects、不查價或升級 | management metadata/DNS是歷史只讀記錄；用途/共用讀者、Auth/schema/roles/permission/isolation未核實；選project不是寫入權限 | 準備exact candidate/target/cohort/IDs範圍及readback；shared backend不冒稱獨立staging，public synthetic publication保持停止點 |
| D05 | **A**：13個非Ops synthetic身份＋一個既有獲准Ops slot，兩公司/分支 | 矩陣已選，但身份/公司/分支、受控Auth/mailbox管理、test owner refs未提供；實際建立/派角色均0，不新增全域Ops/admin grant | 先填exact setup/role/fixture包的範圍及rollback；原target身份/權限核實與操作scope另審後才執行 |
| D06 | **A**：先準備一次synthetic subset→owned、unlinked local Docker演練，量測後才訂目標 | **沒有承諾或預設正數RPO/RTO**；packet的兩數值保持null。recovery primary/backup owner、窗口、exact export/readback/保留scope仍unknown；Docker daemon歷史檢查不可用 | 取得上述refs、fresh資源/identity gate後才提出exact演練操作包；先記實測時間/coverage；完整原project恢復仍NOT_RUN |

## 可審查內容與packet含義

- `PRIVACY_SUPPORT_DRAFT_2026-10-23.md`：PS-20261023-r1、31組EN/zh-HK copy；已記方向，內容仍 **UNAPPROVED / NOT FOR ACTIVATION**，effective date未設定。
- `PRIVACY_SUPPORT_COPY_MAP_2026-10-23.csv`：31組public wording保持原文，沒有import或autoactivation。
- `STAGING_ACTOR_RECOVERY_PREPARATION_2026-10-23.md`＋`PILOT_TEST_ACTORS_2026-10-23.csv`：14slots/兩公司、R01–R08 subset drill及停止點；hosted角色、收件、actual restore全部 **NOT_RUN**。
- `KINNSO_PRODUCT_PREPARATION_TASKS_2026-10-23.csv`＋JSON：選項已記錄；缺少的營運證據與runtime分開。原18N/53traceability不改；CI問題由並行工作獨立記錄，不挪用舊PASS。
- `pilot-preparation.template.json`只記本次session方向，owner/channel/identity/target refs不虛構。D01–D06的PASS只指方向及reference格式；`RECOVERY_PREPARATION`、source/target/actors等仍會因缺輸入BLOCKED。
- D06 A的準備檢查要求`serviceObjective: NOT_PROMISED`、`rpoMinutes: null`、`rtoMinutes: null`；recovery owner仍須獨立提供。完整輸入最多`REVIEWABLE_NOT_EXECUTABLE`，`authorizedActions:[]`、schema:not_checked、runtime:NOT_RUN、realContent:BLOCKED不變。

## Copy實施前最終check

現時按D01保留原notice。日後若要啟用草稿，須另有明確方向、owner/content/legal reviewer在兩個語言版本的private approval refs、全部⟦Dxx.field⟧核實、copy version/effective date/適用環境，以及真contact的收件及handoff證據。user方向不是這些事實。任何錯誤fact/channel回退原notice，保留case/rightsrequest/dedupe/immutableversions；不以改copy當資料已刪除或已撤銷外部發送。
