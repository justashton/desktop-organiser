---
description: Run the full first-time Desktop Organiser setup and cleanup flow.
---

Run the Desktop Organiser first-run flow (see the `organise` skill for full
detail):

1. Call `read_rules`. If it doesn't exist or fails to parse, you're doing the
   first-run derivation: draft `projects` and `rules` from what you already
   know about the user plus a `scan` of `~/Desktop` and `~/Downloads`, show it
   to them, and only call `write_rules` once they confirm it.
2. If rules already exist, skim them back to the user in a couple of
   sentences and ask if anything about their projects or clients has changed
   before continuing.
3. Call `propose_plan` and present the grouped preview.
4. Apply only what the user approves, using the exact `planId` returned.
5. Report what moved and the batch ID for undoing it.

Never call `apply` without an explicit approval from the user in this
conversation.
