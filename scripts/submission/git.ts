/**
 * Reads a Submission PR out of git: what it changes, the Member files before
 * and after, and the Maintainer from CODEOWNERS on the base.
 *
 * Everything is read from commits, never the working tree, so the result is
 * the same in CI and on a laptop with uncommitted edits.
 */
import { execFileSync } from 'node:child_process'
import { MEMBERS_DIR } from '../../src/lib/member.ts'
import {
  CODEOWNERS_PATHS,
  maintainersFromCodeowners,
  type ChangedFile,
  type ChangeStatus,
  type MemberFileText,
  type SubmissionInput,
} from './checks.ts'

function git(repoDir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** A file's text at a commit, or `undefined` when it isn't there. */
export function showFile(repoDir: string, rev: string, path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

const STATUS: Record<string, ChangeStatus> = { A: 'added', M: 'modified', T: 'modified', D: 'deleted' }

/**
 * Every file changed between the merge base of `base` and `head`, and `head`.
 * Renames count as a deletion plus an addition.
 */
export function changedFiles(repoDir: string, mergeBase: string, head: string): ChangedFile[] {
  const out = git(repoDir, ['diff', '--name-status', '--no-renames', '-z', mergeBase, head])
  const parts = out.split('\0').filter(Boolean)
  const files: ChangedFile[] = []
  for (let i = 0; i < parts.length; i += 2) {
    files.push({ path: parts[i + 1], status: STATUS[parts[i][0]] ?? 'modified' })
  }
  return files
}

/** Every file under the members folder at a commit, with its text. */
export function memberFiles(repoDir: string, rev: string): MemberFileText[] {
  const out = git(repoDir, ['ls-tree', '-r', '-z', '--name-only', rev, '--', `${MEMBERS_DIR}/`])
  return out
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ path, text: showFile(repoDir, rev, path) ?? '' }))
}

/** The Maintainer's handles, from the first CODEOWNERS file on `rev`. */
export function maintainersAt(repoDir: string, rev: string): string[] {
  for (const path of CODEOWNERS_PATHS) {
    const text = showFile(repoDir, rev, path)
    if (text !== undefined) return maintainersFromCodeowners(text)
  }
  return maintainersFromCodeowners(undefined)
}

export interface GitSubmissionOptions {
  repoDir: string
  /** The branch the PR merges into, e.g. `origin/main`. */
  base: string
  /** The PR's commit, e.g. `HEAD`. */
  head: string
  author: string
}

/**
 * Everything {@link checkSubmission} needs except the Site fetcher.
 *
 * The Maintainer comes from `base`, not the PR, so a PR can't make its own
 * author the Maintainer by editing CODEOWNERS.
 */
export function readSubmission({
  repoDir,
  base,
  head,
  author,
}: GitSubmissionOptions): Omit<SubmissionInput, 'probeSite'> {
  const mergeBase = git(repoDir, ['merge-base', base, head]).trim()
  return {
    author,
    maintainers: maintainersAt(repoDir, base),
    changedFiles: changedFiles(repoDir, mergeBase, head),
    headMembers: memberFiles(repoDir, head),
    baseMembers: memberFiles(repoDir, mergeBase),
  }
}
