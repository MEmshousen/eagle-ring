// Spec §4 "CI checks on a Submission PR": each rule, run through
// checkSubmission with in-memory PRs. No test touches the network: Site
// fetches go through a fake, and the real fetch is replaced with one that
// throws.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_USER_AGENT,
  checkSubmission,
  formatReport,
  maintainersFromCodeowners,
  normaliseSite,
  probeSite,
  profileHost,
  type ChangedFile,
  type MemberFileText,
  type SiteProbe,
} from '../scripts/submission/checks'

const CURRENT_YEAR = 2026
const MAINTAINER = 'jpierre-7'
const CODEOWNERS = join(import.meta.dirname, 'fixtures', 'codeowners')

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('Tests must not use the network')
  })
})
afterAll(() => {
  vi.unstubAllGlobals()
})

function memberYaml(fields: Record<string, string | number>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

const path = (slug: string) => `src/content/members/${slug}.yaml`

const kevin: MemberFileText = {
  path: path('kevin-tran'),
  text: memberYaml({ name: 'Kevin Tran', site: 'https://kevintran.github.io/', graduationYear: 2023, github: 'kvtran' }),
}
const ada: MemberFileText = {
  path: path('ada-okafor'),
  text: memberYaml({ name: 'Ada Okafor', site: 'https://ada.dev/', graduationYear: 2028, github: 'aokafor' }),
}
const BASE = [kevin, ada]

function newMember(slug: string, fields: Partial<Record<string, string | number>> = {}): MemberFileText {
  return {
    path: path(slug),
    text: memberYaml({ name: 'Sam Lee', site: `https://${slug}.dev/`, graduationYear: 2025, github: slug, ...fields }),
  }
}

interface Run {
  author?: string
  changes: ChangedFile[]
  /** Member files the PR adds or replaces; the rest of the base stays. */
  files?: MemberFileText[]
  /** Paths the PR deletes. */
  deleted?: string[]
  probe?: (site: string) => Promise<SiteProbe>
  maintainers?: string[]
}

const reachable = vi.fn(async (): Promise<SiteProbe> => ({ ok: true }))

function run({ author = 'samlee', changes, files = [], deleted = [], probe = reachable, maintainers = [MAINTAINER] }: Run) {
  const replaced = new Set([...files.map((f) => f.path), ...deleted])
  return checkSubmission({
    author,
    maintainers,
    changedFiles: changes,
    headMembers: [...BASE.filter((m) => !replaced.has(m.path)), ...files],
    baseMembers: BASE,
    probeSite: probe,
    currentYear: CURRENT_YEAR,
  })
}

const added = (p: string): ChangedFile => ({ path: p, status: 'added' })
const modified = (p: string): ChangedFile => ({ path: p, status: 'modified' })
const deleted = (p: string): ChangedFile => ({ path: p, status: 'deleted' })

describe('a good Submission', () => {
  it('passes with no errors, warnings or flags, and fetches the Site once', async () => {
    const sam = newMember('sam-lee')
    const probe = vi.fn(async (): Promise<SiteProbe> => ({ ok: true }))
    const report = await run({ changes: [added(sam.path)], files: [sam], probe })
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.needsApproval).toEqual([])
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith('https://sam-lee.dev/')
  })

  it('passes when the owner edits their own record, whatever the handle case', async () => {
    const edited = { ...kevin, text: kevin.text.replace('2023', '2024') }
    const report = await run({ author: 'KVTran', changes: [modified(kevin.path)], files: [edited] })
    expect(report.errors).toEqual([])
    expect(report.needsApproval).toEqual([])
  })

  it('passes when the owner deletes their own record, without fetching anything', async () => {
    const probe = vi.fn(async (): Promise<SiteProbe> => ({ ok: true }))
    const report = await run({ author: 'kvtran', changes: [deleted(kevin.path)], deleted: [kevin.path], probe })
    expect(report.errors).toEqual([])
    expect(report.needsApproval).toEqual([])
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('site and github are unique', () => {
  it('rejects a duplicate site, ignoring a trailing slash and host case', async () => {
    const sam = newMember('sam-lee', { site: 'https://KevinTran.GitHub.io' })
    const report = await run({ changes: [added(sam.path)], files: [sam] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].file).toBe(sam.path)
    expect(report.errors[0].message).toMatch(/`site` \(https:\/\/KevinTran\.GitHub\.io\) is already in the ring/)
    expect(report.errors[0].message).toContain('src/content/members/kevin-tran.yaml')
    expect(report.errors[0].message).toContain('edit it instead of adding a new file')
  })

  it('allows another project subpath on the same github.io host', async () => {
    const sam = newMember('sam-lee', { site: 'https://kevintran.github.io/sam/' })
    const report = await run({ changes: [added(sam.path)], files: [sam] })
    expect(report.errors).toEqual([])
  })

  it('rejects a duplicate github, ignoring case', async () => {
    const sam = newMember('sam-lee', { github: 'KVTran' })
    const report = await run({ changes: [added(sam.path)], files: [sam] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toMatch(/`github` \(KVTran\) is already used by `src\/content\/members\/kevin-tran\.yaml`/)
  })

  it('does not fetch a Site that is already listed', async () => {
    const probe = vi.fn(async (): Promise<SiteProbe> => ({ ok: true }))
    const sam = newMember('sam-lee', { site: 'https://ada.dev' })
    await run({ changes: [added(sam.path)], files: [sam], probe })
    expect(probe).not.toHaveBeenCalled()
  })

  it('normalises only the host case and trailing slashes', () => {
    expect(normaliseSite('https://Ada.DEV///')).toBe('https://ada.dev')
    expect(normaliseSite('https://ada.dev/Blog/')).toBe('https://ada.dev/Blog')
    expect(normaliseSite('https://ada.dev/Blog')).not.toBe(normaliseSite('https://ada.dev/blog'))
  })
})

describe('site is not a profile page', () => {
  it.each([
    ['https://www.linkedin.com/in/sam-lee', 'linkedin.com'],
    ['https://linkedin.com/in/sam-lee/', 'linkedin.com'],
    ['https://github.com/samlee', 'github.com'],
    ['https://GitHub.com/samlee/samlee.github.io', 'github.com'],
    ['https://x.com/samlee', 'x.com'],
    ['https://twitter.com/samlee', 'twitter.com'],
    ['https://m.facebook.com/samlee', 'facebook.com'],
    ['https://www.instagram.com/samlee/', 'instagram.com'],
    ['https://linktr.ee/samlee', 'linktr.ee'],
  ])('rejects %s', async (site, host) => {
    const sam = newMember('sam-lee', { site })
    const probe = vi.fn(async (): Promise<SiteProbe> => ({ ok: true }))
    const report = await run({ changes: [added(sam.path)], files: [sam], probe })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toContain(`is a profile page on ${host}, not a personal Site`)
    expect(report.errors[0].message).toContain('https://<you>.github.io/')
    expect(probe).not.toHaveBeenCalled()
  })

  it.each([
    'https://samlee.github.io/',
    'https://7jpierre.github.io/jp-website/',
    'https://samlee.dev',
    'https://notx.com/',
    'https://github.community.example.org/',
  ])('allows %s', async (site) => {
    expect(profileHost(site)).toBeUndefined()
    const sam = newMember('sam-lee', { site })
    const report = await run({ changes: [added(sam.path)], files: [sam] })
    expect(report.errors).toEqual([])
  })
})

describe('exactly one Member file and nothing else', () => {
  it('rejects two Member files in one PR', async () => {
    const sam = newMember('sam-lee')
    const jo = newMember('jo-park')
    const report = await run({ changes: [added(sam.path), added(jo.path)], files: [sam, jo] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toMatch(/^This PR changes 2 Member files: `src\/content\/members\/sam-lee\.yaml`, `src\/content\/members\/jo-park\.yaml`\./)
    expect(report.errors[0].message).toContain('A Submission changes only one Member file, your own')
  })

  it('rejects a renamed Member file, which is a deletion plus an addition', async () => {
    const renamed = { ...kevin, path: path('kevin-t') }
    const report = await run({
      author: 'kvtran',
      changes: [deleted(kevin.path), added(renamed.path)],
      files: [renamed],
      deleted: [kevin.path],
    })
    expect(report.errors.map((e) => e.message).join('\n')).toContain('the slug (the filename) never changes')
  })

  it('rejects a Member file plus another file', async () => {
    const sam = newMember('sam-lee')
    const report = await run({ changes: [added(sam.path), modified('README.md')], files: [sam] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toBe(
      'This PR also changes files outside `src/content/members/`: `README.md`. ' +
        'A Submission changes only your Member file. Undo those changes, or open a separate PR for them.',
    )
  })

  it('rejects a Submission that changes scripts/ or .github/, with its own message', async () => {
    const sam = newMember('sam-lee')
    const report = await run({
      changes: [
        added(sam.path),
        modified('scripts/submission/checks.ts'),
        modified('.github/workflows/submission-checks.yml'),
        modified('README.md'),
      ],
      files: [sam],
    })
    expect(report.errors.map((e) => e.message)).toEqual([
      'This PR changes the checks themselves (`scripts/submission/checks.ts`, ' +
        "`.github/workflows/submission-checks.yml`). Submissions can't change CI; the Maintainer reviews those " +
        'by hand. Undo those changes, or open a separate PR for them.',
      'This PR also changes files outside `src/content/members/`: `README.md`. ' +
        'A Submission changes only your Member file. Undo those changes, or open a separate PR for them.',
    ])
  })

  it('does not mistake a lookalike path for CI', async () => {
    const sam = newMember('sam-lee')
    const report = await run({ changes: [added(sam.path), added('scripts.md'), added('docs/.github/x')], files: [sam] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toMatch(/^This PR also changes files outside/)
  })

  it('rejects a PR from someone else with no Member file', async () => {
    const report = await run({ changes: [modified('CONTRIBUTING.md')] })
    expect(report.errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/^This PR doesn't add, edit or delete a Member file\./),
      expect.stringMatching(/^This PR also changes files outside/),
    ])
  })

  it('lets the Maintainer change other files, several Member files, and anyone\'s record', async () => {
    const sam = newMember('sam-lee')
    const edited = { ...kevin, text: kevin.text.replace('2023', '2024') }
    const report = await run({
      author: MAINTAINER,
      changes: [modified('src/pages/index.astro'), added(sam.path), modified(kevin.path), modified('package.json')],
      files: [sam, edited],
    })
    expect(report.byMaintainer).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.needsApproval).toEqual([])
  })

  it('lets the Maintainer open a PR with no Member file', async () => {
    const report = await run({ author: 'JPierre-7', changes: [modified('.github/workflows/deploy.yml')] })
    expect(report.errors).toEqual([])
  })

  it('still checks the Member files in a Maintainer PR', async () => {
    const sam = newMember('sam-lee', { site: 'https://x.com/samlee' })
    const report = await run({ author: MAINTAINER, changes: [added(sam.path), modified('README.md')], files: [sam] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toContain('profile page on x.com')
  })
})

describe('the Maintainer, from CODEOWNERS', () => {
  const read = (name: string) => readFileSync(join(CODEOWNERS, name), 'utf8')

  it('reads the Maintainer from a CODEOWNERS file', () => {
    expect(maintainersFromCodeowners(read('maintainer'))).toEqual(['jpierre-7'])
  })

  it('reads every person, skipping teams, emails and comments', () => {
    expect(maintainersFromCodeowners(read('handed-over'))).toEqual(['eagle-club-lead', 'jpierre-7'])
  })

  it('falls back to jpierre-7 when there is no CODEOWNERS file', () => {
    expect(maintainersFromCodeowners(undefined)).toEqual(['jpierre-7'])
  })

  it('falls back to jpierre-7 when CODEOWNERS names nobody', () => {
    expect(maintainersFromCodeowners(read('comments-only'))).toEqual(['jpierre-7'])
  })

  it('exempts a Maintainer named in CODEOWNERS', async () => {
    const report = await run({
      author: 'eagle-club-lead',
      maintainers: maintainersFromCodeowners(read('handed-over')),
      changes: [modified('README.md')],
    })
    expect(report.errors).toEqual([])
  })
})

describe('ownership of edits', () => {
  it('flags an edit by someone who is not the record\'s github, without failing', async () => {
    const edited = { ...kevin, text: kevin.text.replace('2023', '2024') }
    const report = await run({ author: 'samlee', changes: [modified(kevin.path)], files: [edited] })
    expect(report.errors).toEqual([])
    expect(report.needsApproval).toEqual([
      {
        file: kevin.path,
        message:
          '@samlee edits `src/content/members/kevin-tran.yaml`, a record that belongs to @kvtran. ' +
          'This needs Maintainer approval. If this is your record and you renamed your GitHub account, ' +
          'say so in the PR description.',
      },
    ])
  })

  it('judges ownership by the record before the PR, so changing github does not help', async () => {
    const hijacked = { ...kevin, text: kevin.text.replace('github: kvtran', 'github: samlee') }
    const report = await run({ author: 'samlee', changes: [modified(kevin.path)], files: [hijacked] })
    expect(report.needsApproval).toHaveLength(1)
    expect(report.needsApproval[0].message).toContain('belongs to @kvtran')
  })

  it('flags a deletion by someone else', async () => {
    const report = await run({ author: 'samlee', changes: [deleted(ada.path)], deleted: [ada.path] })
    expect(report.errors).toEqual([])
    expect(report.needsApproval[0].message).toMatch(/^@samlee deletes `src\/content\/members\/ada-okafor\.yaml`, a record that belongs to @aokafor\./)
  })
})

describe('the Site is fetched once, as a warning only', () => {
  it('warns and passes when the Site is unreachable', async () => {
    const sam = newMember('sam-lee')
    const probe = vi.fn(async (): Promise<SiteProbe> => ({ ok: false, reason: 'the request failed: ENOTFOUND' }))
    const report = await run({ changes: [added(sam.path)], files: [sam], probe })
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([
      {
        file: sam.path,
        message: expect.stringMatching(
          /^CI couldn't load https:\/\/sam-lee\.dev\/ \(the request failed: ENOTFOUND\)\. This doesn't block the PR/,
        ),
      },
    ])
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('does not fetch a Site that fails the schema', async () => {
    const probe = vi.fn(async (): Promise<SiteProbe> => ({ ok: true }))
    const sam = newMember('sam-lee', { site: 'http://sam-lee.dev/' })
    const report = await run({ changes: [added(sam.path)], files: [sam], probe })
    expect(report.errors.map((e) => e.message)).toEqual(['`site` must start with https://.'])
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('probeSite, with a fake fetch', () => {
  it('sends a browser user agent, follows redirects and reports success', async () => {
    const fake = vi.fn(async () => new Response('<html></html>', { status: 200 }))
    expect(await probeSite('https://sam-lee.dev/', fake as unknown as typeof fetch)).toEqual({ ok: true })
    expect(fake).toHaveBeenCalledTimes(1)
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://sam-lee.dev/')
    expect(init.redirect).toBe('follow')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect((init.headers as Record<string, string>)['user-agent']).toBe(BROWSER_USER_AGENT)
  })

  it('reports an HTTP error status', async () => {
    const fake = async () => new Response('nope', { status: 503 })
    expect(await probeSite('https://sam-lee.dev/', fake as typeof fetch)).toEqual({
      ok: false,
      reason: 'it answered HTTP 503',
    })
  })

  it('reports a failed request', async () => {
    const fake = async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })
    }
    expect(await probeSite('https://sam-lee.dev/', fake as typeof fetch)).toEqual({
      ok: false,
      reason: 'the request failed: ENOTFOUND',
    })
  })

  it('gives up after the timeout', async () => {
    const hang = (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    expect(await probeSite('https://sam-lee.dev/', hang as typeof fetch, 20)).toEqual({
      ok: false,
      reason: 'no answer within 0 seconds',
    })
  })
})

describe('messages say what to fix', () => {
  it('explains a bad filename', async () => {
    const bad = { ...newMember('sam-lee'), path: path('Sam_Lee') }
    const report = await run({ changes: [added(bad.path)], files: [bad] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toMatch(/^The filename is not a valid slug\. .*"Sam_Lee" must be lowercase/)
    expect(report.errors[0].message).toContain('Rename the file to `src/content/members/<your-slug>.yaml`')
  })

  it('explains broken YAML', async () => {
    const bad = { path: path('sam-lee'), text: 'name: Sam\n  site: : :\n' }
    const report = await run({ changes: [added(bad.path)], files: [bad] })
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toMatch(/^`src\/content\/members\/sam-lee\.yaml` isn't valid YAML \(.+\)\. Each line should be `field: value`/)
  })

  it('names every schema problem by field', async () => {
    const bad = {
      path: path('sam-lee'),
      text: 'name: Sam\nsite: https://sam-lee.dev/\ngraduationYear: 2031\ngithub: "@samlee"\nstatus: graduated\nwebsite: x\n',
    }
    const report = await run({ changes: [added(bad.path)], files: [bad] })
    expect(report.errors.map((e) => e.message)).toEqual([
      '`github` is the handle without the leading "@".',
      '`website` is not a Member field. Remove it, or check its spelling against CONTRIBUTING.md.',
      '`status` must be left out while graduationYear (2031) is after 2026; current students have no Standing.',
    ])
  })

  it('writes a job summary with every section', async () => {
    const sam = newMember('sam-lee', { github: 'kvtran' })
    const edited = { ...ada, text: ada.text.replace('2028', '2029') }
    const report = await run({
      changes: [added(sam.path), modified(ada.path)],
      files: [sam, edited],
      probe: async () => ({ ok: false, reason: 'it answered HTTP 403' }),
    })
    const summary = formatReport(report, 'samlee')
    expect(summary).toContain('**Result: failed.**')
    expect(summary).toContain('### Must fix')
    expect(summary).toContain('### Needs Maintainer approval')
    expect(summary).toContain('### Warnings (not blocking)')
  })

  it('says a clean PR passed', async () => {
    const sam = newMember('sam-lee')
    const summary = formatReport(await run({ changes: [added(sam.path)], files: [sam] }), 'samlee')
    expect(summary).toContain('**Result: passed.**')
    expect(summary).not.toContain('###')
  })
})
