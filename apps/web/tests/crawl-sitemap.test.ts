import { describe, expect, it } from 'vitest'
import { crawlSitemap } from '../../../scripts/crawl-sitemap'

const sitemapUrl = 'https://example.test/sitemap.xml'

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml' },
  })
}

function pageResponse(status = 200, body = '<html>ok</html>') {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } })
}

describe('crawlSitemap', () => {
  it('crawls every page listed by a flat urlset', async () => {
    const pageUrls = [
      'https://example.test/en/g/guide-one',
      'https://example.test/en/experiences/experience-one',
    ]
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input, init) => {
        const url = String(input)
        seen.push(url)
        expect(init?.redirect).toBe('follow')
        if (url === sitemapUrl) {
          return xmlResponse(
            `<urlset>${pageUrls.map((pageUrl) => `<url><loc>${pageUrl}</loc></url>`).join('')}</urlset>`,
          )
        }
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 2, failures: [] })
    expect(seen).toContain(sitemapUrl)
    expect(seen).toEqual(expect.arrayContaining(pageUrls))
  })

  it('recursively follows an indexed sitemap shard', async () => {
    const shardUrl = 'https://example.test/sitemap/0.xml'
    const pageUrl = 'https://example.test/en/g/shard-guide'
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input, init) => {
        const url = String(input)
        seen.push(url)
        expect(init?.redirect).toBe('follow')
        if (url === sitemapUrl) return xmlResponse(`<sitemapindex><sitemap><loc>${shardUrl}</loc></sitemap></sitemapindex>`)
        if (url === shardUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 1, failures: [] })
    expect(seen).toContain(shardUrl)
    expect(seen).toContain(pageUrl)
  })

  it('falls back to sequential generated shards when the default sitemap index is missing', async () => {
    const shardZero = 'https://example.test/sitemap/0.xml'
    const shardOne = 'https://example.test/sitemap/1.xml'
    const shardTwo = 'https://example.test/sitemap/2.xml'
    const pageUrls = [
      'https://example.test/en/g/shard-zero-guide',
      'https://example.test/en/experiences/shard-one-experience',
    ]
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        const url = String(input)
        seen.push(url)
        if (url === sitemapUrl) return xmlResponse('<not-found />', 404)
        if (url === shardZero) return xmlResponse(`<urlset><url><loc>${pageUrls[0]}</loc></url></urlset>`)
        if (url === shardOne) return xmlResponse(`<urlset><url><loc>${pageUrls[1]}</loc></url></urlset>`)
        if (url === shardTwo) return xmlResponse('', 404)
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 2, failures: [] })
    expect(seen.slice(0, 4)).toEqual([sitemapUrl, shardZero, shardOne, shardTwo])
    expect(seen).toEqual(expect.arrayContaining(pageUrls))
  })

  it('reports a missing first generated shard instead of hiding a missing sitemap', async () => {
    const shardZero = 'https://example.test/sitemap/0.xml'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        const url = String(input)
        if (url === sitemapUrl || url === shardZero) return xmlResponse('', 404)
        return pageResponse()
      },
    })

    expect(result.checked).toBe(0)
    expect(result.failures).toContainEqual({ url: shardZero, status: 404 })
  })
  it('de-duplicates sitemap shards and page URLs', async () => {
    const shardUrl = 'https://example.test/sitemap/0.xml'
    const pageUrl = 'https://example.test/en/g/repeated-guide'
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        const url = String(input)
        seen.push(url)
        if (url === sitemapUrl) {
          return xmlResponse(
            `<sitemapindex><sitemap><loc>${shardUrl}</loc></sitemap><sitemap><loc>${shardUrl}</loc></sitemap></sitemapindex>`,
          )
        }
        if (url === shardUrl) {
          return xmlResponse(
            `<urlset><url><loc>${pageUrl}</loc></url><url><loc>${pageUrl}</loc></url></urlset>`,
          )
        }
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 1, failures: [] })
    expect(seen.filter((url) => url === shardUrl)).toHaveLength(1)
    expect(seen.filter((url) => url === pageUrl)).toHaveLength(1)
  })

  it('records a final 500 without exposing the response body', async () => {
    const pageUrl = 'https://example.test/en/g/broken-guide'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        return pageResponse(500, 'private response body')
      },
    })

    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([{ url: pageUrl, status: 500 }])
    expect(JSON.stringify(result)).not.toContain('private response body')
  })

  it('flags a branded error shell returned with a successful status', async () => {
    const pageUrl = 'https://example.test/en/g/error-shell'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        return pageResponse(200, `<main><h1>We couldn't load this page</h1></main>`)
      },
    })

    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([{ url: pageUrl, error: 'HtmlErrorShell' }])
  })

  it('records rejected fetches as NetworkError without the thrown message', async () => {
    const pageUrl = 'https://example.test/en/experiences/unreachable'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        throw new Error('private socket details')
      },
    })

    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([{ url: pageUrl, error: 'NetworkError' }])
    expect(JSON.stringify(result)).not.toContain('private socket details')
  })

  it('reports a followed redirect from a submitted sitemap URL', async () => {
    const pageUrl = 'https://example.test/en/g/old-guide'
    const redirected = pageResponse(200)
    Object.defineProperty(redirected, 'redirected', { value: true })
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) =>
        String(input) === sitemapUrl
          ? xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
          : redirected,
    })
    expect(result.failures).toEqual([{ url: pageUrl, error: 'Redirect' }])
  })

  it.each(['robots', 'googlebot'] as const)(
    'reports HTML meta %s noindex without logging the page body',
    async (directive) => {
      const pageUrl = 'https://example.test/en/articles/dining/thin'
      const body =
        `<html><head><meta name="${directive}" content="follow, noindex"></head>` +
        '<body>private article text</body></html>'
      const result = await crawlSitemap({
        baseUrl: 'https://example.test',
        fetchImpl: async (input) =>
          String(input) === sitemapUrl
            ? xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
            : pageResponse(200, body),
      })
      expect(result.failures).toEqual([{ url: pageUrl, error: 'HtmlNoindex' }])
      expect(JSON.stringify(result)).not.toContain('private article text')
    },
  )

  it('reports an X-Robots-Tag noindex response', async () => {
    const pageUrl = 'https://example.test/en/articles/shopping/thin'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) {
          return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        }
        return new Response('<html>ok</html>', {
          status: 200,
          headers: { 'x-robots-tag': 'noindex, follow' },
        })
      },
    })
    expect(result.failures).toEqual([{ url: pageUrl, error: 'HtmlNoindex' }])
  })
})
