'use client'

import type { Messages } from '@/lib/i18n/messages/en'

type WelcomeDict = Messages['onboarding']['welcomeStep']

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M4 20h4L18.5 9.5l-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 6.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * One-screen welcome/orientation shown to a brand-new creator before the handles
 * form. Purely presentational — the host (WizardClient) decides when to show it
 * and what "Get started" does.
 */
export function WelcomeStep({ t, onStart }: { t: WelcomeDict; onStart: () => void }) {
  const points = [
    { Icon: EyeIcon, text: t.pointPublic },
    { Icon: ClockIcon, text: t.pointTime },
    { Icon: PencilIcon, text: t.pointEdit },
  ]
  return (
    <section className="w-full max-w-md space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-kinnso-ink/50">Kinnso</p>
        <h2 className="text-2xl font-semibold leading-tight">{t.heading}</h2>
        <p className="text-sm leading-relaxed text-kinnso-ink/70">{t.intro}</p>
      </div>

      <ul className="space-y-3">
        {points.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-kinnso-ink/5 text-kinnso-ink">
              <Icon />
            </span>
            <span className="text-sm">{text}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onStart}
        className="w-full rounded bg-kinnso-ink px-4 py-3 text-sm font-medium text-white"
      >
        {t.cta}
      </button>

      <p className="text-center text-xs text-kinnso-ink/50">{t.platforms}</p>
    </section>
  )
}
