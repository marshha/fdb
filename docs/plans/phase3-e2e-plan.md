# Phase 3 — E2E Testing

> **Prerequisite:** [Phase 1](phase1-cli-plan.md) and [Phase 2](phase2-web-plan.md) must be complete with all tests passing.
> **Reference:** [Master Design Document](firearm-tracker-plan.md)

## Goal

Validate the full application from the user's perspective using real browser automation. E2E tests catch integration bugs that unit and component tests miss — particularly around the file open/save cycle, cross-component state updates, and the full CRUD workflows end-to-end.

## Tool

**Playwright** — Chromium only for v1 (Chrome is the primary supported browser per resolved decision OQ-11).

## Setup

**Install:**
```
npm install -D @playwright/test
npx playwright install chromium
```

**`playwright.config.js`:**
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

**Add to `package.json` scripts:**
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Add to GitLab CI** (`.gitlab-ci.yml`):
```yaml
e2e:
  stage: test
  image: mcr.microsoft.com/playwright:v1.50.0-noble
  script:
    - npm ci
    - npm run build
    - npx serve public &
    - npm run test:e2e
  only:
    - main
```

## Test fixtures and mocking strategy

### File picker mocking

`showOpenFilePicker` and `showSaveFilePicker` are native browser dialogs — Playwright cannot interact with them directly. Mock them using `page.addInitScript()`, which runs before any page script.

**`tests/e2e/helpers/mockFilePicker.js`:**

```js
// Call before page.goto() to install mocks.
// savedBytes is shared via window.__fdbBytes across save/reload cycles.

export async function mockFilePickers(page, initialBytes = null) {
  await page.addInitScript((bytesArray) => {
    // Seed initial bytes if provided (e.g. for open-existing tests)
    if (bytesArray) {
      window.__fdbBytes = new Uint8Array(bytesArray);
    }

    // Mock showOpenFilePicker — returns a fake FileSystemFileHandle
    window.showOpenFilePicker = async () => {
      const bytes = window.__fdbBytes ?? new Uint8Array();
      const file = new File([bytes], window.__fdbFilename ?? 'test.db',
        { type: 'application/x-sqlite3' });
      return [{
        name: window.__fdbFilename ?? 'test.db',
        getFile: async () => file,
        createWritable: async () => {
          const chunks = [];
          return {
            write: async (data) => chunks.push(data),
            close: async () => {
              window.__fdbBytes = new Uint8Array(
                await new Blob(chunks).arrayBuffer()
              );
            },
          };
        },
      }];
    };

    // Mock showSaveFilePicker — same fake handle
    window.showSaveFilePicker = async (opts) => {
      window.__fdbFilename = opts?.suggestedName ?? 'firearms.db';
      return (await window.showOpenFilePicker())[0];
    };
  }, initialBytes ? Array.from(initialBytes) : null);
}
```

**To capture saved bytes after a save action:**
```js
const savedBytes = await page.evaluate(() => Array.from(window.__fdbBytes ?? []));
```

**To reload and re-open the same bytes:**
```js
await mockFilePickers(page, savedBytes); // re-install mock with saved bytes
await page.reload();
// Then trigger the open flow via the Landing screen UI
```

### Database seeding

For tests that need pre-existing data, build a seeded `.db` in Node before the test and inject its bytes via `mockFilePickers`. Use the same `db.js` module.

**`tests/e2e/helpers/seedDb.js`:**

```js
import { initSqlite, createDatabase, exportDatabase,
         insertFirearm, insertRoundCount, insertEvent } from '../../../src/lib/db.js';

export async function buildSeededDb() {
  await initSqlite();
  const db = await createDatabase();
  const firearmId = await insertFirearm(db, {
    name: 'Test Pistol', serial_number: 'TEST001',
    manufacturer: 'Acme', caliber: '9mm',
    purchase_date: new Date(2025, 0, 1).getTime(),
  });
  await insertRoundCount(db, {
    firearm_id: firearmId, rounds_fired: 100,
    date: new Date(2025, 1, 1).getTime(),
  });
  await insertEvent(db, {
    firearm_id: firearmId, event_type: 'Maintenance',
    title: 'Cleaned', date: new Date(2025, 2, 1).getTime(),
  });
  return { bytes: exportDatabase(db), firearmId };
}
```

Each test suite that needs data calls `buildSeededDb()` in a `beforeEach` and passes the bytes to `mockFilePickers`. Tests are isolated — no shared state between suites.

---

## Test suites

### Suite 1: Landing screen

```
✓ app loads and shows the landing screen
✓ "Open database" button is present
✓ "New database" button is present
✓ Firefox compatibility notice is shown when File System Access API is unavailable
    (simulate by overriding window.showOpenFilePicker = undefined)
✓ document.title is "FDB"
```

### Suite 2: Create new database

```
✓ clicking "New database" dismisses the landing and shows the firearms list
✓ document.title changes to "FDB — unsaved"
✓ Save button is highlighted (dirty state)
✓ clicking Save triggers showSaveFilePicker (verify dialog appears)
```

### Suite 3: Full firearm CRUD workflow

Using injected test database:

```
✓ firearms list is empty on a fresh database
✓ clicking "Add Firearm" opens the modal form
✓ submitting the form with Name and Serial creates a new row in the list
✓ the new firearm's Total Rounds shows 0
✓ clicking Edit opens the form pre-populated with existing data
✓ updating the name reflects immediately in the list
✓ attempting to add a firearm with a duplicate serial shows an inline error
✓ clicking Delete shows a confirmation modal
✓ confirming delete removes the row from the list
✓ the Save button is highlighted after any mutation
✓ document.title shows "FDB — unsaved" (or filename if file was open)
```

### Suite 4: Firearm detail and tab navigation

```
✓ clicking a firearm row navigates to the detail view
✓ detail header shows the firearm name, caliber, serial number
✓ total round count is displayed in the header
✓ Back button returns to the firearm list
✓ Round Counts tab is active by default
✓ clicking Events tab shows the events panel
✓ clicking Documents tab shows the documents panel
```

### Suite 5: Round count tracking

```
✓ Round Counts tab shows empty state on a firearm with no sessions
✓ clicking "Add Session" opens the form
✓ submitting with date and rounds adds a row to the session table
✓ running total updates after adding a session
✓ chart canvas is present and has non-zero dimensions
✓ adding a second session updates the running total correctly
✓ clicking Edit on a session opens the form pre-populated
✓ updating rounds_fired changes the value in the table and running total
✓ clicking Delete on a session shows confirmation
✓ confirming delete removes the row and updates the running total
✓ form shows error when rounds_fired is 0
```

### Suite 6: Event log

```
✓ Events tab shows empty state on a firearm with no events
✓ clicking "Add Event" opens the form
✓ submitting with type, title, and description adds a row
✓ events are displayed in date descending order
✓ clicking Edit opens the form pre-populated
✓ clicking Delete shows confirmation; confirming removes the row
✓ form shows error when Title is empty
```

### Suite 7: Document management

```
✓ Documents tab shows empty state on a firearm with no linked documents
✓ clicking "Upload Document" opens the upload form
✓ uploading a PDF stores it and shows the filename in the document list
✓ clicking View calls window.open() with a blob URL (Playwright verifies the call; PDF rendering must be verified manually — automated assertion is not possible)
✓ clicking Download triggers a file download
✓ clicking Delete (per-firearm) shows confirmation; confirming unlinks but does not delete globally
✓ document still appears in the global Documents screen after per-firearm unlink
✓ clicking Delete on the global Documents screen removes the document entirely
✓ uploading a document with multiple firearm associations links it to all selected firearms
```

### Suite 8: Save and reload

The most important E2E test — validates the entire open/save/reopen cycle. Uses `mockFilePickers` to capture bytes in `window.__fdbBytes` without writing to disk.

```
Setup: install mockFilePickers with no initial bytes

✓ click "New database" — app opens to empty firearms list
✓ add a firearm (name: "Glock 19", serial: "G001", caliber: "9mm")
✓ navigate to firearm detail, add two round count sessions (100 rounds, 50 rounds)
✓ add one event (type: "Maintenance", title: "Cleaned")
✓ upload a small test PDF document linked to the firearm

✓ click Save — showSaveFilePicker mock captures bytes into window.__fdbBytes
✓ isDirty indicator clears
✓ document.title shows "FDB — firearms.db"

// Capture bytes and reload
✓ capture window.__fdbBytes via page.evaluate()
✓ reinstall mockFilePickers with captured bytes
✓ reload the page — app returns to Landing screen
✓ click "Open database" — showOpenFilePicker mock returns saved bytes

// Verify all data survived the round-trip
✓ firearms list shows "Glock 19"
✓ navigate to firearm detail — total rounds shows 150
✓ Round Counts tab shows two sessions
✓ Events tab shows one event titled "Cleaned"
✓ Documents tab shows one document
✓ isDirty indicator is not shown (database is clean after open)
```

### Suite 9: Unsaved changes guard

```
✓ navigating away with unsaved changes triggers the beforeunload dialog
✓ saving clears the dirty state; navigating away does not trigger the dialog
```

### Suite 10: Error handling

```
Setup: mockFilePickers loaded with bytes from a plain text file (not a valid .db)

✓ clicking "Open database" triggers the open flow
✓ the fatal error modal appears with strings.errors.fatalOpen as the message
✓ the modal has an OK button and no Cancel button
✓ clicking OK closes the modal
✓ the app remains on the Landing screen
✓ a second "Open database" attempt works correctly with valid bytes
```

---

## Phase 3 completion checklist

- [ ] `npm run test:e2e` passes all suites in headless Chromium
- [ ] CI pipeline runs E2E tests on push to `main` and passes
- [ ] Manual: run `npm run test:e2e:ui` and spot-check Suite 8 (save/reload) visually
- [ ] Manual: Suite 7 document viewer — verify PDF renders correctly in new tab
