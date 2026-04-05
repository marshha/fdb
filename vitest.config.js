import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        name: 'node',
        test: {
          environment: 'node',
          include: ['tests/node/**/*.test.js'],
          coverage: {
            provider: 'v8',
            include: ['src/lib/db.js', 'cli/**/*.js'],
          },
        },
      },
      // Activated in Phase 2:
      // {
      //   name: 'component',
      //   plugins: [svelte()],
      //   test: {
      //     environment: 'happy-dom',
      //     include: ['tests/component/**/*.test.js'],
      //     setupFiles: ['tests/component/setup.js'],
      //   },
      // },
      // {
      //   name: 'browser',
      //   plugins: [svelte()],
      //   test: {
      //     browser: { enabled: true, name: 'chromium', provider: 'playwright' },
      //     include: ['tests/browser/**/*.test.js'],
      //   },
      // },
    ],
  },
})
