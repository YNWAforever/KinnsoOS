import {describe,it,expect} from 'vitest'
import * as adoption from '@/lib/guides/adoption'
const id='11111111-1111-4111-8111-111111111111'
describe('guide to private itinerary handoff',()=>{
 it('carries the published UUID to the explicitly approved planner without session credentials',()=>{
  expect(adoption.guideAdoptionHref(id,'zh-hk',{KINNSO_JOURNEYS_ORIGIN:'https://planner.example',KINNSO_APPROVED_JOURNEYS_ORIGIN:'https://planner.example'})).toBe(`https://planner.example/zh-HK/g/${id}?adopt=1`)
 })
 it('refuses arbitrary URLs, unapproved origins and invalid identities',()=>{
  for(const origin of ['https://planner.example/path','https://user:secret@planner.example','https://evil.test','http://planner.example']){
   expect(adoption.guideAdoptionHref(id,'en',{KINNSO_JOURNEYS_ORIGIN:origin,KINNSO_APPROVED_JOURNEYS_ORIGIN:'https://planner.example'})).toBeNull()
  }
  expect(adoption.guideAdoptionHref('../private','en',{KINNSO_JOURNEYS_ORIGIN:'https://planner.example',KINNSO_APPROVED_JOURNEYS_ORIGIN:'https://planner.example'})).toBeNull()
 })
 it('allows only the existing named local pilot profile for loopback HTTP',()=>{
  const local={KINNSO_JOURNEYS_ORIGIN:'http://127.0.0.1:3481',KINNSO_APPROVED_JOURNEYS_ORIGIN:'http://127.0.0.1:3481',KINNSO_ENVIRONMENT:'local',KINNSO_TEST_PROJECT:'kinnsoos-pilot-20261013'}
  expect(adoption.guideAdoptionHref(id,'ja',local)).toBe(`http://127.0.0.1:3481/en/g/${id}?adopt=1`)
  expect(adoption.guideAdoptionHref(id,'en',{...local,KINNSO_ENVIRONMENT:'production'})).toBeNull()
 })
})
