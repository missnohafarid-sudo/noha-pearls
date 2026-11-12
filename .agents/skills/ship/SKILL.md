---
name: ship
description: Use when the teacher asks to publish, release or put a finished change on the live site so everyone sees it. Arabic phrasings - انشري، انشري التغيير، أريد أن يراه الجميع، ارفعيه على الموقع، احفظي التغيير ونزّليه. English - publish, ship it, put it on the site, deploy.
---

# Ship

This skill is the finishing procedure; AGENTS.md section 5 is its home.

1. Is there something to publish? If nothing was changed in this conversation, tell her in Arabic there is nothing new to publish. Stop.
2. Run `npm run check`. It runs types, unit tests, the architecture test, the protected-files guard and the browser walkthrough.
3. Failed: read the message, it says where the code belongs. Fix the code (never the check), run again. Three failures: discard your changes, tell her in Arabic it could not be done safely, hand over to the maintainer.
4. Passed: run `npm run ship -- "message"`. The message: one line, imperative mood, at most 65 characters, what changed and why. No mention of AI, tools or how it was made. Good: `Reword the start button on the lesson page`, `Make the accent colour a deeper green`. Bad: `Update files`, `AI fixes`, anything longer than 65 characters.
5. One change per ship: ship only what you changed for this request.
6. Tell her in two or three Arabic sentences: what changed, where to look, that the site updates itself in a few minutes, and that «تراجعي عن آخر تغيير» undoes it.

Never use `git` yourself, `--no-verify`, or force. If `npm run ship` itself fails (not the check): hand over.
