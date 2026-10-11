import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

let script='',css='';
test.beforeAll(async()=>{
 css=await readFile('app/travel/workbench.css','utf8');
 const result=await build({stdin:{contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {CollaborationTasks} from './app/travel/CollaborationTasks';
  import {creatorTasks} from './lib/collaboration/tasks';
  const id='11111111-1111-4111-8111-111111111111',milestone='22222222-2222-4222-8222-222222222222';
  const item={id,title:'An authored collaboration with a long title '.repeat(6),participant:{status:'active'},milestones:[{id:milestone,title:'Revise the original route',dueAt:'2026-10-12T08:00:00Z'}],submissions:[{milestoneId:milestone,status:'revision_requested',proofUrls:['https://private.example/secret-proof']}],contactEmail:'private-contact@example.test'};
  createRoot(document.getElementById('fixture')).render(<CollaborationTasks locale={window.fixtureLocale} actions={creatorTasks([item],window.fixtureLocale)}/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
 script=result.outputFiles[0].text;
});
for(const locale of ['en','zh-HK'])for(const viewport of [{width:320,height:800},{width:640,height:450},{width:1280,height:900}]){
 test(`P07 ${locale} real next-action component reflows and keyboard reaches its record at ${viewport.width}`,async({page},testInfo)=>{
  await page.setViewportSize(viewport);
  await page.setContent(`<style>${css}\nbody{margin:16px;font-size:200%}a{font-size:inherit}</style><main id="fixture"></main>`);
  await page.evaluate(locale=>{(window as any).fixtureLocale=locale;},locale);await page.addScriptTag({content:script});
  await expect(page.getByRole('heading',{name:locale==='en'?'Your next actions':'你的下一步',exact:true})).toBeVisible();
  const link=page.getByRole('link',{name:new RegExp(locale==='en'?'Revise your work':'修改作品')});
  await page.keyboard.press('Tab');await expect(link).toBeFocused();
  await expect(link).toHaveAttribute('href',`/${locale}/studio/missions/11111111-1111-4111-8111-111111111111`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator('body')).not.toContainText('secret-proof');await expect(page.locator('body')).not.toContainText('private-contact');
  await testInfo.attach(`tasks-${locale}-${viewport.width}-200pct`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 });
}
