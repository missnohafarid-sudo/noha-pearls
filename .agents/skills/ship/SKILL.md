---
name: ship
description: Use when the teacher asks to publish, release or put a finished change on the live site so everyone sees it. Arabic phrasings - انشري، انشري التغيير، أريد أن يراه الجميع، ارفعيه على الموقع، احفظي التغيير ونزّليه. English - publish, ship it, put it on the site, deploy.
---

# Ship

This skill is the finishing procedure; AGENTS.md section 5 is its home.

1. Is there something to publish? If nothing was changed in this conversation, tell her in Arabic there is nothing new to publish. Stop.
2. Run `npm run ship -- "message"`. It runs the whole check first (types, unit tests, the architecture test, the protected-files guard, the real local server, the browser walkthrough; a few minutes) and ships only when it passes. The message: one line, imperative mood, at most 65 characters, what changed and why. No mention of AI, tools or how it was made. Good: `Reword the start button on the lesson page`, `Make the accent colour a deeper green`. Bad: `Update files`, `AI fixes`, anything longer than 65 characters.
3. The check failed: read the message, it says where the code belongs. Fix the code (never the check) and ship again. Three failures: discard your changes, tell her in Arabic it could not be done safely, hand over to the maintainer.
4. One change per ship: ship only what you changed for this request.
5. Run `npm run deployed` and wait for its answer (about five minutes). Its first word is `LIVE`, `NOT LIVE` or `UNKNOWN`; do with each exactly what AGENTS.md section 5 says. Only after `LIVE` do you tell her the change is on the site, and then you ask her whether to keep it, undo all of it, or keep part of it.

Never change anything through `git` yourself, never `--no-verify`, never force. If `npm run ship` itself fails (not the check): hand over.
