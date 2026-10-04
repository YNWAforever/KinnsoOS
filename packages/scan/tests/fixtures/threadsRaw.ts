/**
 * Fake Threads payload — mirrors the shape returned by
 * RapidAPI threads-scraper-api2 user profile + threads list response.
 * No real handles or PII.
 */
export const threadsRaw = {
  user: {
    username: 'fake_traveller_threads',
    biography: 'Food & travel writer. Tokyo → HK. Mostly sharing what I eat.',
    follower_count: 9800,
  },
  threads: [
    { post: { caption: { text: 'The best soba I had this year was in a 6-seat counter in Ginza. No English menu, no phone, no reservations.' } } },
    { post: { caption: { text: 'Unpopular opinion: Hong Kong milk tea from a cha chaan teng beats any specialty coffee shop.' } } },
    { post: { caption: { text: 'Just landed in Seoul. First stop: Gwangjang market at 7am before the crowds.' } } },
    { post: { caption: { text: 'Thread: why Bangkok street food is getting more expensive (and why locals are adapting)' } } },
    { post: { caption: { text: 'One thing I wish I knew before moving to Tokyo: grocery stores close earlier than you think.' } } },
  ],
  // follower count too small to compute meaningful engagement from public data
  avg_engagement: undefined,
}
