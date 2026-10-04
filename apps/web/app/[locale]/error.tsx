'use client'
import { useEffect } from 'react'

// Route error boundary: a render error within /[locale]/* (e.g. a transient
// Supabase failure that the query helpers throw on) is caught here and degrades
// to a graceful, retryable UI instead of crashing the serverless function
// (FUNCTION_INVOCATION_FAILED).
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('route-error', error)
  }, [error])

  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold mb-3">Something went wrong</h1>
      <p className="text-kinnso-muted mb-6">
        We hit a temporary problem loading this page. Please try again.
      </p>
      <button
        onClick={() => reset()}
        className="rounded-chip bg-orange px-5 py-2 text-white"
      >
        Try again
      </button>
    </main>
  )
}
