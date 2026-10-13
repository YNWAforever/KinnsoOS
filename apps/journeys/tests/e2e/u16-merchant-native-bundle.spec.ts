import {test,expect} from '@playwright/test';

// Actual production Next server and emitted Next chunks. No actor/HTTP doubles.
for(const locale of ['en','zh-HK'])test(`P16 ${locale}: signed-out Merchant route defers company panels in the actual Next build`,async({page})=>{
 const bodies:Promise<string>[]=[];
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(response.status()===200&&path.startsWith('/_next/static/chunks/')&&path.endsWith('.js'))bodies.push(response.text());});
 const response=await page.goto('/'+locale+'/merchant');expect(response?.status()).toBe(200);
 expect(response?.headers()['cache-control']).toContain('private');expect(response?.headers()['cache-control']).toContain('no-store');
 await expect(page.getByRole('heading',{name:locale==='en'?'Merchant workspace':'商戶工作區',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:locale==='en'?'Sign in to continue':'登入後繼續',exact:true})).toBeVisible();
 await page.waitForLoadState('networkidle');const javascript=(await Promise.all(bodies)).join('\n');expect(javascript.length).toBeGreaterThan(1000);
 for(const marker of ['Invite a company colleague','Deliverable review feedback'])expect(javascript.includes(marker),`Signed-out Merchant must defer ${marker}`).toBe(false);
 await expect(page.getByLabel(locale==='en'?'Brief title':'簡報標題',{exact:true})).toHaveCount(0);
});
