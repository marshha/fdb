import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openFile, saveFile } from '../../cli/fileAccess.js'
import {
  initSqlite,
  createDatabase,
  exportDatabase,
  openDatabase,
  insertFirearm,
  getFirearm,
} from '../../src/lib/db.js'

await initSqlite()

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fdb-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── saveFile / openFile ────────────────────────────────────────────────────────

describe('saveFile / openFile', () => {
  it('bytes written by saveFile are returned identically by openFile', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const path = join(tmpDir, 'test.bin')
    saveFile(bytes, path)
    const result = openFile(path)
    expect(result).toEqual(bytes)
  })

  it('saveFile overwrites an existing file without error', () => {
    const path = join(tmpDir, 'overwrite.bin')
    saveFile(new Uint8Array([10, 20]), path)
    saveFile(new Uint8Array([30, 40, 50]), path)
    const result = openFile(path)
    expect(result).toEqual(new Uint8Array([30, 40, 50]))
  })

  it('openFile on a non-existent path throws', () => {
    expect(() => openFile(join(tmpDir, 'does-not-exist.bin'))).toThrow()
  })
})

// ── round-trip with db ────────────────────────────────────────────────────────

describe('round-trip with db', () => {
  it('createDatabase → exportDatabase → saveFile → openFile → openDatabase preserves all data', async () => {
    const db = await createDatabase()
    const firearmData = {
      name: 'Test Rifle',
      serial_number: 'RT-001',
      manufacturer: 'Acme',
      caliber: '5.56',
      purchase_price: 900,
      purchase_date: new Date(2024, 0, 1).getTime(),
      ffl_dealer: 'Shop A',
      notes: 'Notes here',
    }
    const id = insertFirearm(db, firearmData)
    const bytes = exportDatabase(db)
    db.close()

    const path = join(tmpDir, 'round-trip.db')
    saveFile(bytes, path)

    const loaded = openFile(path)
    const db2 = await openDatabase(loaded)
    const row = getFirearm(db2, id)
    expect(row.name).toBe(firearmData.name)
    expect(row.serial_number).toBe(firearmData.serial_number)
    db2.close()
  })
})
