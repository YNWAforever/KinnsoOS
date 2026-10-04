import type {PublicArticle} from './public-article';
import {articleCanonical,articleStructuredData} from './article-presentation';
/** HTML is sanitized in the anonymous server reader before crossing the SSR/hydration boundary. */
export function PublicArticleContent({article,locale}:{article:PublicArticle;locale:'en'|'zh-HK'}) {
 let number=0;
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:articleStructuredData(article)}}/>
  <article className="k-page" lang={article.locale==='zh-hk'?'zh-Hant-HK':'en'}>
   <h1>{article.title}</h1>{article.author&&<p>{article.author}</p>}<time dateTime={article.publishedAt}>{article.publishedAt.slice(0,10)}</time>
   {article.coverImage&&<img src={article.coverImage} alt={article.title} fetchPriority="high" style={{maxWidth:'100%',height:'auto'}}/>}
   {article.summary&&<p>{article.summary}</p>}
   {article.blocks.map((block,index)=><section key={index} id={'article-block-'+index}>
    {block.title&&<h2>{block.type==='number-box'&&<span aria-hidden="true">{++number}. </span>}{block.title}</h2>}
    {block.subtitle&&<p>{block.subtitle}</p>}
    {block.image&&<img src={block.image} alt={block.title} loading="lazy" style={{maxWidth:'100%',height:'auto'}}/>}
    {block.html&&<div dangerouslySetInnerHTML={{__html:block.html}}/>}
    {block.fields.map((field,index)=><p key={index}>{field.href?<a href={field.href} rel="noopener noreferrer nofollow">{field.label}</a>:field.label}</p>)}
    {block.images.map((image,index)=><figure key={index}><img src={image.url} alt={image.description} loading="lazy" style={{maxWidth:'100%',height:'auto'}}/>{image.description&&<figcaption>{image.description}</figcaption>}</figure>)}
   </section>)}
   {article.faqs.length>0&&<section><h2>{locale==='en'?'Questions and answers':'常見問題'}</h2><dl>{article.faqs.map((faq,index)=><div key={index}><dt>{faq.question}</dt><dd>{faq.answer}</dd></div>)}</dl></section>}
   <a href={articleCanonical(article)}>{locale==='en'?'View original article':'查看原文'}</a>
  </article></>;
}
