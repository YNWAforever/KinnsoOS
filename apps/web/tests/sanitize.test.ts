import { describe, it, expect } from 'vitest'
import { cleanHtml } from '@/lib/articles/sanitize'

describe('cleanHtml', () => {
  it('keeps safe formatting tags', () => {
    expect(cleanHtml('<p>Hi <strong>there</strong></p>')).toBe('<p>Hi <strong>there</strong></p>')
  })
  it('keeps links with safe href and forces rel/target', () => {
    const out = cleanHtml('<a href="https://x.com">x</a>')
    expect(out).toContain('href="https://x.com"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
  })
  it('strips script and event handlers', () => {
    expect(cleanHtml('<p onclick="evil()">x</p><script>evil()</script>')).toBe('<p>x</p>')
  })
  it('strips javascript: hrefs', () => {
    expect(cleanHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })
  it('strips protocol-relative hrefs (open-redirect guard)', () => {
    const out = cleanHtml('<a href="//evil.com">x</a>')
    expect(out).not.toContain('//evil.com')
    expect(out).toContain('>x</a>') // the anchor text survives, href removed
  })
  it('drops id attributes (DOM-clobbering guard)', () => {
    expect(cleanHtml('<div id="__next">x</div>')).toBe('<div>x</div>')
  })
  it('drops name on anchors', () => {
    expect(cleanHtml('<a name="body" href="https://x.com">x</a>')).not.toContain('name=')
  })
})
