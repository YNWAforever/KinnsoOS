import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {studioModule} from './helpers/studio-load.mjs';
import {capabilities} from '../lib/contracts/capabilities.ts';
const {templates}=await studioModule('templates');
const {isStudioRoute,getStudioNavigation}=await studioModule('navigation');
test('old_routes_and_templates_survive',async()=>{
 for(const prefix of ['C','T','M'])for(let i=1;i<=5;i++)assert.ok(templates.some(t=>t.id===prefix+i&&t.destination));
 for(const route of ['explore','trips','saved','record','studio','merchant','agent','inbox','support','workspace','credits'])assert.ok(getStudioNavigation(null).some(n=>n.path===route));
 const additions=JSON.parse(await readFile(new URL('./contracts/discovery-route-additions.json',import.meta.url)));
 for(const route of additions.routes)assert.equal(isStudioRoute(route),true,route);
});
test('new native capabilities stay unavailable, including requested flags',()=>{
 for(const name of ['tripIntent','offerDiscovery','merchantOfferPublication','smeReadBridge','matchedBriefHandoff','booking','payment'])assert.equal(capabilities({KINNSO_ENABLED_CAPABILITIES:name})[name]?.mode,'unavailable',name);
});
test('discovery_off_preserves_existing_flow',async()=>{
 const source=await readFile(new URL('../app/workroom/WorkroomShell.tsx',import.meta.url),'utf8');
 for(const store of ['creatorReportStore','travellerStore','merchantStore'])assert.ok(source.includes(store));
 assert.ok(source.includes('<ThreadWorkspace'));
});
