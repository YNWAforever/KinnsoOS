type SocialSignalStatus = 'verified_signal' | 'needs_review' | 'unavailable'

const labels: Record<SocialSignalStatus, string> = {
  verified_signal: 'Verified signal',
  needs_review: 'Needs review',
  unavailable: 'Unavailable',
}

export function SocialSignalBadge({ status }: { status: SocialSignalStatus }) {
  return (
    <span className="inline-flex rounded-pill bg-kinnso-blue/10 px-2 py-1 text-xs font-semibold text-kinnso-blue">
      {labels[status]}
    </span>
  )
}
