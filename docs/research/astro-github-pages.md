# Research: Astro on GitHub Pages — base path, redirects, custom-domain migration

Resolves [#4](https://github.com/jpierre-7/eagle-ring/issues/4). Researched 2026-09-17 against the Astro docs, the Astro source, the GitHub Pages docs, and a throwaway `astro build` (Astro 7.3.3, Node 24) run with the exact config the Webring would use. Where a claim comes from the probe build rather than a document, it says so.

## Summary

- Deploying the Directory at `https://jpierre-7.github.io/eagle-ring/` needs `site: 'https://jpierre-7.github.io'` and `base: '/eagle-ring'`. Astro prefixes its own output (routes, `_astro/` assets) with `base`, but does **not** rewrite hand-written links: every `href`/`src` you author must be written with the base, via `import.meta.env.BASE_URL`. Root-absolute links like `/members` will 404.
- GitHub Pages is a static file host. It has no `_redirects` file, no `.htaccess`, no server-side rules, and no per-path redirect config of any kind. The only redirects it performs are apex↔www and HTTP→HTTPS.
- Astro's `redirects` config on a static build emits one HTML file per redirect containing `<meta http-equiv="refresh" content="0;url=…">` plus `<link rel="canonical">` and `robots: noindex`. External (`https://…`) destinations are supported. **This is enough for static prev/next URLs in the Ring Widget: yes, viable.** "Random" cannot be a static redirect; it needs a page with a few lines of client-side JS.
- Gotcha found in the probe: internal redirect destinations are emitted verbatim, **without** the `base` prefix. On the subpath deploy, write internal destinations as `/eagle-ring/...` or as absolute URLs; external Site URLs are unaffected.
- Deploy with the canonical two-job workflow: `withastro/action@v6` (build + `actions/upload-pages-artifact`) then `actions/deploy-pages@v5`, with the repo's Pages source set to "GitHub Actions".
- Custom domain later: change `site` to the new origin and delete `base`; nothing else in Astro changes. Add the domain in repo Settings → Pages (with an Actions publishing source, a `CNAME` file is ignored and not required), create the DNS CNAME/A records, wait for the Let's Encrypt cert, then tick "Enforce HTTPS". Every `/eagle-ring/...` URL that Members embedded stops working unless the site keeps serving from the subpath too, so the Ring Widget's URL scheme is the thing to get right before anyone embeds it.

## 1. `site` and `base` on a project subpath

### What GitHub Pages serves

GitHub Pages has two site types. A user site "must be stored in a repository named `<owner>.github.io`" and lives at `http(s)://<owner>.github.io`; a project site is "stored in a folder within the repository that contains the project's code" and lives at `http(s)://<owner>.github.io/<repositoryname>`. [^gh-what] `jpierre-7/eagle-ring` is a project site, so its URL root is `https://jpierre-7.github.io/eagle-ring/`.

### The Astro config

The Astro GitHub Pages guide gives exactly this for a project site: [^astro-gh]

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://astronaut.github.io',
  base: '/my-repo',
})
```

with the instruction: "Set a value for `base` that specifies the repository for your website. This is so that Astro understands your website's root is `/my-repo`, rather than the default `/`. You can skip this if your repository name matches the special `<username>.github.io` pattern." [^astro-gh]

For this repo:

```js
export default defineConfig({
  site: 'https://jpierre-7.github.io',
  base: '/eagle-ring',
})
```

Option semantics, from the configuration reference: [^astro-config]

- `site` (string): "Astro uses this full URL to generate sitemaps and canonical URLs in final builds." It is the origin only; the repo name goes in `base`, not `site`.
- `base` (string): "The base path to deploy to. Astro will use this path as the root for your pages and assets both in development and in production build." And: "When using this option, all of your static asset imports and URLs should add the base as a prefix. You can access this value via `import.meta.env.BASE_URL`."
- `trailingSlash` (`'always' | 'never' | 'ignore'`, default `'ignore'`) decides the shape of `BASE_URL`: "The value of `import.meta.env.BASE_URL` will be determined by your `trailingSlash` config, no matter what value you have set for `base`. A trailing slash is always included if `trailingSlash: "always"` is set. If `trailingSlash: "never"` is set, `BASE_URL` will not include a trailing slash, even if `base` includes one." With the default `'ignore'`, the probe build gave `BASE_URL === '/eagle-ring'` (no trailing slash).

### What breaks if links are not base-aware

Astro does not rewrite the `<a href>` you type. The routing guide's own example makes that explicit: [^astro-routing]

```astro
<!-- With `base: "/docs"` configured -->
<p>Learn more in our <a href="/docs/reference/">reference</a> section!</p>
```

So on the subpath deploy:

- `<a href="/members">` resolves to `https://jpierre-7.github.io/members` → GitHub 404. Same for `<img src="/logo.svg">`, `<link href="/styles.css">`, `fetch('/members.json')`, and any URL string put into the Ring Widget snippet.
- Correct form: `` <a href={`${import.meta.env.BASE_URL}/members`}> `` (probe output: `<a href="/eagle-ring/new">`), or build absolute URLs with `new URL(path, Astro.site)` when the URL leaves the page (the widget snippet, feeds, canonical tags).
- Astro's own emitted asset paths (`/_astro/*.css`, hashed images) and route output directories already include `base`; only authored URLs need care.
- Relative links (`href="members/"`) also work but depend on the current page's directory, which changes with `trailingSlash` / `build.format`; the `BASE_URL` form is safer.

`astro dev` serves the site at `/eagle-ring/` too ("In the example below, `astro dev` will start your server at `/docs`") [^astro-config], so an un-prefixed link 404s locally as well, which is how to catch it before deploy.

### URL shape on GitHub Pages (measured, not documented)

GitHub does not document its trailing-slash handling; measured on live Pages sites on 2026-09-17:

| Request | Files present | Response |
| --- | --- | --- |
| `/versions` | `versions/index.html` | `301` → `/versions/` |
| `/versions/` | `versions/index.html` | `200` |
| `/docs` | `docs.html` | `200` (extension-less lookup) |
| `/playground/` | `playground.html` only | `404` |

Astro's `build.format` (default `'directory'`, i.e. `/about/index.html`; `'file'` gives `/about.html`) [^astro-config] therefore decides whether a bare URL costs an extra 301: with the default, `/eagle-ring/ring/alice/next` is a 301 to `.../next/` and then the meta refresh. With `build.format: 'file'` plus `trailingSlash: 'never'`, the probe emitted `dist/ring/alice/next.html`, which Pages serves at `/eagle-ring/ring/alice/next` directly (one hop). Either works; pick one and never publish the other form in the Ring Widget snippet.

## 2. Redirects on GitHub Pages

### What GitHub Pages supports

- "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository on GitHub, optionally runs the files through a build process, and publishes a website." [^gh-what]
- "GitHub Pages does not support server-side languages such as PHP, Ruby, or Python." [^gh-create]
- There is no redirects feature in the Pages documentation at all: no `_redirects` file (that is a Netlify/Cloudflare convention), no `.htaccess`, no headers file. The only redirects GitHub itself performs are between the apex and `www` forms of a custom domain ("if you configure `example.com` as the custom domain, then `www.example.com` will redirect to `example.com`") [^gh-custom-about] and HTTP→HTTPS when "Enforce HTTPS" is on ("transparently redirect all HTTP requests to HTTPS") [^gh-https]. For anything else the docs say to use DNS: "To point multiple domains to your site, you must set up a redirect through your DNS provider." [^gh-trouble]
- Custom 404: "You can display a custom 404 error page when people try to access nonexistent pages on your site" by placing `404.html` at the root of the publishing source. [^gh-404] Astro's `src/pages/404.astro` builds to `dist/404.html`, which is that root. A request for a nonexistent path returns a real HTTP 404 (measured), and nothing in the Pages docs describes rewriting or catch-all routing, so the 404 page cannot stand in for a router.
- The Jekyll pass only applies when publishing from a branch ("GitHub Pages will use Jekyll to build your site by default"; use a GitHub Actions workflow for other generators, or add an empty `.nojekyll`). [^gh-create] With the Actions workflow below the uploaded artifact is deployed as-is, so Astro's `_astro/` directory (which Jekyll would drop as an underscore path) is safe. If the site is ever switched to branch publishing, `.nojekyll` becomes mandatory.

So: **every redirect on GitHub Pages is a page you build.** The question is what Astro emits.

### What Astro's static `redirects` emits

Config: `redirects` is `Record<string, RedirectConfig>`, default `{}`, "where the key is the route to match and the value is the path to redirect to". [^astro-config] Example from the reference:

```js
export default defineConfig({
  redirects: {
    '/old': '/new',
    '/blog/[...slug]': '/articles/[...slug]',
    '/about': 'https://example.com/about',
    '/news': { status: 302, destination: 'https://example.com/news' },
  },
})
```

Rules from the docs:

- "For statically-generated sites with no adapter installed, this will produce a client redirect using a `<meta http-equiv="refresh">` tag and does not support status codes." [^astro-config] The status field is only honoured "When using SSR or with a static adapter" (Netlify, Vercel, Cloudflare adapters write their host's redirect file instead). [^astro-config] GitHub Pages has no adapter, so on Pages there is no status code at all: the browser receives a 200 HTML page that navigates away.
- External URLs "that start with `http` or `https`" are allowed since Astro 5.2.0. [^astro-routing]
- "You can redirect both static and dynamic routes, but only to the same kind of route." Dynamic sources need "the same parameters" in the destination, e.g. `'/blog/[...slug]': '/articles/[...slug]'`. [^astro-config] [^astro-routing]
- "File-based routes take precedence over redirects." [^astro-routing]
- `build.redirects` (boolean, default `true`) "Specifies whether redirects will be output to HTML during the build. This option only applies to `output: 'static'` mode". [^astro-config] Leave it on.

The HTML Astro writes comes from `redirectTemplate()` in `packages/astro/src/core/routing/3xx.ts`: [^astro-3xx]

```ts
const delay = status === 302 ? 2 : 0;
return `<!doctype html>
<title>Redirecting to: ${rel}</title>
<meta http-equiv="refresh" content="${delay};url=${rel}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${abs}">
<body>
	<a href="${rel}">Redirecting ${fromHtml}to <code>${rel}</code></a>
</body>`;
```

`generate.ts` uses this template for **any** 3xx response from a prerendered route, not only `redirects` entries: `if (response.status >= 300 && response.status < 400) { … body = redirectTemplate({...}) }`. [^astro-generate] That means `return Astro.redirect(url)` inside a page that has `getStaticPaths()` also produces a static meta-refresh file. The delay is 2 seconds for status 302 (the comment cites Google treating a delayed refresh as temporary) and 0 otherwise; `Astro.redirect()` defaults to 302, so pass `301` explicitly for an instant hop.

### Probe build: what actually landed in `dist/`

Config used (`site: 'https://jpierre-7.github.io'`, `base: '/eagle-ring'`, default `trailingSlash` and `build.format`):

```js
redirects: {
  '/old': '/new',
  '/old-based': '/eagle-ring/new',
  '/ring/alice/next': 'https://bob.example.com/',
  '/ring/[slug]/prev': '/ring/[slug]',
}
```

plus `src/pages/go/[slug].astro` doing `return Astro.redirect('https://alice.example.com/')` from `getStaticPaths`. Output (`compressHTML` collapses the newlines):

```
dist/old/index.html
<meta http-equiv="refresh" content="0;url=/new"> … <link rel="canonical" href="https://jpierre-7.github.io/new">

dist/old-based/index.html
<meta http-equiv="refresh" content="0;url=/eagle-ring/new"> … <link rel="canonical" href="https://jpierre-7.github.io/eagle-ring/new">

dist/ring/alice/next/index.html
<meta http-equiv="refresh" content="0;url=https://bob.example.com/"> … <link rel="canonical" href="https://bob.example.com/">

dist/ring/alice/prev/index.html
<meta http-equiv="refresh" content="0;url=/ring/alice"> … <link rel="canonical" href="https://jpierre-7.github.io/ring/alice">

dist/go/alice/index.html
<meta http-equiv="refresh" content="2;url=https://alice.example.com/">
```

Findings:

1. **Internal destinations are not base-prefixed.** `'/old': '/new'` produced `url=/new`, which on Pages is `https://jpierre-7.github.io/new` → 404. The dynamic form `'/ring/[slug]/prev': '/ring/[slug]'` has the same defect (`/ring/alice`). The source side *is* placed under the base correctly (`/eagle-ring/old/`). This matches the source: `createRedirectRoutes` builds the source pattern with `settings.config.base` but stores the destination string as-is, and `getRouteGenerator` never sees `base`. [^astro-create-manifest] [^astro-render] Workaround: write internal destinations with the base (`'/old-based': '/eagle-ring/new'` came out right) or as absolute URLs. Ring Widget prev/next targets are other Members' Sites, i.e. external, so they are unaffected.
2. External redirects work and are instant (`0;url=https://…`), with the external URL as canonical.
3. `Astro.redirect()` from a prerendered page works but defaults to the 2-second variant.
4. With `build.format: 'file'` and `trailingSlash: 'never'`, the same redirects were written as `dist/ring/alice/next.html` etc., which Pages serves at the bare URL without the extra 301.

### Verdict for the Ring Widget

**Static prev/next URLs are viable on GitHub Pages.** Because `astro.config.mjs` is JavaScript, the config can read the Member data at build time and emit one `redirects` entry per Member per direction, e.g. `'/ring/<slug>/next': '<next Member's Site URL>'`. Each becomes a tiny HTML page with an instant meta refresh. Constraints:

- It is a client-side redirect: no HTTP 3xx, no `Location` header. Browsers and Google follow it; a plain `curl` shows a 200 with the HTML. `<meta name="robots" content="noindex">` and the canonical link keep the hop pages out of search.
- Every Submission that changes ring order changes neighbours' redirect targets; that is just a rebuild, which the workflow below does on push.
- **Random cannot be a static redirect**: a static file has one destination. Options: (a) a `random` page (`src/pages/ring/random.astro`) that inlines the Site list as JSON and runs `location.replace(list[Math.floor(Math.random()*list.length)])` in a `<script>`; (b) have the widget's own JS pick the random target on the Member's page, in which case there is no `/random` URL to host at all. Either way it is a few lines of JS, not a server.
- Meta refresh with `content="0;…"` is what the two redirect files use; if a `noscript` random fallback matters, (a) can also carry a plain list of links in the body.

## 3. Deploy workflow (GitHub Actions)

GitHub's guidance: "If you want to use a build process other than Jekyll or you do not want a dedicated branch to hold your compiled static files, we recommend that you write a GitHub Actions workflow to publish your site." The general flow is checkout → build → `actions/upload-pages-artifact` → `actions/deploy-pages`, and the repo must have **Settings → Pages → Build and deployment → Source: GitHub Actions** selected. [^gh-pubsrc] The deploy job "must have a minimum of `pages: write` and `id-token: write` permissions", must use `needs:` on the build job, and should target the `github-pages` environment. [^gh-workflows]

Astro's guide and the `withastro/action` README give the same two-job workflow; the action is a composite that detects the package manager from the lockfile, installs, runs the build, restores/saves the Astro cache, and calls `actions/upload-pages-artifact` on `dist/`. [^astro-gh] [^withastro-action] Inputs (all optional): `path` (default `.`), `node-version` (default `24`), `package-manager` (auto-detected; `npm`/`yarn`/`pnpm`/`bun`/`deno`, optionally `@version`), `build-cmd` (default `<pm> run build`), `cache` (default `true`), `cache-dir`, `out-dir` (default `dist`). It fails fast if no lockfile is committed. [^withastro-action]

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout your repository using git
        uses: actions/checkout@v7
      - name: Install, build, and upload your site
        uses: withastro/action@v6
        # with:
        #   path: .
        #   node-version: 24
        #   package-manager: pnpm@latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

If the Astro project lives in a subfolder of this repo (e.g. `site/`), set `path: site` and keep the lockfile there. The equivalent without `withastro/action` is `actions/setup-node` → `npm ci` → `npm run build` → `actions/upload-pages-artifact@v4 with: path: dist` → the same deploy job; `withastro/action@v6` just pins those steps (it currently uses `upload-pages-artifact@v5` with `include-hidden-files: true`). [^withastro-action] `actions/configure-pages` is optional; its `static_site_generator` input only accepts `nuxt`, `next`, `gatsby` or `sveltekit`, so for Astro `base` stays in `astro.config.mjs`. [^gh-workflows] [^configure-pages]

Limits worth knowing: published site ≤ 1 GB, soft bandwidth limit 100 GB/month, soft limit of 10 builds per hour. [^gh-limits]

## 4. Adding a custom domain later

### Astro side: two values change

From the Astro guide's custom-domain variant: [^astro-gh]

```js
export default defineConfig({
  site: 'https://ring.example.edu',
  // base removed
})
```

- `site` becomes the new origin (with the scheme; `www.`/subdomain exactly as configured in Pages).
- `base` is **deleted** (or set to `/`). Because every authored link went through `import.meta.env.BASE_URL`, they collapse to root paths with no other edits; that is the payoff for doing section 1 properly. Internal redirect destinations that were hand-prefixed with `/eagle-ring` (the workaround in section 2) must be un-prefixed at the same time; deriving them from `BASE_URL`/`site` in the config avoids a second edit.
- The Astro guide also says to add `public/CNAME`, but for an Actions-published site GitHub states: "If you are publishing from a custom GitHub Actions workflow, no CNAME file is created, and any existing CNAME file is ignored and is not required." [^gh-manage] [^gh-trouble] The domain is set in repo settings instead. Adding the file anyway is harmless.

### GitHub side

Order matters: "Make sure you add your custom domain to your GitHub Pages site before configuring your custom domain with your DNS provider. Configuring your custom domain with your DNS provider without adding your custom domain to GitHub could result in someone else being able to host a site on one of your subdomains." GitHub also recommends verifying the domain on the account first. [^gh-manage]

1. Settings → Pages → Custom domain → type the domain → Save.
2. DNS, per the docs' table: [^gh-manage] [^gh-https]
   - Subdomain (`ring.example.edu` or `www.example.edu`): one `CNAME` record → `jpierre-7.github.io` ("excluding the repository name"; never the `*.pages.github.io` name shown in settings).
   - Apex (`example.edu`): `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (and optionally `AAAA` `2606:50c0:8000::153` … `8003::153`), or a single `ALIAS`/`ANAME` → `jpierre-7.github.io`. GitHub recommends also configuring `www`, and then auto-redirects between apex and `www`.
   - Do not use wildcard records. Do not point a subdomain's CNAME at the apex ("you will encounter issues with enforcing HTTPS").
3. Wait: "DNS changes can take up to 24 hours to propagate." GitHub runs a DNS check, then "queues a job to request a TLS certificate from Let's Encrypt" and shows a check mark next to the domain when done; if it stalls, Remove and re-Save the domain to restart provisioning. The full domain name must be under 64 characters for the certificate. [^gh-https]
4. Tick **Enforce HTTPS** once it becomes available ("It can take up to 24 hours before this option is available"). [^gh-manage] `github.io` sites created after June 15 2016 are HTTPS automatically; custom domains need this step. [^gh-https]
5. Push a commit so the Actions workflow rebuilds with the new `site` and no `base`.

One account-level interaction: "if you set a custom domain for a user site or organization site, that same custom domain will be used for all project sites owned by the same account", so if `jpierre-7.github.io` ever gets its own domain, the Directory would silently move to `<that domain>/eagle-ring` unless the repo sets its own. [^gh-custom-about]

### What the migration breaks

- The old URLs `https://jpierre-7.github.io/eagle-ring/...` are not documented to redirect to the custom domain, and nothing in the Pages docs promises it. Assume they die. Every Ring Widget snippet a Member has pasted into their Site, and every inbound link, carries whatever hostname and path prefix was current when they copied it. The realistic mitigations are: pick the final domain before the first Member embeds the widget; or keep the widget's embedded URLs pointing at a hostname you control from day one; or make the widget load its links from a small JSON/JS file so the hostname lives in one place.
- `site`-derived output (canonical URLs, sitemap, the `canonical` link inside each redirect page) all switch to the new origin on the next build, which is the desired behaviour.

## Sources

[^gh-what]: GitHub Docs, "What is GitHub Pages?" — <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
[^gh-create]: GitHub Docs, "Creating a GitHub Pages site" (static site generators, `.nojekyll`, "does not support server-side languages") — <https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>
[^gh-limits]: GitHub Docs, "GitHub Pages limits" — <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
[^gh-pubsrc]: GitHub Docs, "Configuring a publishing source for your GitHub Pages site" — <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>
[^gh-workflows]: GitHub Docs, "Using custom workflows with GitHub Pages" — <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>
[^gh-404]: GitHub Docs, "Creating a custom 404 page for your GitHub Pages site" — <https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site>
[^gh-https]: GitHub Docs, "Securing your GitHub Pages site with HTTPS" — <https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https>
[^gh-custom-about]: GitHub Docs, "About custom domains and GitHub Pages" — <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages>
[^gh-manage]: GitHub Docs, "Managing a custom domain for your GitHub Pages site" — <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>
[^gh-trouble]: GitHub Docs, "Troubleshooting custom domains and GitHub Pages" — <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages>
[^astro-gh]: Astro Docs, "Deploy your Astro Site to GitHub Pages" — <https://docs.astro.build/en/guides/deploy/github/>
[^astro-config]: Astro Docs, "Configuration Reference" (`site`, `base`, `trailingSlash`, `redirects`, `build.format`, `build.redirects`) — <https://docs.astro.build/en/reference/configuration-reference/>
[^astro-routing]: Astro Docs, "Routing" (navigating with `base`, Redirects) — <https://docs.astro.build/en/guides/routing/>
[^astro-3xx]: Astro source, `packages/astro/src/core/routing/3xx.ts` (`redirectTemplate`) — <https://github.com/withastro/astro/blob/main/packages/astro/src/core/routing/3xx.ts>
[^astro-generate]: Astro source, `packages/astro/src/core/build/generate.ts` (3xx handling for prerendered routes) — <https://github.com/withastro/astro/blob/main/packages/astro/src/core/build/generate.ts>
[^astro-create-manifest]: Astro source, `packages/astro/src/core/routing/create-manifest.ts` (`createRedirectRoutes`) — <https://github.com/withastro/astro/blob/main/packages/astro/src/core/routing/create-manifest.ts>
[^astro-render]: Astro source, `packages/astro/src/core/redirects/render.ts` (`resolveRedirectTarget`, `computeRedirectStatus`) — <https://github.com/withastro/astro/blob/main/packages/astro/src/core/redirects/render.ts>
[^withastro-action]: `withastro/action` README and `action.yml` — <https://github.com/withastro/action>
[^configure-pages]: `actions/configure-pages` `action.yml` — <https://github.com/actions/configure-pages/blob/main/action.yml>

Measured behaviour (trailing-slash and extension-less handling, 404 status) was observed with `curl -I` against `pages.github.com` and `microsoft.github.io/monaco-editor` on 2026-09-17; the probe build used Astro 7.3.3 on Node 24.13.0.
