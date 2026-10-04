import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface OgFont { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }

const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/**
 * Candidate directories that may hold the bundled brand fonts, most reliable first:
 *  1. resolved relative to THIS module from `import.meta.url`, so the `.ttf` files
 *     resolve regardless of the runtime cwd. NOTE: we derive the dir with
 *     `dirname(fileURLToPath(import.meta.url))` rather than
 *     `new URL('../../../public/fonts/', import.meta.url)` — the latter is a pattern
 *     webpack statically resolves as a module request and a *directory* literal fails
 *     `next build` with "Module not found";
 *  2. `<cwd>/public/fonts` — when cwd is `apps/web`;
 *  3. `<cwd>/apps/web/public/fonts` — when cwd is the monorepo root.
 * Trying all of them removes the fragile single-cwd assumption the previous version had.
 */
function candidateDirs(): string[] {
  const dirs: string[] = []
  try {
    dirs.push(join(dirname(fileURLToPath(import.meta.url)), '../../../public/fonts'))
  } catch {
    // import.meta.url unavailable in some bundling contexts — cwd candidates below stand.
  }
  try {
    dirs.push(join(process.cwd(), 'public', 'fonts'))
    dirs.push(join(process.cwd(), 'apps', 'web', 'public', 'fonts'))
  } catch {
    // process.cwd() unavailable in some contexts — the module-relative path stands.
  }
  return dirs
}

/**
 * Load bundled brand fonts as ArrayBuffers for `ImageResponse`. Returns [] if no
 * candidate directory yields the files — callers MUST omit the `fonts` option when
 * this is empty so `ImageResponse` falls back to its built-in default font; passing
 * `fonts: []` while the cards reference `fontFamily: 'Bricolage'` can throw and 500
 * the route.
 */
export async function loadOgFonts(): Promise<OgFont[]> {
  for (const base of candidateDirs()) {
    try {
      const [bold, regular] = await Promise.all([
        readFile(join(base, 'Bricolage-Bold.ttf')),
        readFile(join(base, 'Bricolage-Regular.ttf')),
      ])
      return [
        { name: 'Bricolage', data: toArrayBuffer(bold), weight: 700, style: 'normal' },
        { name: 'Bricolage', data: toArrayBuffer(regular), weight: 400, style: 'normal' },
      ]
    } catch {
      // try the next candidate directory
    }
  }
  return []
}
