import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        name: 'node',
        plugins: [svelte()],
        test: {
          environment: 'node',
          include: ['tests/node/**/*.test.js'],
          coverage: {
            provider: 'v8',
            include: ['src/lib/db.js', 'cli/**/*.js'],
          },
        },
      },
      {
        name: 'component',
        plugins: [svelte()],
        resolve: {
          conditions: ['browser'],
          alias: [
            {
              find: 'virtual:pwa-register/svelte',
              replacement: path.resolve('./tests/component/__mocks__/pwa-register.js'),
            },
          ],
        },
        test: {
          globals: true,
          environment: 'happy-dom',
          include: ['tests/component/**/*.test.js'],
          setupFiles: ['tests/component/setup.js'],
        },
      },
      {
        name: 'browser',
        plugins: [svelte()],
        test: {
          browser: { enabled: true, instances: [{ browser: 'chromium' }], provider: playwright },
          include: ['tests/browser/**/*.test.js'],
        },
      },
    ],
  },
})
