'use client'
import { useEffect } from 'react'

// Root error boundary: replaces the root layout if an error escapes it (must
// render its own <html>/<body>). Converts an otherwise-fatal render error into a
// graceful page instead of FUNCTION_INVOCATION_FAILED. Inline styles only —
// globals.css is not guaranteed to be loaded at this level.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('global-error', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', padding: '4rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Something went wrong
        </h1>
        <p style={{ color: '#7B7468', marginBottom: '1.5rem' }}>
          A temporary problem occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '999px',
            background: '#F26A1F',
            color: '#fff',
            border: 0,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
