/**
 * Submission checks (spec §4), for CI and for running by hand.
 *
 *   npm run check:submission -- --author <your-github-handle>
 *   node scripts/check-submission.ts --base origin/main --head HEAD --author kvtran
 *
 * Options:
 *   --base <rev>     The branch the PR merges into. Default: origin/main.
 *   --head <rev>     The PR's commit. Default: HEAD. Commit your changes first.
 *   --author <login> The PR author's GitHub handle. Default: $PR_AUTHOR.
 *   --no-fetch       Skip fetching the Site.
 *
 * It reads git in the working directory, from commits only. CI runs the base
 * branch's copy of this script with the PR's checkout as the working
 * directory, so a PR can't edit the checks it is judged by:
 *
 *   cd pr && node ../base/scripts/check-submission.ts --base HEAD^1 --head HEAD
 *
 * Exits 1 when a blocking check fails. Warnings and "needs Maintainer
 * approval" never fail it. In GitHub Actions it also writes the job summary,
 * annotations, and the `needs-maintainer-approval` step output.
 */
import { appendFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { checkSubmission, formatReport, NEEDS_APPROVAL_LABEL, probeSite, type Finding } from './submission/checks.ts'
import { readSubmission } from './submission/git.ts'

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    head: { type: 'string', default: 'HEAD' },
    author: { type: 'string', default: process.env.PR_AUTHOR ?? '' },
    'no-fetch': { type: 'boolean', default: false },
  },
})

if (!values.author) {
  console.error('Pass the PR author\'s GitHub handle with --author <handle> (or set PR_AUTHOR).')
  process.exit(2)
}

const input = readSubmission({ repoDir: process.cwd(), base: values.base, head: values.head, author: values.author })
const report = await checkSubmission({
  ...input,
  probeSite: values['no-fetch'] ? undefined : (site) => probeSite(site),
})
const summary = formatReport(report, values.author)
console.log(summary)

if (process.env.GITHUB_ACTIONS === 'true') {
  // Annotations show on the PR's Checks tab next to the file.
  const escape = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  const annotate = (level: string, title: string, f: Finding) =>
    console.log(`::${level} ${f.file ? `file=${f.file},` : ''}title=${title}::${escape(f.message)}`)
  for (const f of report.errors) annotate('error', 'Submission check failed', f)
  for (const f of report.needsApproval) annotate('warning', 'Needs Maintainer approval', f)
  for (const f of report.warnings) annotate('warning', 'Site not reachable', f)

  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${NEEDS_APPROVAL_LABEL}=${report.needsApproval.length > 0}\n`)
  }
}

process.exit(report.errors.length > 0 ? 1 : 0)
