const categories = {
  "setup": [
    "Setup",
    "設定"
  ],
  "execution": [
    "Execution",
    "執行"
  ],
  "cohort": [
    "Participant cohort",
    "參與組別"
  ],
  "content": [
    "Content",
    "內容"
  ],
  "collaboration": [
    "Collaboration",
    "協作"
  ],
  "traveller": [
    "Traveller journey",
    "旅客流程"
  ],
  "manual": [
    "Manual verification",
    "人工驗證"
  ]
} as const;
const messages = {
  "pilot.readiness.run_missing": ["setup", "Pilot run record is missing.", "缺少試行計劃紀錄。"],
  "pilot.readiness.classification_unknown": ["setup", "Run classification is missing or invalid.", "缺少有效的計劃分類。"],
  "pilot.readiness.source_missing": ["setup", "A valid environment origin is missing.", "缺少有效的環境來源網址。"],
  "pilot.readiness.release_missing": ["setup", "Candidate release identifier is missing or invalid.", "缺少有效的候選版本識別碼。"],
  "pilot.readiness.capability_disconnected": ["setup", "Pilot service is disconnected.", "試行計劃服務尚未接通。"],
  "pilot.readiness.owners_missing": ["setup", "Coordinator, support, privacy, alert or private channel references are missing.", "缺少協調員、客服、私隱、警報或私人渠道參照。"],
  "pilot.readiness.notices_unpinned": ["setup", "Participation, privacy or content consent version is missing.", "缺少參與、私隱或內容同意版本。"],
  "pilot.readiness.rehearsal_missing": ["setup", "A completed rehearsal for this release is missing.", "缺少此版本的已完成演練紀錄。"],
  "pilot.readiness.run_not_beginable": ["setup", "This run cannot begin from its current status.", "目前狀態無法開始計劃。"],
  "pilot.readiness.run_not_running": ["execution", "The run is not in execution.", "計劃未在執行中。"],
  "pilot.readiness.acceptance_start_missing": ["execution", "Acceptance start time is missing.", "缺少驗收開始時間。"],
  "pilot.readiness.server_evaluation_required": ["execution", "Server readiness evaluation is missing.", "缺少伺服器就緒評估。"],
  "pilot.readiness.required_traveller_missing": ["cohort", "Required traveller slot is missing.", "缺少必要旅客名額。"],
  "pilot.readiness.required_creator_missing": ["cohort", "Required creator slot is missing.", "缺少必要創作者名額。"],
  "pilot.readiness.required_merchant_missing": ["cohort", "Required merchant slot is missing.", "缺少必要商戶名額。"],
  "pilot.readiness.required_traveller_not_ready": ["cohort", "Required traveller slot lacks active membership, account link or consent.", "必要旅客名額缺少有效身分、帳戶連結或同意。"],
  "pilot.readiness.required_creator_not_ready": ["cohort", "Required creator slot lacks active membership, account link or consent.", "必要創作者名額缺少有效身分、帳戶連結或同意。"],
  "pilot.readiness.required_merchant_not_ready": ["cohort", "Required merchant slot lacks active membership, account link or consent.", "必要商戶名額缺少有效身分、帳戶連結或同意。"],
  "pilot.readiness.distinct_auth_users": ["cohort", "Required slots do not have distinct verified accounts.", "必要名額未各自連結不同的已核實帳戶。"],
  "pilot.readiness.creator_public": ["content", "Public creator profile evidence is missing.", "缺少公開創作者個人檔案證據。"],
  "pilot.readiness.guide_not_exact": ["content", "Published guide does not match its approved draft.", "已發布指南與已批准草稿不符。"],
  "pilot.readiness.guide_binding_duplicate": ["content", "A guide is linked to more than one intake.", "同一指南已連結多份內容提交。"],
  "pilot.readiness.published_guides_missing": ["content", "Required approved guide publication records are missing.", "缺少必要的已批准指南發布紀錄。"],
  "pilot.readiness.mission_binding_missing": ["collaboration", "Campaign binding record is missing.", "缺少活動連結紀錄。"],
  "pilot.readiness.merchant_approved": ["collaboration", "Merchant approval evidence is missing.", "缺少商戶批准證據。"],
  "pilot.readiness.mission_published": ["collaboration", "Campaign publication evidence is missing.", "缺少活動發布證據。"],
  "pilot.readiness.application_active": ["collaboration", "Active creator application evidence is missing.", "缺少有效創作者申請證據。"],
  "pilot.readiness.submission_approved": ["collaboration", "Final approved submission evidence is missing.", "缺少最終提交批准證據。"],
  "pilot.readiness.submission.approved": ["collaboration", "Notification for the final approved submission is missing.", "缺少最終提交獲批准的通知。"],
  "pilot.readiness.notification_acknowledged": ["collaboration", "Acknowledgement of the final approval notification is missing.", "缺少最終批准通知的確認紀錄。"],
  "pilot.readiness.guide_discovered": ["traveller", "Guide discovery evidence is missing.", "缺少發現指南的證據。"],
  "pilot.readiness.guide_saved": ["traveller", "Guide save evidence is missing.", "缺少儲存指南的證據。"],
  "pilot.readiness.trip_adopted": ["traveller", "Trip adoption evidence is missing.", "缺少採用行程的證據。"],
  "pilot.readiness.trip_revised": ["traveller", "Trip revision evidence is missing.", "缺少修訂行程的證據。"],
  "pilot.readiness.trip_recovered": ["traveller", "Trip recovery evidence is missing.", "缺少復原行程的證據。"],
  "pilot.readiness.support_resolved": ["traveller", "Support resolution evidence is missing.", "缺少客服問題解決證據。"],
  "pilot.readiness.support_acknowledged": ["traveller", "Support response acknowledgement is missing.", "缺少客服回覆確認紀錄。"],
  "pilot.readiness.privacy_support": ["manual", "Privacy and support review evidence is missing.", "缺少私隱與客服審核證據。"],
  "pilot.readiness.alert_owner": ["manual", "Alert routing and owner evidence is missing.", "缺少警報傳送及負責人證據。"],
  "pilot.readiness.physical_ios": ["manual", "Physical iOS device evidence is missing.", "缺少 iOS 實體裝置證據。"],
  "pilot.readiness.physical_android": ["manual", "Physical Android device evidence is missing.", "缺少 Android 實體裝置證據。"],
  "pilot.readiness.voiceover": ["manual", "VoiceOver verification evidence is missing.", "缺少 VoiceOver 驗證證據。"],
  "pilot.readiness.nvda": ["manual", "NVDA verification evidence is missing.", "缺少 NVDA 驗證證據。"],
} as const;

type MessageKey = keyof typeof messages;
export type PilotExportBlocker = { code: string; category: keyof typeof categories; messageKey: MessageKey };

export function pilotBlockerCopy(blocker: { code: string; category: string; messageKey: string }) {
  if (!Object.hasOwn(messages, blocker.messageKey)) return null;
  const messageKey = blocker.messageKey as MessageKey;
  const [category, en, zh] = messages[messageKey];
  const code = messageKey.slice('pilot.readiness.'.length);
  if (blocker.code !== code || blocker.category !== category) return null;
  return { categoryLabel: categories[category], explanation: [en, zh] as const,
    exportBlocker: { code, category, messageKey } satisfies PilotExportBlocker };
}
