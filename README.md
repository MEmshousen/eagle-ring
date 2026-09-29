# Eagle Ring

A webring for Houston City College CS students and alumni: a directory of our personal sites, plus a small widget you can put on your own site so visitors can hop to the previous, next or a random member's site.

**Live at https://jpierre-7.github.io/eagle-ring/**

Eagle Ring is unofficial and student-run. It isn't affiliated with Houston City College.

## Join

If you take or took CS classes at the School (graduated, still studying or transferred out) and you have a personal site on `https://`, you can join. Joining means adding one small file to this repo through a pull request, and you can do the whole thing in the browser.

[**CONTRIBUTING.md**](CONTRIBUTING.md) walks through every step, lists the rules for each field, and has the Ring Widget snippets to paste into your site once you're in.

## How it works

The site is plain static HTML built with [Astro](https://astro.build) and hosted on GitHub Pages. There's no server and no database.

- **Members** are YAML files in `src/content/members/`, one per person, named after their slug (`kevin-tran.yaml`). A schema checks every file when the site builds.
- **The Directory** (`src/pages/index.astro`) lists every Member, grouped by Graduation Year, with search and an A-Z view.
- **The ring** is a set of generated pages. Each Member gets `/ring/<slug>/prev` and `/ring/<slug>/next`, which redirect to their neighbours in alphabetical order by slug, wrapping at the ends. `/ring/random` picks a Member at random, and the 404 page sends visitors from a removed Member's old widget on to the right neighbour, so pasted widgets never need editing.
- **Submission checks** run on every pull request (`.github/workflows/submission-checks.yml`). A Submission has to change exactly one Member file, pass the schema, avoid duplicates and profile pages, and still build. The checks always run from `main`'s copy of `scripts/`, with read-only access, so a pull request can't change the rules it's judged by.
- **Deploys** happen on every push to `main` (`.github/workflows/deploy.yml`), so merging a Submission publishes it within a minute or two.

## Working on the code

You'll need Node.js 24 (CI uses 24; the Submission check script needs at least 22.18).

```sh
npm ci                  # install the exact dependency versions
npm run dev             # dev server at http://localhost:4321/eagle-ring
npm test                # unit and build tests (Vitest)
npm run build           # build the site into dist/
npm run preview         # serve dist/ at http://localhost:4321/eagle-ring
```

Astro 7 runs the dev and preview servers in the background; stop them with `npx astro dev stop` or `npx astro preview stop`.

To run the Submission checks on your own commits before opening a pull request:

```sh
npm run check:submission -- --author <your-github-handle>
```

The site lives under the `/eagle-ring` base path, so every internal link goes through the helpers in `src/lib/url.ts`. Unprefixed links break on GitHub Pages and in the dev server alike.

Test fixtures live in `tests/fixtures/`. Never put a fake Member in `src/content/members/`, since everything there goes live on the next deploy.

## Where things are

| Path | What's there |
|---|---|
| `src/content/members/` | One YAML file per Member |
| `src/lib/member.ts` | The Member schema and helpers (ordering, grouping, display) |
| `src/lib/ring.ts` | Ring neighbours, random pick and the 404 fallback logic |
| `src/pages/` | The Directory, the ring pages and the 404 page |
| `scripts/submission/` | The Submission checks, including the profile-page denylist |
| `docs/spec.md` | The v1 spec: every design and behaviour decision, with links to where each was decided |
| `CONTEXT.md` | The glossary (Member, Site, Directory, Ring Widget, Graduation Year, Standing, Submission, Maintainer) |
| `docs/member-example.yaml` | The example Member file from CONTRIBUTING |

Decisions were worked out as GitHub issues before the build; the spec's decision log links each one.

## Maintainer

[@jpierre-7](https://github.com/jpierre-7) reviews and merges Submissions. `.github/CODEOWNERS` names the Maintainer, so handing Eagle Ring over to a CS club later is a one-line change there. Questions or problems: [open an issue](https://github.com/jpierre-7/eagle-ring/issues/new).

## Credits

Fonts: [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), both under the SIL Open Font License (licence files next to the fonts in `src/assets/fonts/`). Icons: [Phosphor](https://phosphoricons.com).
