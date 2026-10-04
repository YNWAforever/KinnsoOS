import { notFound } from 'next/navigation'
import { AdminEnquiriesView } from '@/components/kinnso/admin/AdminEnquiriesView'
import { requireOpsPage } from '@/lib/admin/guard'
import { setEnquiryStatusAction } from '@/lib/admin/enquiries-actions'
import { listAdminEnquiries, type AdminEnquiryCursor, type EnquiryStatusFilter, type EnquiryTypeFilter } from '@/lib/admin/enquiries-queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function queueFilters(searchParams: Record<string, string | string[] | undefined>) {
  const statusValue = first(searchParams.status)
  const typeValue = first(searchParams.type)
  const status: EnquiryStatusFilter = statusValue === 'resolved' || statusValue === 'spam' ? statusValue : 'active'
  const type: EnquiryTypeFilter = typeValue === 'creator_collab' || typeValue === 'merchant_contact' ? typeValue : 'all'
  return { status, type }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIMESTAMPTZ = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|[+-](\d{2}):(\d{2}))$/

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function isValidCursorTimestamp(value: string) {
  const match = TIMESTAMPTZ.exec(value)
  if (!match) return false

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue, , offsetHourValue, offsetMinuteValue] = match
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const hour = Number(hourValue)
  const minute = Number(minuteValue)
  const second = Number(secondValue)

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59) return false
  if (offsetHourValue !== undefined && (Number(offsetHourValue) > 15 || Number(offsetMinuteValue) > 59)) return false
  return !Number.isNaN(Date.parse(value))
}

function queueCursor(searchParams: Record<string, string | string[] | undefined>): AdminEnquiryCursor | null {
  const createdAt = searchParams.cursorCreatedAt
  const id = searchParams.cursorId
  if (typeof createdAt !== 'string' || typeof id !== 'string' || !UUID.test(id) || !isValidCursorTimestamp(createdAt)) return null
  return { createdAt, id }
}
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminEnquiriesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const rawSearchParams = await searchParams
  const filters = queueFilters(rawSearchParams)
  const cursor = queueCursor(rawSearchParams)
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const result = await listAdminEnquiries(supabase, filters, cursor)
  const enquiries = result.slice(0, 25)
  const lastVisible = enquiries.at(-1)
  const nextCursor = result.length > 25 && lastVisible ? { createdAt: lastVisible.createdAt, id: lastVisible.id } : null

  async function onSetStatus(id: string, status: 'new' | 'in_progress' | 'resolved' | 'spam', reason: string) {
    'use server'
    return setEnquiryStatusAction(loc, id, status, reason)
  }

  return <AdminEnquiriesView locale={loc} t={messages.enquiriesAdmin} enquiries={enquiries} filters={filters} nextCursor={nextCursor} onSetStatus={onSetStatus} />
}