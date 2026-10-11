# Creator/Merchant hosted role acceptance — P05

Status: **BLOCKED_TARGET**. These are acceptance cases awaiting a designated, configured staging target and approved synthetic actors. Local/CI fixtures, preview READY and a config exit are separate evidence. No hosted actor has been created or assigned a role by this work.

Every private observation must include `{sourceSha, deploymentId, environment, schemaFingerprint, actorRole, scenarioId, expected, observed, evidence, status}`. Store account identifiers, credentials, original private evidence and contact details privately. Preserve failed and not-run cases. This public matrix has no observed successes.

| Scenario | Actor / expected contract | Status |
| --- | --- | --- |
| H01 | Merchant applicant → moderator approval → owner profile; persisted after reload/new login | NOT_RUN |
| H02 | Owner creates draft/publishes; creator A applies; owner accepts | NOT_RUN |
| H03 | Creator submits evidence; owner requests revision; closes recruitment; accepted creator resubmits; owner approves | NOT_RUN |
| H04 | Creator earnings retains tracked/settled/historical payout distinctions; approval creates no invented settlement/payment | NOT_RUN |
| H05 | Creator B cannot read/write A's participation, evidence or earnings | NOT_RUN |
| H06 | Company owner B cannot read/write A's campaigns, applications, branch or private evidence | NOT_RUN |
| H07 | Marketing can manage authorized public briefs; private proof reads/reviews remain owner-only | NOT_RUN |
| H08 | Clerk remains limited to assigned branch redemption; finance remains limited to authorized financial scope | NOT_RUN |
| H09 | Moderator review reason/history survives a conflict; company membership is not ops authority | NOT_RUN |
| H10 | Role revoked during session: old tab/cursor/export/direct API/RPC loses authority; clear denied private data | NOT_RUN |
| H11 | Lost acknowledgement → reconcile → identical original request/payload; one recorded side effect | NOT_RUN |
| H12 | Saved state survives reload/new login; unsaved drafts/CAS conflicts are understandable and recoverable | NOT_RUN |
| H13 | New registration, confirmation and recovery reach the designated real test mailbox; redirects/cookies verified | NOT_RUN |
| H14 | EN/zh-HK, keyboard, 320px and 200% text; private errors are distinct from zero rows | NOT_RUN |

Run matching owned-success controls alongside denials; preserve existing route-specific 403/404 concealment policies. Use the current source's isolated stories as scenario references, including `u03-u04-collaboration`, `u04-merchant` and `u04-merchant-invitations`. Do **not** point those seed/reset/cleanup suites at hosted staging. Hosted acceptance is a separately authorized bounded procedure with explicit fixture ownership and cleanup decisions.

Next concrete action: pass [P04](CREATOR_MERCHANT_STAGING_CHECKLIST.md), bind candidate/deployment/schema/actors, then record H01–H14 without importing old pass counts. Physical device and screen-reader observations belong to P17 and remain NOT_RUN until measured.
