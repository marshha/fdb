<script>
  import { appState, markDirty, showToast } from '../../lib/stores.svelte.js'
  import { insertDocument, linkDocumentToFirearm, getAllFirearms } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'

  let { firearmId = null, onClose } = $props()

  let selectedFile = $state(null)
  let docType = $state('')
  let selectedFirearmIds = $state(firearmId ? [firearmId] : [])
  let allFirearms = $state([])
  let fileError = $state('')

  $effect(() => {
    if (appState.dbInstance) {
      allFirearms = getAllFirearms(appState.dbInstance)
    }
  })

  function handleFileChange(e) {
    selectedFile = e.target.files[0] ?? null
    fileError = ''
  }

  function toggleFirearm(id) {
    if (selectedFirearmIds.includes(id)) {
      selectedFirearmIds = selectedFirearmIds.filter((f) => f !== id)
    } else {
      selectedFirearmIds = [...selectedFirearmIds, id]
    }
  }

  async function handleSubmit() {
    fileError = ''
    if (!selectedFile) {
      fileError = strings.errors.fileRequired
      return
    }

    const buffer = await selectedFile.arrayBuffer()
    const fileData = new Uint8Array(buffer)

    const docId = insertDocument(appState.dbInstance, {
      filename: selectedFile.name,
      fileData,
      mimeType: selectedFile.type || 'application/octet-stream',
      docType: docType.trim() || null,
    })

    for (const fid of selectedFirearmIds) {
      linkDocumentToFirearm(appState.dbInstance, docId, fid, null)
    }

    markDirty()
    showToast(strings.toasts.documentUploaded)
    onClose()
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  role="dialog"
  aria-modal="true"
  aria-labelledby="upload-form-title"
>
  <div class="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
    <h2 id="upload-form-title" class="mb-4 text-lg font-semibold text-text-primary">
      Upload Document
    </h2>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit() }} novalidate>
      <div class="mb-4">
        <label for="du-file" class="mb-1 block text-sm font-medium text-text-muted">File *</label>
        <input
          id="du-file"
          type="file"
          accept=".pdf,image/*"
          onchange={handleFileChange}
          class="w-full text-sm text-text-muted"
          aria-describedby={fileError ? 'du-file-error' : undefined}
          aria-invalid={fileError ? 'true' : undefined}
        />
        {#if fileError}
          <p id="du-file-error" class="mt-1 text-xs text-danger" role="alert">{fileError}</p>
        {/if}
      </div>

      <div class="mb-4">
        <label for="du-type" class="mb-1 block text-sm font-medium text-text-muted">Document Type</label>
        <input
          id="du-type"
          type="text"
          bind:value={docType}
          placeholder="e.g. Receipt, Manual, Warranty"
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {#if allFirearms.length > 0}
        <div class="mb-6">
          <p class="mb-2 text-sm font-medium text-text-muted">Associate with Firearms</p>
          <div class="max-h-40 overflow-y-auto rounded border border-border bg-surface-raised p-2">
            {#each allFirearms as f (f.id)}
              <label class="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-surface">
                <input
                  type="checkbox"
                  checked={selectedFirearmIds.includes(f.id)}
                  onchange={() => toggleFirearm(f.id)}
                  class="rounded"
                />
                <span class="text-sm text-text-primary">{f.name}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <button
          type="button"
          onclick={onClose}
          class="rounded bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-border"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!selectedFile}
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Upload
        </button>
      </div>
    </form>
  </div>
</div>
