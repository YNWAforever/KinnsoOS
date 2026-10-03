import { describe, it, expect } from 'vitest'
import { resumeStep, type JobSnapshot } from '@/lib/onboarding/resumeRoute'

const job = (status: JobSnapshot['status']): JobSnapshot => ({ id: 'job-1', status })

describe('resumeStep', () => {
  it('no creators row yet -> wait', () => {
    expect(resumeStep(null, null, 0)).toBe('wait')
  })
  it('onboarding + no handles -> handles', () => {
    expect(resumeStep('onboarding', null, 0)).toBe('handles')
  })
  it('onboarding + handles + no job -> handles (ready to run)', () => {
    expect(resumeStep('onboarding', null, 2)).toBe('handles')
  })
  it('onboarding + job fetching -> progress', () => {
    expect(resumeStep('onboarding', job('fetching'), 2)).toBe('progress')
  })
  it('onboarding + job analyzing -> progress', () => {
    expect(resumeStep('onboarding', job('analyzing'), 2)).toBe('progress')
  })
  it('onboarding + job queued -> progress', () => {
    expect(resumeStep('onboarding', job('queued'), 2)).toBe('progress')
  })
  it('onboarding + job ready -> review', () => {
    expect(resumeStep('onboarding', job('ready'), 2)).toBe('review')
  })
  it('onboarding + job failed -> retry', () => {
    expect(resumeStep('onboarding', job('failed'), 2)).toBe('retry')
  })
  it('active -> done (regardless of job)', () => {
    expect(resumeStep('active', job('ready'), 2)).toBe('done')
    expect(resumeStep('active', null, 0)).toBe('done')
  })
})
