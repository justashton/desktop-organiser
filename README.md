# Desktop Organiser

Desktop Organiser is an open source Claude plugin that organises your files
based on what your AI already knows about you — your projects, your clients,
and the way you work.

Desktops and Downloads folders fill up with screenshots, bank CSVs, invoices,
and stray folders. Rules engines (Hazel, File Juggler) are powerful but need
manual setup. Generic AI cleaners guess at a one-size-fits-all structure.
Neither knows that "Addison" is a product you're building, "Origin Coffee" is
a client, or that a CSV with `Date, Amount, Payee` headers belongs with your
household finances.

**Core idea:** don't extract your AI's memory into some new tool. Plug the
tool into the AI that already holds that context. Claude uses what it already
knows about you to write a rules file (`ORGANISE.md`), then calls safe,
reversible file tools to apply it. No account linking, no memory export, and
no data on anyone else's servers.

## How it's put together

Claude never touches your disk directly. It reasons with its own memory and
a read-only `scan`/`classify` of your files, then every side effect goes
through write tools that journal before they act.

```
desktop-organiser/
  mcp-server/   # vendor-neutral engine (TypeScript) — the MCP tools below
  plugin/       # thin Claude plugin wrapper: skill + slash commands
  spec/         # the ORGANISE.md rules-file format, v0.1
  fixtures/     # a sample messy folder + a filled-in ORGANISE.md to try it on
```

The engine is a normal [MCP](https://modelcontextprotocol.io) server — any
MCP client can drive it, not just Claude. The plugin in `plugin/` is what
makes it a one-command install for Claude Code, Claude Desktop, and Claude
Cowork.

## Tools (`mcp-server/`)

| Tool | Purpose | Side effects |
| --- | --- | --- |
| `scan` | Lists files in scope with size, dates, type, and a lightweight signature | None |
| `classify` | Minimal content hint for one file: CSV headers, first-page PDF text, image EXIF, screenshot detection — redacts card/tax/passport numbers | None |
| `read_rules` / `write_rules` | Reads/validates `ORGANISE.md`, or writes a new version (the previous one is archived, never overwritten) | Writes the rules file only |
| `propose_plan` | Turns rules + a scan into a reviewable list of moves | None |
| `apply` | Executes a plan returned by `propose_plan` in the same session; journals every move first | Moves files, creates folders |
| `undo` | Reverts a batch (or specific files in it) from the journal | Moves files back |
| `quarantine` | Moves files to a dated quarantine folder with a hold period | Moves files |
| `find_duplicates` | Flags exact duplicates by content hash | None |
| `status` | Rules version, last run, lifetime move counts | None |

## Commands (`plugin/commands/`)

| Command | Behaviour |
| --- | --- |
| `/organise` | First-run flow: derive `ORGANISE.md`, confirm with you, preview a plan, apply what you approve |
| `/tidy [path]` | A routine pass — deterministic rule matches, unmatched files handed to Claude to classify |
| `/undo-last` | Reverts the most recent batch |
| `/new-project <name>` | Adds a project/client to the rules file and scaffolds its folder |
| `/rules` | Shows and explains the current rules file |

## Safety

One lost file ends adoption, so these rules are not negotiable:

- **No deletes, anywhere in the engine.** Junk goes to `quarantine` with a
  30-day hold; you empty it yourself.
- **Dry run by default.** `apply` refuses to run a plan it didn't just return
  from `propose_plan` in the same session — there's no path from "Claude
  decided to move files" straight to files actually moving.
- **Append-only journal.** Every move is recorded — source, destination,
  size, timestamp, batch ID — *before* it happens.
- **No overwrites, ever.** A name collision gets a suffixed name
  (`invoice-2.pdf`), never a replacement.
- **Never-touch by default:** git repos, `node_modules`, app bundles, hidden
  files, system/library folders, and cloud-sync placeholders (iCloud,
  OneDrive) that aren't actually downloaded. A rules file can only add to
  this list, never remove from it.
- **Batch cap.** Plans over 500 moves need an explicit extra confirmation.

See [`spec/ORGANISE.md`](spec/ORGANISE.md) for the full rules-file format,
and [`plugin/skills/organise/SKILL.md`](plugin/skills/organise/SKILL.md) for
exactly how Claude is instructed to use these tools.

## Privacy

Everything runs locally — there's no backend. `classify` returns minimal
hints (CSV headers, ~200 characters of PDF text, an EXIF summary), never full
file contents, and redacts anything that looks like a card number, tax/SSN
number, or passport number before it's returned.

## Install

In a Claude Code terminal session:

```text
/plugin marketplace add mayhemhq/desktop-organiser
/plugin install desktop-organiser@desktop-organiser
```

Then run `/reload-plugins` (or start a new session) and try `/desktop-organiser:organise`.

No separate build step is required: `plugin/dist/index.cjs` is a prebuilt,
self-contained bundle of the MCP server committed to the repo, specifically
so a marketplace install — which copies only the `plugin/` directory, not
`mcp-server/` — has something to run.

To try it against the included sample folder instead of your real Desktop,
copy `fixtures/example-organise.md` to `~/.desktop-organiser/ORGANISE.md`
(adjusting the `scope` path for your checkout) and run `/organise`.

## Developing

Day-to-day work happens in `mcp-server/` (TypeScript source, tests):

```bash
npm install
npm test              # run the mcp-server test suite (vitest)
npm run typecheck
npm run build          # tsc, for local iteration / `npm run dev`
```

Tests use throwaway temp directories, never your real filesystem — see
`mcp-server/test/`.

Before committing a change to `mcp-server/src/`, refresh the bundle the
plugin actually ships:

```bash
npm run bundle --workspace mcp-server   # writes plugin/dist/index.cjs
```

If you load the plugin for local testing with `claude --plugin-dir
path/to/desktop-organiser/plugin` instead of installing it, Claude Code
loads the plugin directory in place, so a stale `plugin/dist/index.cjs` will
silently mask your source changes until you re-run `bundle`.

## Status

This is an early MVP covering the v1 P0/P1 tools from the product spec. Not
yet built: the optional background watcher for zero-token routine tidying,
and quarantine auto-expiry. See open items in the project's PRD for the
full roadmap.

## License

MIT — see [LICENSE](LICENSE).
