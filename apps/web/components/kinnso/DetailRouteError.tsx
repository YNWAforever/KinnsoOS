'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale } from '@/lib/i18n/config'
import en from '@/lib/i18n/messages/en'
import type { Messages } from '@/lib/i18n/messages/en'

type DetailRouteErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export function DetailRouteError({ error, reset }: DetailRouteErrorProps) {
  const params = useParams<{ locale?: string }>()
  const localeParam = params?.locale
  const locale = typeof localeParam === 'string' && isLocale(localeParam) ? localeParam : 'en'
  const [messages, setMessages] = useState<Messages>(en)

  useEffect(() => {
    if (error.digest) console.error(error.digest)
  }, [error.digest])

  useEffect(() => {
    let active = true

    void getDictionary(locale)
      .then((dictionary) => {
        if (active) setMessages(dictionary)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [locale])

  const copy = messages.detailError

  return (
    <main className="k2-container py-16 md:py-24">
      <div className="k2-card mx-auto max-w-2xl p-8 text-center md:p-12">
        <p className="k2-eyebrow text-kinnso-orange">KINNSO</p>
        <h1 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{copy.title}</h1>
        <p className="mt-4 text-kinnso-ink/70">{copy.body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="k2-btn-primary">
            {copy.retry}
          </button>
          <Link href={`/${locale}/explore`} className="k2-btn-ghost">
            {copy.explore}
          </Link>
        </div>
      </div>
    </main>
  )
}
