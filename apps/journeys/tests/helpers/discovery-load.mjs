import {existsSync} from 'node:fs';
import {build} from 'esbuild';
export async function discoveryModule(name,folder='discovery') {
 const url=new URL(`../../lib/${folder}/${name}.ts`,import.meta.url);
 if(!existsSync(url))return {};
 const result=await build({entryPoints:[url.pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,platform:'node',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
