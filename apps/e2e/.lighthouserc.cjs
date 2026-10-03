// Lighthouse must measure the PUBLIC site. `E2E_BASE_URL` in verify.yml is the
// per-deployment URL, which Vercel deployment protection can put behind SSO —
// Lighthouse would then score an auth page instead. LHCI_BASE_URL lets the
// workflow point this at the stable public alias without disturbing the
// Playwright target, which legitimately wants the exact deployment under test.
const base =
  process.env.LHCI_BASE_URL || process.env.E2E_BASE_URL || 'https://remix-kinnso-web.vercel.app'

module.exports = {
  ci: {
    collect: {
      url: [
        `${base}/en/articles/dining/ramen-guide`, // flagship detail
        `${base}/en/articles/dining`, // listing
        `${base}/en/articles`, // hub
      ],
      // Median of three. A single run on a shared runner is noisy enough that any
      // hard budget built on it would fail for reasons unrelated to a change.
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        // A real gate. CLS is the least runner-variable of the four, and 0.1 is
        // already enforced pre-merge against the hermetic stack
        // (specs/r7-10-accessibility.spec.ts), so this extends a threshold the
        // project already holds itself to onto the deployed site.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        // Still advisory: these three are dominated by runner CPU and network
        // conditions, and there is no recorded baseline for the deployed site to
        // set a defensible ceiling from. Promote each once its warn-level
        // readings have been stable across a few runs.
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
}
