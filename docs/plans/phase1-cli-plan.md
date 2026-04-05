# Phase 1 — Schema + CLI

> **Prerequisite:** Read the [Master Design Document](firearm-tracker-plan.md) before starting.
> **Next phase:** [Phase 2 — Web Application](phase2-web-plan.md)

## Goal

Build and validate the data model using the CLI as a proof of concept. At the end of this phase, `fdb` is a working command-line tool that can create a database, perform all CRUD operations on all record types, and read data back correctly. No browser, no Svelte, no UI.

The browser app in Phase 2 is built on top of this validated foundation.

---

## Steps

### Step 1: Project scaffolding

Create the project skeleton. All configuration files, no application code yet.

**`package.json`**

```json
{
  "name": "fdb",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint src cli",
    "format": "prettier --write src cli"
  },
  "bin": {
    "fdb": "./cli/index.js"
  }
}
```

**`src/lib/strings.js`** — created here, used throughout Phase 1 and Phase 2. Single source of truth for every user-facing string: empty states, validation errors, confirmation messages, toast messages, CLI output strings, and chart format strings. Both browser components and CLI import from this file.

```js
export const strings = {
  empty: {
    firearms:  'No firearms yet.',
    rounds:    'No sessions logged yet.',
    events:    'No events recorded yet.',
    documents: 'No documents.',
  },
  errors: {
    duplicateSerial:    'A firearm with this serial number already exists.',
    nameRequired:       'Name is required.',
    serialRequired:     'Serial number is required.',
    titleRequired:      'Title is required.',
    roundsMin:          'Rounds fired must be at least 1.',
    fileRequired:       'Please select a file.',
    fatalOpen:          'Could not open database. The file may be corrupt or not a valid SQLite database.',
    missingDb:          'No database specified. Use --db <path> or set "db" in ~/.fdbrc.',
    configMalformed:    'Warning: ~/.fdbrc could not be parsed as JSON. Ignoring config defaults.',
  },
  confirm: {
    deleteFirearm: (rounds, events, docs) =>
      `This will permanently delete ${rounds} round count session${rounds !== 1 ? 's' : ''} and ${events} event${events !== 1 ? 's' : ''}, and unlink ${docs} document${docs !== 1 ? 's' : ''}. This cannot be undone.`,
    deleteRound:    'Delete this round count session? This cannot be undone.',
    deleteEvent:    'Delete this event? This cannot be undone.',
    deleteDocument: 'Delete this document? It will be removed from all associated firearms. This cannot be undone.',
    unlinkDocument: 'Unlink this document from this firearm? The document will remain in your library.',
  },
  toasts: {
    saved:            'Database saved.',
    firearmAdded:     'Firearm added.',
    firearmUpdated:   'Firearm updated.',
    firearmDeleted:   'Firearm deleted.',
    roundAdded:       'Session added.',
    roundUpdated:     'Session updated.',
    roundDeleted:     'Session deleted.',
    eventAdded:       'Event added.',
    eventUpdated:     'Event updated.',
    eventDeleted:     'Event deleted.',
    documentUploaded: 'Document uploaded.',
    documentDeleted:  'Document deleted.',
    documentUnlinked: 'Document unlinked.',
  },
  chart: {
    // date-fns format string for chartjs-adapter-date-fns axis labels.
    // Separate from fromEpoch(), which uses toLocaleDateString() for table/UI display.
    dateFormat:  'MMM d, yyyy',
    noDataLabel: 'No rounds logged yet.',
    yAxisLabel:  'Cumulative Rounds',
  },
  firefox: {
    saveWarning: 'Your browser does not support in-place file saving. Each save will download a new copy of your database.',
  },
  titles: {
    base:       'FDB',
    withFile:   (filename) => `FDB — ${filename}`,
    unsaved:    'FDB — unsaved',
  },
};
```

**Dependencies to install:**
- `svelte` (dev)
- `@sveltejs/vite-plugin-svelte` (dev)
- `vite` (dev)
- `vitest` (dev)
- `@vitest/coverage-v8` (dev)
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
- `commander`

**`.gitignore`**

```
node_modules/
public/
coverage/
```

**`vite.config.js`**

```js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

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
});
```

**`vitest.config.js`**

Multi-project config created here so Phase 2 can activate the component and browser projects without replacing this file.

```js
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  test: {
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
});
```

**`.eslintrc.js`** and **`.prettierrc`** — add standard configs for JS/Svelte. Prettier: single quotes, no semicolons, 2-space indent.

**`index.html`** — standard Vite shell with `<div id="app">` and `<title>FDB</title>`. Needed for Phase 2 but created now.

**`src/main.js`** — minimal Svelte mount stub. Needed for Vite to resolve; fleshed out in Phase 2.

**Tests:**

No functional tests at this step. Verify:
- `npm install` succeeds
- `npm run test:run` exits 0 (0 tests, no errors)
- `npm run lint` exits 0
- `node cli/index.js --help` (once Step 4 is done) — placeholder until then

---

### Step 2: SQLite module (`src/lib/db.js`)

The most critical file in the project. Shared between the browser and CLI. Zero dependencies on browser APIs, Svelte, or Node built-ins.

**Key constants:**

```js
export const CURRENT_SCHEMA_VERSION = 1;

// Migration functions indexed by the version they upgrade TO.
// To add a migration: append a function to this array and increment
// CURRENT_SCHEMA_VERSION. Entry at index 0 upgrades from v0 → v1, etc.
// Currently empty — no migrations exist for v1.
const MIGRATIONS = [
  // async (db) => { /* upgrade from v0 to v1 */ }
];
```

**Schema SQL (constant string):**

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
```

**`initSqlite()`** — initializes the WASM module. **Singleton pattern** — caches the result in a module-level variable and returns the cached instance immediately on subsequent calls. This matters for tests (which call many db functions in a single Node process) and the browser (where the function may be referenced from multiple components).

```js
let _sqlite3 = null;
export async function initSqlite() {
  if (_sqlite3) return _sqlite3;
  _sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  return _sqlite3;
}
```

The `print`/`printErr` suppressors silence sqlite-wasm's console output in production. Remove them during debugging if needed.

**`createDatabase()`** — creates a fresh in-memory DB, runs schema SQL, seeds `meta` with `schema_version = '1'`. Returns `db` instance.

**`openDatabase(bytes)`** — deserializes a `Uint8Array` into memory using `sqlite3_deserialize` with `SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE`. Reads `schema_version` from `meta` (treats missing `meta` table as version 0). Runs any pending migrations from the `MIGRATIONS` array inside a single transaction, then updates `schema_version`. Since `MIGRATIONS` is currently empty and `CURRENT_SCHEMA_VERSION` is 1, a v1 database passes through without modification. Returns `db` instance.

**`exportDatabase(db)`** — returns `Uint8Array` via `sqlite3_js_db_export`.

**Date utilities:**

```js
export function toEpoch(value) {
  // Accepts a Date object, ISO string, or epoch ms integer
  return new Date(value).getTime();
}

export function fromEpoch(ms) {
  // Returns locale-formatted date string for display in browser UI and CLI table output.
  // Intentionally separate from strings.chart.dateFormat, which is a date-fns format string
  // consumed by chartjs-adapter-date-fns — a different rendering path entirely.
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
```

**Query helpers** — all accept `db` as first argument:

- `getAllFirearms(db)` — LEFT JOIN with SUM of round_counts, ORDER BY name
- `getFirearm(db, id)`
- `insertFirearm(db, data)` — returns inserted id
- `updateFirearm(db, id, data)`
- `deleteFirearm(db, id)` — transaction: delete from `firearm_documents`, `events`, `round_counts`, then `firearms`
- `getRoundCounts(db, firearmId)` — ORDER BY date ASC
- `insertRoundCount(db, data)` — returns inserted id
- `updateRoundCount(db, id, data)`
- `deleteRoundCount(db, id)`
- `getCumulativeRounds(db, firearmId)` — window function: `SUM(rounds_fired) OVER (ORDER BY date)`, returns `[{date, cumulative}]`
- `getEvents(db, firearmId)` — ORDER BY date DESC
- `insertEvent(db, data)` — sets `created_at` to `Date.now()`
- `updateEvent(db, id, data)`
- `deleteEvent(db, id)`
- `getAllDocuments(db)`
- `getDocumentsForFirearm(db, firearmId)` — JOIN through `firearm_documents`
- `insertDocument(db, { filename, fileData, mimeType, docType })` — `fileData` is `Uint8Array`
- `linkDocumentToFirearm(db, docId, firearmId, notes)`
- `unlinkDocumentFromFirearm(db, docId, firearmId)`
- `getDocumentBlob(db, id)` — returns `{ file_data, mime_type, filename }`
- `deleteDocument(db, id)` — transaction: delete from `firearm_documents`, then `documents`

**Tests (`tests/node/db.test.js`):**

```
createDatabase()
  ✓ creates all 6 tables
  ✓ seeds meta with schema_version = '1'

insertFirearm / getFirearm
  ✓ round-trip: inserted data matches retrieved data
  ✓ returns null for unknown id

updateFirearm
  ✓ persists changed fields
  ✓ does not affect other records

deleteFirearm
  ✓ removes the firearm record
  ✓ removes all linked round_counts in the same transaction
  ✓ removes all linked events in the same transaction
  ✓ removes all linked firearm_documents in the same transaction

serial_number uniqueness
  ✓ inserting duplicate serial throws a constraint error
  ✓ error message is detectable as a UNIQUE constraint violation

getAllFirearms
  ✓ returns total_rounds = 0 when no sessions logged
  ✓ returns correct SUM of rounds across multiple sessions
  ✓ results are ordered by name ascending

getRoundCounts / insertRoundCount
  ✓ round-trip: inserted data matches retrieved data
  ✓ results ordered by date ascending

updateRoundCount / deleteRoundCount
  ✓ update persists changes
  ✓ delete removes the record

getCumulativeRounds
  ✓ single session: cumulative equals rounds_fired
  ✓ multiple sessions: cumulative is a running total in date order
  ✓ returns empty array when no sessions

getEvents / insertEvent
  ✓ round-trip: inserted data matches retrieved data
  ✓ created_at is set automatically
  ✓ results ordered by date descending

updateEvent / deleteEvent
  ✓ update persists changes
  ✓ delete removes the record

insertDocument / getDocumentBlob
  ✓ stored BLOB bytes match retrieved bytes exactly
  ✓ mime_type and filename are preserved

linkDocumentToFirearm / unlinkDocumentFromFirearm
  ✓ link makes document appear in getDocumentsForFirearm
  ✓ unlink removes it from getDocumentsForFirearm
  ✓ document still exists in getAllDocuments after unlink

deleteDocument
  ✓ removes the document record
  ✓ removes all firearm_documents rows in the same transaction

export / import round-trip
  ✓ export → re-import → all firearms, rounds, events, documents intact

openDatabase — schema migration
  ✓ database with no meta table is treated as version 0
  ✓ migrations run in sequence to reach CURRENT_SCHEMA_VERSION
  ✓ schema_version in meta equals CURRENT_SCHEMA_VERSION after migration

toEpoch / fromEpoch
  ✓ toEpoch(new Date('2026-04-04')) returns correct ms
  ✓ fromEpoch(toEpoch(date)) returns a non-empty display string
```

---

### Step 3: CLI file access (`cli/fileAccess.js`)

```js
import { readFileSync, writeFileSync } from 'fs';

export function openFile(path) {
  return new Uint8Array(readFileSync(path));
}

export function saveFile(bytes, path) {
  writeFileSync(path, bytes);
}
```

**Tests (`tests/node/cli-fileAccess.test.js`):**

```
saveFile / openFile
  ✓ bytes written by saveFile are returned identically by openFile
  ✓ saveFile overwrites an existing file without error
  ✓ openFile on a non-existent path throws

round-trip with db
  ✓ createDatabase → exportDatabase → saveFile → openFile → openDatabase preserves all data
```

---

### Step 4: CLI (`cli/index.js`)

Uses `commander` for argument parsing. Shebang: `#!/usr/bin/env node`.

**Strings** — import all output strings from `src/lib/strings.js`. No string literals in `cli/index.js` except structural formatting characters.

**Config file loading** — on startup, before parsing args:
1. Check `~/.fdbrc` (JSON). If present, load defaults. If malformed, print `strings.errors.configMalformed` to stderr and continue with no defaults.
2. CLI flags override config values.
3. If `--db` is not provided and no config default, exit 1 printing `strings.errors.missingDb` to stderr.

**Date format rules:**
- **Input (`--date`):** ISO 8601 date string (`YYYY-MM-DD`). Parsed as local calendar date using `new Date(year, month-1, day)` — never `new Date(isoString)` which would parse as UTC midnight and silently shift by timezone. Stored internally as UTC epoch milliseconds via `toEpoch()`.
- **Output (default):** ISO 8601 date string (`YYYY-MM-DD`) via `fromEpoch()`.
- **Output (optional `--date-format <format>`):** Accepts a [`date-fns` format string](https://date-fns.org/docs/format) controlling how date fields are rendered. Default: `yyyy-MM-dd`. Example: `fdb rounds list --firearm 1 --date-format 'MM/dd/yyyy'`. The flag is silently ignored when the requested output contains no date fields.

**NULL rendering:** Fields with no value are rendered as `NULL` in table output and `null` in JSON output (standard JSON null, not the string `"null"`).

**Initialization pattern** for every command:

```js
await initSqlite();
const bytes = openFile(dbPath);
const db = await openDatabase(bytes);
// ... run operation ...
// for mutations:
const out = exportDatabase(db);
saveFile(out, dbPath);
```

**Commands:**

```
fdb --db <path> firearms list [--json]
fdb --db <path> firearms show <id> [--json]
fdb --db <path> firearms add --name <n> --serial <s> [--manufacturer <m>]
    [--caliber <c>] [--price <p>] [--date <d>] [--ffl <f>] [--notes <n>]
fdb --db <path> firearms update <id> [field flags...]
fdb --db <path> firearms delete <id>

fdb --db <path> rounds list --firearm <id> [--json]
fdb --db <path> rounds add --firearm <id> --date <d> --rounds <n> [--notes <n>]
fdb --db <path> rounds update <id> [--rounds <n>] [--date <d>] [--notes <n>]
fdb --db <path> rounds delete <id>

fdb --db <path> events list --firearm <id> [--json]
fdb --db <path> events add --firearm <id> --type <t> --title <t>
    [--date <d>] [--description <d>]
fdb --db <path> events update <id> [--type <t>] [--title <t>] [--description <d>]
fdb --db <path> events delete <id>

fdb --db <path> documents list [--firearm <id>] [--json]
fdb --db <path> documents add --file <filepath> --type <t> [--firearm <id>]
fdb --db <path> documents delete <id>
```

**Output:**
- Default: padded-column table. Null values render as `NULL`. Columns match the database fields for that record type — no computed fields (e.g. `total_rounds` is not included in `firearms list`; use `rounds list --firearm <id>` and sum manually or via `--json | jq`).
- `--json`: raw JSON array. Dates output using the `--date-format` format string (default `yyyy-MM-dd`). Null values as JSON `null`.
- Errors: written to stderr, exit code 1.

**Firearm list columns:** `id`, `name`, `serial_number`, `manufacturer`, `caliber`, `purchase_price`, `purchase_date`, `ffl_dealer`, `notes`
**Round count list columns:** `id`, `firearm_id`, `date`, `rounds_fired`, `notes`
**Event list columns:** `id`, `firearm_id`, `event_type`, `date`, `title`, `description`, `created_at`
**Document list columns:** `id`, `doc_type`, `filename`, `mime_type`, `uploaded_at` (no `file_data` — blobs are never printed)

**Tests (`tests/node/cli.test.js`):**

Use Node's `child_process.execSync` or a helper that spawns the CLI and captures stdout/stderr/exit code.

```
firearms
  ✓ list on empty db returns empty table (exit 0)
  ✓ list --json returns empty array []
  ✓ add creates a record; subsequent list --json contains it
  ✓ show <id> --json returns the correct record
  ✓ update <id> --name changes the name; show reflects it
  ✓ delete <id> removes the record; list --json does not contain it
  ✓ add with duplicate serial exits 1, stderr contains error message

rounds
  ✓ add creates a record; list --firearm <id> --json contains it
  ✓ update changes rounds_fired; list reflects it
  ✓ delete removes the record

events
  ✓ add creates a record; list --firearm <id> --json contains it
  ✓ update changes title; list reflects it
  ✓ delete removes the record

documents
  ✓ add --file ./fixtures/test.pdf stores a document
  ✓ list --json contains the document with correct filename
  ✓ delete removes the document; list --json does not contain it

config file
  ✓ ~/.fdbrc with {"db": "<path>"} used when --db not provided
  ✓ --db flag overrides config file db value
  ✓ missing --db and no config exits 1 with helpful message
  ✓ malformed ~/.fdbrc prints warning to stderr but continues

errors
  ✓ unknown command exits 1
  ✓ --db path that does not exist exits 1 with clear message
```

---

## Phase 1 completion checklist

Before handing off to Phase 2, verify:

- [ ] `npm run test:run` passes all tests with no failures
- [ ] `npm run lint` exits 0
- [ ] Manual: open a generated `.db` file with an external SQLite tool (e.g. `sqlite3` or DB Browser) — confirms sqlite-wasm serialization is compatible with standard SQLite (the export/import round-trip test validates data integrity; this checks wire-format compatibility)
