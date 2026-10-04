import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PolymorphicProps<T extends ElementType> = {
  as?: T
  children: ReactNode
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

export function RouteStamp({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('k-route-stamp', className)}>
      {children}
    </span>
  )
}

export function TicketDivider({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('k-ticket-divider', className)} />
}

export function TicketCard<T extends ElementType = 'div'>({
  as,
  children,
  className,
  ...props
}: PolymorphicProps<T>) {
  const Component = (as || 'div') as ElementType
  return (
    <Component className={cn('k-ticket', className)} {...props}>
      {children}
    </Component>
  )
}

export function RouteMarkers({
  points,
  className,
}: {
  points: string[]
  className?: string
}) {
  return (
    <div className={cn('k-route-markers', className)}>
      <span aria-hidden="true" className="k-route-markers__rail">
        {points.map((point) => (
          <span key={point} className="k-route-markers__dot" />
        ))}
      </span>
      <span className="k-route-markers__labels">
        {points.map((point) => (
          <span key={point}>{point}</span>
        ))}
      </span>
    </div>
  )
}

export function ReceiptRow({
  label,
  value,
  meta,
  tone = 'default',
  className,
}: {
  label: ReactNode
  value: ReactNode
  meta?: ReactNode
  tone?: 'default' | 'positive' | 'accent'
  className?: string
}) {
  return (
    <div className={cn('k-receipt-row', className)}>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-kinnso-ink">{label}</div>
        {meta && <div className="mt-0.5 text-xs text-kinnso-muted">{meta}</div>}
      </div>
      <div
        className={cn(
          'k-mono shrink-0 text-sm font-black tabular-nums text-kinnso-ink',
          tone === 'positive' && 'text-kinnso-green',
          tone === 'accent' && 'text-kinnso-orange',
        )}
      >
        {value}
      </div>
    </div>
  )
}
