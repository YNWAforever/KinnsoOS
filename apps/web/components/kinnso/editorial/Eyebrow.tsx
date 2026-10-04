import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Small-caps kicker above editorial headlines ("DESTINATIONS", "FROM THE JOURNAL"). */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cn('k2-eyebrow', className)}>{children}</p>
}
