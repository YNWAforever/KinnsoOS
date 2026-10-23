# PD16／PD17 A0 驗收與恢復準備 — 2026-10-24

狀態：source及測試候選準備；最後 source/head、PR、CI終態由獨立 delivery receipt 綁定。起點為 PR89 `9c845c09dc41652d5d05657d2ebcfea7d3701fcd`，不挪用其成功結果。

## 可觀察成果

- Ops 可在沒有 DB client 的情況，檢查本地 subset artifact 的存在、長度、SHA-256、bounded path及明確的 readback狀態；篡改、截斷、缺失、跨路徑、symlink／hardlink及舊source皆不會變成恢復成功。
- D06 的目標 RPO／RTO維持 null／NOT_PROMISED。工具只對聲明的 UTC邊界計算 `faultAt-snapshotAt`及`readbackAt-declaredAt`，輸出標明 DECLARED_TIMING_ARITHMETIC_ONLY；不是 production測量。FAIL／NOT_RUN／BLOCKED readback保留原狀態，不填RTO或0。
- Owned DB案例沿用真 `runCollaborationReminders` port：已 commit的第三次 emit後注入 ACK loss，recipient先實際有3筆，再用同candidate／tick核對及補跑至5筆，重跑仍5筆；partial cursor遇read outage時先保留checkpoint，再補齊剩餘3筆。匹配recipient成功及outsider空讀，最後readback exact fixture cleanup。

## 離線工具及停止點

```text
cd apps/journeys
node --experimental-strip-types --test tests/subset-recovery-report.test.mjs tests/reminder-cleanup.test.mjs
node scripts/subset-recovery-report.mjs --root scripts --packet subset-recovery.template.json
```

模板預期 exit2／BLOCKED_INPUTS：缺owner、target、artifacts、timing及readback refs仍unknown，毋須填假資料。填齊格式及吻合bytes最多得到 REVIEWABLE_NOT_EXECUTABLE；`runtimeStatus:NOT_RUN`、`fullRestoreStatus:NOT_RUN`、`sharedRemixStatus:BLOCKED`及`authorizedActions:[]`不變。Identity／ownership refs只屬聲明；真正 target/transport/container/marker gate仍必須在client建立前另驗。

工具沒有 restore、SQL、client、schedule、provider或發送能力。不執行artifact內容；每個regular file≤16MiB、總共≤32MiB／64個、packet≤256KiB。只接受root內非hidden canonical相對路徑；不跟symlink／hardlink。DB subset與Storage bytes分別列出；即使兩者hash通過，也不證明Auth/session/roles、OAuth/SMTP、keyring、完整DB或Storage恢復。工作副本可copy所需owned artifacts到獨立目錄；不對原shared DB作dump或cleanup。

## 驗收層級

`PD16_PD17_A0_CASES_2026-10-24.json`保留14個H、6個PS及8個R；列出每案owned測試reference、真hosted仍欠的控制及下一個操作。Test reference是覆蓋定位，不是逐案hosted PASS。新candidate全suite通過後，只將owned evidence綁入delivery overlay；原H／PS的hosted observations不回填成功。

Owned CI使用原 fresh local Supabase/Auth/Mailpit profile、原 verifyTestTarget／registry／image／runner gates；不把原 Remix-Kinnso加入allowlist，不移除email confirmation或降低permission、numeric／sample／timeout gates。本機RAM不足以啟動既定DB／restore流程，故DB／browser放原owned CI；純filesystem／unit及source checks在本機跑。

本輪沒有從Remix匯出subset、沒有啟動Docker本機restore、沒有重放原project SQL。新的ACK／read-outage是對真owned DB port作可控故障注入，不是假裝有外部provider或真網絡故障；也不是移轉SQL的 COMMIT-unknown rehearsal。

## 仍未滿足的條件及下一個具體操作

- PD06 403／管理員／schema／keyring保留 BLOCKED，拒絕的env endpoint不重試或繞過；A1–A5未執行。
- 三篇真攻略同意及圖片權利 BLOCKED；owned fixture不代替真內容、公開可見性、physical devices或AT。
- 原Remix的角色／cohort／公開投影隔離、現行實體／渠道／primary及backup owner、actual scheduler/provider/recipient、fresh export／isolated restore／handoff仍缺可核實記錄。原H／PS hosted NOT_RUN；R01–R08實際shared subset演練NOT_RUN，不能把artifact checker當restore。
- D01保留原notice；D02／D03／D05／D06 A毋須重選；沒有真輪值、送達或RPO／RTO承諾。
- 維持A0、原Remix、不新增Supabase projects、不merge或deploy。PD15完整驗收、PD16／PD17、T08／N16仍OPEN／BLOCKED，PD18 NO_GO。

交付後可直接審查本增量及receipt；有原定owner／target／權利記錄和另次操作授權後，才把catalog中的精確hosted操作包固定為可執行candidate。本輪rollback是普通source revert並重驗；沒有shared schema／config可回退，不刪有效share、requestId、receipt、dedupe或immutable versions。


## Review 修正紀錄

初候選c11b728a的兩項P2均先保留RED再修：檔案在fstat後增長時，原whole-file read實讀16,778,268 bytes而超出16MiB；現用opened size＋1 overflow probe的bounded readSync，不載入增長後整個file。原cleanup helper的精確source亦以純filesystem port重現：mission delete failure蓋過原scenario error且無任何readback。

修正後以test-only coordinator保留scenario／cleanup／readback errors及FAIL checkpoint；第一個cleanup失敗即停止後續actor刪除，仍作唯讀exact-ID診斷，不輸出成功cleanup receipt，下一個相關probe停止。這遵守既有isolation停止規則，不盲目重試刪除。29項focused tests在Windows為28 PASS／1 symlink SKIP；新source須重新完成全部exact candidate CI，c11結果只屬歷史。
