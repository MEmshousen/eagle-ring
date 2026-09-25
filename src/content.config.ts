// Content collections (spec §3). Every Member file is validated here at build
// time, so a bad record fails `npm run build` with the file and field named.
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { createMemberSchema, MEMBERS_DIR, slugFromEntry } from './lib/member'

const members = defineCollection({
  // `**/*` rather than `*.yaml`, so a misnamed file (`.yml`, a subfolder)
  // fails the build in `slugFromEntry` instead of being silently skipped.
  loader: glob({
    pattern: '**/*',
    base: `./${MEMBERS_DIR}`,
    generateId: ({ entry }) => slugFromEntry(entry),
  }),
  schema: createMemberSchema(),
})

export const collections = { members }
