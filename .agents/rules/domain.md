---
trigger: glob
globs: src/domain/**
description: Rules for the domain layer
---

# src/domain

The one home of every rule and data shape. General rules: AGENTS.md section 4.

## Belongs here

- Data shapes: `models.ts`.
- Limits and constants: `choices.ts` (choice count and letters), `answering.ts` (`MAX_TEXT_ANSWER_LENGTH`), `slideKinds.ts` (`MIN_POINTS`, `MAX_POINTS`).
- Decisions: who may answer (`answering.ts`), marking and scores (`scoring.ts`), what a device shows (`pacing.ts`), hearts (`rewards.ts`), roster (`roster.ts`), lesson file (`lessonFormat.ts`), lesson edits (`lessonOps.ts`).

## Never here

- React, `window`, `document`, storage, `fetch`, `Date.now()` hidden inside a rule (take time as a parameter).
- Any import outside `src/domain`.
- Arabic interface text (it goes to `src/i18n`).
- A second copy of a constant that already has a home. Grep first, import it.

## Patterns to copy

- A limit plus the function that uses it, side by side: `choices.ts` (`MAX_CHOICES`, `removeOption`).
- A pure function returning a decision: `canAnswer` in `answering.ts`.
- A registry entry for a slide kind: `content` in `slideKinds.ts`.

## Tests

Every new or changed rule gets a test in `src/domain/domain.test.ts`, in the matching `describe` block, written before the fix. The architecture test fails if this folder imports another layer or touches the browser.
