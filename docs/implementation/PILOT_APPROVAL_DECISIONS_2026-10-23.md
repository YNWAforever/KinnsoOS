# KinnsoOS 可審批決定表 — 2026-10-23

這張表只決定文案/測試準備方案。批准方案不會自動發送訊息、建立Auth身份/派角色、執行SQL、改provider/排程、merge或production deploy；每個真正外部操作仍須綁exact target、candidate、IDs/範圍及當時authority。真攻略作者同意及圖片權利 **BLOCKED**，不在本次審批中解除。

**D04已收到**：用原有Remix-Kinnso，**不建立新Supabaseprojects**。已核對management metadata/DNS；仍未核對project用途/共有讀者、Auth/schema/roles/isolation。採用原backend＋現有KinnsoOS branch Preview＋exact synthetic cohort；恢復只準備可丟棄localDocker subset。這不是獨立cloudstaging或全productionrestore。毋須重選project或報價。

| ID | A：建議選項 | B：替代選項 | 選定後仍須的非秘密資料 |
|---|---|---|---|
| D01 營運/私隱責任 | 指定實際法律實體、一名私隱職務負責人及可測試聯絡渠道；pilot建議不收查閱副本費用 | 只保留現行notice及內部文案review，待法律實體/責任人確定才啟動真人收集 | 法律名稱、對外職稱/地址/聯絡，primary/backup owner private reference；不是選品牌名稱充當法律實體 |
| D02 支援安排 | 沿用app內case，另有受控mailbox作未能登入/私隱後備；香港工作日10–18時，首次回應兩工作日只作內部目標 | 經核准既有mailbox人工處理case reference，暫不承諾回覆時間 | 真實channel及擁有人、輪值/假期/absence安排；無人當值不可發布時段；所有外寄測試另核scope |
| D03 處理用途/政策 | 先不新增optionalmeasurement、外部AI分析、marketing；按已核實實際processor/region/retention/backup事實完成31組copy的slots | 列明需要的額外處理逐項審用途、接收者、consent及保留，再做對應實作/驗收 | activated provider清單與用途/接收類別/regions、每類retention或客觀criteria、manualdelete/hold/backup/restore再套刪除程序；未知維持unknown |
| D05 測試角色 | 先接受13個非Opssynthetic身份＋一個既有獲准Ops slot的矩陣，兩公司/分支，全域Opsgrant不新增 | 提供已有的獨立測試identityrefs套入相同角色矩陣，不重用Authsubject跨persona | 指定test owner、受控Auth/mailbox/credential管理reference、公司/branch references；exact建帳/role/fixture範圍另包，尚未執行 |
| D06 恢復目標 | 先準備一次syntheticsubset→ownedlocalDocker演練，不對外作RPO/RTO承諾；量測後再訂目標 | 以RPO24h/RTO4h作待驗候選目標，接受每日snapshot/物件備份與輪值準備；未驗證前不是能力或SLA | recoveryprimary/backup owner、窗口、subsetexport/readback/保留scope；完整原projectrecovery另保留NOT_RUN |

回覆可以用 `D01 A、D02 B、D03 A、D05 A、D06 A` 加上現有公眾聯絡或私有reference。**不需credentials、secretkeys、私人證明或完整身份文件**。尚沒有的營運事實可以先填unknown；相關copy維持未核准，不虛構完成。

## 送審內容

- `PRIVACY_SUPPORT_DRAFT_2026-10-23.md`：PS-20261023-r1，31組EN/zh-HK PPS/PICS、發布/分享、support receipt/unknown/CAS、telemetry、查閱/更正/延誤/拒絕回覆；D01–D03未核准、effective date未設定。
- `PRIVACY_SUPPORT_COPY_MAP_2026-10-23.csv`：31組文字逐字對應實際`/{locale}/legal/privacy`、signup/support/guide/share等現有surface；沒有import或autoactivation。
- `STAGING_ACTOR_RECOVERY_PREPARATION_2026-10-23.md`＋`PILOT_TEST_ACTORS_2026-10-23.csv`：步驟、stop points、14slots/兩公司、R01–R08local subsetdrill、cleanup/rollback；所有hosted observed及actualrestore均NOT_RUN。
- `KINNSO_PRODUCT_PREPARATION_TASKS_2026-10-23.csv`＋JSONledger：29列四狀態，原18N/53traceability byte-identical，T08/N16仍open，PD18 **NO_GO**。

## Copy實施前最終check

owner/content/legal reviewer在兩個語言版本留下private approval reference，補完全部⟦Dxx.field⟧、copyversion/effectivedate/適用環境；確認實際contact、收件及handoff。Consent/state或unknownwrite顯示須有真receipt，不把這份文案當成已實作；source/UI改動與部署各自另行可審查交付。任何錯誤fact/channel回退原notice，保留case/rightsrequest/dedupe/immutableversions；不以改copy當作資料刪除或已撤銷外部發送。
