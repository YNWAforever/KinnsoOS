export function MissionStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold capitalize text-kinnso-ink">
      {status.replaceAll('_', ' ')}
    </span>
  )
}
