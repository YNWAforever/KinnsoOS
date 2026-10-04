import {publicUrl} from './migration-policy.ts';
export type UrlMapping={oldUrl:string;newUrl:string|null;disposition:'redirect'|'retain'|'gone';reason:string};
/** Validation only. No redirect is emitted without verified same-content mappings and launch approval. */
export function validateMappings(mappings:readonly UrlMapping[]):void {
 const old=new Set<string>();
 for(const m of mappings){publicUrl(m.oldUrl);if(old.has(m.oldUrl)||!m.reason.trim())throw new Error('Invalid mapping');old.add(m.oldUrl);
  if(m.disposition==='gone'){if(m.newUrl!==null)throw new Error('Gone mapping has target');}
  else if(m.disposition==='retain'){if(m.newUrl!==m.oldUrl)throw new Error('Retain must keep original canonical');}
  else if(m.disposition==='redirect'){if(!m.newUrl||m.newUrl===m.oldUrl)throw new Error('Redirect loop');publicUrl(m.newUrl);}
  else throw new Error('Invalid disposition');
 }
 const redirects=new Set(mappings.filter(m=>m.disposition==='redirect').map(m=>m.oldUrl));
 for(const m of mappings)if(m.disposition==='redirect'&&m.newUrl&&redirects.has(m.newUrl))throw new Error('Redirect chain or loop');
}
