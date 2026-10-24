import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness} from './helpers/workspace-harness.mjs';
const report={day:'2026-10-22',funnel:[],performance:[],budgets:[],scheduledRuns:[]};
test('Ops can correlate a failed latest attempt with the preserved last success and owner/runbook',async()=>{
 const job={job:'collaboration_reminders',lastStatus:'failed',lastAttemptAt:'2026-10-22T10:00:00Z',lastSuccessAt:'2026-10-21T10:00:00Z',owner:'Ops owner reference',runbook:'PILOT_SUPPORT_RUNBOOK.md'};
 const h=await workspaceHarness('MonitoringWorkspace',{request:async()=>({ok:true,data:{...report,scheduledRuns:[job]}})});
 assert.match(h.text(),/2026-10-22T10:00:00Z/);assert.match(h.text(),/2026-10-21T10:00:00Z/);assert.match(h.text(),/Ops owner reference/);assert.match(h.text(),/PILOT_SUPPORT_RUNBOOK.md/);
});
test('missing job outcome remains unknown and never establishes a successful schedule',async()=>{
 const h=await workspaceHarness('MonitoringWorkspace',{request:async()=>({ok:true,data:{...report,scheduledRuns:[{job:'notifications',lastStatus:null,lastAttemptAt:null,lastSuccessAt:null,owner:'Not assigned',runbook:''}]}})});
 assert.match(h.text(),/Unknown.*no result recorded/);assert.doesNotMatch(h.text(),/healthy|All jobs succeeded/);
});
