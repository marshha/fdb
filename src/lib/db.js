import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

export const CURRENT_SCHEMA_VERSION = 1

// Migration functions indexed by the version they upgrade TO.
// To add a migration: append a function to this array and increment
// CURRENT_SCHEMA_VERSION. Entry at index 0 upgrades from v0 → v1, etc.
// Currently empty — no migrations exist for v1.
const MIGRATIONS = [
  // async (db) => { /* upgrade from v0 to v1 */ }
]

const SCHEMA_SQL = `
CREATE TABLE firearms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    serial_number   TEXT UNIQUE NOT NULL,
    manufacturer    TEXT,
    caliber         TEXT,
    purchase_price  REAL,
    purchase_date   INTEGER,
    ffl_dealer      TEXT,
    notes           TEXT
);
CREATE TABLE round_counts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    firearm_id      INTEGER NOT NULL,
    date            INTEGER NOT NULL,
    rounds_fired    INTEGER NOT NULL,
    notes           TEXT,
    FOREIGN KEY (firearm_id) REFERENCES firearms(id)
);
CREATE TABLE documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type    TEXT,
    filename    TEXT NOT NULL,
    file_data   BLOB NOT NULL,
    mime_type   TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL
);
CREATE TABLE firearm_documents (
    firearm_id  INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    notes       TEXT,
    PRIMARY KEY (firearm_id, document_id),
    FOREIGN KEY (firearm_id) REFERENCES firearms(id),
    FOREIGN KEY (document_id) REFERENCES documents(id)
);
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    firearm_id  INTEGER NOT NULL,
    event_type  TEXT NOT NULL,
    date        INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (firearm_id) REFERENCES firearms(id)
);
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`

let _sqlite3 = null
export async function initSqlite() {
  if (_sqlite3) return _sqlite3
  _sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} })
  return _sqlite3
}

export async function createDatabase() {
  const sqlite3 = await initSqlite()
  const db = new sqlite3.oo1.DB(':memory:')
  db.exec(SCHEMA_SQL)
  db.exec(`INSERT INTO meta (key, value) VALUES ('schema_version', '1')`)
  return db
}

export async function openDatabase(bytes) {
  const sqlite3 = await initSqlite()
  const { capi, wasm } = sqlite3

  const db = new sqlite3.oo1.DB(':memory:')

  const ptr = wasm.allocFromTypedArray(bytes)
  const rc = capi.sqlite3_deserialize(
    db.pointer,
    'main',
    ptr,
    bytes.byteLength,
    bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
  )
  if (rc !== 0) {
    db.close()
    throw new Error(`sqlite3_deserialize failed with code ${rc}`)
  }

  // Determine current schema version; missing meta table = version 0
  let version = 0
  try {
    const rows = db.exec(`SELECT value FROM meta WHERE key = 'schema_version'`, {
      returnValue: 'resultRows',
    })
    if (rows.length > 0) {
      version = parseInt(rows[0][0], 10)
    }
  } catch {
    version = 0
  }

  // Run any pending migrations in a single transaction
  if (version < CURRENT_SCHEMA_VERSION) {
    db.exec('BEGIN')
    try {
      for (let i = version; i < CURRENT_SCHEMA_VERSION; i++) {
        if (MIGRATIONS[i]) {
          await MIGRATIONS[i](db)
        }
      }
      // Ensure the meta table exists before writing schema_version
      db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
      db.exec(
        `INSERT INTO meta (key, value) VALUES ('schema_version', '${CURRENT_SCHEMA_VERSION}')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      db.close()
      throw e
    }
  }

  return db
}

export function exportDatabase(db) {
  const sqlite3 = _sqlite3
  return sqlite3.capi.sqlite3_js_db_export(db)
}

export function toEpoch(value) {
  // Accepts a Date object, ISO string, or epoch ms integer
  return new Date(value).getTime()
}

export function fromEpoch(ms) {
  // Returns locale-formatted date string for display in browser UI and CLI table output.
  // Intentionally separate from strings.chart.dateFormat, which is a date-fns format string
  // consumed by chartjs-adapter-date-fns — a different rendering path entirely.
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

// ── Firearms ──────────────────────────────────────────────────────────────────

export function getAllFirearms(db) {
  return db.exec(
    `SELECT f.id, f.name, f.serial_number, f.manufacturer, f.caliber,
            f.purchase_price, f.purchase_date, f.ffl_dealer, f.notes,
            COALESCE(SUM(r.rounds_fired), 0) AS total_rounds
     FROM firearms f
     LEFT JOIN round_counts r ON r.firearm_id = f.id
     GROUP BY f.id
     ORDER BY f.name ASC`,
    { returnValue: 'resultRows', rowMode: 'object' },
  )
}

export function getFirearm(db, id) {
  const rows = db.exec(`SELECT * FROM firearms WHERE id = ?`, {
    bind: [id],
    returnValue: 'resultRows',
    rowMode: 'object',
  })
  return rows.length > 0 ? rows[0] : null
}

export function insertFirearm(db, data) {
  db.exec(
    `INSERT INTO firearms (name, serial_number, manufacturer, caliber, purchase_price, purchase_date, ffl_dealer, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    {
      bind: [
        data.name,
        data.serial_number,
        data.manufacturer ?? null,
        data.caliber ?? null,
        data.purchase_price ?? null,
        data.purchase_date ?? null,
        data.ffl_dealer ?? null,
        data.notes ?? null,
      ],
    },
  )
  return db.exec('SELECT last_insert_rowid() AS id', { returnValue: 'resultRows' })[0][0]
}

export function updateFirearm(db, id, data) {
  db.exec(
    `UPDATE firearms SET name = ?, serial_number = ?, manufacturer = ?, caliber = ?,
     purchase_price = ?, purchase_date = ?, ffl_dealer = ?, notes = ?
     WHERE id = ?`,
    {
      bind: [
        data.name,
        data.serial_number,
        data.manufacturer ?? null,
        data.caliber ?? null,
        data.purchase_price ?? null,
        data.purchase_date ?? null,
        data.ffl_dealer ?? null,
        data.notes ?? null,
        id,
      ],
    },
  )
}

export function deleteFirearm(db, id) {
  db.exec('BEGIN')
  try {
    db.exec('DELETE FROM firearm_documents WHERE firearm_id = ?', { bind: [id] })
    db.exec('DELETE FROM events WHERE firearm_id = ?', { bind: [id] })
    db.exec('DELETE FROM round_counts WHERE firearm_id = ?', { bind: [id] })
    db.exec('DELETE FROM firearms WHERE id = ?', { bind: [id] })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ── Round counts ──────────────────────────────────────────────────────────────

export function getRoundCounts(db, firearmId) {
  return db.exec(
    `SELECT * FROM round_counts WHERE firearm_id = ? ORDER BY date ASC`,
    { bind: [firearmId], returnValue: 'resultRows', rowMode: 'object' },
  )
}

export function insertRoundCount(db, data) {
  db.exec(
    `INSERT INTO round_counts (firearm_id, date, rounds_fired, notes)
     VALUES (?, ?, ?, ?)`,
    {
      bind: [
        data.firearm_id,
        data.date,
        data.rounds_fired,
        data.notes ?? null,
      ],
    },
  )
  return db.exec('SELECT last_insert_rowid() AS id', { returnValue: 'resultRows' })[0][0]
}

export function updateRoundCount(db, id, data) {
  db.exec(
    `UPDATE round_counts SET date = ?, rounds_fired = ?, notes = ? WHERE id = ?`,
    {
      bind: [
        data.date,
        data.rounds_fired,
        data.notes ?? null,
        id,
      ],
    },
  )
}

export function deleteRoundCount(db, id) {
  db.exec('DELETE FROM round_counts WHERE id = ?', { bind: [id] })
}

export function getCumulativeRounds(db, firearmId) {
  return db.exec(
    `SELECT date, SUM(rounds_fired) OVER (ORDER BY date) AS cumulative
     FROM round_counts
     WHERE firearm_id = ?
     ORDER BY date ASC`,
    { bind: [firearmId], returnValue: 'resultRows', rowMode: 'object' },
  )
}

// ── Events ────────────────────────────────────────────────────────────────────

export function getEvents(db, firearmId) {
  return db.exec(
    `SELECT * FROM events WHERE firearm_id = ? ORDER BY date DESC`,
    { bind: [firearmId], returnValue: 'resultRows', rowMode: 'object' },
  )
}

export function insertEvent(db, data) {
  const now = Date.now()
  db.exec(
    `INSERT INTO events (firearm_id, event_type, date, title, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    {
      bind: [
        data.firearm_id,
        data.event_type,
        data.date,
        data.title,
        data.description ?? null,
        now,
      ],
    },
  )
  return db.exec('SELECT last_insert_rowid() AS id', { returnValue: 'resultRows' })[0][0]
}

export function updateEvent(db, id, data) {
  db.exec(
    `UPDATE events SET event_type = ?, date = ?, title = ?, description = ? WHERE id = ?`,
    {
      bind: [
        data.event_type,
        data.date,
        data.title,
        data.description ?? null,
        id,
      ],
    },
  )
}

export function deleteEvent(db, id) {
  db.exec('DELETE FROM events WHERE id = ?', { bind: [id] })
}

// ── Documents ─────────────────────────────────────────────────────────────────

export function getAllDocuments(db) {
  return db.exec(
    `SELECT id, doc_type, filename, mime_type, uploaded_at FROM documents ORDER BY uploaded_at DESC`,
    { returnValue: 'resultRows', rowMode: 'object' },
  )
}

export function getDocumentsForFirearm(db, firearmId) {
  return db.exec(
    `SELECT d.id, d.doc_type, d.filename, d.mime_type, d.uploaded_at, fd.notes
     FROM documents d
     JOIN firearm_documents fd ON fd.document_id = d.id
     WHERE fd.firearm_id = ?
     ORDER BY d.uploaded_at DESC`,
    { bind: [firearmId], returnValue: 'resultRows', rowMode: 'object' },
  )
}

export function insertDocument(db, { filename, fileData, mimeType, docType }) {
  const now = Date.now()
  db.exec(
    `INSERT INTO documents (doc_type, filename, file_data, mime_type, uploaded_at)
     VALUES (?, ?, ?, ?, ?)`,
    {
      bind: [
        docType ?? null,
        filename,
        fileData,
        mimeType,
        now,
      ],
    },
  )
  return db.exec('SELECT last_insert_rowid() AS id', { returnValue: 'resultRows' })[0][0]
}

export function linkDocumentToFirearm(db, docId, firearmId, notes) {
  db.exec(
    `INSERT INTO firearm_documents (firearm_id, document_id, notes) VALUES (?, ?, ?)`,
    { bind: [firearmId, docId, notes ?? null] },
  )
}

export function unlinkDocumentFromFirearm(db, docId, firearmId) {
  db.exec(
    `DELETE FROM firearm_documents WHERE document_id = ? AND firearm_id = ?`,
    { bind: [docId, firearmId] },
  )
}

export function getDocumentBlob(db, id) {
  const rows = db.exec(
    `SELECT file_data, mime_type, filename FROM documents WHERE id = ?`,
    { bind: [id], returnValue: 'resultRows', rowMode: 'object' },
  )
  return rows.length > 0 ? rows[0] : null
}

export function deleteDocument(db, id) {
  db.exec('BEGIN')
  try {
    db.exec('DELETE FROM firearm_documents WHERE document_id = ?', { bind: [id] })
    db.exec('DELETE FROM documents WHERE id = ?', { bind: [id] })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
