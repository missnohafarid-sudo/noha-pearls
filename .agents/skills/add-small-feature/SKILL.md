---
name: add-small-feature
description: Use when the teacher asks for a small new thing the site can do that no other skill covers - a button that shows or hides something; a look (theme) each person chooses for her own device; a new link, section, counter or shortcut on a page; a new setting the teacher chooses; a small new list she manages. Arabic phrasings - أضيفي زرًّا، أريد أن تختار كل طالبة مظهر جهازها، أضيفي خيارًا، أريد قسمًا جديدًا في الصفحة، أريد أن يظهر كذا عند الضغط. English - add a button, a toggle, a new option, a new setting, a personal theme switch. NOT for changing the site's look for everyone or a night look: that exists (the pearl button in the top bar, skill content-is-edited-in-the-site), and its colours are changed with skill change-look.
---

# Add a small feature

You may build this yourself. Small means: she can see it work on one or two screens, it is one change she can keep or undo, and it needs none of the maintainer-only things (AGENTS.md section 6). Bigger than that: split it into small changes and do them one by one (AGENTS.md section 2, step 4).

1. Restate in Arabic what she will see and do. Ask at most two questions with numbered options. The one that matters most is who it is for:
   - «1) كلُّ واحدة تختار لنفسها على جهازها» (remembered on that device only)
   - «2) أنتِ تختارين مرة واحدة، فيظهر اختياركِ للجميع» (a setting the site keeps)
   - «3) يعود كما كان كلما أُغلقت الصفحة» (nothing is remembered)
2. Give it the smallest home that does the job:

| It | Where it lives | Copy |
|---|---|---|
| changes only what one page shows, nothing remembered | state in that page's component in `src/ui` | `shownSlideId` in `src/ui/pages/LessonPage.tsx` |
| is remembered on this device only | a small page part that reads and remembers that one choice, built in `src/app/container.ts` over `browserStorage(localStorage)` (`KeyValueStorage`, `src/ports/storage.ts`) and handed to the pages with the other page parts; the pages never touch browser storage themselves (rule 5) | `pageParts()` in `src/app/container.ts` and `loadCardCodec` in `src/services/Services.ts` |
| is a setting the teacher chooses for everyone | one more field on the site record, which every device already receives live (`useSite`) | skill `add-form-field`, form "Home page text" (`SiteContent`); `ContentService.updateSite` already lets only the teacher change it |
| is a small new list she manages | a new collection of its own | the teachers list, end to end: `Teacher` in `src/domain/models.ts`, `teachers` in `src/ports/store.ts` (with its role: what the yearly clearing does with it), `src/domain/teachers.ts`, `src/services/TeacherService.ts`, its lines in `Services.ts`, `surfaceEffects.ts`, `surfaceShapes.ts` and `createDataServices.ts`, `src/ui/session/TeachersPanel.tsx` |

3. Whatever decides something (which looks exist and which is the default, who may change it, a limit) is a rule: it goes in `src/domain` with a unit test written first (rule 3). A read that only the teacher may make is wrapped as `RosterService.watchClasses` is (`adminWatch`); a command only she may give starts with `requireAdmin` (rule 17).
4. If it stores anything on the server or adds a command, rules 16 and 18 apply: a new field is optional and read with a default, the three tables name the new method, and a step in `e2e/firstRun.integration.ts` does it from the page on the real local server and checks that `t.roster.errors.unknown` does not show and that it is still there after a reload.
5. Words go in `src/i18n`. Look goes through tokens (skill `change-look`).
6. Add a step for it to the nearest file in `e2e/steps/` (read two steps there first; a new file is registered in `e2e/walkthrough.e2e.ts`).
7. The steps you added are the proof, as the teacher and as a student or visitor who is not signed in; the online check runs them when you ship. If you can open the site yourself (`npm run dev`), look at it too. Describe to her what each one sees.
8. Finish as in AGENTS.md section 5. Example message: `Let the teacher choose the site's look for everyone`.

## Worked example: looks (themes)

The site already has this, built the way a setting the teacher chooses for everyone should be. Read it before building a similar setting:

- A look is a set of token values and nothing else: one block per look in `src/ui/styles/tokens.css`, `:root[data-theme='name'] { --accent: …; --bg: …; }`, giving new values only to the tokens that differ. No colour anywhere else (rule 6). `src/ui/styles/tokens.test.ts` keeps text readable in every look.
- The looks, the default one and "the look to show for this site record" are rules: `src/domain/themes.ts` with its test. The looks are the seven pearl shades of `src/domain/pearlShades.ts`.
- One small hook, `src/ui/shell/useSiteTheme.ts`, puts the look's name on the page's root element; `src/ui/App.tsx` calls it.
- The teacher chooses for everyone: the look's name is an optional field of `SiteContent` (`theme`), saved by the pearl button `src/ui/shell/ThemePicker.tsx` through `content.updateSite` with the latest site record and only that field changed; students get it within a moment because the site record is live. In `isSiteContent` the name is `optional(text(40))`, not a list of the names: `themes.ts` turns a name it does not know into the default, so removing a look later cannot make the stored record unreadable. A form that shows only some fields of a record saves only those, merged into the latest record (see the home form in `src/ui/pages/HomePage.tsx`). In `e2e/firstRun.integration.ts` the reload is the proof.
- She asks that each person choose for herself: that is a new, second choice remembered on the device (second row of the table), shown by a button of its own in the top bar; the device's choice wins over the site's while it is set. Decide that rule in `src/domain/themes.ts`, with a test.
- An eighth look, or a look that is not a pearl: stop and hand over. `tokens.css` is close to its length limit and the pearl shades are shared with the slide badges.

## Stop and hand over when

It needs a protected file or a new dependency; it touches signing in, passwords or the limits; it would show students' names, answers or results to someone who cannot see them today; it would delete or rewrite data that is already stored; it needs the server to do something on a timer or to talk to another website.
