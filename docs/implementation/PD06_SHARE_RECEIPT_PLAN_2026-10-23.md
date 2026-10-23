# PD06 Share Receipt Implementation Plan

> 執行方式：沿用本 session 已授權的直接實作、TDD、獨立 review及 owned CI，不另開審批循環。

Goal: 旅客可按同一 requestId 安全恢復已提交分享，並於另一個已驗證 owner session 取回同連結。
Architecture: Next BFF server-only AES-GCM envelope；Postgres owner-scoped atomic receipt；既有 SharePreview 及 Supabase Auth。
Spec: PD06_SHARE_RECEIPT_DESIGN_2026-10-23.md。

Global constraints: 無 hosted mutations／new projects／merge／production；原 payload/requestId 重試；fresh permission；explicit public projection；legacy不可假造 receipt；真攻略 rights BLOCKED。
Review focus: key rotation/missing key；expired/revoked late ACK；cross-account guessing；stale read/write lifecycle；concurrent actor quota across trips。

- [ ] 1. Crypto/config RED→GREEN：真 AES-GCM、AAD actor/trip/request fences、tamper/key rotation；獨立 shareRecovery capability。
- [ ] 2. DB receipt contract：新增 migration、fresh actor／owner、same intent replay、跨 trip quota鎖、private ciphertext、read/list/revoke/expired及最小 grants；owned integration 覆蓋。
- [ ] 3. BFF/client：嚴格 requestId／payload、GET receipt/list、加密資料明確投影、cache private/no-store；unit RED→GREEN。
- [ ] 4. SharePreview：v2 hold、同 payload retry、觀察 receipt才settle、server跨 session recovery、legacy hold、late fences；component RED→GREEN。
- [ ] 5. Admission/e2e：對應 manifests、CI-only ephemeral key、fresh owned Auth/RLS/browser lost ACK＋second context、scope/cleanup。
- [ ] 6. Final review／必要回歸、build/typecheck、exact candidate push/PR CI至終態、四欄 ledger／evidence／rollback。

Shared interfaces: ShareIntent carries requestId/tripId/stopIds/mediaIds/expiresAt. ShareReceipt carries id/requestId/state/createdAt/expiresAt/intent/projection/url(null terminal). ShareReceiptPage has items plus nextCursor(createdAt,requestId),20 rows plus lookahead. BFF create accepts one ShareIntent; same browser retry is byte-equivalent input. SQL envelope is server transport only, outside intent digest, so a BFF retry cannot replace the first ciphertext.
