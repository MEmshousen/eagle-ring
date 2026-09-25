/**
 * Base-aware links.
 *
 * The site is served under `base` (`/eagle-ring` on GitHub Pages) and Astro
 * does not rewrite authored links, so every internal `href` and `src` is built
 * here from `import.meta.env.BASE_URL`. When the site moves to a custom domain
 * and `base` is deleted, these helpers collapse to root paths with no other
 * edits (spec §7).
 *
 * Shape: `trailingSlash: 'never'`, so paths carry no trailing slash. The one
 * exception is the Directory's public absolute URL, which is published as
 * `https://jpierre-7.github.io/eagle-ring/` (spec §6).
 */

/** The base with no trailing slash: `/eagle-ring`, or `''` with no base. */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '')

/**
 * A root-relative path under the base, for links within the site.
 *
 * - `url()` gives the Directory: `/eagle-ring`. This form works in
 *   `astro dev` (which 404s on `/eagle-ring/` with `trailingSlash: 'never'`)
 *   and on GitHub Pages.
 * - `url('ring/random')` and `url('/ring/random')` both give
 *   `/eagle-ring/ring/random`.
 */
export function url(path = ''): string {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '') return BASE || '/'
  return `${BASE}/${clean}`
}

/**
 * An absolute URL on the published origin, for links that leave the page:
 * canonical tags, Ring Widget snippets, anything a Member pastes elsewhere.
 *
 * - `absoluteUrl()` gives `https://jpierre-7.github.io/eagle-ring/`.
 * - `absoluteUrl('ring/kevin-tran/next')` gives
 *   `https://jpierre-7.github.io/eagle-ring/ring/kevin-tran/next`.
 */
export function absoluteUrl(path = ''): string {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '')
  return new URL(clean === '' ? `${BASE}/` : url(clean), import.meta.env.SITE).href
}
