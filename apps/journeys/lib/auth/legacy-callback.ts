import {safeReturnPath} from './return-path.ts';
import {legacyEntry} from '../routing/legacy-entry.ts';

/** Internal handler delegation only: never emit a redirect containing provider credentials. */
export function prepareLegacyAuthCallback(request:Request,rawLocale:string):Request|null{
 if(request.method!=='GET'||!['en','zh-hk','zh-HK'].includes(rawLocale))return null;
 const locale=rawLocale==='en'?'en':'zh-HK',url=new URL(request.url),params=url.searchParams;
 if(['code','token_hash','type','flow','next','locale'].some(key=>params.getAll(key).length>1)||(params.has('code')&&params.has('token_hash')))return null;
 const raw=params.get('next');
 const next=safeReturnPath(raw===null?`/${locale}/studio`:raw.replace(/^\/zh-hk(?=\/|$)/,'/zh-HK'),locale);
 const local=new URL(next,url.origin),entry=legacyEntry(local.pathname,'GET');
 if(entry)local.pathname=entry.pathname;
 url.pathname='/auth/callback';params.set('locale',locale);params.set('next',local.pathname+local.search+local.hash);
 return new Request(url,{method:'GET',headers:request.headers});
}
