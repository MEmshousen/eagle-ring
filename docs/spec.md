# Eagle Ring v1 spec

Eagle Ring is a webring for Houston City College CS students and alumni: a public **Directory** of Members' personal **Sites**, plus an optional **Ring Widget** Members paste into their Sites to link them into a ring.

This spec is the handoff from the planning map [Eagle Ring — v1 spec](https://github.com/jpierre-7/eagle-ring/issues/1). Every decision in it is settled; the linked tickets hold the reasoning. A builder should be able to start here without reopening any of them. Terms in **bold capitals** (Member, Site, Directory, Ring Widget, Graduation Year, Standing, Submission, Maintainer, School) are defined in [`CONTEXT.md`](../CONTEXT.md); use them in code, docs and UI copy.

## Contents

1. [Scope](#1-scope)
2. [Stack, config and deploy](#2-stack-config-and-deploy)
3. [Member data](#3-member-data)
4. [Submission workflow](#4-submission-workflow)
5. [Directory](#5-directory)
6. [Ring Widget](#6-ring-widget)
7. [Moving to a custom domain](#7-moving-to-a-custom-domain)
8. [Launch](#8-launch)
9. [Things to verify during the build](#9-things-to-verify-during-the-build)
10. [Decision log](#10-decision-log)

---

## 1. Scope

**In v1**

- The Directory page, with search, By year / A-Z ordering and a Random Site button.
- The Ring Widget: per-Member previous / next links, a random link, and a fallback for removed Members.
- Member data as one YAML file per Member, validated at build time and in CI.
- The Submission workflow: `CONTRIBUTING.md`, a PR template, CI checks and `CODEOWNERS`.
- Deploy to GitHub Pages at `https://jpierre-7.github.io/eagle-ring/`.

**Out of scope for v1** (follow-ups, not part of this build)

- Accounts or login, analytics, an RSS feed of new Members, a blog, an admin UI.
- Dead-link checking and a "does the Site still carry the widget" audit (candidates for v1.1; the prior-art research recommends a scheduled `lychee` check that opens issues).
- Email-based eligibility checks (e.g. requiring an `@hccs.edu` address). Eligibility is on the honour system.
- An issue-template Submission path for people who don't use git.
- A paste-in `<script>` version of the Ring Widget. Plain links cover everything.
- A custom domain. v1 lives on the GitHub Pages subdomain; section 7 covers the later move.
- An eagle logo mark. v1 uses a wordmark only.

---

## 2. Stack, config and deploy

*Source: [Research: Astro on GitHub Pages — base path, redirects, custom-domain migration](https://github.com/jpierre-7/eagle-ring/issues/4) (full write-up on branch `research/astro-github-pages`).*

- **Astro**, static output, no adapter. **Tailwind v4** through its Vite plugin. No React or other UI framework; interactivity is small inline scripts.
- **Fonts:** Bricolage Grotesque (display and body, variable, weights 200–800) and JetBrains Mono (Site domains, metadata), both under the SIL Open Font License and self-hosted with `@font-face` and `font-display: swap`, licence files alongside. No Google Fonts `<link>` in production. The heaviest weight is 800; the Graduation Year numerals use it.
- **Font licences:** every font committed to the repo must allow redistribution (OFL or similar), because the repo is public and forkable. Cabinet Grotesk, the original choice, was dropped for this reason: its licence forbids distribution through a repository.
- **Icons:** Phosphor, the framework-free package.

### `astro.config.mjs`

```js
export default defineConfig({
  site: 'https://jpierre-7.github.io',
  base: '/eagle-ring',
  trailingSlash: 'never',
  build: { format: 'file' },
})
```

- `build.format: 'file'` with `trailingSlash: 'never'` makes GitHub Pages serve `/x` straight from `x.html`, so each Ring Widget click is a single hop. Never publish the trailing-slash form of a ring URL.
- Astro prefixes its own output with `base` but **never rewrites authored links**. Every `href` and `src` must go through `import.meta.env.BASE_URL`; `astro dev` also serves under `/eagle-ring/`, so unprefixed links break locally too.
- If you use Astro's `redirects` config, internal targets are emitted **without** `base`. Write them as `/eagle-ring/...` or as absolute URLs.

### Deploy

`.github/workflows/deploy.yml`, two jobs, on push to `main` and on manual dispatch:

```yaml
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
      - uses: actions/checkout@v7
      - uses: withastro/action@v6
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- Repo setting: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- Commit the lockfile; `withastro/action` fails without one.
- The repo must be **public** for Pages on a free plan and so Members can fork it (see [Launch](#8-launch)).

---

## 3. Member data

*Sources: [Member schema, data file format, and Submission workflow](https://github.com/jpierre-7/eagle-ring/issues/3) and its Standing amendment from [Prototype: Directory page in the chosen design direction](https://github.com/jpierre-7/eagle-ring/issues/6).*

### Who can be a Member

Anyone who takes or took CS coursework at the School. A School degree is not required, so people who transferred out count. Eligibility is on the honour system; the Maintainer glances at the Site before merging.

### Layout

One YAML file per Member at `src/content/members/<slug>.yaml`, loaded as an Astro content collection with a Zod schema, so every record is validated at build time.

### Schema

| Field | Required | Rules |
|---|---|---|
| *(slug)* | yes | The **filename**, not a field. Matches `^[a-z0-9]+(-[a-z0-9]+)*$`, 2 to 32 characters, chosen by the Member (usually from their name). Unique because it's a filename. **Never changes after merge**, because it appears in Ring Widget URLs. |
| `name` | yes | Display name of the Member's choice, 1 to 60 characters. |
| `site` | yes | Starts with `https://`; no query string or fragment; subpaths allowed. Unique across Members. GitHub Pages Sites are explicitly allowed, including project subpaths such as `https://7jpierre.github.io/jp-website/`. Profile pages are rejected by a denylist (`linkedin.com`, `github.com/<user>`, `x.com` and similar). The Maintainer judges grey areas. |
| `graduationYear` | yes | Integer from 1990 to the current year + 6. The year the Member graduated from, expects to graduate from, or left the School. A current student's best guess, which they can update later. |
| `github` | yes | GitHub handle. Shown in the Directory. Also decides who owns the record (see [Editing](#edit-and-remove)). |
| `tagline` | no | Plain text, at most 80 characters. No Markdown or links. |
| `status` | no | The Member's **Standing**: `graduated`, `transferred` or `attended`, shown as Graduated / Transferred / Attended. *Attended* means took classes and left without graduating or transferring. Not allowed when `graduationYear` is after the current year; current students leave it empty. |

There is no join-date field. Ring order is alphabetical by slug (section 6), which needs no extra data.

Example, `src/content/members/kevin-tran.yaml`:

```yaml
name: Kevin Tran
site: https://kevintran.github.io/
graduationYear: 2023
github: kvtran
tagline: Data analyst. Plots things in R.
status: transferred
```

---

## 4. Submission workflow

*Source: [Member schema, data file format, and Submission workflow](https://github.com/jpierre-7/eagle-ring/issues/3).*

A **Submission** is a pull request that adds or edits one Member's record. It is the only way into the Directory.

### Steps for a new Member

1. Fork the repo.
2. Copy the example file to `src/content/members/<your-slug>.yaml` and fill it in.
3. Open a PR and tick the three PR-template checkboxes.
4. CI runs. The Maintainer reviews it, looks at the Site, and merges.
5. Optional: add the Ring Widget to your Site (section 6).

### CI checks on a Submission PR

A GitHub Actions workflow on `pull_request`:

- **Blocking** (the PR can't merge):
  - The record passes the schema (the Astro build or `astro check` covers this).
  - The slug matches the format.
  - `site` and `github` are unique across Members.
  - `site` is not on the profile-page denylist.
  - `status` is not set on a future `graduationYear`.
  - The PR changes **exactly one file under `src/content/members/` and nothing else**. The Maintainer's own PRs are exempt.
- **Warning only:** CI fetches `site` once. If that fails, it reports a warning and the Maintainer decides (sites that block bots or start slowly would make this flaky).
- **Ownership on edits:** if the PR edits an existing record and the PR author is not that record's `github`, CI flags the PR "needs Maintainer approval". This covers someone else editing a record and a Member who renamed their GitHub account.

### Edit and remove

- **Edit:** the Member opens a PR changing their own file. The slug (filename) never changes.
- **Self-removal:** a PR deleting their file, or an issue if they don't use git.
- **Maintainer removal:** only when the Site has been down for 30 days or more, its content is inappropriate, or the Member isn't eligible. The Maintainer @-mentions the Member on the removal PR.
- What a removal does to the ring is covered in section 6.

### `CONTRIBUTING.md` outline

1. Who can be a Member (the rule above, in plain words).
2. What you need first: a Site on `https://` and a GitHub account.
3. Steps: fork, copy the example file, fill it in, open a PR.
4. Every field and its rules, including the optional tagline and Standing.
5. What CI checks, and what a warning means.
6. Adding the Ring Widget: snippet A as the default, snippet B as the optional styled version, with the Member's slug filled in.
7. Editing your record or leaving.
8. How to contact the Maintainer.

### PR template

Three required checkboxes, plus one free-text line:

- [ ] I take or took CS coursework at the School.
- [ ] This Site is mine.
- [ ] This PR changes only my Member file.

*Anything the Maintainer should know?*

### `CODEOWNERS`

Names the Maintainer for everything. Handing the ring over to a club later is a one-line change.

---

## 5. Directory

*Sources: [Design direction: vibe, school identity, the design read](https://github.com/jpierre-7/eagle-ring/issues/2), [Prototype: Directory page in the chosen design direction](https://github.com/jpierre-7/eagle-ring/issues/6) (accepted variant E on branch `prototype/directory`), [Launch: the Directory with 0–3 Members, and seeding](https://github.com/jpierre-7/eagle-ring/issues/11).*

### Design rules

`design-taste-frontend` governs all design work. Its brief is this design read, which is not re-derived (the display face was changed from Cabinet Grotesk to Bricolage Grotesque for licensing; everything else is as decided):

> Reading this as: a community Directory for Houston City College CS students and alumni, with a homegrown, proud, lively language, leaning toward Astro + Tailwind v4 + native CSS, Bricolage Grotesque display with JetBrains Mono, and one signal-yellow accent on zinc neutrals in auto light/dark.

- **Dials:** DESIGN_VARIANCE 6, MOTION_INTENSITY 3 (CSS transitions only, all gated on `prefers-reduced-motion`), VISUAL_DENSITY 5.
- **Palette:** zinc off-white and off-black neutrals, one signal yellow (`#facc15`). In light mode yellow is only a fill (highlights, selection, focus ring, the Random Site button with near-black text), **never text**. Yellow text is allowed in dark mode.
- **Theme:** automatic via `prefers-color-scheme`; both modes are designed.
- **Shape:** sharp corners everywhere.
- **School identity:** no official School logo or palette. Yellow is the one School-adjacent accent. The footer says Eagle Ring is unofficial.
- **Mark:** the "Eagle Ring" wordmark in the display face.
- **Text-first:** no Site screenshots. The skill's "real images" rule deliberately doesn't apply here.
- **Accessibility:** WCAG 2.2 AA as the floor, AAA contrast for body text, full keyboard navigation with a visible yellow focus ring, `prefers-reduced-motion` honoured.

### Page structure (top to bottom)

1. **Header:** the wordmark on the left and a *Join the ring* link on the right, pointing to `CONTRIBUTING.md` on GitHub. "Join the ring" is the page's only call to action; use the same words everywhere.
2. **Headline:** *"Personal sites from Houston City College CS students, past and present."* Below it, a count line in mono: *"N Members across M Graduation Years"*, singular where it applies.
3. **Controls:**
   - a labelled search field (label: *Search Members*) that matches name, Site, GitHub handle, tagline and year;
   - a *By year* / *A-Z* segmented toggle;
   - a yellow **Random Site** button with a Phosphor shuffle icon, linking to `/eagle-ring/ring/random`.
4. **The roster.**
5. **Footer:** *"Eagle Ring is unofficial and student-run. Not affiliated with Houston City College."* and a link to the source on GitHub.

### The roster: "roster in year bands"

- **By year (the default):** one band per Graduation Year, newest first. Each band has the **full four-digit year** (`2019`, not `19`) as one large numeral on the left, stacked above the rows on mobile. Beside it is a list of **full-width Member rows**, sorted by name and separated by hairlines. No cards.
- **Each row**, left to right:
  - the name, which links to the Site, with the Standing (if set) in mono next to it and the tagline (if set) underneath;
  - the Site domain, in mono;
  - `@github` in mono, linking to the GitHub profile.

  The whole row is clickable to the Site. The GitHub link sits above that layer and stays separately clickable.
- **A-Z:** the bands go away. One roster sorted by name, with the full Graduation Year at the start of each row.
- **Search with no results:** *No Members match "…"* and a *Clear search* button.

### Small rings

| Members | Shows |
|---|---|
| 0 | Headline, then *"No Members yet."* with the *Join the ring* link. No count line, search, toggle or Random Site. |
| 1 | The normal roster in its year band. Count line: *"1 Member across 1 Graduation Year"*. No search, toggle or Random Site. |
| 2+ | The full page. |

No filler, no "coming soon", no fake Members.

### Without JavaScript

The Directory is rendered at build time, so it works with JavaScript off. Search, the By year / A-Z toggle and Random Site need JS. Render them hidden and let the script reveal them, so a no-JS visitor sees the plain By-year roster with no dead controls.

---

## 6. Ring Widget

*Sources: [Research: how existing webrings implement prev/next/random on static hosts](https://github.com/jpierre-7/eagle-ring/issues/5), [Prototype: Ring Widget — redirect URLs on a static host](https://github.com/jpierre-7/eagle-ring/issues/7) (runnable reference on branch `prototype/ring-widget`: `node prototype/ring-widget/ring.mjs`), [Prototype: Ring Widget look on different Member Sites](https://github.com/jpierre-7/eagle-ring/issues/13) (branch `prototype/ring-widget-look`).*

### URL scheme

Base: `https://jpierre-7.github.io/eagle-ring`.

| Link | Path | What it is |
|---|---|---|
| Previous | `/eagle-ring/ring/<slug>/prev` | A static redirect page, one per Member. |
| Next | `/eagle-ring/ring/<slug>/next` | A static redirect page, one per Member. |
| Random | `/eagle-ring/ring/random?from=<slug>` | One page with a few lines of inline JS. |
| Directory | `/eagle-ring/` | The Directory. |

### Ring order and neighbours

- The ring is ordered **alphabetically by slug** and **wraps**: the last Member's next is the first Member, and the first Member's previous is the last.
- Neighbours are computed on every build. Adding or removing a Member only changes the targets of the two Members next to them, and no Member ever has to edit their Site.
- **A ring of one:** previous, next and random all go to the Directory.

### Generated pages

- **`ring/<slug>/prev.html` and `ring/<slug>/next.html`:** each contains `<meta http-equiv="refresh" content="0;url=<target Site>">`, `<link rel="canonical" href="<target Site>">`, `<meta name="robots" content="noindex">` and a visible fallback link to the target. Generate them from the members collection, e.g. with a dynamic route using `getStaticPaths` so the collection stays the only data source. Astro's `redirects` config in `astro.config.mjs` is an alternative. The output is the same either way; this is a client-side hop (HTTP 200), not a 301.
- **`ring/random.html`:** inlines the list of `{ slug, site }` and calls `location.replace()` on a random Site, excluding the `from` Member. If none are left, it goes to the Directory. It has a `<noscript>` message linking to the Directory.
- **`404.html`:** GitHub Pages serves this for every missing path.
  - If the path matches `/ring/<slug>/(prev|next)` for a slug that is no longer in the ring (a removed Member whose old widget is still on their Site), its inline script finds where that slug would sit alphabetically among the current Members and sends the visitor on to the right neighbour.
  - Any other missing path shows a link to the Directory.
  - Result: stale widgets never dead-end, and nothing links *to* a removed Site.

### What a Member pastes

CONTRIBUTING shows **snippet A as the default** and **snippet B as the one optional styled version**, with `SLUG` replaced by the Member's slug. No external files, no script.

**Snippet A: default (plain links).** Unstyled; it takes on the Member Site's look.

```html
<nav class="eagle-ring" aria-label="Eagle Ring webring">
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/prev">&larr; Previous</a>
  <a href="https://jpierre-7.github.io/eagle-ring/">Eagle Ring</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/random?from=SLUG">Random</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/next">Next &rarr;</a>
</nav>
```

**Snippet B: optional styled ("Adaptive").** Keeps the Site's font and text colour. Resets any `nav` or `a` rules the Site aimed at other things (sticky headers, uppercase, `::before` prefixes). Adds a row layout, a yellow top rule, yellow underlines and a yellow focus ring. Yellow is only ever a line, never text.

```html
<style>
.eagle-ring{all:unset;display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem 1.25rem;margin:2rem 0;padding:.75rem 0 0;border-top:3px solid #facc15;font:inherit;color:inherit}
.eagle-ring a{all:unset;cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:#facc15;text-decoration-thickness:2px;text-underline-offset:3px}
.eagle-ring a::before,.eagle-ring a::after{content:none}
.eagle-ring a:focus-visible{outline:3px solid #facc15;outline-offset:2px}
.eagle-ring .er-home{font-weight:800}
</style>
<nav class="eagle-ring" aria-label="Eagle Ring webring">
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/prev">&larr; Previous</a>
  <a class="er-home" href="https://jpierre-7.github.io/eagle-ring/">Eagle Ring</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/random?from=SLUG">Random</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/next">Next &rarr;</a>
</nav>
```

The widget is offered from the first Member. There is no minimum ring size.

---

## 7. Moving to a custom domain

*Sources: [Research: Astro on GitHub Pages — base path, redirects, custom-domain migration](https://github.com/jpierre-7/eagle-ring/issues/4), [Prototype: Ring Widget — redirect URLs on a static host](https://github.com/jpierre-7/eagle-ring/issues/7).*

Widget URLs on `jpierre-7.github.io/eagle-ring` are safe to embed now. When a project repo sets its own custom domain, GitHub answers the old `github.io` URLs with a **301 that keeps the path and query and drops the repo prefix**. Observed on 2026-09-24: `jekyll.github.io/jekyll/docs/?from=abc` → `jekyllrb.com/docs/?from=abc`. GitHub doesn't document this behaviour, and the redirect only lasts while the domain stays configured.

When a domain is bought:

1. Set the domain on **this repo** (Settings → Pages), not on the `jpierre-7.github.io` user site.
2. Add the DNS records: a `CNAME` to `jpierre-7.github.io` for a subdomain, or GitHub's four `A` records for an apex domain.
3. Wait for the certificate, then tick **Enforce HTTPS**.
4. In `astro.config.mjs`, set `site` to the new origin and **delete `base`**. Nothing else in Astro changes, provided every link used `BASE_URL`.
5. Update the snippets in CONTRIBUTING to the new domain. Existing pasted widgets keep working through the 301.

With an Actions publishing source, a `CNAME` file in the repo is ignored; the domain lives in the repo settings.

---

## 8. Launch

*Source: [Launch: the Directory with 0–3 Members, and seeding](https://github.com/jpierre-7/eagle-ring/issues/11).*

1. **Ready check** (after the build, before anyone submits):
   - Make the repo **public**.
   - The site is deployed on Pages.
   - CI checks run on PRs.
   - `CONTRIBUTING.md`, the PR template and `CODEOWNERS` are in.
   - The 404 fallback for removed Members works.
2. **Soft launch:**
   - The Maintainer submits their own Site first through a normal Submission PR.
   - The Maintainer sends a group message to invited peers pointing them at `CONTRIBUTING.md`. Every seed Member joins through a normal Submission.
   - The Maintainer notes where anyone gets stuck and fixes CONTRIBUTING before going public.
3. **Public announcement at 5 Members**, or straight away if the soft launch passes 5.
   - Only in student-run channels: the CS club, class chats, and the Maintainer's own posts.
   - Instructors may share it.
   - Don't use official School channels or accounts, so Eagle Ring stays clearly unofficial.

---

## 9. Things to verify during the build

These were decided but not checked in a real browser or on the live host. Check each one before the Ready check.

- **Snippet B on hostile Sites.** It was designed to survive a Site that turns every `<nav>` into a sticky header and a theme that prefixes every link with `> `. Open `?variant=B` in `prototype/ring-widget-look/index.html` (branch `prototype/ring-widget-look`) and confirm. If it breaks, fix the snippet before CONTRIBUTING ships it.
- **Single-hop ring URLs on the real Pages deploy.** Confirm that `/eagle-ring/ring/<slug>/next` (no trailing slash) returns the redirect page directly, with no extra 301.
- **The 404 fallback on the real Pages deploy.** Remove a test Member and confirm their old `prev`/`next` URLs land on the right neighbours.

---

## 10. Decision log

Each decision's detail lives in its ticket.

- [Research: Astro on GitHub Pages — base path, redirects, custom-domain migration](https://github.com/jpierre-7/eagle-ring/issues/4)
- [Research: how existing webrings implement prev/next/random on static hosts](https://github.com/jpierre-7/eagle-ring/issues/5)
- [Design direction: vibe, school identity, the design read](https://github.com/jpierre-7/eagle-ring/issues/2)
- [Member schema, data file format, and Submission workflow](https://github.com/jpierre-7/eagle-ring/issues/3)
- [Prototype: Directory page in the chosen design direction](https://github.com/jpierre-7/eagle-ring/issues/6)
- [Prototype: Ring Widget — redirect URLs on a static host](https://github.com/jpierre-7/eagle-ring/issues/7)
- [Launch: the Directory with 0–3 Members, and seeding](https://github.com/jpierre-7/eagle-ring/issues/11)
- [Prototype: Ring Widget look on different Member Sites](https://github.com/jpierre-7/eagle-ring/issues/13)

Prototypes and research write-ups stay on their throwaway branches (`prototype/directory`, `prototype/ring-widget`, `prototype/ring-widget-look`, `research/astro-github-pages`, `research/webring-prior-art`) and are not merged to `main`.
