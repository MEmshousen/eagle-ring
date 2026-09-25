// Spec §6: Ring Widget targets, run against the pure module the ring pages use.
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  fallbackTarget,
  inlineScript,
  neighbourSite,
  randomSite,
  scriptJson,
  type RingEntry,
} from '../src/lib/ring'

const DIRECTORY = 'https://jpierre-7.github.io/eagle-ring/'
const RING_PATH = '/eagle-ring/ring'

const entry = (slug: string): RingEntry => ({ slug, site: `https://${slug}.example/` })
const site = (slug: string) => entry(slug).site

// Already in ring order, as `members` is.
const ring = ['bea', 'kevin-tran', 'mai', 'zoe'].map(entry)

describe('neighbourSite for a Member in the ring', () => {
  it('goes to the neighbours in the middle of the ring', () => {
    expect(neighbourSite(ring, 'kevin-tran', 'prev', DIRECTORY)).toBe(site('bea'))
    expect(neighbourSite(ring, 'kevin-tran', 'next', DIRECTORY)).toBe(site('mai'))
  })

  it('wraps at the start: the first Member’s prev is the last Member', () => {
    expect(neighbourSite(ring, 'bea', 'prev', DIRECTORY)).toBe(site('zoe'))
    expect(neighbourSite(ring, 'bea', 'next', DIRECTORY)).toBe(site('kevin-tran'))
  })

  it('wraps at the end: the last Member’s next is the first Member', () => {
    expect(neighbourSite(ring, 'zoe', 'next', DIRECTORY)).toBe(site('bea'))
    expect(neighbourSite(ring, 'zoe', 'prev', DIRECTORY)).toBe(site('mai'))
  })

  it('sends a ring of one to the Directory', () => {
    const one = [entry('solo')]
    expect(neighbourSite(one, 'solo', 'prev', DIRECTORY)).toBe(DIRECTORY)
    expect(neighbourSite(one, 'solo', 'next', DIRECTORY)).toBe(DIRECTORY)
  })

  it('sends both links of a ring of two to the other Member', () => {
    const two = [entry('ada'), entry('ben')]
    expect(neighbourSite(two, 'ada', 'prev', DIRECTORY)).toBe(site('ben'))
    expect(neighbourSite(two, 'ada', 'next', DIRECTORY)).toBe(site('ben'))
    expect(neighbourSite(two, 'ben', 'prev', DIRECTORY)).toBe(site('ada'))
    expect(neighbourSite(two, 'ben', 'next', DIRECTORY)).toBe(site('ada'))
  })

  it('sends an empty ring to the Directory', () => {
    expect(neighbourSite([], 'anyone', 'next', DIRECTORY)).toBe(DIRECTORY)
  })
})

describe('neighbourSite for a removed slug (the 404 insertion point)', () => {
  it('sorts first: next is the first Member, prev wraps to the last', () => {
    expect(neighbourSite(ring, 'aaron', 'next', DIRECTORY)).toBe(site('bea'))
    expect(neighbourSite(ring, 'aaron', 'prev', DIRECTORY)).toBe(site('zoe'))
  })

  it('sorts in the middle: the Members either side of where it sat', () => {
    expect(neighbourSite(ring, 'lupe', 'prev', DIRECTORY)).toBe(site('kevin-tran'))
    expect(neighbourSite(ring, 'lupe', 'next', DIRECTORY)).toBe(site('mai'))
  })

  it('sorts last: prev is the last Member, next wraps to the first', () => {
    expect(neighbourSite(ring, 'zz-top', 'prev', DIRECTORY)).toBe(site('zoe'))
    expect(neighbourSite(ring, 'zz-top', 'next', DIRECTORY)).toBe(site('bea'))
  })

  it('compares by code unit, as ringOrder does', () => {
    // 'kevin' < 'kevin-tran' < 'kevin2' by code unit ('-' is 0x2d, '2' is 0x32).
    expect(neighbourSite(ring, 'kevin', 'next', DIRECTORY)).toBe(site('kevin-tran'))
    expect(neighbourSite(ring, 'kevin2', 'prev', DIRECTORY)).toBe(site('kevin-tran'))
  })

  it('sends a stale widget to the only Member left in a ring of one', () => {
    const one = [entry('solo')]
    expect(neighbourSite(one, 'gone', 'prev', DIRECTORY)).toBe(site('solo'))
    expect(neighbourSite(one, 'gone', 'next', DIRECTORY)).toBe(site('solo'))
  })
})

describe('randomSite', () => {
  const picks = (from: string | null, list = ring) => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(randomSite(list, from, DIRECTORY, () => i / 100))
    seen.add(randomSite(list, from, DIRECTORY, () => 0.9999999999))
    return seen
  }

  it('never picks the `from` Member, and can pick every other one', () => {
    expect(picks('mai')).toEqual(new Set(['bea', 'kevin-tran', 'zoe'].map(site)))
  })

  it('picks from the whole ring with no `from`, or an unknown one', () => {
    expect(picks(null)).toEqual(new Set(ring.map((m) => m.site)))
    expect(picks('gone')).toEqual(new Set(ring.map((m) => m.site)))
  })

  it('goes to the Directory when no one else is left', () => {
    expect(picks('solo', [entry('solo')])).toEqual(new Set([DIRECTORY]))
    expect(picks(null, [])).toEqual(new Set([DIRECTORY]))
  })

  it('goes to the other Member in a ring of two', () => {
    expect(picks('ada', [entry('ada'), entry('ben')])).toEqual(new Set([site('ben')]))
  })
})

describe('fallbackTarget', () => {
  const at = (pathname: string, list = ring) => fallbackTarget(list, pathname, RING_PATH, DIRECTORY)

  it('redirects a removed slug under the base', () => {
    expect(at('/eagle-ring/ring/aaron/next')).toBe(site('bea'))
    expect(at('/eagle-ring/ring/lupe/prev')).toBe(site('kevin-tran'))
    expect(at('/eagle-ring/ring/zz-top/next')).toBe(site('bea'))
  })

  it('tolerates a trailing slash', () => {
    expect(at('/eagle-ring/ring/lupe/next/')).toBe(site('mai'))
  })

  it('leaves every other path on the not-found page', () => {
    for (const path of [
      '/ring/lupe/next', // missing the base
      '/eagle-ring/ring/lupe', // no direction
      '/eagle-ring/ring/lupe/up',
      '/eagle-ring/ring/lupe/next/more',
      '/eagle-ring/ring/Lupe/next', // not a slug
      '/eagle-ring/ring/random/extra',
      '/eagle-ring/nope',
      '/eagle-ring/',
    ]) {
      expect(at(path), path).toBeNull()
    }
  })

  it('never redirects with an empty ring', () => {
    expect(at('/eagle-ring/ring/lupe/next', [])).toBeNull()
  })

  it('works with no base', () => {
    expect(fallbackTarget(ring, '/ring/lupe/next', '/ring', DIRECTORY)).toBe(site('mai'))
  })
})

describe('inlineScript', () => {
  it('runs on its own, with the ring functions defined inside it', () => {
    let replaced: string | undefined
    const location = { replace: (to: string) => (replaced = to) }
    const code = inlineScript(
      `location.replace(fallbackTarget(${scriptJson(ring)}, '/eagle-ring/ring/lupe/next', '/eagle-ring/ring', 'dir'));`,
    )
    const context: Record<string, unknown> = { location }
    runInNewContext(code, context)
    expect(replaced).toBe(site('mai'))
    expect(Object.keys(context)).toEqual(['location']) // nothing leaked
  })
})

describe('scriptJson', () => {
  it('cannot close the script element', () => {
    const json = scriptJson([{ slug: 'x', site: 'https://x.dev/</script><!--&' }])
    expect(json).not.toMatch(/[<>&]/)
    expect(JSON.parse(json)).toEqual([{ slug: 'x', site: 'https://x.dev/</script><!--&' }])
  })
})
