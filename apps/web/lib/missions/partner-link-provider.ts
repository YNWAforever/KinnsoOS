import {
  buildSubId,
  canonicalizeTravelpayoutsPartnerUrl,
  createTravelpayoutsPartnerLinks,
} from './travelpayouts'
import type {
  PartnerLinkProvider,
  PartnerLinkProviderResult,
} from './partner-link-command'

export function createTravelpayoutsPartnerLinkProvider(): PartnerLinkProvider {
  return {
    buildSubId,

    async create({ originalUrl, subId }): Promise<PartnerLinkProviderResult> {
      let failureReason = 'no partner link returned'
      try {
        const [link] = await createTravelpayoutsPartnerLinks({
          shorten: true,
          links: [{ url: originalUrl, subId }],
        })
        if (link?.status === 'success' && link.partnerUrl) {
          return {
            ok: true,
            partnerUrl: canonicalizeTravelpayoutsPartnerUrl(link.partnerUrl, subId),
          }
        }
        if (link?.message) failureReason = link.message
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error)
      }
      return { ok: false, reason: failureReason }
    },
  }
}
