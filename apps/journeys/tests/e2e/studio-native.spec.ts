import {test,expect} from '@playwright/test';
test('actual Next app preserves neutral home and guest-only local trial with no backend',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/zh-HK');
 for(const audience of ['traveller','creator','merchant'])await expect(page.locator(`[data-audience="${audience}"]`)).toBeVisible();
 await page.getByLabel('想去哪裏、寫甚麼，或讓旅客找到你的店？').fill('PRIVATE_PROMPT 幫我寫 guide brief');await page.getByRole('button',{name:'開始聊聊'}).click();
 await expect(page.getByRole('heading',{name:'撰寫 guide brief'})).toBeVisible();expect(page.url()).not.toContain('PRIVATE_PROMPT');
 await expect(page.getByText('試問文字不會儲存，重新載入會重設。')).toBeVisible();await page.getByLabel('文件名稱',{exact:true}).fill('自己的筆記');await page.getByLabel('文件文字',{exact:true}).fill('LOCAL_PRIVATE_NOTE');await page.getByRole('button',{name:'加入文件',exact:true}).click();await page.getByRole('button',{name:'另開 brief',exact:true}).click();await page.getByRole('button',{name:'保存私人 brief',exact:true}).click();await expect(page.locator('.cs-error[role=alert]')).toContainText('保存前請先登入');
 expect(await page.evaluate(()=>Object.values(localStorage).some(value=>String(value).includes('LOCAL_PRIVATE_NOTE')))).toBe(false);expect(errors).toEqual([]);
 await page.screenshot({path:'../../docs/implementation/evidence/conversation-studio/native-guest.png',fullPage:true});
});
test('native routes retain original workspaces and unavailable connections',async({page})=>{await page.goto('/zh-HK/settings/connections');await expect(page.getByRole('heading',{name:'已連接帳號'})).toBeVisible();await expect(page.getByText('WhatsApp Business',{exact:true})).toBeVisible();await page.goto('/zh-HK/credits');await expect(page.getByRole('link',{name:'GNU GPL v3'})).toBeVisible();await page.goto('/zh-HK/workspace');await expect(page.locator('main')).toBeVisible();});
