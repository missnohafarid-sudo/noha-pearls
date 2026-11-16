---
name: fix-a-bug
description: Use when the teacher says something is broken, wrong, stuck, missing or confusing - a button does nothing, a score is wrong, a page is blank, a student cannot answer, an error message appears. Arabic phrasings - الموقع لا يعمل، ضغطتُ ولم يحدث شيء، النتيجة خاطئة، الصفحة بيضاء، ظهرت رسالة خطأ، الطالبة لا تستطيع الإجابة، فيه مشكلة. English - it is broken, nothing happens, wrong score, blank page, error.
---

# Fix a bug

Always: failing test first, then the fix. Never the other way round.

1. Ask what she sees, in Arabic, with numbered options where possible: which page, what she pressed, what she expected, what happened. Restate it as "should do X, does Y".
2. Reproduce it: `npm run dev`, repeat her steps. Cannot reproduce: stop and hand over.
3. Find the layer that owns the wrong behaviour (AGENTS.md section 3):

| The wrong thing is | Layer | Test file |
|---|---|---|
| A score, who may answer, what a device shows, a limit, a lesson file check | `src/domain` | `src/domain/domain.test.ts` or the test file beside the module |
| A command (save, start session, reveal, hearts) or who may do it | `src/services` | `src/services/services.test.ts` |
| Storage, sign-in code, card read or print, QR | `src/infrastructure` | the `*.test.ts` beside the adapter |
| The page answers «تعذّر تنفيذ العملية. حاولي مرة أخرى.» to something that should work: the server refused what the page sent | the shape in `src/domain/entityChecks.ts` or `src/services/surfaceShapes.ts` | `src/domain/argumentChecks.test.ts`, and a step in `e2e/firstRun.integration.ts` that does it from the page |
| Wrong words | `src/i18n` | none: use skill `change-wording` |
| Layout or looks | `src/ui` css | none: use skill `change-look` |

4. Write a test that fails because of the bug, in the right `describe` block. Run `npm test`. It must fail, for the reason she described. If it passes, the test does not capture the bug: rewrite it.
5. Fix the code in that same layer. Do not hide the symptom in the UI. Run `npm test`: the new test passes and no other test changed.
6. Never change an existing test's expectation, skip it, or delete it to get green (AGENTS.md rule 9). If an old test says the buggy behaviour is correct, stop and hand over.
7. A bug in the wiring of the UI with no rule behind it (a button not connected): fix it in `src/ui`, and say in your report to the maintainer that no unit test could cover it; the browser walkthrough in `npm run check` still runs.
8. Finish as in AGENTS.md section 5. Example message: `Count group answers once per group in the score`.

Stop and hand over when the bug involves passwords, the authenticator, stored data lost, or a deployed site that is down.
