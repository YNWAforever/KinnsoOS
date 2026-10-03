import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { findForbiddenPlaceholderTokens } from '@kinnso/honesty'

const ROOT = resolve(__dirname, '..')
const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
] as const
const FIXTURE_SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
// `.worktrees` matters as much as `node_modules` here: collectFixtureSources() walks from the
// repo ROOT, so a `git worktree` checked out under `.worktrees/` puts ANOTHER branch's files in
// this branch's scan. That reports failures the working branch cannot fix and cannot reproduce in
// CI (a fresh checkout has no worktrees), which teaches people to ignore a red gate — the exact
// habit that lets a real placeholder token through. `.git` is excluded as pure waste avoidance.
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.next', '.worktrees', '.git'])

function portablePath(path: string) {
  return path.split(sep).join('/')
}

function isExcluded(path: string) {
  const relativePath = portablePath(relative(ROOT, path))
  const parts = relativePath.split('/')

  return parts.some((part) => EXCLUDED_DIRECTORIES.has(part))
    || relativePath === 'scripts/honesty-lint.ts'
    || relativePath.startsWith('apps/web/tests/')
}

function isGeneratedType(path: string) {
  const name = basename(path).toLowerCase()
  return name.endsWith('.d.ts')
    || name.includes('.generated.')
    || name === 'generated.ts'
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (isExcluded(path)) continue

    if (entry.isDirectory()) {
      files.push(...await collectFiles(path))
    } else if (entry.isFile() && !isGeneratedType(path)) {
      files.push(path)
    }
  }

  return files
}

async function collectFixtureSources(directory: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (isExcluded(path)) continue

    if (entry.isDirectory()) {
      files.push(...await collectFixtureSources(path))
    } else if (
      entry.isFile()
      && basename(path, extname(path)).toLowerCase().includes('fixture')
      && FIXTURE_SOURCE_EXTENSIONS.has(extname(path).toLowerCase())
      && !isGeneratedType(path)
    ) {
      files.push(path)
    }
  }

  return files
}

async function main() {
  const candidates = new Set<string>([resolve(ROOT, 'supabase/seed.sql')])
  for (const root of SCAN_ROOTS) {
    for (const file of await collectFiles(resolve(ROOT, root))) candidates.add(file)
  }
  for (const file of await collectFixtureSources(ROOT)) candidates.add(file)

  let findingCount = 0
  for (const file of [...candidates].sort()) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/u)
    for (const [index, line] of lines.entries()) {
      for (const token of findForbiddenPlaceholderTokens(line)) {
        console.error(`${portablePath(relative(ROOT, file))}:${index + 1}: ${token}`)
        findingCount += 1
      }
    }
  }

  if (findingCount > 0) process.exitCode = 1
}

void main()
