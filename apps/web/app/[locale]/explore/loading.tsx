export default function ExploreLoading() {
  return (
    <main className="bg-kinnso-cream font-sans" aria-busy="true" data-explore-skeleton="true">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="h-5 w-24 animate-pulse rounded-full bg-kinnso-edge" />
        <div className="mt-5 h-14 max-w-2xl animate-pulse rounded-2xl bg-kinnso-edge" />
        <div className="mt-4 h-6 max-w-xl animate-pulse rounded-xl bg-kinnso-edge" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="hidden h-72 animate-pulse rounded-3xl bg-kinnso-edge lg:block" />
          <div>
            <div className="h-11 animate-pulse rounded-full bg-kinnso-edge" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} data-guide-card-skeleton="true"
                  className="h-80 animate-pulse rounded-3xl bg-kinnso-edge" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}