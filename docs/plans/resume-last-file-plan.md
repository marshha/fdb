# Resume Last File Plan

## Goal

Allow the app to remember the last opened `.db` file so users can resume without navigating a file picker on every load. The Landing page gains a prominent "Resume" section when a previous file is available, while retaining all existing open/new options.

## How It Works

A `FileSystemFileHandle` (returned by `showOpenFilePicker`) is a serializable object — the browser allows storing it directly in IndexedDB. On next load the handle is retrieved and `requestPermission({ mode: 'readwrite' })` is called. If the user confirms (one click, no file picker), the file is read exactly as normal. The stored handle contains the filename for display but never the file contents.

## Constraints

| Situation | Behaviour |
|---|---|
| Chrome / Edge | Works. Within a session permission is often already held; across sessions a small browser-native permission prompt appears |
| Firefox | Not possible — no File System Access API. Resume section is never shown; existing upload fallback is unchanged |
| File moved or deleted | `requestPermission` may succeed but `handle.getFile()` will throw; treat as a failed resume, clear the stored handle, show the standard options |
| File renamed | Handle tracks the file by identity, not path — rename is transparent; displayed name updates on next successful open |
| Multiple files | Out of scope. Store one handle (the most recently opened or saved). |

## UI Design

When no previous handle is stored, the Landing page is unchanged. When a handle is found in IndexedDB the page gains a resume section above the existing buttons:

```
┌─────────────────────────────────────────────────┐
│                     FDB                         │
│          [privacy description / link]           │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Resume                                   │  │
│  │  firearms.db                              │  │
│  │                          [Resume]  ←CTA   │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ─────────────── or ───────────────             │
│                                                  │
│  Open database                                   │
│  New database                                    │
│                                                  │
│  Install as app  ↓   (PWA, when available)      │
└─────────────────────────────────────────────────┘
```

- The resume card uses `bg-surface` with an amber-left-border (`border-l-2 border-accent`) to draw the eye without being intrusive.
- The filename is shown in `text-text-primary`; the path hint (if the browser exposes it — it won't, by design) is omitted. Only the filename is shown.
- "Resume" is the primary action button (accent style). The existing "Open database" / "New database" buttons beneath it are secondary.
- If the resume attempt fails (file gone, permission denied), the card disappears and the standard options remain. A toast is shown only if the user explicitly clicked Resume and it failed — not on silent detection.

## Implementation

### 1. IDB helper (`src/lib/idb.js`)

A minimal IndexedDB wrapper — no library needed. One store, two operations:

```js
const DB_NAME = 'fdb-meta'
const STORE   = 'handles'
const KEY     = 'lastHandle'

async function openMetaDb() { ... }          // opens/creates the DB
export async function saveHandle(handle) { ... }   // put handle under KEY
export async function loadHandle() { ... }         // get handle or null
export async function clearHandle() { ... }        // delete handle
```

The store is created with `keyPath` omitted and a fixed string key so the schema stays trivial.

### 2. Save handle on open and save-as (`src/lib/fileAccess.js`)

After a successful `showOpenFilePicker` or `showSaveFilePicker`, call `saveHandle(handle)`. This keeps the stored handle pointing to the most recently touched file.

`saveFile` (in-place overwrite) does not need to update the stored handle because the handle reference itself hasn't changed.

### 3. Landing page resume logic (`src/components/Landing.svelte`)

On mount (inside `$effect`):

1. Call `loadHandle()`.
2. If null, or if `window.showOpenFilePicker` is not available (Firefox), do nothing — no resume UI shown.
3. Otherwise store as `resumeHandle` reactive state.

Resume button click handler:

1. Call `resumeHandle.requestPermission({ mode: 'readwrite' })`.
2. If result is `'granted'`:
   - Call `resumeHandle.getFile()` to read bytes.
   - Open the database as normal (same path as `handleOpen`).
3. If result is `'denied'`, or any error is thrown:
   - Call `clearHandle()`.
   - Set `resumeHandle = null` (card disappears, standard options visible).
   - If the user explicitly clicked Resume and it failed, show an error toast.

### 4. Clear handle on explicit close (optional, deferred)

If a future release adds a "Close database" action, it should call `clearHandle()` so a file the user explicitly closed does not reappear. Not required for this phase since the app currently has no close action.

## File Changeset

| File | Action |
|---|---|
| `src/lib/idb.js` | Create — IDB helper (`saveHandle`, `loadHandle`, `clearHandle`) |
| `src/lib/fileAccess.js` | Update — call `saveHandle` after `showOpenFilePicker` and `showSaveFilePicker` |
| `src/components/Landing.svelte` | Update — load handle on mount; render resume card when available |
| `src/lib/strings.js` | Update — add `landing.resume` and `errors.resumeFailed` strings |

## Out of Scope

- Remembering scroll position, current view, or selected firearm
- Storing multiple recent files
- Firefox / Safari support (no File System Access API)
- Storing any database content in the browser
