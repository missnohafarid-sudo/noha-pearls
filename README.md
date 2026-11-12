# Noha's Pearls (prototype)

An Arabic classroom platform: the teacher prepares or imports lessons, presents
them live, and student groups follow on their devices and answer from the device
or with printed answer cards. The full plan, including how the reference site
works, is in [docs/PLAN.md](docs/PLAN.md).

This prototype has **no backend**. Data lives in the browser, and every tab of
the same browser shares it live, so **each tab stands in for one device**. Use
ordinary tabs or windows of one browser profile (a private window is a separate,
empty world).

## Run

```bash
npm install
npm run dev        # open the address it prints
```

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Unit tests (rules, services, card read/print round trip) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run admin:2fa` | Make (or show) the authenticator key and its QR code for the admin sign-in |
| `npm run vendor:aruco` | Rebuild the vendored marker library after upgrading `js-aruco2` |

## Ten-minute walkthrough

**1. Become the admin.** On any page press the «دخول المعلّمة» button at the top-left of the page and enter
the development password `teach-2468` and the six-digit code from an
authenticator app. For development the authenticator key is `JBSWY3DPEHPK3PXP`:
add it to any authenticator app by "enter a setup key", or run
`npm run admin:2fa -- JBSWY3DPEHPK3PXP` to get a QR code to scan. An editing panel appears on the side and the
admin pages appear in the navigation. Visitors never see either.

**2. Import a lesson (the main way to create one).** Home → *استيراد درس*:
copy the instructions, paste them into any AI assistant followed by your lesson
material, paste the assistant's reply into the box, press *استيراد*. The lesson
opens unpublished; edit any slide from the panel, then tick *منشور للزوار*.
To try it without an AI, export the sample lesson (*تصدير ملف*) and import that
file back.

**2b. Bring in a class list.** Roster page → *استيراد قائمة صف*: paste three
columns copied from Excel (card number, name, group) or choose a text file, then
press *إضافة إلى القائمة*. Card numbers are kept exactly, so printed cards keep
working. *تصدير القائمة* downloads the list in the same form. Real class lists
belong in the git-ignored `private/` folder, never in the repository.

**3. Start a class.** Open a lesson → *بدء حصة مباشرة بهذا الدرس*. On the
session page press *إظهار رموز الانضمام*: one QR per group. Each card also has
the link *فتح كجهاز طالب*; open it in a **new tab** to act as a student device,
and choose a name. A device without a camera can instead type the session code
(shown in the teacher's side panel) on the home page and pick its group. The
device then waits: let it in from the *الانضمام* section of the side panel,
with *إدخال* beside its name or by scanning the student's answer card.

**4. Teach.** Move through slides with the buttons, the arrow keys or a clicker
(left arrow is "next", as the interface is right-to-left). On a question slide,
answer from the student tab and watch the tally on the teacher's screen; press
*إظهار الإجابة* to reveal it, which locks the question and shows each student
their result.

**5. Pace the groups.** In the side panel set a group to *يتبع المعلّم*
(follow), *يتنقّل بحرية* (free), *إيقاف* (hold) or *تثبيت* (pinned to the
current slide), and watch the student tab.

**6. Answer cards.** *بطاقات الإجابة* prints one card per student. On an
individual multiple-choice slide press *مسح بطاقات الإجابة*, allow the camera,
and hold a printed card up with the chosen letter at the top. If a card will not
read, tap the student's name in the scanner to enter the answer by hand.

**7. Follow up.** *متابعة المجموعات* shows every student's answers by group;
*لوحة التعزيز* shows scores and hearts. Give hearts from either page; students
give hearts to classmates in other groups from their own device.

To start over, clear the site's data in the browser (DevTools → Application →
Storage → Clear site data).

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and publishes on every push to
`main`. It has not run yet (this folder is not a repository). Before the first
push:

1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Repository → Settings → Secrets and variables → Actions → add two secrets:
   **`ADMIN_PASSWORD`** (8 characters or more) and **`ADMIN_TOTP_SECRET`**
   (make it with `npm run admin:2fa`, which also prints the QR code every
   teacher scans once). The build refuses to run without them.

Until the hosted backend of phase 1 exists, a deployed copy is a demo only:
each visitor's data stays in their own browser, and the password and code gate hides the
admin tools without protecting anything (see "Admin access, honestly" in the
plan).

## Where things are

```
src/domain/          rules and data shapes (pure, fully unit-tested)
src/ports/           interfaces to the outside world
src/services/        use cases
src/infrastructure/  adapters: browser storage, auth, markers, QR
src/app/             composition root, config, sample data
src/i18n/            all interface text
src/ui/              React pages and components
```

The table "Where each rule lives" in the plan maps every concern to its file.
