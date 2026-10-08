export function invitationToken(fragment:string):string|null {
  return fragment.length===72 && /^#invite=[0-9a-f]{64}$/.test(fragment) ? fragment.slice(8) : null;
}
export function newInvitationToken(random:Pick<Crypto,'getRandomValues'>=globalThis.crypto):string {
  const bytes=random.getRandomValues(new Uint8Array(32));
  return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
export function invitationLink(origin:string,locale:string,token:string):string {
  if(!['en','zh-HK','zh-CN'].includes(locale)||!invitationToken('#invite='+token))throw new Error('INVALID');
  const base=new URL(origin);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('INVALID');
  return `${base.origin}/${locale}/merchant/invitation#invite=${token}`;
}
