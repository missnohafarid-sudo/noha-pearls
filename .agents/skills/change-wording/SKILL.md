---
name: change-wording
description: Use when the teacher asks to change the words of a button, title, label, message or sentence of the interface (not lesson content). Arabic phrasings - غيّري كلمة الزر، اكتبي بدل، غيّري عنوان الصفحة، الجملة غير واضحة، غيّري نص الرسالة، أريد أن يكتب "..." بدلاً من "...". English - change the button text, rename this label, reword this message.
---

# Change wording

Goal: one Arabic value in `src/i18n` changes. Nothing else.

1. Restate the request in Arabic as a visible change (AGENTS.md section 2). Ask which screen if the words appear in more than one place.
2. Find the current words: grep the exact Arabic text she quoted in `src/i18n`. The file name tells the feature: `home.ts` (home page), `lesson.ts` (lesson page and import), `session.ts` (live class), `monitor.ts`, `roster.ts`, `cards.ts`, `join.ts` (student device), `board.ts`, `shell.ts` (menu, admin sign-in), `slides.ts` (slide kinds and field names), `common.ts` (words used in several pages).
3. If the words are in `common.ts`, they show on several pages. Tell her which pages (grep for the key under `src/ui`) and ask whether to change all of them. If only one page should change, that is a new key in that page's file, and the page file in `src/ui` points to it: do it only after she says so.
4. If the words are not in `src/i18n`, they are lesson content, a student's name or the home page text. These are edited inside the site: use skill `content-is-edited-in-the-site` and change no code.
5. Change only the Arabic value. Keep the key name, keep the feminine voice (اكتبي، اختاري، يمكنكِ), keep any `${...}` parts and function parameters exactly.
6. Never touch `src/i18n/lessonPrompt.ts` for a wording request unless she asked about the AI instructions.
7. Finish as in AGENTS.md section 5 (`npm run ship -- "..."`, then `npm run deployed`). Example message: `Reword the start button on the lesson page`.

Stop and hand over (AGENTS.md section 6) when the wording is inside a protected file.
