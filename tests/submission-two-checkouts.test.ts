// The attack the two-checkout workflow stops (issue #31): a PR that edits the
// checks so they always pass. The workflow checks out the base branch and the
// PR side by side and runs the base's copy of the checks against the PR's
// commits. This builds the same two checkouts in a throwaway repo, with the
// real check scripts committed on the base, and runs the CLI the way the
// workflow does. --no-fetch keeps it off the network.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const SAM = 'name: Sam Lee\nsite: https://samlee.github.io/\ngraduationYear: 2025\ngithub: samlee\n'
const JO = 'name: Jo Park\nsite: https://jopark.github.io/\ngraduationYear: 2024\ngithub: jopark\n'

/** Everything `scripts/check-submission.ts` needs to run, from this repo. */
const CHECK_FILES = [
  'package.json',
  'scripts/check-submission.ts',
  'scripts/submission/checks.ts',
  'scripts/submission/git.ts',
  'scripts/submission/profile-hosts.ts',
  'src/lib/member.ts',
]

const CHECKS_SIGNATURE = 'export async function checkSubmission(input: SubmissionInput): Promise<SubmissionReport> {'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}

/**
 * A repo whose `main` has the real checks, and a PR branch made by `change`.
 * Returns the two checkouts the workflow makes: `base` (main, with its
 * dependencies installed) and `pr` (the PR merged into main, so HEAD^1 is the
 * base and HEAD is the merge).
 */
function twoCheckouts(change: (write: (path: string, text: string) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'eagle-ring-two-checkouts-'))
  dirs.push(root)
  const pr = join(root, 'pr')
  const base = join(root, 'base')
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' })
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(pr, path)), { recursive: true })
    writeFileSync(join(pr, path), text)
  }
  const commit = (message: string) => {
    git(pr, 'add', '-A')
    git(pr, 'commit', '-q', '--allow-empty', '-m', message)
  }

  mkdirSync(pr)
  git(pr, 'init', '-q', '-b', 'main')
  for (const file of CHECK_FILES) {
    mkdirSync(dirname(join(pr, file)), { recursive: true })
    copyFileSync(join(ROOT, file), join(pr, file))
  }
  write('.github/CODEOWNERS', '* @jpierre-7\n')
  write('src/content/members/kevin-tran.yaml', 'name: Kevin Tran\nsite: https://kevintran.github.io/\ngraduationYear: 2023\ngithub: kvtran\n')
  commit('base: the real checks')

  git(pr, 'checkout', '-q', '-b', 'submission')
  change(write)
  commit('the PR')

  // What actions/checkout gives the workflow: the PR merged into main.
  git(pr, 'checkout', '-q', 'main')
  git(pr, 'checkout', '-q', '-b', 'merge')
  git(pr, 'merge', '-q', '--no-ff', '-m', 'merge', 'submission')

  // The second checkout: the base branch. Both get dependencies, as in CI.
  git(root, 'clone', '-q', '--branch', 'main', pr, base)
  for (const dir of [pr, base]) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
  return { pr, base }
}

/** Runs `from`'s copy of the checks against the PR checkout, as the workflow does. */
function runChecks(from: string, pr: string, author = 'samlee') {
  return spawnSync(
    process.execPath,
    [join(from, 'scripts', 'check-submission.ts'), '--base', 'HEAD^1', '--head', 'HEAD', '--author', author, '--no-fetch'],
    { cwd: pr, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } },
  )
}

describe('running the base copy of the checks against the PR', () => {
  it('fails a PR that edits checks.ts to always pass and adds two Member files', () => {
    const real = readFileSync(join(ROOT, 'scripts/submission/checks.ts'), 'utf8')
    expect(real).toContain(CHECKS_SIGNATURE)
    const alwaysPass = real.replace(
      CHECKS_SIGNATURE,
      `${CHECKS_SIGNATURE}\n  return { byMaintainer: false, memberChanges: [], errors: [], warnings: [], needsApproval: [] }`,
    )
    const { pr, base } = twoCheckouts((write) => {
      write('scripts/submission/checks.ts', alwaysPass)
      write('src/content/members/sam-lee.yaml', SAM)
      write('src/content/members/jo-park.yaml', JO)
    })

    // The attack works on the PR's own copy: this is what the old workflow ran.
    const prCopy = runChecks(pr, pr)
    expect(prCopy.status).toBe(0)
    expect(prCopy.stdout).toContain('**Result: passed.**')

    // The base copy isn't fooled.
    const baseCopy = runChecks(base, pr)
    expect(baseCopy.stderr).toBe('')
    expect(baseCopy.status).toBe(1)
    expect(baseCopy.stdout).toContain('**Result: failed.**')
    expect(baseCopy.stdout).toContain('This PR changes 2 Member files')
    expect(baseCopy.stdout).toContain('This PR changes the checks themselves (`scripts/submission/checks.ts`)')
  })

  it('passes a normal one-file Submission', () => {
    const { pr, base } = twoCheckouts((write) => write('src/content/members/sam-lee.yaml', SAM))
    const result = runChecks(base, pr)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('**Result: passed.**')
    expect(result.stdout).toContain('`src/content/members/sam-lee.yaml` (added)')
  })

  it('reads CODEOWNERS from the base, so the PR cannot make its author the Maintainer', () => {
    const { pr, base } = twoCheckouts((write) => {
      write('.github/CODEOWNERS', '* @samlee\n')
      write('src/content/members/sam-lee.yaml', SAM)
    })
    const result = runChecks(base, pr)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('PR author: @samlee.')
    expect(result.stdout).toContain('This PR changes the checks themselves (`.github/CODEOWNERS`)')
  })
})
