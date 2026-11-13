---
name: undo
description: Use when the teacher wants to go back, cancel or undo a change that was published, all of it or only part of it, the last one or an earlier one. Arabic phrasings - تراجعي عن آخر تغيير، ألغي ما فعلتِه، أعيدي كما كان، لا يعجبني التغيير، رجّعي الموقع، أبقي كذا وأعيدي كذا كما كان. English - undo, revert, go back, cancel the last change, keep this but put that back.
---

# Undo

First tell her in one plain Arabic sentence which change you mean, as what it did on the screen. If you do not remember it, read it: `git --no-pager log --oneline -10` lists the shipped changes, `git --no-pager show --stat <commit>` and `git --no-pager show <commit>` say what one did (reading is allowed, rule 10).

## All of the last change

1. Run `npm run undo`. It takes back the last change that is on the site and sends that to the online check. If it answers that there is a change on this computer that is not on the site, run `npm run deployed` first. A change that is still being checked will reach the site: wait for `LIVE`, then undo it. Only when the online check failed did the change never reach the site: then `npm run discard` throws it away (tell her first what will be thrown away) and nothing on the site needs undoing. If it answers that this computer was behind, or that the newest change is the maintainer's, do what it says: read the log again, and take back an earlier change with the next section.
2. Run `npm run deployed` and wait for its answer, as in AGENTS.md section 5. After `LIVE`, tell her in two or three Arabic sentences that the site is as it was before that change, and that she can ask for a different change.

Running `npm run undo` again brings the change back: it undoes the undo. So when the last shipped change is itself an undo (its line in the log starts with `Revert`) and she wants to go one change further back, use the next section.

## Part of a change, or a change that is not the last one

`npm run undo` cannot do this. Do it as a new small change:

1. Ask her which part goes back, with numbered options made from what the change did on the screen (for example «1) لون الأزرار 2) حجم الخط»).
2. Read what that change did with `git --no-pager show <commit>`.
3. Edit the files so that only those parts are as they were before, and everything she wants to keep stays.
4. Finish as in AGENTS.md section 5. Example message: `Put back the old heading size, keep the new colours`.

## Stop and hand over when

`npm run undo` fails; or what she wants back is data (a deleted lesson, a student's answers, a class list): undo brings back the site's code, never its data.
