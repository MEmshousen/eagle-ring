/**
 * The checks on a Submission PR (spec §4 "CI checks on a Submission PR").
 *
 * Pure: no git, no disk, no network of its own. The caller hands in what the
 * PR changes, the Member files before and after, and a function that fetches
 * a Site. `scripts/check-submission.ts` gathers those from git; the tests hand
 * them in directly.
 *
 * Every message is written for the submitter: it says what is wrong and what
 * to do about it.
 */
import yaml from 'js-yaml'
import { createMemberSchema, MEMBERS_DIR, slugFromEntry } from '../../src/lib/member.ts'
import { PROFILE_HOSTS } from './profile-hosts.ts'

/** Used when there is no CODEOWNERS file, or it names nobody. */
export const DEFAULT_MAINTAINERS: readonly string[] = ['jpierre-7']

/** Where GitHub looks for CODEOWNERS, in its own order of precedence. */
export const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'] as const

export const NEEDS_APPROVAL_LABEL = 'needs-maintainer-approval'

export type ChangeStatus = 'added' | 'modified' | 'deleted'

export interface ChangedFile {
  /** Path from the repo root, with forward slashes. */
  path: string
  status: ChangeStatus
}

/** A Member file's path and raw YAML text. */
export interface MemberFileText {
  path: string
  text: string
}

/** What happened when CI fetched a Site: `ok`, or why it failed. */
export type SiteProbe = { ok: true } | { ok: false; reason: string }

export interface SubmissionInput {
  /** The PR author's GitHub login. */
  author: string
  /** The Maintainer's GitHub handles, from CODEOWNERS on the base branch. */
  maintainers: readonly string[]
  /** Every file the PR adds, edits or deletes. */
  changedFiles: readonly ChangedFile[]
  /** Every Member file after the PR (the head of the PR). */
  headMembers: readonly MemberFileText[]
  /** Member files before the PR, at least the ones the PR edits or deletes. */
  baseMembers: readonly MemberFileText[]
  /** Fetches a Site once. Leave out to skip the reachability warning. */
  probeSite?: (site: string) => Promise<SiteProbe>
  /** The year the schema treats as now. Defaults to the real year. */
  currentYear?: number
}

export interface Finding {
  /** The Member file the finding is about, when there is one. */
  file?: string
  message: string
}

export interface SubmissionReport {
  /** Whether the author is the Maintainer (and so exempt from the scope rule). */
  byMaintainer: boolean
  /** Member files the PR adds, edits or deletes. */
  memberChanges: ChangedFile[]
  /** Blocking: the PR can't merge until these are fixed. */
  errors: Finding[]
  /** Not blocking: the Maintainer takes a look. */
  warnings: Finding[]
  /** Edits or deletions of someone else's record: needs Maintainer approval. */
  needsApproval: Finding[]
}

// ---------------------------------------------------------------------------
// Small rules, exported for the tests
// ---------------------------------------------------------------------------

/**
 * The Maintainer's handles from a CODEOWNERS file: every `@user` owner on any
 * rule, without the `@`. Teams (`@org/team`) and email owners are skipped.
 * Falls back to {@link DEFAULT_MAINTAINERS} when the file is missing or names
 * nobody.
 */
export function maintainersFromCodeowners(text: string | undefined): string[] {
  const handles = new Set<string>()
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue
    const [, ...owners] = line.split(/\s+/)
    for (const owner of owners) {
      const match = /^@([A-Za-z0-9-]+)$/.exec(owner)
      if (match) handles.add(match[1])
    }
  }
  return handles.size > 0 ? [...handles] : [...DEFAULT_MAINTAINERS]
}

function sameHandle(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * A Site in the form used to compare Sites: the host lowercased (the URL
 * parser does that) and trailing slashes dropped, the path otherwise kept.
 * `https://Kevin.GitHub.io/` and `https://kevin.github.io` compare equal.
 */
export function normaliseSite(site: string): string {
  try {
    const url = new URL(site)
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return site.trim().replace(/\/+$/, '').toLowerCase()
  }
}

/** The denylisted domain a Site sits on, or `undefined` when it is allowed. */
export function profileHost(site: string): string | undefined {
  let host: string
  try {
    host = new URL(site).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return undefined
  }
  return PROFILE_HOSTS.find((domain) => host === domain || host.endsWith(`.${domain}`))
}

/** The part of a path under `src/content/members/`, or `undefined`. */
function memberEntry(path: string): string | undefined {
  const prefix = `${MEMBERS_DIR}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined
}

function listFiles(paths: readonly string[]): string {
  return paths.map((p) => `\`${p}\``).join(', ')
}

type Parsed =
  | { ok: true; data: unknown }
  | { ok: false; message: string }

function parseYaml(text: string): Parsed {
  try {
    return { ok: true, data: yaml.load(text) }
  } catch (error) {
    const reason = error instanceof yaml.YAMLException ? error.reason : String(error)
    return { ok: false, message: reason }
  }
}

/** The `github` field of a record, if it has a usable one. */
function recordOwner(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const parsed = parseYaml(text)
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) return undefined
  const github = (parsed.data as Record<string, unknown>).github
  return typeof github === 'string' && github.trim() ? github.trim() : undefined
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/** Blocking: exactly one Member file and nothing else, unless by the Maintainer. */
function checkScope(memberChanges: ChangedFile[], otherChanges: ChangedFile[]): Finding[] {
  const findings: Finding[] = []
  if (memberChanges.length === 0) {
    findings.push({
      message:
        `This PR doesn't add, edit or delete a Member file. A Submission changes exactly one file in \`${MEMBERS_DIR}/\`: ` +
        'your own `<your-slug>.yaml`. If this PR is not a Submission, the Maintainer will review it by hand.',
    })
  }
  if (memberChanges.length > 1) {
    findings.push({
      message:
        `This PR changes ${memberChanges.length} Member files: ${listFiles(memberChanges.map((c) => c.path))}. ` +
        'A Submission changes only one Member file, your own. Keep your file and take the others out of this PR. ' +
        'If you renamed your file, rename it back: the slug (the filename) never changes after it is merged.',
    })
  }
  if (otherChanges.length > 0) {
    findings.push({
      message:
        `This PR also changes files outside \`${MEMBERS_DIR}/\`: ${listFiles(otherChanges.map((c) => c.path))}. ` +
        'A Submission changes only your Member file. Undo those changes, or open a separate PR for them.',
    })
  }
  return findings
}

/**
 * Blocking checks on one added or edited Member file: its filename, its YAML,
 * the schema, the denylist and uniqueness. Returns the parsed Site when it is
 * fine to fetch.
 */
function checkMemberFile(
  change: ChangedFile,
  input: SubmissionInput,
  schema: ReturnType<typeof createMemberSchema>,
  errors: Finding[],
): string | undefined {
  const file = change.path
  const fail = (message: string) => errors.push({ file, message })

  const entry = memberEntry(file)!
  try {
    slugFromEntry(entry)
  } catch (error) {
    const why = String((error as Error).message).split('\n').slice(1).join(' ').trim()
    fail(
      `The filename is not a valid slug. ${why}. Rename the file to \`${MEMBERS_DIR}/<your-slug>.yaml\`, ` +
        'for example `kevin-tran.yaml`.',
    )
  }

  const text = input.headMembers.find((m) => m.path === file)?.text
  if (text === undefined) {
    fail(`CI couldn't read \`${file}\`. Check that it is a normal text file.`)
    return undefined
  }

  const parsed = parseYaml(text)
  if (!parsed.ok) {
    fail(
      `\`${file}\` isn't valid YAML (${parsed.message}). Each line should be \`field: value\` with no indentation; ` +
        'compare it with the example file in CONTRIBUTING.md.',
    )
    return undefined
  }

  const result = schema.safeParse(parsed.data)
  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          fail(`\`${key}\` is not a Member field. Remove it, or check its spelling against CONTRIBUTING.md.`)
        }
      } else if (issue.path.length === 0) {
        fail(
          `\`${file}\` must be a list of \`field: value\` lines (name, site, graduationYear, github, ` +
            'and optionally tagline and status). Compare it with the example file in CONTRIBUTING.md.',
        )
      } else {
        fail(`\`${issue.path.join('.')}\` ${issue.message}.`)
      }
    }
  }

  // Denylist and uniqueness only need the two fields, so they still run when
  // another field is wrong: the submitter sees every problem at once.
  const data = (typeof parsed.data === 'object' && parsed.data !== null ? parsed.data : {}) as Record<
    string,
    unknown
  >
  const site = typeof data.site === 'string' ? data.site.trim() : undefined
  const github = typeof data.github === 'string' ? data.github.trim() : undefined

  const others = input.headMembers
    .filter((m) => m.path !== file && m.path.endsWith('.yaml'))
    .map((m) => ({ path: m.path, parsed: parseYaml(m.text) }))
    .flatMap(({ path, parsed }) =>
      parsed.ok && typeof parsed.data === 'object' && parsed.data !== null
        ? [{ path, data: parsed.data as Record<string, unknown> }]
        : [],
    )

  let siteUsable = site !== undefined && result.success
  if (site) {
    const host = profileHost(site)
    if (host) {
      siteUsable = false
      fail(
        `\`site\` (${site}) is a profile page on ${host}, not a personal Site. ` +
          'Use the address of a website you run yourself, such as a GitHub Pages site (`https://<you>.github.io/`).',
      )
    }
    const key = normaliseSite(site)
    for (const other of others) {
      if (typeof other.data.site === 'string' && normaliseSite(other.data.site.trim()) === key) {
        siteUsable = false
        fail(
          `\`site\` (${site}) is already in the ring, in \`${other.path}\`. Each Site can be listed once. ` +
            'If that record is yours, edit it instead of adding a new file.',
        )
      }
    }
  }
  if (github) {
    for (const other of others) {
      if (typeof other.data.github === 'string' && sameHandle(other.data.github.trim(), github)) {
        fail(
          `\`github\` (${github}) is already used by \`${other.path}\`. Each GitHub account has one Member record. ` +
            'If that record is yours, edit it instead of adding a new file.',
        )
      }
    }
  }

  return siteUsable ? site : undefined
}

/** Needs approval: an edit or deletion of a record the author doesn't own. */
function checkOwnership(change: ChangedFile, input: SubmissionInput): Finding | undefined {
  const before = input.baseMembers.find((m) => m.path === change.path)?.text
  const owner = recordOwner(before)
  if (owner && sameHandle(owner, input.author)) return undefined
  const verb = change.status === 'deleted' ? 'deletes' : 'edits'
  const whose = owner ? `a record that belongs to @${owner}` : 'a record whose owner CI could not read'
  return {
    file: change.path,
    message:
      `@${input.author} ${verb} \`${change.path}\`, ${whose}. This needs Maintainer approval. ` +
      'If this is your record and you renamed your GitHub account, say so in the PR description.',
  }
}

/** Runs every check on a Submission PR. */
export async function checkSubmission(input: SubmissionInput): Promise<SubmissionReport> {
  const schema = createMemberSchema({ currentYear: input.currentYear })
  const byMaintainer = input.maintainers.some((m) => sameHandle(m, input.author))
  const memberChanges = input.changedFiles.filter((c) => memberEntry(c.path) !== undefined)
  const otherChanges = input.changedFiles.filter((c) => memberEntry(c.path) === undefined)

  const errors: Finding[] = []
  const warnings: Finding[] = []
  const needsApproval: Finding[] = []

  if (!byMaintainer) errors.push(...checkScope(memberChanges, otherChanges))

  const sitesToFetch: Array<{ file: string; site: string }> = []
  for (const change of memberChanges) {
    if (change.status !== 'deleted') {
      const site = checkMemberFile(change, input, schema, errors)
      if (site) sitesToFetch.push({ file: change.path, site })
    }
    if (change.status !== 'added' && !byMaintainer) {
      const flag = checkOwnership(change, input)
      if (flag) needsApproval.push(flag)
    }
  }

  if (input.probeSite) {
    for (const { file, site } of sitesToFetch) {
      const probe = await input.probeSite(site)
      if (!probe.ok) {
        warnings.push({
          file,
          message:
            `CI couldn't load ${site} (${probe.reason}). This doesn't block the PR: some Sites block bots or start ` +
            'slowly, so the Maintainer will open it by hand. If the Site is down or the address has a typo, fix it.',
        })
      }
    }
  }

  return { byMaintainer, memberChanges, errors, warnings, needsApproval }
}

// ---------------------------------------------------------------------------
// Fetching a Site
// ---------------------------------------------------------------------------

/** A current desktop browser's user agent; some hosts turn away obvious bots. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export const SITE_TIMEOUT_MS = 15_000

/**
 * Fetches a Site once, following redirects, with a timeout and a browser-like
 * user agent. Never throws.
 */
export async function probeSite(
  site: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SITE_TIMEOUT_MS,
): Promise<SiteProbe> {
  try {
    const response = await fetchImpl(site, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': BROWSER_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    })
    await response.body?.cancel().catch(() => {})
    if (!response.ok) return { ok: false, reason: `it answered HTTP ${response.status}` }
    return { ok: true }
  } catch (error) {
    const err = error as Error & { cause?: { code?: string; message?: string } }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { ok: false, reason: `no answer within ${Math.round(timeoutMs / 1000)} seconds` }
    }
    const detail = err.cause?.code ?? err.cause?.message ?? err.message
    return { ok: false, reason: `the request failed: ${detail}` }
  }
}

// ---------------------------------------------------------------------------
// The job summary
// ---------------------------------------------------------------------------

function section(title: string, findings: Finding[]): string[] {
  if (findings.length === 0) return []
  return [
    `### ${title}`,
    '',
    ...findings.map((f) => `- ${f.file ? `**\`${f.file}\`**: ` : ''}${f.message}`),
    '',
  ]
}

/** The report as Markdown, for the job summary and the log. */
export function formatReport(report: SubmissionReport, author: string): string {
  const lines = ['## Submission checks', '']
  const who = report.byMaintainer
    ? `@${author} is the Maintainer, so the one-Member-file rule and the ownership check are skipped.`
    : `PR author: @${author}.`
  const files =
    report.memberChanges.length > 0
      ? `Member files in this PR: ${report.memberChanges.map((c) => `\`${c.path}\` (${c.status})`).join(', ')}.`
      : 'This PR changes no Member files.'
  lines.push(who, files, '')

  if (report.errors.length === 0) {
    lines.push('**Result: passed.** The blocking checks all pass.', '')
  } else {
    lines.push(
      `**Result: failed.** Fix ${report.errors.length === 1 ? 'the problem' : `the ${report.errors.length} problems`} ` +
        'below and push again; the checks re-run on every push.',
      '',
    )
  }
  lines.push(...section('Must fix', report.errors))
  lines.push(...section('Needs Maintainer approval', report.needsApproval))
  lines.push(...section('Warnings (not blocking)', report.warnings))
  return lines.join('\n')
}
