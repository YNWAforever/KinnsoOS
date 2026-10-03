'use client'

import { useState } from 'react'
import Image from 'next/image'
import { MediaPlaceholder } from '@/components/kinnso/media/MediaPlaceholder'
import { isApprovedEntityMediaUrl } from '@/lib/media/entity-media'
import { cn } from '@/lib/utils'

export interface EntityMediaProps {
  src: string | null | undefined
  title: string
  location?: string | null
  sizes: string
  priority?: boolean
  className?: string
  imageClassName?: string
}

export function EntityMedia({
  src,
  title,
  location,
  sizes,
  priority,
  className,
  imageClassName,
}: EntityMediaProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const approved = isApprovedEntityMediaUrl(src)
  const showImage = approved && failedSrc !== src

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {showImage ? (
        <Image
          src={src!}
          alt={title}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailedSrc(src ?? null)}
          className={cn('object-cover', imageClassName)}
        />
      ) : (
        <MediaPlaceholder title={title} location={location} />
      )}
    </div>
  )
}
