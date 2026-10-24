import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTripDay,dayDate,orderedStops,clockLabel,navigationUrl} from '../lib/trips/today.ts';
import {readDayLocations} from '../lib/trips/location-data.ts';
const placeId='11111111-1111-4111-8111-111111111111';
const trip={id:'22222222-2222-4222-8222-222222222222',revision:7,startDate:'2026-10-18',
 timezone:'Asia/Hong_Kong',days:[
  {id:'day-1',offset:0,title:'First',stops:[]},
  {id:'day-2',offset:1,title:'Second',stops:[
   {id:'later',position:1,placeId:null,startMinuteOfDay:660},
   {id:'earlier',position:0,placeId,startMinuteOfDay:545},
  ]},
 ]};

test('NEXT-01 selects the persisted day by trip calendar date and preserves saved ordering and wall-clock time',()=>{
 const selected=selectTripDay(trip,new Date('2026-10-18T16:01:00Z'));
 assert.equal(selected.today,'2026-10-19');
 assert.equal(selected.day.id,'day-2');
 assert.deepEqual(orderedStops(selected.day).map(stop=>stop.id),['earlier','later']);
 assert.equal(clockLabel(545),'09:05');
 assert.equal(clockLabel(660),'11:00');
 assert.equal(clockLabel(null),null);
 assert.equal(dayDate('2026-10-18',1),'2026-10-19');
 assert.equal(trip.days[1].stops[0].id,'later');
});
test('NEXT-02 handles midnight, DST, undated and out-of-range dates without guessing',()=>{
 assert.equal(selectTripDay(trip,new Date('2026-10-18T15:59:59Z')).day.id,'day-1');
 assert.equal(selectTripDay(trip,new Date('2026-10-18T16:00:00Z')).day.id,'day-2');
 assert.equal(selectTripDay(trip,new Date('2026-10-19T16:00:00Z')).day,null);
 assert.equal(selectTripDay({...trip,startDate:null},new Date('2026-10-18T16:00:00Z')).reason,'undated');
 assert.equal(selectTripDay({...trip,startDate:null},new Date('2026-10-18T16:00:00Z'),'day-2').day.id,'day-2');
 assert.equal(selectTripDay(trip,new Date('2026-10-18T16:00:00Z'),'foreign-day').day,null);
 assert.equal(selectTripDay({...trip,timezone:'not/a/zone'},new Date('2026-10-18T16:00:00Z')).reason,'invalid');
 const dst={...trip,startDate:'2026-11-01',timezone:'America/New_York'};
 assert.equal(selectTripDay(dst,new Date('2026-11-01T05:30:00Z')).day.id,'day-1');
 assert.equal(selectTripDay(dst,new Date('2026-11-01T06:30:00Z')).day.id,'day-1');
 assert.equal(dayDate('2026-11-01',1),'2026-11-02');
 assert.equal(dayDate('2026-02-30',0),null);
});
test('NEXT-03 opens only finite coordinate pairs and never exports trip or private fields',()=>{
 const result=navigationUrl({lat:22.3193,lng:114.1694,title:'private title',travellerNote:'private note'});
 assert.equal(result,'https://www.google.com/maps/dir/?api=1&destination=22.3193%2C114.1694');
 assert.equal(navigationUrl({lat:0,lng:0}),'https://www.google.com/maps/dir/?api=1&destination=0%2C0');
 for(const invalid of [{lat:null,lng:0},{lat:0,lng:null},{lat:91,lng:0},{lat:0,lng:181},
  {lat:NaN,lng:0},{lat:0,lng:Infinity},{lat:'22.3',lng:114.1}])assert.equal(navigationUrl(invalid),null);
 assert.deepEqual([...new URL(result).searchParams.keys()],['api','destination']);
});

function clientFor(snapshot=trip,rows=[],rpcError=null) {
 const calls=[];
 const client={
  async rpc(name,args){calls.push({operation:'rpc',name,args});return{data:snapshot,error:rpcError}},
  from(table){const query={table};calls.push(query);return{
   select(columns){query.columns=columns;return{
    in(column,ids){query.column=column;query.ids=ids;return{
     async eq(field,value){query.filter={field,value};return{error:null,data:rows.filter(row=>ids.includes(row.id)&&row.status===value)}},
    }},
   }},
  }},
 };
 return{client,calls};
}
test('NEXT-03 data read checks trip ownership before querying any location',async()=>{
 const {client,calls}=clientFor(null,[],{message:'trip_not_found'});
 const result=await readDayLocations(client,trip.id,'day-2');
 assert.equal(result.error.message,'trip_not_found');
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'get_trip_snapshot');
});
test('NEXT-03 data read rejects a day outside the owned trip before querying places',async()=>{
 const {client,calls}=clientFor();
 const result=await readDayLocations(client,trip.id,'foreign-day');
 assert.equal(result.error.message,'trip_not_found');
 assert.equal(calls.length,1);
});
test('NEXT-03 data read returns only allowlisted active canonical fields for the selected day',async()=>{
 const {client,calls}=clientFor(trip,[
  {id:placeId,name:'Canonical name',formatted_address:'Canonical address',lat:22.3,lng:114.1,
   status:'active',created_by_user_id:'must not leak',provider_place_id:'must not leak'},
  {id:'unrelated',name:'Other',lat:1,lng:2,status:'active'},
 ]);
 const result=await readDayLocations(client,trip.id,'day-2');
 assert.equal(result.error,null);
 assert.deepEqual(result.data,{tripId:trip.id,dayId:'day-2',revision:7,places:[
  {placeId,name:'Canonical name',address:'Canonical address',lat:22.3,lng:114.1},
 ]});
 assert.deepEqual(calls[1].ids,[placeId]);
 assert.equal(calls[1].table,'places');
 assert.equal(calls[1].columns,'id,name,formatted_address,lat,lng');
 assert.deepEqual(calls[1].filter,{field:'status',value:'active'});
});
test('NEXT-03 data read does not turn hidden, merged or malformed coordinates into navigation',async()=>{
 const {client}=clientFor(trip,[{id:placeId,name:'Hidden',lat:1,lng:2,status:'hidden'}]);
 assert.deepEqual((await readDayLocations(client,trip.id,'day-2')).data.places,[]);
 const invalid=clientFor(trip,[{id:placeId,name:'Invalid',lat:999,lng:114,status:'active'}]);
 const place=(await readDayLocations(invalid.client,trip.id,'day-2')).data.places[0];
 assert.equal(place.lat,null);
 assert.equal(place.lng,null);
 assert.equal(navigationUrl(place),null);
});
