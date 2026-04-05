import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'

const CLI = join(import.meta.dirname, '../../cli/index.js')
const FIXTURE_PDF = join(import.meta.dirname, '../fixtures/test.pdf')

let tmpDir
let dbPath

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fdb-cli-test-'))
  dbPath = join(tmpDir, 'test.db')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function run(args, opts = {}) {
  const env = { ...process.env, HOME: opts.homeDir ?? process.env.HOME }
  // Split args string into array for spawnSync, stripping surrounding quotes
  const argv = (args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((tok) => {
    if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
      return tok.slice(1, -1)
    }
    return tok
  })
  const result = spawnSync('node', [CLI, ...argv], {
    encoding: 'utf8',
    env,
    cwd: tmpDir,
  })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  }
}

function runJson(args, opts = {}) {
  const result = run(args, opts)
  return { ...result, data: JSON.parse(result.stdout) }
}

// ── init ───────────────────────────────────────────────────────────────────────

describe('init', () => {
  it('creates a new database file at --db path', () => {
    const r = run(`--db ${dbPath} init`)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Database created')
    expect(existsSync(dbPath)).toBe(true)
  })

  it('the created database accepts firearms list (schema is valid)', () => {
    run(`--db ${dbPath} init`)
    const r = run(`--db ${dbPath} firearms list`)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('No firearms yet.')
  })

  it('exits 1 if file already exists without --force', () => {
    run(`--db ${dbPath} init`)
    const r = run(`--db ${dbPath} init`)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('already exists')
  })

  it('--force overwrites an existing file', () => {
    run(`--db ${dbPath} init`)
    run(`--db ${dbPath} firearms add --name "Gun" --serial "S001"`)
    const r = run(`--db ${dbPath} init --force`)
    expect(r.code).toBe(0)
    const result = runJson(`--db ${dbPath} firearms list --json`)
    expect(result.data).toEqual([])
  })
})

// ── firearms ───────────────────────────────────────────────────────────────────

describe('firearms', () => {
  it('list on empty db returns empty table (exit 0)', () => {
    // Create db first via add, then check list behavior with a fresh db
    // Use a pre-created empty db by running add then delete
    const r = run(`--db ${dbPath} firearms list`)
    // list on nonexistent file should fail; create it first
    run(`--db ${dbPath} firearms add --name "Test" --serial "SN-001"`)
    run(`--db ${dbPath} firearms delete 1`)
    const r2 = run(`--db ${dbPath} firearms list`)
    expect(r2.code).toBe(0)
    expect(r2.stdout).toContain('No firearms yet.')
  })

  it('list --json returns empty array []', () => {
    run(`--db ${dbPath} firearms add --name "Temp" --serial "TMP-001"`)
    run(`--db ${dbPath} firearms delete 1`)
    const result = runJson(`--db ${dbPath} firearms list --json`)
    expect(result.code).toBe(0)
    expect(result.data).toEqual([])
  })

  it('add creates a record; subsequent list --json contains it', () => {
    run(`--db ${dbPath} firearms add --name "Glock 19" --serial "G19-001" --caliber "9mm"`)
    const result = runJson(`--db ${dbPath} firearms list --json`)
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].name).toBe('Glock 19')
    expect(result.data[0].serial_number).toBe('G19-001')
    expect(result.data[0].caliber).toBe('9mm')
  })

  it('show <id> --json returns the correct record', () => {
    run(`--db ${dbPath} firearms add --name "AR-15" --serial "AR-001"`)
    const result = runJson(`--db ${dbPath} firearms show 1 --json`)
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].name).toBe('AR-15')
  })

  it('update <id> --name changes the name; show reflects it', () => {
    run(`--db ${dbPath} firearms add --name "Old Name" --serial "UPD-001"`)
    run(`--db ${dbPath} firearms update 1 --name "New Name"`)
    const result = runJson(`--db ${dbPath} firearms show 1 --json`)
    expect(result.code).toBe(0)
    expect(result.data[0].name).toBe('New Name')
  })

  it('delete <id> removes the record; list --json does not contain it', () => {
    run(`--db ${dbPath} firearms add --name "To Delete" --serial "DEL-001"`)
    run(`--db ${dbPath} firearms delete 1`)
    const result = runJson(`--db ${dbPath} firearms list --json`)
    expect(result.code).toBe(0)
    expect(result.data).toEqual([])
  })

  it('add with duplicate serial exits 1, stderr contains error message', () => {
    run(`--db ${dbPath} firearms add --name "Gun A" --serial "DUP-001"`)
    const r = run(`--db ${dbPath} firearms add --name "Gun B" --serial "DUP-001"`)
    expect(r.code).toBe(1)
    expect(r.stderr.toUpperCase()).toContain('UNIQUE')
  })
})

// ── rounds ────────────────────────────────────────────────────────────────────

describe('rounds', () => {
  beforeEach(() => {
    run(`--db ${dbPath} firearms add --name "Test Rifle" --serial "RND-001"`)
  })

  it('add creates a record; list --firearm <id> --json contains it', () => {
    run(`--db ${dbPath} rounds add --firearm 1 --date 2026-03-01 --rounds 50`)
    const result = runJson(`--db ${dbPath} rounds list --firearm 1 --json`)
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].rounds_fired).toBe(50)
  })

  it('update changes rounds_fired; list reflects it', () => {
    run(`--db ${dbPath} rounds add --firearm 1 --date 2026-03-01 --rounds 50`)
    run(`--db ${dbPath} rounds update 1 --rounds 75`)
    const result = runJson(`--db ${dbPath} rounds list --firearm 1 --json`)
    expect(result.data[0].rounds_fired).toBe(75)
  })

  it('delete removes the record', () => {
    run(`--db ${dbPath} rounds add --firearm 1 --date 2026-03-01 --rounds 50`)
    run(`--db ${dbPath} rounds delete 1`)
    const result = runJson(`--db ${dbPath} rounds list --firearm 1 --json`)
    expect(result.data).toHaveLength(0)
  })
})

// ── events ────────────────────────────────────────────────────────────────────

describe('events', () => {
  beforeEach(() => {
    run(`--db ${dbPath} firearms add --name "Test Rifle" --serial "EVT-001"`)
  })

  it('add creates a record; list --firearm <id> --json contains it', () => {
    run(`--db ${dbPath} events add --firearm 1 --type maintenance --title "Cleaned" --date 2026-03-01`)
    const result = runJson(`--db ${dbPath} events list --firearm 1 --json`)
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].title).toBe('Cleaned')
  })

  it('update changes title; list reflects it', () => {
    run(`--db ${dbPath} events add --firearm 1 --type maintenance --title "Old Title" --date 2026-03-01`)
    run(`--db ${dbPath} events update 1 --title "New Title"`)
    const result = runJson(`--db ${dbPath} events list --firearm 1 --json`)
    expect(result.data[0].title).toBe('New Title')
  })

  it('delete removes the record', () => {
    run(`--db ${dbPath} events add --firearm 1 --type maintenance --title "Event" --date 2026-03-01`)
    run(`--db ${dbPath} events delete 1`)
    const result = runJson(`--db ${dbPath} events list --firearm 1 --json`)
    expect(result.data).toHaveLength(0)
  })
})

// ── documents ─────────────────────────────────────────────────────────────────

describe('documents', () => {
  it('add --file ./fixtures/test.pdf stores a document', () => {
    const r = run(`--db ${dbPath} documents add --file ${FIXTURE_PDF} --type manual`)
    expect(r.code).toBe(0)
  })

  it('list --json contains the document with correct filename', () => {
    run(`--db ${dbPath} documents add --file ${FIXTURE_PDF} --type manual`)
    const result = runJson(`--db ${dbPath} documents list --json`)
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].filename).toBe('test.pdf')
  })

  it('delete removes the document; list --json does not contain it', () => {
    run(`--db ${dbPath} documents add --file ${FIXTURE_PDF} --type manual`)
    run(`--db ${dbPath} documents delete 1`)
    const result = runJson(`--db ${dbPath} documents list --json`)
    expect(result.data).toHaveLength(0)
  })
})

// ── config file ───────────────────────────────────────────────────────────────

describe('config file', () => {
  it('~/.fdbrc with {"db": "<path>"} used when --db not provided', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'fdb-home-'))
    try {
      writeFileSync(join(fakeHome, '.fdbrc'), JSON.stringify({ db: dbPath }))
      // First create the db
      run(`--db ${dbPath} firearms add --name "Config Gun" --serial "CFG-001"`)
      const r = run('firearms list --json', { homeDir: fakeHome })
      expect(r.code).toBe(0)
      const data = JSON.parse(r.stdout)
      expect(data[0].name).toBe('Config Gun')
    } finally {
      rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('--db flag overrides config file db value', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'fdb-home-'))
    const altDb = join(tmpDir, 'alt.db')
    try {
      writeFileSync(join(fakeHome, '.fdbrc'), JSON.stringify({ db: altDb }))
      run(`--db ${dbPath} firearms add --name "Main Gun" --serial "MAIN-001"`)
      // The config points to altDb (nonexistent), but --db overrides to dbPath
      const r = runJson(`--db ${dbPath} firearms list --json`, { homeDir: fakeHome })
      expect(r.code).toBe(0)
      expect(r.data[0].name).toBe('Main Gun')
    } finally {
      rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('missing --db and no config exits 1 with helpful message', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'fdb-home-'))
    try {
      const r = run('firearms list', { homeDir: fakeHome })
      expect(r.code).toBe(1)
      expect(r.stderr).toContain('No database specified')
    } finally {
      rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('malformed ~/.fdbrc prints warning to stderr but continues', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'fdb-home-'))
    try {
      writeFileSync(join(fakeHome, '.fdbrc'), 'NOT VALID JSON {{{')
      run(`--db ${dbPath} firearms add --name "Gun" --serial "S001"`)
      const r = run(`--db ${dbPath} firearms list --json`, { homeDir: fakeHome })
      expect(r.stderr).toContain('Warning')
      expect(r.code).toBe(0)
    } finally {
      rmSync(fakeHome, { recursive: true, force: true })
    }
  })
})

// ── errors ────────────────────────────────────────────────────────────────────

describe('errors', () => {
  it('unknown command exits 1', () => {
    const r = run(`--db ${dbPath} notacommand`)
    expect(r.code).toBe(1)
  })

  it('--db path that does not exist exits 1 with clear message', () => {
    const r = run(`--db /nonexistent/path/db.sqlite firearms list`)
    expect(r.code).toBe(1)
    expect(r.stderr.length).toBeGreaterThan(0)
  })
})
