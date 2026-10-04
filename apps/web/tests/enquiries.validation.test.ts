import { describe, expect, it } from 'vitest'
import { validateEnquiryInput } from '@/lib/enquiries/validation'

const CREATOR_ID = '11111111-1111-4111-8111-111111111111'
const valid = {
  type: 'creator_collab',
  targetId: CREATOR_ID,
  name: ' Ada Wong ',
  email: ' ADA@Example.COM ',
  message: ' I would like to discuss a campaign. ',
}

describe('validateEnquiryInput', () => {
  it('normalizes a valid creator enquiry', () => {
    expect(validateEnquiryInput(valid)).toEqual({
      ok: true,
      value: {
        type: 'creator_collab',
        targetId: CREATOR_ID,
        name: 'Ada Wong',
        email: 'ada@example.com',
        message: 'I would like to discuss a campaign.',
      },
    })
  })

  it.each([
    ['bad type', { ...valid, type: 'other' }],
    ['bad uuid', { ...valid, targetId: 'creator-1' }],
    ['blank name', { ...valid, name: ' ' }],
    ['long name', { ...valid, name: 'x'.repeat(121) }],
    ['bad email', { ...valid, email: 'no-at-sign' }],
    ['short message', { ...valid, message: 'hello' }],
    ['long message', { ...valid, message: 'x'.repeat(4001) }],
  ])('%s is invalid', (_label, input) => {
    expect(validateEnquiryInput(input)).toEqual({ ok: false })
  })
})
