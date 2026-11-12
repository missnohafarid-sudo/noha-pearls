---
trigger: glob
globs: "**/*.css"
description: Rules for stylesheets
---

# Stylesheets

General rules: AGENTS.md section 4.

## Belongs here

- `src/ui/styles/tokens.css`: the tokens (colours, fonts, radii: `--accent`, `--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--ok`, `--bad`, `--radius`, `--gap`, `--font`), the only file where a colour literal may appear.
- `src/ui/styles/base.css`: the shared building blocks (`.btn`, `.card`, `.chip`, `.input`, `.notice`, `.stack`, `.row`, `.grid`).
- One stylesheet per page or feature next to its `.tsx` (`ui/pages/home.css`), only for that page's layout.

## Never here

- A raw colour (`#...`, `rgb(...)`) outside `tokens.css`. Use `var(--token)`.
- `left`, `right`, `margin-left`, `padding-right`, `text-align: left`, `float`. The site is right-to-left: use `inline-size`, `block-size`, `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`.
- Restating what `base.css` already does. Reuse the shared class.
- Changing a token to fix one page: the token changes the whole site. Use the page stylesheet for one page.

## Pattern to copy

`src/ui/pages/home.css`: grid and gap only, colours from tokens.

## Checks that fail otherwise

The architecture test fails on `left`/`right` and on a colour that is not a token. It names the file and the line.
