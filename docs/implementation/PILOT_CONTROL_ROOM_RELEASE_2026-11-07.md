# Pilot Control Room — PR #115 merged release validation

**BLOCKED_RELEASE_VALIDATION. Production unchanged; deployment unverified. Public launch HOLD. Backup/restore waived.**

Exact merge `0e11273cd38a30894fdb27806d638ef7f26e5fca`, tree `5f7f4b9452f2f00313929458169bff92994e7217`, default Journeys build `CxuAq9aL7EwEkvqLhO6Op`. Its parents are `42776e9d9e6e9a0c31898cefe8365ba2065e079d` (PR #115) and `cb35e38a38e2ea8ce046a07dc4e19e00aceee3a8` (main). The merge retains homepage-to-studio planning, Conversation Studio, Discovery, local auth and navigation, pilot publishing gates, and PR #115 regressions. On replay, the pilot migration patches the underlying writer while retaining the Studio confirmation wrapper.

| Check | Result |
|---|---|
| Conflict-focused | 59 passed, 0 failed, 0 skipped |
| Full Journeys unit | 1977 passed, 0 failed, 2 skipped |
| Full web tests | 3316 passed, 0 failed, 44 skipped |
| Root tooling and workspace packages | 110 passed, 0 failed, 2 skipped; 427 workspace package tests passed |
| Typecheck and Journeys default build | See exact process receipts in JSON |
| Web build | Default: webBuild=1; Webpack: webWebpack=0 |
| Source package | 11 passed, one Windows symlink skip; 921 manifest inputs |
| Isolated schema | 234 migrations through `20261108134500` |
| Release integrations | 74 passed, 0 failed, 0 skipped |
| Advisors | 68 warnings; 1 added, 0 removed |
| Exact connected Chromium | 349 passed, 36 failed, 0 skipped, 1 not run; served identity verified: True; no retries or server reuse |
| Native, Studio fixture and presentation | 150 passed, 0 failed, 0 skipped, 0 not run; 13 passed, 0 failed, 0 skipped, 0 not run; 77 passed, 0 failed, 0 skipped, 0 not run |
| Cleanup | 0 residue across 44 tracked tables; new-domain residue 0 across 25 tables; Storage and all additional fixture checks zero; Auth restored: True; no post-test reset |

| Artifact | SHA-256 | Byte basis |
|---|---|---|
| Runtime ZIP | `2b0c16f3a9ec8ca36c751cf48f77449c60ad46d47293f48dc53ec539209f1db4` | Exact build ZIP bytes, checkout members |
| Canonical ZIP | `e2406aa50968e662b23c3d50996ec41b0419fdd95e3b5f31a98c15760f59b10c` | Exact ZIP bytes, Git-blob members |
| Git tree ZIP | `76887bcaeb6e14caae5eaab62a1aca11d923b90bfd8538e292ad646e1e6547e8` | Exact Git archive bytes |
| Migration ZIP | `b5849211fb3bd7f501145a1cb00f71302c9e76ffb3c62b40d96202d47a319df8` | Exact Git migration archive bytes |
| Manifest | `6cf0fc2f6f69b4b9477f645405ed4a8855460d3bd62780f625bd77fb7af1c7af` | Exact Git-blob bytes |
| All migrations | `51f2b32fc36c45ec60c9a6f028e34bd22c57c4d461fd63cf297b281ac2750786` | Version, filename and SHA-256 separated by spaces, LF per row |

The connected matrix retained all 100 unchanged case identities from the previous 102-case packet. The two replaced identities are mapped to main's expanded editor and role-entry coverage. One share recovery case failed its fresh-owned-CI precondition on this isolated target; its companion did not run. The Discovery native browser configuration needed an occupied port; five isolated Discovery database tests ran and the gate was restored.

The [JSON packet](PILOT_CONTROL_ROOM_RELEASE_2026-11-07.json) contains every migration hash, browser case reconciliation, package counts and saved evidence hashes. Real participation, physical-device and assistive-technology checks remain blocked. Nothing was pushed, deployed or changed in production.

Open local validation gates: connected, discoveryNative.
