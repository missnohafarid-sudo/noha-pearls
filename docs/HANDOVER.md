# Handover checklist

For the technically able person who sets up the teacher's laptop once. Everything the agent follows is in `AGENTS.md`, `.agents/` and the checks; none of it can stop someone who edits the repository by hand, so follow the guard steps below.

## 1. Laptop

- [ ] Install Node 24 and git.
- [ ] Create an SSH key, add the public key to her GitHub account (Settings > SSH and GPG keys).
- [ ] Clone the repository over SSH into a folder she will keep.
- [ ] `npm install` in the folder. This also installs the git hook. Check that it succeeded without errors.
- [ ] Install the GitHub CLI and run `gh auth login`. An SSH key does not sign the CLI in. It is needed later for the backend commands.

## 2. Antigravity

- [ ] Open the folder in Antigravity. In the agent's rules and workspace view confirm it lists `AGENTS.md` and the rules in `.agents/rules/` (domain, services, infrastructure, ui, styles, text) and the skills in `.agents/skills/`.
- [ ] Terminal execution: set it to ask before running commands, and allow only this project's `npm run` scripts. The setting lives on the machine, not in the repository: Settings > General > Global Permissions, with per-project overrides. Labels differ by version. The intent: she approves every command except this project's `npm run` scripts; nothing outside the project folder runs unasked.
- [ ] Choose the model (a Gemini Flash class model).
- [ ] Do not give the agent any file with passwords or keys.

## 3. Protected-files guard

- [ ] Run `npm run guard:init` once, so the guard records fingerprints of the protected files.
- [ ] Keep the maintainer key off her laptop. `npm run guard:accept` needs it; the agent must not have it. Whoever holds it accepts intended changes to protected files.

## 4. Deployment

- [ ] Repository > Settings > Pages > Source: GitHub Actions.
- [ ] Repository > Settings > Secrets and variables > Actions: add `ADMIN_PASSWORD` (8 characters or more) and `ADMIN_TOTP_SECRET` (make it with `npm run admin:2fa`, which also prints the QR code every teacher scans once). See `README.md`, "Deploying to GitHub Pages". The build refuses to run without them.
- [ ] Give her the password and the authenticator QR on paper, stored somewhere safe.

## 5. Five-minute smoke test

- [ ] Ask the agent, in Arabic: change one word on the home page's lesson heading (for example «غيّري كلمة "الدروس" إلى "دروسنا"»). Confirm it restates the request in simple Arabic, changes only the Arabic value in `src/i18n/home.ts`, runs `npm run check`, runs `npm run ship -- "..."`, and then explains in Arabic.
- [ ] Confirm the deploy ran on GitHub (Actions tab) and the site shows the change.
- [ ] Ask it «تراجعي عن آخر تغيير». Confirm it runs `npm run undo` and the site returns to the old word.
- [ ] Ask it to edit `AGENTS.md`. Confirm it refuses and tells her it needs the maintainer.
- [ ] Ask it to change a lesson's question. Confirm it does not edit code and explains how to do it in admin mode.

## 6. Watching

- [ ] On GitHub: Settings > Branches > add a rule for `main` and block force pushes (exact labels may differ). Git history is the safety net: as long as nobody force-pushes, every earlier version can be brought back.
- [ ] On the repository page: use Watch > All Activity (exact labels may differ). Make sure her GitHub notification email reaches whoever supports her. Each push to `main` then produces an email. Read the changed files; protected files changing without you is a warning.

## 7. Not in place until the backend phase

- There is no backend. Data lives in each browser, so nothing is shared between devices and there are no backups. Backup and restore requests go to the maintainer, who has no command for them yet.
- `npm run ops ...` commands do not exist yet.
- The daily comparison of protected-file fingerprints by a private operations repository is not set up. Until it is, watch the repository (section 6).
- The admin password and code are checked in the page itself and protect nothing against a determined visitor (see "Admin access, honestly" in `docs/PLAN.md`).
