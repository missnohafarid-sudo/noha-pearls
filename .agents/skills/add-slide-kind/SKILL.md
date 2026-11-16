---
name: add-slide-kind
description: Use when the teacher asks for a new kind of slide or question that does not exist yet (now there are four - explanation slide, multiple choice, written answer, media slide from a link). Arabic phrasings - أريد نوعاً جديداً من الأسئلة، سؤال ترتيب، سؤال صح أو خطأ، سؤال بالمطابقة، أريد شريحة مختلفة. English - add a new question type, new slide type, true/false question, ordering question. NOT for showing a video, audio, photo, PDF or simulation - that is a media slide the teacher adds inside the site from a public link (skill content-is-edited-in-the-site).
---

# Add a slide kind

A kind is one entry in each of two registries. The editor, the importer, the presenter, the student device and the AI instructions then pick it up. Do the steps in this order.

0. Restate in Arabic what the new slide looks like on screen and how a student answers. Ask at most two questions with numbered options (for example: one answer for each student, or one for the group). Confirm it can be built from the existing fields: titles, text, choices (2 to 4), points, scope. Needs files uploaded to the site, drawing, a timer, or another website's service? Stop and hand over (AGENTS.md section 6).
1. If the code you must edit breaks AGENTS.md section 4 (for example it is already scattered), fix the structure first, in its own `ship`, then add the kind in a second `ship`.
2. `src/domain/models.ts`: add the name to `SlideKind`, a new interface extending `SlideBase`, and add it to the `Slide` union (and to `QuestionSlide` if students answer it).
3. `src/domain/slideKinds.ts`: add a `SlideKindSpec` and put it in `SLIDE_KINDS` (the compiler requires every kind). Copy `content` for a slide with no answer, `textKind` for a question. The shape of a spec is `SlideKindSpec` in `src/domain/slideFile.ts`: `create`, `fileFields`, `fromFile`, `toFile` and `withoutKey` (required; the identity for a kind with no key), and optionally `normalize` if edits can leave fields inconsistent, `hasProblem`, and, for a kind with hidden text, `hiddenPartKeys` and `withOpenedParts` (helpers in `src/domain/slideHiddenParts.ts`). Field readers and repairs are in `src/domain/slideFields.ts`. A new file field name is added to `FileFieldName` and a new error kind to `IssueCode`, both in `slideFile.ts`.
4. `src/ui/slides/slideUi.tsx`: add the entry in `SLIDE_UI`: `label`, `fields` (a `FieldSpec` list, reuse `COMMON_FIELDS` and `QUESTION_TAIL`) and `Body`. Copy `ChoiceBody` or `TextBody`.
5. `src/i18n/slides.ts`: add `kind.<name>` (the label) and `field.<name>` for each new field, Arabic, feminine address.
6. For a new field name or error code the compiler forces one line each in `FIELD_HELP` (`src/i18n/lessonPrompt.ts`) and `ISSUE_TEXT` (`src/i18n/lessonFile.ts`). Write those lines; do not edit the rest of the instructions: the kind list there is generated from the registry. Tell her the AI instructions will list the new kind but will not yet use it in the lesson plan they suggest.
7. A question kind also needs: `isQuestion` and `normalizeAnswerValue` in `src/domain/answering.ts` (and `takesAnswerPerStudent` stays choice-only unless the kind is a choice kind), `answerKey` in `src/domain/scoring.ts`, `src/ui/common/AnswerLabel.tsx`, and `src/ui/session/PresenterStage.tsx` (tally or wall). Open each and check; they name kinds explicitly.
8. Tests, written first: in `src/domain/domain.test.ts` (or a test file beside the module) the `lesson file` block (import and export round trip, every issue code), and for a question the `answering rules` block. `src/i18n/lessonPrompt.test.ts` already checks the prompt lists every kind and field.
9. Run `npm run dev`; add the slide in a lesson as admin; describe what you see.
10. Finish as in AGENTS.md section 5. Example message: `Add a true-or-false question kind`.
