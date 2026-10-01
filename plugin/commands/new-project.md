---
description: Add a new project or client to ORGANISE.md and scaffold its folder.
argument-hint: "<name>"
---

Add a new project to the rules file: `$ARGUMENTS`

1. Call `read_rules`.
2. Draft a project entry for "$ARGUMENTS": a sensible `root` folder, and
   `aliases`/`keywords` drawn from what you know about it (and from asking
   the user, if you don't know enough to guess well). Confirm the entry with
   the user before writing it.
3. Add a corresponding rule (`keyword_in: "$ARGUMENTS"` → the project's
   `root`/inbox folder) if one doesn't already cover it, and call
   `write_rules` with the updated rules.
4. Call `propose_plan` to see if any existing files on disk now match the new
   project, and offer to move them if the user wants.
