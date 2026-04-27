/**
 * Browser file access — File System Access API with Firefox fallbacks.
 * All functions are browser-only. Never import from cli/ or Node environments.
 */

import { saveHandle } from './idb.js'

/**
 * Open a .db file from the user's filesystem.
 * Returns { bytes: Uint8Array, handle: FileSystemFileHandle | null }
 */
export async function openFile() {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'SQLite Database',
          accept: { 'application/x-sqlite3': ['.db'] },
        },
      ],
      multiple: false,
    })
    const file = await handle.getFile()
    const buffer = await file.arrayBuffer()
    await saveHandle(handle)
    return { bytes: new Uint8Array(buffer), handle }
  }

  // Firefox fallback: hidden file input
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.db'
    input.style.display = 'none'
    document.body.appendChild(input)

    input.addEventListener('change', async () => {
      const file = input.files[0]
      document.body.removeChild(input)
      if (!file) {
        reject(new Error('No file selected'))
        return
      }
      try {
        const buffer = await file.arrayBuffer()
        resolve({ bytes: new Uint8Array(buffer), handle: null })
      } catch (e) {
        reject(e)
      }
    })

    input.click()
  })
}

/**
 * Save bytes to a file.
 * If existingHandle provided: overwrites in place.
 * If no handle but showSaveFilePicker available: shows picker, returns new handle.
 * Firefox fallback: triggers a download.
 *
 * Returns the FileSystemFileHandle used (existingHandle, new handle, or null for fallback).
 */
export async function saveFile(bytes, existingHandle) {
  if (existingHandle) {
    const writable = await existingHandle.createWritable()
    await writable.write(bytes)
    await writable.close()
    return existingHandle
  }

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'firearms.db',
      types: [
        {
          description: 'SQLite Database',
          accept: { 'application/x-sqlite3': ['.db'] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    await saveHandle(handle)
    return handle
  }

  // Firefox fallback: download
  _downloadBytes(bytes, 'firearms.db')
  return null
}

/**
 * Always shows picker (or falls back to download). Ignores any existing handle.
 * Returns the new FileSystemFileHandle, or null for the fallback.
 */
export async function saveFileAs(bytes) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'firearms.db',
      types: [
        {
          description: 'SQLite Database',
          accept: { 'application/x-sqlite3': ['.db'] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    await saveHandle(handle)
    return handle
  }

  // Firefox fallback: download
  _downloadBytes(bytes, 'firearms.db')
  return null
}

function _downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
