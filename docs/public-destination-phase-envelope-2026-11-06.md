# Public destination discovery phase envelope

Status: **READY_FOR_USER_REVIEW**. This is not a production-release approval.

## Release identity

- Code candidate: `3b48a23b35f74740276e6fcd20b44f7d8a938b1a`.
- Canonical serving project: `kinnso-os.vercel.app`.
- Isolated target: `kinnsoos-public-it-20261106`, loopback API/database ports `59721`/`59722`, app port `3498`.
- Full migration chain: 199 migration versions.
- Connected run: `ffd297c8-43ff-4641-8041-e7c0d5eee9b9`; pass counters were 8 passed, 0 failed, 0 skipped.
- The connected result SHA is identical to the code candidate.

## Accepted route slice

The following public route families are accepted for this phase only:

- articles hub, category listing and article detail;
- creator profile and canonical public guide;
- destination index and detail;
- experience detail and merchant attribution;
- session index and detail.

`/{locale}/experiences/[slug]/booked`, creator/session authoring, operations administration and all unrelated route families remain open release gates. Native route recognition alone is not acceptance.

## Evidence

- Full Journeys suite: 1,409 passed, 2 skipped, 0 failed.
- TypeScript: pass.
- Production-mode webpack build: pass. Default Turbopack was blocked only by this worktree’s external `node_modules` symlink; the hosted build remains a separate target gate.
- Local built-browser destination journey: 28/28 combinations (7 languages × 2 widths × JavaScript off/on), including axe, keyboard focus, reflow and unavailable-state checks.
- Existing local article browser journey: 28/28 combinations.
- Connected browser suite: 8/8 cases, one per language plus withdrawal/suspension/cross-account bookmark isolation.
- Session inventory: present, empty/replay-only and service-failure states exercised locally; connected public session visibility and cancellation denial exercised.
- Visibility: draft, withdrawn, expired, suspended and cancelled public records denied in pages and metadata; duplicate/interruption protection inherited from the existing bookmark contracts.
- Fixture cleanup postcheck: guides 0, experiences 0, sessions 0, articles 0, guide saves 0.
- Backup/restore remains waived, not passed.

## Boundaries

Production remains unchanged. No production database migration, feature-setting change, deployment, old-host retirement, route redirect, role grant or provider activation is included. Paid AI, uploads, booking, payment, payout and external provider execution remain gated.

```json
{
  "schemaVersion": 1,
  "status": "READY_FOR_USER_REVIEW",
  "codeHead": "3b48a23b35f74740276e6fcd20b44f7d8a938b1a",
  "project": "kinnsoos-public-it-20261106",
  "finalTarget": {
    "name": "kinnso-os.vercel.app",
    "productionChanged": false
  },
  "connectedResult": {
    "productHead": "3b48a23b35f74740276e6fcd20b44f7d8a938b1a",
    "passed": 8,
    "expected": 8
  },
  "routes": [
    {"legacyPath":"/{locale}/articles","nativePath":"/{locale}/articles","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/articles/[category]","nativePath":"/{locale}/articles/[category]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/articles/[category]/[url]","nativePath":"/{locale}/articles/[category]/[url]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/c/[handle]","nativePath":"/{locale}/c/[handle]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/destinations","nativePath":"/{locale}/destinations","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/destinations/[slug]","nativePath":"/{locale}/destinations/[slug]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/experiences/[slug]","nativePath":"/{locale}/experiences/[slug]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/g/[slug]","nativePath":"/{locale}/g/[id]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/m/[slug]","nativePath":"/{locale}/m/[slug]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/sessions","nativePath":"/{locale}/sessions","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]},
    {"legacyPath":"/{locale}/sessions/[slug]","nativePath":"/{locale}/sessions/[slug]","disposition":"accepted-public-read","evidenceKinds":["LOCAL_FIXTURE_UI_ONLY","REAL_ISOLATED_TARGET"]}
  ],
  "locales": ["en","zh-HK","zh-tw","zh-cn","ja","ko","th"],
  "browser": {
    "viewports": [390,1280],
    "javaScript": [false,true],
    "keyboard": true,
    "accessibility": true,
    "reflow": true
  },
  "sessions": {"present":true,"absent":true,"failure":true},
  "security": {"withdrawal":true,"suspension":true,"crossAccountIsolation":true,"duplicateProtected":true},
  "tests": {"unit":"PASS","typecheck":"PASS","build":"PASS","fixtureBrowser":"PASS_28","connected":"PASS_8"},
  "backupRestore": "WAIVED"
}
```
