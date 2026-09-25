// The git side of the Submission checks: a throwaway repo per test, a base
// branch and a PR branch, read the way CI reads them. The CLI runs with
// --no-fetch, so nothing touches the network.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkSubmission } from '../scripts/submission/checks'
import { readSubmission } from '../scripts/submission/git'

const ROOT = join(import.meta.dirname, '..')
const CODEOWNERS = join(import.meta.dirname, 'fixtures', 'codeowners')
const KEVIN = 'name: Kevin Tran\nsite: https://kevintran.github.io/\ngraduationYear: 2023\ngithub: kvtran\n'
const SAM = 'name: Sam Lee\nsite: https://samlee.github.io/\ngraduationYear: 2025\ngithub: samlee\n'

const repos: string[] = []
afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true })
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

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'eagle-ring-ci-'))
  repos.push(dir)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' })
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  const commit = (message: string) => {
    git('add', '-A')
    git('commit', '-q', '--allow-empty', '-m', message)
  }
  git('init', '-q', '-b', 'main')
  write('README.md', '# eagle-ring\n')
  write('src/content/members/kevin-tran.yaml', KEVIN)
  return { dir, git, write, commit }
}

describe('reading a PR from git', () => {
  it('lists added, edited and deleted files, and treats a rename as two changes', () => {
    const repo = makeRepo()
    repo.write('src/content/members/old-name.yaml', SAM)
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'pr')
    repo.git('mv', 'src/content/members/old-name.yaml', 'src/content/members/new-name.yaml')
    repo.write('README.md', '# changed\n')
    repo.write('notes.txt', 'hi\n')
    repo.commit('pr')

    const input = readSubmission({ repoDir: repo.dir, base: 'main', head: 'pr', author: 'samlee' })
    expect(input.changedFiles).toEqual(
      expect.arrayContaining([
        { path: 'README.md', status: 'modified' },
        { path: 'notes.txt', status: 'added' },
        { path: 'src/content/members/old-name.yaml', status: 'deleted' },
        { path: 'src/content/members/new-name.yaml', status: 'added' },
      ]),
    )
    expect(input.changedFiles).toHaveLength(4)
    expect(input.headMembers.map((m) => m.path).sort()).toEqual([
      'src/content/members/kevin-tran.yaml',
      'src/content/members/new-name.yaml',
    ])
    expect(input.baseMembers.find((m) => m.path.endsWith('old-name.yaml'))?.text).toBe(SAM)
  })

  it('diffs against the merge base, so later commits on main are not counted as the PR\'s', () => {
    const repo = makeRepo()
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'pr')
    repo.write('src/content/members/sam-lee.yaml', SAM)
    repo.commit('pr')
    repo.git('checkout', '-q', 'main')
    repo.write('src/pages/index.astro', '---\n---\n')
    repo.commit('main moves on')

    const input = readSubmission({ repoDir: repo.dir, base: 'main', head: 'pr', author: 'samlee' })
    expect(input.changedFiles).toEqual([{ path: 'src/content/members/sam-lee.yaml', status: 'added' }])
  })

  it('falls back to jpierre-7 as the Maintainer when the base has no CODEOWNERS', () => {
    const repo = makeRepo()
    repo.commit('base')
    const input = readSubmission({ repoDir: repo.dir, base: 'main', head: 'main', author: 'x' })
    expect(input.maintainers).toEqual(['jpierre-7'])
  })

  it.each(['CODEOWNERS', '.github/CODEOWNERS'])('reads the Maintainer from %s on the base', (location) => {
    const repo = makeRepo()
    mkdirSync(dirname(join(repo.dir, location)), { recursive: true })
    copyFileSync(join(CODEOWNERS, 'handed-over'), join(repo.dir, location))
    repo.commit('base')
    const input = readSubmission({ repoDir: repo.dir, base: 'main', head: 'main', author: 'x' })
    expect(input.maintainers).toEqual(['eagle-club-lead', 'jpierre-7'])
  })

  it('ignores a CODEOWNERS the PR itself adds, so a PR cannot exempt its own author', async () => {
    const repo = makeRepo()
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'pr')
    repo.write('CODEOWNERS', '* @samlee\n')
    repo.write('src/content/members/sam-lee.yaml', SAM)
    repo.commit('pr')

    const input = readSubmission({ repoDir: repo.dir, base: 'main', head: 'pr', author: 'samlee' })
    expect(input.maintainers).toEqual(['jpierre-7'])
    const report = await checkSubmission({ ...input, currentYear: 2026 })
    expect(report.byMaintainer).toBe(false)
    expect(report.errors[0].message).toContain('also changes files outside `src/content/members/`: `CODEOWNERS`')
  })
})

describe('the command line', () => {
  function cli(repoDir: string, author: string) {
    return spawnSync(
      process.execPath,
      [join(ROOT, 'scripts', 'check-submission.ts'), '--base', 'main', '--head', 'HEAD', '--author', author, '--no-fetch'],
      { cwd: repoDir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } },
    )
  }

  it('exits 0 on a good Submission and prints the summary', () => {
    const repo = makeRepo()
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'pr')
    repo.write('src/content/members/sam-lee.yaml', SAM)
    repo.commit('pr')
    const result = cli(repo.dir, 'samlee')
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('**Result: passed.**')
  })

  it('exits 1 when a blocking check fails', () => {
    const repo = makeRepo()
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'pr')
    repo.write('src/content/members/sam-lee.yaml', SAM)
    repo.write('README.md', '# mine now\n')
    repo.commit('pr')
    const result = cli(repo.dir, 'samlee')
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('**Result: failed.**')
    expect(result.stdout).toContain('`README.md`')
  })

  it('exits 0 but reports the flag when someone else edits a record', () => {
    const repo = makeRepo()
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'pr')
    repo.write('src/content/members/kevin-tran.yaml', KEVIN.replace('2023', '2024'))
    repo.commit('pr')
    const result = cli(repo.dir, 'samlee')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('### Needs Maintainer approval')
    expect(result.stdout).toContain('belongs to @kvtran')
  })
})
