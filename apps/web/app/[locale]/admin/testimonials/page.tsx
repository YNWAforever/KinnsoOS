import { notFound } from 'next/navigation'
import { AdminTestimonialsView } from '@/components/kinnso/admin/AdminTestimonialsView'
import { requireOpsPage } from '@/lib/admin/guard'
import {
  createTestimonialAction,
  deleteTestimonialAction,
  setTestimonialStatusAction,
  updateTestimonialAction,
} from '@/lib/admin/testimonials-actions'
import { listAllTestimonials } from '@/lib/admin/testimonials-queries'
import type { TestimonialInput } from '@/lib/admin/testimonials-validation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminTestimonialsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate inline: Next renders layout + page in parallel (the layout gate is not a barrier).
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const testimonials = await listAllTestimonials(supabase)

  async function onCreate(input: TestimonialInput) {
    'use server'
    return createTestimonialAction(loc, input)
  }
  async function onUpdate(id: string, input: TestimonialInput) {
    'use server'
    return updateTestimonialAction(loc, id, input)
  }
  async function onSetStatus(id: string, status: 'draft' | 'published') {
    'use server'
    return setTestimonialStatusAction(loc, id, status)
  }
  async function onDelete(id: string) {
    'use server'
    return deleteTestimonialAction(loc, id)
  }

  return (
    <AdminTestimonialsView
      t={messages.testimonialsAdmin}
      testimonials={testimonials}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onSetStatus={onSetStatus}
      onDelete={onDelete}
    />
  )
}
