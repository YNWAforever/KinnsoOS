export function csvToArray(csv: string | null | undefined): string[] {
  if (!csv) return []
  return csv.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

/** Rewrite a legacy image reference to an absolute CDN URL. */
export function cdnUrl(ref: string | null | undefined, cdnBase: string): string {
  if (!ref) return ''
  let r = ref.replace(/\{\{image_path\}\}\/?/g, '') // strip the runtime token
  if (/^https?:\/\//i.test(r)) return r // already absolute
  r = r.replace(/^\/+/, '')
  return cdnBase ? `${cdnBase}/${r}` : r
}
