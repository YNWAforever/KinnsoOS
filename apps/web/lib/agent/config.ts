/** True when the Vercel AI Gateway has credentials available (key locally, OIDC on
 *  Vercel) — identical check to isCopilotConfigured(), duplicated rather than shared
 *  since the two features are deliberately independent (design doc: creator copilot
 *  stays untouched) and this is a two-line check, not worth a shared import that would
 *  couple their config surfaces. */
export function isAgentConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY) || process.env.VERCEL === '1'
}
