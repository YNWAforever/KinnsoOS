import {test} from 'node:test';import assert from 'node:assert/strict';
const api=await import('../lib/trips/feasibility.ts').catch(()=>({}));
const stop={id:'stop',placeId:'place',title:'Place',position:0,travellerNote:'',startMinuteOfDay:540,durationMinutes:60,source:null};
const snapshot={id:'trip',title:'Trip',destinationId:null,timezone:'Europe/London',startDate:'2030-06-01',status:'planning',revision:1,media:[],days:[{id:'day',offset:0,title:'Day',stops:[stop]}]};
test('known opening, unknown hours, overlap and cross-day remain explicit warnings',()=>{
 assert.equal(typeof api.assessItinerary,'function');
 const facts=[{placeId:'place',timezone:'Europe/London',openingHours:[{weekday:6,openMinute:600,closeMinute:1080}],verifiedAt:'2030-05-31',sourceUrl:'https://venue.test/hours'}];
 assert.ok(api.assessItinerary(snapshot,facts,new Date('2030-06-01')).some(w=>w.code==='OUTSIDE_HOURS'));
 assert.ok(api.assessItinerary(snapshot,[],new Date('2030-06-01')).some(w=>w.code==='UNVERIFIED_HOURS'));
 const days=[{...snapshot.days[0],stops:[{...stop,durationMinutes:180},{...stop,id:'second',position:1,startMinuteOfDay:600},{...stop,id:'late',position:2,startMinuteOfDay:1430,durationMinutes:60}]}];
 const codes=api.assessItinerary({...snapshot,days},[],new Date('2030-06-01')).map(w=>w.code);assert.ok(codes.includes('OVERLAP'));assert.ok(codes.includes('CROSS_DAY'));assert.ok(codes.includes('UNKNOWN_TRAVEL'));
});
test('DST gap, fold and undated wall-clock intent are deterministic',()=>{
 const at=(date)=>({...snapshot,startDate:date,days:[{...snapshot.days[0],stops:[{...stop,startMinuteOfDay:90}]}]});
 assert.ok(api.assessItinerary(at('2030-03-31'),[]).some(w=>w.code==='DST_GAP'));
 assert.ok(api.assessItinerary(at('2030-10-27'),[]).some(w=>w.code==='DST_FOLD'));
 assert.ok(api.assessItinerary(at(null),[]).some(w=>w.code==='UNDATED'));
});
