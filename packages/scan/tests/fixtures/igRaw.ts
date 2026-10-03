/**
 * Fake Instagram payload — mirrors the shape returned by
 * RapidAPI instagram-scraper-stable-api combined response.
 * No real handles or PII.
 */
export const igRaw = {
  data: {
    user: {
      username: 'fake_traveller_ig',
      biography: 'Exploring Asia one plate at a time 🍜 | HK based | IG since 2017',
      edge_followed_by: { count: 58200 },
      edge_media_to_timeline_edge: {
        edges: [
          { node: { edge_media_to_caption: { edges: [{ node: { text: 'Hidden ramen spot in Shibuya — queue for 45 min but worth it #tokyo #ramen' } }] } } },
          { node: { edge_media_to_caption: { edges: [{ node: { text: 'Morning dim sum in Sheung Wan. The turnip cake here is unreal 🤍 #hongkong #dimsum' } }] } } },
          { node: { edge_media_to_caption: { edges: [{ node: { text: 'Seoul street food run: tteokbokki, hotteok, and somehow more #seoul #streetfood' } }] } } },
          { node: { edge_media_to_caption: { edges: [{ node: { text: 'Day trip to Nikko — temples + curry + bullet train = perfect Sunday' } }] } } },
          { node: { edge_media_to_caption: { edges: [{ node: { text: 'Bangkok rooftop market at dusk. Every trip back feels like a first time 🌆 #bangkok' } }] } } },
        ],
      },
      // Approximated from public like counts on 12 posts / 58200 followers
      engagement_rate: 2.87,
    },
  },
}
