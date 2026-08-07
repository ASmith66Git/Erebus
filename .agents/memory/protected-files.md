---
name: Protected files — never overwrite
description: Files the user maintains locally with native BLE/libdivecomputer code that must never be overwritten by the agent.
---

The following files are maintained by the user on their Mac and contain native BLE / libdivecomputer integration. **Never overwrite or rewrite these files.** Only additive changes (e.g. adding locale keys) are acceptable, and only when explicitly instructed.

## Protected files

- `app.config.js`
- `app/(app)/(tabs)/dive-logs.tsx`
- `app/(app)/dive-log/[id].tsx`
- `app/ble-connect.tsx` — canonical copy lives in `app/`; root-level copy (if present) is stale
- `services/DiveInterface.js`
- `services/diveComputerNative.ts`
- `locales/de.json`
- `locales/en.json`
- `locales/es.json`
- `locales/fr.json`
- `locales/it.json`
- `locales/sv.json`

## Rules

- **Locale files**: only ever ADD new translation keys; never delete or change existing values.
- **BLE/DiveInterface files**: do not touch without explicit user instruction — they wrap libdivecomputer native bindings.
- **Sync workflow**: user pushes from their Mac → agent does `git pull` here. Not the other way around for these files.

**Why:** User's local copies contain libdivecomputer native BLE functionality that is not present in the repo version. Overwriting loses that functionality silently.
