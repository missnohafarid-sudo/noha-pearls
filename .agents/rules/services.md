---
trigger: glob
globs: "src/services/**,src/ports/**"
description: Rules for services and ports
---

# src/services and src/ports

Use cases and the interfaces they need. General rules: AGENTS.md section 4.

## Belongs here

- `services/*Service.ts`: one class per use-case area. Each command first calls `requireAdmin(this.caller)` when only the admin may do it, then reads and writes through the `DocumentStore` it was given.
- `services/Services.ts`: the list of services the UI may use. A new service is added there (and to its three tables: `UI_SURFACE`, `SURFACE_EFFECTS`, `SURFACE_SHAPES`) and built in `services/createDataServices.ts`.
- `ports/*.ts`: the interfaces the app needs from outside (`store.ts`, `auth.ts`, `caller.ts` and the rest of the folder) and the transport constants shared by the page and the hub (`limits.ts`, `wire.ts`). Read the folder, not a list.

## Never here

- Rules (scoring, limits, validation, who may answer): call `src/domain`.
- Browser APIs, React, concrete adapters (`LocalDocumentStore` and the rest): only the port types.
- Arabic text. A failure is reported as an error with a code (see `RosterError`); the page turns the code into words from `src/i18n`.
- Imports from `src/ui`, `src/infrastructure` or `src/app`.

## Patterns to copy

- `services/RosterService.ts`: constructor takes `store` and `caller`, `requireAdmin(this.caller)`, domain function for the rule, error class with a code.
- `services/ContentService.ts`: the smallest service.
- `ports/store.ts`: a new collection is added to `Collections` and to `CLASS_DATA_ROLES`.

## Tests

Add to `src/services/services.test.ts` using its `setup()`. The architecture test fails if this layer imports `ui`, `infrastructure` or `app`.
