import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Eyebrow } from './Eyebrow'

/**
 * Magazine-style card: media band on top, hairline border, generous text block.
 * `media` is a slot (pass your own <Image>) so this stays a dumb server component
 * and tests never need a next/image mock. The media child must fill the 4:3 box
 * (e.g. next/image `fill` + `object-cover`) or it letterboxes on the sand background.
 */
export function EditorialCard({
  media,
  kicker,
  title,
  titleAs: TitleTag = 'h3',
  children,
  footer,
  className = '',
}: {
  media?: ReactNode
  kicker?: ReactNode
  title: string
  titleAs?: 'h2' | 'h3' | 'h4'
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <article className={cn('k2-card flex flex-col', className)}>
      {media ? (
        <div data-slot="media" className="aspect-[4/3] w-full overflow-hidden bg-kinnso-cream2">
          {media}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5">
        {kicker ? <Eyebrow>{kicker}</Eyebrow> : null}
        <TitleTag className="k2-display text-xl font-semibold text-kinnso-ink">{title}</TitleTag>
        {children ? <div className="text-sm leading-relaxed text-kinnso-ink/70">{children}</div> : null}
        {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
      </div>
    </article>
  )
}
