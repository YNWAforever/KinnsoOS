# n8n orchestration

## Environment variables

| Variable | Description |
|----------|-------------|
| `APPS_SYNC_URL` | Base URL of the `apps/sync` service (e.g. `https://sync.kinnso.com`) |
| `SYNC_WEBHOOK_SECRET` | HMAC-SHA256 shared secret — must match `SYNC_WEBHOOK_SECRET` in the legacy `.env` |
| `SYNC_ADMIN_TOKEN` | Bearer token for `x-admin-token` header on all `apps/sync` requests |
| Vercel revalidate | Vercel revalidation URL / token used in the incremental flow step 3 (store as a separate credential in n8n) |

## Importing flows

1. In n8n, go to **Workflows → Import from file**.
2. Import each exported JSON from `n8n/flows/` after building the flows in the UI (replace the `.md` spec with the real `.json` export in the same directory).
3. Activate the **incremental** and **drift-sweep** workflows; leave **backfill** inactive (trigger manually).

## Read-only legacy MySQL credential

Create an n8n **MySQL** credential pointing at the legacy database with a **read-only** user. The drift-sweep flow uses this credential for its `SELECT` query only — it never writes to the legacy database.

```
Host:     <legacy DB host>
Port:     3306
Database: <legacy DB name>
User:     kinnso_readonly   # create with GRANT SELECT ON legacy_db.* TO ...
Password: <readonly password>
```

Grant in legacy MySQL:
```sql
CREATE USER 'kinnso_readonly'@'%' IDENTIFIED BY '<password>';
GRANT SELECT ON legacy_db.* TO 'kinnso_readonly'@'%';
FLUSH PRIVILEGES;
```
