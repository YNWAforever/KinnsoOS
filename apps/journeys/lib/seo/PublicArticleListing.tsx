import Link from 'next/link';
import type {PublicLanguage} from './public-language';
import {articleLabels} from './article-labels';
import {articleCategories,type ArticleCategory,type ArticleListing} from './article-listing';

export function ArticleCards({listing,headingLevel=2}:{listing:ArticleListing;headingLevel?:2|3}){
 const Heading=headingLevel===2?'h2':'h3';
 return <ul className="k-card-grid" role="list" style={{listStyle:'none',padding:0}}>{listing.items.map(item=><li className="k-adventure-card" key={item.slug}><div className="k-card-body">{item.canOpen?<Link href={item.href}>{item.image&&<img src={item.image} alt="" loading="lazy" style={{maxWidth:'100%',height:'auto'}}/>}<Heading>{item.title}</Heading></Link>:<Heading><code>{item.slug}</code></Heading>}{item.summary&&<p>{item.summary}</p>}</div></li>)}</ul>;
}
export function PublicArticleListing({locale,category,listing}:{locale:PublicLanguage;category:ArticleCategory;listing:ArticleListing}){
 const labels=articleLabels[locale],base=`/${locale}/articles/${category}`;
 const pageHref=(page:number)=>{const query=new URLSearchParams({page:String(page)});for(const key of ['q','region','tag'] as const)if(listing.query[key])query.set(key,listing.query[key]!);return`${base}?${query}`;};
 return <main className="k-page"><Link href={`/${locale}/articles`}>{labels.title}</Link><h1>{labels.categories[category]}</h1>
  <nav className="k-collab-nav" aria-label={labels.title}>{(Object.keys(articleCategories) as ArticleCategory[]).map(key=><Link key={key} href={`/${locale}/articles/${key}`} aria-current={key===category?'page':undefined}>{labels.categories[key]} </Link>)}</nav>
  <form className="k-form" style={{marginBlock:24}} action={base} method="get"><label>{labels.listing.searchPlaceholder}<input type="search" name="q" maxLength={200} defaultValue={listing.query.q??''}/></label><label>{labels.listing.filterRegion}<input name="region" maxLength={120} defaultValue={listing.query.region??''}/></label><label>{labels.listing.filterTag}<input name="tag" maxLength={120} defaultValue={listing.query.tag??''}/></label><button className="k-btn primary" type="submit">{labels.listing.searchPlaceholder}</button></form>
  <p>{listing.total} {labels.listing.resultsCount}</p>{listing.items.length?<ArticleCards listing={listing}/>:<p>{labels.listing.noResults}</p>}
  <nav className="k-collab-nav" aria-label={labels.pagination.page}>{listing.page>1&&<Link href={pageHref(listing.page-1)}>{labels.pagination.prev}</Link>} <span>{labels.pagination.page} {listing.page}</span> {listing.page*listing.perPage<listing.total&&listing.page<10000&&<Link href={pageHref(listing.page+1)}>{labels.pagination.next}</Link>}</nav>
 </main>;
}
export function PublicArticlesHub({locale,sections}:{locale:PublicLanguage;sections:{category:ArticleCategory;listing:ArticleListing}[]}){
 const labels=articleLabels[locale];return <main className="k-page"><h1>{labels.title}</h1><nav className="k-collab-nav" aria-label={labels.title}>{sections.map(({category})=><Link key={category} href={`/${locale}/articles/${category}`}>{labels.categories[category]} </Link>)}</nav>
 {sections.map(({category,listing})=><section key={category}><h2><Link href={`/${locale}/articles/${category}`}>{labels.categories[category]}</Link></h2>{listing.items.length?<ArticleCards listing={listing} headingLevel={3}/>:<p>{labels.listing.noResults}</p>}</section>)}
 </main>;
}
