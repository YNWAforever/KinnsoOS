// Server-only: imports Node crypto and is used only by the two ingress routes.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
type Env=Record<string,string|undefined>;
const names=['x-kinnso-pilot-proxy-ip','x-kinnso-pilot-proxy-time','x-kinnso-pilot-proxy-signature'] as const;
function proxyKey(env:Env){
 const value=env.KINNSO_PILOT_PROXY_SECRET;
 if(!value||!/^[-_A-Za-z0-9]{43}$/.test(value))return null;
 const key=Buffer.from(value,'base64url');
 return key.length===32&&key.toString('base64url')===value?key:null;
}
export function pilotProxyConfigured(env:Env=process.env){return proxyKey(env)!==null;}
function message(ip:string,time:string,origin:string,body:string){
 return ['kinnso-pilot-proxy-v1','POST',origin+'/api/telemetry/pilot',ip,time,body].join('\n');
}
export function pilotProxyHeaders(ip:string,origin:string,body:string,env:Env=process.env,now=Date.now()):Record<string,string>|null{
 const key=proxyKey(env),time=String(Math.floor(now/1000));
 if(!key||!isIP(ip)||!/^\d{10}$/.test(time))return null;
 return {[names[0]]:ip,[names[1]]:time,[names[2]]:createHmac('sha256',key).update(message(ip,time,origin,body)).digest('hex')};
}
export function pilotProxyIdentity(request:Request,body:string,env:Env=process.env,now=Date.now()):{kind:'direct'}|{kind:'invalid'}|{kind:'verified';ip:string}{
 if(!names.some(name=>request.headers.has(name)))return{kind:'direct'};
 const key=proxyKey(env),ip=request.headers.get(names[0])??'',time=request.headers.get(names[1])??'',signature=request.headers.get(names[2])??'';
 if(!key||!isIP(ip)||!/^\d{10}$/.test(time)||!/^[a-f0-9]{64}$/.test(signature))return{kind:'invalid'};
 const seconds=Math.floor(now/1000);
 if(!Number.isSafeInteger(seconds)||Math.abs(seconds-Number(time))>60)return{kind:'invalid'};
 const expected=createHmac('sha256',key).update(message(ip,time,new URL(request.url).origin,body)).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return{kind:'invalid'};
 return{kind:'verified',ip};
}
