---
description: Show and explain the current ORGANISE.md rules file.
---

Call `read_rules` and explain the current configuration in plain language:
which folders are in scope, what projects/clients it knows about, what each
rule does (in the order they're evaluated — first match wins), and the
`never_touch` protections in place. If the user wants to change something,
make the edit and call `write_rules`; mention that the previous version is
kept automatically, so nothing is lost by editing it.
