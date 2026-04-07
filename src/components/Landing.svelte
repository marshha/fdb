<script>
  import { onMount } from 'svelte'
  import { appState, markDirty, showError } from '../lib/stores.svelte.js'
  import { openFile } from '../lib/fileAccess.js'
  import { openDatabase, createDatabase } from '../lib/db.js'
  import { loadHandle, clearHandle } from '../lib/idb.js'
  import { strings } from '../lib/strings.js'

  let installPrompt = $state(null)
  let resumeHandle = $state(null)

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e
  })

  onMount(async () => {
    if (!window.showOpenFilePicker) return
    try {
      resumeHandle = await loadHandle()
    } catch {
      // IDB unavailable — silently skip
    }
  })

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    installPrompt = null
  }

  async function handleResume() {
    try {
      const permission = await resumeHandle.requestPermission({ mode: 'readwrite' })
      if (permission !== 'granted') {
        resumeHandle = null
        await clearHandle()
        return
      }
      const file = await resumeHandle.getFile()
      const bytes = new Uint8Array(await file.arrayBuffer())
      const db = await openDatabase(bytes)
      appState.dbInstance = db
      appState.fileHandle = resumeHandle
      appState.openFilename = resumeHandle.name
      appState.currentView = 'firearms'
    } catch {
      resumeHandle = null
      await clearHandle()
      showError({ title: 'Error', message: strings.errors.resumeFailed })
    }
  }

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
    {strings.landing.description}
    <br />
    <a
      href={strings.landing.verifyLinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent underline hover:text-accent-hover"
    >{strings.landing.verifyLinkText}</a>
  </p>

  {#if !window.showSaveFilePicker}
    <p class="max-w-sm rounded bg-warning/20 px-4 py-3 text-center text-sm text-warning">
      {strings.firefox.saveWarning}
    </p>
  {/if}

  {#if resumeHandle}
    <div class="w-full max-w-xs rounded border-l-2 border-accent bg-surface px-4 py-3">
      <p class="mb-0.5 text-xs font-medium uppercase tracking-wide text-text-muted">Resume</p>
      <div class="flex items-center justify-between gap-3">
        <span class="truncate text-sm text-text-primary">{resumeHandle.name}</span>
        <button
          type="button"
          onclick={handleResume}
          class="shrink-0 rounded bg-accent px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-accent-hover"
        >
          Resume
        </button>
      </div>
    </div>

    <p class="text-xs text-text-muted">{strings.landing.resumeOr}</p>
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

  {#if installPrompt}
    <button
      type="button"
      onclick={handleInstall}
      class="mt-4 text-sm text-text-muted underline hover:text-text-primary"
    >
      Install as app
    </button>
  {/if}
</div>
