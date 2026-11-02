import {existsSync} from 'node:fs';
import {build} from 'esbuild';
export async function studioModule(name) {
 const path=new URL('../../lib/studio/'+name+'.ts',import.meta.url);
 if(!existsSync(path))return{};
 const result=await build({entryPoints:[path.pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,platform:'node',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
