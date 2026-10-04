import { entityMediaHue } from '@/lib/media/entity-media'

interface MediaPlaceholderProps {
  title: string
  location?: string | null
}

export function MediaPlaceholder({ title, location }: MediaPlaceholderProps) {
  const hue = entityMediaHue(`${location ?? ''}|${title}`)
  const secondHue = (hue + 48) % 360

  return (
    <div
      aria-hidden="true"
      data-media-placeholder="true"
      className="absolute inset-0 flex flex-col justify-end gap-1 p-4 text-white"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 58% 38%), hsl(${secondHue} 62% 24%))`,
      }}
    >
      <span className="line-clamp-2 text-lg font-semibold leading-tight">{title}</span>
      {location ? (
        <span className="text-sm font-medium text-white/80">{location}</span>
      ) : null}
    </div>
  )
}
