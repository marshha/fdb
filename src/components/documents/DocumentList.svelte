<script>
  import { appState, markDirty, showToast, showConfirm } from '../../lib/stores.svelte.js'
  import {
    getAllDocuments,
    getDocumentsForFirearm,
    deleteDocument,
    unlinkDocumentFromFirearm,
    getDocumentBlob,
    linkDocumentToFirearm,
  } from '../../lib/db.js'
  import { fromEpoch } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'
  import DocumentUpload from './DocumentUpload.svelte'

  let { firearmId = null } = $props()

  let documents = $state([])
  let showUpload = $state(false)
  let showLinkModal = $state(false)
  let allDocuments = $state([])
  let linkSelected = $state([])

  function load() {
    if (firearmId) {
      documents = getDocumentsForFirearm(appState.dbInstance, firearmId)
    } else {
      documents = getAllDocuments(appState.dbInstance)
    }
  }

  $effect(() => {
    if (appState.dbInstance) load()
  })

  function closeUpload() {
    showUpload = false
    load()
  }

  function handleView(doc) {
    const row = getDocumentBlob(appState.dbInstance, doc.id)
    if (!row) return
    const blob = new Blob([row.file_data], { type: row.mime_type })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  function handleDownload(doc) {
    const row = getDocumentBlob(appState.dbInstance, doc.id)
    if (!row) return
    const blob = new Blob([row.file_data], { type: row.mime_type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = row.filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  function handleDelete(doc) {
    if (firearmId) {
      showConfirm({
        title: 'Unlink Document',
        message: strings.confirm.unlinkDocument,
        onConfirm() {
          unlinkDocumentFromFirearm(appState.dbInstance, doc.id, firearmId)
          markDirty()
          load()
          showToast(strings.toasts.documentUnlinked)
        },
      })
    } else {
      showConfirm({
        title: 'Delete Document',
        message: strings.confirm.deleteDocument,
        onConfirm() {
          deleteDocument(appState.dbInstance, doc.id)
          markDirty()
          load()
          showToast(strings.toasts.documentDeleted)
        },
      })
    }
  }

  function openLinkModal() {
    const linked = documents.map((d) => d.id)
    allDocuments = getAllDocuments(appState.dbInstance).filter((d) => !linked.includes(d.id))
    linkSelected = []
    showLinkModal = true
  }

  function toggleLink(id) {
    if (linkSelected.includes(id)) {
      linkSelected = linkSelected.filter((x) => x !== id)
    } else {
      linkSelected = [...linkSelected, id]
    }
  }

  function confirmLink() {
    for (const docId of linkSelected) {
      linkDocumentToFirearm(appState.dbInstance, docId, firearmId, null)
    }
    markDirty()
    showLinkModal = false
    load()
  }
</script>

{#if showUpload}
  <DocumentUpload {firearmId} onClose={closeUpload} />
{/if}

{#if showLinkModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true">
    <div class="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
      <h2 class="mb-4 text-lg font-semibold text-text-primary">Link Existing Documents</h2>
      {#if allDocuments.length === 0}
        <p class="text-sm text-text-muted">No unlinked documents available.</p>
      {:else}
        <div class="max-h-60 overflow-y-auto rounded border border-border bg-surface-raised p-2 mb-4">
          {#each allDocuments as doc (doc.id)}
            <label class="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-surface">
              <input type="checkbox" checked={linkSelected.includes(doc.id)} onchange={() => toggleLink(doc.id)} class="rounded" />
              <span class="text-sm text-text-primary">{doc.filename}</span>
            </label>
          {/each}
        </div>
      {/if}
      <div class="flex justify-end gap-3">
        <button type="button" onclick={() => (showLinkModal = false)} class="rounded bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-border">Cancel</button>
        <button type="button" onclick={confirmLink} disabled={linkSelected.length === 0} class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover disabled:opacity-50">Link Selected</button>
      </div>
    </div>
  </div>
{/if}

<div class="flex items-center justify-between mb-4">
  <h2 class="text-lg font-semibold text-text-primary">Documents</h2>
  <div class="flex gap-2">
    {#if firearmId}
      <button type="button" onclick={openLinkModal} class="rounded bg-surface-raised px-3 py-2 text-sm font-medium text-text-primary hover:bg-border">
        Link existing
      </button>
    {/if}
    <button type="button" onclick={() => (showUpload = true)} class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover">
      Upload Document
    </button>
  </div>
</div>

{#if documents.length === 0}
  <p class="text-sm text-text-muted">{strings.empty.documents}</p>
{:else}
  <div class="overflow-x-auto rounded bg-surface">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-text-muted">
          <th class="px-4 py-3 font-medium">Filename</th>
          <th class="px-4 py-3 font-medium">Type</th>
          <th class="px-4 py-3 font-medium">Uploaded</th>
          {#if !firearmId}
            <th class="px-4 py-3 font-medium">Firearms</th>
          {/if}
          <th class="px-4 py-3 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each documents as doc (doc.id)}
          <tr class="border-b border-border">
            <td class="px-4 py-3 text-text-primary">{doc.filename}</td>
            <td class="px-4 py-3 text-text-muted">{doc.doc_type ?? '—'}</td>
            <td class="px-4 py-3 text-text-muted">{fromEpoch(doc.uploaded_at)}</td>
            {#if !firearmId}
              <td class="px-4 py-3 text-text-muted">—</td>
            {/if}
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button type="button" onclick={() => handleView(doc)} class="text-xs text-text-muted hover:text-text-primary" aria-label="View {doc.filename}">View</button>
                <button type="button" onclick={() => handleDownload(doc)} class="text-xs text-text-muted hover:text-text-primary" aria-label="Download {doc.filename}">Download</button>
                <button
                  type="button"
                  onclick={() => handleDelete(doc)}
                  class="text-xs text-danger hover:opacity-80"
                  aria-label={firearmId ? `Unlink ${doc.filename}` : `Delete ${doc.filename}`}
                >
                  {firearmId ? 'Unlink' : 'Delete'}
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
