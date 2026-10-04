import 'server-only'

import { createHmac } from 'node:crypto'

export const ENQUIRY_ATTESTATION_TTL_SECONDS = 120 as const

export interface EnquiryAttestation {
  ip: string
  header: string
}

function normalizeIpv4(input: string): string | null {
  const parts = input.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null
  const values = parts.map(Number)
  if (values.some((part) => part > 255)) return null
  return values.join('.')
}

function ipv4FromWords(words: number[]): string {
  return [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join('.')
}

function normalizeIpv6(input: string): string | null {
  const split = input.split('::')
  if (split.length > 2) return null
  const expand = (side: string, allowIpv4: boolean): number[] | null => {
    if (!side) return []
    const groups = side.split(':')
    const words: number[] = []
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]
      if (group.includes('.')) {
        if (!allowIpv4 || index !== groups.length - 1) return null
        const ipv4 = normalizeIpv4(group)
        if (!ipv4) return null
        const octets = ipv4.split('.').map(Number)
        words.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
        words.push(Number.parseInt(group, 16))
      }
    }
    return words
  }

  const left = expand(split[0], split.length === 1)
  const right = expand(split.length === 2 ? split[1] : '', true)
  if (!left || !right) return null
  const provided = left.length + right.length
  const words = split.length === 1
    ? provided === 8 ? left : null
    : provided < 8 ? [...left, ...Array(8 - provided).fill(0), ...right] : null
  if (!words) return null

  if (words.every((word) => word === 0)) return '::'
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0)
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff
  if (ipv4Compatible || ipv4Mapped) return `${ipv4Mapped ? '::ffff:' : '::'}${ipv4FromWords(words)}`

  let bestStart = -1
  let bestLength = 0
  for (let index = 0; index < words.length;) {
    if (words[index] !== 0) { index += 1; continue }
    let end = index
    while (end < words.length && words[end] === 0) end += 1
    if (end - index > bestLength) { bestStart = index; bestLength = end - index }
    index = end
  }
  if (bestLength < 2) bestStart = -1

  const groups = words.map((word) => word.toString(16))
  if (bestStart === -1) return groups.join(':')
  const before = groups.slice(0, bestStart).join(':')
  const after = groups.slice(bestStart + bestLength).join(':')
  return before && after ? `${before}::${after}` : before ? `${before}::` : `::${after}`
}

/** Matches PostgreSQL's `host(btrim(value)::inet)` output for accepted IP input. */
export function normalizeEnquiryIp(value: string): string | null {
  const trimmed = value.trim()
  const [address, ...masks] = trimmed.split('/')
  if (!address || masks.length > 1) return null
  const isV6 = address.includes(':')
  if (masks.length === 1 && (!/^\d+$/.test(masks[0]) || Number(masks[0]) > (isV6 ? 128 : 32))) return null
  return isV6 ? normalizeIpv6(address) : normalizeIpv4(address)
}

export function createEnquiryAttestation(ip: string, now = Date.now()): EnquiryAttestation | null {
  const secret = process.env.ENQUIRY_SUBMISSION_SECRET
  if (!secret || secret.trim().length === 0) return null
  const normalizedIp = normalizeEnquiryIp(ip)
  if (!normalizedIp) return null
  const expiry = Math.floor(now / 1000) + ENQUIRY_ATTESTATION_TTL_SECONDS
  const signature = createHmac('sha256', secret).update(`${normalizedIp}\n${expiry}`).digest('hex')
  return { ip: normalizedIp, header: `v1.${expiry}.${signature}` }
}
