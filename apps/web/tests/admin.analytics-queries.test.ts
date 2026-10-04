import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

const rpcMock = vi.fn()
const supabase = { rpc: rpcMock } as unknown as SupabaseClient<Database>

import { getTravellerAnalyticsReport } from '@/lib/admin/analytics-queries'

describe('getTravellerAnalyticsReport', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('maps aggregate numbers while preserving a NULL rate and insufficient-sample status', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        metric_key: 'booking_conversion',
        locale: 'en',
        entity_type: null,
        booking_state: 'off',
        numerator: '4',
        denominator: '9',
        rate: null,
        sample_count: '9',
        status: 'insufficient_sample',
        attribution_window_days: '7',
      }],
      error: null,
    })

    const report = await getTravellerAnalyticsReport(supabase, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-08T00:00:00.000Z',
    })

    expect(rpcMock).toHaveBeenCalledWith('admin_traveller_analytics_report', {
      p_window_start: '2026-08-01T00:00:00.000Z',
      p_window_end: '2026-08-08T00:00:00.000Z',
    })
    expect(report).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-08T00:00:00.000Z',
      timezone: 'UTC',
      attributionWindowDays: 7,
      rows: [{
        metricKey: 'booking_conversion',
        locale: 'en',
        entityType: null,
        bookingState: 'off',
        numerator: 4,
        denominator: 9,
        rate: null,
        sampleCount: 9,
        status: 'insufficient_sample',
        attributionWindowDays: 7,
      }],
    })
  })

  it('throws an RPC error rather than returning a partial report', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('forbidden') })

    await expect(getTravellerAnalyticsReport(supabase, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-08T00:00:00.000Z',
    })).rejects.toThrow('forbidden')
  })
})
