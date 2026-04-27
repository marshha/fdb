<script>
  import { appState, markClean, showToast, showConfirm } from '../lib/stores.svelte.js'
  import { saveFile, saveFileAs } from '../lib/fileAccess.js'
  import { exportDatabase } from '../lib/db.js'
  import { strings } from '../lib/strings.js'

  async function doSave() {
    const bytes = exportDatabase(appState.dbInstance)
    const newHandle = await saveFile(bytes, appState.fileHandle)
    if (newHandle && !appState.fileHandle) {
      appState.fileHandle = newHandle
      appState.openFilename = newHandle.name
    }
    markClean()
    showToast(strings.toasts.saved)
  }

  function handleSave() {
    if (appState.confirmBeforeSave && appState.fileHandle) {
      showConfirm({
        title: 'Save',
        message: strings.confirm.saveOverwrite(appState.openFilename),
        onConfirm: () => doSave(),
      })
    } else {
      doSave()
    }
  }

  async function handleSaveAs() {
    const bytes = exportDatabase(appState.dbInstance)
    try {
      const newHandle = await saveFileAs(bytes)
      if (newHandle) {
        appState.fileHandle = newHandle
        appState.openFilename = newHandle.name
      }
      markClean()
      showToast(strings.toasts.saved)
    } catch (err) {
      if (err.name === 'AbortError') return
      throw err
    }
  }
</script>

<div class="flex flex-col gap-1">
  <button
    type="button"
    onclick={handleSave}
    disabled={!appState.dbInstance}
    class="w-full rounded px-4 py-2 text-sm font-medium transition-colors"
    class:bg-accent={appState.isDirty}
    class:hover:bg-accent-hover={appState.isDirty}
    class:animate-pulse={appState.isDirty}
    class:bg-surface-raised={!appState.isDirty}
    class:text-text-muted={!appState.isDirty}
    class:text-text-inverse={appState.isDirty}
  >
    Save
  </button>
  {#if appState.dbInstance}
    <button
      type="button"
      onclick={handleSaveAs}
      class="w-full rounded px-2 py-1 text-xs text-text-muted hover:text-text-primary"
    >
      Save As…
    </button>
  {/if}
</div>
