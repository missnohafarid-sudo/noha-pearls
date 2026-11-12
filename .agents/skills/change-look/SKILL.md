---
name: change-look
description: Use when the teacher asks to change colours, font size, spacing, rounded corners, how big or small something looks, or how a page is laid out. Arabic phrasings - غيّري اللون، اجعليه أخضر، الخط صغير، كبّري الأزرار، المسافات ضيقة، الصفحة مزدحمة، رتّبي الشكل. English - change the colour, make the text bigger, more space, make it look nicer.
---

# Change look

Goal: change a design token (whole site) or one page's own stylesheet (one page). Never inline styles.

1. Restate the request in Arabic as a visible change. Ask one question when needed: "كل الموقع أم هذه الصفحة فقط؟" with options 1) كل الموقع 2) هذه الصفحة فقط.
2. Whole site: edit the token in `src/ui/styles/tokens.css` (tokens: colours, fonts, radii). Tokens: `--bg`, `--surface`, `--surface-2`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-soft`, `--on-accent`, `--ok`, `--ok-soft`, `--bad`, `--bad-soft`, `--heart`, `--radius`, `--radius-small`, `--gap`, `--font`. Keep text readable: dark text on light background, `--on-accent` readable on `--accent`.
3. One page: edit that page's stylesheet in `src/ui/pages/` (`home.css`, `lesson.css`, `session.css`, `monitor.css`, `roster.css`, `board.css`, `cards.css`, `join.css`), or the feature's (`src/ui/slides/slides.css`, `src/ui/shell/shell.css`, `src/ui/scanner/scanner.css`, `src/ui/forms/forms.css`). Use `var(--token)` for colours and spacing.
4. A shared control (`.btn`, `.card`, `.chip`, `.input`, `.notice`) changes in `base.css` and so on every page. Tell her that before changing it.
5. Right-to-left: use logical properties only (`inline-size`, `margin-inline-start`, `padding-inline-end`, `text-align: start`). Never `left`, `right`, `margin-left`. See `.agents/rules/styles.md`.
6. No raw colour values outside `:root`. No `style=` in `.tsx` files.
7. Look at the result: `npm run dev`, open the page, describe to her what she will see.
8. Finish as in AGENTS.md section 5. Example message: `Make the accent colour a deeper green`.

Stop and hand over when she wants a new layout, new pictures, or a logo: that is not a small change.
