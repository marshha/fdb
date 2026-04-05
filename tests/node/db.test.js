import { describe, it, expect, beforeEach } from 'vitest'
import {
  initSqlite,
  createDatabase,
  openDatabase,
  exportDatabase,
  toEpoch,
  fromEpoch,
  CURRENT_SCHEMA_VERSION,
  getAllFirearms,
  getFirearm,
  insertFirearm,
  updateFirearm,
  deleteFirearm,
  getRoundCounts,
  insertRoundCount,
  updateRoundCount,
  deleteRoundCount,
  getCumulativeRounds,
  getEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
  getAllDocuments,
  getDocumentsForFirearm,
  insertDocument,
  linkDocumentToFirearm,
  unlinkDocumentFromFirearm,
  getDocumentBlob,
  deleteDocument,
} from '../../src/lib/db.js'

// Initialise once for the entire test suite
await initSqlite()

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFirearm(overrides = {}) {
  return {
    name: 'Test Rifle',
    serial_number: 'SN-001',
    manufacturer: 'Acme',
    caliber: '5.56',
    purchase_price: 800.0,
    purchase_date: toEpoch(new Date(2023, 0, 1)),
    ffl_dealer: 'Dealer A',
    notes: 'Good gun',
    ...overrides,
  }
}

// ── createDatabase ─────────────────────────────────────────────────────────────

describe('createDatabase()', () => {
  it('creates all 6 tables', async () => {
    const db = await createDatabase()
    const rows = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      { returnValue: 'resultRows' },
    )
    const names = rows.map((r) => r[0])
    expect(names).toContain('firearms')
    expect(names).toContain('round_counts')
    expect(names).toContain('documents')
    expect(names).toContain('firearm_documents')
    expect(names).toContain('events')
    expect(names).toContain('meta')
    db.close()
  })

  it("seeds meta with schema_version = '1'", async () => {
    const db = await createDatabase()
    const rows = db.exec(`SELECT value FROM meta WHERE key = 'schema_version'`, {
      returnValue: 'resultRows',
    })
    expect(rows[0][0]).toBe('1')
    db.close()
  })
})

// ── insertFirearm / getFirearm ─────────────────────────────────────────────────

describe('insertFirearm / getFirearm', () => {
  let db
  beforeEach(async () => {
    db = await createDatabase()
  })

  it('round-trip: inserted data matches retrieved data', () => {
    const data = makeFirearm()
    const id = insertFirearm(db, data)
    const row = getFirearm(db, id)
    expect(row.name).toBe(data.name)
    expect(row.serial_number).toBe(data.serial_number)
    expect(row.manufacturer).toBe(data.manufacturer)
    expect(row.caliber).toBe(data.caliber)
    expect(row.purchase_price).toBe(data.purchase_price)
    expect(row.purchase_date).toBe(data.purchase_date)
    expect(row.ffl_dealer).toBe(data.ffl_dealer)
    expect(row.notes).toBe(data.notes)
  })

  it('returns null for unknown id', () => {
    expect(getFirearm(db, 99999)).toBeNull()
  })
})

// ── updateFirearm ─────────────────────────────────────────────────────────────

describe('updateFirearm', () => {
  let db
  beforeEach(async () => {
    db = await createDatabase()
  })

  it('persists changed fields', () => {
    const id = insertFirearm(db, makeFirearm())
    const updated = makeFirearm({ name: 'Updated Name', caliber: '.308' })
    updateFirearm(db, id, updated)
    const row = getFirearm(db, id)
    expect(row.name).toBe('Updated Name')
    expect(row.caliber).toBe('.308')
  })

  it('does not affect other records', () => {
    const id1 = insertFirearm(db, makeFirearm({ serial_number: 'SN-A' }))
    const id2 = insertFirearm(db, makeFirearm({ name: 'Other Gun', serial_number: 'SN-B' }))
    updateFirearm(db, id1, makeFirearm({ name: 'Changed', serial_number: 'SN-A' }))
    const row2 = getFirearm(db, id2)
    expect(row2.name).toBe('Other Gun')
  })
})

// ── deleteFirearm ─────────────────────────────────────────────────────────────

describe('deleteFirearm', () => {
  let db
  beforeEach(async () => {
    db = await createDatabase()
  })

  it('removes the firearm record', () => {
    const id = insertFirearm(db, makeFirearm())
    deleteFirearm(db, id)
    expect(getFirearm(db, id)).toBeNull()
  })

  it('removes all linked round_counts in the same transaction', () => {
    const id = insertFirearm(db, makeFirearm())
    insertRoundCount(db, { firearm_id: id, date: Date.now(), rounds_fired: 50 })
    deleteFirearm(db, id)
    const rows = db.exec('SELECT * FROM round_counts WHERE firearm_id = ?', {
      bind: [id],
      returnValue: 'resultRows',
    })
    expect(rows).toHaveLength(0)
  })

  it('removes all linked events in the same transaction', () => {
    const id = insertFirearm(db, makeFirearm())
    insertEvent(db, { firearm_id: id, event_type: 'maintenance', date: Date.now(), title: 'Clean' })
    deleteFirearm(db, id)
    const rows = db.exec('SELECT * FROM events WHERE firearm_id = ?', {
      bind: [id],
      returnValue: 'resultRows',
    })
    expect(rows).toHaveLength(0)
  })

  it('removes all linked firearm_documents in the same transaction', () => {
    const id = insertFirearm(db, makeFirearm())
    const docId = insertDocument(db, {
      filename: 'test.pdf',
      fileData: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
      docType: 'manual',
    })
    linkDocumentToFirearm(db, docId, id, null)
    deleteFirearm(db, id)
    const rows = db.exec('SELECT * FROM firearm_documents WHERE firearm_id = ?', {
      bind: [id],
      returnValue: 'resultRows',
    })
    expect(rows).toHaveLength(0)
  })
})

// ── serial_number uniqueness ───────────────────────────────────────────────────

describe('serial_number uniqueness', () => {
  let db
  beforeEach(async () => {
    db = await createDatabase()
  })

  it('inserting duplicate serial throws a constraint error', () => {
    insertFirearm(db, makeFirearm({ serial_number: 'DUP-001' }))
    expect(() => insertFirearm(db, makeFirearm({ name: 'Other', serial_number: 'DUP-001' }))).toThrow()
  })

  it('error message is detectable as a UNIQUE constraint violation', () => {
    insertFirearm(db, makeFirearm({ serial_number: 'DUP-002' }))
    let caughtMsg = ''
    try {
      insertFirearm(db, makeFirearm({ name: 'Other', serial_number: 'DUP-002' }))
    } catch (e) {
      caughtMsg = e.message
    }
    expect(caughtMsg.toUpperCase()).toContain('UNIQUE')
  })
})

// ── getAllFirearms ─────────────────────────────────────────────────────────────

describe('getAllFirearms', () => {
  let db
  beforeEach(async () => {
    db = await createDatabase()
  })

  it('returns total_rounds = 0 when no sessions logged', () => {
    insertFirearm(db, makeFirearm())
    const rows = getAllFirearms(db)
    expect(rows[0].total_rounds).toBe(0)
  })

  it('returns correct SUM of rounds across multiple sessions', () => {
    const id = insertFirearm(db, makeFirearm())
    insertRoundCount(db, { firearm_id: id, date: Date.now(), rounds_fired: 50 })
    insertRoundCount(db, { firearm_id: id, date: Date.now() + 1000, rounds_fired: 30 })
    const rows = getAllFirearms(db)
    expect(rows[0].total_rounds).toBe(80)
  })

  it('results are ordered by name ascending', () => {
    insertFirearm(db, makeFirearm({ name: 'Zebra', serial_number: 'SN-Z' }))
    insertFirearm(db, makeFirearm({ name: 'Alpha', serial_number: 'SN-A' }))
    insertFirearm(db, makeFirearm({ name: 'Mango', serial_number: 'SN-M' }))
    const rows = getAllFirearms(db)
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Mango', 'Zebra'])
  })
})

// ── getRoundCounts / insertRoundCount ─────────────────────────────────────────

describe('getRoundCounts / insertRoundCount', () => {
  let db, firearmId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
  })

  it('round-trip: inserted data matches retrieved data', () => {
    const date = toEpoch(new Date(2025, 5, 15))
    const rcId = insertRoundCount(db, { firearm_id: firearmId, date, rounds_fired: 100, notes: 'range day' })
    const rows = getRoundCounts(db, firearmId)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(rcId)
    expect(rows[0].firearm_id).toBe(firearmId)
    expect(rows[0].date).toBe(date)
    expect(rows[0].rounds_fired).toBe(100)
    expect(rows[0].notes).toBe('range day')
  })

  it('results ordered by date ascending', () => {
    const d1 = toEpoch(new Date(2025, 0, 1))
    const d2 = toEpoch(new Date(2025, 6, 1))
    const d3 = toEpoch(new Date(2025, 3, 1))
    insertRoundCount(db, { firearm_id: firearmId, date: d2, rounds_fired: 20 })
    insertRoundCount(db, { firearm_id: firearmId, date: d1, rounds_fired: 10 })
    insertRoundCount(db, { firearm_id: firearmId, date: d3, rounds_fired: 15 })
    const rows = getRoundCounts(db, firearmId)
    expect(rows.map((r) => r.date)).toEqual([d1, d3, d2])
  })
})

// ── updateRoundCount / deleteRoundCount ───────────────────────────────────────

describe('updateRoundCount / deleteRoundCount', () => {
  let db, firearmId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
  })

  it('update persists changes', () => {
    const id = insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 50 })
    const newDate = toEpoch(new Date(2026, 0, 1))
    updateRoundCount(db, id, { date: newDate, rounds_fired: 75, notes: 'updated' })
    const rows = getRoundCounts(db, firearmId)
    expect(rows[0].rounds_fired).toBe(75)
    expect(rows[0].notes).toBe('updated')
    expect(rows[0].date).toBe(newDate)
  })

  it('delete removes the record', () => {
    const id = insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 50 })
    deleteRoundCount(db, id)
    expect(getRoundCounts(db, firearmId)).toHaveLength(0)
  })
})

// ── getCumulativeRounds ────────────────────────────────────────────────────────

describe('getCumulativeRounds', () => {
  let db, firearmId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
  })

  it('single session: cumulative equals rounds_fired', () => {
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 42 })
    const rows = getCumulativeRounds(db, firearmId)
    expect(rows).toHaveLength(1)
    expect(rows[0].cumulative).toBe(42)
  })

  it('multiple sessions: cumulative is a running total in date order', () => {
    const d1 = toEpoch(new Date(2025, 0, 1))
    const d2 = toEpoch(new Date(2025, 3, 1))
    const d3 = toEpoch(new Date(2025, 6, 1))
    insertRoundCount(db, { firearm_id: firearmId, date: d3, rounds_fired: 30 })
    insertRoundCount(db, { firearm_id: firearmId, date: d1, rounds_fired: 10 })
    insertRoundCount(db, { firearm_id: firearmId, date: d2, rounds_fired: 20 })
    const rows = getCumulativeRounds(db, firearmId)
    expect(rows.map((r) => r.cumulative)).toEqual([10, 30, 60])
  })

  it('returns empty array when no sessions', () => {
    expect(getCumulativeRounds(db, firearmId)).toHaveLength(0)
  })
})

// ── getEvents / insertEvent ────────────────────────────────────────────────────

describe('getEvents / insertEvent', () => {
  let db, firearmId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
  })

  it('round-trip: inserted data matches retrieved data', () => {
    const date = toEpoch(new Date(2025, 3, 1))
    const id = insertEvent(db, {
      firearm_id: firearmId,
      event_type: 'maintenance',
      date,
      title: 'Oil Change',
      description: 'Full cleaning',
    })
    const rows = getEvents(db, firearmId)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(id)
    expect(rows[0].event_type).toBe('maintenance')
    expect(rows[0].date).toBe(date)
    expect(rows[0].title).toBe('Oil Change')
    expect(rows[0].description).toBe('Full cleaning')
  })

  it('created_at is set automatically', () => {
    const before = Date.now()
    insertEvent(db, { firearm_id: firearmId, event_type: 'other', date: Date.now(), title: 'T' })
    const after = Date.now()
    const rows = getEvents(db, firearmId)
    expect(rows[0].created_at).toBeGreaterThanOrEqual(before)
    expect(rows[0].created_at).toBeLessThanOrEqual(after)
  })

  it('results ordered by date descending', () => {
    const d1 = toEpoch(new Date(2025, 0, 1))
    const d2 = toEpoch(new Date(2025, 6, 1))
    insertEvent(db, { firearm_id: firearmId, event_type: 'other', date: d1, title: 'A' })
    insertEvent(db, { firearm_id: firearmId, event_type: 'other', date: d2, title: 'B' })
    const rows = getEvents(db, firearmId)
    expect(rows.map((r) => r.title)).toEqual(['B', 'A'])
  })
})

// ── updateEvent / deleteEvent ─────────────────────────────────────────────────

describe('updateEvent / deleteEvent', () => {
  let db, firearmId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
  })

  it('update persists changes', () => {
    const id = insertEvent(db, { firearm_id: firearmId, event_type: 'other', date: Date.now(), title: 'Old' })
    updateEvent(db, id, { event_type: 'maintenance', date: Date.now(), title: 'New', description: 'desc' })
    const rows = getEvents(db, firearmId)
    expect(rows[0].title).toBe('New')
    expect(rows[0].event_type).toBe('maintenance')
    expect(rows[0].description).toBe('desc')
  })

  it('delete removes the record', () => {
    const id = insertEvent(db, { firearm_id: firearmId, event_type: 'other', date: Date.now(), title: 'T' })
    deleteEvent(db, id)
    expect(getEvents(db, firearmId)).toHaveLength(0)
  })
})

// ── insertDocument / getDocumentBlob ──────────────────────────────────────────

describe('insertDocument / getDocumentBlob', () => {
  let db
  beforeEach(async () => {
    db = await createDatabase()
  })

  it('stored BLOB bytes match retrieved bytes exactly', () => {
    const fileData = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const id = insertDocument(db, { filename: 'test.pdf', fileData, mimeType: 'application/pdf', docType: 'manual' })
    const blob = getDocumentBlob(db, id)
    expect(blob.file_data).toEqual(fileData)
  })

  it('mime_type and filename are preserved', () => {
    const id = insertDocument(db, {
      filename: 'warranty.pdf',
      fileData: new Uint8Array([1]),
      mimeType: 'application/pdf',
      docType: 'warranty',
    })
    const blob = getDocumentBlob(db, id)
    expect(blob.mime_type).toBe('application/pdf')
    expect(blob.filename).toBe('warranty.pdf')
  })
})

// ── linkDocumentToFirearm / unlinkDocumentFromFirearm ─────────────────────────

describe('linkDocumentToFirearm / unlinkDocumentFromFirearm', () => {
  let db, firearmId, docId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
    docId = insertDocument(db, {
      filename: 'manual.pdf',
      fileData: new Uint8Array([1, 2]),
      mimeType: 'application/pdf',
      docType: 'manual',
    })
  })

  it('link makes document appear in getDocumentsForFirearm', () => {
    linkDocumentToFirearm(db, docId, firearmId, null)
    const docs = getDocumentsForFirearm(db, firearmId)
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe(docId)
  })

  it('unlink removes it from getDocumentsForFirearm', () => {
    linkDocumentToFirearm(db, docId, firearmId, null)
    unlinkDocumentFromFirearm(db, docId, firearmId)
    expect(getDocumentsForFirearm(db, firearmId)).toHaveLength(0)
  })

  it('document still exists in getAllDocuments after unlink', () => {
    linkDocumentToFirearm(db, docId, firearmId, null)
    unlinkDocumentFromFirearm(db, docId, firearmId)
    const all = getAllDocuments(db)
    expect(all.some((d) => d.id === docId)).toBe(true)
  })
})

// ── deleteDocument ────────────────────────────────────────────────────────────

describe('deleteDocument', () => {
  let db, firearmId, docId
  beforeEach(async () => {
    db = await createDatabase()
    firearmId = insertFirearm(db, makeFirearm())
    docId = insertDocument(db, {
      filename: 'doc.pdf',
      fileData: new Uint8Array([9]),
      mimeType: 'application/pdf',
      docType: null,
    })
    linkDocumentToFirearm(db, docId, firearmId, null)
  })

  it('removes the document record', () => {
    deleteDocument(db, docId)
    expect(getDocumentBlob(db, docId)).toBeNull()
  })

  it('removes all firearm_documents rows in the same transaction', () => {
    deleteDocument(db, docId)
    const rows = db.exec('SELECT * FROM firearm_documents WHERE document_id = ?', {
      bind: [docId],
      returnValue: 'resultRows',
    })
    expect(rows).toHaveLength(0)
  })
})

// ── export / import round-trip ────────────────────────────────────────────────

describe('export / import round-trip', () => {
  it('export → re-import → all firearms, rounds, events, documents intact', async () => {
    const db = await createDatabase()
    const firearmId = insertFirearm(db, makeFirearm())
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 100 })
    insertEvent(db, { firearm_id: firearmId, event_type: 'other', date: Date.now(), title: 'Test Event' })
    const docId = insertDocument(db, {
      filename: 'file.pdf',
      fileData: new Uint8Array([5, 6, 7]),
      mimeType: 'application/pdf',
      docType: null,
    })
    linkDocumentToFirearm(db, docId, firearmId, null)

    const bytes = exportDatabase(db)
    db.close()

    const db2 = await openDatabase(bytes)
    expect(getAllFirearms(db2)).toHaveLength(1)
    expect(getRoundCounts(db2, firearmId)).toHaveLength(1)
    expect(getEvents(db2, firearmId)).toHaveLength(1)
    expect(getAllDocuments(db2)).toHaveLength(1)
    db2.close()
  })
})

// ── openDatabase — schema migration ───────────────────────────────────────────

describe('openDatabase — schema migration', () => {
  it('database with no meta table is treated as version 0', async () => {
    const sqlite3 = await initSqlite()
    // Build a DB with no meta table
    const db = new sqlite3.oo1.DB(':memory:')
    db.exec('CREATE TABLE firearms (id INTEGER PRIMARY KEY)')
    const bytes = sqlite3.capi.sqlite3_js_db_export(db)
    db.close()

    const db2 = await openDatabase(bytes)
    // Should not throw and schema_version should now be CURRENT
    const rows = db2.exec(`SELECT value FROM meta WHERE key = 'schema_version'`, {
      returnValue: 'resultRows',
    })
    expect(rows[0][0]).toBe(String(CURRENT_SCHEMA_VERSION))
    db2.close()
  })

  it('migrations run in sequence to reach CURRENT_SCHEMA_VERSION', async () => {
    // Since MIGRATIONS is empty and CURRENT_SCHEMA_VERSION is 1, a v0 DB (no meta table)
    // should still end up at version 1 after openDatabase
    const sqlite3 = await initSqlite()
    const db = new sqlite3.oo1.DB(':memory:')
    const bytes = sqlite3.capi.sqlite3_js_db_export(db)
    db.close()

    const db2 = await openDatabase(bytes)
    const rows = db2.exec(`SELECT value FROM meta WHERE key = 'schema_version'`, {
      returnValue: 'resultRows',
    })
    expect(parseInt(rows[0][0], 10)).toBe(CURRENT_SCHEMA_VERSION)
    db2.close()
  })

  it('schema_version in meta equals CURRENT_SCHEMA_VERSION after migration', async () => {
    const db = await createDatabase()
    const bytes = exportDatabase(db)
    db.close()

    const db2 = await openDatabase(bytes)
    const rows = db2.exec(`SELECT value FROM meta WHERE key = 'schema_version'`, {
      returnValue: 'resultRows',
    })
    expect(parseInt(rows[0][0], 10)).toBe(CURRENT_SCHEMA_VERSION)
    db2.close()
  })
})

// ── toEpoch / fromEpoch ───────────────────────────────────────────────────────

describe('toEpoch / fromEpoch', () => {
  it('toEpoch(new Date(2026, 3, 4)) returns correct ms', () => {
    const ms = toEpoch(new Date(2026, 3, 4))
    expect(ms).toBe(new Date(2026, 3, 4).getTime())
  })

  it('fromEpoch(toEpoch(date)) returns a non-empty display string', () => {
    const date = new Date(2026, 3, 4)
    const result = fromEpoch(toEpoch(date))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
