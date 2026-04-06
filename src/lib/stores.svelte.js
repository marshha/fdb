// Svelte 5 module state — all app state in one reactive object.
// Components read properties directly: import { appState } from '$lib/stores.svelte.js'
export const appState = $state({
  // Active SQLite DB instance
  dbInstance: null,

  // FileHandle from File System Access API (null if fallback used)
  fileHandle: null,

  // Filename for display in document.title
  openFilename: null,

  // Unsaved changes flag
  isDirty: false,

  // Navigation: 'landing' | 'firearms' | 'firearm-detail' | 'documents'
  currentView: 'landing',

  // Currently selected firearm id (for detail view)
  selectedFirearmId: null,

  // Toast notifications: [{ id, message, type }]
  toasts: [],

  // Modal state: null | { title, message, onConfirm } | { title, message, isError }
  modalState: null,
})

export function markDirty() {
  appState.isDirty = true
}
export function markClean() {
  appState.isDirty = false
}

export function showToast(message, type = 'success') {
  const id = Date.now()
  appState.toasts = [...appState.toasts, { id, message, type }]
  setTimeout(() => {
    appState.toasts = appState.toasts.filter((t) => t.id !== id)
  }, 4000)
}

export function showConfirm({ title, message, onConfirm }) {
  appState.modalState = { title, message, onConfirm }
}

export function showError({ title, message }) {
  appState.modalState = { title, message, isError: true }
}

export function closeModal() {
  appState.modalState = null
}
