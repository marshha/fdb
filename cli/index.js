#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join, basename } from 'path'
import { Command } from 'commander'
import { format } from 'date-fns'
import {
  initSqlite,
  openDatabase,
  createDatabase,
  exportDatabase,
  toEpoch,
  getAllFirearms,
  getFirearm,
  insertFirearm,
  updateFirearm,
  deleteFirearm,
  getRoundCounts,
  insertRoundCount,
  updateRoundCount,
  deleteRoundCount,
  getEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
  getAllDocuments,
  getDocumentsForFirearm,
  insertDocument,
  linkDocumentToFirearm,
  deleteDocument,
} from '../src/lib/db.js'
import { openFile, saveFile } from './fileAccess.js'
import { strings } from '../src/lib/strings.js'

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  const configPath = join(homedir(), '.fdbrc')
  if (!existsSync(configPath)) return {}
  try {
    const raw = readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    process.stderr.write(strings.errors.configMalformed + '\n')
    return {}
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(str) {
  // Parse ISO YYYY-MM-DD as local calendar date
  const [year, month, day] = str.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(ms, dateFormat) {
  if (ms == null) return null
  return format(new Date(ms), dateFormat)
}

// ── Output helpers ────────────────────────────────────────────────────────────

const NULL_DISPLAY = 'NULL'

function renderNull(val) {
  return val == null ? NULL_DISPLAY : String(val)
}

function printTable(rows, columns) {
  if (rows.length === 0) return

  // Calculate column widths (header or max value)
  const widths = columns.map((col) => {
    const headerLen = col.length
    const maxVal = Math.max(...rows.map((r) => renderNull(r[col]).length))
    return Math.max(headerLen, maxVal)
  })

  const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ')
  const separator = widths.map((w) => '-'.repeat(w)).join('  ')
  process.stdout.write(header + '\n')
  process.stdout.write(separator + '\n')
  for (const row of rows) {
    const line = columns.map((col, i) => renderNull(row[col]).padEnd(widths[i])).join('  ')
    process.stdout.write(line + '\n')
  }
}

function printJson(rows) {
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
}

// Transform date fields in rows for JSON output using date-fns format string.
// Non-date fields are passed through unchanged; null date fields remain null.
function formatDatesInRows(rows, dateFields, dateFormat) {
  return rows.map((row) => {
    const out = { ...row }
    for (const field of dateFields) {
      if (out[field] != null) {
        out[field] = formatDate(out[field], dateFormat)
      }
    }
    return out
  })
}

// Transform date fields in rows for table output (string conversion only).
function applyDatesToTable(rows, dateFields, dateFormat) {
  return rows.map((row) => {
    const out = { ...row }
    for (const field of dateFields) {
      if (out[field] != null) {
        out[field] = formatDate(out[field], dateFormat)
      }
    }
    return out
  })
}

// ── Initialization ─────────────────────────────────────────────────────────────

async function openDb(dbPath) {
  await initSqlite()
  const bytes = openFile(dbPath)
  return openDatabase(bytes)
}

async function openOrCreateDb(dbPath) {
  await initSqlite()
  if (existsSync(dbPath)) {
    const bytes = openFile(dbPath)
    return openDatabase(bytes)
  }
  return createDatabase()
}

function saveDb(db, dbPath) {
  const out = exportDatabase(db)
  saveFile(out, dbPath)
}

// ── Main ───────────────────────────────────────────────────────────────────────

const config = loadConfig()

const program = new Command()
program
  .name('fdb')
  .description('Firearm database CLI')
  .option('--db <path>', 'Path to database file', config.db)
  .option('--date-format <format>', 'date-fns format string for date output', 'yyyy-MM-dd')

function getDbPath(opts) {
  const dbPath = opts.db ?? program.opts().db
  if (!dbPath) {
    process.stderr.write(strings.errors.missingDb + '\n')
    process.exit(1)
  }
  return dbPath
}

// ── init ───────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a new empty database at the --db path')
  .option('--force', 'Overwrite if the file already exists')
  .action(async (opts) => {
    const dbPath = getDbPath(program.opts())
    if (existsSync(dbPath) && !opts.force) {
      process.stderr.write(`Database already exists: ${dbPath}\nUse --force to overwrite.\n`)
      process.exit(1)
    }
    try {
      await initSqlite()
      const db = await createDatabase()
      saveDb(db, dbPath)
      process.stdout.write(`Database created: ${dbPath}\n`)
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

// ── firearms ───────────────────────────────────────────────────────────────────

const firearms = program.command('firearms')

const FIREARM_COLUMNS = ['id', 'name', 'serial_number', 'manufacturer', 'caliber', 'purchase_price', 'purchase_date', 'ffl_dealer', 'notes']
const FIREARM_DATE_FIELDS = ['purchase_date']

firearms
  .command('list')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    const dateFormat = globalOpts.dateFormat
    try {
      const db = await openDb(dbPath)
      const rows = getAllFirearms(db)
      if (opts.json) {
        printJson(formatDatesInRows(rows, FIREARM_DATE_FIELDS, dateFormat))
      } else {
        if (rows.length === 0) {
          process.stdout.write(strings.empty.firearms + '\n')
        } else {
          printTable(applyDatesToTable(rows, FIREARM_DATE_FIELDS, dateFormat), FIREARM_COLUMNS)
        }
      }
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

firearms
  .command('show <id>')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    const dateFormat = globalOpts.dateFormat
    try {
      const db = await openDb(dbPath)
      const row = getFirearm(db, Number(id))
      if (!row) {
        process.stderr.write(`Firearm ${id} not found.\n`)
        process.exit(1)
      }
      if (opts.json) {
        printJson(formatDatesInRows([row], FIREARM_DATE_FIELDS, dateFormat))
      } else {
        printTable(applyDatesToTable([row], FIREARM_DATE_FIELDS, dateFormat), FIREARM_COLUMNS)
      }
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

firearms
  .command('add')
  .requiredOption('--name <name>', 'Firearm name')
  .requiredOption('--serial <serial>', 'Serial number')
  .option('--manufacturer <manufacturer>', 'Manufacturer')
  .option('--caliber <caliber>', 'Caliber')
  .option('--price <price>', 'Purchase price')
  .option('--date <date>', 'Purchase date (YYYY-MM-DD)')
  .option('--ffl <ffl>', 'FFL dealer')
  .option('--notes <notes>', 'Notes')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openOrCreateDb(dbPath)
      const data = {
        name: opts.name,
        serial_number: opts.serial,
        manufacturer: opts.manufacturer ?? null,
        caliber: opts.caliber ?? null,
        purchase_price: opts.price != null ? Number(opts.price) : null,
        purchase_date: opts.date != null ? toEpoch(parseDate(opts.date)) : null,
        ffl_dealer: opts.ffl ?? null,
        notes: opts.notes ?? null,
      }
      insertFirearm(db, data)
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.firearmAdded + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

firearms
  .command('update <id>')
  .option('--name <name>', 'Firearm name')
  .option('--serial <serial>', 'Serial number')
  .option('--manufacturer <manufacturer>', 'Manufacturer')
  .option('--caliber <caliber>', 'Caliber')
  .option('--price <price>', 'Purchase price')
  .option('--date <date>', 'Purchase date (YYYY-MM-DD)')
  .option('--ffl <ffl>', 'FFL dealer')
  .option('--notes <notes>', 'Notes')
  .action(async (id, opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      const existing = getFirearm(db, Number(id))
      if (!existing) {
        process.stderr.write(`Firearm ${id} not found.\n`)
        process.exit(1)
      }
      const data = {
        name: opts.name ?? existing.name,
        serial_number: opts.serial ?? existing.serial_number,
        manufacturer: opts.manufacturer !== undefined ? opts.manufacturer : existing.manufacturer,
        caliber: opts.caliber !== undefined ? opts.caliber : existing.caliber,
        purchase_price: opts.price != null ? Number(opts.price) : existing.purchase_price,
        purchase_date: opts.date != null ? toEpoch(parseDate(opts.date)) : existing.purchase_date,
        ffl_dealer: opts.ffl !== undefined ? opts.ffl : existing.ffl_dealer,
        notes: opts.notes !== undefined ? opts.notes : existing.notes,
      }
      updateFirearm(db, Number(id), data)
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.firearmUpdated + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

firearms
  .command('delete <id>')
  .action(async (id) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      deleteFirearm(db, Number(id))
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.firearmDeleted + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

// ── rounds ────────────────────────────────────────────────────────────────────

const rounds = program.command('rounds')

const ROUND_COLUMNS = ['id', 'firearm_id', 'date', 'rounds_fired', 'notes']
const ROUND_DATE_FIELDS = ['date']

rounds
  .command('list')
  .requiredOption('--firearm <id>', 'Firearm ID')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    const dateFormat = globalOpts.dateFormat
    try {
      const db = await openDb(dbPath)
      const rows = getRoundCounts(db, Number(opts.firearm))
      if (opts.json) {
        printJson(formatDatesInRows(rows, ROUND_DATE_FIELDS, dateFormat))
      } else {
        if (rows.length === 0) {
          process.stdout.write(strings.empty.rounds + '\n')
        } else {
          printTable(applyDatesToTable(rows, ROUND_DATE_FIELDS, dateFormat), ROUND_COLUMNS)
        }
      }
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

rounds
  .command('add')
  .requiredOption('--firearm <id>', 'Firearm ID')
  .requiredOption('--date <date>', 'Session date (YYYY-MM-DD)')
  .requiredOption('--rounds <n>', 'Rounds fired')
  .option('--notes <notes>', 'Notes')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      insertRoundCount(db, {
        firearm_id: Number(opts.firearm),
        date: toEpoch(parseDate(opts.date)),
        rounds_fired: Number(opts.rounds),
        notes: opts.notes ?? null,
      })
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.roundAdded + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

rounds
  .command('update <id>')
  .option('--rounds <n>', 'Rounds fired')
  .option('--date <date>', 'Session date (YYYY-MM-DD)')
  .option('--notes <notes>', 'Notes')
  .action(async (id, opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      // Fetch the specific round count by id
      const rows = db.exec('SELECT * FROM round_counts WHERE id = ?', {
        bind: [Number(id)],
        returnValue: 'resultRows',
        rowMode: 'object',
      })
      if (rows.length === 0) {
        process.stderr.write(`Round count ${id} not found.\n`)
        process.exit(1)
      }
      const row = rows[0]
      const data = {
        date: opts.date != null ? toEpoch(parseDate(opts.date)) : row.date,
        rounds_fired: opts.rounds != null ? Number(opts.rounds) : row.rounds_fired,
        notes: opts.notes !== undefined ? opts.notes : row.notes,
      }
      updateRoundCount(db, Number(id), data)
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.roundUpdated + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

rounds
  .command('delete <id>')
  .action(async (id) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      deleteRoundCount(db, Number(id))
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.roundDeleted + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

// ── events ────────────────────────────────────────────────────────────────────

const events = program.command('events')

const EVENT_COLUMNS = ['id', 'firearm_id', 'event_type', 'date', 'title', 'description', 'created_at']
const EVENT_DATE_FIELDS = ['date', 'created_at']

events
  .command('list')
  .requiredOption('--firearm <id>', 'Firearm ID')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    const dateFormat = globalOpts.dateFormat
    try {
      const db = await openDb(dbPath)
      const rows = getEvents(db, Number(opts.firearm))
      if (opts.json) {
        printJson(formatDatesInRows(rows, EVENT_DATE_FIELDS, dateFormat))
      } else {
        if (rows.length === 0) {
          process.stdout.write(strings.empty.events + '\n')
        } else {
          printTable(applyDatesToTable(rows, EVENT_DATE_FIELDS, dateFormat), EVENT_COLUMNS)
        }
      }
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

events
  .command('add')
  .requiredOption('--firearm <id>', 'Firearm ID')
  .requiredOption('--type <type>', 'Event type')
  .requiredOption('--title <title>', 'Event title')
  .option('--date <date>', 'Event date (YYYY-MM-DD)')
  .option('--description <description>', 'Description')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      insertEvent(db, {
        firearm_id: Number(opts.firearm),
        event_type: opts.type,
        date: opts.date != null ? toEpoch(parseDate(opts.date)) : Date.now(),
        title: opts.title,
        description: opts.description ?? null,
      })
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.eventAdded + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

events
  .command('update <id>')
  .option('--type <type>', 'Event type')
  .option('--title <title>', 'Event title')
  .option('--description <description>', 'Description')
  .action(async (id, opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      const rows = db.exec('SELECT * FROM events WHERE id = ?', {
        bind: [Number(id)],
        returnValue: 'resultRows',
        rowMode: 'object',
      })
      if (rows.length === 0) {
        process.stderr.write(`Event ${id} not found.\n`)
        process.exit(1)
      }
      const row = rows[0]
      const data = {
        event_type: opts.type ?? row.event_type,
        date: row.date,
        title: opts.title ?? row.title,
        description: opts.description !== undefined ? opts.description : row.description,
      }
      updateEvent(db, Number(id), data)
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.eventUpdated + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

events
  .command('delete <id>')
  .action(async (id) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      deleteEvent(db, Number(id))
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.eventDeleted + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

// ── documents ──────────────────────────────────────────────────────────────────

const documents = program.command('documents')

const DOCUMENT_COLUMNS = ['id', 'doc_type', 'filename', 'mime_type', 'uploaded_at']
const DOCUMENT_DATE_FIELDS = ['uploaded_at']

documents
  .command('list')
  .option('--firearm <id>', 'Filter by firearm ID')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    const dateFormat = globalOpts.dateFormat
    try {
      const db = await openDb(dbPath)
      const rows = opts.firearm
        ? getDocumentsForFirearm(db, Number(opts.firearm))
        : getAllDocuments(db)
      if (opts.json) {
        printJson(formatDatesInRows(rows, DOCUMENT_DATE_FIELDS, dateFormat))
      } else {
        if (rows.length === 0) {
          process.stdout.write(strings.empty.documents + '\n')
        } else {
          printTable(applyDatesToTable(rows, DOCUMENT_DATE_FIELDS, dateFormat), DOCUMENT_COLUMNS)
        }
      }
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

documents
  .command('add')
  .requiredOption('--file <filepath>', 'Path to file')
  .requiredOption('--type <type>', 'Document type')
  .option('--firearm <id>', 'Link to firearm ID')
  .action(async (opts) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openOrCreateDb(dbPath)
      const fileBytes = openFile(opts.file)
      const filename = basename(opts.file)
      // Determine MIME type from extension (minimal set needed for CLI)
      const ext = filename.split('.').pop().toLowerCase()
      const mimeMap = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        txt: 'text/plain',
      }
      const mimeType = mimeMap[ext] ?? 'application/octet-stream'
      const docId = insertDocument(db, {
        filename,
        fileData: fileBytes,
        mimeType,
        docType: opts.type,
      })
      if (opts.firearm) {
        linkDocumentToFirearm(db, docId, Number(opts.firearm), null)
      }
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.documentUploaded + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

documents
  .command('delete <id>')
  .action(async (id) => {
    const globalOpts = program.opts()
    const dbPath = getDbPath(globalOpts)
    try {
      const db = await openDb(dbPath)
      deleteDocument(db, Number(id))
      saveDb(db, dbPath)
      process.stdout.write(strings.toasts.documentDeleted + '\n')
    } catch (e) {
      process.stderr.write(e.message + '\n')
      process.exit(1)
    }
  })

// ── Parse ──────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv)
