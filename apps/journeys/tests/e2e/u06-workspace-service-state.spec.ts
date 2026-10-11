import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

let script='';
test.beforeAll(async()=>{
 const output=await build({stdin:{contents:`
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {WorkspaceServiceState} from './app/travel/WorkspaceServiceState';
  const params=window.fixture;
  function Fixture(){const[count,setCount]=React.useState(0);return <>
   <WorkspaceServiceState {...params} requestId="11111111-1111-4111-8111-111111111111" onRetry={()=>setCount(count+1)}/>
   <output aria-label="Retries">{count}</output></>;}
  createRoot(document.getElementById('fixture')).render(<Fixture/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
 script=output.outputFiles[0].text;
});
for(const locale of ['en','zh-HK']){
 test(`P03 ${locale}: real service state renders at 320px and retries by keyboard`,async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:800});
  await page.setContent('<style>body{margin:16px;font-family:sans-serif;font-size:200%}button,a{font-size:inherit;white-space:normal}*{box-sizing:border-box}</style><main id="fixture"></main>');
  await page.evaluate(locale=>{(window as any).fixture={locale,code:'UNAVAILABLE',retryState:'read'};},locale);
  await page.addScriptTag({content:script});
  const alert=page.getByRole('alert',{name:locale==='en'?'Workspace service status':'工作區服務狀態',exact:true});
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(locale==='en'?'temporarily unavailable':'暫時未能使用');
  await page.keyboard.press('Tab');
  const retry=page.getByRole('button',{name:locale==='en'?'Retry loading':'重試載入',exact:true});
  await expect(retry).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByLabel('Retries',{exact:true})).toHaveText('1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await testInfo.attach(`service-state-${locale}-320-200pct`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 });
 for(const code of ['AUTH_REQUIRED','FORBIDDEN','CONFLICT'])test(`P03 ${locale}: ${code} exposes the appropriate recovery action`,async({page})=>{
  await page.setContent('<main id="fixture"></main>');
  await page.evaluate(({locale,code})=>{(window as any).fixture={locale,code,retryState:'read',returnPath:`/${locale}/ops/merchants`};},{locale,code});
  await page.addScriptTag({content:script});await expect(page.getByRole('alert')).toBeVisible();
  if(code==='AUTH_REQUIRED'){
   const login=page.getByRole('link');await expect(login).toHaveAttribute('href',`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/ops/merchants`)}`);
   await page.keyboard.press('Tab');await expect(login).toBeFocused();await expect(page.getByRole('button')).toHaveCount(0);
  }else if(code==='FORBIDDEN'){await expect(page.getByRole('button')).toHaveCount(0);await expect(page.getByRole('link')).toHaveCount(0);}
  else{await expect(page.getByRole('alert')).toContainText(locale==='en'?'kept':'保留');await expect(page.getByRole('button')).toHaveText(locale==='en'?'Reload and compare':'重新載入並核對');}
 });
}

