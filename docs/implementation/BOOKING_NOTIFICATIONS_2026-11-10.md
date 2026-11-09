# In-app booking notifications

**Status:** deployed and verified in production. Release `acd1cf2`, ledger **250 → 251** (`20261109220000`), deployment `dpl_5NwfFvh4DrRJLiKcw4VPhU9kNQAU`.

## What shipped

Booking state changes now create notifications in the existing inbox (`inbox_events` + the /inbox page), in the same database transaction:

| Event | Recipient | Inbox card |
|---|---|---|
| request submitted | guide's creator | 「你的攻略收到新的預訂申請」→ links to /studio |
| request accepted / declined | traveller | 「創作者已接受你的日期申請」/ declined → links to /requests |
| request withdrawn | guide's creator | 「旅客已撤回預訂申請」→ links to /studio |

No email or external delivery was added; the inbox already states that email delivery is unconfigured.

## Verification

- **Local 8/8** through the real inbox page: request 201, creator notified with unread count 1 and studio link, creator accepts, traveller notified with tracker link, creator notified on withdrawal.
- **Production E2E**: traveller requested a date through the guide-page UI → creator /inbox showed 「你的攻略收到新的預訂申請」with unread badge → creator accepted → traveller /inbox showed 「創作者已接受你的日期申請」with the tracker link. Both screenshots captured.

## Honest limits

In-app only (no email/push), no auto-read or digest, and the verification accounts plus test booking requests remain in production for cleanup.

## Device matrix (the other bullet)

Real device/AT passes still cannot be produced from this environment. The unit is covered by the previous **dated waiver** (backup, privacy, devices, payments) that expires **2026-12-09**; the daily waiver digest will remind the owner, and the launch re-blocks automatically if nothing is recorded or re-waived before then.
