import {test,expect} from '@playwright/test';

test('the documents detour retains the homepage question without putting it in the URL',async({page})=>{
 await page.goto('/en');
 await page.getByLabel('What would you like to work on?').fill('PRIVATE_DOCUMENT_QUESTION Write my guide');
 await page.getByRole('link',{name:'Choose documents',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Your question',exact:true})).toHaveValue('PRIVATE_DOCUMENT_QUESTION Write my guide');
 expect(page.url()).not.toContain('PRIVATE_DOCUMENT');
});

test('the template picker retains the question and filters all five traveller tasks',async({page})=>{
 await page.goto('/en');
 await page.getByLabel('What would you like to work on?').fill('PRIVATE_TEMPLATE_QUESTION');
 await page.getByRole('link',{name:'All traveller tasks'}).click();
 await expect(page.locator('.cs-template-grid article')).toHaveCount(5);
 await expect(page.locator('.cs-template-grid')).not.toContainText('Write a guide brief');
 await page.locator('.cs-template-grid article').filter({has:page.getByRole('heading',{name:'Organize saved guides',exact:true})}).getByRole('button',{name:'Use this template'}).click();
 await expect(page.getByRole('textbox',{name:'Question',exact:true})).toHaveValue('PRIVATE_TEMPLATE_QUESTION');
 await expect(page.getByRole('heading',{name:'Organize saved guides',exact:true})).toBeVisible();
});

test('leaving the template picker discards its question before a later task',async({page})=>{
 await page.goto('/en');
 await page.getByLabel('What would you like to work on?').fill('PRIVATE_ABANDONED_PICKER');
 await page.getByRole('link',{name:'Task templates',exact:true}).click();
 await page.getByRole('navigation',{name:'Conversation studio navigation'}).getByRole('link',{name:'Explore',exact:true}).click();
 await expect(page).toHaveURL(/\/en\/explore$/);
 await expect(page.getByRole('heading',{name:'Real guides. A clear source.',exact:true})).toBeVisible();
 await page.goBack();
 await page.locator('.cs-template-grid article').filter({has:page.getByRole('heading',{name:'Prepare campaign material',exact:true})}).getByRole('button',{name:'Use this template'}).click();
 await expect(page.getByRole('textbox',{name:'Question',exact:true})).toHaveValue('');
});

test('a traveller can review and copy a manual brief then reach the original workflow',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const mutations:string[]=[];
 page.on('request',request=>{if(request.method()==='POST')mutations.push(request.url());});
 await page.goto('/en');
 await page.getByLabel('What would you like to work on?').fill('PRIVATE_TRIP_QUESTION Share my trip');
 await page.getByRole('button',{name:'Start a conversation'}).click();
 await expect(page.getByRole('heading',{name:'Share or revoke a trip',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Question',exact:true})).toHaveValue('PRIVATE_TRIP_QUESTION Share my trip');
 await page.getByRole('textbox',{name:'Your notes',exact:true}).fill('PRIVATE_TRIP_NOTES: share only the first day');
 await page.getByRole('button',{name:'Review brief',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Prepared brief',exact:true})).toHaveValue(/PRIVATE_TRIP_NOTES/);
 await expect(page.getByText('This brief is not saved. Copy it before leaving or reloading.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Copy brief',exact:true}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('PRIVATE_TRIP_QUESTION');
 expect(await page.evaluate(()=>JSON.stringify([Object.values(localStorage),Object.values(sessionStorage)]))).not.toContain('PRIVATE_TRIP');
 expect(page.url()).not.toContain('PRIVATE_TRIP');
 expect(mutations).toEqual([]);
 await expect(page.getByRole('link',{name:'Open existing workflow',exact:true})).toHaveAttribute('href','/en/trips');
 await page.reload();
 await expect(page.getByRole('textbox',{name:'Question',exact:true})).toHaveValue('');
 await expect(page.getByRole('textbox',{name:'Your notes',exact:true})).toHaveValue('');
 await page.getByRole('link',{name:'Open existing workflow',exact:true}).click();
 await expect(page).toHaveURL(/\/en\/trips$/);
 await expect(page.getByText('This page could not be found.')).toHaveCount(0);
});

test('merchant profile continuation reaches sign-in with the original workspace as its destination',async({page})=>{
 await page.goto('/en');
 await page.locator('[data-audience="merchant"]').getByRole('button',{name:'Update business details'}).click();
 await page.getByRole('link',{name:'Open existing workflow',exact:true}).click();
 await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fen%2Fmerchant$/);
 await expect(page.getByRole('heading',{name:'Sign in to Kinnso',exact:true})).toBeVisible();
});

test('Chinese merchant intent opens a manual brief and failed clipboard access preserves it',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}}}));
 await page.goto('/zh-HK');
 await page.getByLabel('想去哪裏、寫甚麼，或讓旅客找到你的店？').fill('幫我製作活動素材');
 await page.getByRole('button',{name:'開始聊聊'}).click();
 await expect(page.getByRole('heading',{name:'製作活動素材',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'檢視 brief',exact:true}).click();
 await page.getByRole('button',{name:'複製 brief',exact:true}).click();
 await expect(page.locator('.cs-task-starter [role="alert"]')).toContainText('未能複製');
 await expect(page.getByRole('textbox',{name:'已整理的 brief',exact:true})).toHaveValue(/幫我製作活動素材/);
});

test('account invalidation clears the homepage and blocks the current task picker',async({page})=>{
 await page.goto('/en');
 await page.getByLabel('What would you like to work on?').fill('PRIVATE_OLD_ACCOUNT');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'different-account'}})));
 await expect(page.getByLabel('What would you like to work on?')).toHaveValue('');
 await page.getByLabel('What would you like to work on?').fill('PRIVATE_WAITING');
 await page.getByRole('link',{name:'Task templates',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Choose a small next step',exact:true})).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'different-account'}})));
 await expect(page.locator('main [role="alert"]')).toContainText('Account or source permissions changed');
 await page.getByRole('link',{name:'Kinnso home'}).click();
 await page.getByRole('link',{name:'Choose documents',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Your question',exact:true})).toHaveValue('');
});

test('empty questions stay on the homepage and creator questions survive task selection',async({page})=>{
 await page.goto('/en');
 await expect(page.getByRole('button',{name:'Start a conversation'})).toBeDisabled();
 await page.getByLabel('What would you like to work on?').fill('Review my earnings PRIVATE_CREATOR');
 await page.getByRole('button',{name:'Start a conversation'}).click();
 await expect(page.getByRole('heading',{name:'Review performance',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Question',exact:true})).toHaveValue('Review my earnings PRIVATE_CREATOR');
 await expect(page.getByRole('link',{name:'Sign in to read your work'})).toHaveAttribute('href',/next=%2Fen%2Fworkroom%3Ftemplate%3DC3/);
});

for(const width of [320,390,768,1280])test(`homepage and manual brief fit ${width}px`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:850});await page.goto('/en');
 for(const audience of ['traveller','creator','merchant'])await expect(page.locator(`[data-audience="${audience}"]`)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByLabel('What would you like to work on?').fill('Plan my trip');
 await page.getByRole('button',{name:'Start a conversation'}).click();
 await page.getByRole('button',{name:'Review brief',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
 await page.screenshot({path:testInfo.outputPath(`manual-brief-${width}.png`),fullPage:true});
});
