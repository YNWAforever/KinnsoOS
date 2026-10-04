import React from 'react'

/** Only allow http(s) links from CMS-authored structured fields (these bypass cleanHtml). */
function safeHref(url?: string): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

export function DetailBox({
  id, title, time, price, phone, address, website,
}: {
  id: string; title?: string; time?: string; price?: string; phone?: string
  address?: { label?: string; link?: string }; website?: { label?: string; link?: string }
}) {
  const rows: Array<[string, React.ReactNode]> = []
  if (time) rows.push(['🕑', time])
  if (price) rows.push(['💰', price])
  if (phone) rows.push(['📞', phone])
  const addressHref = safeHref(address?.link)
  if (address?.label)
    rows.push(['📍', addressHref
      ? <a href={addressHref} target="_blank" rel="noopener noreferrer nofollow" className="text-info underline">{address.label}</a>
      : address.label])
  const websiteHref = safeHref(website?.link)
  if (website?.label)
    rows.push(['🔗', websiteHref
      ? <a href={websiteHref} target="_blank" rel="noopener noreferrer nofollow" className="text-info underline">{website.label}</a>
      : website.label])
  return (
    <section id={id} className="scroll-mt-24 mb-8 rounded-card border border-kinnso-cream2 p-5">
      {title && <h3 className="text-lg font-bold text-kinnso-ink mb-3">{title}</h3>}
      <dl className="grid gap-2">
        {rows.map(([icon, val]) => (
          <div key={icon as string} className="flex gap-2"><dt aria-hidden>{icon}</dt><dd>{val}</dd></div>
        ))}
      </dl>
    </section>
  )
}
