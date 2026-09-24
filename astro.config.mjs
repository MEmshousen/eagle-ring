// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// Spec §2. Astro prefixes its own output with `base` but never rewrites
// authored links, so every href/src goes through `src/lib/url.ts`.
export default defineConfig({
  site: 'https://jpierre-7.github.io',
  base: '/eagle-ring',
  trailingSlash: 'never',
  build: { format: 'file' },
  vite: {
    plugins: [tailwindcss()],
  },
})
