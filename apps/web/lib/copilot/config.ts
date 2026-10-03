/** True when the Vercel AI Gateway has credentials available (key locally, OIDC on Vercel). */
export function isCopilotConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY) || process.env.VERCEL === '1'
}
