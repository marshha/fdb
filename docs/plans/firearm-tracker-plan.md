# Firearm Tracker -- Implementation Plan

## Goals

Firearm Tracker is a personal firearm ownership management tool built on one core principle: **you own your data, completely**.

There is no account, no cloud, no subscription, and no server. The entire application state lives in a single SQLite `.db` file that sits on your filesystem. To back up, you copy one file. To move to a new machine, you copy one file. To inspect your data with any SQLite tool, you open one file.

The application has two first-class interfaces that operate on the same file:

- **A browser-based GUI** — a clean, modern web app served locally or via GitLab Pages. No installation required beyond a browser. Works offline.
- **A CLI** — a command-line tool for scripting, automation, and power-user workflows. The same database, the same operations, no GUI required.

Neither interface requires a running server, a Python environment, or any runtime dependencies beyond what the user already has (a browser or Node.js).

### Design principles

| Principle | What it means in practice |
|---|---|
| **Fully offline** | No network calls, no CDN, no external APIs. Everything runs on the user's machine. |
| **You own the file** | Data is a `.db` file you manage. The app never writes to hidden browser storage. |
| **Privacy by design** | No telemetry, no analytics, no accounts, no login. |
| **Two interfaces, one codebase** | The GUI and CLI share the same database logic. A feature added to one is available to both. |
| **Reskinnable** | All visual design tokens live in one place. The app can be restyled without touching component code. |
| **Runs anywhere** | Works from a local file server, GitLab Pages, or any static host. No server configuration required. |

---

## Technical overview

Firearm Tracker is a fully offline personal firearm ownership management tool with two first-class interfaces: a browser-based GUI and a CLI. Both share the same SQLite database file and the same core database logic. The browser app runs entirely in-browser with no backend, no network calls, and no accounts. The CLI runs in Node.js and operates on the same `.db` file directly. Both are built from a single shared `src/lib/db.js` module. The browser build uses Svelte + Vite; the CLI runs as native Node.js ESM with no build step required. The browser build output (`public/`) is deployed to GitLab Pages as a static site.

### Critical architectural insight

Because the design explicitly avoids OPFS and uses only in-memory SQLite with manual file open/save, the app does **not** require `SharedArrayBuffer`, COOP/COEP headers, or web workers. The SQLite WASM library runs on the main thread using its `oo1` (object-oriented) API. This dramatically simplifies both the Vite configuration and the deployment story.

However, the File System Access API (`showOpenFilePicker` / `showSaveFilePicker`) is **not supported in Firefox**. The plan includes a fallback: `<input type="file">` for opening and `<a download>` with a Blob URL for saving. This fallback means Firefox users can still use the app but will get a standard download dialog instead of an in-place save.

## Alternatives considered

| Approach | Why not chosen |
|---|---|
| **sql.js** instead of `@sqlite.org/sqlite-wasm` | sql.js is a community wrapper around an older Emscripten build. The official `@sqlite.org/sqlite-wasm` package is maintained by the SQLite team, receives updates faster, and has a richer API (especially around `sqlite3_deserialize`). |
| **OPFS for persistence** | Explicitly ruled out by requirements. The user wants to own the `.db` file on their filesystem, not have it hidden in browser storage. |
| **SvelteKit** instead of plain Svelte + Vite | SvelteKit adds SSR, routing, and server hooks that are unnecessary for a fully static, single-page app. Plain Svelte + Vite is simpler and produces a smaller bundle. |
| **IndexedDB for persistence** | Would tie data to a single browser profile. The `.db` file approach lets users back up, move between machines, and inspect the database with standard SQLite tools. |

## Database schema

All timestamps are stored as `TEXT` in ISO 8601 UTC format (e.g. `2026-04-04T19:59:00.000000+00:00`).

```sql
CREATE TABLE firearms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    serial_number   TEXT UNIQUE NOT NULL,
    manufacturer    TEXT,
    caliber         TEXT,
    purchase_price  REAL,
    purchase_date   TEXT,
    ffl_dealer      TEXT,
    notes           TEXT
);

CREATE TABLE round_counts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    firearm_id      INTEGER NOT NULL,
    date            TEXT NOT NULL,
    rounds_fired    INTEGER NOT NULL,
    notes           TEXT,
    FOREIGN KEY (firearm_id) REFERENCES firearms(id)
);

CREATE TABLE documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type    TEXT,
    filename    TEXT NOT NULL,
    file_data   BLOB NOT NULL,
    mime_type   TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
);

CREATE TABLE firearm_documents (
    firearm_id  INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    notes       TEXT,
    PRIMARY KEY (firearm_id, document_id),
    FOREIGN KEY (firearm_id) REFERENCES firearms(id),
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    firearm_id  INTEGER NOT NULL,
    event_type  TEXT NOT NULL,
    date        TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (firearm_id) REFERENCES firearms(id)
);
```

**Notes on the schema:**
- `ON DELETE CASCADE` is intentionally absent. `deleteFirearm()` and `deleteDocument()` in `db.js` must manually delete related rows in a transaction (see Step 2).
- `event_type` is free text — new event types can be added without schema changes.
- `firearm_documents` is a many-to-many join: one document can be associated with multiple firearms (e.g. a single FFL covering a multi-firearm purchase).
- `round_counts` stores individual sessions. Total round counts are always computed dynamically via `SUM()` — never stored.

## Project structure

```
fdb/
  .gitignore
  .gitlab-ci.yml
  package.json
  vite.config.js
  index.html
  static/                         # Static assets served by Vite (favicon, etc.)
  public/                         # Build output only -- gitignored, never committed
  src/
    lib/
      db.js                       # SHARED: SQLite init, schema, all query helpers (no browser deps)
      fileAccess.js               # Browser: File System Access API wrapper + Firefox fallbacks
      stores.svelte.js            # Browser only: Svelte 5 runes for app state
    main.js                       # Svelte app entry point
    App.svelte                    # Root component (router + layout)
    components/
      Landing.svelte              # Open/New database screen
      Sidebar.svelte              # Navigation sidebar
      SaveButton.svelte           # Persistent save button + unsaved indicator
      firearms/
        FirearmList.svelte        # Table of all firearms with computed round counts
        FirearmForm.svelte        # Add/Edit firearm modal or panel
        FirearmDetail.svelte      # Single firearm detail view (tabs: info, rounds, events, docs)
      rounds/
        RoundCountList.svelte     # Per-firearm round count log table
        RoundCountForm.svelte     # Add/Edit round count entry
        RoundCountChart.svelte    # Chart.js cumulative rounds over time
      documents/
        DocumentList.svelte       # Document list with type filter
        DocumentUpload.svelte     # Upload form (file picker + type + firearm associations)
        DocumentViewer.svelte     # Inline PDF/image viewer
      events/
        EventList.svelte          # Per-firearm event log
        EventForm.svelte          # Add/Edit event
  cli/
    index.js                      # CLI entry point (commander): argument parsing, output formatting
    fileAccess.js                 # Node: fs.readFileSync / fs.writeFileSync wrappers
```

**Note on `static/` directory:** Vite's `publicDir` is set to `static/` (not the default `public/`) to avoid conflicts with the `public/` build output directory. Static assets such as a favicon go here. No service worker or other network-interception files are needed — this is a fully offline app with no network calls.

## Files to be created

| File | Shared? | Purpose |
|---|---|---|
| `.gitignore` | — | Ignore `node_modules/`, `public/` (build output) |
| `package.json` | — | Dependencies, scripts, `bin` entry for `fdb` CLI |
| `vite.config.js` | — | Vite: Svelte + Tailwind plugins, `publicDir: 'static'`, `outDir: 'public'`, sqlite-wasm exclude |
| `.gitlab-ci.yml` | — | CI: install, build, deploy to Pages |
| `index.html` | — | Browser HTML shell |
| `src/lib/db.js` | **YES** | SQLite init, schema, deserialize/serialize, all query helpers — no browser or Node deps |
| `src/lib/fileAccess.js` | No | Browser: File System Access API + Firefox fallbacks |
| `src/lib/stores.svelte.js` | No | Browser only: Svelte 5 runes for app state |
| `src/main.js` | No | Mounts Svelte `App` component |
| `src/App.svelte` | No | Top-level layout |
| `src/components/**/*.svelte` | No | All UI components |
| `cli/index.js` | No | CLI entry point: commander, argument parsing, output formatting |
| `cli/fileAccess.js` | No | Node: `fs.readFileSync` / `fs.writeFileSync` |

## Step-by-step implementation

### Step 1: Project scaffolding

Create the project skeleton with all configuration files.

**`package.json`**

```json
{
  "name": "firearm-tracker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Dependencies to install:
- `svelte` (dev)
- `@sveltejs/vite-plugin-svelte` (dev)
- `vite` (dev)
- `tailwindcss` (dev)
- `@tailwindcss/vite` (dev)
- `@sqlite.org/sqlite-wasm`
- `chart.js`
- `chartjs-adapter-date-fns`
- `date-fns`
- `commander` (CLI argument parsing)

The `bin` entry in `package.json` registers the CLI as a local executable:

```json
{
  "name": "firearm-tracker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "bin": {
    "fdb": "./cli/index.js"
  }
}
```

After `npm install`, running `npm link` (once, locally) makes `fdb` available as a shell command pointing at `cli/index.js`.

**`.gitignore`**

```
node_modules/
public/
```

**`vite.config.js`**

```js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  publicDir: 'static',           // Avoid conflict with public/ build output
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    outDir: 'public',
  },
  server: {
    headers: {
      // Not strictly required for in-memory mode, but included
      // so the sqlite-wasm library does not emit console warnings
      // about missing COOP/COEP when it probes for OPFS support.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

The `optimizeDeps.exclude` is important: Vite's dependency pre-bundling can break WASM modules. Excluding `@sqlite.org/sqlite-wasm` tells Vite to serve it as-is.

**`index.html`**

Standard Vite HTML shell:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Firearm Tracker</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**`src/main.js`**

```js
import { mount } from 'svelte';
import App from './App.svelte';
const app = mount(App, { target: document.getElementById('app') });
export default app;
```

### Step 2: SQLite initialization module (`src/lib/db.js`)

This is the most critical module and the only place SQL lives. It is **shared between the browser and the CLI** — it must have zero dependencies on browser APIs, Svelte stores, or Node.js built-ins. It receives a `db` instance and returns data. All side effects (dirty tracking, UI updates) are the caller's responsibility.

**Initialization:**
1. Import `sqlite3InitModule` from `@sqlite.org/sqlite-wasm`.
2. Call `sqlite3InitModule()` -- this returns a promise that resolves with the `sqlite3` API object.
3. Store the `sqlite3` reference in a module-level variable.

**Creating a new database:**
1. Call `new sqlite3.oo1.DB(':memory:')` to create a fresh in-memory database.
2. Run the schema SQL (all five `CREATE TABLE` statements) via `db.exec()`.
3. Return the `db` instance.

**Opening an existing database from a `Uint8Array`:**
1. Create a new in-memory DB: `new sqlite3.oo1.DB(':memory:')`.
2. Allocate WASM memory from the byte array: `const p = sqlite3.wasm.allocFromTypedArray(bytes)`.
3. Call `sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.byteLength, bytes.byteLength, SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE)`.
4. Check the return code with `db.checkRc(rc)`.
5. Return the `db` instance.

**Exporting the database to a `Uint8Array`:**
1. Call `sqlite3.capi.sqlite3_js_db_export(db.pointer)` which returns a `Uint8Array` of the entire database file.

**Schema (constant string):**
Store the exact SQL from the requirements as a template literal constant. `db.exec()` can run multiple statements separated by semicolons.

**Query helper functions (exported):**

Each function takes the `db` instance as its first argument (or reads it from the store):

- `getAllFirearms()` -- `SELECT f.*, COALESCE(SUM(rc.rounds_fired), 0) AS total_rounds FROM firearms f LEFT JOIN round_counts rc ON rc.firearm_id = f.id GROUP BY f.id ORDER BY f.name`
- `getFirearm(id)` -- single firearm by ID
- `insertFirearm(data)` / `updateFirearm(id, data)` / `deleteFirearm(id)`
- `getRoundCounts(firearmId)` -- `SELECT * FROM round_counts WHERE firearm_id = ? ORDER BY date`
- `insertRoundCount(data)` / `updateRoundCount(id, data)` / `deleteRoundCount(id)`
- `getCumulativeRounds(firearmId)` -- returns `[{date, cumulative}]` using a window function: `SELECT date, SUM(rounds_fired) OVER (ORDER BY date) AS cumulative FROM round_counts WHERE firearm_id = ? ORDER BY date`
- `getEvents(firearmId)` -- ordered by date desc
- `insertEvent(data)` / `updateEvent(id, data)` / `deleteEvent(id)`
- `getAllDocuments()` / `getDocumentsForFirearm(firearmId)`
- `insertDocument(file, docType, mimeType)` -- reads file as ArrayBuffer, inserts BLOB
- `linkDocumentToFirearm(docId, firearmId, notes)` / `unlinkDocumentFromFirearm(docId, firearmId)`
- `getDocumentBlob(id)` -- returns `{file_data, mime_type, filename}` for rendering/download
- `deleteDocument(id)` -- also deletes from `firearm_documents`

**`db.js` must never import from `stores.svelte.js` or call `markDirty()`.** Callers (Svelte components in the browser, `cli/index.js` in the CLI) are responsible for any post-mutation side effects. This is what keeps the module shared.

**Important detail:** `deleteFirearm(id)` must cascade-delete related `round_counts`, `events`, and `firearm_documents` rows. SQLite foreign keys are not enforced by default -- the module must run `PRAGMA foreign_keys = ON` immediately after opening/creating any database. Alternatively, handle cascades explicitly in the delete function with a transaction.

### Step 3: File Access module (`src/lib/fileAccess.js`)

This module abstracts the File System Access API with fallbacks.

**`openFile()`:**
1. Feature-detect `window.showOpenFilePicker`.
2. If available: call `showOpenFilePicker({ types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db'] } }] })`. Get the `FileHandle`, get the `File` from it, read as `ArrayBuffer`, convert to `Uint8Array`. Return `{ bytes, handle }`.
3. If not available (Firefox fallback): create a hidden `<input type="file" accept=".db">`, click it programmatically, wait for the `change` event, read the selected file as `ArrayBuffer`. Return `{ bytes, handle: null }`.

**`saveFile(bytes, existingHandle)`:**
1. If `existingHandle` is not null (File System Access API was used to open): call `existingHandle.createWritable()`, write `bytes`, close the writable stream. This overwrites the file in place.
2. If `existingHandle` is null but `showSaveFilePicker` is available: call `showSaveFilePicker(...)`, write to the new handle, return the new handle.
3. Fallback (Firefox): create a `Blob` from `bytes`, create an object URL, create an `<a>` element with `download="firearms.db"` and the object URL, click it programmatically, revoke the URL.

**`saveFileAs(bytes)`:**
Always shows a picker (or falls back to download). Ignores any existing handle.

### Step 4: Svelte app state (`src/lib/stores.svelte.js`) — browser only

This module is **browser-only**. It must never be imported by `db.js` or `cli/`. It holds UI and session state for the browser app. Note the `.svelte.js` extension — required for Svelte 5 runes to work in a plain JS module.

```js
// src/lib/stores.svelte.js  (note: .svelte.js extension enables runes in modules)

// The active sqlite3 DB instance (or null if no database is open)
export let dbInstance = $state(null);

// The FileHandle from the File System Access API (null if fallback was used)
export let fileHandle = $state(null);

// Whether the database has unsaved changes
export let isDirty = $state(false);

// Current navigation view: 'landing' | 'firearms' | 'firearm-detail' | 'documents'
export let currentView = $state('landing');

// ID of the currently selected firearm (for detail view)
export let selectedFirearmId = $state(null);

export function markDirty() { isDirty = true; }
export function markClean() { isDirty = false; }
```

Import and use these directly in Svelte components. `markDirty()` is called by components after any successful mutation — not by `db.js`. `markClean()` is called after a successful save.

### Step 5: Root component and navigation (`App.svelte`, `Sidebar.svelte`, `Landing.svelte`)

**`App.svelte`:**
- Subscribes to `currentView` and `dbInstance`.
- If `dbInstance` is null, renders `<Landing />`.
- If `dbInstance` is set, renders a two-column layout: `<Sidebar />` on the left, content area on the right.
- The content area switches on `currentView`: `'firearms'` -> `<FirearmList />`, `'firearm-detail'` -> `<FirearmDetail />`, `'documents'` -> `<DocumentList />`.
- Registers a `beforeunload` event listener that checks `$isDirty` and shows a browser-native "unsaved changes" warning if true.

**`Landing.svelte`:**
- Two buttons: "Open existing database" and "Create new database".
- "Open existing database": calls `openFile()` from `fileAccess.js`, then `openDatabase(bytes)` from `db.js`, sets `dbInstance` and `fileHandle` stores, sets `currentView` to `'firearms'`.
- "Create new database": calls `createDatabase()` from `db.js`, sets `dbInstance`, sets `fileHandle` to null, sets `currentView` to `'firearms'`, marks dirty (so user is prompted to save).

**`Sidebar.svelte`:**
- Navigation links: "Firearms", "Documents".
- `<SaveButton />` component embedded at the bottom (or top) of the sidebar.
- Clicking a nav link sets `currentView` and clears `selectedFirearmId`.

**`SaveButton.svelte`:**
- Subscribes to `isDirty`, `dbInstance`, `fileHandle`.
- Shows "Save" button (highlighted/pulsing if dirty).
- On click: exports the database via `db.exportDatabase()`, calls `saveFile(bytes, $fileHandle)`, updates `fileHandle` if a new handle was returned, calls `markClean()`.
- Also provides a "Save As..." option that always shows a picker.

### Step 6: Firearm Registry (`firearms/` components)

**`FirearmList.svelte`:**
- On mount, calls `getAllFirearms()` to get the list with computed total round counts.
- Renders a table with columns: Name, Serial Number, Caliber, Manufacturer, Total Rounds, Purchase Date.
- Each row is clickable -- sets `selectedFirearmId` and `currentView` to `'firearm-detail'`.
- "Add Firearm" button opens `FirearmForm` in create mode.
- Delete button per row with confirmation dialog.
- The list must re-query after any mutation. Use a reactive statement or a refresh function.

**`FirearmForm.svelte`:**
- Props: `firearm` (null for create, object for edit), `onClose` callback.
- Form fields for all `firearms` columns except `id`.
- On submit: calls `insertFirearm()` or `updateFirearm()`, marks dirty, calls `onClose`.
- Serial number validation: attempt the insert/update and catch the UNIQUE constraint error, display a user-friendly message.

**`FirearmDetail.svelte`:**
- Subscribes to `selectedFirearmId`.
- Fetches the firearm record on mount / when ID changes.
- Tabbed interface with three tabs: "Round Counts", "Events", "Documents".
- Renders the firearm header (name, serial, caliber, etc.) with an "Edit" button that opens `FirearmForm`.
- Below the header, renders the active tab component.

### Step 7: Round Count Tracking (`rounds/` components)

**`RoundCountList.svelte`:**
- Props: `firearmId`.
- Fetches round counts for the firearm on mount.
- Table with columns: Date, Rounds Fired, Notes.
- Add/Edit/Delete actions.
- Shows running total at the bottom (sum of all rows).

**`RoundCountForm.svelte`:**
- Props: `firearmId`, `roundCount` (null for create), `onClose`.
- Fields: date (date picker), rounds fired (number, required, min=1), notes (text).
- On submit: insert or update, mark dirty, call onClose.

**`RoundCountChart.svelte`:**
- Props: `firearmId`.
- On mount: call `getCumulativeRounds(firearmId)` to get `[{date, cumulative}]`.
- Create a `<canvas>` element, bind it via Svelte's `bind:this`.
- In `onMount`, instantiate a Chart.js line chart:
  - X axis: dates (time scale -- requires `chartjs-adapter-date-fns` or similar date adapter).
  - Y axis: cumulative round count.
  - Single dataset line.
- **Lifecycle:** destroy the Chart instance in `onDestroy` to prevent memory leaks.
- Reactive: when `firearmId` changes or data is mutated, destroy the old chart and create a new one.

**Chart.js date adapter dependency:** Add `chartjs-adapter-date-fns` and `date-fns` as dependencies. Import the adapter in `RoundCountChart.svelte` (or globally in `main.js`).

### Step 8: Document Management (`documents/` components)

**`DocumentList.svelte`:**
- Two modes: standalone (all documents) and per-firearm (documents linked to a specific firearm).
- Props: `firearmId` (optional).
- Fetches documents (all or per-firearm).
- Table with columns: Filename, Type, Uploaded At, Actions (View, Download, Delete).
- Filter/group by `doc_type`.
- "Upload Document" button opens `DocumentUpload`.

**`DocumentUpload.svelte`:**
- Props: `firearmId` (optional -- pre-selects the firearm association), `onClose`.
- File input (accept: `.pdf, image/*`).
- `doc_type` select: "FFL", "Receipt", "Manual", "Other" (or free text input).
- Multi-select for firearm associations (list of all firearms).
- On submit:
  1. Read the file as `ArrayBuffer`.
  2. Call `insertDocument(...)` to store the BLOB.
  3. For each selected firearm, call `linkDocumentToFirearm(...)`.
  4. Mark dirty, close.

**`DocumentViewer.svelte`:**
- Props: `documentId`.
- Fetches the document BLOB via `getDocumentBlob(id)`.
- If `mime_type` starts with `image/`: render an `<img>` with a Blob URL (`URL.createObjectURL`).
- If `mime_type` is `application/pdf`: render an `<iframe>` or `<embed>` with a Blob URL.
- Provide a "Download" button that creates a temporary `<a download>` link.
- Revoke Blob URLs on component destroy.

### Step 9: Event Log (`events/` components)

**`EventList.svelte`:**
- Props: `firearmId`.
- Fetches events for the firearm, ordered by date descending.
- Table/card list with columns: Date, Type, Title, Description.
- Add/Edit/Delete actions.

**`EventForm.svelte`:**
- Props: `firearmId`, `event` (null for create), `onClose`.
- Fields: date, event_type (free text input with suggestions like "Maintenance", "Malfunction", "Modification", "Note"), title, description (textarea).
- `created_at` is set automatically to `new Date().toISOString()` on create.
- On submit: insert or update, mark dirty, close.

### Step 10: Unsaved changes guard

In `App.svelte`, register a `beforeunload` handler:

```js
function handleBeforeUnload(e) {
  if ($isDirty) {
    e.preventDefault();
    e.returnValue = '';  // Required for Chrome
  }
}
window.addEventListener('beforeunload', handleBeforeUnload);
```

Clean up in `onDestroy`.

### Step 11: GitLab CI configuration (`.gitlab-ci.yml`)

GitLab Pages requires the artifact directory to be named `public/`. Set Vite's output directory to `public/` in `vite.config.js`:

```js
export default defineConfig({
  // ...
  build: {
    outDir: 'public',
  },
});
```

Add `public/` to `.gitignore` (it is build output, not source).

```yaml
image: node:20

pages:
  stage: deploy
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - public
  only:
    - main
```

**COOP/COEP headers:** Not required for this app. The in-memory `oo1` API does not use `SharedArrayBuffer` or web workers. The headers are set in the Vite dev server config only to suppress sqlite-wasm's console warnings when it probes for OPFS support at startup. GitLab Pages does not serve these headers, but that has no effect on functionality.

### Step 12: Styling (Tailwind CSS + design token theming)

This app uses **Tailwind CSS v4** with a centralized design token system. **All color and surface values are defined in one place** (`src/app.css`) so the app can be reskinned by editing a single file. Components reference semantic token names — never raw color values scattered across markup.

The full `vite.config.js` is defined in Step 1 — it already includes `tailwindcss()` in plugins and `publicDir: 'static'`.

#### Token system (`src/app.css`)

```css
@import "tailwindcss";

@theme {
  /* Surfaces — warm gray scale, no blue tint */
  --color-bg:            #1c1917;   /* stone-900 — app background */
  --color-surface:       #292524;   /* stone-800 — cards, panels */
  --color-surface-raised:#3c3836;   /* stone-700 — inputs, dropdowns */
  --color-border:        #57534e;   /* stone-600 — dividers, borders */

  /* Text */
  --color-text-primary:  #fafaf9;   /* stone-50 */
  --color-text-muted:    #a8a29e;   /* stone-400 */
  --color-text-inverse:  #1c1917;   /* for text on accent backgrounds */

  /* Accent — warm amber, no blue */
  --color-accent:        #d97706;   /* amber-600 */
  --color-accent-hover:  #b45309;   /* amber-700 */
  --color-accent-subtle: #451a03;   /* amber-950 — tinted backgrounds */

  /* State colors */
  --color-danger:        #dc2626;   /* red-600 */
  --color-danger-subtle: #450a0a;   /* red-950 */
  --color-warning:       #ca8a04;   /* yellow-600 */
  --color-success:       #65a30d;   /* lime-600 */
}
```

**Rule:** Components use `bg-[--color-surface]`, `text-[--color-text-primary]`, `border-[--color-border]` etc. — the semantic names, not `bg-stone-800`. To reskin the app, only `app.css` changes.

#### Responsive layout

The app must work on both mobile and desktop. The layout adapts:

- **Desktop (md+):** Fixed sidebar on the left (~240px), content area fills the rest. Full tables visible.
- **Mobile (<md):** Sidebar collapses. Navigation moves to a top bar with a hamburger menu or a bottom navigation bar. Tables may reflow to stacked card layout.

The exact mobile navigation pattern is an **open question** — see Open Questions section.

### Step 13: CLI (`cli/index.js` and `cli/fileAccess.js`)

The CLI is a first-class interface to the same database. It uses the same `src/lib/db.js` shared module for all queries. No Svelte, no browser APIs.

#### `cli/fileAccess.js`

Simple Node.js file I/O — the CLI equivalent of `src/lib/fileAccess.js`:

```js
import { readFileSync, writeFileSync } from 'fs';

export function openFile(path) {
  const bytes = new Uint8Array(readFileSync(path));
  return bytes;
}

export function saveFile(bytes, path) {
  writeFileSync(path, bytes);
}
```

#### `cli/index.js`

Uses `commander` for argument parsing. The shebang line at the top makes it executable:

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { initSqlite, openDatabase, createDatabase, exportDatabase } from '../src/lib/db.js';
import { openFile, saveFile } from './fileAccess.js';
import * as db from '../src/lib/db.js';

// ... command definitions below
```

**Initialization pattern:** Every command that needs the database must:
1. Call `initSqlite()` to initialize the WASM module (async, done once)
2. Call `openFile(dbPath)` to read the file bytes
3. Call `openDatabase(bytes)` to deserialize into memory
4. Run the operation
5. For mutations: call `exportDatabase(dbInstance)` and `saveFile(bytes, dbPath)` to write back

**Commands:**

```
fdb --db <path> firearms list [--json]
fdb --db <path> firearms show <id> [--json]
fdb --db <path> firearms add --name <n> --serial <s> [--manufacturer <m>] [--caliber <c>] [--price <p>] [--date <d>] [--ffl <f>] [--notes <n>]
fdb --db <path> firearms update <id> [--name <n>] [--notes <n>] [...]
fdb --db <path> firearms delete <id>

fdb --db <path> rounds list --firearm <id> [--json]
fdb --db <path> rounds add --firearm <id> --date <d> --rounds <n> [--notes <n>]
fdb --db <path> rounds update <id> [--rounds <n>] [--notes <n>]
fdb --db <path> rounds delete <id>

fdb --db <path> events list --firearm <id> [--json]
fdb --db <path> events add --firearm <id> --type <t> --title <t> [--date <d>] [--description <d>]
fdb --db <path> events update <id> [--title <t>] [--description <d>]
fdb --db <path> events delete <id>

fdb --db <path> documents list [--firearm <id>] [--json]
fdb --db <path> documents delete <id>
# Note: document upload (binary BLOBs) is supported via a file path argument:
fdb --db <path> documents add --file <filepath> --type <t> [--firearm <id>]
```

**Output formatting:**

- Default output: formatted table using `console.table` or a simple padded-column renderer
- `--json` flag: outputs raw JSON (useful for scripting: `fdb firearms list --json | jq '.[].name'`)
- Errors: written to stderr, exit code 1

**No build step:** `cli/index.js` runs directly with Node.js (`node cli/index.js` or `fdb` after `npm link`). It imports `src/lib/db.js` via a relative path. The `@sqlite.org/sqlite-wasm` package has a Node.js entry point that is used automatically when imported from Node — no Vite bundling required.

**One important gotcha:** `@sqlite.org/sqlite-wasm` locates its `.wasm` file relative to the JS file at runtime. In Node.js this works correctly from `node_modules`. In the browser, Vite handles asset resolution. Both work without manual configuration, but this should be verified early in development (see edge cases).

## UI Workflows

This section defines every screen and user flow. It is the reference for the implementation agent — all components must match these workflows.

---

### Workflow 1 — App launch and database selection

**Screen: Landing**

The full viewport. No sidebar. Centered content.

- App name/logo at top
- Two prominent action buttons:
  - **"Open database"** — opens file picker, loads existing `.db`
  - **"New database"** — creates a fresh schema in memory, goes straight to Firearms
- If the File System Access API is unavailable (Firefox), a browser-compatibility notice appears below the buttons explaining that saves will download a new file each time rather than overwriting in place
- On file open failure (corrupt file, wrong format): display an error — pattern TBD, see Open Questions
- No recent files list (stateless by design — no browser storage used)

**Transition:** Either action, on success, dismisses the landing and renders the main app shell.

---

### Workflow 2 — Main app shell

Persistent chrome once a database is open.

**Desktop layout:**
```
┌─────────────┬──────────────────────────────────────┐
│  Sidebar    │  Content area                        │
│             │                                      │
│  Firearms   │  (current view renders here)         │
│  Documents  │                                      │
│             │                                      │
│  [Save]     │                                      │
└─────────────┴──────────────────────────────────────┘
```

**Mobile layout:** Sidebar collapses — navigation pattern is an open question (see Open Questions). Save action remains accessible at all times.

**Sidebar contents:**
- Nav link: Firearms (default active)
- Nav link: Documents
- Divider
- **Save button** — always visible. When `isDirty` is true: accent color + visual pulse indicator. When clean: muted style.
- "Save As..." available as a secondary option (small link or dropdown under Save)
- If File System Access API is unavailable: small Firefox notice near the Save button

**Unsaved changes guard:** If the user attempts to close the tab or navigate away with `isDirty = true`, the browser shows its native "leave page?" dialog.

---

### Workflow 3 — Firearm Registry

**Screen: Firearm List** (default view after opening a database)

A table of all firearms.

| Column | Source |
|---|---|
| Name | `firearms.name` |
| Manufacturer | `firearms.manufacturer` |
| Caliber | `firearms.caliber` |
| Serial Number | `firearms.serial_number` |
| Total Rounds | `SUM(round_counts.rounds_fired)` — computed |
| Purchase Date | `firearms.purchase_date` |

- Clicking a row navigates to Firearm Detail for that firearm
- **"Add Firearm"** button above the table opens the add form
- Each row has an **Edit** icon/button and a **Delete** icon/button
- Delete requires confirmation — pattern TBD (see Open Questions)
- Empty state: "No firearms yet. Add your first firearm." with an "Add Firearm" button

**Form: Add / Edit Firearm** — presentation pattern TBD (see Open Questions)

Fields:
- Name (required)
- Serial Number (required, must be unique — show inline error on duplicate)
- Manufacturer
- Caliber
- Purchase Price
- Purchase Date (date picker)
- FFL Dealer
- Notes (textarea)

On submit: save, mark dirty, return to list (or detail if editing from detail view).

---

### Workflow 4 — Firearm Detail

**Screen: Firearm Detail**

Accessed by clicking a firearm row in the list.

**Header section** (always visible):
- Firearm name (large)
- Manufacturer · Caliber · Serial Number in a muted subtitle row
- Purchase date and FFL dealer if present
- Total round count (computed) displayed prominently
- **Edit** button — opens the firearm edit form
- **Back** link/button — returns to Firearm List

**Tabbed content area** with three tabs: **Round Counts**, **Events**, **Documents**

Default active tab: Round Counts.

---

### Workflow 5 — Round Count Tracking (tab within Firearm Detail)

**Tab: Round Counts**

Two sections stacked vertically:

**Section A — Chart**
- Chart.js line chart: X axis = date, Y axis = cumulative rounds fired
- Renders all sessions for this firearm as a running total over time
- Empty state: chart area shows "No rounds logged yet"

**Section B — Session log**
- **"Add Session"** button
- Table of shooting sessions:

| Column | Source |
|---|---|
| Date | `round_counts.date` |
| Rounds Fired | `round_counts.rounds_fired` |
| Notes | `round_counts.notes` |
| Actions | Edit / Delete |

- **Running total** displayed below the table: "Total: 1,450 rounds"
- **Edit** per row — opens edit form pre-populated with that session's data
- **Delete** per row — requires confirmation (pattern TBD, see Open Questions)
- Empty state: "No sessions logged yet. Add your first session."

**Form: Add / Edit Session** — presentation pattern TBD (see Open Questions)

Fields:
- Date (date picker, defaults to today)
- Rounds Fired (number, required, min 1)
- Notes (optional text)

On submit: save, mark dirty, refresh table and chart.

---

### Workflow 6 — Event Log (tab within Firearm Detail)

**Tab: Events**

- **"Add Event"** button
- List of events ordered by date descending (most recent first)
- Display as a table or card list — open question (see Open Questions)

| Column | Source |
|---|---|
| Date | `events.date` |
| Type | `events.event_type` (free text) |
| Title | `events.title` |
| Description | `events.description` (truncated if long) |
| Actions | Edit / Delete |

- **Edit** per row — opens edit form
- **Delete** per row — requires confirmation (pattern TBD)
- Empty state: "No events recorded yet."

**Form: Add / Edit Event** — presentation pattern TBD (see Open Questions)

Fields:
- Date (date picker, defaults to today)
- Event Type (free text input with datalist suggestions: "Maintenance", "Malfunction", "Modification", "Note")
- Title (required)
- Description (textarea, optional)
- `created_at` set automatically on create, not shown in form

On submit: save, mark dirty, refresh list.

---

### Workflow 7 — Documents (global view)

**Screen: Documents** (via sidebar nav)

All documents across all firearms.

- **"Upload Document"** button
- Table of all documents:

| Column | Source |
|---|---|
| Filename | `documents.filename` |
| Type | `documents.doc_type` |
| Uploaded | `documents.uploaded_at` |
| Associated Firearms | joined from `firearm_documents` — list of firearm names |
| Actions | View / Download / Delete |

- Filter/group by `doc_type` (FFL, Receipt, Manual, Other)
- **View** — opens Document Viewer (pattern TBD, see Open Questions)
- **Download** — triggers file download
- **Delete** — removes document and all `firearm_documents` associations, requires confirmation
- Empty state: "No documents uploaded yet."

---

### Workflow 8 — Documents (per-firearm tab within Firearm Detail)

**Tab: Documents** (inside Firearm Detail)

Same table as Workflow 7 but scoped to documents linked to this firearm only.

- **"Upload Document"** button — pre-associates the upload with this firearm
- **"Link existing document"** — allows associating an already-uploaded document with this firearm without re-uploading
- Same View / Download / Delete actions
- Delete here unlinks from this firearm only — does not delete the document globally unless it has no remaining associations (TBD decision — see Open Questions)

---

### Workflow 9 — Document Upload

**Form: Upload Document** — presentation pattern TBD (see Open Questions)

Fields:
- File picker (accept: `.pdf, image/*`) — required
- Document Type: select with options "FFL", "Receipt", "Manual", "Other" — or free text
- Firearm associations: multi-select list of all firearms (pre-selected if opened from a firearm's Documents tab)
- Notes (optional, stored in `firearm_documents.notes` per association)

On submit:
1. Read file as ArrayBuffer
2. Insert BLOB into `documents`
3. Insert rows into `firearm_documents` for each selected firearm
4. Mark dirty, close form, refresh document list

---

### Workflow 10 — Document Viewer

Opens when the user clicks "View" on a document.

- If `mime_type` starts with `image/`: render `<img>` with a Blob URL
- If `mime_type` is `application/pdf`: render `<iframe>` or `<embed>` with a Blob URL
- **Download** button always present
- Blob URLs revoked on close
- Viewer presentation pattern TBD (see Open Questions)

---

## Edge cases and risk areas

| Area | Risk | Mitigation |
|---|---|---|
| **Large `.db` files** | Documents stored as BLOBs can make the database very large (100+ MB). `sqlite3_deserialize` must allocate that much WASM memory. | The default WASM memory limit may need to be increased. Check `sqlite3InitModule` options for memory configuration. **Warn the user if the file exceeds 100MB** with a banner explaining that very large databases may be slow to save. |
| **`sqlite3_deserialize` flags** | Using `SQLITE_DESERIALIZE_RESIZEABLE` allows the database to grow after deserialization. Without it, any INSERT after opening will fail once the original buffer is full. | Always pass `SQLITE_DESERIALIZE_FREEONCLOSE \| SQLITE_DESERIALIZE_RESIZEABLE`. |
| **Firefox fallback for save** | The `<a download>` fallback triggers a browser download, not an in-place file save. The user gets a new file each time (potentially with `(1)`, `(2)` suffixes). | Document this limitation clearly. Consider showing a banner when the File System Access API is unavailable. |
| **UNIQUE constraint on serial_number** | The INSERT will throw. The error message from SQLite is cryptic. | Catch the error in `insertFirearm` / `updateFirearm` and translate it to a user-friendly message. |
| **Deleting a firearm with linked data** | Must delete related `round_counts`, `events`, and `firearm_documents` rows. `PRAGMA foreign_keys = ON` enables SQLite's built-in cascade, but only if `ON DELETE CASCADE` is in the schema -- and it is NOT in the provided schema. | The `deleteFirearm` function must explicitly delete from `round_counts`, `events`, and `firearm_documents` WHERE `firearm_id = ?` before deleting from `firearms`, all within a transaction. |
| **Deleting a document** | Must also delete from `firearm_documents`. | Same approach: delete from `firearm_documents` WHERE `document_id = ?` first, then from `documents`. |
| **Chart.js memory leaks** | Chart instances must be destroyed when the component unmounts or when data changes. | Use `onDestroy` to call `chart.destroy()`. When re-rendering, destroy before creating a new instance. |
| **WASM file serving** | Vite must correctly serve the `.wasm` file from `@sqlite.org/sqlite-wasm`. The `optimizeDeps.exclude` config should handle this, but verify during development. | Test early. If the WASM file is not found at runtime, check Vite's asset handling and consider copying it to `public/`. |
| **Date adapter for Chart.js** | Chart.js time scale requires a date adapter. Without it, the time axis will not render. | Install `chartjs-adapter-date-fns` and `date-fns`. Import the adapter before creating any chart. |
| **`beforeunload` reliability** | Mobile browsers and some desktop browsers may not show the custom message. The behavior is best-effort. | Acceptable limitation. The dirty flag is still valuable for the save button UI. |

## Testing approach

Since this is a static browser app with no backend, testing focuses on:

### Unit tests (Vitest)

- **`db.js` functions:** Test all query helpers against an actual in-memory SQLite database. These tests can run in Node.js with `@sqlite.org/sqlite-wasm` (or in a browser test runner if WASM loading is tricky in Node).
  - Create database, verify schema.
  - CRUD operations for all five tables.
  - Cascade delete behavior.
  - Unique constraint enforcement on `serial_number`.
  - `getCumulativeRounds` returns correct cumulative values.
  - Export/import round-trip: create a DB, insert data, export to bytes, import from bytes, verify data intact.

- **`fileAccess.js`:** Difficult to unit-test (depends on browser APIs). Focus on integration/manual testing.

### Component tests (optional, Svelte testing library)

- Verify form validation behavior.
- Verify that the landing screen transitions correctly.

### Manual testing checklist

- Open a fresh database, add a firearm, save, close, reopen -- data persists.
- Open an existing `.db` file created by a desktop SQLite tool.
- Upload a PDF and an image, view both inline.
- Add round counts, verify the chart renders correctly.
- Edit and delete a round count session, verify the chart and total update.
- Navigate away with unsaved changes -- browser warns.
- Test in Chrome (File System Access API) and Firefox (fallback path).
- Test with a large database (50+ MB) to verify memory handling.
- Test on a mobile viewport: all workflows accessible, forms usable, no horizontal scroll.

## Resolved decisions

1. **Svelte version:** Svelte 5 (runes: `$state`, `$derived`, `$effect`). State module uses `.svelte.js` extension.
2. **GitLab Pages artifact directory:** `public/` — Vite `build.outDir` set to `public`, added to `.gitignore`.
3. **CSS approach:** Tailwind CSS v4 with `@tailwindcss/vite` plugin and centralized design token theming.
4. **Default theme:** Warm gray/dark (stone/zinc palette, amber accent). No blue tints. All tokens in `app.css`.
5. **Maximum database size:** Warn at 100MB with a banner. No hard refusal.
6. **Chart.js date adapter:** `chartjs-adapter-date-fns` with `date-fns`.
7. **Slide-in panels:** Explicitly excluded. Forms are either modal overlays or inline — see open questions.
8. **Responsive:** App must work on mobile and desktop. Layout adapts at `md` breakpoint.

---

## Open Questions

> **These must be resolved before implementation begins.** Each question is marked with its impact scope.

---

### ❓ OQ-1 — Error handling patterns `[BLOCKER]`

What is the standard pattern for surfacing errors to the user?

Errors include: file open failure, duplicate serial number, failed save, corrupt database, unexpected JS exceptions.

Options:
- **Toast notifications** — small temporary banners that appear and auto-dismiss (e.g., top-right corner). Non-blocking, good for transient feedback.
- **Inline field errors** — validation errors shown beneath the offending field. Only applicable to form validation.
- **Modal error dialog** — a blocking overlay the user must dismiss. Appropriate for fatal errors (file corrupt, save failed).
- **Combination:** inline for form validation, toast for operation feedback (save success/failure), modal for fatal errors.

A decision here affects every component. Must be resolved before Step 5 onward.

---

### ❓ OQ-2 — Form presentation: modal overlay vs inline `[BLOCKER]`

How do add/edit forms appear? Applies to: Add Firearm, Edit Firearm, Add/Edit Round Count Session, Add/Edit Event, Upload Document.

Options:
- **Modal overlay** — a centered dialog with a dimmed backdrop. Keeps context visible behind the form. Standard for most CRUD apps. Works well on both mobile and desktop.
- **Inline expansion** — the form appears in-place within the list (accordion-style or replacing the row). Keeps the user in context without an overlay. Can feel cramped on mobile.

> Slide-in panels are explicitly excluded.

Must be resolved before Steps 6–9.

---

### ❓ OQ-3 — Mobile navigation pattern `[BLOCKER]`

On narrow screens the sidebar must collapse. What replaces it?

Options:
- **Top bar with hamburger menu** — sidebar slides in as an overlay when hamburger is tapped. Common on web apps.
- **Bottom navigation bar** — nav links move to a fixed bar at the bottom of the screen (iOS/Android app pattern). More thumb-friendly on mobile.
- **Top tab bar** — nav items displayed as tabs across the top.

Must be resolved before Step 5 (App shell).

---

### ❓ OQ-4 — Document viewer presentation `[BLOCKER]`

When the user clicks "View" on a document, how does it open?

Options:
- **Full-screen modal overlay** — document fills the viewport with a close button. Good for PDFs.
- **New browser tab** — open the Blob URL in a new tab. Simple, leverages the browser's native PDF viewer. No custom UI needed.
- **Embedded panel** — document renders inline below the document list. Less intrusive but limited space.

---

### ❓ OQ-5 — Confirmation dialog pattern `[BLOCKER]`

Delete actions (firearm, round count session, event, document) require confirmation. What pattern?

Options:
- **Native `window.confirm()`** — one line of code, no UI work, but looks inconsistent with the app design and is blocked by some browsers in certain contexts.
- **Custom modal dialog** — styled consistently with the app, can show consequences ("This will also delete 14 round count sessions and 3 events"). More work but better UX.

---

### ❓ OQ-8 — Schema migration strategy `[BLOCKER]`

The schema is fixed today, but the app will evolve. When a user opens a `.db` file created by an older version of the app, what happens if the schema has changed?

SQLite provides `PRAGMA user_version` as a built-in integer for tracking schema versions. Options:

- **No migration support** — schema is fixed forever. Any change requires a new database. Simple, but brittle long-term.
- **`PRAGMA user_version` + migration functions** — on open, check `user_version`. If lower than the current version, run upgrade SQL in sequence (e.g., `ALTER TABLE` to add columns). Write the new version number when done.
- **Fail loudly on mismatch** — if the opened file's `user_version` doesn't match, refuse to open it and tell the user to use the CLI to migrate.

This affects `db.js` architecture (the `openDatabase` function must check the version). Must be resolved before Step 2.

---

### ❓ OQ-9 — Date display and timezone handling `[BLOCKER]`

Dates are stored as ISO 8601 UTC strings. But shooting sessions and purchase dates are calendar dates in the user's local timezone — "I shot on April 4th" should not silently become April 3rd UTC.

Two separate sub-questions:

1. **Storage format for calendar dates:** Should date-only fields (`round_counts.date`, `events.date`, `firearms.purchase_date`) be stored as `YYYY-MM-DD` plain strings rather than full UTC timestamps? This avoids the timezone shift problem entirely for fields that represent a calendar day, not a moment in time.

2. **Display format:** How should dates be shown in the UI? Options: user's locale (`toLocaleDateString()`), a fixed format (`DD MMM YYYY`), or ISO (`YYYY-MM-DD`).

Must be resolved before Step 2 (schema notes) and Steps 6–9 (date pickers and display).

---

### ❓ OQ-10 — GitLab Pages deployment base path `[BLOCKER]`

If the app is deployed to a GitLab Pages subpath (e.g., `username.gitlab.io/fdb/` rather than a custom domain at root), Vite must be configured with `base: '/fdb/'` in `vite.config.js`. Without this, all asset URLs will be wrong and the app will fail to load.

Options:
- **Hardcode the base path** — set `base` in `vite.config.js` to the known subpath.
- **Use a CI environment variable** — set `VITE_BASE_PATH` in GitLab CI and read it in `vite.config.js` with `process.env.VITE_BASE_PATH ?? '/'`.
- **Deploy to a custom domain at root** — base path is always `/`, no config needed.

Must be resolved before Step 1 (Vite config) and Step 11 (CI config).

---

### ❓ OQ-11 — Browser support targets `[BLOCKER]`

What browsers must the app support? This affects:
- Whether Vite needs to include polyfills (`@vitejs/plugin-legacy`)
- Which CSS features can be used
- Whether `File System Access API` is expected to work (Chrome/Edge only — Firefox fallback is already planned)

Minimum viable targets to discuss: Chrome/Edge latest, Firefox latest, Safari latest. Older versions or IE are almost certainly out of scope, but should be confirmed.

Must be resolved before Step 1 (Vite config).

---

### ❓ OQ-6 — Document "unlink vs delete" from firearm tab `[NON-BLOCKER — decide during Step 8]`

When a user clicks Delete on a document from within a firearm's Documents tab, what happens?

- **Unlink only** — removes the `firearm_documents` association. Document remains in the global Documents list and can still be associated with other firearms.
- **Delete globally if last association** — if this was the only firearm the document was linked to, delete the document entirely.
- **Always unlink, never auto-delete** — user must go to the global Documents screen to delete a document permanently.

---

### ❓ OQ-7 — Events display: table vs cards `[NON-BLOCKER — decide during Step 9]`

The event log can be displayed as:
- **Table** — consistent with other list views. Compact. Works well when descriptions are short.
- **Card list** — each event is a card with more vertical space. Better for longer descriptions. More visual weight.

---

### ❓ OQ-12 — List sorting and filtering `[NON-BLOCKER — decide during Steps 6–9]`

Can users sort or filter the main lists? Not currently specified.

- **Firearms list:** sortable by name, caliber, purchase date, total rounds? Searchable by name or serial number?
- **Round counts:** always sorted by date — should the user be able to reverse the order?
- **Events:** sorted by date descending — should the user be able to filter by event type?
- **Documents:** filterable by `doc_type` (already mentioned) — should the user be able to search by filename?

None of this requires schema changes, but affects component complexity.

---

### ❓ OQ-13 — Close / switch database workflow `[NON-BLOCKER — decide during Step 5]`

The app opens one file at a time. Is there a way to close the current database and return to the Landing screen to open a different one? Or does the user have to reload the page?

If supported: a "Close database" option should appear in the sidebar. If there are unsaved changes, prompt first.

---

### ❓ OQ-14 — Data export `[NON-BLOCKER]`

Beyond saving the `.db` file, should users be able to export data in other formats?

- **CSV export** — export firearms list, round count history, or event log as CSV. Useful for spreadsheets and insurance documentation.
- **Print view** — a print-friendly summary of a firearm's record.
- **No export** — the `.db` file is the export; users can open it with any SQLite tool.

Not required for v1, but worth deciding so it doesn't get designed out.

---

### ❓ OQ-15 — Accessibility requirements `[NON-BLOCKER]`

What level of accessibility is required?

- Keyboard navigation through all forms and lists?
- ARIA labels on interactive elements?
- Screen reader compatibility?
- Color contrast compliance (WCAG AA)?

The warm dark theme should be checked for contrast ratios on text/background combinations regardless.

---

### ❓ OQ-16 — CLI default database path and environment variable `[NON-BLOCKER — decide during Step 13]`

Should the CLI support a default database path so users don't have to type `--db ~/firearms.db` on every command?

Options:
- **Always require `--db`** — explicit, no ambiguity.
- **`FDB_DB` environment variable** — if set, used as the default. `--db` overrides it. Users add `export FDB_DB=~/firearms.db` to their shell profile.
- **Config file** — `~/.fdbrc` or similar. More complex.

---

### ❓ OQ-17 — Document type: fixed options vs free text `[NON-BLOCKER — decide during Step 8]`

The upload form currently proposes fixed options ("FFL", "Receipt", "Manual", "Other"). The schema stores `doc_type` as free text with no constraint.

- **Fixed select** — predictable, filterable, consistent. But inflexible if users have other document types.
- **Fixed options + free text fallback** — select with an "Other (specify)" option that reveals a text input.
- **Fully free text with suggestions** — same pattern as event types: a text input with a `<datalist>` of suggested values.

---

### ❓ OQ-18 — Linting and code style tooling `[NON-BLOCKER — decide during Step 1]`

Should the project include:
- **ESLint** — catch JS/Svelte errors and enforce style rules
- **Prettier** — auto-format on save
- **Both** — standard combination; Prettier handles formatting, ESLint handles logic rules

Affects `package.json` and project scaffolding. No functional impact but affects developer experience and CI.

---

### ❓ OQ-19 — App title and favicon `[NON-BLOCKER — decide during Step 1]`

- What text appears in the browser tab? Options: "Firearm Tracker", "FDB", or dynamic (e.g., "Firearm Tracker — firearms.db" once a file is open).
- Is there a custom favicon, or the browser default?

---
