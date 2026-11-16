# Handover checklist

For the technically able person who sets up the teacher's laptop once. Everything the agent follows is in `AGENTS.md`, `.agents/` and the checks; none of it can stop someone who edits the repository by hand, so follow the guard steps below.

## 1. Laptop

- [ ] Install Node 24 and git.
- [ ] Create an SSH key, add the public key to her GitHub account (Settings > SSH and GPG keys).
- [ ] Clone the repository over SSH into a folder she will keep.
- [ ] `npm install` in the folder. This also installs the git hook. Check that it succeeded without errors.
- [ ] The full check never runs on her laptop: `npm run ship` runs a quick one and GitHub runs the rest before a change can reach `main` (branch `try`, see the header of `.github/workflows/deploy.yml`). Do not ask her agent to run `npm run check`.
- [ ] Install the GitHub CLI and run `gh auth login`. An SSH key does not sign the CLI in. It is needed later for the operations commands.

### Bringing a laptop that is already set up to date

After the maintainer changes the scripts or the agent's rules, her laptop gets them with one pull. Until then her agent still runs the old commands.

- [ ] In the project folder: `git status` shows nothing to commit and `git log origin/main..HEAD` prints nothing. If either shows something, a change of hers is still only on this laptop: push it or sort it out by hand first.
- [ ] `git pull --ff-only origin main`. No `npm install` is needed unless `package.json`'s dependencies changed.
- [ ] Start a new conversation with the agent, so it reads the current `AGENTS.md`.

From then on `npm run ship` fetches the maintainer's newer changes by itself and puts her change on top of them.

## 2. Antigravity

- [ ] Open the folder in Antigravity. In the agent's rules and workspace view confirm it lists `AGENTS.md` and the rules in `.agents/rules/` (domain, services, infrastructure, ui, styles, text) and the skills in `.agents/skills/`.
- [ ] Terminal execution: set it to ask before running commands, and allow only this project's `npm run` scripts and the read-only git commands its rules use (`git status`, `git --no-pager log`, `git --no-pager show`, `git --no-pager diff`) plus `git restore`. The setting lives on the machine, not in the repository: Settings > General > Global Permissions, with per-project overrides. Labels differ by version. The intent: she approves every command except those; nothing outside the project folder runs unasked.
- [ ] Choose the model (a Gemini Flash class model).
- [ ] Do not give the agent any file with passwords or keys.

## 3. Protected-files guard

- [ ] Run `npm run guard:init` once, so the guard records fingerprints of the protected files.
- [ ] Keep the maintainer key off her laptop. `npm run guard:accept` needs it; the agent must not have it. Whoever holds it accepts intended changes to protected files.

## 4. Deployment

The site runs as one Cloudflare Worker (`noha-pearls`) at `https://noha-pearls.miss-noha-farid.workers.dev`. GitHub Actions is the only deployer, through `.github/workflows/deploy.yml`. A change shipped from her laptop goes to the branch `try`: the workflow runs the whole check there and, only when it passes, moves `main` to that change, deploys it and smoke-tests the site. A direct push to `main` (the maintainer's) is checked and deployed the same way. Nobody deploys by hand from a laptop.

Repository secrets (Settings > Secrets and variables > Actions):

| Secret | What it is for |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Lets the workflow deploy the Worker to the Cloudflare account. |
| `CLOUDFLARE_ACCOUNT_ID` | Says which Cloudflare account. |
| `ADMIN_PASSWORD` | The teachers' password (8 characters or more). The deploy gives it to the Worker as a Worker secret. |
| `ADMIN_TOTP_SECRET` | The authenticator key every teacher scans once. Make one with `npm run admin:2fa`. The deploy gives it to the Worker as a Worker secret. |

The deploy refuses to run if the password is short, the key is not valid, or either is the public development value (`scripts/worker-secrets.mjs`). A Worker without the two admin secrets refuses every sign-in.

- [ ] Add the four secrets. Never put them in a file, an issue or a chat.
- [ ] Give her the password and the authenticator QR on paper, stored somewhere safe.
- [ ] After the first deploy, open the Actions tab and confirm both jobs, `check` and `deploy`, are green; the smoke test ("Smoke test the live site") is the last step of `deploy`.

### Changing the admin password or the authenticator key

1. Change the repository secret (`ADMIN_PASSWORD`, or `ADMIN_TOTP_SECRET` made with `npm run admin:2fa`).
2. Run the workflow by hand: Actions > Check and deploy > Run workflow.
3. Every teacher is signed out once, because the deploy drops the open connections. If the key changed, every teacher scans the new QR. Students' devices are not affected.

### "The day's limit is reached"

The site counts the rows it writes each UTC day (`src/ports/limits.ts`). Above `DAY_ROWS_ANSWERS_ONLY` (80,000) visitors and students can only do the essentials (answer, join, leave); above `DAY_ROWS_CLOSED` (95,000) they can write nothing, while the teacher is never stopped. The count starts again at 00:00 UTC, so it opens by itself. Nothing needs to be done; the accepted risks of the free plan are listed in `docs/PLAN.md` 2.5.

### Where the data lives

All data is in the hub's own storage inside the Cloudflare account (a Durable Object with SQLite). There is no D1 or KV. **Backups are not built yet.** The plan (`docs/PLAN.md` 2.7) is a weekly encrypted backup to a private repository. Until then, backup and restore requests have no command.

The D1 database created earlier is unused. It can be deleted in the Cloudflare dashboard.

### Where the hub runs

A Durable Object stays where it was first made, and Cloudflare cannot move it. The first hub, named `school`, was made in the United States, by the deploy's smoke test from a GitHub runner. The data moves to a new hub, `school-middle-east`, made with the location hint `me` (`src/server/hubName.ts`). Cloudflare runs no Durable Objects in the Middle East itself, so it places a `me` hub in the nearest data centre that has them; Qatar cannot be chosen. The dot at the bottom left of the home page note says which data centre the hub runs in.

The move goes out in three releases, each deployed and checked before the next:

1. A hub marked as handed over refuses every request, closes its sockets and wakes for no alarm. Nothing marks one yet.
2. The Worker sends everything to the new hub. On its first start, the new hub asks the old one for all its tables (the old one stops answering, in memory only), stores them together with its own "moved in" mark, and then marks the old one as handed over for good. A rollback to release 1 after this gives an outage, never two copies that drift apart. Never roll back past release 1 once release 2 is live.
3. After the data is confirmed on the live site: the old hub's data is deleted, then the move code is removed.

### The old Pages site

The old GitHub Pages site was a browser-only prototype whose files carried the password's hash and the authenticator key. Nothing in this repository deploys to Pages any more. Switch it off once:

- [ ] Repository > Settings > Pages: next to "Your site is live at", open the "..." menu and choose "Unpublish site".
- [ ] Repository > Settings > Environments: delete the `github-pages` environment.
- [ ] The old bundle was public. If the current `ADMIN_PASSWORD` or `ADMIN_TOTP_SECRET` was ever used to build a Pages version, replace it (see "Changing the admin password" above).

## 5. Five-minute smoke test

- [ ] Ask the agent, in Arabic: change one word on the home page's lesson heading (for example «غيّري كلمة "الدروس" إلى "دروسنا"»). Confirm it restates the request in simple Arabic, changes only the Arabic value in `src/i18n/home.ts`, runs `npm run ship -- "..."` (a quick check on the laptop; the full check runs online before the change can reach `main`), then `npm run deployed`, and only after that answers `LIVE` explains in Arabic and asks whether to keep the change, undo it, or keep part of it.
- [ ] Confirm the deploy ran on GitHub (Actions tab) and the site shows the change.
- [ ] Ask it «تراجعي عن آخر تغيير». Confirm it runs `npm run undo`, then `npm run deployed`, and the site returns to the old word.
- [ ] Ask it for something small and new (for example «أضيفي زرًّا يُخفي أسماء الطالبات في لوحة المتابعة»). Confirm it asks at most two short numbered questions and builds it, instead of sending her to the maintainer. What it may do alone and what it must hand over is in `AGENTS.md` section 6.
- [ ] Ask it to edit `AGENTS.md`. Confirm it refuses and tells her it needs the maintainer.
- [ ] Ask it to change a lesson's question. Confirm it does not edit code and explains how to do it in admin mode.

## 6. Watching

- [ ] On GitHub: Settings > Branches > add a rule for `main` and block force pushes (exact labels may differ). Git history is the safety net: as long as nobody force-pushes, every earlier version can be brought back.
- [ ] On the repository page: use Watch > All Activity (exact labels may differ). Make sure her GitHub notification email reaches whoever supports her. Each push to `main` then produces an email. Read the changed files; protected files changing without you is a warning.

## 7. Not in place yet

- There are no backups. Backup and restore requests go to the maintainer, who has no command for them yet.
- `npm run ops ...` commands do not exist yet.
- The daily comparison of protected-file fingerprints by a private operations repository is not set up. Until it is, watch the repository (section 6).
- Sign-in lasts 7 days on a device. Both secrets are checked on the server, and the page holds none (see "Admin access, honestly" in `docs/PLAN.md`).
