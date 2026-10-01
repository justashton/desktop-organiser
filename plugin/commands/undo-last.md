---
description: Revert the most recent Desktop Organiser batch.
---

1. Call `status` to find the most recent batch, or ask the user for a batch
   ID if they want to undo something other than the latest run.
2. Confirm with the user which batch you're about to revert (how many files,
   roughly when it ran) before calling `undo`.
3. Call `undo` with that `batchId`.
4. Report what was reverted. If there are `conflicts` (a file no longer at
   its organised location, or something new now occupying the original
   spot), list them plainly — don't overwrite anything to force the undo
   through.
