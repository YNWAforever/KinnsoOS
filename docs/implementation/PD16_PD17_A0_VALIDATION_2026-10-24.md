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

## PR90 A0 再審查及 source-binding 修正

原交付 da222ef9 的 sealed ZIP／CRC／1,070 leaves、16 canonical Git leaves及510 corresponding-source hashes已重新獨立核對。Archive有440個entries與Git bytes相同，70個只有Windows CRLF差異；所有source hashes保留原bytes，沒有其他內容差異。這是當時封包的紀錄，不能挪用為修正版CI。

本輪重現 preparation resolver 的兩個來源綁定缺口：dirty checkout仍回舊HEAD；解壓後的source／mapped SQL改動，僅靠dirty:false仍回metadata SHA。新增9項真filesystem／synthetic Git／actual CLI regressions，修正前7 FAIL／2 PASS，raw RED保留。現Git路徑要求全checkout無tracked／staged／untracked差異並覆核HEAD；解壓包重用既有verifySourceInputs，先核對source manifest完整集合、每檔SHA及mapped repository SQL bytes，再使用metadata revision。這只證明封包內部一致；遠端commit／PR/tree仍由delivery另外核對，metadata不是簽署的authority。

resolveCandidateRevision現在為async；兩個CLI均await，不會把Promise當SHA。Ignored generated outputs仍可存在；malformed／incomplete metadata、變更source／SQL均保持null source及BLOCKED_INPUTS，不授予任何動作。新測試已納入app source manifest（506 app files＋5 repository SQL inputs）。沒有新增或執行SQL。

本輪precommit本機npm test全unit：1049 PASS／1 Windows symlink SKIP；focused（preparation、兩CLI、subset、cleanup、既有source verifier）：66 PASS／1同類SKIP。上述local結果綁當時HEAD／dirty diff／新檔fingerprint；最終修正版head／tree、Linux symlink、owned DB／browser／build及所有CI終態須由新delivery receipt綁定，不能以da結果代替。

R01補直接source-binding negative controls reference；R02補artifact integrity reference。原14H／6PS／8R hosted／shared restore NOT_RUN不變。實際shared subset export／restore、COMMIT-unknown移轉、primary／backup交班、真scheduler／provider／recipient仍未執行；原權利／403／admin停止點及D06 null目標不變。這次沒有跑本機restore，單次RAM observation不代替四次fresh 4-GiB gate及exact container identity。

### 兩項獨立 review P2 的實際重現及修正

真 owned temp Windows junction 在containment檢查回傳後替換父目錄，舊reader確實讀到外部owned file而回REVIEWABLE_NOT_EXECUTABLE；同輪exact-source filesystem probe亦重現partial setup後missionRemoval錯報PASS並繼續刪actor。兩案RED為2 FAIL／0 SKIP，沒有DB import。現在reader在containment前保留root／ancestor／file identity，open後及讀後核對realpath、inode／device／regular file／link count；新race實測BLOCKED_ARTIFACTS且0 bytes read。不是只有symbolic mock，也不是只改report。

Owned setup逐步保存merchant／mission／milestone／participant的預先分配UUID與stage；fixture的readonly actorIds保留Auth create後、creator update／sign-in未完成前已知ID。Setup不完整時cleanup先FAIL，停止actor刪除；已知mission／actors仍各自唯讀回查。Checkpoint保存已分配IDs、setupComplete:false、stage及原scenario error，不會輸出成功cleanup，後續相關probe保持停止。這沒有在shared target做任何fixture／cleanup。

新增兩項回歸後focused結果為68 PASS／1 Windows file-symlink SKIP；Windows directory-junction race已實際PASS，Linux CI仍須執行全部link案例。最終full unit／source／owned CI和review結果由獨立delivery receipt記錄。Reviewer自身sandbox曾見hardlink EPERM（27 PASS／1 FAIL／1 SKIP）另保留；parent已授權worktree的hardlink案例實際PASS，不能把reviewer結果刪除或改成產品PASS。

### 同候選 CI 真 FAIL 及後續測試準備修正

e673a148是已推送、經審查的中間候選。Push workspace-fixtures的public suite實際124 PASS／2 FAIL：zh-HK 1280 workspace／credits在text×2後logo ratio為0.969358，原gate要求1.0；PR event的同suite曾PASS，兩者分開保留。Parent本機原測試亦重現1 FAIL／1 PASS；加geometry的10次診斷為1 FAIL／9 PASS，失敗當刻scrollY=3、logo y=-3／height97.90625、html scrollBehavior=smooth。這是量測起點未穩定，沒有改成較低ratio或忽略失敗。

只加instant scroll仍失敗（6 FAIL／4 PASS，scrollY31／46亦保留），所以沒有把首次嘗試稱成功。最終在keyboard focus前固定audit-only scrollBehavior:auto，待fonts.ready及兩個animation frames結算文字layout，再instant到(0,0)並讀回核對；之後仍用原ratio1、5000ms與原axe／contrast／reflow／無writes gates。相同10次採樣已10 PASS；完整public suite及最後head CI另由delivery綁定。這不驗收smooth-scroll動畫、native text zoom、physical devices或AT。

本機一次full-suite啟動因上一個owned browser run尚未終態而被原3496 ownership gate擋下；保留NOT_RUN/startup log，沒有reuse或kill其他server。前run終態及unused port後才重新執行。本輪所有RED、intermediate PASS、真正FAIL、SKIP及harness errors由新封包歷史索引保留。

另以1 FAIL補到metadata與Git分支交界：metadata不能遮蔽canonical checkout的dirty狀態，也不能與其HEAD不一致；先驗Git，再驗完整metadata bytes。Standalone在無關ancestor checkout下仍用自己的已驗metadata，35個source/preparation tests已PASS。最終全suite新source結果另記，e673 owned CI只屬該中間候選。

Final precommit補驗：source metadata若位於canonical Git，await byte verification期間變dirty或HEAD前進不能回舊revision；兩個真temp Git RED已保留，現驗證後再核對相同clean HEAD。Focused為71 PASS／1 Windows file-symlink SKIP；完整public126 PASS／0 SKIP、72個axe scans零violations／incomplete。最終full unit、typecheck、source checks及新head CI由delivery綁定，不借用e673結果。

最後canonical source的本機全unit1054 PASS／1 Windows symlink SKIP；typecheck PASS；source-package9 PASS／1 Windows symlink SKIP。Next dev生成的next-env僅兩個dev types路徑，已保存差異及還原原canonical bytes後重跑必要checks；不是用戶檔案清理或reset。

### 指定0a28440a及新封包覆核：pilot packet ingress

重新核對0a28440a的sealed delivery：ZIP SHA-256 b9c57f3dfcedc3a992371e17b1d8e4dfbdd5667c2f1822dfabe878535b8651dc，2,172 entries／2,171 hashes及全部CRC正確；其512-entry corresponding source的511 hashes、21 canonical Git leaves、22 PR paths、原18 N／53 traceability及3個no-deploy guards相符。Fresh GitHub metadata與12個原official artifact ZIP bytes／digests／CRC再次相符；仍是原same-candidate16核心jobs SUCCESS／attempt1及16 conditional SKIPs，沒有重新執行舊job或清除歷史FAIL。

Parent actual CLI probe發現pilot preparation先stat上限262144，再readFileSync整檔；真owned temp檔在metadata capture後增長，實讀263170 bytes，原樣RED（app regression1 FAIL／3 PASS）。Subset reader的既有bounded read未受影響。新pilot reader只open一次，fstat regular file及原cap，最多讀opened size＋1，再核對actual count／size／mtime；finally close。可用O_NONBLOCK防止nonregular pipe在fstat前等writer；參數／UTF-8 BOM／INVALID_PACKET exit1／不echo／source resolver合同保留。沒有改authorities、來源驗證、DB／fixture／keyring或產品UI。

四個actual CLI controls修正後4 PASS／0 SKIP；本輪precommit全unit1058 PASS／1既有Windows file-symlink SKIP（1059 tests），source-package9 PASS／1 Windows symlink SKIP。這是本機filesystem／CLI層；final source/head、typecheck及new candidate owned CI由新delivery獨立綁定。0a的1055 Linux unit不能代替新candidate1059測試。Reviewer原始18 offline probes與其未發現此parent-found race的限制均保留。

R02補pilot input integrity control；R05／R06／R08明確對應既有兩個owned DB reminder scenarios和cleanup negative controls。這些證據只涉及notification events／exact fixtures，不證明shared subset restore、SQL移轉COMMIT-unknown、Auth／Storage恢復、外部provider／真scheduler或primary-backup交班。所有28案原hosted／shared觀測仍NOT_RUN；真攻略權利與PD06 403／管理員／schema／keyring仍BLOCKED，T08／N16 OPEN，PD18 NO_GO。
