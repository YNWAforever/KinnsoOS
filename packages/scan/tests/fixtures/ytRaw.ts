/**
 * Fake YouTube Data API v3 combined payload.
 * channel: channels.list response item; videos: playlistItems + videos.list.
 * No real channel IDs or handles.
 */
export const ytRaw = {
  channel: {
    id: 'UCfake000000000000000001',
    snippet: {
      title: 'FakeFoodTrails',
      description: 'Weekly video essays about food culture across Asia. Based in Hong Kong. New video every Thursday.',
      customUrl: '@fakefoodtrails',
      country: 'HK',
    },
    statistics: {
      subscriberCount: '124000',
      videoCount: '87',
    },
  },
  recentVideos: [
    { snippet: { title: 'We ate ramen for 3 days straight in Tokyo — worth it?', description: 'Full guide to Shinjuku ramen district including the 2AM hidden spot locals love.' } },
    { snippet: { title: 'HK Cha Chaan Teng deep dive — is it dying?', description: 'Visited 6 classic milk tea spots in Central and Sham Shui Po. Ranking + history.' } },
    { snippet: { title: 'Seoul Night Market guide: what to eat, what to skip', description: 'Gwangjang vs Namdaemun vs Hongdae — our honest breakdown after 2 trips.' } },
    { snippet: { title: 'Bangkok in 72 hours — street food only challenge', description: 'Rules: no restaurants, no apps. Just walking and asking locals.' } },
    { snippet: { title: 'Osaka takoyaki wars: tourist traps vs the real deal', description: 'We spent a whole day eating takoyaki so you know which stalls are worth the queue.' } },
  ],
  // avg of last 5 videos likes÷(subscribers/100)
  avg_engagement: 1.54,
  post_cadence: '1x/week',
}
