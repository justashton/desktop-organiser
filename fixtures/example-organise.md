---
version: 1
scope:
  - ./fixtures/messy-desktop
projects:
  - name: Addison
    aliases: [addison]
    root: ~/Projects/addison
    keywords: [addison, clinician]
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
never_touch: []
quarantine:
  path: ~/.desktop-organiser/quarantine
  hold_days: 30
---

## Notes

Example rules file for the `fixtures/messy-desktop` sample tree.
