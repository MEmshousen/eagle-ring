/**
 * Ring Widget targets (spec §6): prev/next neighbours, the random pick, and
 * the 404 fallback for a removed Member's stale widget.
 *
 * Pure, with no imports, so it is unit-tested under plain Node. The three
 * functions are also inlined into `ring/random.html` and `404.html` through
 * `inlineScript()`, which serialises their source. That means each one must
 * stay self-contained: no imports, no module-level helpers, and only calls
 * to the other functions in `RING_FUNCTIONS`.
 */

/** The only fields the ring pages need from a Member. */
export interface RingEntry {
  slug: string
  site: string
}

export type Direction = 'prev' | 'next'

export const DIRECTIONS: readonly Direction[] = ['prev', 'next']

/**
 * Where a Ring Widget's prev or next link for `slug` goes.
 *
 * `ring` must be in ring order (alphabetical by slug, as `ringOrder` gives).
 *
 * - A Member in the ring goes to its neighbour; the ring wraps at both ends.
 *   In a ring of one, the only Member's prev and next go to the Directory.
 * - A slug not in the ring (a removed Member) goes to the neighbour of the
 *   point where that slug would sit alphabetically, so a stale widget keeps
 *   moving round the ring.
 * - An empty ring goes to the Directory.
 */
export function neighbourSite(
  ring: readonly RingEntry[],
  slug: string,
  direction: Direction,
  directory: string,
): string {
  const n = ring.length
  if (n === 0) return directory
  const step = direction === 'next' ? 1 : -1
  for (let at = 0; at < n; at++) {
    if (ring[at].slug === slug) {
      if (n === 1) return directory
      return ring[(at + step + n) % n].site
    }
  }
  // Not in the ring: `after` is the first Member that sorts after `slug`,
  // compared by code unit exactly as `ringOrder` sorts.
  let after = 0
  while (after < n && ring[after].slug < slug) after++
  return direction === 'next' ? ring[after % n].site : ring[(after - 1 + n) % n].site
}

/**
 * A random Site for `ring/random?from=<slug>`: any Member but `from`, or the
 * Directory when nobody else is left. `random` returns a number in [0, 1).
 */
export function randomSite(
  ring: readonly RingEntry[],
  from: string | null,
  directory: string,
  random: () => number,
): string {
  const pool = ring.filter((m) => m.slug !== from)
  if (pool.length === 0) return directory
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].site
}

/**
 * The 404 page's redirect target for `pathname`, or `null` to stay on the
 * not-found page.
 *
 * `ringPath` is the ring's root-relative path with the base, e.g.
 * `/eagle-ring/ring`. Only `<ringPath>/<slug>/prev` and `.../next` match (a
 * trailing slash is tolerated). An empty ring never redirects.
 */
export function fallbackTarget(
  ring: readonly RingEntry[],
  pathname: string,
  ringPath: string,
  directory: string,
): string | null {
  const prefix = ringPath + '/'
  if (ring.length === 0 || !pathname.startsWith(prefix)) return null
  const [slug, direction, ...rest] = pathname.slice(prefix.length).replace(/\/$/, '').split('/')
  if (rest.length > 0 || !/^[a-z0-9-]+$/.test(slug)) return null
  if (direction !== 'prev' && direction !== 'next') return null
  return neighbourSite(ring, slug, direction, directory)
}

/** Every function an inline ring script may call. */
const RING_FUNCTIONS = [neighbourSite, randomSite, fallbackTarget]

/**
 * JSON that is safe inside a `<script>` element: `<`, `>` and `&` are
 * escaped, so no value can close the element.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&]/g, (c) => {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  })
}

/**
 * The body of an inline `<script>`: the ring functions, then `body`, wrapped
 * in an IIFE so nothing leaks into the page's globals.
 */
export function inlineScript(body: string): string {
  return `(function () {\n${RING_FUNCTIONS.map(String).join('\n')}\n${body}\n})();`
}
