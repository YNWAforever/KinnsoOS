export function pageMetadata(locale: string, route: string, mode: string, deployment: string) {
  const privateRoute = /^(trips|record|me|saved|bookmarks|studio|admin|workspace|sign-in)(\/|$)/.test(route);
  // K25 launch approval is required even for production connected public routes.
  const index = false;
  return { title: locale === 'en' ? 'Explore, plan & record' : '探索、規劃及記錄旅程',
    robots: { index, follow: index } };
}
