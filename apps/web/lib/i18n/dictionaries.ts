import type { Locale } from './config'
import type { Messages } from './messages/en'
export type { Messages }

const loaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import('./messages/en'),
  'zh-hk': () => import('./messages/zh-hk'),
  'zh-tw': () => import('./messages/zh-tw'),
  ja: () => import('./messages/ja'),
  ko: () => import('./messages/ko'),
  th: () => import('./messages/th'),
  'zh-cn': () => import('./messages/zh-cn'),
}

export async function getDictionary(locale: Locale): Promise<Messages> {
  return (await loaders[locale]()).default
}
