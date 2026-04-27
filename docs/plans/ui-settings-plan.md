# UI Settings Persistence Plan

## Goal

Persist user UI preferences across sessions using IndexedDB. Two settings in scope:

- **Show serial numbers** — already exists as an ephemeral toggle (`appState.showSerials`); needs to survive a page reload.
- **Confirm before save** — new setting; gates an "overwrite this file?" confirmation dialog in the save flow for users who want an extra safety check before `Save` (not `Save As`) overwrites their file in place.

## What Is Not Changing

The settings are browser-local preferences, stored in the existing `fdb-meta` IndexedDB under a new `'settings'` key. They are not part of the `.db` file and are not shared across devices or browsers. The data model, save flow, and all other app behaviour are unchanged unless `confirmBeforeSave` is enabled.

---

## Settings Schema

```js
{
  showSerials:       false,   // mirrors appState.showSerials
  confirmBeforeSave: false,   // new
}
```

Defaults are applied whenever the key is absent from IDB (first run, or after clearing browser data).

---

## Architecture

### Storage

Reuse the existing `fdb-meta` IDB database and `handles` object store (key-value, out-of-line keys). Settings live under the string key `'settings'` alongside `'lastHandle'`. No schema migration is required.

Add two functions to `src/lib/idb.js`:

```js
export async function loadSettings() { ... }  // returns object merged with defaults
export async function saveSettings(settings) { ... }
```

`loadSettings` always returns a full settings object — if the stored value is missing or partial, defaults fill the gaps. This makes it safe to add new settings in future without migration.

### State

`appState` in `stores.svelte.js` gains one new field:

```js
confirmBeforeSave: false,
```

`showSerials` is already present. Both are the source of truth at runtime.

### Load & Save Lifecycle (`App.svelte`)

Settings are independent of whether a database is open, so they load in `App.svelte` on mount — before the user can interact with any toggle:

```js
onMount(async () => {
  const s = await loadSettings()
  appState.showSerials       = s.showSerials
  appState.confirmBeforeSave = s.confirmBeforeSave
})
```

A `$effect` persists settings back to IDB whenever either value changes:

```js
$effect(() => {
  saveSettings({
    showSerials:       appState.showSerials,
    confirmBeforeSave: appState.confirmBeforeSave,
  })
})
```

The effect fires once on mount (after values are set) and on every subsequent change. Saving is idempotent; the extra write on initial load is harmless.

### Save Confirmation (`SaveButton.svelte`)

The "Save" button currently calls `saveFile(bytes, existingHandle)` immediately. When `confirmBeforeSave` is enabled and an existing handle is present (i.e., an overwrite would happen), insert a confirmation step using the existing `showConfirm` modal:

```
if (appState.confirmBeforeSave && appState.fileHandle) {
  showConfirm({
    title: 'Save',
    message: 'Overwrite [filename] with your current changes?',
    onConfirm: () => doSave(),
  })
} else {
  doSave()
}
```

`Save As…` is unaffected — it always shows a picker, so there is no silent overwrite.

### Settings UI (`Sidebar.svelte`)

A compact settings section sits between the nav links and the `SaveButton`, visible only when a database is open. Two toggle rows:

```
┌──────────────────────────────────┐
│  Firearms                        │
│  Documents                       │
│                                  │
│  ─── Settings ───                │
│  Show serial numbers      [ ● ]  │
│  Confirm before save      [   ]  │
│                                  │
│  [ Save ]                        │
└──────────────────────────────────┘
```

Toggles are standard `<input type="checkbox">` bound to `appState.showSerials` and `appState.confirmBeforeSave`. No separate settings page or modal.

---

## Implementation Steps

### Step 1 — IDB helpers + state + lifecycle

- `src/lib/idb.js` — add `loadSettings` and `saveSettings`
- `src/lib/stores.svelte.js` — add `confirmBeforeSave: false` to `appState`
- `src/App.svelte` — `onMount` load + `$effect` save

### Step 2 — Settings toggles in Sidebar

- `src/components/Sidebar.svelte` — settings section with two toggles (shown only when `appState.dbInstance !== null`)
- `src/lib/strings.js` — add `settings.showSerials`, `settings.confirmBeforeSave` labels

### Step 3 — Confirm-before-save behaviour

- `src/components/SaveButton.svelte` — conditional `showConfirm` before overwrite when `confirmBeforeSave` is set
- `src/lib/strings.js` — add `confirm.saveOverwrite` string

---

## File Changeset

| File | Action |
|---|---|
| `src/lib/idb.js` | Update — add `loadSettings`, `saveSettings` |
| `src/lib/stores.svelte.js` | Update — add `confirmBeforeSave: false` |
| `src/App.svelte` | Update — `onMount` load settings, `$effect` save settings |
| `src/components/Sidebar.svelte` | Update — settings section with two toggles |
| `src/components/SaveButton.svelte` | Update — confirmation gate before overwrite |
| `src/lib/strings.js` | Update — settings labels + save confirmation string |

---

## Commit Structure

Three commits:

1. `feat: add settings persistence (IDB helpers + appState + lifecycle)`
2. `feat: add settings toggles to sidebar`
3. `feat: confirm before save setting`

## Out of Scope

- Settings panel as a dedicated view/page
- Per-database settings (these are browser-local, not stored in the `.db` file)
- Additional settings beyond the two listed
- Exporting or syncing settings
