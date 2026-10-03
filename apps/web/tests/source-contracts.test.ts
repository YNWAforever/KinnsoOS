// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Every source contract that has to look at the whole web tree lives here, and
 * they all share one walk and one read.
 *
 * Four suites used to walk and read these files independently. Vitest runs test
 * files in parallel *processes*, so a module-level cache in each file cached
 * nothing across them: the tree was walked and read four times, in four
 * workers, while ~500 other test files competed for the same CPU and disk. Each
 * suite passed when run alone and timed out in a full run, which reads as
 * flakiness rather than as slowness. Raising the per-test timeout only moves the
 * threshold -- 15000ms was tried and still timed out -- because the cost is the
 * duplicated I/O, not the budget. Consolidating removes the duplication: the
 * tree is walked once and every file is read once, at module scope, and each
 * scan below consumes that one structure.
 *
 * Consequence to respect when adding a scan: put it in this file and consume
 * `webFiles`. A new file that walks the tree again re-creates the defect.
 */

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Build output, dependencies, and test artifacts -- never source. */
const EXCLUDED_SOURCE_DIRECTORIES = new Set([
  '.next',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

const SOURCE_ROOTS = ['app', 'components'] as const
const SOURCE_ROOT_PATHS = new Set(SOURCE_ROOTS.map((name) => join(webRoot, name)))

/**
 * One walk for every scan. Outside app/ and components/ the generated and
 * dependency directories are pruned, which is what the whole-tree scan wants
 * and what keeps node_modules out of the walk. Inside app/ and components/
 * nothing is pruned, because the media and token scans never excluded a
 * directory there -- pruning for them would silently shrink their coverage.
 * Scans that do need an exclusion apply it to the collected paths below.
 */
function walk(directory: string, withinSourceRoot = false): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (!entry.isDirectory()) return [path]
    const nested = withinSourceRoot || SOURCE_ROOT_PATHS.has(path)
    if (!nested && EXCLUDED_SOURCE_DIRECTORIES.has(entry.name)) return []
    return walk(path, nested)
  })
}

type WebFile = {
  /** Posix-style path relative to apps/web, e.g. `components/ui/button.tsx`. */
  readonly path: string
  /** `path` split on "/", so directory-name exclusions stay exact. */
  readonly segments: readonly string[]
  readonly text: string
}

const webFiles: readonly WebFile[] = walk(webRoot).map((absolute) => {
  const path = relative(webRoot, absolute).split(sep).join('/')
  return { path, segments: path.split('/'), text: readFileSync(absolute, 'utf8') }
})

/** Directory segments only: an exclusion names a directory, never a file. */
const directorySegments = (file: WebFile) => file.segments.slice(0, -1)
const excludedBy = (names: ReadonlySet<string>) => (file: WebFile) =>
  !directorySegments(file).some((segment) => names.has(segment))
const withinSourceRoots = (file: WebFile) =>
  (SOURCE_ROOTS as readonly string[]).includes(file.segments[0])
const isTypeScript = (file: WebFile) => /\.(?:ts|tsx)$/.test(file.path)

const fileText = (path: string) => {
  const file = webFiles.find((entry) => entry.path === path)
  if (!file) throw new Error(`${path} is missing from the shared source scan`)
  return file.text
}

/** Whole web tree, minus generated, dependency, and test-artifact directories. */
const treeFiles = webFiles.filter(excludedBy(EXCLUDED_SOURCE_DIRECTORIES))
/** Every .ts/.tsx under app/ and components/, with no directory excluded. */
const typeScriptSources = webFiles.filter((file) => withinSourceRoots(file) && isTypeScript(file))

describe('R7.6 navigation and footer acceptance', () => {
  it('walks the full web tree while excluding generated, dependency, and test-artifact directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'kinnso-r7-6-guard-'))
    const excluded = ['.next', 'node_modules', 'coverage', 'playwright-report', 'test-results']
    try {
      mkdirSync(join(root, 'content'))
      writeFileSync(join(root, 'content', 'copy.md'), 'marketplace copy')
      excluded.forEach((directory) => {
        mkdirSync(join(root, directory))
        writeFileSync(join(root, directory, 'ignored.ts'), 'generated artifact')
      })

      const files = walk(root).map((file) => relative(root, file).replaceAll('\\', '/'))

      expect(files).toContain('content/copy.md')
      excluded.forEach((directory) => {
        expect(files).not.toContain(`${directory}/ignored.ts`)
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Whole-tree scan: every source file, not just app/ and components/. Searching
  // file by file rather than concatenating ~1000 files into one string names the
  // offending file instead of just failing.
  it('removes the pre-pivot English product line from app source', () => {
    const forbidden = ['AI Travel', 'Content Studio'].join(' ')
    const offender = treeFiles.find((file) => file.text.includes(forbidden))?.path

    // The scan is only meaningful if it reached past app/ and components/ and
    // actually read what it walked.
    expect(treeFiles.length).toBeGreaterThan(100)
    expect(
      treeFiles.some((file) => file.path === 'lib/i18n/messages/en.ts' && file.text.length > 0),
      'whole-tree scan never reached lib/ -- it would pass vacuously',
    ).toBe(true)

    expect(offender, `pre-pivot product line still present in ${offender}`).toBeUndefined()
  })
})

/** Every construct findViolations can flag. Anything else cannot violate the contract. */
const MEDIA_MARKERS = ['EntityMedia', 'next/image', '<img'] as const

function attribute(
  node: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | undefined {
  return node.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  )
}

function isEmptyStringAttribute(attribute: ts.JsxAttribute | undefined) {
  const initializer = attribute?.initializer
  if (!initializer) return true
  if (ts.isStringLiteral(initializer)) return initializer.text.length === 0
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return true
  return (
    (ts.isStringLiteral(initializer.expression) && initializer.expression.text.length === 0) ||
    (ts.isNoSubstitutionTemplateLiteral(initializer.expression) && initializer.expression.text.length === 0)
  )
}

function isAriaHidden(attributes: ts.JsxAttributes) {
  const hidden = attribute(attributes, 'aria-hidden')
  if (!hidden?.initializer) return false
  if (ts.isStringLiteral(hidden.initializer)) return hidden.initializer.text === 'true'
  return (
    ts.isJsxExpression(hidden.initializer) &&
    hidden.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
  )
}

function findViolations(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const nextImageIdentifiers = new Set<string>()
  const violations: string[] = []
  const line = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const report = (node: ts.Node, message: string) => {
    violations.push(`${fileName}:${line(node)} ${message}`)
  }

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'next/image') {
      const clause = node.importClause
      if (clause?.name) nextImageIdentifiers.add(clause.name.text)
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) nextImageIdentifiers.add(element.name.text)
      }
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = ts.isIdentifier(node.tagName) ? node.tagName.text : undefined
      const attributes = node.attributes
      const sizes = attribute(attributes, 'sizes')

      if (tagName === 'EntityMedia') {
        if (!attribute(attributes, 'title')) report(node, 'EntityMedia requires title')
        if (!sizes) report(node, 'EntityMedia requires sizes')
        else if (isEmptyStringAttribute(sizes)) report(node, 'EntityMedia sizes must be non-empty')
        if (attribute(attributes, 'alt')) report(node, 'EntityMedia must not receive alt')
      }

      if (tagName && nextImageIdentifiers.has(tagName)) {
        if (!sizes) report(node, 'next/image requires sizes')
        else if (isEmptyStringAttribute(sizes)) report(node, 'next/image sizes must be non-empty')
      }

      if (tagName === 'img') {
        const alt = attribute(attributes, 'alt')
        if (alt && isEmptyStringAttribute(alt) && !isAriaHidden(attributes)) {
          report(node, 'native img with empty alt requires aria-hidden="true"')
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

describe('media source contract', () => {
  it('requires title and non-empty sizes for EntityMedia without alt', () => {
    const violations = findViolations(
      'fixture.tsx',
      '<EntityMedia alt="name" sizes={""} />',
    )

    expect(violations).toEqual([
      'fixture.tsx:1 EntityMedia requires title',
      'fixture.tsx:1 EntityMedia sizes must be non-empty',
      'fixture.tsx:1 EntityMedia must not receive alt',
    ])
  })

  it('reports missing sizes without an empty-value duplicate', () => {
    expect(findViolations('fixture.tsx', '<EntityMedia title="name" />')).toEqual([
      'fixture.tsx:1 EntityMedia requires sizes',
    ])
    expect(findViolations('fixture.tsx', "import Image from 'next/image'\n<Image />")).toEqual([
      'fixture.tsx:2 next/image requires sizes',
    ])
  })
  it('requires non-empty sizes for identifiers imported from next/image', () => {
    const violations = findViolations(
      'fixture.tsx',
      "import Image from 'next/image'\n<Image sizes=\"\" />",
    )

    expect(violations).toEqual(['fixture.tsx:2 next/image sizes must be non-empty'])
  })

  it('permits empty native image alt only when the image is hidden', () => {
    expect(findViolations('fixture.tsx', '<img alt="" />')).toEqual([
      'fixture.tsx:1 native img with empty alt requires aria-hidden="true"',
    ])
    expect(findViolations('fixture.tsx', '<img alt="" aria-hidden="true" />')).toEqual([])
  })

  it('keeps application media JSX within the contract', () => {
    // Only three constructs can violate this contract, and TypeScript-parsing
    // every one of these files to find them cost the whole 5s budget on its own.
    // The filter is deliberately conservative: a file mentioning none of these
    // markers cannot produce a violation, and any file mentioning next/image is
    // parsed regardless of the local alias the import is bound to.
    const parsed = typeScriptSources.filter((file) =>
      MEDIA_MARKERS.some((marker) => file.text.includes(marker)),
    )
    const violations = parsed.flatMap((file) => findViolations(file.path, file.text))

    expect(
      parsed.length,
      'marker filter matched no source files -- the contract would pass vacuously',
    ).toBeGreaterThan(5)
    expect(violations).toEqual([])
  })
})

const PRODUCT_STATE_FORBIDDEN = ['Coming Soon', 'Live now', 'coming soon']
const PRODUCT_STATE_EXCLUDED_DIRECTORIES = new Set([
  'tests',
  '__tests__',
  'messages',
  'dictionaries',
  'locales',
])
const productStateSources = typeScriptSources.filter(
  (file) => file.path.endsWith('.tsx') && excludedBy(PRODUCT_STATE_EXCLUDED_DIRECTORIES)(file),
)

describe('product-state claim copy', () => {
  it('contains no feature-state claims outside the shared state dictionaries', () => {
    const violations = productStateSources.flatMap((file) =>
      PRODUCT_STATE_FORBIDDEN.filter((phrase) => file.text.includes(phrase)).map(
        (phrase) => `${file.path}: ${JSON.stringify(phrase)}`,
      ),
    )

    expect(
      productStateSources.length,
      'no .tsx files were scanned -- the guard would pass vacuously',
    ).toBeGreaterThan(50)
    expect(violations, `Forbidden feature-state claims:\n${violations.join('\n')}`).toEqual([])
  })
})

/**
 * A Tailwind utility naming a token that does not exist produces no class at
 * all under Tailwind v4 — so `border border-kinnso-line` rendered a border with
 * no colour, and `<Button>` rendered with no background. Both look completely
 * correct in source, which is why review never caught either.
 *
 * Key-parity style checks cannot catch this class of bug: the token is absent,
 * not wrong. The only durable guard is to compare what source *uses* against
 * what globals.css *defines*.
 *
 * Two deliberate design choices here, both learned the hard way while writing
 * this file:
 *
 *  - Plain literal regexes. A `new RegExp(String.raw`...${names}...`)` version
 *    silently matched nothing and the suite passed anyway, proving nothing.
 *  - Every scan asserts it actually matched something. A scan that quietly
 *    matches nothing passes forever — the same false confidence this file
 *    exists to remove.
 */

const DESIGN_EXCLUDED_DIRECTORIES = new Set(['node_modules', '.next'])
const appSources = typeScriptSources.filter(excludedBy(DESIGN_EXCLUDED_DIRECTORIES))
const uiSources = appSources.filter((file) => file.path.startsWith('components/ui/'))
const css = fileText('app/globals.css')

/** Colour utilities only; a font or spacing scale resolves elsewhere. */
const KINNSO_UTILITY =
  /(?:bg|text|border|ring|outline|divide|from|to|via|fill|stroke|accent|caret|decoration|placeholder|shadow)-kinnso-([A-Za-z0-9]+)/g

/**
 * shadcn's second vocabulary. Spelled out rather than matched loosely, or it
 * would match every ordinary utility like `bg-white`.
 */
const SHADCN_UTILITY =
  /(?:bg|text|border|ring|outline|divide|fill|stroke)-(background|foreground|primary|secondary|muted|accent|destructive|popover|card|input|ring|border)(-foreground)?/g

function scan(files: readonly WebFile[], marker: string, pattern: RegExp) {
  const seen = new Set<string>()
  const where = new Map<string, string>()
  for (const file of files) {
    if (!file.text.includes(marker)) continue
    for (const match of file.text.matchAll(pattern)) {
      const name = `${match[1]}${match[2] ?? ''}`
      seen.add(name)
      if (!where.has(name)) where.set(name, file.path)
    }
  }
  return { seen, where }
}

const report = (missing: string[], where: Map<string, string>, prefix: string) =>
  missing.map((name) => `${prefix}${name} (e.g. ${where.get(name)})`)

/**
 * The mirror image of the missing-token bug above, and strictly worse to debug:
 * a token defined TWICE. CSS applies the last definition, so the first silently
 * loses — nothing errors, nothing is undefined, and every utility naming it just
 * changes colour.
 *
 * This is not hypothetical. `--color-muted` was the brand's muted TEXT colour
 * (#6D6257), and adding shadcn's `muted` — which means a muted BACKGROUND
 * (#EFE3D2) — redefined it. Every `text-muted` became cream-on-cream and the
 * article route produced 373 axe colour-contrast violations, caught only by the
 * e2e accessibility job. `og.palette-parity.test.ts` kept passing throughout,
 * because its `token()` helper reads the FIRST match while the browser applies
 * the LAST — so the duplicate also quietly disarmed the test watching that token.
 */
describe('colour token uniqueness', () => {
  it('never defines the same colour token twice', () => {
    const counts = new Map<string, number>()
    for (const [, name] of css.matchAll(/^\s*(--color-[A-Za-z0-9-]+)\s*:/gm)) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }

    expect(counts.size, 'scan matched nothing — regex or path is wrong').toBeGreaterThan(20)

    const duplicated = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => `${name} defined ${count}x`)

    expect(duplicated, 'a later definition silently overrides the earlier one').toEqual([])
  })
})

describe('kinnso colour token coverage', () => {
  const defined = new Set(
    [...css.matchAll(/--color-kinnso-([A-Za-z0-9]+):/g)].map((m) => m[1]),
  )

  it('defines the canonical border token the editorial layer relies on', () => {
    // The specific swap this file was written for: `kinnso-edge` is the real
    // border token; `kinnso-line` was used 130 times and never existed.
    expect(defined.has('edge')).toBe(true)
    expect(defined.has('line')).toBe(false)
  })

  it('every kinnso colour utility used in source resolves to a defined token', () => {
    const { seen, where } = scan(appSources, '-kinnso-', KINNSO_UTILITY)

    expect(seen.size, 'scan matched nothing — regex or path is wrong').toBeGreaterThan(5)
    expect(seen.has('edge'), 'expected the app to use a kinnso-edge utility').toBe(true)

    const missing = [...seen].filter((name) => !defined.has(name))
    expect(report(missing, where, 'kinnso-')).toEqual([])
  })
})

describe('shadcn primitive token coverage', () => {
  const defined = new Set([...css.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]))

  it('every shadcn token used by components/ui resolves to a defined token', () => {
    const { seen, where } = scan(uiSources, '-', SHADCN_UTILITY)

    expect(seen.size, 'scan matched nothing — regex or path is wrong').toBeGreaterThan(5)
    expect(seen.has('primary'), 'expected components/ui to use bg-primary').toBe(true)

    const missing = [...seen].filter((name) => !defined.has(name))
    expect(report(missing, where, '--color-')).toEqual([])
  })

  it('keeps the shadcn aliases pointed at canonical kinnso values', () => {
    // Aliases, not a second palette: if these drift the app grows two colour
    // systems that disagree.
    expect(css).toMatch(/--color-primary:\s*#B94000/) // kinnso-orange
    expect(css).toMatch(/--color-ring:\s*#B94000/)
    expect(css).toMatch(/--color-input:\s*#DED5C7/) // kinnso-edge
    expect(css).toMatch(/--color-border:\s*#DED5C7/)
    expect(css).toMatch(/--color-destructive:\s*#D24A3B/) // kinnso-red
  })
})
