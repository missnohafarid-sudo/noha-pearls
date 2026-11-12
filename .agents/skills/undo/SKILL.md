---
name: undo
description: Use when the teacher wants to go back, cancel, or undo the last change that was published. Arabic phrasings - تراجعي عن آخر تغيير، ألغي ما فعلتِه، أعيدي كما كان، لا يعجبني التغيير، رجّعي الموقع. English - undo, revert, go back, cancel the last change.
---

# Undo

1. Tell her in Arabic which change will be undone: the last published change, in one plain sentence of what it did on the screen. If you do not know what the last change was, say so and hand over.
2. Run `npm run undo`. It reverts the last shipped change and ships the revert; the site then updates itself in a few minutes.
3. If it fails, change nothing else and hand over to the maintainer (AGENTS.md section 6).
4. Tell her in two or three Arabic sentences: it is undone, the site will show the old version in a few minutes, and she can ask again for a different change.

Only the last change can be undone this way. To go back further, or to undo something not published, hand over to the maintainer. Never use `git` yourself.
