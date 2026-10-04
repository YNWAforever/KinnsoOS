# Exact migration transaction guards

`migration-release.mjs` is a pure utility used by an operator-owned release
executor. It opens no database connections and creates no approval records.
Run its tests with `node --test tooling-tests/migration-release.test.mjs`.

The executor must supply the reviewed file names, individual SHA256 values,
envelope SHA256, source revision, exact project and scope, and the direct human
answer to its precise approval question. Approval and recovery evidence are
separate gates. Recovery requires a verified consistent export no older than one
hour, a successful isolated restore, and the failure/commit/postcheck rehearsal
for those same bytes and backup. Historical rehearsals remain useful evidence but
do not satisfy that freshness gate.

`freezeCandidate` checks the ordered file set and rejects transaction controls,
psql commands, stdin COPY and ambiguous string escapes. `buildMigrationTransaction`
wraps the frozen SQL in one transaction, serializes participating executors with
an advisory lock, and verifies the baseline and final catalog before COMMIT. The
catalog query is trusted operator-supplied SQL: review it, bind its hash in the
rehearsal, and include effective authorization, owners, grants, RLS, definitions,
role flags and memberships in its scope. This module is not a SQL sandbox.

The executor must persist an exclusive execution claim before sending the
transaction. Any client failure, missing acknowledgment or timeout requires
read-only reconciliation. Keep that claim after failures; never automatically
replay the transaction. Even a confirmed client COMMIT requires a fresh read-only
final-catalog check. Catalog checks do not prove production user acceptance or
recovery of Storage object bytes, provider settings and external secrets.
