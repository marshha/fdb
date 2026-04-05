import { readFileSync, writeFileSync } from 'fs'

export function openFile(path) {
  return new Uint8Array(readFileSync(path))
}

export function saveFile(bytes, path) {
  writeFileSync(path, bytes)
}
