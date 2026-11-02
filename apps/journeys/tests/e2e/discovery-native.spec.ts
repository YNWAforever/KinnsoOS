import {test,expect} from '@playwright/test';
// This tests ONLY disconnected native surfaces, never a native DB/auth/MCP flow.
test('native command/read/receipt endpoints fail closed without any backend',async({request})=>{
 expect((await request.post('/api/discovery/commands',{headers:{Origin:'https://example.invalid'},data:{}})).status()).toBe(403);
 for(const path of ['commands','reads','sources']){const reply=await request.post('/api/discovery/'+path,{headers:{Origin:'http://127.0.0.1:3498','Sec-Fetch-Site':'same-origin'},data:{}});expect(reply.status()).toBe(503);expect(await reply.json()).toMatchObject({ok:false,code:'UNAVAILABLE'});expect(reply.headers()['cache-control']).toContain('no-store');}
 const receipt=await request.get('/api/discovery/requests/11111111-1111-4111-8111-111111111111');expect(receipt.status()).toBe(503);
 expect((await request.get('/api/discovery/requests/not-an-id')).status()).toBe(400);
});
test('real Next homepage retains three audiences, original entrances and disconnected skills',async({page})=>{
 const external:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!=='http://127.0.0.1:3498'){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto('/zh-HK');for(const audience of ['traveller','creator','merchant'])await expect(page.locator(`[data-audience="${audience}"]`)).toBeVisible();
 await page.goto('/zh-HK/settings/connections');await expect(page.getByRole('heading',{name:'已連接帳號'})).toBeVisible();await expect(page.getByText('WhatsApp Business',{exact:true})).toBeVisible();
 await page.goto('/zh-HK/credits');await expect(page.getByRole('link',{name:'GNU GPL v3'})).toBeVisible();expect(external).toEqual([]);expect(errors).toEqual([]);
});
