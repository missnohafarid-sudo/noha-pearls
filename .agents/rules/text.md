---
trigger: glob
globs: src/i18n/**
description: Rules for interface text
---

# src/i18n

Every word the interface shows. General rules: AGENTS.md section 4.

## Belongs here

- One file per feature (`home.ts`, `roster.ts`, `slides.ts`, `session.ts`, ...), gathered into `t` in `index.ts`.
- Words used by more than one page: `common.ts`. Page-specific words: that page's file.
- `lessonPrompt.ts` (the instructions a teacher pastes into an AI assistant) and `lessonFile.ts` (import error messages). Their field lists are generated from the slide-kind registry, so do not copy field names by hand.

## Rules for the text

- Arabic only. Feminine address to the teacher and students (اكتبي، اختاري، يمكنكِ).
- To change a word, change the value only. Keep the key name: code refers to it.
- A text with a number or a name is a function, as in `common.slideCount`.
- Keep Arabic punctuation as in the neighbouring lines.

## Never here

- Rules or logic beyond joining words. Limits and counts come from `src/domain` constants (see `lessonFile.ts` importing `MIN_CHOICES`).
- Imports other than `src/domain`.
- Lesson content (lesson titles, questions, student names): it lives in the site's data, not here. `sampleLesson.json` is only the example for a fresh install and for the AI instructions.

## Checks that fail otherwise

The architecture test fails on Arabic text outside this folder. `src/i18n/lessonPrompt.test.ts` fails if the AI instructions disagree with the lesson-file checks.
