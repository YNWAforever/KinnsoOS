# Session waitlist privilege boundary

The session waitlist server action validates the honeypot, email and locale validation,
and Vercel-provided `getClientIp()` anti-abuse value before making a privileged call.
It requires rate-limit success and SSR `getUser()` for any authenticated association.
The normalized email and derived `user_id` are server values; duplicate email is success.
The service client is server-only and never exposed to the browser.

The executable action, RPC and abuse tests enforce these preconditions.
