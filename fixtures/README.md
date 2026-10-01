# Fixtures

`messy-desktop/` is a sample "before" folder for manually exercising the
engine end to end: two screenshots, a bank CSV with headers, a hidden
dotfile, and a duplicate pair of PDFs.

(A `.git` repo and `node_modules` folder aren't included here — git won't
track them inside this repo anyway. The engine's own `never_touch` exclusion
of both is covered directly in `mcp-server/test/neverTouch.test.ts` and
`mcp-server/test/scan.test.ts`, which build those cases in a throwaway temp
directory instead.)

`example-organise.md` is a filled-in `ORGANISE.md` that organises it — copy
it to `~/.desktop-organiser/ORGANISE.md` (adjusting the paths for your
machine) to try a real `propose_plan` / `apply` / `undo` cycle against the
sample folder without touching your real Desktop.

Automated tests use their own throwaway temp directories (see
`mcp-server/test/`) rather than this folder directly, so this tree is safe to
extend with more "messy" cases without needing to keep it byte-for-byte
in sync with any test's expectations.
