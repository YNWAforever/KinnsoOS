export type R710RouteId =
  | 'home'
  | 'explore'
  | 'guide'
  | 'experience'
  | 'article'
  | 'creator-landing'
  | 'merchant-landing'
  | 'creator-directory'
  | 'merchant-directory'

export interface R710Route {
  id: R710RouteId
  path: string
  ready: { role: 'heading'; level: 1 }
  mobileHeaderJourney?: boolean
}

export const R7_10_ROUTES = [
  { id: 'home', path: '/en', ready: { role: 'heading', level: 1 }, mobileHeaderJourney: true },
  { id: 'explore', path: '/en/explore', ready: { role: 'heading', level: 1 } },
  { id: 'guide', path: '/en/g/r7-smoke-tokyo-guide', ready: { role: 'heading', level: 1 }, mobileHeaderJourney: true },
  { id: 'experience', path: '/en/experiences/r7-smoke-tokyo-experience', ready: { role: 'heading', level: 1 } },
  { id: 'article', path: '/en/articles/dining/ramen-guide', ready: { role: 'heading', level: 1 } },
  { id: 'creator-landing', path: '/en/for-creators', ready: { role: 'heading', level: 1 } },
  { id: 'merchant-landing', path: '/en/for-merchants', ready: { role: 'heading', level: 1 } },
  { id: 'creator-directory', path: '/en/creators', ready: { role: 'heading', level: 1 } },
  { id: 'merchant-directory', path: '/en/merchants', ready: { role: 'heading', level: 1 } },
] as const satisfies readonly R710Route[]
