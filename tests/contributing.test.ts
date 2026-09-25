// Keeps the join docs in step with the code and the spec: the example Member
// file passes the real schema, and CONTRIBUTING's Ring Widget snippets are the
// spec §6 snippets byte for byte.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { createMemberSchema } from '../src/lib/member'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** Every fenced ```html block in a Markdown file, in order. */
function htmlBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```html\n([\s\S]*?)^```$/gm)].map((match) => match[1])
}

describe('docs/member-example.yaml', () => {
  it('passes the Member schema as the spec §3 example', () => {
    const data = yaml.load(read('docs/member-example.yaml'))
    const result = createMemberSchema({ currentYear: 2026 }).safeParse(data)
    expect(result.error?.issues).toBeUndefined()
    expect(result.data).toEqual({
      name: 'Kevin Tran',
      site: 'https://kevintran.github.io/',
      graduationYear: 2023,
      github: 'kvtran',
      tagline: 'Data analyst. Plots things in R.',
      status: 'transferred',
    })
  })
})

describe('CONTRIBUTING.md Ring Widget snippets', () => {
  it('are snippets A and B from spec §6, byte for byte', () => {
    const spec = htmlBlocks(read('docs/spec.md'))
    const contributing = htmlBlocks(read('CONTRIBUTING.md'))
    expect(spec).toHaveLength(2)
    expect(contributing).toEqual(spec)
  })
})
