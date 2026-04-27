import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // supplied as static/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\.db$/],
        runtimeCaching: [],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
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
