# Owned browser accessibility checks

Install the optional pinned auditor with `npm ci --prefix scripts/accessibility --ignore-scripts`. It does not change product runtime dependencies or performance-tool lockfiles.

Run `npm exec playwright test -- --config=playwright.service-state.config.ts u24-pd15-accessibility.spec.ts` for actual React components/CSS with read-only transport and storage fixtures. Run `npm exec playwright test -- --config=playwright.public-entry.config.ts u25-public-accessibility.spec.ts` for real backend-disabled Next routes.

The matrix uses EN/zh-HK and 320/640/1280px. axe-core checks every violation tagged WCAG A/AA through2.2 inside the complete .k-app UI; document language/title/heading are checked separately. No axe rules are disabled. Reports retain incomplete/manual-review findings and passing rule IDs. A zero-violation scan is not complete WCAG or assistive-technology acceptance.

The 200% text probe doubles each element's original computed font size, retaining layout, whitespace, dimensions and colors. It is a native Chromium rendering/reflow probe, not a claim of native browser text-zoom settings, physical iOS/Android, VoiceOver or NVDA acceptance. Keyboard/error/status checks use actual DOM and original component handlers. No command, Auth, SQL, provider, hosted or shared-target fixture is allowed.
