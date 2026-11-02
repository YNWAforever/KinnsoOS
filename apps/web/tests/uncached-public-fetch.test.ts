import {describe,it,expect,vi} from 'vitest'
import {uncachedPublicFetch} from '../lib/supabase/uncached-public-fetch'

describe('public evidence reads',()=>{
 it('overrides persistent caching and keeps the original request and cancellation',async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
  const signal=new AbortController().signal
  await uncachedPublicFetch(transport)('http://127.0.0.1/example',{method:'POST',body:'{}',headers:{apikey:'example-only'},signal,cache:'force-cache',next:{revalidate:3600}})
  expect(transport).toHaveBeenCalledWith('http://127.0.0.1/example',expect.objectContaining({method:'POST',body:'{}',signal,headers:{apikey:'example-only'},cache:'no-store',next:{revalidate:0}}))
 })
 it('re-reads after revocation instead of retaining an earlier public body',async()=>{
  let active=true
  const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify(active?{title:'example licensed text'}:{title:'restricted'})))
  const read=uncachedPublicFetch(transport)
  expect(await (await read('http://127.0.0.1/example')).json()).toEqual({title:'example licensed text'})
  active=false
  expect(await (await read('http://127.0.0.1/example')).json()).toEqual({title:'restricted'})
  expect(transport).toHaveBeenCalledTimes(2)
 })
})

