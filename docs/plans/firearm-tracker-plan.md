# Firearm Tracker -- Master Design Document

> This is the architectural reference. Implementation is split across three phase plans:
> - [Phase 1 — Schema + CLI](phase1-cli-plan.md)
> - [Phase 2 — Web Application](phase2-web-plan.md)
> - [Phase 3 — E2E Testing](phase3-e2e-plan.md)

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

**Date storage:** All date/time values are stored as UTC epoch milliseconds (`INTEGER`). The UI converts these to the user's local timezone for display, formatted using `toLocaleDateString()` / `toLocaleString()` with the browser's locale. Date pickers collect a local date/time and convert to UTC epoch before writing. This avoids timezone-shift bugs where a calendar date (e.g. "April 4th") silently becomes the prior day in UTC.

```sql
CREATE TABLE firearms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    serial_number   TEXT UNIQUE NOT NULL,
    manufacturer    TEXT,
    caliber         TEXT,
    purchase_price  REAL,
    purchase_date   INTEGER,
    ffl_dealer      TEXT,
    notes           TEXT
);

CREATE TABLE round_counts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    firearm_id      INTEGER NOT NULL,
    date            INTEGER NOT NULL,
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
    uploaded_at INTEGER NOT NULL
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
    date        INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (firearm_id) REFERENCES firearms(id)
);

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Seeded on database creation:
-- INSERT INTO meta (key, value) VALUES ('schema_version', '1');
```

**Notes on the schema:**
- `ON DELETE CASCADE` is intentionally absent. `deleteFirearm()` and `deleteDocument()` in `db.js` must manually delete related rows in a transaction (see Step 2).
- `event_type` is free text — new event types can be added without schema changes.
- `doc_type` is free text — document types are freeform, no fixed enum.
- `firearm_documents` is a many-to-many join: one document can be associated with multiple firearms (e.g. a single FFL covering a multi-firearm purchase).
- `round_counts` stores individual sessions. Total round counts are always computed dynamically via `SUM()` — never stored.
- All date/time columns are `INTEGER` (UTC epoch milliseconds). See date storage note above.
- `meta` stores application-level key/value pairs. The only key at schema version 1 is `schema_version`. Future migrations increment this value and alter tables as needed.

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
| `src/lib/strings.js` | **YES** | All user-facing strings: empty states, errors, confirmations, toasts, chart labels, titles — imported by both browser components and CLI |
| `src/lib/db.js` | **YES** | SQLite init, schema, deserialize/serialize, all query helpers — no browser or Node deps |
| `src/lib/fileAccess.js` | No | Browser: File System Access API + Firefox fallbacks |
| `src/lib/stores.svelte.js` | No | Browser only: Svelte 5 runes for app state |
| `src/main.js` | No | Mounts Svelte `App` component |
| `src/App.svelte` | No | Top-level layout |
| `src/components/**/*.svelte` | No | All UI components |
| `cli/index.js` | No | CLI entry point: commander, argument parsing, output formatting |
| `cli/fileAccess.js` | No | Node: `fs.readFileSync` / `fs.writeFileSync` |

## Step-by-step implementation

The implementation is split into two phases. Phase 1 builds the CLI as a standalone proof of concept to validate the data model before any browser UI is written. Phase 2 builds the browser UI on top of the already-validated shared `db.js`.

---

## Phase 1 — Data model and CLI (proof of concept)

**Goal:** A working `fdb` CLI that can create a database, add/edit/delete all record types, and read them back. No browser, no Svelte, no Tailwind. At the end of Phase 1, the schema and all query logic are verified against a real SQLite file.

---

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
- `eslint` (dev)
- `eslint-plugin-svelte` (dev)
- `prettier` (dev)
- `prettier-plugin-svelte` (dev)
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
    "preview": "vite preview",
    "lint": "eslint src cli",
    "format": "prettier --write src cli"
  },
  "bin": {
    "fdb": "./cli/index.js"
  }
}
```

Add `.eslintrc.js` (or `eslint.config.js` for flat config) with `eslint-plugin-svelte` and `.prettierrc` to the project root. Auto-format runs on `npm run format`; linting runs on `npm run lint` and in CI.

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
  base: process.env.VITE_BASE_PATH ?? '/',  // Set via CI variable for subpath deployments
  publicDir: 'static',                       // Avoid conflict with public/ build output
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
  <title>FDB</title>
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

**Schema version constant:**
Define `CURRENT_SCHEMA_VERSION = 1` at the top of `db.js`. Increment this whenever the schema changes and add a corresponding migration function.

**Creating a new database:**
1. Call `new sqlite3.oo1.DB(':memory:')` to create a fresh in-memory database.
2. Run the schema SQL (all six `CREATE TABLE` statements, including `meta`) via `db.exec()`.
3. Insert `('schema_version', '1')` into `meta`.
4. Return the `db` instance.

**Opening an existing database from a `Uint8Array`:**
1. Create a new in-memory DB: `new sqlite3.oo1.DB(':memory:')`.
2. Allocate WASM memory from the byte array: `const p = sqlite3.wasm.allocFromTypedArray(bytes)`.
3. Call `sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.byteLength, bytes.byteLength, SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE)`.
4. Check the return code with `db.checkRc(rc)`.
5. Read `schema_version` from `meta`. If the table doesn't exist (database predates versioning), treat version as `0`.
6. If `schema_version < CURRENT_SCHEMA_VERSION`, run each migration function in sequence inside a transaction. Update `meta` after each step.
7. Return the `db` instance.

**Date helpers:**
Export two utility functions used everywhere dates are read or written:
- `toEpoch(localDateString)` — converts a date string from a date picker (local time) to UTC epoch milliseconds: `new Date(localDateString).getTime()`
- `fromEpoch(ms)` — converts UTC epoch milliseconds to a display string: `new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })` (browser locale, user's timezone)

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

### Step 3: CLI file access (`cli/fileAccess.js`)

Node.js file I/O — the CLI equivalent of the browser's File System Access API. Simple and synchronous.

```js
import { readFileSync, writeFileSync } from 'fs';

export function openFile(path) {
  return new Uint8Array(readFileSync(path));
}

export function saveFile(bytes, path) {
  writeFileSync(path, bytes);
}
```

### Step 4: CLI (`cli/index.js`)

See the full CLI specification in the original Step 13 content below. At the end of this step, run through the manual validation checklist:

- `fdb --db test.db firearms add ...` creates a record
- `fdb --db test.db firearms list` returns it
- `fdb --db test.db rounds add ...` / `list` / `update` / `delete` all work
- `fdb --db test.db events add ...` / `list` / `update` / `delete` all work
- `fdb --db test.db documents add --file ./test.pdf ...` stores a BLOB
- `fdb --db test.db documents list` shows it
- `fdb --db test.db firearms delete <id>` removes the firearm and all linked rows
- Open `test.db` with an external SQLite tool and verify the schema and data look correct
- Create a second database, verify `schema_version` is `1` in `meta`

---

## Phase 2 — Browser UI

**Goal:** A fully functional browser app built on top of the validated `db.js`. Phase 1 must be complete before Phase 2 begins.

---

### Step 5: Browser file access (`src/lib/fileAccess.js`)

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

### Step 6: Svelte app state (`src/lib/stores.svelte.js`) — browser only

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

### Step 7: Styling setup (Tailwind CSS + design tokens)

Install Tailwind and establish the design token system before writing any components. All subsequent browser components depend on this being in place.

See the full styling specification in the original Step 12 content. At the end of this step: run `npm run dev` and verify the app loads with the correct background color (`--color-bg`) applied to `<body>`.

### Step 8: Root component and navigation (`App.svelte`, `Sidebar.svelte`, `Landing.svelte`, `Toast.svelte`, `ConfirmModal.svelte`)

**`App.svelte`:**
- Subscribes to `currentView` and `dbInstance`.
- If `dbInstance` is null, renders `<Landing />`.
- If `dbInstance` is set, renders a two-column layout: `<Sidebar />` on the left, content area on the right.
- The content area switches on `currentView`: `'firearms'` -> `<FirearmList />`, `'firearm-detail'` -> `<FirearmDetail />`, `'documents'` -> `<DocumentList />`.
- Renders `<Toast />` and `<ConfirmModal />` at the top level (outside the layout) so they overlay everything.
- Registers a `beforeunload` event listener that checks `$isDirty` and shows a browser-native "unsaved changes" warning if true.
- Reactively updates `document.title`: `"FDB"` when no database is open; `"FDB — <filename>"` once a file is open (filename derived from `fileHandle.name` or a fallback of `"unsaved"` for new databases).

**`Toast.svelte` (error/feedback system):**

Three tiers of feedback — all driven from a `toasts` array in `stores.svelte.js`:
- **Inline field errors** — not a toast; rendered beneath the offending input inside each form component.
- **Toast notifications** — for operation feedback (save success, save failed, round count added, etc.). Small banner, top-right corner, auto-dismiss after ~4 seconds. Accent color for success, red for error. `Toast.svelte` maps over the `toasts` store array and renders each one. Export `showToast(message, type)` from `stores.svelte.js` to push a toast.
- **Modal error dialog** — for fatal errors only (corrupt file, failed to open, unrecoverable exception). Uses `ConfirmModal.svelte` in error mode (no cancel button, just "OK").

**`ConfirmModal.svelte` (confirmation + fatal error dialog):**

Reusable modal component driven from `stores.svelte.js`. Two modes:
- **Confirm mode** — title, message, "Cancel" + "Confirm" (danger-styled) buttons. Used for all delete confirmations. Shows consequences where relevant (e.g. "This will also remove 14 round count entries and 3 events.").
- **Error mode** — title, message, "OK" button only. Used for fatal errors.

Export `showConfirm({ title, message, onConfirm })` and `showError({ title, message })` from `stores.svelte.js`.

**`Sidebar.svelte`:**
- **Desktop:** fixed left sidebar with nav links (Firearms, Documents), divider, Save button.
- **Mobile:** hidden. A hamburger button in a top bar opens the sidebar as an overlay (fixed position, full height, z-indexed above content). Tapping outside or a nav link closes it.
- `<SaveButton />` component embedded in the sidebar.
- Clicking a nav link sets `currentView`, clears `selectedFirearmId`, closes mobile sidebar overlay.

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

### Step 9: Firearm Registry (`firearms/` components)

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

### Step 10: Round Count Tracking (`rounds/` components)

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

### Step 11: Document Management (`documents/` components)

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

### Step 12: Event Log (`events/` components)

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

### Step 13: Unsaved changes guard

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

### Step 14: GitLab CI configuration (`.gitlab-ci.yml`)

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

variables:
  VITE_BASE_PATH: "/"   # Override in GitLab CI/CD settings for subpath deployments
                         # e.g. set to "/fdb/" if serving at username.gitlab.io/fdb/

pages:
  stage: deploy
  script:
    - npm ci
    - npm run lint
    - npm run build
  artifacts:
    paths:
      - public
  only:
    - main
```

Set `VITE_BASE_PATH` as a CI/CD variable in the GitLab project settings (Settings → CI/CD → Variables) rather than hardcoding it in the file. The default `/` works for custom domains at root.

**COOP/COEP headers:** Not required for this app. The in-memory `oo1` API does not use `SharedArrayBuffer` or web workers. The headers are set in the Vite dev server config only to suppress sqlite-wasm's console warnings when it probes for OPFS support at startup. GitLab Pages does not serve these headers, but that has no effect on functionality.

### Step 7 detail: Styling (Tailwind CSS + design token theming)

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

Mobile navigation: hamburger menu in a top bar (see Step 8).

### Step 4 detail: CLI (`cli/index.js`)

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

**Config file (`~/.fdbrc` or `~/.config/fdb/config.json`):**

The CLI loads defaults from a config file before applying CLI flags. Any CLI flag overrides the config. Supported config keys:
- `db` — default database path (e.g. `~/firearms.db`)

Resolution order (highest priority first): CLI flag → config file → no default (error if required).

`cli/index.js` reads the config file on startup using `fs.existsSync` + `JSON.parse`. If the file doesn't exist, silently skip. If it exists but is malformed JSON, print a warning to stderr and continue without defaults.

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
- Delete requires confirmation via `ConfirmModal` showing how many round count entries and events will also be deleted
- **Sortable columns:** Name, Caliber, Purchase Date, Total Rounds. Click a column header to sort ascending; click again for descending. Default sort: Name ascending. No filtering in v1.
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
7. **Slide-in panels:** Explicitly excluded.
8. **Responsive:** App must work on mobile and desktop. Layout adapts at `md` breakpoint.
9. **Error handling (OQ-1):** Inline field errors for form validation. Toast notifications for operation feedback (save, mutations). Custom modal dialog for fatal errors.
10. **Form presentation (OQ-2):** Modal overlay for all add/edit forms.
11. **Mobile navigation (OQ-3):** Hamburger menu in a top bar. Sidebar opens as a full-height overlay.
12. **Document viewer (OQ-4):** Opens in a new browser tab via Blob URL.
13. **Confirmation dialogs (OQ-5):** Custom modal (`ConfirmModal.svelte`), shows consequences for destructive operations.
14. **Document unlink vs delete (OQ-6):** Unlink only from firearm tab. Never auto-delete. Global delete only from the Documents screen.
15. **Events display (OQ-7):** Table.
16. **Schema migration (OQ-8):** `meta` table stores `schema_version`. `openDatabase()` checks version and runs migrations in sequence.
17. **Date storage and display (OQ-9):** Stored as UTC epoch milliseconds (`INTEGER`). Displayed in user's local timezone using browser locale (`toLocaleDateString()`).
18. **GitLab Pages base path (OQ-10):** `VITE_BASE_PATH` CI variable. Defaults to `/`.
19. **Browser support (OQ-11):** Chrome (latest). Firefox fallback for file save only.
20. **List sorting (OQ-12):** Firearms list sortable by Name, Caliber, Purchase Date, Total Rounds. Default: Name ascending. No filtering in v1.
21. **Close/switch database (OQ-13):** Not in v1.
22. **Data export (OQ-14):** Not in v1.
23. **Accessibility (OQ-15):** Minimum viable — semantic HTML, keyboard-navigable forms. No full WCAG audit in v1.
24. **CLI config file (OQ-16):** `~/.fdbrc` JSON config for defaults (e.g. `db` path). CLI flags override config.
25. **Document type (OQ-17):** Freeform text input.
26. **Linting and formatting (OQ-18):** ESLint + Prettier. `npm run lint` and `npm run format`. Both run in CI.
27. **App title and favicon (OQ-19):** Title is dynamic — `"FDB"` on the landing screen, `"FDB — <filename>"` once a database is open. `App.svelte` updates `document.title` reactively when `fileHandle` or the filename changes. Favicon: browser default for v1.

---

## Open Questions

> All questions resolved. No blockers remain — implementation can begin.
