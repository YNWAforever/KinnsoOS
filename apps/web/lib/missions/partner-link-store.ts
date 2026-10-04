import type { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  ExistingPartnerLinkLookup,
  PartnerLinkStore,
  SavePartnerLinkInput,
} from './partner-link-command'
import type {
  AffiliateProgramStatus,
  ParticipantStatus,
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export function createPartnerLinkStore(
  supabase: SupabaseServerClient,
): PartnerLinkStore {
  return {
    async loadParticipant({ missionParticipantId, creatorId }) {
      const { data, error } = await supabase
        .from('mission_participants')
        .select('id, mission_id, creator_id, status')
        .eq('id', missionParticipantId)
        .eq('creator_id', creatorId)
        .maybeSingle()

      return {
        data: data
          ? {
              id: data.id,
              missionId: data.mission_id,
              creatorId: data.creator_id,
              status: data.status as ParticipantStatus,
            }
          : null,
        error,
      }
    },

    async loadMission(missionId) {
      const { data, error } = await supabase
        .from('missions')
        .select('id, affiliate_network_program_id, mission_source, status')
        .eq('id', missionId)
        .maybeSingle()

      return {
        data: data
          ? {
              id: data.id,
              affiliateNetworkProgramId: data.affiliate_network_program_id,
              missionSource: data.mission_source,
              status: data.status,
            }
          : null,
        error,
      }
    },

    async loadProgram(programId) {
      const { data, error } = await supabase
        .from('affiliate_network_programs')
        .select('id, network, status')
        .eq('id', programId)
        .maybeSingle()

      return {
        data: data
          ? {
              id: data.id,
              network: data.network,
              status: data.status as AffiliateProgramStatus,
            }
          : null,
        error,
      }
    },

    async findSuccessfulLink(input: ExistingPartnerLinkLookup) {
      const { data, error } = await supabase
        .from('affiliate_partner_links')
        .select('id, partner_url')
        .eq('network', input.network)
        .eq('mission_id', input.missionId)
        .eq('mission_participant_id', input.missionParticipantId)
        .eq('creator_id', input.creatorId)
        .eq('original_url', input.originalUrl)
        .eq('external_status', 'success')
        .maybeSingle()

      return {
        data: data
          ? { id: data.id, partnerUrl: data.partner_url }
          : null,
        error,
      }
    },

    async savePartnerLink(input: SavePartnerLinkInput) {
      const { data, error } = await supabase.rpc('create_travelpayouts_partner_link', {
        p_affiliate_network_program_id: input.affiliateNetworkProgramId,
        p_mission_id: input.missionId,
        p_mission_participant_id: input.missionParticipantId,
        p_original_url: input.originalUrl,
        p_partner_url: input.partnerUrl,
        p_sub_id: input.subId,
      })
      const row = Array.isArray(data) ? data[0] : data
      return {
        data: row ? { id: row.id, partnerUrl: row.partner_url } : null,
        error,
      }
    },
  }
}
