---
description: Run a routine tidy pass over the default scope or a given path.
argument-hint: "[path]"
---

Run a routine Desktop Organiser pass, optionally scoped to a single path:
`$ARGUMENTS`

1. Call `read_rules`. If there's no rules file yet, tell the user to run
   `/organise` first instead.
2. Call `propose_plan`, passing `scopeOverride: ["$ARGUMENTS"]` if a path was
   given, otherwise using the rules file's own scope.
3. Rule-matched files are deterministic — present them as a short grouped
   summary rather than asking the user to re-confirm the same kind of move
   every time, unless the plan is large (over ~50 moves) or includes a
   destination they haven't seen before.
4. Files in `unmatched` need classification: call `classify` on them (or a
   sample, if there are many) and either propose a new rule or ask the user
   what to do with that small batch.
5. Apply what's approved and report the result and batch ID.
