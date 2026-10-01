---
name: organise
description: Use when the user wants their Desktop, Downloads, or Documents tidied up, asks to set up or edit file-organisation rules, or runs /organise, /tidy, /new-project, /rules, or /undo-last. Drives the desktop-organiser MCP tools (scan, classify, read_rules, write_rules, propose_plan, apply, undo, quarantine, find_duplicates, status) safely.
---

# Organising a user's files

Desktop Organiser moves files on a real person's disk. Treat every step as
something that has to be right the first time, not something to iterate on
after the fact — there is no "undo everything" button, only undoing what was
journaled.

## Where the rules live

Everything this skill does is driven by one file: `ORGANISE.md` (see
`spec/ORGANISE.md` in this repo for the full format). Read it with
`read_rules` before doing anything else. If it doesn't exist yet, you're in
the first-run flow below.

## Deriving the rules file (first run, or `/new-project`)

The whole point of this tool is that **you already know things about this
user** — their projects, their clients, the shape of their work — from your
own memory and from this conversation. Use that instead of guessing:

1. Think about what you actually know: product names, client names, companies
   the user has mentioned, repos they work in, recurring topics. Draft a
   `projects` list from this — each with a `name`, a few `aliases` a file
   might be named after, and a sensible `root` folder.
2. Call `scan` on the default scope (`~/Desktop`, `~/Downloads`) to see what's
   actually there. Use file names and extensions — not full contents — to
   spot obvious categories (screenshots, bank exports, invoices).
3. **Show the user what you derived and ask them to confirm or correct it**
   before writing anything. Never silently invent a project or client they
   haven't actually mentioned — guessing wrong here is worse than asking.
4. Call `write_rules` only after they've confirmed.

If your memory of this user is thin (a brand-new conversation, nothing to go
on), say so and ask a handful of direct questions instead of inventing a
generic structure: what are your current projects/clients? Where do your
bank exports and invoices usually need to end up?

## Taxonomy principles

- **Shallow trees.** Three levels of folders, maximum
  (`~/Projects/addison/inbox`, not deeper).
- **Project-first.** When a file clearly belongs to a known project or
  client, that wins over a generic category like "Documents".
- **Year subfolders for dated material** — bank exports, invoices, tax
  documents — not for everything.

## The approval loop — never skip a step

1. `propose_plan` — always, before any `apply`. This is read-only.
2. Show the user the **grouped** preview it returns (destination, count, a
   few example filenames) — not a raw list of every move. They should be able
   to read a 300-file plan in under a minute.
3. Let them approve all, some, or none. If they want changes, that usually
   means editing `ORGANISE.md` (via `write_rules`) and re-running
   `propose_plan`, not hand-picking exceptions inside `apply`.
4. Only call `apply` with the exact `planId` `propose_plan` just returned, and
   only for what was approved. If a user approves "all but the screenshots",
   remove those rules' moves from what you ask `apply` to run, or run it in
   stages.
5. `apply` will refuse a plan over 500 moves unless you pass
   `confirmLargeBatch: true` — only do that after the user has explicitly
   said to go ahead with a plan that size.
6. After applying, tell the user how many files moved, give a one-line
   summary of where, and remind them of the batch ID for `/undo-last`.

## Files that don't match any rule

`propose_plan` returns these in `unmatched`. Don't guess destinations for
them yourself — call `classify` on each (or a representative sample for a
large batch) to get a minimal content hint, then either:

- propose a new rule to the user ("these all look like X, should I add a rule
  for them?"), or
- ask the user directly what to do with a small, ambiguous batch.

If `classify` reports `redacted: true`, that file's hint contained something
that looks like a card number, tax number, or passport number. Never try to
work around the redaction — flag the file to the user for a manual decision
instead of guessing from the filename alone.

## Hard rules — do not bend these

- **Never delete.** This tool has no delete capability. "Get rid of this"
  means `quarantine`, never anything else.
- **Never call `apply` without a `planId` from `propose_plan` in this same
  conversation.** Don't reconstruct a plan from memory or from a previous
  session.
- **Never widen `never_touch`.** The built-in defaults (git repos,
  `node_modules`, app bundles, hidden files, system/library folders, cloud
  placeholders that aren't downloaded locally) are non-negotiable. A rules
  file can only add to this list, never remove from it.
- **When in doubt, ask or leave it in place.** An unmoved file is a minor
  inconvenience. A wrongly moved file erodes trust in the whole tool.
