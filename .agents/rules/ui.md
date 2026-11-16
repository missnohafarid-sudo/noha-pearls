---
trigger: glob
globs: "src/ui/**/*.tsx,src/ui/**/*.ts"
description: Rules for React pages and components
---

# src/ui

Presentation only. General rules: AGENTS.md section 4.

## Belongs here

- Pages in `ui/pages/`, one `.tsx` each, with its look in `ui/pages/` or, for a page built from a feature folder, in that folder. Parts of a page in the feature folder (`session/`, `lesson/`, `join/`, `board/`, `scanner/`, `shell/`).
- Shared pieces in `ui/common/`. Live data hooks in `ui/hooks/data.ts`. Addresses in `ui/routing/routes.ts`.
- Editing forms as a field list (`FieldSpec`) rendered by `forms/SchemaForm.tsx`.

## Never here

- Rules. If you write an `if` that decides what is allowed, scored or shown to whom, it belongs in `src/domain`.
- Arabic text: use `t.<feature>.<key>` from `src/i18n`.
- Imports from `src/infrastructure`. Storage and network calls.
- Writing data directly: call `useServices()` then a service method.
- New markup for a form: add a `FieldSpec` entry instead.
- Hand-built links: use `routeHash` / `routeUrl` / `RouteLink`.
- Deciding who is admin: use `useAdmin()` and `AdminPanel`.

## Patterns to copy

- Admin editing: `SITE_FIELDS` and `HomeAdminPanels` in `ui/pages/HomePage.tsx`.
- A page reading live data: `useSite`, `useLessons` in `ui/hooks/data.ts`.
- A service error shown as words: `useAttempt` in `ui/common/useAttempt.ts`.

## Checks that fail otherwise

The architecture test (layer imports, Arabic outside `src/i18n`, browser storage in the UI) and the browser walkthrough of the whole product, both in `npm run check`.
