export function guideAdoptionHref(id:string,locale:string,env:Record<string,string|undefined>=process.env):string|null{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return null
 try{
  const origin=new URL(env.KINNSO_JOURNEYS_ORIGIN??'')
  const local=env.KINNSO_ENVIRONMENT==='local'&&['kinnsoos-pilot-20261013','kinnsoos-b1-20261002'].includes(env.KINNSO_TEST_PROJECT??'')&&origin.hostname==='127.0.0.1'
  if(origin.origin!==env.KINNSO_APPROVED_JOURNEYS_ORIGIN||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||(origin.protocol!=='https:'&&!(local&&origin.protocol==='http:')))return null
  const language=['zh-hk','zh-tw','zh-cn'].includes(locale)?'zh-HK':'en'
  return `${origin.origin}/${language}/g/${id}?adopt=1`
 }catch{return null}
}
