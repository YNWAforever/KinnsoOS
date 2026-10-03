import { serve } from '@hono/node-server'
import { makeSync } from '@kinnso/sync'
import { createApp } from './app'
import { revalidate } from './revalidate'

// Routing lives in app.ts so it can be exercised without opening a MySQL pool, a
// Supabase client, or a listening socket. This file is bootstrap only.
const sync = makeSync()

const app = createApp({
  sync,
  webhookSecret: process.env.FOSO_WEBHOOK_SECRET ?? '',
  adminToken: process.env.SYNC_ADMIN_TOKEN ?? '',
  revalidate,
  writeRedirects: sync.writeRedirects,
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) })
