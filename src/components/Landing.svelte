<script>
  import { appState, markDirty, showError } from '../lib/stores.svelte.js'
  import { openFile } from '../lib/fileAccess.js'
  import { openDatabase, createDatabase } from '../lib/db.js'
  import { strings } from '../lib/strings.js'

  async function handleOpen() {
    try {
      const { bytes, handle } = await openFile()
      const db = await openDatabase(bytes)
      appState.dbInstance = db
      appState.fileHandle = handle
      appState.openFilename = handle ? handle.name : 'database.db'
      appState.currentView = 'firearms'
    } catch (err) {
      if (err.name === 'AbortError') return
      showError({ title: 'Error', message: strings.errors.fatalOpen })
    }
  }

  async function handleNew() {
    try {
      const db = await createDatabase()
      appState.dbInstance = db
      appState.fileHandle = null
      appState.openFilename = 'unsaved'
      markDirty()
      appState.currentView = 'firearms'
    } catch (err) {
      showError({ title: 'Error', message: err.message })
    }
  }
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg p-8">
  <h1 class="text-4xl font-bold text-accent">FDB</h1>
  <p class="max-w-sm text-center text-text-muted">
    A personal firearms database that runs entirely in your browser.
    Your data lives in a file on your machine — nothing is sent to any server, ever.
    <a
      href="https://github.com/marshha/fdb"
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent underline hover:text-accent-hover"
    >Verify it yourself.</a>
  </p>

  {#if !window.showSaveFilePicker}
    <p class="max-w-sm rounded bg-warning/20 px-4 py-3 text-center text-sm text-warning">
      {strings.firefox.saveWarning}
    </p>
  {/if}

  <div class="flex flex-col gap-3 w-full max-w-xs">
    <button
      type="button"
      onclick={handleOpen}
      class="rounded bg-accent px-6 py-3 text-sm font-medium text-text-inverse hover:bg-accent-hover"
    >
      Open database
    </button>
    <button
      type="button"
      onclick={handleNew}
      class="rounded bg-surface-raised px-6 py-3 text-sm font-medium text-text-primary hover:bg-border"
    >
      New database
    </button>
  </div>
</div>
