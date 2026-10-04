import Link from 'next/link'

export default function GlobalNotFound() {
  return (
    <html lang="en"><body style={{ fontFamily: 'sans-serif', padding: '4rem', textAlign: 'center' }}>
      <h1>404 — Not found</h1>
      <p><Link href="/en">Go to Kinnso</Link></p>
    </body></html>
  )
}
