---
name: change-look
description: Use when the teacher asks to change colours (one colour or the whole palette of the site), font size, spacing, rounded corners, how big or small something looks, how a page is arranged, or to put a picture or a logo she gives. Arabic phrasings - غيّري اللون، اجعليه أخضر، غيّري ألوان الموقع، الخط صغير، كبّري الأزرار، المسافات ضيقة، الصفحة مزدحمة، رتّبي الشكل، ضعي هذه الصورة. English - change the colour, new colours for the site, make the text bigger, more space, rearrange the page, make it look nicer.
---

# Change look

Goal: change design tokens (whole site) or one page's own stylesheet (one page). Never inline styles.

1. Restate the request in Arabic as a visible change. Ask one question when needed: "كل الموقع أم هذه الصفحة فقط؟" with options 1) كل الموقع 2) هذه الصفحة فقط.
2. Whole site, one colour or all of them: edit the token values in `src/ui/styles/tokens.css`. Read the file first: the colours, fonts, radii and gaps of the site are tokens there. `--shadow-tint` repeats the ink colour as three numbers: change it with it. The site has seven looks, one per pearl, and the teacher picks one with the pearl button in the top bar: the first block of the file is the white pearl's look, and each other look has its own block `:root[data-theme='…']` that gives new values only to the tokens that differ. Ask her which look she means («1) المظهر الحالي فقط 2) كل المظاهر») and change that block. `src/ui/styles/tokens.test.ts` checks that text stays readable in every look: if it fails, pick a darker or a lighter value; never change the test. Two things keep their colours, and you tell her so: the brand pictures in `src/ui/assets/brand/`, and the groups' colours (each stored group has its own; never rewrite them). A new palette is the same tokens with new values, changed together in one change. Keep text readable: dark text on a light surface (or the reverse), `--on-accent` readable on `--accent`. After the change look at the buttons, the chips, the notices, a slide and a student's screen.
3. One page: edit that page's stylesheet in `src/ui/pages/` (`home.css`, `lesson.css`, `session.css`, `monitor.css`, `roster.css`, `board.css`, `cards.css`, `join.css`), or the feature's (`src/ui/slides/slides.css`, `src/ui/shell/shell.css`, `src/ui/library/library.css`, `src/ui/forms/forms.css`). Use `var(--token)` for colours and spacing.
4. A shared control changes in `base.css` (`.card`, `.chip`, `.notice`) or `controls.css` (`.btn`, `.input`) and so on every page. Tell her that before changing it.
5. A page arranged differently: move the existing parts in the page's `.tsx` and its stylesheet. The parts keep doing what they did; nothing is removed unless she asked.
6. A picture or a logo she gives you: put the file in `src/ui/assets/brand/` (check its size yourself: under 500 KB, else ask her for a smaller one; never a photo in which a student can be recognised) and use it as the ones there are used (`url(...)` in a stylesheet, or an `import` as in `src/ui/join/NamePicker.tsx`). Do not point at a picture on another website: it can disappear.
7. Right-to-left: use logical properties only (`inline-size`, `margin-inline-start`, `padding-inline-end`, `text-align: start`). Never `left`, `right`, `margin-left`. See `.agents/rules/styles.md`.
8. No raw colour values outside `tokens.css`. No `style=` in `.tsx` files.
9. Look at the result: `npm run dev`, open the page, describe to her what she will see.
10. Finish as in AGENTS.md section 5. Example message: `Make the accent colour a deeper green`.

She wants to choose between looks (a button that switches the look, a dark mode, a look she sets for everyone): that is a small feature, skill `add-small-feature`.
