import { existsSync } from 'node:fs';
import { URL } from 'node:url';
if (!existsSync(new URL('../packages/db/types.ts', import.meta.url))) {
  throw new Error('BLOCKED: generated database types are absent. Configure the approved local test stack and run pnpm db:types; see README.md.');
}
