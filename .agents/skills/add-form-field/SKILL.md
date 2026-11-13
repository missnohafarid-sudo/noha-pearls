---
name: add-form-field
description: Use when the teacher asks for a new box or field in an existing editing form - for a student, a group, a lesson, the home page, or a slide. Arabic phrasings - أريد خانة جديدة، أضيفي حقلاً لرقم ولي الأمر، أريد أن أكتب ملاحظة عن كل طالبة، أضيفي حقل الصف في الدرس. English - add a field, add a new box in the form, add a notes field.
---

# Add a form field

The editing forms are lists of `FieldSpec` rendered by `src/ui/forms/SchemaForm.tsx`. Add an entry to the list; do not write new markup.

1. Restate in Arabic: which form, what the box is called, what goes in it (text, long text, number, yes/no, a choice from a list), and where it shows afterwards. Ask what is missing, with numbered options.
2. Find the form's field list:

| Form | List |
|---|---|
| Home page text | `SITE_FIELDS` in `src/ui/pages/HomePage.tsx` (record `SiteContent`) |
| Group | `GROUP_FIELDS` in `src/ui/pages/RosterPage.tsx` |
| Student | `studentFields` in `src/ui/pages/RosterPage.tsx` |
| Lesson settings | `META_FIELDS` and the `LessonMeta` type in `src/ui/lesson/LessonEditorPanels.tsx` |
| Slide | `fields` of the kind in `src/ui/slides/slideUi.tsx` |

3. `src/domain/models.ts`: add the field to the record's type as optional (`phone?: string`). Records already stored on the server do not have it: the domain code that reads it supplies the default. Never assume it exists, never rewrite the stored records (rule 16).
4. Where new records are created, give it a starting value: `createGroup` and `createStudent` in `src/domain/roster.ts`, `createLesson` in `src/domain/lessonOps.ts`, a slide's `create` in `src/domain/slideKinds.ts`, the sample in `src/services/seed.ts`.
5. The server checks every record the page sends and refuses one that does not fit. Add the field to the record's shape in `src/domain/entityChecks.ts` (`isSiteContent`, `isGroup`, `isStudent`, the lesson's `isLessonShape`) as `optional(...)` around the right checker and limit from `src/domain/argumentChecks.ts`, with a line in `src/domain/argumentChecks.test.ts`. A cleared box sends `''`: use `text(...)`, never `nonEmptyText`. Without this the live site refuses every save of that form. A slide's fields have no such shape: nothing to add for a slide.
6. Add the `FieldSpec` entry. Kinds: `text`, `textarea`, `boolean`, `number` (with `min`, `max`), `select` (with `options`), `list`. Copy a neighbour entry.
7. Add the label in the feature's file in `src/i18n` (`home.ts` `siteField`, `roster.ts` `fields`, `lesson.ts` `field`, `slides.ts` `field`). Arabic, feminine address.
8. Show the value where she asked, in the page `.tsx`, with its text from `src/i18n`. A new student field is not in the class-list file (import and export): tell her, and add it there only if she asks.
9. A rule about the value (limits, required, format) goes in `src/domain` with a test in `src/domain/domain.test.ts` first. A slide field that must also be in lesson files: add it to `fileFields`, `fromFile`, `toFile` in `src/domain/slideKinds.ts`, to `FileFieldName`, and write its line in `FIELD_HELP` (`src/i18n/lessonPrompt.ts`). A new kind of record (a new list she manages) is not a form field: skill `add-small-feature`.
10. Prove it on the real local server (rule 18): add a step to `e2e/firstRun.integration.ts` that fills the new box from the page, checks that `t.roster.errors.unknown` does not show, reloads, and finds the value still there.
11. Finish as in AGENTS.md section 5. Example message: `Add a parent phone field to the student form`.
