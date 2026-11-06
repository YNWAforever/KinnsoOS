import {test,expect} from '@playwright/test';

const offer='11111111-1111-4111-8111-111111111111';
const bookingSlug=['synthetic','experience'].join('-');
for(const locale of ['en','zh-HK']){
 const chinese=locale==='zh-HK',label=(en:string,zh:string)=>chinese?zh:en;
 test(`U20 ${locale}: safe legacy aliases retain native destinations`,async({request,baseURL})=>{
  for(const [from,to] of [['feed','explore'],['for-merchants','for-business'],['auth/reset-password','reset-password']]){
   const response=await request.get(`/${locale}/${from}`,{maxRedirects:0});
   expect(response.status()).toBe(307);expect(new URL(response.headers().location,baseURL).pathname).toBe(`/${locale}/${to}`);
  }
  const signOut=await request.get(`/${locale}/auth/sign-out`,{headers:{'sec-fetch-site':'cross-site'},maxRedirects:0});
  expect(signOut.status()).toBe(307);expect(new URL(signOut.headers().location,baseURL).pathname).toBe(`/${locale}/sign-in`);
 });
 test(`U20 ${locale}: gated offer and booking pages are explicit rather than 404`,async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+new URL(request.url()).pathname);});
  let response=await page.goto(`/${locale}/offers/${offer}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading',{name:label('Traveller offer claims are disabled','旅客優惠領取暫停'),exact:true})).toBeVisible();
  await expect(page.getByText(label('Merchant offer creation and administrative counters remain connected.','商戶優惠建立及管理計數仍然接通。'),{exact:false})).toBeVisible();
  response=await page.goto('/'+locale+'/experiences/'+bookingSlug+'/booked');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading',{name:label('Booking confirmations are disabled','訂位確認暫停'),exact:true})).toBeVisible();
  await expect(page.locator('main')).not.toContainText(label('payment successful','付款成功'));
  expect(writes).toEqual([]);
 });
}
