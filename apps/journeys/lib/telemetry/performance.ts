export const metricNames=['request','query','LCP','INP','CLS'] as const;
export type MetricName=typeof metricNames[number];
export type Sample={metric:MetricName;value:number};
export function parseSample(value:unknown):Sample|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['metric','value'].includes(k))||!metricNames.includes(v.metric as MetricName)||typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<0||v.value> (v.metric==='CLS'?100:600000))return null;
 return{metric:v.metric as MetricName,value:v.value};
}
export function summarizeSamples(values:number[],minimum=20):{status:'unknown'|'insufficient'|'measured';count:number;p75:number|null} {
 if(!Number.isInteger(minimum)||minimum<1||values.some(v=>!Number.isFinite(v)||v<0))throw new Error('INVALID_SAMPLE');
 if(!values.length)return{status:'unknown',count:0,p75:null};
 if(values.length<minimum)return{status:'insufficient',count:values.length,p75:null};
 const sorted=[...values].sort((a,b)=>a-b);
 return{status:'measured',count:values.length,p75:sorted[Math.ceil(sorted.length*.75)-1]};
}
/** Sink errors never turn a failed query into success or interrupt a successful product action. */
export async function measure<T>(metric:'request'|'query',work:()=>Promise<T>,sink:(sample:Sample)=>Promise<unknown>,clock=()=>performance.now()):Promise<T> {
 const start=clock();
 try{return await work();}
 finally{const sample=parseSample({metric,value:Math.max(0,clock()-start)});if(sample)try{await sink(sample);}catch{/* Measurement unavailable. */}}
}
