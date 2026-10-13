import{readdir,readFile}from'node:fs/promises';import path from'node:path';
/** Resolve an actual emitted tool asset; bootstrap stays on the browser's native transport. */
export async function findOwnedToolChunk(directory,marker){
 if(typeof marker!=='string'||!marker)throw Error('OWNED_TOOL_CHUNK_NOT_UNIQUE');
 const matches=[];for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.js')&&(await readFile(path.join(directory,entry.name),'utf8')).includes(marker))matches.push(entry.name);
 if(matches.length!==1)throw Error('OWNED_TOOL_CHUNK_NOT_UNIQUE');return matches[0];
}
/** One intercepted request, no retry; protect local credentials from SDK error logs. */
export async function fetchOwnedRoute(route,kind){
 const request=route.request(),url=new URL(request.url());
 const allowed=url.origin==='http://127.0.0.1:3495'&&!url.search&&!url.hash&&((kind==='asset'&&request.method()==='GET'&&url.pathname.startsWith('/_next/static/chunks/')&&url.pathname.endsWith('.js'))||(kind==='merchant-command'&&request.method()==='POST'&&url.pathname==='/api/merchant'));
 if(!allowed)throw Error('OWNED_ROUTE_OUT_OF_SCOPE');
 const options={maxRetries:0,...kind==='asset'?{headers:{...request.headers(),cookie:'',authorization:''}}:{}};
 try{return await route.fetch(options);}catch(error){throw Error(String(error?.message??'').includes('ECONNRESET')?'OWNED_ROUTE_ECONNRESET_NO_RETRY':'OWNED_ROUTE_TRANSPORT_FAILED_NO_RETRY');}
}