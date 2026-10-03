import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * R1A editorial band: consistent max-width + vertical rhythm for every
 * editorial-journal surface. Server component — no client state.
 */
export function SectionShell({
  as: Tag = 'section',
  className = '',
  children,
  ...rest
}: {
  as?: 'section' | 'div' | 'header'
  className?: string
  children: ReactNode
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn('py-14 md:py-20', className)} {...rest}>
      <div className="k2-container">{children}</div>
    </Tag>
  )
}
