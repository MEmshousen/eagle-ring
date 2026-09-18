# Prior art: how existing webrings do prev/next/random on static hosts

Resolves [#5](https://github.com/jpierre-7/eagle-ring/issues/5). Surveyed 2026-09-17 against the rings' own sites and source repositories. Terms follow `CONTEXT.md` (Member, Site, Ring Widget, Directory, Submission).

## Summary

- Four distinct mechanisms are in use: **hub links** (Ring Widget is just a link to the Directory), **hash + client JS** (Directory page reads `#slug?nav=next` and redirects), **script-tag widget** (Member embeds a `<script>` that fetches the member list and rewrites its own links), and **generated redirect pages** (build step writes `/<slug>/next/index.html` with a `<meta http-equiv="refresh">`). Rings with a server (IndieWeb, maxboeck) use **Referer-based redirects**, which cannot run on GitHub Pages.
- Only the generated-redirect-page approach gives a Member plain `<a href>` links that work with JavaScript disabled on both ends. It is running live on GitHub Pages today at [ctp-webr.ing](https://ctp-webr.ing/) via [ringfairy](https://github.com/k3rs3d/ringfairy).
- Random cannot be done with zero JavaScript on a static host. Every static ring either drops it, delegates it to an external service, or serves a tiny JS page that picks from an inlined list. The JS lives on the ring's page, not the Member's, so the Member's snippet stays plain links.
- Join flow is a pull request everywhere except the IndieWeb ring (IndieAuth login) and aggier.ing (a form that opens the PR through a server-side GitHub token).
- Dead Sites are handled by hand in most rings. Three automate it: the IndieWeb "gardener" (crawls each Site for its links, flips `active`), hackclub's GitHub Action (fetch + puppeteer, prunes `members.json`, auto-merges), and ringfairy's `--audit` (Sites missing the links are left out of that build). Catppuccin adds a scheduled `lychee` link check that opens an issue.

## Surveyed rings

### 1. XXIIVV webring (webring.xxiivv.com)

Source: [github.com/XXIIVV/webring](https://github.com/XXIIVV/webring), HEAD `fbcd332` (2026-09-07). Hosted on GitHub Pages (`CNAME` in repo).

| Point | Finding |
|---|---|
| Widget mechanism | Hand-copied link to the Directory: `<a href="https://webring.xxiivv.com/#your-id-here"><img src="https://webring.xxiivv.com/icon.black.svg"></a>` ([README](https://github.com/XXIIVV/webring/blob/main/README.md)). |
| prev/next | **None today.** The README's "Circular Linking" section still says a hash "link[s] to the next link in the ring", but `index.html` at HEAD has no `<script>` element at all; the only effect of `#id` is the CSS rule `body > ol > li:target { background: ... }` that highlights the Member's row. The navigation JS (`scripts/portal.js`, which did `location.hash` -> `findIndex` -> `nextSiteIndex` -> `window.location = site.url` after a 3 s timeout) was removed in commit `a4a4d64` "Closed Hallway/Wiki" (2020-05-19). |
| Random | Delegated to an external server: the footer's "Random" link goes to `https://lieu.cblgh.org/random` ([cblgh/lieu](https://github.com/cblgh/lieu), a community search engine). Before 2020 it was `#random` handled by `portal.js` (`Math.random()` over the in-page `sites` array). |
| Leaving / dead Sites | Manual. Commits such as `3066a8a` "Removed website without linkback" (2026-08-23), `0ca0fb7` "Removed deadlinks" (2025-08-31); a `broken-link.md` issue template; README policy "Websites without activity for over two years might also be periodically removed. The webring will never exceed 256 entries". No CI in the repo (no `.github/workflows`). |
| Join flow | PR that edits `index.html` directly, adding an `<li data-lang="en" id="slug">` with the Site link, optional RSS link, and (mandatory from 2026) an 88x31 banner `<img>`. PR template (`.github/PULL_REQUEST_TEMPLATE/add-site.md`) asks only for the position of the icon on the Site. Criteria include own domain ("we do not accept `github.io` subdomains"), 10+ content pages, and "If your website requires Javascript/CSS3 to display the majority of its content or to navigate, it will be rejected." |

Notes: the data lives inside the HTML, so a bad PR breaks the whole Directory. The `id` attribute on each `<li>` is the Member's stable slug and appears in the Member's pasted link, which is the pattern every other GitHub-hosted ring copies.

### 2. IndieWeb webring (🕸💍.ws / xn--sr8hvo.ws)

Source: current PHP version at [git.schmarty.net/schmarty/gem-diamond](https://git.schmarty.net/schmarty/gem-diamond) ("PHP port of the NodeJS originally at glitch.com"); archived Node version at [github.com/martymcguire/indiewebring.ws](https://github.com/martymcguire/indiewebring.ws). Design write-up: [Rebooting an IndieWeb webring](https://martymcgui.re/2023/05/20/rebooting--an-indieweb-webring/). This ring needs a server (PHP + SQLite) and is included as the reference for what a server buys you.

| Point | Finding |
|---|---|
| Widget mechanism | Hand-copied links shown on the Member dashboard (`views/dashboard.php`): `<a href="https://<host>/previous">&larr;</a> An <a href="https://<host>">IndieWeb Webring</a> 🕸💍 <a href="https://<host>/next">&rarr;</a>`. Older per-Member form `/<slug>/previous` and `/<slug>/next` is still routed (`public/index.php` lines 48-52) for backward compatibility; the slug was three emoji from `hash-emoji-without-borders` of the URL (`lib/models/site.js`). |
| prev/next | Server reads the `Referer` header (`Controller::next`, `$request->getHeader('referer')[0]`), looks the Site up by exact URL ("exact matches only sorry"), then `SELECT ... WHERE active = 1 AND sorting > (current) ORDER BY sorting LIMIT 1` (`app/Model/Site.php`). No Referer -> random. Unknown referer -> random. Edge: when there is no site with a greater `sorting`, `?? '/'` sends the visitor to the ring homepage rather than wrapping to the first Site. The archived Node version had `next` and `previous` both doing `ORDER BY RANDOM()`; the 2023 reboot post says they "should now be, more or less, deterministic". |
| Random | `/random`: `SELECT * from Sites WHERE active = 1 ORDER BY RANDOM() LIMIT 1`, 302. |
| Leaving / dead Sites | Automated. `bin/gardener.php` runs `Gardener::garden()` over every Site, fetches the homepage, looks for `<a>` elements whose `href` equals the expected previous/next URLs (archived `lib/check-links.js` shows the algorithm: `active: (Object.keys(found).length > 0)`, i.e. at least one of the two links), sets `active`, then `updateSorting()` re-numbers active Sites. `/terms`: "If the links are missing, your site will be marked as inactive." Inactive Sites are skipped by the `WHERE active = 1` queries, never deleted; the Member can "Check links now!" from the dashboard or remove themselves. |
| Join flow | Sign in with your domain via IndieAuth (or RelMeAuth since 2024-08); the server inserts the Site, then the gardener verifies the links appear on the homepage before it becomes active. Optionally fetches the representative h-card for a profile in the Directory. |

Notes: the Referer approach is fragile in 2026. MDN: the default policy is `strict-origin-when-cross-origin`, which for cross-origin requests sends "the origin (only)". A Site hosted under a path (`user.github.io/site/`) therefore arrives as `https://user.github.io/`, which will not match "exact matches only", and the visitor gets a random Site instead of the neighbour. This matters for a student ring where `github.io` sub-paths are common.

### 3. uwatering (cs.uwatering.com), UW CS webring

Source: [github.com/JusGu/uwatering](https://github.com/JusGu/uwatering) (53 stars, pushed 2026-08-28). Static `index.html` + `javascript/script.js`. The closest analogue to Eagle Ring (a CS student/alumni ring with a Graduation Year field); it credits XXIIVV as inspiration.

| Point | Finding |
|---|---|
| Widget mechanism | Hand-copied links with the Member's URL in the hash: `<a href="https://cs.uwatering.com/#your-site-here?nav=prev">←</a> <a href="https://cs.uwatering.com/#your-site-here"><img src=".../icon.black.svg"></a> <a href="https://cs.uwatering.com/#your-site-here?nav=next">→</a>` (README "Widget template"). |
| prev/next | Client JS on the Directory page. `navigateWebring()` reads `location.hash`, splits on `?`, parses `nav=next|prev`, finds the Member by `fuzzyMatch(currentSite, site.website)` (strip protocol/`www.`/trailing slash, then bidirectional `includes`), computes `(currIndex ± 1) % length` with wraparound, replaces the body with "redirecting..." and sets `window.location.href`. If more than one Site matches it `throw`s (`Cannot calculate navigation state because mutiple URLs matched`). Order = order of the `webringData.sites` array (append-at-bottom). |
| Random | **Not implemented.** No random link in the widget or the page. |
| Leaving / dead Sites | Manual commits ("Remove Emma Shi from webring", 2026-07-21, and two more the same day). No link checker. A dead Site stays in the ring until someone notices; `nav=next` from its neighbour sends visitors to it. |
| Join flow | Fork, append a `{ "name", "website", "year" }` object to the bottom of `webringData[]` **inside `index.html`**, open a PR. PR template is one line: "Website Link:". `CODEOWNERS` routes review to the two maintainers. Commit `2026-08-26 "Fix webringData syntax error and ordering after merging #159 and #168"` shows the cost of keeping data inside a JS literal in the HTML. |

Notes: the bidirectional `includes` match means `#a.dev` also matches `ba.dev`, and the page then throws instead of navigating. Members are told to paste their URL rather than a slug, which is what makes the matching fuzzy in the first place.

### 4. se-webring (se-webring.xyz), UW Software Engineering

Source: [github.com/simcard0000/se-webring](https://github.com/simcard0000/se-webring) (Netlify). Included briefly because it is the other well-known student ring and its README states the "no widget" position explicitly.

- Widget: none from the ring. README: a mention on your Site "can either be a link back to the main site, a link to the next person in the webring, or a link to both the previous and next person. For the latter two options ... this might involve linking back to the first person in the ring and/or waiting for another pull request to be approved and linking to that new site instead." That is, Members hand-maintain their own neighbour links; the README calls it "more like a web-star".
- prev/next/random: none served by the ring. Directory only (`js/sites.js` array, Fuse.js search).
- Join: PR appending to `allSites` in `js/sites.js`; PR template asks for full name, cohort year, website URL, and "LinkedIn or a similar profile" so "we know you're human".

### 5. hackclub/webring (webring.hackclub.com)

Source: [github.com/hackclub/webring](https://github.com/hackclub/webring) (Vercel; `vercel.json` sets `Access-Control-Allow-Origin: *`).

| Point | Finding |
|---|---|
| Widget mechanism | Script tag. Member pastes a `<div id="webring-wrapper">` with three `<a href="https://webring.hackclub.com/">` placeholders (`id="previousBtn"`, logo, `id="nextBtn"`) plus `<script src="https://webring.hackclub.com/public/embed.min.js">` (`CONTRIBUTING.md`). Without JS the three links all go to the Directory, which is a reasonable fallback. |
| prev/next | `public/embed.js` fetches `members.json` cross-origin by XHR, finds the Member by comparing `document.location.hostname` with `new URL(member.url).hostname`, sets `previousBtn.href`/`nextBtn.href` with wraparound. Pitfall: `siteIndex` defaults to `0`, so a Site not in the list silently gets Member 0's neighbours. Hostname-only matching also cannot distinguish two Members on the same host (e.g. `github.io` user pages are fine, project pages are not). |
| Random | Not offered. |
| Leaving / dead Sites | Automated. `maintain.js` runs in a GitHub Action on every push to `main` (`.github/workflows/maintenance.yml`): fetches each URL, requires `response.ok`, strips whitespace and comments and checks the HTML `includes("https://webring.hackclub.com")`, falling back to a Puppeteer render for client-rendered Sites; Members may set `"bypass": true`. It writes the active list to `public/members.json`, commits to `auto-maintain-branch`, opens a PR and `gh pr merge --auto`. |
| Join flow | Paste the snippet, append `{ "member", "url" }` to `members.json`, open a PR; "we'll review it within the next 48 hours". |

### 6. onionring.js (Neocities-era script widget)

Source: [allium.house/garden/onionring](https://allium.house/garden/onionring/) (canonical; CNPL license) and the GitHub fork [sertimus/onionring.js-sertimus](https://github.com/sertimus/onionring.js-sertimus) whose `onionring-functions.js` header says "originally made by joey + mord of allium (蒜) house, last updated 2020-11-24". Included because it is the widget most small static rings copy.

- Widget: `<div id='webringid'><script src="scriptURL/onionring-variables.js"></script><script src="scriptURL/onionring-widget.js"></script></div>`. The whole member list is a JS array in `onionring-variables.js` on the ring host; the widget runs on the Member's page.
- prev/next: the widget "checks if the url it's on **begins with** the one in the list" (`window.location.href` against `sites[]`), then indexes ±1.
- Random: `Math.random()` over a copy of the list with the current Site spliced out; `window.top.location.href = ...` (fork's `randomSite`). Fork README: "More than one site is required for the random site link to work, otherwise it will ... go to `www.undefined.com`."
- Dead Sites: manual edit of `onionring-variables.js`; changes propagate to every Member on next page load.
- Join: whatever the ring owner chooses; there is no repo convention.
- Pitfalls: nothing renders without JS; each Member page loads two cross-origin scripts; the license (CNPL) is non-standard and would need a decision before copying code rather than the idea.

### 7. maxboeck/webring (Eleventy + Netlify starter kit)

Source: [github.com/maxboeck/webring](https://github.com/maxboeck/webring) (279 stars, `master`). Demo at webringdemo.netlify.app.

- Widget: a web component with plain-link fallback: `<webring-banner><p>Member of <a href="{url}">{title}</a></p><a href="{url}/prev">Previous</a><a href="{url}/random">Random</a><a href="{url}/next">Next</a></webring-banner><script async src="{url}/embed.js">`. The links are ring-side URLs, so the fallback is real.
- prev/next/random: `netlify.toml` rewrites `/next`, `/prev`, `/random` to Netlify Functions (`_lambda/next.js` etc.). `getIndex(referer)` does `members.findIndex(site => url.includes(site.url))` on the `Referer` header; unknown referer -> `getRandom()`; 303 redirect. Same Referer caveat as the IndieWeb ring.
- Dead Sites: manual edit of `src/data/members.json`. No checker.
- Join: PR (template in `.github/pull_request_template.md`) or an email signup form (`src/includes/signupform.njk`).
- Not usable on GitHub Pages as-is: the redirect logic is a serverless function.

### 8. ringfairy + Catppuccin webring (ctp-webr.ing), the static-generator approach

Source: [github.com/k3rs3d/ringfairy](https://github.com/k3rs3d/ringfairy) (Rust, GPL-3.0, 95 stars) and a live ring built with it on **GitHub Pages**: [github.com/isabelroses/catppuccin-webring](https://github.com/isabelroses/catppuccin-webring) (63 Members; `curl -sI https://ctp-webr.ing/` returns `server: GitHub.com` and `access-control-allow-origin: *`). ringfairy README: "Unlike most webrings which rely on some kind of server-side code to redirect visitors, this uses HTML redirects. The static approach allows for simpler hosting requirements (it can be hosted on Neocities, GitHub Pages, etc)".

| Point | Finding |
|---|---|
| Widget mechanism | Hand-copied plain links with the Member's slug in the path (Catppuccin README): `<a href="https://ctp-webr.ing/YOUR_SLUG/previous">&larr;</a><a href="https://ctp-webr.ing/">Catppuccin webring</a><a href="https://ctp-webr.ing/YOUR_SLUG/next">&rarr;</a>`. No script on the Member's page. |
| prev/next | Build step (`src/gen/html.rs`) creates `<output>/<slug>/next/index.html` and `<output>/<slug>/previous/index.html` for every Member from `redirect.html`, whose core is `<meta http-equiv="refresh" content="0; url={{ url }}">` plus a visible `<a href="{{ url }}">` fallback. Verified live: `https://ctp-webr.ing/isabelroses/next/` is a minified page with `<meta content="1; url=https://lem.my" http-equiv=refresh>`. Order is the list order, or shuffled per build when `shuffle = true` (Catppuccin sets this, so neighbours change on every deploy; nothing on Member Sites needs to change because links carry the slug, not the neighbour). |
| Random | A small JS page. Catppuccin's `data/templates/rand.html` inlines every URL into a `siteLinks` array at build time and does `window.location.href = siteLinks[Math.floor(Math.random() * siteLinks.length)]`; served at `https://ctp-webr.ing/rand`. ringfairy also exposes a build-time "featured site" (`{{ featured_site_url }}`), which is random per build, not per visit. |
| Leaving / dead Sites | Two layers. (a) ringfairy `--audit`: "Scrapes each website in the list, checking to see if the next/previous links can be found. Otherwise, the site won't be added to the webring for that build." The check (`src/website.rs::does_html_contain_links`) looks for `<a href>` equal to the expected `base_url/slug/next` and `/previous` and also scans `onclick` attributes. (b) Catppuccin's `.github/workflows/check-links.yml` runs `lycheeverse/lychee-action` over `websites.json` on a cron ("0 0 * * 1,4") and on PRs, and opens a "Link Checker Report" issue on failures. Removal itself is a PR editing `websites.json`. |
| Join flow | PR adding `{ "name", "slug", "about", "url", "rss", "owner" }` to `websites.json` (only `url` and `slug` required), then paste the snippet. `.github/workflows/deploy.yml` builds with `ringfairy` on push to `main` and deploys with `actions/deploy-pages`. ringfairy "Catches errors and duplicate entries" at build time, so a malformed Submission fails the build rather than the live page. |

### 9. krusynth/webring-starter (Jekyll on GitHub Pages)

Source: [github.com/krusynth/webring-starter](https://github.com/krusynth/webring-starter). Included for its two-tier widget, which is close to what the ticket asks for.

- Widget, tier 1: `<script src="{ring}/webring.js"></script><script>showWebring(true);</script>`. `webring.js` (Jekyll-templated) XHRs `list.json` from the ring's GitHub Pages origin, matches `window.location.href.substr(0, sites[i].url.length) === sites[i].url` (prefix match), defaults to index `0` when not found, and injects a banner with prev/next links.
- Widget, tier 2 ("For Hosted Blogs ... which does not allow custom JavaScript"): a generator on the Join page emits plain links `<a href="{ring}/redirect?dir=prev&from={site}">` and `<a href="{ring}/redirect?from={site}">`. `redirect.md` is a page whose inline JS reads `?from=` and `?dir=`, prefix-matches, and calls `window.location.replace(next.url)`; on `not-in-list` it falls through to the first Site.
- Random: none.
- Dead Sites: manual edit of `list.json`.
- Join: README default is "open an issue on GitHub"; the maintainer edits `list.json` by hand.

### 10. aggier.ing (Texas A&M), join flow only

Source: [github.com/isaacchacko/aggiering](https://github.com/isaacchacko/aggiering) (Next.js). A Directory with a badge, not a ring (badge links to `https://aggier.ing` only; no prev/next/random).

- Data: `src/data/webringData.ts`, entries `{ name, website, year }`, same shape as uwatering.
- Manual join: README walks a first-time contributor through the GitHub pencil-icon edit -> fork -> PR.
- Form join: `src/app/(site)/add-website/page.tsx` posts to `src/app/api/webring/join/route.ts`, which verifies a Cloudflare Turnstile token, rate-limits by IP (`rateLimitJoin.ts`), validates (`joinValidation.ts`: https only, 4-digit year, canonicalised URL, duplicate check against the file on `main`), then `createJoinPullRequest.ts` uses Octokit with a server-held token to create a `join/<timestamp>-<rand>` branch, commit the appended entry, and open a PR whose body includes a "Verification profile" link for the Maintainer. Tests cover the file edit (`webringFileEdit.test.ts`) and validation.
- Takeaway for a no-server ring: the *shape* (validate, canonicalise, dedupe, append, PR with a verification link) is worth copying, but the form itself needs a server-side secret. On GitHub Pages the equivalent is an issue form template that a workflow turns into a PR, or simply the manual path with good instructions.

## Comparison

| Ring | Host | Widget on Member Site | prev/next resolution | Random | Dead-Site handling | Join |
|---|---|---|---|---|---|---|
| XXIIVV | GitHub Pages | Plain link + icon to Directory `#slug` | None (CSS highlight only; JS removed 2020) | External (lieu.cblgh.org) | Manual commits, issue template | PR editing `index.html` |
| IndieWeb 🕸💍 | PHP server | Plain links `/previous`, `/next` | Server: Referer -> `sorting` column | Server `ORDER BY RANDOM()` | Gardener crawl sets `active`; skipped, not deleted | IndieAuth sign-in |
| uwatering | Static + JS | Plain links `#url?nav=prev\|next` | Directory-page JS, fuzzy URL match, wraps | None | Manual commits | PR editing `index.html` |
| se-webring | Netlify static | None; Members hand-link neighbours | Members themselves | None | Manual | PR editing `sites.js` |
| hackclub | Vercel static | `<script>` widget, links fall back to Directory | Widget JS on Member page, hostname match | None | GH Action fetch/puppeteer, auto-PR | PR editing `members.json` |
| onionring | Any static | Two `<script>` tags | Widget JS, prefix match | Widget JS `Math.random()` | Manual edit of variables file | Owner's choice |
| maxboeck | Netlify + Functions | Web component, plain-link fallback | Serverless: Referer -> index | Serverless | Manual | PR or email form |
| ringfairy / Catppuccin | **GitHub Pages** | Plain links `/slug/previous`, `/slug/next` | Generated `<meta refresh>` pages per Member | JS page `/rand` with inlined list | `--audit` at build; scheduled lychee -> issue | PR editing `websites.json`, Action builds + deploys |
| webring-starter | GitHub Pages (Jekyll) | `<script>` or plain `/redirect?from=` links | Widget JS or redirect-page JS, prefix match | None | Manual | Issue -> maintainer edits |
| aggier.ing | Next.js server | Badge link only | n/a (Directory) | n/a | Manual | Form -> server opens PR; or manual PR |

## Recommendation for Eagle Ring (GitHub Pages, no server, plain-link baseline)

**Generate per-Member redirect pages at build time, ringfairy-style, and keep the Ring Widget as three plain links.**

1. **Ring Widget = plain links carrying the Member's slug.** `https://<ring>/<slug>/prev/`, `https://<ring>/` (Directory), `https://<ring>/<slug>/next/`, optionally `https://<ring>/random/`. Nothing on the Member's Site executes; it works in a README, a Markdown blog, or a hosted platform that strips scripts. This is exactly what Catppuccin ships and what XXIIVV, uwatering, and the IndieWeb ring converge on in form (a slug in the URL). Do not copy hackclub/onionring's script-tag widget as the baseline: it renders nothing without JS and loads cross-origin code into every Member's page.
2. **prev/next = generated static pages.** A build step (any language; a GitHub Action on push to `main`) reads the Member list and writes `<slug>/prev/index.html` and `<slug>/next/index.html` containing `<meta http-equiv="refresh" content="0; url=NEIGHBOUR">` and a visible `<a href="NEIGHBOUR">` fallback, then deploys with `actions/deploy-pages`. Verified live on GitHub Pages at ctp-webr.ing. Because the Member's link names *their own* slug, neighbours can change freely (a Member leaves, order changes) with no edits on any Site. This also sidesteps the Referer problem entirely; Referer-based resolution (IndieWeb, maxboeck) needs a server *and* breaks for path-hosted Sites under the current default `strict-origin-when-cross-origin` policy.
3. **Random = one small JS page on the ring, not on the Member's Site.** Generate `random/index.html` with the URL list inlined and `location.replace(list[Math.floor(Math.random()*list.length)])`, with a `<noscript>` fallback that links to the Directory. Every static ring surveyed either does this (Catppuccin `/rand`), drops random (uwatering, hackclub), or outsources it (XXIIVV to lieu). A no-JS alternative that is still honest is "random at build time": regenerate `random/` on a schedule so it points at a different Member each run; note it in the ADR if chosen.
4. **Keep data out of the HTML.** uwatering's "Fix webringData syntax error and ordering after merging" commit is the failure mode of editing a JS literal inside `index.html` through concurrent PRs. Store Members in a data file (JSON/YAML/TOML), validate it in CI on every Submission (schema, https-only, duplicate URL/slug, 4-digit Graduation Year, as aggier.ing's `joinValidation.ts` does), and let the build fail rather than the page.
5. **Dead and departing Sites.** Copy two patterns: (a) a scheduled link check (Catppuccin's `lychee` job on a cron that opens an issue) so the Maintainer learns about dead Sites without visiting them; (b) an "is the Ring Widget actually on the Site" audit like ringfairy `--audit` / IndieWeb gardener / hackclub `maintain.js`, run on a schedule, that flags (or, if the Maintainer wants, skips) Members whose homepage lacks the `<slug>/next` link. Prefer flag-and-issue over auto-removal at first: hackclub's auto-merge bot is the most automated and the most surprising to Members. Departure is a Submission (PR) that removes the record; since every Widget link is slug-based, the Member's neighbours need no action.
6. **Join flow = Submission PR editing the data file**, matching `CONTEXT.md`. Reuse the README structure from aggier.ing (pencil-icon walkthrough for first-time contributors) and se-webring's PR template (name, Graduation Year, Site URL, a second profile link so the Maintainer can confirm the School affiliation). Make the slug explicit in the record (as XXIIVV `id` and ringfairy `slug` do) rather than deriving it from the URL; uwatering's fuzzy URL matching and hackclub's hostname matching both exist only because the Member pasted a URL instead of a slug.

### Pitfalls seen, to avoid

- **Documentation drifting from behaviour.** XXIIVV's README still advertises hash-based "next" navigation six years after the script was removed.
- **Fuzzy matching on URLs** (uwatering bidirectional `includes`, webring-starter prefix match, hackclub hostname-only) produces throws, wrong neighbours, or silently selecting Member 0. Slugs avoid the whole class.
- **No wraparound at the ends** (IndieWeb `?? '/'` sends the last Member's "next" to the homepage). Generate with `(i + 1) % n`.
- **Random with one Member** (onionring's `www.undefined.com`). Guard the empty/one-element case in the generator.
- **Referer dependence** is both a server requirement and, since the 2020 default-policy change, unreliable for Sites hosted under a path.
- **Data inside HTML/JS literals** makes every Submission a merge-conflict and syntax-error risk.
- **Default `github.io` exclusion** (XXIIVV) would exclude most students; do not copy that criterion.

## Sources

- XXIIVV: https://github.com/XXIIVV/webring (README, `index.html` at `fbcd332`, commits `a4a4d64`, `3066a8a`, `0ca0fb7`; pre-2020 `scripts/portal.js`; `.github/` templates)
- IndieWeb ring: https://xn--sr8hvo.ws/ and `/terms`; https://git.schmarty.net/schmarty/gem-diamond (`app/Controller.php`, `app/Model/Site.php`, `public/index.php`, `bin/gardener.php`, `views/dashboard.php`); https://github.com/martymcguire/indiewebring.ws (`server.js`, `gardener.js`, `lib/check-links.js`, `lib/models/site.js`, `views/dashboard.hbs`); https://martymcgui.re/2023/05/20/rebooting--an-indieweb-webring/
- uwatering: https://github.com/JusGu/uwatering (README, `index.html`, `javascript/script.js`, `javascript/helpers.js`, `.github/pull_request_template.md`, `CODEOWNERS`, commit log)
- se-webring: https://github.com/simcard0000/se-webring (README, `js/sites.js`, `.github/pull_request_template.md`)
- hackclub: https://github.com/hackclub/webring (`CONTRIBUTING.md`, `public/embed.js`, `maintain.js`, `.github/workflows/maintenance.yml`, `vercel.json`)
- onionring: https://allium.house/garden/onionring/ ; https://github.com/sertimus/onionring.js-sertimus (`onionring-functions.js`, README)
- maxboeck: https://github.com/maxboeck/webring (README, `netlify.toml`, `_lambda/next.js`, `_lambda/common/utils.js`)
- ringfairy: https://github.com/k3rs3d/ringfairy (README, `data/templates/redirect.html`, `src/gen/html.rs`, `src/website.rs`, `src/cli.rs`)
- Catppuccin webring: https://github.com/isabelroses/catppuccin-webring (README, `ringfairy.toml`, `data/templates/rand.html`, `data/templates/template.html`, `.github/workflows/check-links.yml`, `.github/workflows/deploy.yml`); live checks of https://ctp-webr.ing/isabelroses/next/ and https://ctp-webr.ing/rand
- webring-starter: https://github.com/krusynth/webring-starter (README, `webring.js`, `redirect.md`, `_includes/join-script.html`)
- aggier.ing: https://github.com/isaacchacko/aggiering (README, `src/lib/createJoinPullRequest.ts`, `src/lib/joinValidation.ts`, `src/app/api/webring/join/route.ts`)
- Referrer policy default: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
