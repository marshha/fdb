# FDB — Firearm Database

A fully offline, privacy-first firearm ownership tracker. All data lives in a single SQLite file on your machine — no accounts, no cloud, no network.

**[Open the browser app →](https://marshha.github.io/fdb/)**

Two interfaces share the same data layer:
- **CLI** (`fdb`) — scriptable, pipeable, works over SSH
- **Browser app** — visual UI, runs entirely in your browser

---

## Requirements

- Node.js 22+

## Installation

```sh
npm install
npm link        # makes `fdb` available on your PATH
```

---

## CLI usage

All commands require a database file path, either via `--db` or configured in `~/.fdbrc`.

```sh
fdb --db firearms.db <command>
```

### Global options

| Option | Default | Description |
|---|---|---|
| `--db <path>` | from `~/.fdbrc` | Path to the `.db` file |
| `--date-format <fmt>` | `yyyy-MM-dd` | [date-fns format string](https://date-fns.org/docs/format) for all date output |

### Config file

`~/.fdbrc` is a JSON file of default values. CLI flags override it.

```json
{ "db": "/path/to/firearms.db" }
```

---

### Init

Create a new empty database:

```sh
fdb --db firearms.db init          # fails if file already exists
fdb --db firearms.db init --force  # overwrite existing file
```

### Firearms

```sh
fdb --db firearms.db firearms list [--json]
fdb --db firearms.db firearms show <id> [--json]

fdb --db firearms.db firearms add \
  --name "Glock 19" --serial "G001" \
  [--manufacturer <m>] [--caliber <c>] [--price <p>] \
  [--date YYYY-MM-DD] [--ffl <dealer>] [--notes <n>]

fdb --db firearms.db firearms update <id> [--name <n>] [--serial <s>] ...
fdb --db firearms.db firearms delete <id>
```

### Round counts

```sh
fdb --db firearms.db rounds list --firearm <id> [--json]

fdb --db firearms.db rounds add \
  --firearm <id> --date YYYY-MM-DD --rounds <n> [--notes <n>]

fdb --db firearms.db rounds update <id> [--rounds <n>] [--date YYYY-MM-DD] [--notes <n>]
fdb --db firearms.db rounds delete <id>
```

### Events

```sh
fdb --db firearms.db events list --firearm <id> [--json]

fdb --db firearms.db events add \
  --firearm <id> --type <type> --title <title> \
  [--date YYYY-MM-DD] [--description <d>]

fdb --db firearms.db events update <id> [--type <t>] [--title <t>] [--description <d>]
fdb --db firearms.db events delete <id>
```

### Documents

```sh
fdb --db firearms.db documents list [--firearm <id>] [--json]
fdb --db firearms.db documents add --file <path> --type <type> [--firearm <id>]
fdb --db firearms.db documents delete <id>
```

---

## JSON output

Every `list` and `show` command accepts `--json`. Output is a JSON array suitable for piping to `jq`.

```sh
# Total rounds across all firearms
fdb --db firearms.db firearms list --json | jq '[.[].total_rounds] | add'

# All sessions for firearm 1 with custom date format
fdb --db firearms.db rounds list --firearm 1 --json --date-format 'MM/dd/yyyy'
```

---

## Browser UI

### Run locally (development)

```sh
npm run dev
```

Opens a Vite dev server at `http://localhost:5173`. The app runs entirely in your browser — no server, no accounts. Your data stays in the `.db` file you open or create.

### Run locally (production build)

```sh
npm run build       # compiles to public/
npx serve public    # serve the built app
```

Then open `http://localhost:3000`.

### Hosted on GitHub Pages

The app is deployed at **https://marshha.github.io/fdb/** and updates automatically on every push to `main`.

## Development

```sh
npm run test:run    # run all tests
npm run lint        # ESLint
npm run format      # Prettier
```

---

## Data model

A single `.db` file is a standard SQLite database. Six tables:

| Table | Contents |
|---|---|
| `firearms` | Core record: name, serial, manufacturer, caliber, purchase info |
| `round_counts` | Shooting sessions per firearm (date + rounds fired) |
| `events` | Maintenance, repairs, modifications, etc. |
| `documents` | Binary attachments (PDFs, images) stored as BLOBs |
| `firearm_documents` | Many-to-many join: one document can link to multiple firearms |
| `meta` | Internal key/value store (schema version) |

All dates are stored as UTC epoch milliseconds (INTEGER). Schema version is tracked in `meta` for future migrations.
