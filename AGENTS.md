# AGENTS.md

Arabic classroom platform: Vite, React 19, TypeScript strict.

## 1. Who you are working for

A teacher. She is not a programmer and cannot judge your code.

- Speak to her in simple Arabic, feminine address (استخدمي، اكتبي).
- Never show code, file names, commands or technical terms unless she asks.
- Say what will change ON THE SCREEN, in her words ("الزر سيصير أخضر").
- She trusts you. A wrong "done" costs her a classroom. When unsure, stop and say so.

## 2. Before you touch anything

1. Restate the request in one or two plain Arabic sentences, as a visible change.
2. If it could mean two things, ask at most two short questions. Each has two or three numbered options she picks by number. Never ask an open or technical question.
3. Classify it with this table, then follow the skill in `.agents/skills/` or the action given.

| She says (examples) | What it is | Do |
|---|---|---|
| «غيّري كلمة الزر إلى ...»، «اكتبي "ابدأ" بدل "بدء"» | Interface wording | Skill `change-wording` |
| «اجعلي اللون أخضر»، «الخط أكبر»، «المسافة بين الأزرار ضيقة» | Look | Skill `change-look` |
| «غيّري نص الصفحة الرئيسية»، «أضيفي سؤالاً للدرس»، «أضيفي فيديو أو صوتًا أو صورة أو ملف PDF أو محاكاة للدرس»، «صحّحي اسم طالبة»، «انقلي سلمى إلى مجموعة أخرى»، «عدّلي الدرس» | CONTENT, edited inside the website by the admin (media goes in a «شريحة وسائط» from a public link). NOT code | Skill `content-is-edited-in-the-site`. Change no code |
| «أريد نوعاً جديداً من الأسئلة»، «شريحة فيها ترتيب أو مطابقة» | New slide kind | Skill `add-slide-kind` |
| «أريد خانة لرقم ولي الأمر في بيانات الطالبة» | New field on an existing form | Skill `add-form-field` |
| «الموقع لا يعمل»، «ضغطتُ فلم يحدث شيء»، «ظهرت رسالة خطأ» | Bug | Skill `fix-a-bug` (test first) |
| «تراجعي عن آخر تغيير»، «لا يعجبني ما حدث» | Undo | Skill `undo` |
| «انشري»، «أريد أن يراه الجميع» | Publish | Skill `ship` |
| Passwords, the authenticator code, backups or restore, the database, GitHub settings, deleting data, anything in the protected files | Maintainer only | STOP. Change nothing. Tell her in Arabic this needs the maintainer. |
| Anything that fits no row | Unknown | STOP. Say so in Arabic. Do not improvise. |

4. One request = one small change, shipped on its own. Several requests: do them one at a time, each finished and shipped before the next.

## 3. Map of the code

| Layer | Holds | May import |
|---|---|---|
| `src/domain` | Rules and data shapes. Pure: no React, no browser, no I/O | itself only |
| `src/ports` | Interfaces the app needs from outside (`DocumentStore`, `AuthGateway`, `Caller`, codes) | `domain` |
| `src/services` | Use cases as classes (`LessonService`, `RosterService`, ...). Every change of stored data goes through one | `domain`, `ports` |
| `src/infrastructure` | Adapters that implement ports: browser storage, auth, markers, QR | `domain`, `ports` |
| `src/app` | `container.ts` (the only file naming concrete adapters), `config.ts`, `seed.ts` | everything |
| `src/i18n` | Every word the interface shows, one file per feature, `t` in `index.ts` | `domain` |
| `src/ui` | React pages and components | `domain`, `i18n`, `services`, `ports` (types only), `app/config` |

| Concern | Its one home |
|---|---|
| Data shapes | `domain/models.ts` (lessons, slides and folders: `domain/lessonModels.ts`) |
| Slide kinds: template, file read/write, repairs | `domain/slideKinds.ts` |
| Slide kinds: edit fields and drawing | `ui/slides/slideUi.tsx` |
| Lesson file format and checks | `domain/lessonFormat.ts` |
| Lesson edits (add, copy, move, remove slide) | `domain/lessonOps.ts` |
| The lesson folder tree: nesting, moving, what a folder holds, removing one without losing anything | `domain/folders.ts` |
| The lesson library screen: path line, folder tiles, moving by drag or by the move dialog | `ui/library/` (words in `i18n/library.ts`) |
| Which folders a reader sees, and the folder a page shows for a requested one | `domain/folders.ts` |
| Where an item may be put (by drag or by the move dialog), and repairing a stored folder tree | `domain/folders.ts` |
| Drag wiring (what carries a drag, what is dropped on) | `ui/library/useDragMove.tsx` |
| Who may answer what, whose answer counts for a student (her own, else her group's shared device's), text length limit | `domain/answering.ts` |
| Who has answered the slide on screen, group by group (the pearl panel) | `domain/answering.ts` (`answerStatusByGroup`) |
| Marking and group scores | `domain/scoring.ts` |
| Pearls a group has earned | `domain/scoring.ts` |
| Tallies, monitor table, heart totals | `domain/analytics.ts` |
| What a group's device shows | `domain/pacing.ts` |
| Card encoding | `domain/cards.ts` |
| Choice limits | `domain/choices.ts` |
| What a media link shows and how: its type, its address, its frame; which photos a slide shows | `domain/media.ts` |
| Keyboard moves through a list of options, typing to jump | `domain/listNavigation.ts` |
| Roster rules, group colours | `domain/roster.ts` |
| Class list format | `domain/rosterFormat.ts` |
| The kept record of an ended class | `domain/records.ts` |
| Weeks and months on the school's clock | `domain/periods.ts` |
| What class data is cleared and when: a date range, the end of the school year | `domain/retention.ts` |
| Cumulative results of a class list over a period, and what anyone may see of them: group totals, one student's own line | `domain/standings.ts` |
| Who may give a heart (the teacher's, live or ended; a student's, live only) | `domain/rewards.ts` |
| Who is let into a class, one device per name, who joins the roll when a device is let in (a shared device brings its whole group), and where a returning device lands | `domain/admission.ts` |
| Who is here: the roll, and who counts in tallies and scores | `domain/attendance.ts` |
| A session's minimum of interactions, and who is unresponsive | `domain/engagement.ts` |
| A class session: live or ended, starting one, which one a page shows, and what a running class keeps from being removed (its class list, teacher, lesson) | `domain/sessions.ts` |
| The list of teachers | `domain/teachers.ts` |
| Session codes: making and reading one | `domain/ids.ts` |
| Who is asking: the admin or not, and which device | `ports/caller.ts` |
| Is this the admin | `services/AuthService.ts` |
| What the UI may ask of the app | `services/Services.ts` |
| How the data services are wired together | `services/createDataServices.ts` |
| Addresses and links | `ui/routing/routes.ts` |
| Whether the edit panel shows | `ui/shell/AdminPanel.tsx` |
| The pearl and its panel over the slide's corner (groups, answered marks, hearts) | `ui/session/pearlPanel/`; how a teacher's heart is given: `ui/hooks/useTeacherHearts.ts` |
| Settings (password hash, authenticator key) | `app/config.ts` |
| When students' data is cleared at the end of the school year (the setting) | `services/RetentionService.ts`, edited on the results page |
| Colours, fonts, radii | `ui/styles/tokens.css` |
| Shared controls | `ui/styles/base.css` |
| Our own form widgets (drop-down, check box, file picker, number stepper, password field) and floating layers: component and look | `ui/forms/` (`Select`, `Checkbox`, `FilePicker`, `Stepper`, `PasswordField`), `ui/common/useAnchoredLayer.ts`, `ui/styles/widgets.css` (`PasswordField`'s look: `ui/forms/passwordField.css`) |
| The top bar's tabs: the list, one tab, and the menu that replaces the row of tabs on narrow screens | `ui/shell/NavLink.tsx` (list and tab), `ui/shell/NavMenu.tsx` and `navMenu.css` (menu and the width where it takes over) |
| Saying who answers a question (each student, or one answer for the group) | `ui/slides/ScopeBadge.tsx`; words `t.common.scope` |
| Teachers' names (home page, class start) | the `teachers` list, edited in `ui/session/TeachersPanel.tsx`; words in `i18n/home.ts` |
| AI instructions for lesson files | `i18n/lessonPrompt.ts` (generated from the slide-kind registry) |

## 4. Rules you must never break

1. Respect the import column in section 3. Reason: each layer has one job.
2. All interface text lives in `src/i18n`, in Arabic, feminine address. No Arabic string in any other folder. Reason: one place to read and fix wording.
3. A rule (scoring, who may answer, pacing, limits, validation) lives only in `src/domain`, with a unit test in `src/domain/domain.test.ts` (or the service test in `src/services/services.test.ts`). Before writing one, grep for the concern and extend its home. Reason: DRY, one home each.
4. The UI changes data only by calling a service from `useServices()`. Never write to the store directly. Reason: services check who is the admin.
5. Browser storage and network calls exist only in `src/infrastructure` (handed in by `src/app/container.ts`). Reason: swapping the backend must touch one place.
6. Styles use only the tokens (`var(--accent)` and the rest) in `src/ui/styles/tokens.css` (the only file where a colour literal may appear; shared building blocks live in `base.css`), and logical properties (`inline-size`, `margin-inline-start`, never `left`, `right`, `width` for layout direction). No raw colours, no inline `style` except the existing `toneStyle` and bar widths. Reason: the site is right-to-left and must look consistent.
7. Add no dependency. Add no top-level folder. Reason: each is a long-term cost she cannot judge.
8. Never edit a protected file: `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `docs/**`, `.github/**`, `.githooks/**`, `.guard/**`, `scripts/**`, `e2e/**`, `src/architecture.test.ts`, `vite.config.ts`, `vitest.e2e.config.ts`, `tsconfig.json`, the `scripts` section of `package.json`, `src/infrastructure/vendor/**`. A check fails if they change. Never run `npm run guard:accept`: it is for the maintainer.
9. Never weaken, skip, delete or rewrite a test or a check to make it pass (no `.skip`, no loosened expectation, no removed assertion, no `any` or `@ts-ignore` to silence types). Fix the code. A test may change only when she asked for different behaviour.
10. Use only `npm run ship` and `npm run undo` for git. Never `git` directly, never `--no-verify`, never force-push, never `git reset --hard`.
11. Never create or read `.env` files. Never print a secret or the admin password.
12. No dead code, no commented-out code, no comments that restate the code.
13. Keep it simple: no option, flag, layer or abstraction nobody asked for. One reason to change per module. Add by adding (a registry entry, a field in a list), not by editing every caller. A unit asks its direct collaborator, never reaches through it (`a.b.c.d`).
14. A change of structure (moving code, renaming) and a change of behaviour are separate: separate `ship`s.
15. There is no backend yet. Requests about backup, restore or the database go to the maintainer.

## 5. Finishing a change

1. Run `npm run check`.
2. If it fails, read the message: it says where the code belongs. Fix the code, run it again.
3. After three failed attempts, discard your changes and tell her in Arabic that it could not be done safely and should go to the maintainer. Do not weaken a check.
4. When it passes, run `npm run ship -- "message"`. The message is one line, imperative, at most 65 characters, says what changed and why, never mentions AI or tools.
5. Tell her in two or three Arabic sentences: what changed, where to look on the site, and that she can say «تراجعي عن آخر تغيير» to undo it. The site updates itself a few minutes after shipping.
6. When she asks «ماذا غيّرتِ؟», answer in plain Arabic from what you did, as visible changes. No code, no file names.

## 6. When to stop and hand over

Stop, change nothing, and tell her in Arabic this needs the maintainer, when:

- the request touches a protected file, passwords, the authenticator, backups, the database, GitHub settings or deleting data;
- it fits no row of the table in section 2;
- a rule in section 4 would have to be broken to do it;
- `npm run check` fails three times;
- `npm run ship` or `npm run undo` itself fails;
- you do not understand what she sees on the screen.

Commands: `npm run dev` (run the site locally), `npm test`, `npm run typecheck`, `npm run check`, `npm run ship -- "..."`, `npm run undo`.
