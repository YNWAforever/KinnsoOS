import {verifyTestTarget} from './verify-test-target.mjs';

const mailboxOrigin = 'http://127.0.0.1:58424';
const appOrigin = 'http://127.0.0.1:3495';
function blocked() { throw Error('BLOCKED: owned local email capture contract required'); }
export function verifyMailboxTarget(env = process.env) {
 const target = verifyTestTarget(env);
 if (env.KINNSO_TEST_MAILBOX_ORIGIN !== mailboxOrigin || env.KINNSO_TEST_EMAIL_CONFIRMATION !== 'required') blocked();
 return {...target, mailboxOrigin, authContainer:'supabase_auth_'+target.projectRef, mailboxContainer:'supabase_inbucket_'+target.projectRef};
}
export function verifyMailboxRuntime(env, auth, mailbox) {
 const target = verifyMailboxTarget(env);
 for (const [value, name] of [[auth,target.authContainer],[mailbox,target.mailboxContainer]]) {
  if (value?.Name !== '/'+name || value?.State?.Running !== true || value?.Config?.Labels?.['com.supabase.cli.project'] !== target.projectRef) blocked();
 }
 const settings = Object.fromEntries((auth.Config.Env ?? []).map(value => {const index=value.indexOf('=');return [value.slice(0,index),value.slice(index+1)];}));
 if (settings.GOTRUE_MAILER_AUTOCONFIRM !== 'false' || settings.GOTRUE_SMTP_HOST !== target.mailboxContainer || settings.GOTRUE_SMTP_PORT !== '1025') blocked();
 if ((mailbox.Config.Env ?? []).some(value => /^MP_SMTP_RELAY_/.test(value))) blocked();
 return target;
}
function syntheticAddress(email) {
 if (typeof email !== 'string' || !/^synthetic-[a-z0-9-]{1,120}@example\.test$/.test(email)) blocked();
}
function recipient(message, email) {
 return Array.isArray(message?.To) && message.To.length === 1 && message.To[0]?.Address === email;
}
export function selectCapturedMessage(list, email) {
 syntheticAddress(email);
 if (!Array.isArray(list?.messages) || list.messages.length > 6) blocked();
 const matching = list.messages.filter(message => message?.To?.some(address => address?.Address === email));
 if (matching.length === 0) return null;
 if (matching.length !== 1 || !recipient(matching[0],email) || !/^[a-zA-Z0-9-]{1,128}$/.test(matching[0].ID)) blocked();
 return matching[0].ID;
}
export function capturedConfirmationLink(message, email, intent, env = process.env) {
 const target = verifyMailboxTarget(env); syntheticAddress(email);
 if (!recipient(message,email) || typeof message.HTML !== 'string' || message.HTML.length > 32768) blocked();
 if (!['en','zh-HK'].includes(intent.locale) || !['sign-up','recovery'].includes(intent.flow) || typeof intent.next !== 'string') blocked();
 const links = [...message.HTML.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
 if (links.length !== 1 || links[0][1].length > 8192) blocked();
 let url, redirect;
 try {url = new URL(links[0][1].replaceAll('&amp;','&').replaceAll('&#38;','&')); redirect = new URL(url.searchParams.get('redirect_to'));} catch {blocked();}
 if (url.origin !== target.apiOrigin || url.pathname !== '/auth/v1/verify' || url.username || url.password || url.hash) blocked();
 const token = url.searchParams.get('token');
 if (!token || token.length > 2048 || url.searchParams.get('type') !== (intent.flow === 'recovery' ? 'recovery':'signup')) blocked();
 if (redirect.origin !== appOrigin || redirect.pathname !== '/callback' || redirect.username || redirect.password || redirect.hash) blocked();
 for (const [key,value] of Object.entries(intent)) if (redirect.searchParams.getAll(key).length !== 1 || redirect.searchParams.get(key) !== value) blocked();
 return url.href;
}
async function readJson(url) {
 try {
  const response = await fetch(url,{redirect:'error',signal:AbortSignal.timeout(2000)});
  if (!response.ok || Number(response.headers.get('content-length')) > 131072) blocked();
  const text = await response.text(); if (text.length > 131072) blocked();
  return JSON.parse(text);
 } catch {throw Error('Local captured email metadata unavailable');}
}
/** Only synthetic recipients on the guarded local mailbox; no latest fallback, relay, raw-mail artifact or token log. */
export async function readCapturedConfirmation(email, intent, env = process.env) {
 const target = verifyMailboxTarget(env); syntheticAddress(email);
 const deadline = Date.now()+20000;
 while (Date.now() < deadline) {
  const search = new URL('/api/v1/search',target.mailboxOrigin);
  search.search = new URLSearchParams({query:'to:'+email,limit:'6'}).toString();
  const id = selectCapturedMessage(await readJson(search.href),email);
  if (id) return capturedConfirmationLink(await readJson(new URL('/api/v1/message/'+id,target.mailboxOrigin).href),email,intent,env);
  await new Promise(resolve => setTimeout(resolve,500));
 }
 throw Error('Local confirmation email was not captured within the bounded wait');
}
