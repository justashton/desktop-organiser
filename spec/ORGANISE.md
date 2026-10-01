# The `ORGANISE.md` spec (v0.1)

`ORGANISE.md` is a rules file that tells Desktop Organiser how to file a
person's documents. It is plain Markdown with a YAML front-matter block, so it
is readable and editable by hand, diffable in git, and auditable by anyone —
not just by the AI that wrote it.

A copy lives at `~/.desktop-organiser/ORGANISE.md` by default. Every version
Claude writes is kept (see [Versioning](#versioning)) so a bad rules change
can always be rolled back.

## Shape

```markdown
---
version: 1
scope:
  - ~/Desktop
  - ~/Downloads
projects:
  - name: Addison
    aliases: [addison, mental health platform]
    root: ~/Projects/addison
    keywords: [addison, clinician, inertia]
  - name: Origin Coffee
    aliases: [origin, origin coffee co]
    root: ~/Clients/origin-coffee
    keywords: [origin, roastery, wholesale]
rules:
  - match:
      extension: [.png, .jpg, .jpeg]
      name_pattern: "^Screenshot"
    destination: ~/Pictures/Screenshots/{year}-{month}
  - match:
      extension: [.csv]
      content_hint: "Date,Amount,Payee"
    destination: ~/Finance/Bank/{year}
  - match:
      keyword_in: Addison
    destination: ~/Projects/addison/inbox
naming:
  date_format: "YYYY-MM-DD"
  collision: suffix
never_touch:
  - "**/.git/**"
  - "**/node_modules/**"
  - "**/*.app"
  - "**/.*"
quarantine:
  path: ~/.desktop-organiser/quarantine
  hold_days: 30
---

## Notes

Free-text area for the user or Claude to leave context: why a rule exists,
what "Addison" refers to, what to ask about next time. Ignored by the parser,
read by humans and by Claude on the next run.
```

## Sections

### `scope`

Absolute or `~`-relative directories Desktop Organiser is allowed to scan and
organise. Anything outside `scope` is never touched, regardless of other
rules.

### `projects`

Each entry gives a project or client a name, a list of `aliases` used to
recognise it in filenames and content hints, a `root` folder it already lives
in (or should live in), and `keywords` used for loose matching. This section
is what makes the taxonomy personal — it's drawn from what Claude already
knows about the user, not guessed from a generic template.

### `rules`

An ordered list. **Rules are evaluated top-down and the first match wins.**
A `match` block can combine:

| Key | Matches on |
| --- | --- |
| `extension` | File extension(s) |
| `name_pattern` | A regular expression against the filename |
| `content_hint` | A substring or pattern seen in the file's content hint (CSV headers, PDF text, EXIF) |
| `source_folder` | The folder the file currently lives in |
| `keyword_in` | A project or client name whose `aliases`/`keywords` appear in the filename or content hint |

Every rule needs a `destination`, a `~`-relative path. Destinations may use
`{year}`, `{month}`, and `{project}` placeholders. An optional `rename`
template controls the filename itself (defaults to keeping the original
name).

A file that matches no rule is **not** moved automatically — it is handed to
Claude for classification and shown to the user in the next plan preview.

### `naming`

Shared conventions: the date format used in `{year}`/`{month}` placeholders,
and the `collision` strategy (`suffix` is the only supported value in v0.1 —
Desktop Organiser never overwrites a file).

### `never_touch`

Glob patterns that are excluded before any rule is considered, no matter what
`scope` or `rules` say. See the engine's built-in defaults in the main
README — entries here are additive, not a replacement for them.

### `quarantine`

Where `quarantine`-tool output goes, and how many days it waits before the
user is expected to review and empty it. Desktop Organiser never deletes
anything itself.

## Versioning

Every time a tool writes `ORGANISE.md`, the previous version is copied to
`~/.desktop-organiser/versions/ORGANISE.<timestamp>.md` before the new one is
written. `status` reports the current version number; `write_rules` refuses to
write a file that doesn't parse or that drops a `never_touch` default.

## Compatibility

This spec is intentionally vendor-neutral: nothing in it refers to Claude,
MCP, or any particular AI client. Any tool that can read and write this
Markdown file can drive the engine in `mcp-server/`.
