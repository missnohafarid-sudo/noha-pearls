---
trigger: glob
globs: "src/infrastructure/**,src/app/**"
description: Rules for adapters and the composition root
---

# src/infrastructure and src/app

The only code that touches the browser and the outside world. General rules: AGENTS.md section 4.

## Belongs here

- `infrastructure/`: classes that implement a port: `LocalDocumentStore` (DocumentStore), `PrototypeAuthGateway` (AuthGateway), `ArucoCardCodec`, `QrSvgRenderer`, `storage.ts`, `totp.ts`.
- `app/container.ts`: the single file that names concrete adapters and builds the services. It is also where `localStorage` and `sessionStorage` are handed to the adapters.
- `app/config.ts`: every setting. `app/seed.ts`: sample data for a fresh install.

## Never here

- Business rules: call `src/domain`.
- Arabic interface text.
- `src/infrastructure/vendor/**`: protected, never edit.
- Passwords, keys or secrets written into a file. Secrets reach the build only as environment values read in `config.ts`.
- A second place that creates adapters. Adapters are created in `container.ts` only.

## Patterns to copy

- An adapter with the port in its constructor signature and a test beside it: `LocalDocumentStore.ts` and `LocalDocumentStore.test.ts`.
- A new setting: add one exported constant to `config.ts` and read it from there.

## Tests

Adapters have their own `*.test.ts` beside them (use `MemoryStorage` from `storage.ts`). The architecture test fails if `ui` or `services` import an adapter or use browser storage.
