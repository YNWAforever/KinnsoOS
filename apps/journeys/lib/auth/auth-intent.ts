import {safeReturnPath} from './return-path.ts';
export type AuthIntent={locale:'en'|'zh-HK';flow:'sign-in'|'sign-up'|'recovery';next:string};
export type AuthEntry='sign-in'|'sign-up'|'forgot-password'|'reset-password';
export function parseAuthIntent(params:URLSearchParams,locale:string):AuthIntent{
 const language=locale==='zh-HK'?'zh-HK':'en';
 const flow=params.get('flow');
 return{locale:language,flow:flow==='sign-up'||flow==='recovery'?flow:'sign-in',next:safeReturnPath(params.get('next'),language)};
}
export function authPath(intent:AuthIntent,entry:AuthEntry,state:Record<string,string>={}):string{
 const params=new URLSearchParams({...state,next:safeReturnPath(intent.next,intent.locale)});
 return`/${intent.locale}/${entry}?${params}`;
}
export function authCallbackUrl(intent:AuthIntent,origin:string):string{
 const url=new URL('/callback',origin);
 url.search=new URLSearchParams({locale:intent.locale,flow:intent.flow,next:safeReturnPath(intent.next,intent.locale)}).toString();
 return url.href;
}
