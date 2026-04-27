# PWA Conversion Plan

## Goal

Convert the FDB browser UI into an installable Progressive Web App (PWA) so users can add it to their home screen or desktop and launch it without a browser tab. The app is already fully offline by design — this phase adds **installability** and **asset caching**, not a new data model.

## Background

FDB's offline story is already solid:

- All data lives in a `.db` file the user explicitly opens via the File System Access API.
- The SQLite database is deserialized into memory via `sqlite-wasm` (WASM); no server, no cloud.
- There are no external API calls; the network is never required at runtime.

PWA conversion therefore focuses on three things:

1. A **Web App Manifest** so browsers offer an install prompt.
2. A **Service Worker** that caches static assets (JS, CSS, WASM) so the shell loads offline without the user having to open a file.
3. An **app icon set** used by the manifest and the OS.

It does **not** involve caching `.db` files (user-managed), adding sync, or changing the data model.

---

## Constraints & Non-Goals

| Non-Goal | Reason |
|---|---|
| Cache or manage `.db` files in the service worker | The File System Access API already handles persistence; the SW should not touch user data files |
| Background sync / push notifications | Out of scope; the app is a local tool, not a networked service |
| IndexedDB data storage | The existing sqlite-wasm + File System Access model is correct and should not change |
| Changing the CLI | PWA only applies to the browser UI |
| Supporting browsers without File System Access API differently | Firefox fallback already exists; PWA layer sits above it |

---

## Architecture

```
index.html
  └── registers /sw.js (service worker)
  └── links /manifest.webmanifest

/sw.js  (precaches static assets on install; serves from cache on fetch)

/manifest.webmanifest  (name, icons, display: standalone, start_url, theme)

/static/icons/  (icon set: 192×192, 512×512, maskable 512×512)
```

The service worker uses a **cache-first** strategy for precached assets (the build output hashes guarantee freshness). For navigation requests it serves `index.html` from cache. It never intercepts requests for `.db` files or `blob:` URLs.

---

## Implementation Steps

### Step 1 — Web App Manifest

Create `static/manifest.webmanifest`:

```json
{
  "name": "FDB — Firearm Database",
  "short_name": "FDB",
  "description": "Private, offline firearm ownership tracker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Link it in `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0f172a" />
```

`VITE_BASE_PATH` is already supported; the manifest `start_url` and icon paths must use the same base when deploying to a subdirectory. The Vite build step will handle this via `vite-plugin-pwa` (see Step 3).

---

### Step 2 — App Icons

Generate three PNG icons from the existing app identity (lock + shield motif matches the privacy theme):

| File | Size | Purpose |
|---|---|---|
| `static/icons/icon-192.png` | 192×192 | Standard install icon |
| `static/icons/icon-512.png` | 512×512 | Splash screen / store listing |
| `static/icons/icon-512-maskable.png` | 512×512 | Android adaptive icon (safe zone: inner 80%) |

Icons should use the app's dark background (`#0f172a`) with a light foreground glyph so they read well on both light and dark OS themes.

---

### Step 3 — Service Worker via vite-plugin-pwa

Use [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (wraps Workbox) to generate the service worker automatically from the build manifest. This avoids hand-rolling cache-busting logic.

**Install:**

```bash
npm install -D vite-plugin-pwa
```

**`vite.config.js` additions:**

```js
import { VitePWA } from 'vite-plugin-pwa'

// inside defineConfig plugins array:
VitePWA({
  registerType: 'autoUpdate',
  manifest: false,          // we supply our own manifest.webmanifest in static/
  workbox: {
    globPatterns: ['**/*.{js,css,html,wasm}'],
    // Never cache .db files or blob URLs
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/\.db$/],
    runtimeCaching: [],     // no runtime caching; precache only
  },
  devOptions: {
    enabled: true,          // test SW behaviour in vite dev server
  },
})
```

The plugin injects the SW registration script automatically into `index.html` during build.

**WASM note:** `sqlite-wasm` is already excluded from Vite's dep-optimizer (`optimizeDeps.exclude`). The WASM binary will be included in the precache manifest by the glob pattern above and served correctly from cache on subsequent loads.

**COEP/COOP headers:** These headers are already present in `vite.config.js` for the dev server. They are required by `sqlite-wasm` only when using its OPFS (Origin Private File System) or worker-threaded modes, which need `SharedArrayBuffer`. FDB uses `oo1.DB(':memory:')` — the single-threaded in-memory API — so the headers are **not strictly required** at the application level. They were added proactively based on sqlite.org's broad recommendation. The service worker itself does not require them. For production deployments the headers can be omitted unless the storage model changes to OPFS.

---

### Step 4 — SW Registration & Update UX

`vite-plugin-pwa` registers the SW automatically, but the app should notify the user when a new version is available (the SW is in `waiting` state). Add a lightweight update prompt to `App.svelte`:

```
┌─────────────────────────────────────────┐
│  A new version is available.  [Reload]  │
└─────────────────────────────────────────┘
```

Implementation:

- Use `useRegisterSW` (virtual module exported by `vite-plugin-pwa`) to detect the waiting SW.
- When `needRefresh` is true, show the banner above using a new `UpdateBanner.svelte` component.
- On "Reload", call `updateServiceWorker()` which skips waiting and reloads the page.

### Step 4b — Install Prompt on Landing Page

Browsers fire a `beforeinstallprompt` event when the PWA criteria are met and the app is not yet installed. The Landing page (the only screen shown before a database is open) is the right place to surface this.

Add an "Install as app" link at the bottom of the Landing page:

```
┌───────────────────────────────────────┐
│  Open database                        │  ← primary action
│  New database                         │  ← secondary action
│                                       │
│  Install as app  ↓                    │  ← shown only when installable
└───────────────────────────────────────┘
```

Implementation in `Landing.svelte`:

- Capture `beforeinstallprompt` event and store the deferred prompt.
- Show the install button only when the deferred prompt is available (i.e., not already installed, browser supports install).
- On click, call `deferredPrompt.prompt()` and clear the stored prompt regardless of outcome.
- The button is hidden after the user accepts or dismisses the prompt.

The update banner (`UpdateBanner.svelte`) is the only other UX change visible to users.

---

### Step 5 — Deployment

No special response headers are required for production (COEP/COOP are not needed for the in-memory sqlite-wasm mode). Any static host that serves the build output with correct MIME types will work: GitHub Pages, Netlify, Cloudflare Pages, etc.

The existing GitHub Pages CI workflow requires no changes for PWA purposes. The service worker and manifest will be part of the built output in `public/` and will be deployed automatically.

---

### Step 6 — Testing

| Test | How |
|---|---|
| Manifest is valid | Lighthouse PWA audit in Chrome DevTools |
| App installs | Chrome: address bar install icon appears; Firefox: no install but SW registered |
| Assets load offline | DevTools → Network → Offline checkbox → hard refresh |
| WASM loads from cache | Confirm `sqlite-wasm` WASM binary appears in Cache Storage in DevTools |
| SW update flow | Deploy a change, reopen app, confirm update banner appears |
| No `.db` files cached | Confirm Cache Storage contains only static assets, not user data |
| Existing file open/save flow unchanged | Manual smoke test with a real `.db` file |

Add a Vitest/Playwright test that verifies the service worker registers successfully (checks `navigator.serviceWorker.ready` resolves).

---

## File Changeset Summary

| File | Action |
|---|---|
| `static/manifest.webmanifest` | Create |
| `static/icons/icon-192.png` | Create |
| `static/icons/icon-512.png` | Create |
| `static/icons/icon-512-maskable.png` | Create |
| `index.html` | Add manifest link + theme-color meta |
| `vite.config.js` | Add `vite-plugin-pwa` plugin |
| `package.json` | Add `vite-plugin-pwa` dev dependency |
| `src/components/UpdateBanner.svelte` | Create |
| `src/App.svelte` | Import + render `UpdateBanner` |
| `src/components/Landing.svelte` | Add install prompt button |
| `README.md` | Document install UX + hosting header requirements |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `vite-plugin-pwa` glob includes large WASM binary, slowing install | Medium | WASM is ~3 MB; acceptable for a one-time precache; exclude if needed via `globIgnores` |
| SW update loop if `autoUpdate` fires mid-session with unsaved changes | Low | `beforeunload` guard already present; SW update defers until next navigation |
| Maskable icon crops poorly on Android | Low | Follow safe-zone spec (glyph within inner 80% circle) |
