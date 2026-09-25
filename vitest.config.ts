import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Agent worktrees under .claude/worktrees/ hold full copies of the repo,
    // tests included; without this, `npm test` in the main checkout runs them too.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
