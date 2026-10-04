## Not ported from redesign-kinnso-layout-only

- `RequireRole` — react-router `<Navigate>` route guard. Gating is deferred
  (design spec §10); new `/studio` + `/merchants` routes are ungated this slice.
- `RoleToggle` — mock role switcher tied to MockAuthContext. Replaced by
  `lib/auth/useViewerRole.ts` reading the real Supabase session.
