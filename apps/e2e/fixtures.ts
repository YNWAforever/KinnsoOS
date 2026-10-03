export const FIXTURES = {
  hub: { path: '/en/articles' },
  listing: { path: '/en/articles/dining' },
  flagship: {
    path: '/en/articles/dining/ramen-guide',
    h1: /ramen/i,
    bodyText: 'Welcome to', // from the rendered text block
    faqQuestion: 'Is ramen cheap?',
  },
  flagshipHk: { path: '/zh-hk/articles/dining/ramen-guide', bodyText: '歡迎來到東京拉麵' },
  redirect: { from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' },
  redirectHk: { from: '/zh-hk/post/old-ramen', to: '/zh-hk/articles/dining/ramen-guide' },
  notFound: [
    '/en/articles/shopping/draft-article',
    '/en/articles/destinations/expired-article',
    '/ja/articles/dining/r7-missing-article',
    '/en/g/r7-missing-guide',
    '/en/experiences/r7-missing-experience',
  ],
  presentLocales: ['en', 'zh-hk'] as const,
  seoEntities: {
    guidePath: '/en/g/r7-smoke-tokyo-guide',
    experiencePath: '/en/experiences/r7-smoke-tokyo-experience',
  },
  booking: {
    experiencePath: '/en/experiences/tokyo-after-hours-izakaya-crawl',
  },
} as const
