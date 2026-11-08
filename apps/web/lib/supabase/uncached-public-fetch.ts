/** Public guide rights can expire between requests. Never persist response bytes. */
export function uncachedPublicFetch(transport:typeof fetch=fetch):typeof fetch {
 return (input,init)=>transport(input,{...init,cache:'no-store',next:{revalidate:0}});
}
