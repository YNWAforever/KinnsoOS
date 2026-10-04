import type { LegacyPostBundle } from '../../src/types'

export const legacyPost: LegacyPostBundle = {
  post: {
    id: 900001,
    slug: 'best-ramen-tokyo',
    url: 'best-ramen-tokyo',
    thumbnails: 'a.webp, b.webp',
    authors: 'best-ramen-author,ghost-author',
    regions: 'jp, tokyo,',
    offers: '',
    rating: 4.5,
    views: 123,
    published_at: '2026-06-01 00:00:00',
    end_at: null,
    edit_at: '2026-06-10 00:00:00',
    source: 'manual',
    deleted_at: null,
    updated_at: '2026-06-10 00:00:00',
  },
  translations: [
    {
      locale: 'zh-hk',
      title: '東京最好的拉麵',
      content: JSON.stringify([
        { type: 'text', title: '簡介', content: '<p>最好的<b>拉麵</b>在這裡。</p>', image: '{{image_path}}/hero.webp' },
        { type: 'number-box', title: '第一名', content: '<p>豚骨</p>' },
        { type: 'detail-box', title: '資料', time: '11:00-22:00', address: { label: '澀谷', link: 'https://maps.example/x' } },
        { type: 'multiple-image', images: [{ thumbnail: 't1.webp', original: 'o1.webp', desc: '碗' }] },
        { type: 'attraction-box', attraction: 'shibuya-crossing' },
      ]),
      meta_tags: JSON.stringify({ meta_title: '東京拉麵', meta_description: '香港描述', og_image: 'og.webp' }),
      analyze_tags: 'ramen,tokyo',
      faq_title: '常見問題',
      labels: 'kinnso-recommend',
      validated_at: '2026-06-09 00:00:00',
      deleted_at: null,
    },
    {
      locale: 'en',
      title: 'Best Ramen in Tokyo',
      content: JSON.stringify([{ type: 'text', title: 'Intro', content: '<p>The <b>best</b> ramen.</p>' }]),
      // meta_tags is NOT translated → identical zh-hk values (the leak we must fix for en)
      meta_tags: JSON.stringify({ meta_title: '東京拉麵', meta_description: '香港描述', og_image: 'og.webp' }),
      analyze_tags: 'ramen,tokyo',
      faq_title: 'FAQ',
      labels: '',
      validated_at: null,
      deleted_at: null,
    },
  ],
  faqs: [
    { language: 'zh-hk', question: '幾時營業?', answer: '11-22', weight: 10 },
    { language: 'zh-hk', question: '貴唔貴?', answer: '中等', weight: 5 },
    { language: 'en', question: 'Hours?', answer: '11-22', weight: 0 },
  ],
  authors: [
    { slug: 'best-ramen-author', language: 'en', name: 'Jane Doe', image: 'jane.webp', job_title: 'Editor', description: 'Bio', show_in_author_page: 1, labels: 'featured' },
    { slug: 'best-ramen-author', language: 'zh-hk', name: '珍', image: 'jane.webp', job_title: '編輯', description: '簡介', show_in_author_page: 1, labels: '' },
  ],
  tags: [
    { slug: 'ramen', legacy_tag_id: 11, weight: 2, translations: [{ locale: 'en', name: 'Ramen' }, { locale: 'zh-hk', name: '拉麵' }] },
    { slug: 'llm1-hotel', legacy_tag_id: 99, weight: 1, translations: [{ locale: 'en', name: 'Hotel' }] }, // must be skipped
  ],
  categoryWeights: [
    { category_slug: 'dining', weight: 10 },
    { category_slug: 'destination', weight: 3 },
  ],
}

// Publication-policy baseline: every locale has three visible blocks, 160 words,
// a real HTTPS outbound link, and a named active transformed author row.
const publicationBlocks = (prefix: string) => {
  const words = Array.from({ length: 160 }, (_, index) => `${prefix}${index + 1}`)
  return [
    { type: 'text', content: `<p>${words.slice(0, 54).join(' ')}</p>` },
    { type: 'number-box', content: `<p>${words.slice(54, 107).join(' ')}</p>` },
    { type: 'detail-box', content: `<p>${words.slice(107).join(' ')}</p>`, address: { label: 'Map', link: 'https://maps.google.com/maps' } },
  ]
}
for (const translation of legacyPost.translations) {
  translation.content = JSON.stringify(publicationBlocks(translation.locale === 'en' ? 'word' : 'locale'))
}
legacyPost.authors = legacyPost.authors.map((author) => ({
  ...author,
  name: author.language === 'en' ? 'Ramen Editor' : 'Kinnso Editor',
}))
