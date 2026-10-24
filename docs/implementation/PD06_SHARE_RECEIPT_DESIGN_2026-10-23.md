# PD06 durable share receipt／跨 session 恢復

Base: PR87 `42ac09c513022991239d3af088ab7f5062904fc0`。本次 user 已授權 source、本機／owned CI 實作；不新增 cloud project、不 merge／production deploy；原 Remix SQL／secret／role 寫入不在本次範圍。

旅客建立分享前持久化 requestId＋原 trip/stop/media/expiry。BFF 產生 256-bit token，用獨立 server keyring AES-256-GCM 加密；AAD 綁定 actor/trip/requestId。單一 DB 交易鎖 owner trip，依 actor/requestId 比對原 intent、建立 immutable public projection／token hash／加密 receipt；重試同 payload 回原 receipt，換 payload CONFLICT，receipt replay 先於過期／quota／已刪 stop 檢查。不同 requestIds 跨 trip 的 quota 以 actor transaction lock 序列化。

Raw token 不進 SQL、request ledger、metadata list、logs 或 public projection。新 private receipt table 啟用 RLS 並 revoke Data API roles。新 public RPC 用 SECURITY INVOKER 薄 wrapper，僅呼叫獨立 non-exposed `kinnso_share_api` 內受 fresh actor／owner 驗證的 DEFINER functions，不對既有 kinnso_internal schema 開放 USAGE。既有 legacy create/list/revoke/public trip/media handlers 保留。

新 authenticated BFF receipt read／20-row keyset list 只提供本人 trip。active receipt 解密重取同 URL；revoked／expired receipt 回 terminal state、url=null，不復活 token／照片。讀失敗／null receipt 不能解鎖；可明確重試同一 requestId／payload。切 account/trip/disable/unmount 後所有晚回應失效。第二個 browser session 登入同 owner，從 server list 選 receipt 取回，沒有 local storage 亦可；這不是 physical-device／原 Remix hosted 驗收。

舊 v1 session hold 沒有 requestId，及舊 hash-only link 無 ciphertext，無法偽造補 receipt 或 token。它們維持原 metadata revoke／手動恢復路徑。新能力 `shareRecovery` 與 legacy `sharing` 分開：缺失／不合法 keyring 只停止新建立／receipt 解密，舊 owned list/revoke 仍可用；config capability 不代表 account permission，schema:not_checked 保留。

Keys: `KINNSO_SHARE_RECEIPT_ACTIVE_KEY` 是 key ID；`KINNSO_SHARE_RECEIPT_KEYS` 是最多8個 ID→canonical base64 32-byte key 的 JSON。新 receipt 用 active ID；rotation 必須保留舊 key 到相關 receipt 保留期結束。CI 只在已核實 owned target 後產生每 job 的 ephemeral key，寫既有 ignored .env.test；不得拿它作 hosted key。Key 遺失或 auth tag 不符回 UNAVAILABLE，不產生 replacement token。原 Remix key、rotation、backup／restore／retention 操作包是待審輸入，不在本次套用。

選擇：加密 receipt 同交易，避免第二次 token persistence 寫入的 lost-ACK window；不使用可猜 token、明文 token ledger、provider 或新 task engine。rollback 須保留 receipt/key／既有合法分享，先停新 writes，不刪 rows/key。

驗收：同 key concurrent create 只一筆；changed payload conflict；lost ACK GET receipt；fresh session同 URL；private note/photo selection不洩漏；revoke/expiry不復活；foreign/anon/session失效拒絕；quota concurrency；20+ keyset；malformed key/receipt不寫；新/舊 hold及 late response fences；EN/zh-HK、keyboard、320px/200%。
