/* OG card primitives for next/og ImageResponse. JSX uses inline styles only
   (ImageResponse supports a flexbox CSS subset). satori needs literal hex (CSS vars
   don't resolve here), so these mirror the @theme brand tokens in app/globals.css.
   That file is the source of truth — tests/og.palette-parity.test.ts fails if they drift. */

export const OG = {
  cream: '#F8F1E6',
  ink: '#211B16',
  orange: '#B94000',
  muted: '#6D6257',
}

export const OG_SIZE = { width: 1200, height: 630 }

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      background: OG.cream, color: OG.ink, padding: 64, fontFamily: 'Bricolage',
    }}>
      {children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 32, fontWeight: 700, color: OG.orange }}>
        KINNSO
      </div>
    </div>
  )
}

export function DefaultCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 34, color: OG.muted }}>{subtitle}</div>
      </div>
    </Frame>
  )
}

export function GuideCard({ title, city, handle, cover }: { title: string; city: string; handle: string; cover?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'Bricolage', background: OG.ink, color: OG.cream }}>
      {cover ? <img src={cover} width={1200} height={360} style={{ objectFit: 'cover' }} /> : <div style={{ width: 1200, height: 360, background: OG.orange }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 56, flex: 1, justifyContent: 'center' }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 30, color: '#D9D2C7' }}>{`${city} · @${handle}`}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: OG.orange }}>KINNSO</div>
      </div>
    </div>
  )
}

export function CreatorCard({ name, handle, niches, guideCount }: { name: string; handle: string; niches: string[]; guideCount: number }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 34, color: OG.muted }}>{`@${handle} · ${guideCount} guides`}</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {niches.map((n) => (
            <div key={n} style={{ display: 'flex', fontSize: 26, padding: '8px 18px', borderRadius: 999, background: OG.orange, color: OG.cream }}>{n}</div>
          ))}
        </div>
      </div>
    </Frame>
  )
}

export function MerchantCard({ name, tagline, city }: { name: string; tagline: string | null; city: string | null }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{name}</div>
        {tagline ? <div style={{ fontSize: 34, color: OG.muted }}>{tagline}</div> : null}
        {city ? <div style={{ fontSize: 28, color: OG.muted }}>{city}</div> : null}
      </div>
    </Frame>
  )
}

export function ExperienceCard({ title, city, merchantName, cover }: { title: string; city: string; merchantName: string; cover?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'Bricolage', background: OG.ink, color: OG.cream }}>
      {cover ? <img src={cover} width={1200} height={360} style={{ objectFit: 'cover' }} /> : <div style={{ width: 1200, height: 360, background: OG.orange }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 56, flex: 1, justifyContent: 'center' }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 30, color: '#D9D2C7' }}>{`${city} · ${merchantName}`}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: OG.orange }}>KINNSO</div>
      </div>
    </div>
  )
}
