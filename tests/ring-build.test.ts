// Spec §6: the ring pages as `astro build` actually emits them.
//
// Each ring is built in a temporary copy of the project with fixture Members
// from tests/fixtures/ring/ dropped into the copy's src/content/members/.
// Fixtures never go into the real src/content/members/.
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const FIXTURES = join(import.meta.dirname, 'fixtures', 'ring')
const DIRECTORY = 'https://jpierre-7.github.io/eagle-ring/'
const SKIP = new Set(['node_modules', 'dist', '.astro', '.git', '.claude'])

const SITES: Record<string, string> = {
  'ana-diaz': 'https://ana-diaz.example/',
  'kevin-tran': 'https://kevin-tran.example/',
  'zoe-lee': 'https://zoe-lee.example/blog',
}

const RINGS = {
  three: ['ana-diaz', 'kevin-tran', 'zoe-lee'],
  two: ['ana-diaz', 'zoe-lee'],
  one: ['kevin-tran'],
}
type RingName = keyof typeof RINGS

const temps: string[] = []
const dists = {} as Record<RingName, string>

/**
 * The environment for `astro build`, minus what Vitest sets for its own Vite
 * (`BASE_URL`, `MODE`, `NODE_ENV=test` and so on), which would leak into the
 * build and drop the `/eagle-ring` base.
 */
function buildEnv(): NodeJS.ProcessEnv {
  const vitestKeys = ['BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR', 'NODE_ENV', 'TEST', 'VITEST', 'VITEST_MODE', 'VITEST_POOL_ID', 'VITEST_WORKER_ID']
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }
  for (const key of vitestKeys) delete env[key]
  return env
}

async function build(slugs: string[]): Promise<string> {
  const copy = mkdtempSync(join(tmpdir(), 'eagle-ring-build-'))
  temps.push(copy)
  cpSync(ROOT, copy, {
    recursive: true,
    filter: (src) => !SKIP.has(relative(ROOT, src).split('/')[0]),
  })
  // Link each package rather than node_modules itself: Astro caches content in
  // node_modules/.astro, which must not be shared between parallel builds or
  // with the real checkout.
  mkdirSync(join(copy, 'node_modules'))
  for (const name of readdirSync(join(ROOT, 'node_modules'))) {
    if (name !== '.astro') symlinkSync(join(ROOT, 'node_modules', name), join(copy, 'node_modules', name))
  }
  const members = join(copy, 'src', 'content', 'members')
  for (const file of readdirSync(members)) if (file !== '.gitkeep') rmSync(join(members, file))
  for (const slug of slugs) cpSync(join(FIXTURES, `${slug}.yaml`), join(members, `${slug}.yaml`))
  await promisify(execFile)(process.execPath, [join(copy, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
    cwd: copy,
    env: buildEnv(),
  })
  return join(copy, 'dist')
}

beforeAll(async () => {
  const names = Object.keys(RINGS) as RingName[]
  const built = await Promise.all(names.map((name) => build(RINGS[name])))
  names.forEach((name, i) => (dists[name] = built[i]))
}, 300_000)

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

function page(ring: RingName, path: string): string {
  return readFileSync(join(dists[ring], path), 'utf8')
}

/** The meta refresh target of a built prev/next page. */
function refresh(ring: RingName, slug: string, direction: 'prev' | 'next'): string {
  const html = page(ring, `ring/${slug}/${direction}.html`)
  const target = /<meta http-equiv="refresh" content="0;url=([^"]+)">/.exec(html)?.[1]
  if (!target) throw new Error(`no meta refresh in ring/${slug}/${direction}.html`)
  return target
}

/** Runs a built page's inline script with a stubbed `location`; returns where it went. */
function runScript(html: string, { pathname = '/', search = '', random = Math.random } = {}): string | undefined {
  const code = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]
  if (!code) throw new Error('no inline script')
  let replaced: string | undefined
  const location = { pathname, search, replace: (to: string) => (replaced = to) }
  const math = Object.create(Math, { random: { value: random } })
  runInNewContext(code, { location, URLSearchParams, Math: math })
  return replaced
}

function htmlFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name), base) : e.name.endsWith('.html') ? [relative(base, join(dir, e.name))] : [],
  )
}

describe('built file paths', () => {
  it('emits ring/<slug>/prev.html and next.html, random.html and 404.html, with no trailing-slash forms', () => {
    const ringFiles = htmlFiles(dists.three).filter((f) => f.startsWith('ring/') || f === '404.html')
    expect(ringFiles.sort()).toEqual([
      '404.html',
      'ring/ana-diaz/next.html',
      'ring/ana-diaz/prev.html',
      'ring/kevin-tran/next.html',
      'ring/kevin-tran/prev.html',
      'ring/random.html',
      'ring/zoe-lee/next.html',
      'ring/zoe-lee/prev.html',
    ])
    expect(existsSync(join(dists.three, 'ring', 'kevin-tran', 'next', 'index.html'))).toBe(false)
  })
})

describe('prev/next pages', () => {
  it('have a meta refresh, canonical link, noindex and a visible fallback link to the same target', () => {
    const html = page('three', 'ring/kevin-tran/next.html')
    const target = SITES['zoe-lee']
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${target}">`)
    expect(html).toContain(`<link rel="canonical" href="${target}">`)
    expect(html).toContain('<meta name="robots" content="noindex">')
    expect(html).toContain(`<a href="${target}">`)
    expect(html).not.toMatch(/<script|<link rel="stylesheet"/)
  })

  it('goes to the neighbours in the middle of the ring', () => {
    expect(refresh('three', 'kevin-tran', 'prev')).toBe(SITES['ana-diaz'])
    expect(refresh('three', 'kevin-tran', 'next')).toBe(SITES['zoe-lee'])
  })

  it('wraps at both ends', () => {
    expect(refresh('three', 'ana-diaz', 'prev')).toBe(SITES['zoe-lee'])
    expect(refresh('three', 'zoe-lee', 'next')).toBe(SITES['ana-diaz'])
    expect(refresh('three', 'ana-diaz', 'next')).toBe(SITES['kevin-tran'])
    expect(refresh('three', 'zoe-lee', 'prev')).toBe(SITES['kevin-tran'])
  })

  it('sends both links of a ring of two to the other Member', () => {
    expect(refresh('two', 'ana-diaz', 'prev')).toBe(SITES['zoe-lee'])
    expect(refresh('two', 'ana-diaz', 'next')).toBe(SITES['zoe-lee'])
    expect(refresh('two', 'zoe-lee', 'prev')).toBe(SITES['ana-diaz'])
    expect(refresh('two', 'zoe-lee', 'next')).toBe(SITES['ana-diaz'])
  })

  it('sends a ring of one to the Directory', () => {
    expect(refresh('one', 'kevin-tran', 'prev')).toBe(DIRECTORY)
    expect(refresh('one', 'kevin-tran', 'next')).toBe(DIRECTORY)
  })
})

describe('random.html', () => {
  const picks = (ring: RingName, from: string) => {
    const html = page(ring, 'ring/random.html')
    const seen = new Set<string | undefined>()
    for (let i = 0; i < 100; i++) seen.add(runScript(html, { search: `?from=${from}`, random: () => i / 100 }))
    for (let i = 0; i < 200; i++) seen.add(runScript(html, { search: `?from=${from}` }))
    return seen
  }

  it('never picks `from`, and reaches every other Member', () => {
    for (const from of RINGS.three) {
      const others = RINGS.three.filter((s) => s !== from).map((s) => SITES[s])
      expect(picks('three', from), `from=${from}`).toEqual(new Set(others))
    }
  })

  it('picks from the whole ring when `from` is missing', () => {
    const html = page('three', 'ring/random.html')
    expect(runScript(html, { random: () => 0 })).toBe(SITES['ana-diaz'])
    expect(runScript(html, { random: () => 0.99 })).toBe(SITES['zoe-lee'])
  })

  it('goes to the other Member in a ring of two, and to the Directory in a ring of one', () => {
    expect(picks('two', 'ana-diaz')).toEqual(new Set([SITES['zoe-lee']]))
    expect(picks('one', 'kevin-tran')).toEqual(new Set([DIRECTORY]))
  })

  it('has a noscript link to the Directory', () => {
    expect(page('three', 'ring/random.html')).toMatch(/<noscript>.*<a href="\/eagle-ring">.*<\/noscript>/s)
  })
})

describe('404.html', () => {
  const go = (ring: RingName, pathname: string) => runScript(page(ring, '404.html'), { pathname })

  it('sends a removed slug that sorts first to the first Member (next) or the last (prev)', () => {
    expect(go('three', '/eagle-ring/ring/aaron/next')).toBe(SITES['ana-diaz'])
    expect(go('three', '/eagle-ring/ring/aaron/prev')).toBe(SITES['zoe-lee'])
  })

  it('sends a removed slug in the middle to the Members either side of it', () => {
    expect(go('three', '/eagle-ring/ring/lupe-garza/prev')).toBe(SITES['kevin-tran'])
    expect(go('three', '/eagle-ring/ring/lupe-garza/next')).toBe(SITES['zoe-lee'])
  })

  it('sends a removed slug that sorts last to the last Member (prev) or the first (next)', () => {
    expect(go('three', '/eagle-ring/ring/zz-top/prev')).toBe(SITES['zoe-lee'])
    expect(go('three', '/eagle-ring/ring/zz-top/next')).toBe(SITES['ana-diaz'])
  })

  it('sends a stale widget to the only Member left in a ring of one', () => {
    expect(go('one', '/eagle-ring/ring/gone/next')).toBe(SITES['kevin-tran'])
  })

  it('stays put for any other missing path, and links to the Directory', () => {
    for (const path of ['/eagle-ring/nope', '/eagle-ring/ring/lupe-garza', '/ring/lupe-garza/next', '/eagle-ring/ring/x/up']) {
      expect(go('three', path), path).toBeUndefined()
    }
    expect(page('three', '404.html')).toMatch(/<a href="\/eagle-ring"[^>]*>Go to the Directory<\/a>/)
  })
})
