import type {GuideSnapshot,GuideSummary,TripSnapshot} from '../contracts/trips';
export function adoptionPreview(guide:GuideSnapshot|GuideSummary,trip:TripSnapshot){
 if(guide.kind!=='itinerary')return null;
 const stops=trip.days.flatMap(day=>day.stops);
 return {tripId:trip.id,tripTitle:trip.title,revision:trip.revision,guideVersion:guide.version,
  existingVersions:[...new Set(stops.filter(stop=>stop.source?.guideId===guide.id).map(stop=>stop.source!.guideVersion))].sort((a,b)=>a-b),
  daysBefore:trip.days.length,daysAfter:trip.days.length+guide.days.length,
  stopsAdded:guide.days.reduce((sum,day)=>sum+day.stops.length,0),
  privateNotesKept:stops.filter(stop=>stop.travellerNote.length>0).length};
}
