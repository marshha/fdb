import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  base: process.env.VITE_BASE_PATH ?? '/',
  publicDir: 'static',
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    outDir: 'public',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
