# Privacy and support copy — EN / zh-HK — 2026-10-23

**DRAFT / UNAPPROVED / NOT FOR ACTIVATION.** Copy version `PS-20261023-r1`. Prepared and official sources checked **2026-10-23 (Hong Kong)**. This is reviewable proposed wording, not an activated policy or a compliance determination. The paired CSV is the placement and dependency map, not an import instruction.

| Approval metadata | Record |
|---|---|
| Source baseline | User-supplied PR85; local HEAD verified `6126ed900c9fa7f17688ac3261970add46d70cfa` |
| Native worktree / branch | `C:\Users\laich\.codex\worktrees\pd-public-entry-20261022\KinnsoOS` / `codex/pd-policy-staging-preparation-20261023` |
| D01 / D02 / D03 approval | All **UNAPPROVED**; owner identities and private approval references not supplied |
| Language / effective date | EN reviewer and zh-HK reviewer **UNASSIGNED**; public effective date **NOT SET** |
| Boundary | Two draft files only; no app edits, commits, push, merge, deployment, messages, hosted clients, secrets or configuration changes |

**Environment steering:** the user designates the **original existing Remix-Kinnso backend**. The separate environment packet records management metadata/DNS for the selected project; live Auth/schema/configuration, shared-target isolation, actual recipients and processing locations have **not** been verified. An independent Preview does not establish an independent database or cloud staging environment. D04–D06 preparation for that existing backend, an exact bounded synthetic cohort and a disposable local Docker restore is separately owned; this document neither rewrites those environment plans nor claims they have run. No new Supabase project is to be created. No independent cloud staging or full production restore is claimed.

**Independent gates stay independent:** policy D01–D03 remains draft; real-guide author consent and image rights remain **BLOCKED**. Copy review may proceed without real content. Copy approval does not authorise activating services, publishing guides, sending replies or running recovery.

## Reviewer-only approval slots and decisions

Only `⟦Dxx.field⟧` marks an unknown fact requiring approval. Every occurrence must be replaced with verified public wording before activation. Do not publish the brackets, label an unknown as “none”, or infer facts from the Kinnso brand, a backend name, source dependencies or a Preview URL. `{{field}}` in human reply templates is a separate merge field: fill it only from that case's verified facts, and remove an inapplicable conditional sentence.

| Decision / slot | Required fact and concrete recommendation |
|---|---|
| D01.legal_operator | Actual legal entity operating this service, with approved public name. Confirm the legal fact; do not choose a convenient brand name. |
| D01.privacy_owner_and_contact | Accountable privacy job title (a job title is acceptable), tested public correspondence destination and postal contact details. Recommended: one accountable role on the verified operator, with a monitored privacy mailbox; an existing shared mailbox is an alternative only with explicit routing and ownership. Private staff identities/approval evidence stay in private records. |
| D02.support_channel | Real existing account-case route and/or approved monitored support destination, with a staffing owner and handover. Recommended: existing account cases when enabled, with a separately identified privacy route. Alternative: an approved existing manual correspondence channel; no new intake form. |
| D02.support_hours | Actual staffed days/hours, timezone and holiday/absence handling. Recommended: a bounded staffed pilot window. A two-Hong-Kong-working-day first-response target may be considered **internally only**, subject to staffing approval; it is not a current promise or statutory deadline. Alternative: publish verified coverage without a response-time target. |
| D03.active_processing | Closed list of **actually activated** recipient classes/providers, purpose, data categories, processing/access regions, security/contract safeguards and necessary logging. Distinguish provider processing from public audiences in P04. Hosting geography does not prove database, backup or support-access location. No unverified vendors or broad “any partner” clause. |
| D03.secondary_uses | Actual AI analysis, model-training/secondary-use and direct-marketing facts, including submitted-link handling, recipients and required notices/choices. Recommended pilot proposal: leave optional measurement, external AI analysis and direct marketing off until approved and verified; manual authoring can be prepared independently. Alternative: enable only an enumerated approved use after its safeguards and applicable choice are verified. This proposal does **not** assert current settings or “no training/no marketing”. |
| D03.retention_and_backups | Retention periods or objective criteria for account/trip/media, drafts, collaboration/proof/support, telemetry and operational records; deletion/anonymisation method, lawful holds, processor copies, backup expiry/access and deletion reapplication after restore. All remain unknown. No invented erasure, backup rotation, region, RPO/RTO or event-retention period. |

Pilot recommendation requiring D01 approval: use only content with privately recorded author publication permission and applicable image/person permissions; do not solicit extra identity evidence by default. D01 should approve a minimal verification method and the access-fee approach (recommended pilot option: waive access fees; alternative: explain a lawful non-excessive fee). None of these proposals is current operating truth.

## Source facts consulted — source review, not hosted acceptance

Read `PRIVACY_SUPPORT_CONTENT_ACCEPTANCE.md` and `PILOT_SUPPORT_RUNBOOK.md` in this directory. Both retain missing owners/configuration and real acceptance as BLOCKED/NOT_RUN. MCP project `kinnso-pd-20261022` supplied symbol discovery/snippets; integration functions returned no matches, so the exact local integration files were read. Routes below refer to **apps/journeys**, not assumed legacy web routes.

| Local source | Fact used / limit |
|---|---|
| `apps/journeys/app/integration/PublicInformation.tsx`; `public-entry-registry.ts`; `app/travel/Workbench.tsx` | Actual privacy path is `/{locale}/legal/privacy`; current notice explicitly lacks a full policy and dedicated privacy contact. Existing help/contact/business contact entries and disabled-service exits are retained. Service configuration is not company/ops authority. |
| `app/auth/EntryPage.tsx`; `app/[locale]/sign-up/actions.ts` | Existing signup requires email, password and matching confirmation. No new consent checkbox, collection field or marketing agreement is proposed. Account/recovery email delivery is not established by a UI response. |
| `app/travel/CreatorWorkspace.tsx#CreatorEditor`; `lib/creators/editor-operations.ts#publicationReadiness` | Publishing is an explicit action on a saved version. Readiness checks required content, **not** author consent, image licences or people permissions. Existing traveller copies are not rewritten by a later publication. |
| `lib/seo/public-guide.ts`; `app/travel/SharePreview.tsx`; `app/share/[token]/page.tsx` | Public guide projection is separate from private records. Sharing selects titles/photos, excludes private notes/receipts/account information and has expiry/revocation controls. An expired link is not proof of data erasure or recall of downloads. |
| `app/travel/InboxWorkspace.tsx#SupportWorkspace`; `lib/collaboration/support-context.ts` | Case subject/message and authorised mission context; customer reply separate from internal decision reason. Unknown outcomes retain original command/request identity; receipt is checked before same-request retry. Local draft save is not case receipt. |
| `app/travel/TelemetryConsent.tsx`; `lib/telemetry/events.ts`; `app/api/telemetry/consent/route.ts` | Optional activity/browser-experience measurements use versioned consent and random/pseudonymous identifiers; free private text is excluded by the schema. Consent storage/cookie validity is seven days in source, **not event retention**. Actual activation is unverified. |
| `lib/telemetry/server.ts`; `repository.ts`; `performance.ts` | Some server request/query timings have a separate path from optional activity/browser metrics. Do not claim declining disables all logs/measurement or that all records are anonymous. Necessity, actual logging and retention require D03 review. |

Paths after the first row are relative to `apps/journeys/`. No hosted identity, provider/region, consent, account, delivery or restore assertion was verified.

## Official Hong Kong drafting basis

All four official PCPD sources below were retrieved successfully and checked **2026-10-23**. The checked date is the retrieval date, not a new legislative or publication date. The guidance informs this draft; no generic compliance guarantee is made.

| Ref | Primary official source | Principle used |
|---|---|---|
| L01 | [PCPD — The Personal Data (Privacy) Ordinance](https://www.pcpd.org.hk/english/data_privacy_law/ordinance_at_a_Glance/ordinance.html) | DPP1 necessary/fair collection; DPP2 accuracy/retention; DPP3 limits on new uses; DPP4 security including processor controls; DPP5 openness; DPP6 access/correction. Section 26 concerns erasure of no-longer-required data, subject to its exceptions. |
| L02 | [PCPD — Guidance on Preparing PICS and PPS](https://www.pcpd.org.hk/english/publications/files/GN_picspps_e.pdf) | A PICS gives collection-specific purposes, obligatory/voluntary status and consequences, defined transferee classes, rights and responsible contact. Provide collection information on/before collection and rights/contact information by the required time; best pilot practice is all before submission. A PPS explains wider policies/practices and must be readily accessible. Explicitly disclose intended public publication. |
| L03 | [PCPD — Proper Handling of Data Access Requests and Fees](https://www.pcpd.org.hk/english/publications/files/DAR_e.pdf) | Access generally within 40 **calendar** days; delay notice/reasons and compliance possible within that period, remainder as soon as practicable; written refusal/reasons within 40 days. Identity/authority and scope checks must be proportionate; access fees must not be excessive. |
| L04 | [PCPD — Compliance with Data Access and Correction Requests](https://www.pcpd.org.hk/english/resources_centre/publications/information_leaflet/files/data_user_no2_e.pdf) | Correction of data found inaccurate and corrected copy within 40 days; a delay notice is also relevant to correction (s23(2)); refusal notice/reasons (s25). Chinese/English written notices follow the request language (s29); refusal log obligations are separate. |

Operator instructions for R01–R05: log first receipt and assess completeness/applicability promptly. Acknowledgement, reassignment, staffing hours or a request for clarification does **not automatically restart** a statutory clock. Apply actual statutory conditions/exceptions case by case; access concerns personal data, not an unrestricted right to every document. Review required correction notifications to prior recipients and refusal logging. Do not withhold data merely because it is labelled “internal” or “confidential”. Do not substitute an ordinary customer-service target for a statutory action/notice.

## Proposed customer copy — each EN / zh-HK pair requires approval

These are the actual proposed paragraphs. Placement, dependencies and activation gates for each ID are in the CSV. Reviewer metadata above/below is not customer copy. The zh-HK text is separately drafted policy copy; it does not cause translation of author content.

### Account and general PPS / PICS

#### P01 — Signup notice

EN: ⟦D01.legal_operator⟧ uses your email and password to create and secure your Kinnso account and provide sign-in and recovery. Both are required; without them we cannot create the account. Read Privacy information for data sharing and your access and correction rights, or contact ⟦D01.privacy_owner_and_contact⟧. Creating an account does not publish a profile or guide.

zh-HK: ⟦D01.legal_operator⟧ 會使用你的電郵及密碼建立和保護 Kinnso 帳戶，並提供登入及帳戶復原。這兩項資料屬必填；欠缺資料便無法建立帳戶。資料披露安排及查閱、更正權利詳見「私隱資訊」，亦可聯絡 ⟦D01.privacy_owner_and_contact⟧。建立帳戶不會發布個人檔案或攻略。

#### P02 — PPS: operator, data and purposes

EN: Kinnso is operated by ⟦D01.legal_operator⟧. When you use an available account service, we handle the information needed for that service: account details; saved trips, notes and photos; creator profile details, submitted source links and guide drafts; company and collaboration records; and support subjects and messages. We use these to provide account access, save your work, publish content you explicitly approve, manage collaborations, and investigate and reply to enquiries. Optional measurement is described separately below.

zh-HK: Kinnso 由 ⟦D01.legal_operator⟧ 營運。當你使用已提供的帳戶服務時，我們會處理該項服務所需的資料，包括帳戶資料；已保存的行程、筆記及照片；創作者檔案、你提交的來源連結及攻略草稿；公司及合作紀錄；以及支援案件的主題和訊息。用途包括提供帳戶存取、保存你的工作、發布經你明確確認的內容、管理合作，以及查核和回覆查詢。自選量測另於下文說明。

#### P03 — PICS: required and optional information

EN: An email address, password and matching password confirmation are required for signup. A subject and message are required to submit a support case; without them that request cannot be submitted. Give only what is needed for the issue. You choose whether to add private notes or photos, publish or share content, or allow optional measurement. You can browse published guides without creating an account.

zh-HK: 註冊時必須提供電郵、密碼及一致的確認密碼。提交支援案件則必須填寫主題及訊息，否則無法送出該項要求。請只提供處理問題所需的資料。是否加入私人筆記或照片、發布或分享內容，以及允許自選量測，均由你選擇。毋須建立帳戶亦可瀏覽已發布攻略。

#### P04 — PPS/PICS: who can see information

EN: Visitors can read your published guide content and public author details. Your private trip records are separate. Collaboration material is visible according to the creator's and company's authorised roles. You and authorised support staff can follow your support case. Opening a case does not give everyone access to private delivery evidence or publish that evidence. External service recipients and any other disclosures are specified in the service description below.

zh-HK: 訪客可閱讀你已發布的攻略內容及公開作者資料；私人行程紀錄另行保存。合作資料按創作者及公司獲授權角色的權限顯示。你與獲授權客服人員可跟進你的支援案件。建立案件不會讓所有人取得私人交付證明的權限，亦不會公開該等證明。外部服務接收者及其他資料披露安排，列於下方服務說明。

#### P05 — PPS: activated services and additional uses

EN: Account and company permissions control access to private workspaces. The activated services, recipient classes, purposes, data received, processing locations and safeguards are: ⟦D03.active_processing⟧. Any additional uses involving AI analysis, model training or direct marketing, and the applicable notices and choices, are: ⟦D03.secondary_uses⟧. Creating an account or allowing optional measurement is not consent to an unrelated use of your personal data.

zh-HK: 私人工作區的存取受帳戶及公司權限控制。實際啟用的服務、接收者類別、用途、接收資料、處理地點及保障措施如下：⟦D03.active_processing⟧。任何涉及 AI 分析、模型訓練或直接促銷的額外用途，以及適用通知和選擇如下：⟦D03.secondary_uses⟧。建立帳戶或允許自選量測，並不等於同意將個人資料用於不相關的新用途。

#### P06 — PPS: retention, deletion and backups

EN: Personal data should not be kept longer than necessary for its stated purposes, subject to applicable legal requirements. Our approved retention, deletion and backup arrangements are: ⟦D03.retention_and_backups⟧. To ask about removal of an account or content, use the privacy contact below. We will explain what can be removed, any necessary retained records and the reason, and how backup copies are handled. Signing out or clearing browser storage does not itself erase account records; a removal request is not confirmation of completed deletion.

zh-HK: 除適用法律要求外，個人資料不應保留超過達到原定用途所需的時間。經核准的保留、刪除及備份安排如下：⟦D03.retention_and_backups⟧。如欲要求移除帳戶或內容，請使用下方私隱聯絡方式。我們會說明可移除的資料、仍有必要保留的紀錄及原因，以及備份副本的處理方法。登出或清除瀏覽器儲存不會直接刪除帳戶紀錄；提出移除要求亦不代表已完成刪除。

#### P07 — PPS/PICS: rights and privacy contact

EN: You can ask whether we hold personal data about you, request a copy, and ask us to correct inaccurate data. Contact ⟦D01.privacy_owner_and_contact⟧ and describe the records concerned. We may need limited information to verify your identity or authority before disclosing data. Do not post identity documents, passwords or sign-in codes in public pages or demo workspaces. Any fee for a data access request must not be excessive and will be explained before supply.

zh-HK: 你可查詢我們是否持有你的個人資料、要求取得副本，以及要求更正不準確的資料。請聯絡 ⟦D01.privacy_owner_and_contact⟧，並說明涉及的紀錄。在披露資料前，我們可能需要有限資料以核實你的身份或授權。請勿在公開頁面或示範工作區張貼身份證明、密碼或登入驗證碼。查閱資料要求如涉及費用，費用不得超乎適度，並會在提供資料前說明。

#### P08 — PPS: statutory request timing

EN: The Hong Kong Personal Data (Privacy) Ordinance generally requires compliance with a data access request, or correction of data found inaccurate and supply of the corrected copy, within 40 calendar days of receiving the request. If full compliance is not possible within that period, written reasons and any compliance possible are due within it; the remainder must follow as soon as practicable. Refusals must also be notified with reasons within 40 days, subject to statutory exceptions. These are statutory requirements, separate from ordinary support response targets.

zh-HK: 香港《個人資料（私隱）條例》一般規定，須在收到要求後 40 個曆日內依從查閱資料要求，或更正經確認不準確的資料並提供更正後的副本。如未能在該期限內全部依從，須在期限內書面說明原因，並依從當時能夠依從的部分，其餘須在切實可行範圍內盡快完成。拒絕要求亦須在 40 日內通知並說明原因，但法定例外情況除外。這些屬法定要求，與一般支援回覆目標分開處理。

#### P09 — Account, device drafts and demos

EN: Connected account services can save information beyond this browser. Where device recovery is available, unsent drafts may also be kept on this device for the relevant account. Demo pages use sample data and local browser storage; a demo identity grants no account, company or operations access. Clearing local storage is separate from deleting account data. Keep private evidence out of demo pages.

zh-HK: 已接通的帳戶服務可將資料保存於這個瀏覽器以外。如裝置恢復功能可用，未送出的草稿亦可能按相關帳戶保存在此裝置。示範頁使用樣本資料及瀏覽器本機儲存；示範身份不會授予帳戶、公司或營運權限。清除本機儲存與刪除帳戶資料是兩回事。請勿在示範頁提供私人證明。

### Publication, sharing and content rights

#### G01 — Explicit guide publication

EN: When you explicitly publish a guide, its published content and public author details can be read by visitors. Saving a private draft is separate from publishing. Check the saved guide content before choosing Publish structured version. Publishing a later version does not rewrite travellers' existing private copies. Publication is not permission to reuse someone else's text or images.

zh-HK: 當你明確發布攻略後，訪客便可閱讀已發布內容及公開作者資料。保存私人草稿與發布是兩回事。選取「發布結構化版本」前，請先核對已保存的攻略內容。發布較新版本不會改寫旅客已有的私人副本。發布操作本身並不授予你重用他人文字或圖片的權利。

#### G02 — Private notes and selected photos

EN: Your private trip notes and photos are separate from published author content. A photo you select for a read-only share becomes visible through that link. Check the selected photos and public fields before sharing; do not include personal information or images you are not entitled to disclose. A private upload is not permission to publish it.

zh-HK: 私人行程筆記及照片與作者已發布內容分開。你選取作唯讀分享的照片，會透過該連結供人查看。分享前請核對所選照片及公開欄位，勿加入你無權披露的個人資料或圖片。私人上載並不等於獲准公開。

#### G03 — Read-only sharing and copy limits

EN: Anyone holding an active read-only link can view the selected titles and photos. Check the displayed expiry and share the link only with people you intend to receive it. Private notes, receipts and account information are excluded from that view. A confirmed revocation stops new access through that link; expiry or revocation cannot recall downloaded copies or erase other account records.

zh-HK: 任何持有有效唯讀連結的人均可查看所選名稱及照片。請核對顯示的到期時間，並只把連結交給你打算分享的對象。該畫面不包括私人筆記、收據及帳戶資料。確認撤銷後，便不能再透過該連結取得新存取；但到期或撤銷均不能收回已下載副本，亦不會刪除其他帳戶紀錄。

#### G04 — Consent, image rights and evidence limits

EN: Before publishing or sharing, check that you own or have appropriate permission for the text and photos, and any consent needed for identifiable people. Keep the permission record privately. Attribution, a public URL, collaboration acceptance or a completed readiness checklist does not establish those rights. If permission is uncertain, keep the content as a private draft.

zh-HK: 發布或分享前，請確認你擁有文字及照片的權利，或已取得適當授權，並已取得可識別人士所需的同意。請私下保存授權紀錄。註明來源、提供公開網址、獲接納參與合作或完成發布條件檢查，都不能證明你已取得相關權利。如授權未明，請保留為私人草稿。

#### G05 — Language, provenance and guide limits

EN: Author content stays in the language supplied; changing the interface language does not automatically translate it. A publication date is not a place-verification date. Missing opening hours, prices, source language or verification dates remain unknown. Check the original source and current provider information before relying on a guide; a saved guide is not a booking or availability guarantee.

zh-HK: 作者內容保留提交時的語言；切換介面語言不會自動翻譯內容。發布日期並不等於地點查核日期。欠缺的營業時間、價格、原文語言或查核日期仍屬未知。採用攻略前，請核對原始來源及服務提供者的最新資訊；保存攻略不代表已訂位或保證供應。

### Support notices and human replies

#### S01 — Support channel and hours

EN: For general help, use ⟦D02.support_channel⟧. Support is staffed ⟦D02.support_hours⟧, in Hong Kong time. When account support is available, you can open or follow a case in Your support cases. A saved case does not mean a staff member has read it. Privacy access and correction requests should use the privacy contact in Privacy information; their statutory deadlines are separate.

zh-HK: 一般查詢請使用 ⟦D02.support_channel⟧。支援當值時段為香港時間 ⟦D02.support_hours⟧。帳戶支援可用時，你可在「你的客服案件」建立或跟進案件。案件已保存並不代表客服人員已閱讀。查閱及更正個人資料的要求，請使用「私隱資訊」內的私隱聯絡方式；相關法定期限另行計算。

#### S02 — Collaboration support collection context

EN: We use the collaboration name and reference, together with the subject and message you send, to understand and follow up this enquiry. Include only details needed for the issue. Your case does not publish delivery evidence or change who may view it. Collaboration review, payment and refund decisions remain separate from support handling.

zh-HK: 我們會使用合作名稱及參考編號，以及你送出的主題和訊息，了解和跟進這次查詢。請只加入處理問題所需的資料。建立案件不會公開交付證明，亦不會改變可查看證明的人士。合作審核、付款及退款決定，均與支援案件的處理分開。

#### S03 — Support unavailable

EN: Support requests are not connected here yet. Signing in cannot enable this service. You can still browse published guides or check the workspace directory. For an existing booking, use the provider and reference on your original confirmation. This site does not accept bookings or payments.

zh-HK: 支援要求服務尚未接通，登入亦不能啟用這項服務。你仍可瀏覽已發布攻略，或查看工作區導覽。已有訂位請按原有確認，向相關服務提供者查詢並提供參考編號。本網站目前不接受訂位或付款。

#### S04 — Device draft saved

EN: This draft is kept on this device for this account. It is not confirmation that support has received it. Keep your unsent text until you see a confirmed case or reply in your account.

zh-HK: 這份草稿已按此帳戶保存在這個裝置。這不代表客服已收到內容。在帳戶內看到案件或回覆已確認保存前，請保留未送出的文字。

#### S05 — Submission outcome unknown

EN: We could not confirm whether your request was saved. Keep this page open and retain your text. Use Retry the same request to check the original attempt. Do not create a new case or send a second copy while its outcome is unclear. If you need help, refer to the original case if one is already shown.

zh-HK: 我們未能確認這次要求是否已保存。請保持本頁開啟並保留文字，使用「重試相同請求」核對原來的提交。結果未明前，請勿另建案件或再送一份。如需協助，若畫面已有原案件編號，請沿用該編號跟進。

#### S06 — Case acknowledgement after confirmed receipt

EN: Your request has been recorded as {{case_reference}}. You can follow it in Your support cases. This confirms the case was saved; it does not confirm that a staff member has reviewed it.

zh-HK: 你的要求已記錄為 {{case_reference}}，可在「你的客服案件」跟進。這只確認案件已保存，並不代表客服人員已審閱。

#### S07 — Reply acknowledgement after confirmed receipt

EN: Your reply has been recorded in case {{case_reference}}. It is available in that case's conversation. This confirms the reply was saved; review by support is separate.

zh-HK: 你的回覆已記錄於案件 {{case_reference}}，可在該案件對話查看。這只確認回覆已保存；客服審閱屬另一個步驟。

#### S08 — Case changed

EN: This case has changed. Reload to read its latest replies and status, then review your saved draft before sending. Reloading the case is not confirmation that an earlier attempt was received. If that attempt is still uncertain, use Retry the same request.

zh-HK: 這個案件已有變動。請重新載入查看最新回覆及狀態，再核對保留的草稿才提交。重新載入案件並不代表較早的提交已收到。如該次提交結果仍未明，請使用「重試相同請求」。

#### S09 — Support requests limited details

EN: For case {{case_reference}}, please provide {{requested_detail}} so we can {{why_needed}}. Reply in this case and include only the requested information. Do not send your password or sign-in codes. We will review the additional information before confirming a next step.

zh-HK: 就案件 {{case_reference}}，請提供 {{requested_detail}}，以便我們 {{why_needed}}。請在本案件內回覆，並只提供所要求的資料，切勿提交密碼或登入驗證碼。我們會先查核補充資料，再確認下一步。

#### S10 — Support resolution reply

EN: For case {{case_reference}}, we have completed {{verified_action}}. {{remaining_action_or_no_further_action}}. We are closing this support case on that basis. This does not itself approve a collaboration, change financial records, make a payment or promise a refund.

zh-HK: 就案件 {{case_reference}}，我們已完成 {{verified_action}}。{{remaining_action_or_no_further_action}}。我們會按上述結果結束這個支援案件。這項結案本身不會核准合作、更改財務紀錄、安排付款或承諾退款。

### Measurement choice

#### T01 — Optional measurement choice

EN: Allow optional activity counts and page experience measurements to help us understand use and improve performance? These measurements use random or pseudonymous identifiers and exclude private trip text and messages. You can decline or later change this choice in Measurement preference. This preference covers these optional measurements; account, recovery and service operation records are handled separately. See Privacy information for the approved service, data-use and retention details.

zh-HK: 是否允許自選的活動次數及頁面體驗量測，協助我們了解使用情況和改善效能？這些量測使用隨機或假名識別碼，不包括私人行程文字及訊息。你可拒絕，或稍後在「量測選擇」更改決定。此選擇適用於上述自選量測；帳戶、恢復及服務運作紀錄另行處理。經核准的服務、資料用途及保留安排詳見「私隱資訊」。

#### T02 — Measurement refusal confirmed

EN: Optional measurement is off in this browser. This does not delete measurements already collected or change another device's choice. Contact the privacy owner in Privacy information if you want to ask about existing records.

zh-HK: 這個瀏覽器已關閉自選量測。這不會刪除先前已收集的量測紀錄，亦不會更改其他裝置的選擇。如欲查詢已有紀錄，請按「私隱資訊」聯絡私隱負責人。

### Privacy-rights human reply templates

#### R01 — Privacy request receipt template

EN: We received your privacy request on {{received_at_HKT}}. Your reference is {{case_reference}}. This acknowledges receipt only. We will assess the request and, if necessary, ask for limited information to confirm identity, authority or the records concerned. The receipt date and applicable statutory deadline will be recorded separately from support response targets.

zh-HK: 我們已於香港時間 {{received_at_HKT}} 收到你的私隱要求，參考編號為 {{case_reference}}。本訊息只確認收妥。我們會評估要求，並在有需要時索取有限資料，以核實身份、授權或涉及的紀錄。收件日期及適用法定期限會另行記錄，不會以一般支援回覆目標代替。

#### R02 — Limited identity/authority clarification

EN: To handle privacy request {{case_reference}} without disclosing another person's data, please complete {{minimum_verification_step}} through the published privacy contact. We need this to {{verification_reason}}. Do not post identity documents publicly or send passwords or sign-in codes. We will explain any effect on the request in accordance with the applicable statutory requirements.

zh-HK: 為免披露他人的資料，處理私隱要求 {{case_reference}} 前，請透過已刊載的私隱聯絡方式完成 {{minimum_verification_step}}。此步驟是為了 {{verification_reason}}。請勿公開張貼身份證明，亦勿提供密碼或登入驗證碼。如對要求的處理有任何影響，我們會按適用法定要求說明。

#### R03 — Statutory delay notice template

EN: Your request {{case_reference}} was received on {{received_at_HKT}}. We cannot fully comply with {{remaining_scope}} within the applicable 40-day period because {{specific_reason}}. We have completed or supplied {{part_possible_within_period}}. We will complete the remainder as soon as practicable and contact you through the agreed channel. This notice does not close your request.

zh-HK: 你的要求 {{case_reference}} 已於香港時間 {{received_at_HKT}} 收到。由於 {{specific_reason}}，我們未能在適用的 40 日期限內全部依從 {{remaining_scope}}。我們已在期限內完成或提供 {{part_possible_within_period}}，並會在切實可行範圍內盡快完成餘下部分，透過已協定渠道聯絡你。本通知不代表要求已結案。

#### R04 — Privacy action/result reply

EN: For privacy request {{case_reference}}, we have completed {{verified_action_and_data_scope}}. {{remaining_records_reason_and_backup_position}}. {{secure_result_or_next_step}}. This confirms only the actions described; it is not a statement that all copies everywhere have been erased.

zh-HK: 就私隱要求 {{case_reference}}，我們已完成 {{verified_action_and_data_scope}}。{{remaining_records_reason_and_backup_position}}。{{secure_result_or_next_step}}。本回覆只確認已說明的操作，並不表示所有地方的副本均已刪除。

#### R05 — Privacy refusal notice template

EN: For privacy request {{case_reference}}, we cannot comply with {{refused_scope}} because {{specific_statutory_ground_and_reason}}. {{other_data_user_name_and_address_if_required}}. {{available_next_step}}. This notice concerns only the stated scope. Please use the published privacy contact if you need clarification.

zh-HK: 就私隱要求 {{case_reference}}，由於 {{specific_statutory_ground_and_reason}}，我們未能依從 {{refused_scope}}。{{other_data_user_name_and_address_if_required}}。{{available_next_step}}。本通知只涉及上述範圍。如需進一步說明，請使用已刊載的私隱聯絡方式。

## Reviewer-only change from the existing notice

| Current source notice / behaviour | Proposed copy delta; nothing activated |
|---|---|
| Incomplete-policy warning; missing dedicated privacy contact | P01–P08 supply real draft PPS/PICS paragraphs and tightly scoped fact slots. Keep the warning until the complete paired policy and contact are approved and verified. |
| Connected-account versus local-demo explanation | P09 retains the distinction and explains device drafts versus account erasure. No invented data location or provider configuration. |
| Generic publishing/private-data and support language | G01–G05 and S02 explain actual public audiences, selected photos, rights/proof limits and collaboration context. No automatic publication, evidence attachment or extra collection. |
| Generic retry/confirmation text; local decline can precede server response | S04–S08 separate drafts, unknown writes, receipt and conflict. T02 is proposed **only** for confirmed consent state; existing local UI state cannot substantiate it by itself. Later implementation/verification is separately authorised. |
| No approved staffed channel, retention or processor register | S01 and P05–P07 use approval slots. Human R/S templates add no sender, queue, automation, payment/refund authority or approved deadline promise. |

## Activation gates and rollback — not an activation request

| Gate | Required evidence before affected copy can be activated | Current state |
|---|---|---|
| G-POLICY | D01–D03 factual slots resolved; actual operator/privacy/support/data owners approve their portions; EN and zh-HK legal/content review; version, effective date, environment and private approval references recorded; no unresolved brackets. Collection notices accessible before existing submissions. | **BLOCKED_POLICY / UNAPPROVED** |
| G-CONTENT | Real author publication/use permission and image/person-rights evidence reviewed for the exact content/version, with private references; public fields independently checked. Readiness, synthetic fixtures and this copy do not prove rights. | **BLOCKED — real consent/image rights missing** |
| G-SUPPORT | Verified channel and staffing/absence owner; separately authorised receipt/handover drill; original recipient/account reads the correct confirmed case/reply; privacy clock and human reply handling demonstrated. | **BLOCKED / NOT_RUN** |
| G-MEASURE | Verify actual enabled services/configuration, actual data and necessary-versus-optional purposes, provider uses/regions/retention; consent allow/decline/withdrawal and failed-response behaviour checked in exact authorised target. Seven-day consent validity does not settle retention. | **BLOCKED / NOT_RUN** |
| G-RECOVERY | Preserve original requestId/payload/revision/scope and receipt during unknown writes; do not unlock, clear or resubmit under a new ID on a failed read. Later exact-cohort recovery drills require their own D04–D06 scope. A disposable local Docker restore is not production recovery evidence. | **Preparation only; hosted actor/recovery NOT_RUN** |
| G-TARGET | Bind candidate, independent Preview, **existing Remix-Kinnso** backend identity/owner and exact bounded synthetic cohort; prove role/company and shared-target boundaries under the separate D04–D06 plan. No new project or inferred independent cloud staging. | **Management/DNS only; purpose/configuration/roles UNVERIFIED; no client created** |

Rollback for any later authorised activation: restore the last reviewed information notice and safe disabled-service exits if a contact, fact, permission or consent signal proves wrong; preserve existing cases, receipts, drafts, immutable guide versions, inbox/deduplication history and rights-request records. Restoring copy does not undo publication, erase personal data or undo an external send. Service/configuration rollback, content takedown and data deletion each need their own authorised action and verified outcome.

This handoff changes only these two review files. No app behaviour, flags, hosted target, message, schedule, real guide or data state is changed. Review checks are limited to the two-file diff, UTF-8 bilingual text, matching copy IDs/text and source/route placement; runtime acceptance and all activation gates above remain as recorded.
