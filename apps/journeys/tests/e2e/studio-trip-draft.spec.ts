import {test,expect,type Page} from '@playwright/test';

async function openPlanner(page:Page,locale='en'){
 await page.goto('/'+locale);
 await page.getByRole('textbox',{name:locale==='en'?'What would you like to work on?':'想去哪裏、寫甚麼，或讓旅客找到你的店？'}).fill(locale==='en'?'Plan my trip PRIVATE_PLANNING_REQUEST':'規劃行程 PRIVATE_PLANNING_REQUEST');
 await page.getByRole('button',{name:locale==='en'?'Start a conversation':'開始聊聊'}).click();
 await page.getByRole('button',{name:locale==='en'?'Review brief':'檢視 brief',exact:true}).click();
 await page.getByRole('button',{name:locale==='en'?'Prepare a trip draft':'整理成行程草稿',exact:true}).click();
 await expect(page.getByRole('textbox',{name:locale==='en'?'Trip title':'行程標題',exact:true})).toBeVisible();
}
async function fillPlanner(page:Page){
 await page.getByRole('textbox',{name:'Trip title',exact:true}).fill('Harbour weekend');
 await page.getByLabel('Start date (optional)',{exact:true}).fill('2026-11-07');
 await page.getByRole('textbox',{name:'Time zone',exact:true}).fill('Asia/Hong_Kong');
 await page.getByRole('textbox',{name:'Stops, one per line',exact:true}).fill('Harbour\nCoffee');
 await page.getByRole('textbox',{name:'Trip note (optional)',exact:true}).fill('PRIVATE_TRIP_NOTE');
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await expect(page.getByRole('region',{name:'Itinerary preview',exact:true})).toContainText('Harbour');
}
async function addDay(page:Page,number:number,title:string,stops:string,locale='en'){
 await page.getByRole('button',{name:locale==='en'?'Add day':'加入一天',exact:true}).click();
 const day=page.getByRole('group',{name:locale==='en'?`Day ${number}`:`第 ${number} 天`,exact:true});
 await day.getByRole('textbox',{name:locale==='en'?'Day title':'當日標題',exact:true}).fill(title);
 await day.getByRole('textbox',{name:locale==='en'?'Stops, one per line':'站點，每行一個',exact:true}).fill(stops);
 return day;
}
async function stored(page:Page):Promise<any[]>{return page.evaluate(async()=>{
 if(!(await indexedDB.databases()).some(db=>db.name==='kinnso_guest_drafts_v1'))return[];
 return new Promise((resolve,reject)=>{const request=indexedDB.open('kinnso_guest_drafts_v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,get=db.transaction('trips').objectStore('trips').getAll();get.onsuccess=()=>{db.close();resolve(get.result)};get.onerror=()=>{db.close();reject(get.error)};};});
});}
async function holdNextDraftOpen(page:Page){
 await page.evaluate(()=>{
  const open=indexedDB.open.bind(indexedDB),close=IDBDatabase.prototype.close;let held=false;
  (window as any).tripOpenReady=false;(window as any).tripOpenClosed=false;
  IDBDatabase.prototype.close=function(){if(this.name==='kinnso_guest_drafts_v1')(window as any).tripOpenClosed=true;return close.call(this);};
  indexedDB.open=function(name,...args){
   const request=open(name,...args);if(name!=='kinnso_guest_drafts_v1'||held)return request;held=true;
   return new Proxy(request,{
    get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},
    set(target,key,value){
     if(key==='onsuccess'){target.onsuccess=event=>{(window as any).releaseTripOpen=()=>value.call(target,event);(window as any).tripOpenReady=true;};return true;}
     return Reflect.set(target,key,value,target);
    },
   });
  };
 });
}

for(const locale of ['en','zh-HK'])test(`empty device draft results acknowledge loading and completion in ${locale}`,async({page})=>{
 await page.goto('/'+locale+'/trips');
 const button=page.getByRole('button',{name:locale==='en'?'Preview device-only drafts':'預覽裝置草稿',exact:true});
 const status=page.getByRole('status',{name:locale==='en'?'Local import status':'本機匯入狀態',exact:true});
 await holdNextDraftOpen(page);
 await button.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).tripOpenReady)).toBe(true);
 await expect(status).toContainText(locale==='en'?'Reading saved device drafts':'正在讀取已保存的裝置草稿');
 await expect(button).toBeDisabled();
 await page.evaluate(()=>(window as any).releaseTripOpen());
 await expect(status).toContainText(locale==='en'?'No device drafts saved in this browser yet.':'此瀏覽器暫未保存裝置草稿。');
 await expect(button).toBeEnabled();
 expect(await stored(page)).toEqual([]);
});

for(const locale of ['en','zh-HK'])test(`saved stop timing validates, moves, reopens and clears in ${locale}`,async({page})=>{
 const en=locale==='en';await page.setViewportSize({width:en?390:320,height:850});await openPlanner(page,locale);
 const title=en?'Scheduled weekend':'有時間的週末',apiPosts:string[]=[];
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/'))apiPosts.push(request.url());});
 await page.getByRole('textbox',{name:en?'Trip title':'行程標題',exact:true}).fill(title);
 await page.getByRole('textbox',{name:en?'Time zone':'時區',exact:true}).fill('Asia/Hong_Kong');
 await page.getByRole('textbox',{name:en?'Stops, one per line':'站點，每行一個',exact:true}).fill(en?'Harbour\nCoffee':'海旁\n咖啡店');
 await page.getByRole('textbox',{name:en?'Trip note (optional)':'行程筆記（可選）',exact:true}).fill('PRIVATE_TIMING_NOTE');
 await addDay(page,2,en?'Second day':'第二天',en?'Market':'市集',locale);
 await page.getByRole('button',{name:en?'Review itinerary':'檢視行程',exact:true}).click();
 await page.getByRole('checkbox',{name:en?'I want to save this itinerary and its notes on this device.':'我確認將此行程及筆記保存於這部裝置。',exact:true}).check();
 await page.getByRole('button',{name:en?'Save itinerary on this device':'保存行程至此裝置',exact:true}).click();
 const status=page.getByRole('status',{name:en?'Device draft status':'裝置草稿狀態',exact:true});await expect(status).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [original]=await stored(page),day=(n:number)=>page.getByRole('group',{name:en?`Saved day ${n}`:`已保存日程 ${n}`,exact:true});
 const stop=(d:number,n:number)=>day(d).getByRole('group',{name:en?`Stop ${n}`:`站點 ${n}`,exact:true});
 const time=(d:number,n:number)=>stop(d,n).getByRole('textbox',{name:en?'Start time (HH:mm, optional)':'開始時間（HH:mm，可選）',exact:true});
 const duration=(d:number,n:number)=>stop(d,n).getByRole('textbox',{name:en?'Duration in minutes (optional)':'停留分鐘（可選）',exact:true});
 const save=page.getByRole('button',{name:en?'Save device draft':'保存裝置草稿',exact:true});
 await time(1,1).fill('24:00');await save.click();await expect(time(1,1)).toHaveAttribute('aria-invalid','true');
 await expect(status).toContainText('23:59');expect(await stored(page)).toEqual([original]);
 await time(1,1).fill('00:00');await duration(1,1).fill('1.5');await save.click();
 await expect(duration(1,1)).toHaveAttribute('aria-invalid','true');await expect(status).toContainText('1440');expect(await stored(page)).toEqual([original]);
 await page.getByRole('link',{name:en?'View saved device trips':'查看已保存的裝置行程',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:en?'Unsaved device draft':'未保存的裝置草稿',exact:true});
 await dialog.getByRole('button',{name:en?'Save and leave':'保存後離開',exact:true}).click();
 await expect(dialog).toContainText(en?'Latest edits were not saved':'最新修改尚未保存');expect(await stored(page)).toEqual([original]);
 await dialog.getByRole('button',{name:en?'Continue editing':'繼續編輯',exact:true}).click();await expect(duration(1,1)).toHaveValue('1.5');
 await duration(1,1).fill('90');await duration(1,2).fill('1440');
 await stop(1,1).getByRole('combobox',{name:en?'Move to day':'移至日程',exact:true}).selectOption({label:en?'Day 2 · Second day':'第 2 天 · 第二天'});
 await stop(1,1).getByRole('button',{name:en?'Move stop to day':'移動站點至日程',exact:true}).click();
 await expect(time(2,2)).toHaveValue('00:00');await expect(duration(2,2)).toHaveValue('90');expect(await stored(page)).toEqual([original]);
 await save.click();await expect(status).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [saved]=await stored(page);expect(saved.id).toBe(original.id);expect(saved.ownerId).toBe(original.ownerId);
 expect(saved.days.map((value:any)=>value.offset)).toEqual([0,1]);
 expect(saved.days[1].stops[1]).toEqual({...original.days[0].stops[0],startMinuteOfDay:0,durationMinutes:90});
 expect(saved.days[0].stops[0]).toEqual({...original.days[0].stops[1],startMinuteOfDay:null,durationMinutes:1440});
 expect(JSON.stringify(saved)).not.toMatch(/editorKey|scheduleInput/);
 await page.reload();await page.goto('/'+locale+'/trips');await page.getByRole('button',{name:en?'Preview device-only drafts':'預覽裝置草稿',exact:true}).click();
 await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:en?'Edit this saved device draft':'編輯此已保存的裝置草稿',exact:true}).click();
 await expect(time(2,2)).toHaveValue('00:00');await expect(duration(2,2)).toHaveValue('90');
 await expect(stop(2,2).getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true})).toHaveValue('PRIVATE_TIMING_NOTE');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await time(2,2).fill('');await duration(2,2).fill('');await save.click();
 await expect(page.getByRole('status',{name:en?'Local import status':'本機匯入狀態',exact:true})).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [cleared]=await stored(page);expect(cleared.id).toBe(original.id);expect(cleared.days[1].stops[1]).toEqual(original.days[0].stops[0]);
 expect(cleared.days[0].stops[0].durationMinutes).toBe(1440);expect(apiPosts).toEqual([]);
});

for(const locale of ['en','zh-HK'])test(`moving a saved stop between days preserves its note, focus and saved identity in ${locale}`,async({page})=>{
 const en=locale==='en';await page.setViewportSize({width:en?390:320,height:850});await openPlanner(page,locale);
 const title=en?'Cross-day weekend':'跨日週末',destinationTitle=en?'Afternoon '+ 'W'.repeat(170):'午後'+ '旅'.repeat(180);
 if(en)await fillPlanner(page);
 else{
  await page.getByRole('textbox',{name:'時區',exact:true}).fill('Asia/Hong_Kong');
  await page.getByRole('textbox',{name:'站點，每行一個',exact:true}).fill('海旁\n咖啡店');
 }
 await page.getByRole('textbox',{name:en?'Trip title':'行程標題',exact:true}).fill(title);
 await page.getByRole('textbox',{name:en?'Trip note (optional)':'行程筆記（可選）',exact:true}).fill('PRIVATE_CROSS_DAY_NOTE');
 await addDay(page,2,destinationTitle,en?'Museum':'博物館',locale);
 await page.getByRole('button',{name:en?'Review itinerary':'檢視行程',exact:true}).click();
 await page.getByRole('checkbox',{name:en?'I want to save this itinerary and its notes on this device.':'我確認將此行程及筆記保存於這部裝置。',exact:true}).check();
 await page.getByRole('button',{name:en?'Save itinerary on this device':'保存行程至此裝置',exact:true}).click();
 const status=page.getByRole('status',{name:en?'Device draft status':'裝置草稿狀態',exact:true});await expect(status).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [original]=await stored(page),day=(number:number)=>page.getByRole('group',{name:en?`Saved day ${number}`:`已保存日程 ${number}`,exact:true});
 const source=day(1).getByRole('group',{name:en?'Stop 1':'站點 1',exact:true});
 const destination=source.getByRole('combobox',{name:en?'Move to day':'移至日程',exact:true});
 await expect(source.getByRole('button',{name:en?'Move stop to day':'移動站點至日程',exact:true})).toBeDisabled();
 await destination.selectOption({label:en?`Day 2 · ${destinationTitle}`:`第 2 天 · ${destinationTitle}`});
 expect(await stored(page)).toEqual([original]);
 await expect(page.getByRole('link',{name:en?'Sign in to review import':'登入以核對匯入',exact:true})).toBeVisible();
 await source.getByRole('button',{name:en?'Move stop to day':'移動站點至日程',exact:true}).click();
 const moved=day(2).getByRole('group',{name:en?'Stop 2':'站點 2',exact:true});
 await expect(moved.getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true})).toHaveValue(en?'Harbour':'海旁');
 await expect(moved.getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true})).toBeFocused();
 await expect(moved.getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true})).toHaveValue('PRIVATE_CROSS_DAY_NOTE');
 await expect(moved.getByRole('combobox',{name:en?'Move to day':'移至日程',exact:true})).toHaveValue('');
 await expect(day(1).getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true})).toHaveCount(1);
 expect(await stored(page)).toEqual([original]);
 await page.getByRole('button',{name:en?'Save device draft':'保存裝置草稿',exact:true}).click();await expect(status).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [saved]=await stored(page);expect(saved.id).toBe(original.id);expect(saved.ownerId).toBe(original.ownerId);expect(saved.days.map((value:any)=>value.offset)).toEqual([0,1]);
 expect(saved.days[0].stops.map((value:any)=>value.title)).toEqual([en?'Coffee':'咖啡店']);
 expect(saved.days[1].stops[1]).toEqual(original.days[0].stops[0]);expect(JSON.stringify(saved)).not.toContain('editorKey');
 await page.reload();await page.goto('/'+locale+'/trips');await page.getByRole('button',{name:en?'Preview device-only drafts':'預覽裝置草稿',exact:true}).click();
 await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:en?'Edit this saved device draft':'編輯此已保存的裝置草稿',exact:true}).click();
 await expect(day(2).getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true}).last()).toHaveValue('PRIVATE_CROSS_DAY_NOTE');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const locale of ['en','zh-HK'])test(`saved manual trip structure preserves surviving notes through reorder, removal and reload in ${locale}`,async({page})=>{
 const en=locale==='en';await page.setViewportSize({width:en?390:320,height:850});
 const apiPosts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/'))apiPosts.push(request.url());});
 await openPlanner(page,locale);
 if(en)await fillPlanner(page);
 else{
  await page.getByRole('textbox',{name:'行程標題',exact:true}).fill('原行程');
  await page.getByRole('textbox',{name:'時區',exact:true}).fill('Asia/Hong_Kong');
  await page.getByRole('textbox',{name:'站點，每行一個',exact:true}).fill('海旁\n咖啡店');
 }
 await page.getByRole('textbox',{name:en?'Trip note (optional)':'行程筆記（可選）',exact:true}).fill('PRIVATE_KEEP');
 await page.getByRole('button',{name:en?'Review itinerary':'檢視行程',exact:true}).click();
 await page.getByRole('checkbox',{name:en?'I want to save this itinerary and its notes on this device.':'我確認將此行程及筆記保存於這部裝置。',exact:true}).check();
 await page.getByRole('button',{name:en?'Save itinerary on this device':'保存行程至此裝置',exact:true}).click();
 const status=page.getByRole('status',{name:en?'Device draft status':'裝置草稿狀態',exact:true});await expect(status).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [original]=await stored(page),day=(number:number)=>page.getByRole('group',{name:en?`Saved day ${number}`:`已保存日程 ${number}`,exact:true});
 const stop=(number:number,position:number)=>day(number).getByRole('group',{name:en?`Stop ${position}`:`站點 ${position}`,exact:true});
 await expect(day(1).getByRole('button',{name:en?'Remove day':'移除此日',exact:true})).toBeDisabled();
 await day(1).getByRole('button',{name:en?'Add stop':'加入站點',exact:true}).click();
 const museum=en?'Museum':'博物館';
 await stop(1,3).getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true}).pressSequentially(museum);
 await expect(stop(1,3).getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true})).toHaveValue(museum);
 await stop(1,3).getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true}).fill('MUSEUM_PRIVATE');
 await stop(1,3).getByRole('button',{name:en?'Move stop earlier':'提前站點',exact:true}).click();
 await stop(1,2).getByRole('button',{name:en?'Move stop later':'延後站點',exact:true}).click();
 await stop(1,3).getByRole('button',{name:en?'Move stop earlier':'提前站點',exact:true}).click();
 await stop(1,3).getByRole('button',{name:en?'Remove stop':'移除站點',exact:true}).click();
 const stopDialog=page.getByRole('dialog',{name:en?'Remove this stop?':'移除此站點？',exact:true});
 await expect(stopDialog).toContainText(en?'private note':'私人筆記');
 await stopDialog.getByRole('button',{name:en?'Keep stop':'保留站點',exact:true}).click();
 await expect(day(1).getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true})).toHaveCount(3);
 await stop(1,3).getByRole('button',{name:en?'Remove stop':'移除站點',exact:true}).click();
 await stopDialog.getByRole('button',{name:en?'Remove stop':'移除站點',exact:true}).click();
 await page.getByRole('button',{name:en?'Add day':'加入一天',exact:true}).click();
 await day(2).getByRole('textbox',{name:en?'Draft day title':'草稿當日標題',exact:true}).fill(en?'Market day':'市集的一天');
 await day(2).getByRole('button',{name:en?'Add stop':'加入站點',exact:true}).click();
 await stop(2,1).getByRole('textbox',{name:en?'Draft stop title':'草稿站點名稱',exact:true}).fill(en?'Night market':'夜市');
 await stop(2,1).getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true}).fill('MARKET_PRIVATE');
 await day(2).getByRole('button',{name:en?'Move day earlier':'提前一天',exact:true}).click();
 await day(1).getByRole('button',{name:en?'Move day later':'延後一天',exact:true}).click();
 await day(2).getByRole('button',{name:en?'Move day earlier':'提前一天',exact:true}).click();
 await page.getByRole('button',{name:en?'Add day':'加入一天',exact:true}).click();
 await day(3).getByRole('textbox',{name:en?'Draft day title':'草稿當日標題',exact:true}).fill('Scratch');
 await day(3).getByRole('button',{name:en?'Remove day':'移除此日',exact:true}).click();
 const dayDialog=page.getByRole('dialog',{name:en?'Remove this day?':'移除此日？',exact:true});
 await dayDialog.getByRole('button',{name:en?'Keep day':'保留此日',exact:true}).click();
 await expect(day(3)).toBeVisible();
 await day(3).getByRole('button',{name:en?'Remove day':'移除此日',exact:true}).click();
 await dayDialog.getByRole('button',{name:en?'Remove day':'移除此日',exact:true}).click();
 expect(await stored(page)).toEqual([original]);
 await page.getByRole('button',{name:en?'Save device draft':'保存裝置草稿',exact:true}).click();await expect(status).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [saved]=await stored(page);expect(saved.id).toBe(original.id);expect(saved.ownerId).toBe(original.ownerId);expect(saved.days.map((value:any)=>value.offset)).toEqual([0,1]);
 expect(saved.days.map((value:any)=>value.stops.map((value:any)=>[value.title,value.travellerNote]))).toEqual([[[en?'Night market':'夜市','MARKET_PRIVATE']],[[en?'Harbour':'海旁','PRIVATE_KEEP'],[museum,'MUSEUM_PRIVATE']]]);
 expect(JSON.stringify(saved)).not.toContain('editorKey');
 await page.reload();await page.goto('/'+locale+'/trips');await page.getByRole('button',{name:en?'Preview device-only drafts':'預覽裝置草稿',exact:true}).click();
 await page.getByRole('button',{name:original.title,exact:true}).click();await page.getByRole('button',{name:en?'Edit this saved device draft':'編輯此已保存的裝置草稿',exact:true}).click();
 await expect(stop(2,1).getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true})).toHaveValue('PRIVATE_KEEP');
 await expect(stop(2,2).getByRole('textbox',{name:en?'Draft private note':'草稿私人筆記',exact:true})).toHaveValue('MUSEUM_PRIVATE');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(apiPosts).toEqual([]);
});

for(const decision of ['Save and leave','Discard unsaved edits'])test(`saved structure navigation: ${decision}`,async({page})=>{
 await openPlanner(page);await fillPlanner(page);await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const [original]=await stored(page),day=page.getByRole('group',{name:'Saved day 1',exact:true});
 await day.getByRole('button',{name:'Add stop',exact:true}).click();await day.getByRole('textbox',{name:'Draft stop title',exact:true}).last().fill('Later stop');
 await page.getByRole('link',{name:'View saved device trips',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Unsaved device draft',exact:true});await dialog.getByRole('button',{name:'Continue editing',exact:true}).click();
 expect(await stored(page)).toEqual([original]);await expect(day.getByRole('textbox',{name:'Draft stop title',exact:true}).last()).toHaveValue('Later stop');
 await page.getByRole('link',{name:'View saved device trips',exact:true}).click();await dialog.getByRole('button',{name:decision,exact:true}).click();await expect(page).toHaveURL(/\/en\/trips$/);
 const [saved]=await stored(page);expect(saved.id).toBe(original.id);expect(saved.days[0].stops.map((stop:any)=>stop.title)).toEqual(decision==='Save and leave'?['Harbour','Coffee','Later stop']:['Harbour','Coffee']);
 expect(JSON.stringify(saved)).not.toContain('editorKey');
});

test('keyboard focus follows moved saved stops and days',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('textbox',{name:'Stops, one per line',exact:true}).fill('Harbour\nCoffee\nMuseum\nMarket');
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const day=(number:number)=>page.getByRole('group',{name:`Saved day ${number}`,exact:true});
 const stop=(position:number)=>day(1).getByRole('group',{name:`Stop ${position}`,exact:true});
 const move=async(button:ReturnType<Page['getByRole']>)=>{
  const node=await button.elementHandle();expect(node).not.toBeNull();await button.click();
  expect(await node!.evaluate(element=>element.isConnected&&element===document.activeElement)).toBe(true);
 };
 await stop(2).getByRole('textbox',{name:'Draft private note',exact:true}).fill('FOCUS_NOTE');
 await move(stop(2).getByRole('button',{name:'Move stop later',exact:true}));
 await expect(stop(3).getByRole('textbox',{name:'Draft stop title',exact:true})).toHaveValue('Coffee');
 await expect(stop(3).getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('FOCUS_NOTE');
 await move(stop(3).getByRole('button',{name:'Move stop earlier',exact:true}));
 await page.getByRole('button',{name:'Add day',exact:true}).click();await page.getByRole('button',{name:'Add day',exact:true}).click();
 await move(day(1).getByRole('button',{name:'Move day later',exact:true}));
 await move(day(3).getByRole('button',{name:'Move day earlier',exact:true}));
});

for(const locale of ['en','zh-HK'])test(`saved manual trip details survive editing and reopening in ${locale}`,async({page})=>{
 const en=locale==='en';await page.setViewportSize({width:en?390:320,height:850});await openPlanner(page,locale);
 if(en)await fillPlanner(page);
 else{
  await page.getByRole('textbox',{name:'行程標題',exact:true}).fill('原本的行程');
  await page.getByRole('textbox',{name:'時區',exact:true}).fill('Asia/Hong_Kong');
  await page.getByRole('textbox',{name:'站點，每行一個',exact:true}).fill('海旁\n咖啡店');
 }
 await addDay(page,2,en?'Second day':'第二天',en?'Market':'市集',locale);
 await page.getByRole('button',{name:en?'Review itinerary':'檢視行程',exact:true}).click();
 await page.getByRole('checkbox',{name:en?'I want to save this itinerary and its notes on this device.':'我確認將此行程及筆記保存於這部裝置。',exact:true}).check();
 await page.getByRole('button',{name:en?'Save itinerary on this device':'保存行程至此裝置',exact:true}).click();
 await expect(page.getByRole('status',{name:en?'Device draft status':'裝置草稿狀態',exact:true})).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [original]=await stored(page);
 const renamed=en?'Updated weekend':'更新後的週末';
 await page.getByRole('textbox',{name:en?'Draft trip title':'草稿行程標題',exact:true}).fill(renamed);
 await page.getByLabel(en?'Draft start date (optional)':'草稿開始日期（可選）',{exact:true}).filter({visible:true}).fill('2026-12-01');
 await page.getByRole('textbox',{name:en?'Draft time zone':'草稿時區',exact:true}).fill('Asia/Tokyo');
 await page.getByRole('textbox',{name:en?'Draft day title':'草稿當日標題',exact:true}).last().fill(en?'A quiet afternoon':'悠閒的下午');
 expect(await stored(page)).toEqual([original]);
 await expect(page.getByRole('button',{name:en?'Sign in to review import':'登入以核對匯入',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:en?'Save device draft':'保存裝置草稿',exact:true}).click();
 await expect(page.getByRole('status',{name:en?'Device draft status':'裝置草稿狀態',exact:true})).toContainText(en?'Device draft saved':'裝置草稿已保存');
 const [saved]=await stored(page);expect(saved).toMatchObject({id:original.id,ownerId:original.ownerId,title:renamed,startDate:'2026-12-01',timezone:'Asia/Tokyo'});
 expect(saved.days.map((day:any)=>day.stops)).toEqual(original.days.map((day:any)=>day.stops));
 await page.reload();await page.goto('/'+locale+'/trips');
 await page.getByRole('button',{name:en?'Preview device-only drafts':'預覽裝置草稿',exact:true}).click();
 await page.getByRole('button',{name:renamed,exact:true}).click();
 await page.getByRole('button',{name:en?'Edit this saved device draft':'編輯此已保存的裝置草稿',exact:true}).click();
 await expect(page.getByRole('textbox',{name:en?'Draft trip title':'草稿行程標題',exact:true})).toHaveValue(renamed);
 await expect(page.getByLabel(en?'Draft start date (optional)':'草稿開始日期（可選）',{exact:true}).filter({visible:true})).toHaveValue('2026-12-01');
 await expect(page.getByRole('textbox',{name:en?'Draft time zone':'草稿時區',exact:true})).toHaveValue('Asia/Tokyo');
 await expect(page.getByRole('textbox',{name:en?'Draft day title':'草稿當日標題',exact:true}).last()).toHaveValue(en?'A quiet afternoon':'悠閒的下午');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('invalid saved metadata keeps the confirmed copy and becomes editable for a corrected retry',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const [original]=await stored(page);
 await page.getByRole('textbox',{name:'Draft time zone',exact:true}).fill('Invalid/Nowhere');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('valid time zone');
 expect(await stored(page)).toEqual([original]);
 await expect(page.getByRole('textbox',{name:'Draft time zone',exact:true})).toHaveValue('Invalid/Nowhere');
 await page.getByRole('textbox',{name:'Draft time zone',exact:true}).fill('Asia/Tokyo');
 await page.getByLabel('Draft start date (optional)',{exact:true}).filter({visible:true}).fill('');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const [saved]=await stored(page);expect(saved.id).toBe(original.id);expect(saved.startDate).toBeNull();expect(saved.timezone).toBe('Asia/Tokyo');expect(saved.days).toEqual(original.days);
});

test('an unconfirmed metadata readback preserves the editor and retries the same device copy',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const [original]=await stored(page);
 await page.getByRole('textbox',{name:'Draft trip title',exact:true}).fill('Unconfirmed title');
 await page.evaluate(()=>{
  const get=IDBObjectStore.prototype.getAll;let fail=true;
  IDBObjectStore.prototype.getAll=function(...args){if(this.name==='trips'&&fail){fail=false;throw new DOMException('Read unavailable','UnknownError');}return get.apply(this,args);};
 });
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('not confirmed');
 await expect(page.getByRole('textbox',{name:'Draft trip title',exact:true})).toHaveValue('Unconfirmed title');
 await expect(page.getByRole('button',{name:'Sign in to review import',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const copies=await stored(page);expect(copies).toHaveLength(1);expect(copies[0]).toMatchObject({id:original.id,ownerId:original.ownerId,title:'Unconfirmed title'});expect(copies[0].days).toEqual(original.days);
});

test('a traveller can arrange multiple days, confirm removal and reopen the complete saved trip',async({page})=>{
 await openPlanner(page);
 await expect(page.getByRole('button',{name:'Add day',exact:true})).toBeVisible();
 await fillPlanner(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 const second=await addDay(page,2,'Market day','Night market\nTea');
 await expect(page.getByRole('region',{name:'Itinerary preview',exact:true})).toHaveCount(0);
 await addDay(page,3,'Spare day','Optional stop');
 const third=page.getByRole('group',{name:'Day 3',exact:true});
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await third.getByRole('button',{name:'Remove day',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Remove this day?',exact:true});
 await expect(dialog).toContainText('Spare day');
 await dialog.getByRole('button',{name:'Keep day',exact:true}).click();
 await expect(third.getByRole('textbox',{name:'Stops, one per line',exact:true})).toHaveValue('Optional stop');
 await expect(page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true})).toBeChecked();
 await third.getByRole('button',{name:'Remove day',exact:true}).click();
 await dialog.getByRole('button',{name:'Remove day',exact:true}).click();
 await expect(page.getByRole('group',{name:'Day 3',exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Itinerary preview',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await second.getByRole('button',{name:'Move day earlier',exact:true}).click();
 await expect(page.getByRole('region',{name:'Itinerary preview',exact:true})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'Day 1',exact:true}).getByRole('textbox',{name:'Day title',exact:true})).toHaveValue('Market day');
 await page.getByRole('group',{name:'Day 1',exact:true}).getByRole('button',{name:'Move day later',exact:true}).click();
 await expect(page.getByRole('group',{name:'Day 2',exact:true}).getByRole('textbox',{name:'Day title',exact:true})).toHaveValue('Market day');
 await page.getByRole('group',{name:'Day 2',exact:true}).getByRole('button',{name:'Move day earlier',exact:true}).click();
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 const preview=page.getByRole('region',{name:'Itinerary preview',exact:true});
 await expect(preview).toContainText('Night market');await expect(preview).toContainText('Harbour');
 await expect(page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true})).not.toBeChecked();
 expect(await stored(page)).toEqual([]);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const [copy]=await stored(page);expect(copy.days.map((day:any)=>[day.offset,day.title,day.stops.map((stop:any)=>stop.title)])).toEqual([[0,'Market day',['Night market','Tea']],[1,'Day 1',['Harbour','Coffee']]]);
 expect(copy.days.flatMap((day:any)=>day.stops).map((stop:any)=>stop.travellerNote)).toEqual(['PRIVATE_TRIP_NOTE','','','']);
 await page.reload();await page.goto('/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();
 await page.getByRole('button',{name:'Harbour weekend',exact:true}).click();
 await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Draft stop title',exact:true})).toHaveCount(4);
 await page.getByRole('textbox',{name:'Draft stop title',exact:true}).last().fill('Revised coffee');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByRole('status',{name:'Local import status',exact:true})).toContainText('Device draft saved');
 const [updated]=await stored(page);expect(updated.id).toBe(copy.id);expect(updated.days[1].stops[1].title).toBe('Revised coffee');
 expect(updated.days[0].stops[0].travellerNote).toBe('PRIVATE_TRIP_NOTE');
});

test('an empty later day blocks review without discarding earlier days or saving',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('button',{name:'Add day',exact:true}).click();
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await expect(page.locator('.cs-trip-handoff [role="alert"]')).toContainText('stops');
 await expect(page.getByRole('group',{name:'Day 1',exact:true}).getByRole('textbox',{name:'Stops, one per line',exact:true})).toHaveValue('Harbour\nCoffee');
 await expect(page.getByRole('region',{name:'Itinerary preview',exact:true})).toHaveCount(0);
 expect(await stored(page)).toEqual([]);
});

test('removing the first day retains the trip note once on the new first stop',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await addDay(page,2,'Remaining day','Market\nTea');
 await page.getByRole('group',{name:'Day 1',exact:true}).getByRole('button',{name:'Remove day',exact:true}).click();
 await page.getByRole('dialog',{name:'Remove this day?',exact:true}).getByRole('button',{name:'Remove day',exact:true}).click();
 await expect(page.getByRole('group',{name:'Day 1',exact:true}).getByRole('button',{name:'Remove day',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const [copy]=await stored(page);expect(copy.days).toHaveLength(1);expect(copy.days[0].title).toBe('Remaining day');
 expect(copy.days[0].stops.map((stop:any)=>[stop.title,stop.travellerNote])).toEqual([['Market','PRIVATE_TRIP_NOTE'],['Tea','']]);
});

test('long day titles wrap in mobile itinerary previews',async({page})=>{
 await page.setViewportSize({width:320,height:850});await openPlanner(page);await fillPlanner(page);
 const title='W'.repeat(200);
 await page.getByRole('textbox',{name:'Day title',exact:true}).fill(title);
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 const heading=page.getByRole('region',{name:'Itinerary preview',exact:true}).getByRole('heading',{name:title,exact:true});
 await expect(heading).toBeVisible();
 expect(await heading.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 await page.goto('/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();
 await page.getByRole('button',{name:'Harbour weekend',exact:true}).click();
 await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 const restoredHeading=page.getByRole('heading',{name:title,exact:true});
 expect(await restoredHeading.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('Traditional Chinese travellers can prepare and save more than one day',async({page})=>{
 await openPlanner(page,'zh-HK');
 await page.getByRole('textbox',{name:'行程標題',exact:true}).fill('兩天散步');
 await page.getByRole('textbox',{name:'時區',exact:true}).fill('Asia/Hong_Kong');
 await page.getByRole('textbox',{name:'站點，每行一個',exact:true}).fill('海旁');
 await addDay(page,2,'市集的一天','市集\n咖啡店','zh-HK');
 await page.getByRole('button',{name:'檢視行程',exact:true}).click();
 await expect(page.getByRole('region',{name:'行程預覽',exact:true})).toContainText('市集的一天');
 await page.getByRole('checkbox',{name:'我確認將此行程及筆記保存於這部裝置。',exact:true}).check();
 await page.getByRole('button',{name:'保存行程至此裝置',exact:true}).click();
 await expect(page.getByRole('status',{name:'裝置草稿狀態',exact:true})).toContainText('裝置草稿已保存');
 const [copy]=await stored(page);expect(copy.days.map((day:any)=>day.offset)).toEqual([0,1]);expect(copy.days[1].stops.map((stop:any)=>stop.title)).toEqual(['市集','咖啡店']);
});

test('homepage to reviewed device trip survives reload, editing and deletion in the existing workflow',async({page})=>{
 const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await openPlanner(page);await fillPlanner(page);
 await expect(page.getByRole('button',{name:'Save itinerary on this device',exact:true})).toBeDisabled();
 expect(await stored(page)).toEqual([]);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const rows=await stored(page);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({origin:'manual',title:'Harbour weekend',startDate:'2026-11-07',timezone:'Asia/Hong_Kong'});
 expect(rows[0].source).toBeUndefined();expect(rows[0].days[0].stops.map((s:any)=>s.title)).toEqual(['Harbour','Coffee']);
 expect(rows[0].days[0].stops[0]).toMatchObject({travellerNote:'PRIVATE_TRIP_NOTE',startMinuteOfDay:null,durationMinutes:null});
 expect(posts).toEqual([]);expect(page.url()).not.toContain('PRIVATE');
 await page.reload();await page.getByRole('link',{name:'Open existing workflow',exact:true}).click();
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();
 await page.getByRole('button',{name:'Harbour weekend',exact:true}).click();
 await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Draft private note',exact:true}).first()).toHaveValue('PRIVATE_TRIP_NOTE');
 await page.getByRole('textbox',{name:'Draft stop title',exact:true}).first().fill('Revised harbour');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByText('Device draft saved. Review it before confirming account import.',{exact:true})).toBeVisible();
 expect((await stored(page))[0].days[0].stops[0].title).toBe('Revised harbour');
 await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await page.getByRole('button',{name:'Delete this device draft',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete device copy',exact:true}).click();
 await expect(page.getByText('This device copy was deleted. Account trips and other copies are kept.',{exact:true})).toBeVisible();
 expect(await stored(page)).toEqual([]);
});

test('editing a reviewed itinerary invalidates consent and nothing saves on account change',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('textbox',{name:'Trip title',exact:true}).fill('Revised weekend');
 await expect(page.getByRole('region',{name:'Itinerary preview',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true})).not.toBeChecked();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'different-account'}})));
 await expect(page.getByRole('textbox',{name:'Trip note (optional)',exact:true})).toHaveCount(0);
 expect(await stored(page)).toEqual([]);
});

test('an unconfirmed save can be retried with the same device identity after a lost readback',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.evaluate(()=>{
  const put=IDBObjectStore.prototype.put,getAll=IDBObjectStore.prototype.getAll;
  (window as any).draftIds=[];(window as any).failDraftRead=true;
  IDBObjectStore.prototype.put=function(value,...args){if(this.name==='trips')(window as any).draftIds.push(value.id);return put.call(this,value,...args);};
  IDBObjectStore.prototype.getAll=function(...args){if(this.name==='trips'&&(window as any).failDraftRead){(window as any).failDraftRead=false;throw new DOMException('Readback unavailable','UnknownError');}return getAll.apply(this,args);};
 });
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.locator('.cs-trip-handoff [role="alert"]')).toContainText('Could not confirm');
 await expect(page.getByRole('textbox',{name:'Trip note (optional)',exact:true})).toHaveValue('PRIVATE_TRIP_NOTE');
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 const ids=await page.evaluate(()=>(window as any).draftIds);expect(ids).toHaveLength(2);expect(ids[1]).toBe(ids[0]);expect(await stored(page)).toHaveLength(1);
});

test('invalid input stays editable without a device write',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('textbox',{name:'Time zone',exact:true}).fill('Invalid/Nowhere');
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 await expect(page.locator('.cs-trip-handoff [role="alert"]')).toContainText('valid time zone');
 await expect(page.getByRole('textbox',{name:'Trip title',exact:true})).toHaveValue('Harbour weekend');
 expect(await stored(page)).toEqual([]);
});

test('leaving an unsaved itinerary uses the existing device-draft navigation guard',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('link',{name:'View saved device trips',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Unsaved device draft',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Continue editing',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Trip note (optional)',exact:true})).toHaveValue('PRIVATE_TRIP_NOTE');
 expect(await stored(page)).toEqual([]);
 await page.getByRole('link',{name:'View saved device trips',exact:true}).click();
 await page.getByRole('button',{name:'Discard unsaved edits',exact:true}).click();
 await expect(page).toHaveURL(/\/en\/trips$/);
 expect(await stored(page)).toEqual([]);
});

test('Save and leave acknowledges the confirmed itinerary before opening the original trip screen',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('link',{name:'View saved device trips',exact:true}).click();
 await page.getByRole('dialog',{name:'Unsaved device draft',exact:true}).getByRole('button',{name:'Save and leave',exact:true}).click();
 await expect(page).toHaveURL(/\/en\/trips$/);
 expect(await stored(page)).toHaveLength(1);
});

test('an account change during a pending storage open cancels the save and cannot restore private text',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await holdNextDraftOpen(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).tripOpenReady)).toBe(true);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'different-account'}})));
 await expect(page.getByRole('textbox',{name:'Trip note (optional)',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).releaseTripOpen());
 await expect.poll(()=>page.evaluate(()=>(window as any).tripOpenClosed)).toBe(true);
 expect(await stored(page)).toEqual([]);
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toHaveCount(0);
});

test('an account change cancels a pending edit to an already saved device draft',async({page})=>{
 await openPlanner(page);await fillPlanner(page);
 await page.getByRole('checkbox',{name:'I want to save this itinerary and its notes on this device.',exact:true}).check();
 await page.getByRole('button',{name:'Save itinerary on this device',exact:true}).click();
 await expect(page.getByRole('status',{name:'Device draft status',exact:true})).toContainText('Device draft saved');
 await page.getByRole('textbox',{name:'Draft private note',exact:true}).first().fill('PENDING_PRIVATE_EDIT');
 await holdNextDraftOpen(page);
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).tripOpenReady)).toBe(true);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'different-account'}})));
 await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).releaseTripOpen());
 await expect.poll(()=>page.evaluate(()=>(window as any).tripOpenClosed)).toBe(true);
 const rows=await stored(page);expect(rows).toHaveLength(1);
 expect(rows[0].days[0].stops[0].travellerNote).toBe('PRIVATE_TRIP_NOTE');
});

test('Traditional Chinese planning saves an own itinerary and leaves account import behind sign-in',async({page})=>{
 await openPlanner(page,'zh-HK');
 await page.getByRole('textbox',{name:'行程標題',exact:true}).fill('我的海旁散步');
 await page.getByRole('textbox',{name:'時區',exact:true}).fill('Asia/Hong_Kong');
 await page.getByRole('textbox',{name:'站點，每行一個',exact:true}).fill('海旁\n咖啡店');
 await page.getByRole('button',{name:'檢視行程',exact:true}).click();
 await expect(page.getByRole('region',{name:'行程預覽',exact:true})).toContainText('日期未定');
 await page.getByRole('checkbox',{name:'我確認將此行程及筆記保存於這部裝置。',exact:true}).check();
 await page.getByRole('button',{name:'保存行程至此裝置',exact:true}).click();
 await expect(page.getByRole('status',{name:'裝置草稿狀態',exact:true})).toContainText('裝置草稿已保存');
 await expect(page.getByRole('link',{name:'登入以核對匯入',exact:true})).toHaveAttribute('href','/zh-HK/sign-in?next=%2Fzh-HK%2Ftrips');
 const rows=await stored(page);expect(rows).toHaveLength(1);expect(rows[0].startDate).toBeNull();expect(rows[0].days[0].stops[0].travellerNote).toContain('PRIVATE_PLANNING_REQUEST');
});

for(const width of [320,390,768,1280])test(`trip draft preview fits ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:850});await openPlanner(page);await fillPlanner(page);
 await addDay(page,2,'Market day','Night market\nTea');
 await page.getByRole('button',{name:'Review itinerary',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`trip-preview-${width}.png`),fullPage:true});
});
