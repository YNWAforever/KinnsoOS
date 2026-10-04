import { describe, expect, it, vi } from 'vitest'
import { getReviewQueue, getReviewQueuePage, getMissionDetail } from '@/lib/admin/mission-review-queries'
const row={submissionId:'s1',missionId:'m1',missionTitle:'Mission One',missionType:'coupon_affiliate',creatorId:'c1',status:'submitted',submittedAt:null,reviewDeadline:null,confidenceStatus:'verified_signal'}
const cursor={bucket:0,deadline:'infinity',id:'s1',scope:'server-filter-digest'}
function client(error: unknown=null) {
 const rpc=vi.fn(async()=>({data:{items:[row],nextCursor:cursor},error}))
 const chain=(data:unknown)=>{const c={select:()=>c,eq:vi.fn(()=>c),order:()=>c,maybeSingle:async():Promise<{data:unknown;error:null}>=>({data,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return c}
 const tables={missions:chain({id:'m1',title:'Mission One',status:'published',mission_type:'coupon_affiliate',mission_source:'merchant',merchant_profile_id:'merchant',auto_approve_policy:'off'}),mission_participants:chain([]),mission_milestones:chain([])}
 return {rpc,from:vi.fn((name:keyof typeof tables)=>tables[name]),tables}
}
describe('review queue DB contract',()=>{
 it('passes filters and cursor to a bounded DB page and preserves server confidence ordering',async()=>{
  const c=client();expect(await getReviewQueuePage(c as never,{missionId:'m1',status:'submitted'},cursor)).toEqual({items:[row],nextCursor:cursor});
  expect(c.rpc).toHaveBeenCalledWith('get_kinnso_review_queue',{p_filter:{missionId:'m1',status:'submitted'},p_cursor:cursor,p_limit:50});expect(c.from).not.toHaveBeenCalled()
 })
 it('keeps the legacy array adapter while surfacing backend errors',async()=>{expect(await getReviewQueue(client() as never)).toEqual([row]);await expect(getReviewQueuePage(client({message:'schema unavailable'}) as never)).rejects.toEqual({message:'schema unavailable'})})
 it('pushes mission filtering into the DB before reading detail submissions',async()=>{const c=client();const detail=await getMissionDetail(c as never,'m1');expect(detail?.submissions).toEqual([row]);expect(c.rpc).toHaveBeenCalledWith('get_kinnso_review_queue',{p_filter:{missionId:'m1'},p_cursor:null,p_limit:50});expect(c.tables.mission_participants.eq).toHaveBeenCalledWith('mission_id','m1');expect(c.tables.mission_milestones.eq).toHaveBeenCalledWith('mission_id','m1')})
 it('does not read submissions for a missing mission',async()=>{const c=client();c.tables.missions.maybeSingle=async()=>({data:null,error:null});expect(await getMissionDetail(c as never,'missing')).toBeNull();expect(c.rpc).not.toHaveBeenCalled()})
})
