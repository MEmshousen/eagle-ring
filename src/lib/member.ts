/**
 * Member records: the schema and the pure helpers built on it (spec §3).
 *
 * Nothing here touches `astro:content`, so it runs under plain Node and is
 * unit-tested without Astro. Pages import from `src/lib/members.ts`, which
 * re-exports all of this together with the loaded Members.
 */
import { z } from 'astro/zod'

/** Oldest allowed Graduation Year. */
export const MIN_GRADUATION_YEAR = 1990

/** How many years past the current year a Graduation Year may be. */
export const MAX_YEARS_AHEAD = 6

/** A slug: lowercase letters and digits in hyphen-separated runs. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MIN_LENGTH = 2
export const SLUG_MAX_LENGTH = 32

/** The folder every Member file lives in, relative to the repo root. */
export const MEMBERS_DIR = 'src/content/members'

/** The allowed Standing values, as written in a Member file. */
export const STANDINGS = ['graduated', 'transferred', 'attended'] as const
export type Standing = (typeof STANDINGS)[number]

/** How each Standing is shown in the Directory. */
export const STANDING_LABELS: Record<Standing, string> = {
  graduated: 'Graduated',
  transferred: 'Transferred',
  attended: 'Attended',
}

/**
 * GitHub's own handle rule: 1 to 39 letters, digits or single hyphens, not
 * starting or ending with a hyphen.
 */
const GITHUB_HANDLE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/

/** Anything that would make a tagline more than plain text. */
const TAGLINE_NOT_PLAIN: Array<[RegExp, string]> = [
  [/[\r\n]/, 'must be a single line'],
  [/<[a-z/!][^>]*>/i, 'must be plain text, with no HTML'],
  [/\[[^\]]*\]\([^)]*\)/, 'must be plain text, with no Markdown links'],
  [/\bhttps?:\/\/|\bwww\./i, 'must not contain links'],
]

/** Why a slug is invalid, or `undefined` when it is fine. */
export function slugProblem(slug: string): string | undefined {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `must be ${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} characters long (it is ${slug.length})`
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'must be lowercase letters and digits separated by single hyphens, like "kevin-tran"'
  }
  return undefined
}

export function isValidSlug(slug: string): boolean {
  return slugProblem(slug) === undefined
}

/**
 * The slug for a Member file, from its path relative to `src/content/members/`.
 * The slug is the filename, so a bad filename throws an error naming the file.
 * Used as the collection's `generateId`, which makes a bad filename fail the
 * build.
 */
export function slugFromEntry(entry: string): string {
  const file = `${MEMBERS_DIR}/${entry}`
  const fail = (why: string): never => {
    throw new Error(`Invalid Member file ${file}\n  slug (the filename): ${why}`)
  }
  if (entry.includes('/')) fail('Member files go directly in the folder, not in a subfolder')
  if (!entry.endsWith('.yaml')) fail('Member files must be named <slug>.yaml')
  const slug = entry.slice(0, -'.yaml'.length)
  const problem = slugProblem(slug)
  if (problem) fail(`"${slug}" ${problem}`)
  return slug
}

/** Why a Site URL is invalid, or `undefined` when it is fine. */
function siteProblem(site: string): string | undefined {
  if (!site.startsWith('https://')) return 'must start with https://'
  if (site.includes('?')) return 'must not have a query string (the part from "?")'
  if (site.includes('#')) return 'must not have a fragment (the part from "#")'
  let parsed: URL
  try {
    parsed = new URL(site)
  } catch {
    return 'must be a valid URL'
  }
  if (parsed.username || parsed.password) return 'must not contain a username or password'
  if (!parsed.hostname.includes('.')) return 'must be on a public domain name'
  return undefined
}

export interface MemberSchemaOptions {
  /** The year "now" is, for the Graduation Year and Standing rules. */
  currentYear?: number
}

/**
 * The Zod schema for one Member file. `currentYear` defaults to the year at
 * build time; tests pass a fixed year.
 */
export function createMemberSchema({ currentYear = new Date().getFullYear() }: MemberSchemaOptions = {}) {
  const maxYear = currentYear + MAX_YEARS_AHEAD
  const yearRange = `${MIN_GRADUATION_YEAR} to ${maxYear}`
  return z
    .strictObject(
      {
        name: z
          .string({ error: 'is required, as text' })
          .trim()
          .min(1, 'must not be empty')
          .max(60, 'must be at most 60 characters'),
        site: z
          .string({ error: 'is required, as an https:// URL' })
          .superRefine((site, ctx) => {
            const problem = siteProblem(site)
            if (problem) ctx.addIssue({ code: 'custom', message: problem })
          }),
        graduationYear: z
          .number({ error: `is required, as a year from ${yearRange}` })
          .int(`must be a whole year from ${yearRange}`)
          .min(MIN_GRADUATION_YEAR, `must be from ${yearRange}`)
          .max(maxYear, `must be from ${yearRange}`),
        github: z
          .string({ error: 'is required, as your GitHub handle' })
          .refine((handle) => !handle.startsWith('@'), 'is the handle without the leading "@"')
          .refine((handle) => handle.startsWith('@') || GITHUB_HANDLE_PATTERN.test(handle), {
            message: 'must be a GitHub handle: letters, digits and single hyphens, up to 39 characters',
          }),
        tagline: z
          .string({ error: 'must be text' })
          .trim()
          .min(1, 'must not be empty; leave the field out instead')
          .max(80, 'must be at most 80 characters')
          .superRefine((tagline, ctx) => {
            for (const [pattern, message] of TAGLINE_NOT_PLAIN) {
              if (pattern.test(tagline)) ctx.addIssue({ code: 'custom', message })
            }
          })
          .optional(),
        status: z
          .enum(STANDINGS, { error: `must be one of ${STANDINGS.join(', ')}` })
          .optional(),
      },
      { error: (issue) => (issue.code === 'unrecognized_keys' ? 'is not a Member field' : undefined) },
    )
    .superRefine((member, ctx) => {
      if (member.status !== undefined && member.graduationYear > currentYear) {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: `must be left out while graduationYear (${member.graduationYear}) is after ${currentYear}; current students have no Standing`,
        })
      }
    })
}

/** The fields of one Member file, after validation. */
export type MemberData = z.infer<ReturnType<typeof createMemberSchema>>

/** A Member: the file's fields plus its slug. */
export type Member = MemberData & { slug: string }

/** One Graduation Year and its Members. */
export interface GraduationYearGroup {
  graduationYear: number
  members: Member[]
}

/** Slug order by code unit, so every build and the 404 script agree. */
function compareSlugs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Name order for people: case- and accent-insensitive, then by slug. */
function compareNames(a: Member, b: Member): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || compareSlugs(a.slug, b.slug)
}

/** Members in ring order: alphabetical by slug (spec §6). Returns a new array. */
export function ringOrder<T extends { slug: string }>(members: readonly T[]): T[] {
  return [...members].sort((a, b) => compareSlugs(a.slug, b.slug))
}

/** Members sorted by name, for the Directory's A-Z view. Returns a new array. */
export function sortByName(members: readonly Member[]): Member[] {
  return [...members].sort(compareNames)
}

/**
 * Members grouped by Graduation Year, newest year first, names sorted within
 * each year. Only years that have Members appear.
 */
export function groupByGraduationYear(members: readonly Member[]): GraduationYearGroup[] {
  const byYear = new Map<number, Member[]>()
  for (const member of members) {
    const group = byYear.get(member.graduationYear)
    if (group) group.push(member)
    else byYear.set(member.graduationYear, [member])
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([graduationYear, group]) => ({ graduationYear, members: group.sort(compareNames) }))
}

/**
 * A Site as shown in the Directory: no `https://`, no trailing slash, the
 * subpath kept. `https://7jpierre.github.io/jp-website/` gives
 * `7jpierre.github.io/jp-website`.
 */
export function siteDomain(site: string): string {
  return site.replace(/^https:\/\//, '').replace(/\/+$/, '')
}

/** The label for a Standing, e.g. `transferred` gives `Transferred`. */
export function standingLabel(status: Standing): string {
  return STANDING_LABELS[status]
}
