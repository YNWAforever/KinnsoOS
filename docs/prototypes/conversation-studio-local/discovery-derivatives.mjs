// Immutable field bindings installed synchronously by the ORIGINAL fixture domain writers.
// Reads project away withdrawn licensed fields; stored guide/trip/share snapshots never mutate.
export function createDerivativeRegistry(discovery){
 const records=[];
 const all=()=>structuredClone(records);
 const guideRows=(id,version)=>records.filter(b=>b.targetKind==='guide_version'&&b.targetId===id&&b.targetVersion===version);
 const stopRows=id=>records.filter(b=>b.targetKind==='trip_stop'&&b.targetId===id);
 const dayRows=id=>records.filter(b=>b.targetKind==='trip_day'&&b.targetId===id);
 function sourceBinding(sourceId,purpose,target){const grant=discovery.sourceGrant(sourceId,purpose,{requireFresh:true});if(!grant)throw Error('RESTRICTED');return {...target,sourceId,publicationId:grant.publicationId,publicationContentVersion:grant.publicationContentVersion,grantId:grant.id,grantVersion:grant.grantVersion};}
 function allowed(row,purpose){const grant=discovery.sourceGrant(row.sourceId,purpose);return !!grant&&grant.id===row.grantId&&grant.grantVersion===row.grantVersion;}
 function install(rows){for(const row of rows){const prior=records.find(r=>r.targetKind===row.targetKind&&r.targetId===row.targetId&&r.targetVersion===row.targetVersion&&r.fieldPath===row.fieldPath&&r.sourceId===row.sourceId);if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('CONFLICT');}for(const row of rows)if(!records.some(r=>JSON.stringify(r)===JSON.stringify(row)))records.push(structuredClone(row));}
 function prepareGuide(snapshot,brief,blockIds,sources){
  const selected=brief.blocks.filter(b=>blockIds.includes(b.id)),licensed=sources.filter(s=>s.rights==='licensed'&&selected.some(b=>b.sources.some(r=>r.sourceId===s.id))),rows=[];
  if(!licensed.length)return rows;
  const own=selected.filter(b=>b.sources.every(r=>sources.find(s=>s.id===r.sourceId)?.rights==='own'));
  // Free-form metadata has no independent per-field provenance in the original editor.
  // Keep its immutable bytes, but conservatively bind it whenever licensed blocks are used.
  for(const s of licensed){
   const target={targetKind:'guide_version',targetId:snapshot.id,targetVersion:snapshot.version,upstreamGuideId:snapshot.id,upstreamGuideVersion:snapshot.version};
   for(const fieldPath of ['title','summary','city'])if(snapshot[fieldPath])rows.push(sourceBinding(s.id,'public_guide',{...target,fieldPath}));
   for(const [di,day]of snapshot.days.entries())if(day.title)rows.push(sourceBinding(s.id,'public_guide',{...target,fieldPath:`days.${di}.title`}));
  }
  for(const [di,day] of snapshot.days.entries())for(const [si,stop] of day.stops.entries()){
   if(own.some(b=>b.title===stop.title&&b.text===stop.description))continue;
   // Changed or inseparable text retains all licensed lineage; editing is never a rights reset.
   for(const s of licensed)for(const field of ['title','description'])rows.push(sourceBinding(s.id,'public_guide',{targetKind:'guide_version',targetId:snapshot.id,targetVersion:snapshot.version,fieldPath:`days.${di}.stops.${si}.${field}`,upstreamGuideId:snapshot.id,upstreamGuideVersion:snapshot.version,upstreamStopId:stop.id}));
  }return rows;
 }
 function projectGuide(snapshot){const value=structuredClone(snapshot),rows=guideRows(snapshot.id,snapshot.version);if(!rows.length)return value;
  for(const field of ['title','summary','city'])if(rows.some(r=>r.fieldPath===field&&!allowed(r,'public_guide')))value[field]=field==='title'?'部分來源已受限':'';
  for(const [di,day]of value.days.entries())if(rows.some(r=>r.fieldPath===`days.${di}.title`&&!allowed(r,'public_guide')))day.title='部分來源已受限';
  for(const [di,day]of value.days.entries())day.stops=day.stops.filter((s,si)=>!rows.some(r=>r.fieldPath.startsWith(`days.${di}.stops.${si}.`)&&!allowed(r,'public_guide')));
  value.days=value.days.filter(d=>d.stops.length);return value.days.length?value:null;
 }
 function assertAdoptable(guide,{requireFresh=true}={}){for(const row of guideRows(guide.id,guide.version))if(!discovery.sourceGrant(row.sourceId,'trip_adoption',{requireFresh}))throw Error('RESTRICTED');}
 function prepareAdoption(guide,addedDays,revision){assertAdoptable(guide);const rows=[];
  for(const [di,day]of guide.days.entries())for(const original of guideRows(guide.id,guide.version).filter(r=>r.fieldPath===`days.${di}.title`))rows.push(sourceBinding(original.sourceId,'trip_adoption',{targetKind:'trip_day',targetId:addedDays[di].id,targetVersion:revision,fieldPath:'title',upstreamGuideId:guide.id,upstreamGuideVersion:guide.version}));
  for(const [di,day]of guide.days.entries())for(const [si,stop]of day.stops.entries())for(const original of guideRows(guide.id,guide.version).filter(r=>r.fieldPath===`days.${di}.stops.${si}.description`)){
   const target=addedDays[di].stops[si];for(const field of ['title','sourceDescription'])rows.push(sourceBinding(original.sourceId,'trip_adoption',{targetKind:'trip_stop',targetId:target.id,targetVersion:revision,fieldPath:field,upstreamGuideId:guide.id,upstreamGuideVersion:guide.version,upstreamStopId:stop.id}));
  }return rows;
 }
 function projectTrip(trip){const value=structuredClone(trip);for(const d of value.days)if(dayRows(d.id).some(r=>!allowed(r,'trip_adoption')))d.title='來源授權已撤回';for(const s of value.days.flatMap(d=>d.stops)){const rows=stopRows(s.id);if(rows.some(r=>!allowed(r,'trip_adoption'))){s.title='來源授權已撤回';s.sourceDescription='';if(s.source)s.source.withdrawn=true;}}return value;}
 function assertShareable(stopIds,{requireFresh=true,days=[]}={}){const rows=[...stopIds.flatMap(stopRows),...days.filter(d=>d.stops.some(s=>stopIds.includes(s.id))).flatMap(d=>dayRows(d.id))];for(const r of rows)if(!discovery.sourceGrant(r.sourceId,'trip_share',{requireFresh}))throw Error('RESTRICTED');}
 function prepareShare(id,projection){assertShareable(projection.days.flatMap(d=>d.stops.map(s=>s.id)),{days:projection.days});const rows=[];for(const [di,day]of projection.days.entries()){
  for(const r of dayRows(day.id))rows.push(sourceBinding(r.sourceId,'trip_share',{targetKind:'share_projection',targetId:id,targetVersion:1,fieldPath:`days.${di}.title`,upstreamGuideId:r.upstreamGuideId,upstreamGuideVersion:r.upstreamGuideVersion}));
  for(const [si,stop]of day.stops.entries())for(const r of stopRows(stop.id).filter(r=>r.fieldPath==='sourceDescription'))for(const field of ['title','description'])rows.push(sourceBinding(r.sourceId,'trip_share',{targetKind:'share_projection',targetId:id,targetVersion:1,fieldPath:`days.${di}.stops.${si}.${field}`,upstreamGuideId:r.upstreamGuideId,upstreamGuideVersion:r.upstreamGuideVersion,upstreamStopId:r.upstreamStopId}));
 }return rows;}
 function projectShare(id,projection){const value=structuredClone(projection),rows=records.filter(r=>r.targetKind==='share_projection'&&r.targetId===id);for(const [di,day]of value.days.entries()){if(rows.some(r=>r.fieldPath===`days.${di}.title`&&!allowed(r,'trip_share')))day.title='來源授權已撤回';day.stops=day.stops.filter((s,si)=>!rows.some(r=>r.fieldPath.startsWith(`days.${di}.stops.${si}.`)&&!allowed(r,'trip_share')));}value.days=value.days.filter(d=>d.stops.length);return value.days.length?value:null;}
 return {all,install,prepareGuide,projectGuide,assertAdoptable,prepareAdoption,projectTrip,assertShareable,prepareShare,projectShare,guideRows,stopRows};
}
