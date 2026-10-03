'use client'
import { useEffect, useState } from 'react'

export function ArticleToc({ items, label }: { items: Array<{ id: string; title: string }>; label: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null)
  // Reset active heading when the items list changes (e.g. navigating to a new article).
  // Storing the previous items identity in state is the React-docs "adjusting state during
  // rendering" pattern — the setState during render is only called when prevItems !== items,
  // so it short-circuits immediately without triggering an extra effect.
  const [prevItems, setPrevItems] = useState(items)
  if (prevItems !== items) {
    setPrevItems(items)
    setActive(items[0]?.id ?? null)
  }
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) }),
      { rootMargin: '-30% 0px -60% 0px' },
    )
    items.forEach((it) => { const el = document.getElementById(it.id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [items])
  if (items.length === 0) return null
  return (
    <nav aria-label={label} className="text-sm">
      <p className="font-semibold mb-2">{label}</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className={active === it.id ? 'text-orange font-medium' : 'text-kinnso-muted hover:text-kinnso-ink'}>
              {it.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
