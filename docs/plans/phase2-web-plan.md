# Phase 2 — Web Application

> **Prerequisite:** [Phase 1](phase1-cli-plan.md) must be complete and all tests passing.
> **Reference:** [Master Design Document](firearm-tracker-plan.md) — contains schema, design tokens, UI workflows, and all resolved decisions.
> **Next phase:** [Phase 3 — E2E Testing](phase3-e2e-plan.md)

## Goal

Build the browser-based GUI on top of the validated `db.js` from Phase 1. At the end of this phase the app is fully functional in Chrome, deployable to GitLab Pages, and all component logic is covered by unit tests.

## User-facing strings

All user-facing strings — empty states, validation errors, confirmation messages, toast messages, chart labels, title formats — are defined in `src/lib/strings.js`, created in Phase 1 Step 1. No string literals in component files. Import and reference `strings.*` throughout. This makes all copy easily updatable in one place.

## Testing tools

- **Vitest (Node)** — for `stores.svelte.js` state logic
- **`@testing-library/svelte` + happy-dom** — for component rendering and interaction
- **Vitest Browser Mode (Chromium)** — for Chart.js canvas rendering

Add to `package.json` scripts:
```json
"test:browser": "vitest --browser"
```

Add to dependencies:
- `@testing-library/svelte` (dev)
- `@testing-library/jest-dom` (dev)
- `happy-dom` (dev)
- `@vitest/browser` (dev)
- `playwright` (dev) — Chromium only for browser mode tests

Activate the component and browser project stubs in `vitest.config.js` (left as comments in Phase 1). Uncomment and fill in the two projects:

```js
      {
        name: 'component',
        plugins: [svelte()],
        test: {
          environment: 'happy-dom',
          include: ['tests/component/**/*.test.js'],
          setupFiles: ['tests/component/setup.js'],
        },
      },
      {
        name: 'browser',
        plugins: [svelte()],
        test: {
          browser: { enabled: true, name: 'chromium', provider: 'playwright' },
          include: ['tests/browser/**/*.test.js'],
        },
      },
```

The `node` project defined in Phase 1 is unchanged.

---

## Steps

### Step 5: Browser file access (`src/lib/fileAccess.js`)

Abstracts the File System Access API with Firefox fallbacks.

**`openFile()`:**
1. Feature-detect `window.showOpenFilePicker`
2. If available: call with `accept: { 'application/x-sqlite3': ['.db'] }`. Read file as ArrayBuffer → Uint8Array. Return `{ bytes, handle }`
3. Firefox fallback: hidden `<input type="file" accept=".db">`, wait for `change`, read as ArrayBuffer. Return `{ bytes, handle: null }`

**`saveFile(bytes, existingHandle)`:**
1. If `existingHandle`: `createWritable()` → write → close (overwrites in place)
2. If no handle but `showSaveFilePicker` available: show picker, write, return new handle
3. Firefox fallback: `Blob` → object URL → `<a download="firearms.db">` → click → revoke

**`saveFileAs(bytes)`:** Always shows picker or falls back to download.

**Tests:** Manual only — browser APIs cannot be meaningfully unit-tested without significant mocking that obscures real behaviour. Test manually:
- Chrome: open `.db` file via picker, save in place, verify file updated
- Firefox: open via `<input>`, save triggers download

---

### Step 6: Svelte app state (`src/lib/stores.svelte.js`)

Browser-only. Never imported by `db.js` or `cli/`. Uses `.svelte.js` extension for Svelte 5 runes.

```js
// Active SQLite DB instance
export let dbInstance = $state(null);

// FileHandle from File System Access API (null if fallback used)
export let fileHandle = $state(null);

// Filename for display in document.title
export let openFilename = $state(null);

// Unsaved changes flag
export let isDirty = $state(false);

// Navigation: 'landing' | 'firearms' | 'firearm-detail' | 'documents'
export let currentView = $state('landing');

// Currently selected firearm id (for detail view)
export let selectedFirearmId = $state(null);

// Toast notifications: [{ id, message, type }]
export let toasts = $state([]);

// Modal state: null | { title, message, onConfirm } | { title, message, isError }
export let modalState = $state(null);

export function markDirty() { isDirty = true; }
export function markClean() { isDirty = false; }

export function showToast(message, type = 'success') {
  const id = Date.now();
  toasts = [...toasts, { id, message, type }];
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4000);
}

export function showConfirm({ title, message, onConfirm }) {
  modalState = { title, message, onConfirm };
}

export function showError({ title, message }) {
  modalState = { title, message, isError: true };
}

export function closeModal() { modalState = null; }
```

**Tests (`tests/node/stores.test.js`):**

```
isDirty
  ✓ markDirty() sets isDirty to true
  ✓ markClean() sets isDirty to false

toasts
  ✓ showToast adds entry to toasts array with correct message and type
  ✓ toast is removed from array after 4000ms (fake timers)
  ✓ multiple toasts coexist; each is removed independently

modal
  ✓ showConfirm sets modalState with title, message, onConfirm
  ✓ showError sets modalState with isError = true, no onConfirm
  ✓ closeModal sets modalState to null
  ✓ onConfirm callback is invoked when called
```

---

### Step 7: Styling setup

Install Tailwind and establish the design token system. All components in Steps 8–13 depend on this.

See token definitions in the [Master Design Document](firearm-tracker-plan.md#step-7-detail-styling-tailwind-css--design-token-theming).

**`src/app.css`:**
```css
@import "tailwindcss";

@theme {
  --color-bg:            #1c1917;
  --color-surface:       #292524;
  --color-surface-raised:#3c3836;
  --color-border:        #57534e;
  --color-text-primary:  #fafaf9;
  --color-text-muted:    #a8a29e;
  --color-text-inverse:  #1c1917;
  --color-accent:        #d97706;
  --color-accent-hover:  #b45309;
  --color-accent-subtle: #451a03;
  --color-danger:        #dc2626;
  --color-danger-subtle: #450a0a;
  --color-warning:       #ca8a04;
  --color-success:       #65a30d;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text-primary);
}
```

**Tests:** None. Verify manually: `npm run dev` → background is dark warm gray, no blue tints.

---

### Step 8: App shell (`App.svelte`, `Landing.svelte`, `Sidebar.svelte`, `Toast.svelte`, `ConfirmModal.svelte`, `SaveButton.svelte`)

**`App.svelte`:**
- Reads `dbInstance`, `currentView` from stores
- Renders `<Landing />` when `dbInstance` is null
- Renders sidebar + content area when `dbInstance` is set
- Switches content on `currentView`
- Renders `<Toast />` and `<ConfirmModal />` outside layout (always mounted)
- Reactively sets `document.title` using `strings.titles`: `strings.titles.base` when no file open; `strings.titles.withFile(openFilename)` when a file is open; `strings.titles.unsaved` for a new unsaved database
- Registers `beforeunload` handler: calls `event.preventDefault()` + sets `event.returnValue = ''` when `isDirty`
- Cleans up `beforeunload` on destroy

**`Landing.svelte`:**
- "Open database" button: calls `openFile()`, then `openDatabase(bytes)`, sets `dbInstance`, `fileHandle`, `openFilename`, navigates to `'firearms'`
- "New database" button: calls `createDatabase()`, sets `dbInstance`, `fileHandle = null`, `openFilename = 'unsaved'`, marks dirty, navigates to `'firearms'`
- On error: calls `showError()`
- Shows `strings.firefox.saveWarning` notice when `!window.showSaveFilePicker`

**`Sidebar.svelte`:**
- Desktop: fixed left column
- Mobile: hidden; hamburger button in top bar opens it as fixed overlay (z-50). Tap outside or nav link closes it
- Nav links: Firearms, Documents
- `<SaveButton />` at bottom

**`SaveButton.svelte`:**
- Reads `isDirty`, `dbInstance`, `fileHandle`
- "Save" button: accent + pulse animation when dirty, muted when clean
- On click: `exportDatabase(db)` → `saveFile(bytes, fileHandle)` → if a new handle was returned (first save on a new database), update `fileHandle` and `openFilename` → `markClean()` → `showToast(strings.toasts.saved)`
- "Save As…" link: calls `saveFileAs(bytes)` → updates `fileHandle` to the new handle → updates `openFilename` from the new handle's `.name` → `markClean()` → `showToast(strings.toasts.saved)`. If user cancels the picker, no state changes.

**`Toast.svelte`:** Renders `toasts` array as stacked banners, top-right, auto-dismiss.

**`ConfirmModal.svelte`:**
- Renders when `modalState` is not null
- Confirm mode: Cancel + Confirm (danger-styled) buttons
- Error mode: OK button only
- Confirm calls `modalState.onConfirm()` then `closeModal()`
- Cancel and OK call `closeModal()`

**Tests (`tests/component/app-shell.test.js`):**

```
App.svelte
  ✓ renders Landing when dbInstance is null
  ✓ renders sidebar and content area when dbInstance is set
  ✓ document.title is "FDB" when openFilename is null
  ✓ document.title is "FDB — firearms.db" when openFilename = "firearms.db"
  ✓ beforeunload handler calls preventDefault when isDirty is true
  ✓ beforeunload handler does not call preventDefault when isDirty is false

Sidebar.svelte
  ✓ clicking Firearms nav sets currentView to 'firearms'
  ✓ clicking Documents nav sets currentView to 'documents'

Toast.svelte
  ✓ renders a toast message from the toasts array
  ✓ renders nothing when toasts is empty

ConfirmModal.svelte
  ✓ renders nothing when modalState is null
  ✓ renders title and message when modalState is set
  ✓ renders Cancel and Confirm buttons in confirm mode
  ✓ renders only OK button in error mode
  ✓ clicking Confirm calls onConfirm and closes modal
  ✓ clicking Cancel closes modal without calling onConfirm
```

---

### Step 9: Firearm Registry (`src/components/firearms/`)

Components: `FirearmList.svelte`, `FirearmForm.svelte`, `FirearmDetail.svelte`

**`FirearmList.svelte`:**
- On mount: calls `getAllFirearms(db)`, renders table
- Columns: Name, Manufacturer, Caliber, Serial Number, Total Rounds, Purchase Date
- Column headers for Name, Caliber, Purchase Date, Total Rounds are clickable — sort asc/desc. Default: Name asc
- Clicking a row: sets `selectedFirearmId`, navigates to `'firearm-detail'`
- **Sortable columns:** Name, Caliber, Purchase Date, Total Rounds. Click header → sort ascending; click again → descending. Sort state is **not persisted** — resets to Name ascending on navigation away and back. Visual indicator (arrow icon) on active sort column.
- "Add Firearm" button: opens `FirearmForm` as modal
- Edit icon per row: opens `FirearmForm` pre-populated
- Delete icon per row: queries `getRoundCounts`, `getEvents`, `getDocumentsForFirearm` to get counts, then calls `showConfirm({ title: 'Delete Firearm', message: strings.confirm.deleteFirearm(roundCount, eventCount, docCount) })`
- Confirm: calls `deleteFirearm(db, id)`, marks dirty, refreshes list, shows `strings.toasts.firearmDeleted`
- Empty state: `strings.empty.firearms` + "Add Firearm" button

**`FirearmForm.svelte`:**
- Props: `firearm` (null = create), `onClose`
- Fields: Name (required), Serial Number (required), Manufacturer, Caliber, Purchase Price, Purchase Date, FFL Dealer, Notes
- Inline validation on submit: required fields
- Catches UNIQUE constraint error on serial, shows user-friendly message beneath serial field
- On success: `insertFirearm` or `updateFirearm`, marks dirty, calls `onClose`, shows toast

**`FirearmDetail.svelte`:**
- Reads `selectedFirearmId`, fetches firearm on mount/change
- Header: name, manufacturer · caliber · serial, purchase date, FFL, total rounds badge
- Edit button: opens `FirearmForm` in edit mode
- Back button: navigates to `'firearms'`
- Tabs: Round Counts (default), Events, Documents

**Tests (`tests/component/firearms.test.js`):**

```
FirearmList
  ✓ renders empty state when db has no firearms
  ✓ renders one row per firearm
  ✓ displays computed total_rounds correctly
  ✓ clicking a row navigates to firearm-detail
  ✓ clicking Name header sorts ascending; clicking again sorts descending
  ✓ clicking Add Firearm opens FirearmForm modal
  ✓ clicking Delete shows ConfirmModal with consequence counts
  ✓ confirming delete calls deleteFirearm, refreshes list, shows toast

FirearmForm
  ✓ shows inline error on Name when submitted empty
  ✓ shows inline error on Serial when submitted empty
  ✓ shows user-friendly duplicate serial error (not raw SQLite message)
  ✓ successful create calls insertFirearm with correct data
  ✓ successful edit calls updateFirearm with correct id and data
  ✓ calls onClose after successful submit
```

---

### Step 10: Round Count Tracking (`src/components/rounds/`)

Components: `RoundCountList.svelte`, `RoundCountForm.svelte`, `RoundCountChart.svelte`

**`RoundCountList.svelte`:**
- Props: `firearmId`
- Fetches round counts on mount
- Table: Date, Rounds Fired, Notes, Edit/Delete per row
- Running total displayed below table
- "Add Session" button: opens `RoundCountForm`
- Edit per row: opens `RoundCountForm` pre-populated
- Delete per row: `showConfirm()` → `deleteRoundCount()`, marks dirty, refreshes list and chart
- On any mutation: emit event to parent to refresh chart
- Empty state: "No sessions logged yet."

**`RoundCountForm.svelte`:**
- Props: `firearmId`, `roundCount` (null = create), `onClose`
- Fields: Date (date picker, defaults to today as the user's **local calendar date** — derive via `new Date()` formatted as `YYYY-MM-DD` in local time, not UTC), Rounds Fired (number, min 1), Notes
- Inline validation: rounds_fired must be ≥ 1, error text from `strings.errors.roundsMin`
- On success: `insertRoundCount` or `updateRoundCount`, marks dirty, calls `onClose`, shows `strings.toasts.roundAdded` or `strings.toasts.roundUpdated`

**`RoundCountChart.svelte`:**
- Props: `firearmId`, `refreshTrigger`
- Fetches `getCumulativeRounds(db, firearmId)` on mount and when `refreshTrigger` changes
- `<canvas bind:this={canvas}>`
- `onMount`: create Chart.js line chart. Time scale X axis, cumulative Y axis. Import `chartjs-adapter-date-fns`
- `onDestroy`: `chart.destroy()`
- When `refreshTrigger` changes: destroy old chart, fetch fresh data, create new chart
- Empty state: show placeholder text in canvas area when no data

**Tests (`tests/component/rounds.test.js`):**

```
RoundCountList
  ✓ renders empty state when no sessions
  ✓ renders one row per session
  ✓ shows correct running total
  ✓ clicking Edit opens RoundCountForm pre-populated
  ✓ clicking Delete shows ConfirmModal
  ✓ confirming delete calls deleteRoundCount and refreshes list

RoundCountForm
  ✓ shows inline error when rounds_fired is 0
  ✓ shows inline error when rounds_fired is negative
  ✓ date field defaults to today
  ✓ successful create calls insertRoundCount with correct data
  ✓ successful edit calls updateRoundCount with correct data
  ✓ calls onClose after successful submit
```

**Tests (`tests/browser/chart.test.js`):**

```
RoundCountChart (Chromium)
  ✓ renders a <canvas> element
  ✓ chart instance is created with correct dataset length after data load
  ✓ chart is destroyed on component unmount (no memory leak)
```

---

### Step 11: Document Management (`src/components/documents/`)

Components: `DocumentList.svelte`, `DocumentUpload.svelte`

**`DocumentList.svelte`:**
- Props: `firearmId` (optional — scopes to firearm if provided)
- Fetches documents on mount
- Table: Filename, Type, Uploaded, Associated Firearms (global view only), View/Download/Delete
- "Upload Document" button: opens `DocumentUpload`
- "Link existing document" button (per-firearm view only): multi-select from all documents not yet linked
- View: `window.open(URL.createObjectURL(blob), '_blank')` — opens in new tab. Revoke URL after short delay
- Download: `<a download>` with Blob URL
- Delete (global view): `showConfirm()` → `deleteDocument()`, marks dirty, refreshes, shows toast
- Delete (per-firearm view): `showConfirm()` → `unlinkDocumentFromFirearm()`, marks dirty, refreshes, shows toast. Does NOT delete the document globally
- Empty state: "No documents."

**`DocumentUpload.svelte`:**
- Props: `firearmId` (optional, pre-selects association), `onClose`
- Fields: File picker (required, `.pdf, image/*`), Document Type (freeform text input), Firearm associations (multi-select, pre-checked if `firearmId` provided)
- On submit: read file as ArrayBuffer, `insertDocument()`, `linkDocumentToFirearm()` for each selected firearm, marks dirty, calls `onClose`, shows toast

**Tests (`tests/component/documents.test.js`):**

```
DocumentList
  ✓ renders empty state when no documents
  ✓ renders one row per document
  ✓ Delete in per-firearm view calls unlinkDocumentFromFirearm (not deleteDocument)
  ✓ Delete in global view calls deleteDocument

DocumentUpload
  ✓ submit button is disabled when no file selected
  ✓ successful upload calls insertDocument with correct filename and mime_type
  ✓ links document to pre-selected firearmId on submit
```

---

### Step 12: Event Log (`src/components/events/`)

Components: `EventList.svelte`, `EventForm.svelte`

**`EventList.svelte`:**
- Props: `firearmId`
- Fetches events (ordered date desc) on mount
- Table: Date, Type, Title, Description (truncated), Edit/Delete
- "Add Event" button: opens `EventForm`
- Edit per row: opens `EventForm` pre-populated
- Delete per row: `showConfirm()` → `deleteEvent()`, marks dirty, refreshes, shows toast
- Empty state: "No events recorded yet."

**`EventForm.svelte`:**
- Props: `firearmId`, `event` (null = create), `onClose`
- Fields: Date (defaults to today as the user's **local calendar date**, same method as `RoundCountForm`), Event Type (freeform text, `<datalist>` suggestions: "Maintenance", "Malfunction", "Modification", "Note"), Title (required, error from `strings.errors.titleRequired`), Description (textarea)
- `created_at` set to `Date.now()` on create, not shown in form
- On success: `insertEvent` or `updateEvent`, marks dirty, calls `onClose`, shows toast

**Tests (`tests/component/events.test.js`):**

```
EventList
  ✓ renders empty state when no events
  ✓ renders one row per event
  ✓ rows are in date descending order
  ✓ clicking Edit opens EventForm pre-populated
  ✓ confirming Delete calls deleteEvent and refreshes list

EventForm
  ✓ shows inline error when Title is empty
  ✓ created_at is not an editable field
  ✓ successful create calls insertEvent with correct data
  ✓ successful edit calls updateEvent with correct data
  ✓ calls onClose after successful submit
```

---

### Step 13: Unsaved changes guard

In `App.svelte`, register and clean up the `beforeunload` handler:

```js
function handleBeforeUnload(e) {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
}

$effect(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
});
```

**Tests (`tests/component/app-shell.test.js` — add to existing):**

```
beforeunload guard
  ✓ handler calls preventDefault when isDirty is true
  ✓ handler does not call preventDefault when isDirty is false
  ✓ handler is removed when App component is destroyed
```

---

### Step 14: GitLab CI configuration (`.gitlab-ci.yml`)

```yaml
image: node:20

variables:
  VITE_BASE_PATH: "/"

pages:
  stage: deploy
  script:
    - npm ci
    - npm run lint
    - npm run test:run
    - npm run build
  artifacts:
    paths:
      - public
  only:
    - main
```

Set `VITE_BASE_PATH` as a CI/CD variable in GitLab project settings (Settings → CI/CD → Variables) for subpath deployments.

**Tests:** None. Verify manually: push to `main`, confirm Pages pipeline passes and the app loads at the Pages URL.

---

## Phase 2 completion checklist

Before handing off to Phase 3:

- [ ] `npm run test:run` passes all node + component tests
- [ ] `npm run test:browser` passes all browser-mode tests
- [ ] `npm run lint` exits 0
- [ ] `npm run build` produces a `public/` directory with no errors
- [ ] Manual: full workflow in Chrome — open DB → add firearm → log rounds → upload PDF → save → reload → verify all data persists
- [ ] Manual: Firefox — file open and save-as-download fallback works
- [ ] Manual: mobile viewport — hamburger menu works, all forms usable
- [ ] Manual: duplicate serial number — shows user-friendly error from `strings.errors.duplicateSerial`, not raw SQLite message
- [ ] Manual: navigate away with unsaved changes — browser shows warning
