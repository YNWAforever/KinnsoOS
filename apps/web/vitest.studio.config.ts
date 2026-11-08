import {defineConfig} from 'vitest/config'
import {fileURLToPath} from 'node:url'
// Explicitly offline unit/component suite; never imports the DB integration setup.
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},test:{environment:'node',execArgv:['--no-experimental-webstorage'],setupFiles:['./tests/guides/studio-offline.setup.ts'],include:['tests/guides/studio-guard.test.ts','tests/guides/studio-bound-form.test.tsx','tests/kinnso.GuideForm.test.tsx','tests/structured-publisher.recovery.test.tsx']}})
