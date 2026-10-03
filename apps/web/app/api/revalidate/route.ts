import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { safeEqual } from '@/lib/http/safe-equal'

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!safeEqual(req.headers.get('x-revalidate-secret'), secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  let path: unknown
  try { path = (await req.json())?.path } catch { path = undefined }
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return NextResponse.json({ ok: false, error: 'bad path' }, { status: 400 })
  }
  revalidatePath(path)
  return NextResponse.json({ ok: true, revalidated: path })
}
