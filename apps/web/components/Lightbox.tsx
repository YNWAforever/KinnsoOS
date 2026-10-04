'use client'
import { useState } from 'react'

export function Lightbox({ images }: { images: Array<{ thumbnail?: string; original?: string; desc?: string }> }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((im, i) => (
          <button key={i} type="button" onClick={() => setOpen(i)} className="block">
            <img src={im.thumbnail ?? im.original} alt={im.desc ?? ''} loading="lazy"
                 className="rounded-chip w-full h-40 object-cover" />
          </button>
        ))}
      </div>
      {open != null && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
             onClick={() => setOpen(null)}>
          <img src={images[open].original ?? images[open].thumbnail} alt={images[open].desc ?? ''}
               className="max-h-[90vh] max-w-full rounded-card" />
        </div>
      )}
    </>
  )
}
