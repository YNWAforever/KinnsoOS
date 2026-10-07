# Browser installation gate

At 2026-10-07T21:47Z, these current-source jobs were still in browser installation rather than executing tests:

| Source | Workflow/run | Install start UTC |
|---|---|---|
| 65a81a0 | Journeys37674499554 | 19:29:05 |
| b7c3839 | CI37674553408 | 19:51:57 |
| 587df97 | Journeys37680997547 | 20:21:26 |

Their setup status does not establish a browser-test result. The underlying installation cause is unconfirmed. A new15-minute step timeout bounds Chromium installation in both workflows. It retains the same pinned dependency lockfiles, Chromium, `--with-deps`, existing tests, source-package rebuild and failure artifacts. There is no alternate download host, browser substitution, `continue-on-error`, empty-run success, or test skip.

A timeout fails its job; subsequent tests that did not run remain NOT_RUN. A diagnostic artifact from an earlier integration step is not evidence that browser tests executed. This change does not itself verify Linux installation or the affected test gates; applicable current-head CI must complete and its artifacts must be checked.

Root PR26 separately retains its profile404 failure. The selected-row/anonymous-projection diagnostics in PR28 do not claim that failure is fixed. First-wave local receipts are at012841d / PR27; hosted human acceptance and production configuration/content/SQL remain separate gates.

Rollback reverts these two step timeouts. No provider, runtime flag, production schema, public content or application behavior changes.
