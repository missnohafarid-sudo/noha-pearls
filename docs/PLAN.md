# Noha's Pearls: plan

A general, admin-editable, Arabic classroom platform that keeps what the
reference site (`althasair.github.io/spectrum`) does and drops how it is built.

- Part 1 is what the reference site is and how it works (reverse-engineered).
- Part 2 is what we build and how it is structured.
- Part 3 is the prototype that exists in this repository today.
- Part 4 is the road from prototype to a deployed product.
- Part 5 lists the decisions that are still yours to make.

---

## 1. The reference site, taken apart

### 1.1 How it was examined

Only the public static files were downloaded (`index.html`, `ar-bundle.js`,
`qrcode.js`, and the repository file list). The backend was read once with the
same `a=get` request every visitor's browser sends every three seconds, and only
the key structure was looked at. No write request was sent, and the PIN was
never submitted: everything "behind" the 1110 gate is client code that ships to
every visitor, so the source was enough.

### 1.2 What it is

| Piece | Reality |
|---|---|
| Front end | One `index.html` of 250 KB: all CSS, all logic, all lesson content, the class roster and 4 group definitions in a single inline script. Hosted on GitHub Pages. |
| Lesson content | Hard-coded. Each slide is a JavaScript function returning an HTML string (`SL=[{h:()=>...}]`). Activities are a constant object (`ST`), the quiz another (`QUIZ`). Changing one word of a lesson means editing code. |
| Backend | A Google Apps Script web app used as a flat key-value store. Source not public; contract inferred from the client. |
| Sync | Polling. Every device calls `a=get` every 3 s and receives the entire class state. |
| Routing | URL hash: `#g1`..`#g4` = group device, `#guests`, `#sara` (admin tab), `#eval` (visitor feedback form). |
| Libraries | `js-aruco2` (MIT) for the answer cards, `qrcode-generator` by Kazuhiko Arase (MIT) for QR codes, Google Fonts. Nothing proprietary. |

Backend keys (confirmed by the read):

| Key | Holds |
|---|---|
| `ctl` | Teacher control: open activity `st`, quiz question `q`, reveal flag `rv`, current slide `sl`, message `msg`, reset stamp `z`, card-scan results `sc`/`sct`, writer id and timestamp |
| `d<n>` | Student `n`'s record `{n, g, a:{activity: answer}}` |
| `x<g>` | A shared group device's record |
| `G<g>` | Group `g`'s shared answers (hypothesis text, sorting choices, level ladder, claim verdict) |
| `likes` | Hearts per student, by source `{t, m, g, o}` (teacher, classmates, guests, supervisors) |
| `hearts` | Hearts per group |

Backend actions the client calls: `get`, `set` (student record), `gset` (group
record), `ctl` (needs PIN), `pin` / `gpin` (check teacher / guest PIN), `like`,
`heart`, `reset` (needs PIN), `vm` (voice message upload), `eval`.

### 1.3 Feature inventory

| # | Feature in the reference | How it works there | Our decision |
|---|---|---|---|
| 1 | Presentation | 40-odd hard-coded slides; arrows/clicker keys; `F` full-screen; `B` black screen | Keep. Slides become data. Prototype has navigation and full-screen. |
| 2 | Activity opens on devices | Teacher presses "open on devices"; `ctl.st` changes; devices re-render on next poll | Keep, simplified: the device shows the slide the teacher is on; a question slide *is* the activity. |
| 3 | "Follow the teacher" mirror | While no activity is open, devices render the teacher's current slide (`ctl.sl`) | Keep and extend: per-group pacing (follow / free / hold / pinned). Prototype. |
| 4 | Group entry by QR | QR is just the link `…#g1`; student then picks her name from the group's list, or "shared device" | Keep, with two changes. A device without a camera types the session code on the home page instead, then picks its group. And picking a name is a request, not an entry: the device is let in when the teacher's scanner sees that student's answer card, or the teacher taps her name (2.4). Prototype. |
| 5 | Answer cards | See 1.4 | Keep, same encoding. Prototype. |
| 6 | Group monitor (متابعة المجموعات) | Table per group: student × individual activity, plus the group's shared answers and score | Keep. Prototype. |
| 7 | Reinforcement board (لوحة التعزيز) | Hearts per student from four sources, group totals, a celebration every 5 hearts | Keep. Prototype has teacher and classmate hearts; guests and supervisors in phase 4. |
| 8 | Scoring | Group score = average of members' individual points + the group's shared points, shown as 7 "spectrum colours" | Keep the formula. Prototype shows score / max. |
| 9 | Activity types | `mcq`, `mcq` as prediction (no right answer), `text` (group hypothesis), `sort` (classify items), `levels` (three-tier ladder), `claim` (judge a statement with evidence), `quiz` (teacher-paced question series), `exit` (exit ticket), `lab` (custom simulation) | Prototype: choice (incl. poll/prediction), text (group or individual; covers hypothesis and exit ticket). Rest in phase 3 through the slide-kind registry. |
| 10 | Shared-device rotation | One tablet per group: hands the device from student to student for individual questions | A shared device already answers for its whole group (2.4). Handing it from student to student, so each is counted by name, is phase 2. |
| 11 | Messages to groups | Short text or a 15 s voice note, to one group or all | Text in prototype; voice in phase 4. |
| 12 | Guests view | Password-protected page: watch a group live, give hearts as "guest" or "supervisor" | Phase 4. |
| 13 | Slide timers, progressive bullets, "student work" wall, coaching toasts by name, lion animation | Presentation extras | Phase 3/4, each small. |
| 14 | "New lesson" reset | Wipes all answers, hearts and device state everywhere | Replaced by sessions: every class is its own session, nothing to wipe. |
| 15 | Virtual lab (silicon crystal) | 400 lines of lesson-specific SVG simulation | Not rebuilt. Phase 5 adds a generic "embed" slide for such things. |
| 16 | Visitor evaluation form (`#eval`) | 7 rated items posted to a second Apps Script | Phase 4, as a generic survey slide. |

### 1.4 The answer-card system, exactly

This is the part that must be followed precisely, because cards are physical.

- **There is one code per student, not two.** The card is a single ArUco marker
  from dictionary **`ARUCO_4X4_1000`**. The marker **id is the student's roster
  number** (1..18 there). It identifies her *and* carries her answer.
- **The answer is the card's rotation.** The detector returns the marker's four
  corners clockwise from the marker's own top-left. The site takes the midpoint
  of each edge and picks the edge highest in the image: edge 0 (marker top) = A,
  edge 1 (marker right) = B, edge 2 (bottom) = C, edge 3 (left) = D. So the
  student turns the card until her letter is on top.
- **Debounce:** a reading counts only when two consecutive frames agree.
- **Capture:** the teacher's device camera (rear camera preferred), frames
  downscaled to 1280 px wide, one detection pass about every 110 ms.
- **Fallback:** tapping a student's name cycles her letter by hand.
- **Result flow:** scan results live on the teacher's device and are pushed to
  the others inside `ctl`.
- **The group QR codes are plain links**, nothing more.

Our prototype reproduces the same dictionary, id rule and edge rule, so the
school's existing printed cards keep working. This is covered by an automated
test that prints a card, rotates it and reads it back. The reference site's class
list (card number = roster number) can be pasted into the platform as it is, and
the platform's list can be exported again in the same form.

Related but *not* used by the site: Plickers (the commercial product this
imitates) has its own proprietary card format. We do not need it.

### 1.5 Problems worth not repeating

1. **Content is code.** No lesson can be changed without a developer.
2. **No real access control.** The whole class state is world-readable with no
   password. The PIN only gates `ctl`/`reset` writes; any student can write any
   other student's record. With sync disabled, every visitor is admin.
3. **Answer keys ship to students.** Every correct answer is in the page source.
4. **Student full names are in a public source file.**
5. **Polling the full state** from every device every 3 s: slow (up to 3 s lag)
   and wasteful.
6. **One global state.** A second class or a rehearsal overwrites the first,
   hence the "wipe everything" button.
7. **Structure.** Functions are patched by reassigning globals
   (`renderDev = function(){…_rd()…}`), rules are repeated across views, and
   scoring names activities one by one.

---

## 2. What we build

### 2.1 Requirements, mapped

| You asked for | Design |
|---|---|
| Functionality, not the shape | Same classroom capabilities, new data-driven design. No styles reused. |
| Admin view and visitor view | One site. Admin mode adds a side editing panel and admin-only pages. Visitors never receive those pages' links; admin routes answer "not found". |
| Admin edits each page from a side panel | Every page declares its editable content as a list of fields; one generic form renders them in the panel. |
| Password behind a sign-in step | The owner first asked for a hidden shortcut, then replaced it with a visible sign-in button («دخول المعلّمة») because a shortcut cannot be pressed on a phone. |
| Password in a GitHub env var, deployed from GitHub | GitHub Actions secret `ADMIN_PASSWORD` (8 characters or more). GitHub Actions checks every push and deploys it to the server (2.4). See 2.5 for what the password protects. |
| A second factor shared by the teachers | One authenticator code (TOTP), set up once as a QR and a text key that every teacher adds to her phone. See 2.5. |
| Weekly backup, restorable on demand | Encrypted export every weekend to a private repository; a one-button restore. See 2.7. |
| A proper database and a proper server, free and permanent | GitHub Pages serves files only: it cannot hold a database or run a server. Cloudflare's free plan does both, with no pausing and no expiry: one Worker (our server) and one Durable Object with its own SQLite storage (the hub, which holds all the data), behind the same ports; see 2.4. |
| Fully Arabic | RTL throughout, all text in `src/i18n`, code identifiers in English. |
| Prepare lessons, present them, ask questions | Lessons are documents of slides; question slides collect answers live. |
| **Lessons from a file, AI-generated, then editable** | One lesson file format; a ready-made guided interview for any AI assistant, built on the nine-axes planning method; upload or paste; edit in the panel. See 2.6. This is the main authoring path. |
| QR entry per group, teacher picks the lesson | Starting a session from a lesson issues a join code and one QR per group. |
| Follow-the-teacher with per-group pacing | Four modes per group: follow, free, hold, pinned. |
| Answer cards with orientation | Same encoding as the reference (1.4). |
| Monitor and reinforcement board | Read models computed from answers and hearts. |
| DRY, KISS, SOLID, separation of concerns, OOP | See 2.2 and 2.3. |

### 2.2 Architecture

```
src/
  domain/          pure rules and data shapes. No I/O, no React, no browser APIs.
  ports/           interfaces the application needs from the outside world.
  services/        use cases as classes. Depend on ports and domain only.
  infrastructure/  adapters that implement ports (storage, auth, markers, QR).
  app/             composition root, config, seed data.
  i18n/            every word the interface shows, one file per feature.
  ui/              React. Talks to services and domain; never to infrastructure.
```

Dependencies point inward only: `ui → services → ports ← infrastructure`, and
everything may use `domain`. `app/container.ts` is the single file that names
concrete adapters, so changing the backend is a change in one place.

| Port | Prototype adapter | Production adapter |
|---|---|---|
| `DocumentStore` (typed collections, live queries) | `LocalDocumentStore` (browser storage + cross-tab notices) | A store over the hub's SQLite storage (2.4), used by the server only |
| `AuthGateway` | `PrototypeAuthGateway` (UI gate only) | Server-verified: the Worker checks both factors and issues the session (2.5) |
| `MarkerDetector`, `MarkerRenderer` | `ArucoCardCodec` (js-aruco2, vendored as an ES module) | same |
| `QrRenderer` | `QrSvgRenderer` (qrcode-generator) | same |

In production the services run **on the server**. The browser is handed the
same `Services` interface, implemented as thin stubs that send each call to the
server and receive live results back; it holds no store and no secret. The
server builds the real service classes over the hub's store, so every rule in
`domain` and every admin check in `services` is enforced where a visitor cannot
reach it, and still has exactly one home (2.4).

### 2.3 Where each rule lives (one home each)

| Concern | Home |
|---|---|
| Data shapes | `domain/models.ts` |
| Slide kinds: blank template, file reading/writing, repairs | `domain/slideKinds.ts` |
| Slide kinds: editing fields and rendering | `ui/slides/slideUi.tsx` |
| Lesson file format and validation; the file's kinds and its markdown wrapping | `domain/lessonFormat.ts` |
| Lesson edits (add/move/remove/update/copy slide) | `domain/lessonOps.ts` |
| Lesson folders: the tree, moving, deleting, which folders a visitor sees | `domain/folders.ts` |
| Who may answer what, and when; the answer that counts for a student (her own, else her group's) | `domain/answering.ts` |
| Marking and group scores | `domain/scoring.ts` |
| Pearls a group has earned | `domain/scoring.ts` |
| Live tallies, monitor table, heart totals | `domain/analytics.ts` |
| What a group's device shows | `domain/pacing.ts` |
| Card encoding and debounce | `domain/cards.ts` |
| Choice limits (max 4: a card has 4 edges) | `domain/choices.ts` |
| Roster rules (card numbers, colours, group order, public names) | `domain/roster.ts` |
| Class list format (paste, upload, export; card numbers kept) | `domain/rosterFormat.ts` |
| Who may give a heart to whom (the teacher's, live or ended; a student's, live only) | `domain/rewards.ts` |
| Who is let into a class, one device per name, and where a returning device lands | `domain/admission.ts` |
| Who is here: the roll, and who counts in tallies and scores | `domain/attendance.ts` |
| A session's minimum of interactions, and who is unresponsive | `domain/engagement.ts` |
| A class session: live or ended, starting one, which one a page shows | `domain/sessions.ts` |
| The kept record of an ended class | `domain/records.ts` |
| Weeks and months on the school's clock | `domain/periods.ts` |
| Cumulative results of a class list over a period, and what a student or a visitor may see of them | `domain/standings.ts` |
| What a media link shows and how: its type, its address, its frame | `domain/media.ts` |
| Moving through a list with the keyboard | `domain/listNavigation.ts` |
| What class data is cleared and when: a range of dates, the end of the school year | `domain/retention.ts` |
| Our own form controls and floating layers | `ui/forms/`, `ui/common/useAnchoredLayer.ts`, `ui/styles/widgets.css` |
| The list of teachers | `domain/teachers.ts` |
| Session codes: making and reading one | `domain/ids.ts` |
| "Is this the admin?" | `services/AuthService.ts` |
| What the interface may ask of the application | `services/Services.ts` |
| Addresses and links | `ui/routing/routes.ts` |
| Whether the edit panel shows | `ui/shell/AdminPanel.tsx` |
| Settings (password hash, authenticator key, namespace) | `app/config.ts` |
| Colours, fonts, radii | `ui/styles/tokens.css` (the only file with colour literals) |
| Shared controls and building blocks | `ui/styles/base.css` |

Adding a slide kind (say, "sort") is one entry in `domain/slideKinds.ts` and one
in `ui/slides/slideUi.tsx`. The editor, the importer, the AI prompt, the
presenter and the student device pick it up without edits.

### 2.4 Data model and backend

Collections (how the hub lays them out as rows is described under Backend, below):

| Collection | Key fields |
|---|---|
| `site` | school name, title, tagline, intro |
| `classes` | name (for example "11-3") |
| `teachers` | name |
| `groups` | class, name, colour |
| `students` | class, name, group, card number (unique within the class) |
| `lessons` | title, subject, grade, published, folder, slides[] |
| `folders` | name, parent folder (empty = top level), order |
| `sessions` | join code, lesson, class, teacher, its own copy of the class's groups and students, status, current slide, reveals{}, pacing{}, message, minimum of interactions (empty = the default) |
| `records` | one per ended class, written once: class, start time, and per student (present, answers, points, unresponsive) and per group (score, maximum) what the class came to |
| `rosters` | session; the roll: who is present or absent, by hand or by card |
| `participants` | session, group, student or null (shared device) |
| `answers` | session, slide, subject (student or group), value, source (device / card / manual) |
| `rewards` | session, target, source. Append-only: totals are counted, never overwritten |
| `retention` | one document: the last day of the school year (or none), when it was set, when students' data was last cleared |

Design points:

- **Sessions.** Each lesson taught is a session. History is kept, rehearsals
  do not collide, and nothing needs wiping.
- **Several classrooms at once** (decided 2026-11-11). A session is started
  by choosing three defined things: a lesson, a class and a teacher. Starting
  one never touches another, so teachers in different rooms use the site at
  the same time. Nothing live is global: the teacher's pages and the board
  are addressed by session, and the teacher's home lists the running classes
  to open or resume.
- **A session owns its groups.** At the start it takes its own copy of the
  class's groups and students, keeping their ids. Moving a student to another
  group for today, or adding a girl who is not on the list, changes that
  session only; lasting changes are made on the class list. An old session
  keeps showing the groups it really had. The rules already take groups and
  students as inputs, so they are handed the session's copy and do not change.
- **The card sweep is the roll call** (decided 2026-11-11). A session knows
  who is here. A student counts as present once her card has been seen at any
  point in the class (the sweep at the start, or answering by card), once her
  device has been let in under her name, or when the teacher marks her by
  hand. The same sweep that takes the roll lets in the devices that are
  waiting. Tallies read "answered N of those present", the teacher can see
  who is present and has not answered, and a group's score is averaged over
  its present members, so an absent girl does not pull her group down.
  Until a roll is taken everyone on the list counts. A roll starts with the
  sweep, with a device being let in, or with the teacher marking someone
  absent. An answer by card adds a girl to a roll that exists but does not
  start one: in a class that only answers by card and never takes a roll, the
  count would otherwise grow one answer at a time and always read "N of N".
- **Who is taking part** (the teacher's request, 2026-11-11). Besides the
  roll, the teacher can mark any student present or absent by hand, in the
  class's group list and in the monitor table. Each session has a minimum
  number of interactions: by default the possible ones minus two, never below
  zero, and she can change it during the class. An interaction is the answer
  that counts for a student on an individual question: her own, by device,
  card or the teacher's hand, or, when she gave none, her group's shared
  device's answer while she is present (see "A group's shared device answers
  for its students" below). A group question's answer belongs to the group
  and is not an individual interaction.
  The possible ones are the individual questions that are still open or that
  at least one student answered: a question the class never reached, or one
  nobody could answer (a written question in a class with cards only), is
  held against no one. A present student is marked «غير متفاعلة» beside her
  presence tag once she can no longer reach the minimum (her answers plus the
  questions still open fall short of it), so the mark never appears early;
  after the class it is simply "fewer answers than the minimum". An absent
  student is never marked, and her points for that class do not count, as
  they do not count for her group.
  The kept record is marked with the teacher's key, as her monitor is, so a
  question she never revealed still earns its points there.
- **Hearts outlive the class** (the teacher's request, 2026-11-11). An ended
  class is read-only with one exception: the teacher can still give hearts.
  Students cannot.
- **An ended class keeps a record** (2026-11-11). Results are otherwise
  computed from the lesson, and a lesson can be edited or deleted later. So
  when a class ends, what it came to is written once into a record: per
  student whether she was present, her answers, her points and whether she
  was unresponsive; per group its score. Hearts are not frozen, because they
  can arrive after the class; they are counted from the hearts themselves. A
  lesson that a running class uses cannot be deleted.
- **Cumulative results** (the teacher's request, 2026-11-11). For each class
  list, the teacher's page «النتائج التراكمية» adds up the records of a week
  or a month: per student her points, hearts, classes attended and times
  unresponsive; per group its points and hearts. A week runs Sunday to
  Saturday and a month is the calendar month, both on the school's clock
  (Qatar, UTC+3, no daylight saving), which is a rule of the domain and not
  of the device or the server. Only ended classes count. Students see them
  too (her answer on 2026-11-12), inside the rule of 2.8: the public board
  shows the groups' totals for the current week or month, and a student sees
  her own totals on her own let-in device. Other students' numbers, the roll
  and who was unresponsive stay with the teacher.
- **A class can stay open, and nobody is trapped in it** (2026-11-12). A class
  ends only when the teacher ends it, so it can be continued another day. One
  teacher, and one class list, can have several classes open at once. A
  student's device has «العودة إلى الرئيسية»: it only navigates and she keeps
  her seat. Typing the class's code again puts a device that holds a let-in
  seat straight back on the slide, a waiting one back on the waiting screen,
  and after the class has ended back on her results. A seat belongs to one
  class, so she can sit in another class in between. Known and accepted: a
  class open across days is one class on its start date in the cumulative
  results, with one roll for all of it.
- **A media slide shows a public link** (the teacher's request, 2026-11-12).
  The site stores no media. A slide of kind `media` holds a link, what it is
  (`auto`, audio, image, video, pdf, embed) and optional text in the content
  slide's plain format. One rule in the domain turns the link into what is
  rendered, and it was written from measurements with real links, not from
  memory:
  - A Google Drive file plays or shows only through Drive's own preview
    frame; plain audio and video players fail on every Drive address. So a
    Drive link's type cannot be read from it and does not need to be: the
    declared type only chooses the frame's shape (and a declared image is
    shown as a plain picture).
  - A PhET simulation page refuses framing; PhET's own simulation address
    for the same name allows it, and is asked for in Arabic.
  - A SharePoint PowerPoint sharing link refuses framing as pasted and
    allows it with its embed-view query.
  - YouTube needs its embed address.
  - A direct file is recognised by its ending. A link that fits none of
    these is not guessed: the slide is flagged and the teacher picks the
    type.
  - CodePen refuses framing; such a link can only be opened in a new window.
  What the page can and cannot know: a picture or a direct audio or video
  file that fails to load is reported on the slide (teacher's wording only
  for the teacher). A frame that fails cannot be detected by the page at
  all, so every media slide also carries "open in a new window". Frames are
  sandboxed as tightly as each case was measured to need. The one exception
  is a link whose path ends in `.pdf`: the browser's PDF viewer refuses to
  run in a sandboxed frame, so that frame has none; a hostile server behind
  such a link could then navigate the whole tab after a tap. Links are the
  teacher's own, and the lesson file check refuses anything that is not
  https. PDF zoom is ours, because Drive's viewer has none on a phone.
  The AI lesson interview asks the teacher for her links kind by kind and is
  told never to invent, guess or search for one.
- **Our own controls** (the owner's request, 2026-11-12). Drop-downs, check
  boxes, file pickers and number fields are the site's own components with
  keyboard and screen-reader support, not the browser's. Players inside
  another site's frame, and the browser's audio and video controls on a
  direct link, are left as they are.
- **Teachers' names have one home** (2026-11-12). The home page lists every
  teacher from the teachers list; the single name in the site content is
  gone.
- **Lesson folders** (2026-11-12, `domain/folders.ts`). Lessons live in nested
  folders, for example subject, then weeks or months, then lessons. Deleting a
  folder moves what is in it to its parent and never deletes a lesson, so
  tidying up cannot lose work. A folder cannot be put inside itself. Stored
  links that are broken (a missing parent, a loop) show their folder at the
  top level and are repaired at the next change, so bad data cannot hang or hide
  anything. A visitor sees only folders that hold a published lesson. A lesson
  or folder is moved by dragging or by a move dialog, and the open folder is part of the address, so a link or the
  back button returns to it.
- **A lesson is one file** (2026-11-12). One button exports a lesson as a
  markdown file that holds the importable lesson, and the import reads `.md`,
  `.json` and `.txt` (2.6). Reason: teachers keep, share and hand lessons to an
  assistant as ordinary files, and one format keeps all three working.
- **More on a slide** (2026-11-12). A normal slide and a written-answer
  question can show several pictures (public links, at most six; Drive photos
  go through the media rule, `domain/media.ts`). A normal slide can hold a
  hidden section that a button opens into a bluish box. It is opened per
  screen and is not pushed to students' phones: it is for the teacher's talk,
  and the box keeps it from being mistaken for the slide's text. A slide can be
  copied in the lesson maker, right below the original.
- **Keeping and clearing class data** (the teachers' request, 2026-11-12,
  `domain/retention.ts`). Class data is students' data, so it does not pile up
  forever. Two ways to clear it, both by the admin:
  - Deleting the ended classes of one class list that started between two
    dates. The page first lists the classes that were counted; only those, as
    confirmed, are removed, each with everything it kept (answers, hearts, the
    roll, seats, the record). A class that is still running is never removed.
  - A yearly clearing at the end of the school year. The teachers switch it
    on and choose the last day themselves. It never runs sooner than seven
    days after the date was set, so a mistaken date can be corrected. In the
    week before it the interface says it is coming, and afterwards a line says
    when it ran. It empties every class's data, running classes included:
    classes, class lists, students, groups, rolls, seats, answers, hearts and
    records. It keeps lessons, folders, the teachers' list, the site's content
    and the setting itself. An interrupted clearing repeats instead of being
    skipped, because the date it ran is written last.
  Today the page of a signed-in teacher starts the yearly clearing. On the
  server it runs from the hub's own alarm on the server's clock (2.4, Backend),
  so no browser can trigger it or hold it back.
- **Presenting** (2026-11-12 and 13). The presenting bar is docked under the
  slide and stays inside full screen, so the teacher never leaves full screen
  to control the class. The class code is always on the stage. While the join
  codes show, next and previous are blocked, so a slide cannot be skipped by
  accident in front of the class. The pearl button sits inside the slide's
  bottom-left corner and opens a panel over the slide with tabs («الكل» and one
  per group) showing who has answered and giving hearts. Every question carries
  a badge saying whether it is for each student or for the group. Other
  changes follow the same reasoning, a thing the teacher needs must not scroll
  away: the header stays in view and folds its tabs into a menu on narrow
  screens, and a dialog keeps its title and its final buttons in view. The
  password field has our own show and hide button (2.4, own controls). Running
  and ended classes are shown as cards, and the monitor has a presence column.
- **One teacher, several devices** (the teacher's request, 2026-11-11). She
  signs in on each device and opens the same class: a laptop on the projector
  and a phone in her hand. Every command names its target ("go to slide 5",
  not "next") and changes the stored record, so two devices cannot double or
  undo each other, and each device shows what the other did. The walkthrough
  runs this as its own lane.
- **One set of cards for every class.** A card is only a number; each session
  reads it against its own list.
- **The teacher is a name, not an account.** Under the shared sign-in (2.5)
  she is picked from a list when a class starts. It keeps classes apart and
  labelled; it does not stop one teacher from opening a colleague's class.
- **Reveals carry the answer key.** A device learns the right answer from
  `session.reveals`, never from the lesson. In production the lesson's key
  fields are simply not readable by visitors.
- **One answer per subject per question** (the id is derived), changeable until
  the teacher reveals.
- **A group's shared device answers for its students** (the owner's decision,
  2026-11-13; it replaces the earlier rule that a group device's answer is
  separate and counts for no student). A shared device can answer every
  question. On a group question one answer is stored for the group, as before.
  On an individual question one answer is stored for the group too, and a
  student's effective answer is her own if she gave one (whenever it
  arrives), otherwise her group's, if she is present; an absent student is
  never covered. Reason: a group with one tablet and a few phones should count
  as taking part, and the teacher should not have to mark each girl by hand.
  One rule decides it (`effectiveAnswer` in `domain/answering.ts`), and every
  reader asks it: tallies, points, group scores, a student's own results, the
  monitor, the minimum of interactions and the kept record. A student's device
  shows her group's answer, marked as the group's, until she answers herself,
  and her own unsent draft is kept when her group answers. Letting a shared
  device in puts its group's students on the roll, because the group is in the
  room.
- **Commands change the stored record, not the caller's copy.** "Reveal" then
  "next" in quick succession cannot undo each other, and an answer is checked
  against the session as it is now, not as the device last saw it.
- **Cards answer individual questions only.** On a group question every
  member's card would overwrite the group's single answer.
- **A device is let in, not just joined** (decided 2026-11-11). A device that
  picked its group and a name waits. It is let in when the teacher's scanner
  sees that student's answer card, in one sweep of the room like scanning
  answers, or when the teacher taps the name: for a forgotten card, or for a
  group's shared tablet. A name is held by one device at a time. A girl whose
  phone died asks for her name again on another device: the teacher sees the
  request marked as replacing a device, and her tap moves the name and drops
  the old device. A card never moves a name, because it proves she is in the
  room, not which device is hers. The teacher can turn away or take out any
  device. Until it is let in, a device sees no slide and can
  neither answer nor give a heart; the services check the stored seat, not the
  device's own copy of it. The reference let anyone pick any name.

**Backend: Cloudflare's free plan** (hosting decided 2026-11-11, replacing
Supabase; the storage design revised 2026-11-12, replacing "D1 plus a hub that
only relays": one Durable Object now holds the data). Nothing in this section
is built yet.

One Cloudflare Worker, `noha-pearls`, on the free plan is the whole
deployment: it serves the built site and answers `/api/*`, at one address,
`https://noha-pearls.miss-noha-farid.workers.dev`. GitHub Actions is the only
thing that deploys it. GitHub Pages is no longer used: the maintainer
unpublishes the old site in the repository settings. The teacher never sees
Cloudflare; it is set up once by the maintainer.

Why this and not Supabase, which the plan named first:

- **It does not pause.** A free Supabase project is paused after a week
  without activity, so every school holiday needed a keep-alive job and
  sometimes a manual resume. Cloudflare's free plan has no pausing and no
  expiry, and asks for no payment card.
- **It is a server of ours.** The Worker runs this repository's TypeScript:
  the same `services` and `domain` code the prototype runs in the browser.
  With Supabase the access rules would have been written a second time as SQL
  policies. Here every rule keeps its one home.
- **Site and server ship together.** One deploy publishes the page and the
  server as one version, at one origin: no cross-site requests, and the admin
  session can live in a cookie that page scripts cannot read.

Why one Durable Object and no D1 database. ONE Durable Object, "the hub"
(a single instance, with SQLite storage of its own), holds all the data and
every device's connection, and runs every command one at a time, in order. The
reasons:

- A command reads and writes the data without a network trip to a database, so
  several classes answering at once do not queue behind round trips.
- The free plan's limit of 50 database calls per request does not apply.
- The database cannot sit in a different place from the hub, which would add
  delay to every command.
- Its history can be rewound for 30 days (D1's free plan: 7).
- There is one store to build, test, back up and clear, not a database plus a
  hub that caches it.

What it costs, honestly:

- **There is no vendor export command** for a Durable Object's storage. The
  weekly backup is therefore our own export endpoint (2.7), and it is the only
  way out of Cloudflare.
- **Deleting the Worker, or removing the hub's class from the configuration,
  deletes the data.** So that configuration is a protected file (2.9), and the
  weekly backup lives outside Cloudflare.
- **Whether the free plan includes the 30-day rewind and the dashboard's data
  viewer is not stated in Cloudflare's documentation** (checked 2026-11-12), so
  nothing depends on either.
- **More of our own code** than a ready-made backend: the transport, the
  sign-in check, the hub and the export are ours, so they carry tests (4,
  phase 1).
- **Where the data sits.** Students' names are stored in Cloudflare's storage
  outside Qatar, as they would have been with Supabase. The public repository
  still never holds them.

The pieces:

| Piece | Job |
|---|---|
| Worker `noha-pearls` | Serves the static site; routes `/api/*`; verifies sign-in (2.5); hands every command and live query to the hub |
| The hub (Durable Object, one instance, SQLite storage) | The system of record: every collection. Holds each device's one open connection (WebSocket, hibernating when idle), runs commands one at a time, pushes live results, runs the yearly clearing from its own alarm, serves the backup export |
| GitHub Actions | Runs the check, deploys the Worker with its secrets, then smoke-tests the live address |

Documents are stored as JSON, so adding a field to a document needs no
migration. Indexes exist only for the fields queries filter by.

How a request is kept honest:

- **Commands.** The browser stub sends "service, method, arguments". The
  server works out who is calling (admin session or not; which device) from
  the request itself, never from the arguments, and runs the real service.
  Only the service methods listed in one table are callable from outside;
  everything else, including methods meant for the server's own jobs, is
  refused.
- **Reads are projected on the server.** What a visitor may see is a domain
  rule with its own home and tests (`domain/visibility.ts`, built first, in the
  browser, 4 phase 1): published lessons only and without answer keys; the live
  session; her own group's and her own answers; totals on the board. The admin
  sees everything. A device learns a right answer only from `session.reveals`.
- **One command is one transaction.** The hub runs one command at a time, in
  order, so two commands at once cannot undo each other and a check followed by
  a write cannot be interleaved with another command. No version number or
  retry is needed.
- **Live queries are shared.** The hub runs each distinct query once per
  change and fans the result out, not once per connected device. This is what
  keeps a class inside the free limits, and the stress test measures it.
  What every watcher of a class is shown alike (the board's totals, the results
  of a card, the lesson summaries) is computed once per change and shared
  (`services/ComputedOnce.ts`, bounded in size); the class itself is read once
  per change for all its watchers (`services/ClassFeeds.ts`). Only what depends
  on who asks, such as a student's own seat view, is computed per reader. The
  real bound on what a caller costs when a class changes: a code that names no
  class keeps no live read at all, so it costs nothing; a caller with no seat who
  watches a real class's code costs no storage reads of its own, because the store
  reads the class's stored row once per change and every watcher shares it (a join
  with 500 devices watching the class's code reads 3 rows, and the number does not grow with the
  watchers), but each such watch still takes a little processor time at every change
  of that class, and its answer is sent only if it differs. The processor time grows with the number of
  live reads, which the caps below hold to 48 a device and 20,000 in the hub;
  the reads that are still worked out once per watcher are not free at the top of that range.
- **Every answer of the server carries `X-Content-Type-Options: nosniff` and
  `Cache-Control: no-store`.** `public/_headers` reaches only the static files,
  so the Worker adds these to everything it or the hub answers under `/api/`
  (`server/apiHeaders.ts`); the socket upgrade is left as it is.
- **A school's hub starts without invented people.** On first start the hub
  stores the site's default wording and one example lesson the teacher may
  delete. The sample class list, teacher, groups and students (`services/seed.ts`)
  are stored only when the hub is given the variable `SAMPLE_SCHOOL` equal to `1`,
  which `vite` gives it when serving on this computer and the local-server test
  gives it on its command line; a deployed hub has none. The browser-only mode
  always has the sample school.
- **The hub class is declared with `exports`** in `wrangler.jsonc`
  (`"SchoolHub": { "type": "durable-object", "storage": "sqlite" }`), the
  current form for a new Worker, not the legacy `migrations` list; the two
  cannot be mixed, and a Worker deployed with `exports` cannot go back.
- **One WebSocket per page.** Commands and live queries travel over it. Only
  sign-in, sign-out, a "me" call (who am I) and the backup export are plain
  requests.

The address is free, permanent and served over HTTPS; no domain has to be
bought. A domain of the school's own can be attached later without changing
anything else: join links and QR codes are made per session from whatever
address the page is opened at, and printed answer cards carry no address.

**The capacity the design must hold** (the owner's bar): 4 teachers, 4 classes
each, 35 students in a class, in one day, with up to 4 classes at once, all on
the free plan. Free limits as checked on 2026-11-12 (re-check at the first
deploy):

- Worker: 100,000 requests a day. Static files are free and unlimited.
- Durable Object: 100,000 requests a day, where an incoming WebSocket message
  counts 20 for 1; 5 million rows read and 100,000 rows written a day; no
  duration charge while the object hibernates. A hibernatable object forgets
  its memory after about 10 idle seconds, so nothing that must last may live only in memory. What the hub
  keeps in the database: the data itself, the teacher's sessions, the sign-in counts and locks (the school's
  and each address's), the key that signs device cookies, and the day's count of rows written. What lives in
  memory only, and is lost whenever the hub is sent to sleep or restarted: the counts of a device's floods,
  messages, wrong class codes and seat changes, and the locks they make; the count of new devices given to
  each address; the answers the store and the services remember between commands (all rebuilt from the
  database on demand). This is acceptable because none of it protects anything a device cannot shed anyway
  by dropping its cookie (a lock on a device ends when the device asks for a new one), because writing it
  would cost a row for every device a script cares to make (6,000 bot devices would be 6,000 rows read at
  every start), and because the worst a reset buys is a fresh share: a few more seat changes or new devices
  in an hour, which the day's write limit and the budgets of 2.5 still bound.
- The limits are hard: when one is exceeded, further operations of that kind
  fail until midnight UTC rather than costing money. A Worker request also gets
  only about 10 ms of processor time, so nothing slow (such as deliberately
  expensive password hashing) may run in one; see 2.5.

What the design does about them:

- Commands and live queries use one WebSocket per page, which keeps the worst
  day near 7,000 Worker requests.
- The answers, seats and hearts of a class are stored as ONE row per class and
  collection. Reading a class's answers is one row read; each answer is one row
  written. A year of worst-case use is a few thousand rows to clear instead of
  millions.
- Indexes exist only for the fields queries filter by.
- A stress test at exactly the owner's worst day must show every daily limit
  used well under half.

### 2.5 Admin access, honestly

The way in: the «دخول المعلّمة» button at the top-left of the page opens a prompt asking for **the password and a
six-digit code** from an authenticator app. Neither alone is enough, and a
wrong attempt does not say which of the two was wrong.

A static site cannot keep a secret: whatever is in the page is public. So where
the check happens decides whether it protects anything.

**Prototype (what runs today).** The page itself checks a hash of the password
and the code. This hides the admin tools from ordinary visitors and lets the
flow be tried with a real authenticator app. It protects nothing: both secrets
ship inside the page, and all data is local anyway. Use throwaway values.

**Production.** The server checks both; the page holds no secret.

1. There is one shared admin, not one account per teacher.
2. `ADMIN_PASSWORD` (8 characters or more) and `ADMIN_TOTP_SECRET` are GitHub
   Actions secrets, beside `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
   (the deploy's own; no database identifier is needed). On deploy the workflow
   hands the two admin secrets to the Worker as encrypted secrets. They are
   never part of the built page, and the build variables that put them there
   in the prototype are removed. A deployed Worker without the admin secrets
   refuses every sign-in and never falls back to development values.
3. The second factor is made **once** with `npm run admin:2fa`, which prints a
   QR and a text key. Every teacher scans the same QR (or types the key) into
   her authenticator app.
4. At the prompt the page sends the password and the code to the server in one
   request. The server compares both in constant time and answers yes or no,
   never which one was wrong.
5. On yes the hub opens a session: a row in its own storage with a random id and an end (now plus 7 days, the owner's
   choice), and sets a cookie that carries the signed id and nothing else: HMAC-signed, `HttpOnly` (page scripts cannot
   read it), `Secure`, `SameSite=Strict`, sent only to this site. The cookie counts only while its row exists and has not
   run out, so a cookie cannot name its own end, and signing out removes the row and closes every socket of that session:
   a copy of the cookie on another device stops working too. The signing key is derived from the two admin secrets.
   Every admin command is checked against the session on the server, so a changed page can change nothing. The
   consequence of seven days: a device left signed in stays a teacher's device for a week unless she signs out, and
   replacing either admin secret signs everyone out once the open sockets are dropped, because a socket never
   changes who it is: a deploy drops them, and a replaced secret does not by itself close a socket that is
   already open. The daily alarm forgets the rows that have run out.
6. Guessing is shut out on the server, in two ways, both kept in the hub's storage so that a sleeping hub forgets
   nothing. After five wrong attempts, sign-in is refused for fifteen minutes for THAT NETWORK ADDRESS, not for
   everyone. And once the password is known, the six digits must not be ground down from many addresses: more than ten
   wrong codes behind the RIGHT password, school-wide, close sign-in for everyone for an hour. A wrong password never
   counts toward that, so a visitor without the password cannot close sign-in by typing. A visitor must not be able to
   lock every teacher out by typing wrong passwords. Known and accepted: a student on the school's own network shares
   an address with the teachers and could still lock that network. Because a server request has little processor time
   (2.4) the password is compared, not slow-hashed; its strength is its length plus the second factor plus these limits.
7. A code may be used more than once while it is valid (about half a minute),
   so two teachers can sign in at the same moment with the code they both see
   (decided 2026-11-11). The cost: someone who watched a code being typed
   could reuse it within that half-minute, but only together with the
   password.
8. A device's identity is a random token the server issues in a cookie, signed with a random key the hub made once
   and keeps in its own storage (never derived from the admin secrets: replacing a secret must not unseat students,
   and a student's cookie must not be something a password can be tried against); the stored device id is a hash of the
   token. A seat id that the teacher's page shows cannot therefore be used to pose as a student's phone (4, phase 1).
9. Secrets that equal a public development value (the repository states them) are honoured only for a request from
   the computer itself. If either the password or the authenticator key is a development value, a deployed hub gives
   no admin at all: sign-in is refused and no admin cookie counts, whatever it was signed with.

**Limits on the hub** (`ports/limits.ts` holds every number; the rules are in `domain/abuse.ts`). A whole school sits
behind one network address, so nothing is counted per address except two things: the sign-in lock above, and the
budget of new devices an address may be given (1,500 an hour; the teacher is always given a device, whatever the
budget). The count is held in memory, so each time the hub sleeps (after about ten idle seconds) the share starts fresh; "1,500 an hour" is a ceiling while the hub stays awake, not a promise across sleeps. Everything else is counted per DEVICE: a script spends one device's share, but it may make devices, up to
1,500 an hour from one address, and a locked device escapes its lock by dropping its cookie and asking for a new
one, so the shares of a script add up to the budget of new devices, not to one device's share:

- A device that sends more than 120 messages in 10 seconds, counted over all its sockets together, has the socket
  that sent the last one closed; three such floods in ten minutes lock that device out (no hello, no socket) for ten
  minutes. The teacher's messages are never counted, so her socket is never closed for flooding and she is never locked. These device locks
  are kept in memory only (2.4).
- A device that looks up 21 wrong class codes in ten minutes is refused further lookups for ten minutes. The teacher
  and a device that was let in to the class it names are not counted. A class code has 31^6 possibilities and opens the
  board, a request to join, and the class's list of names to choose from, so no limit per address or for the school
  is kept for it. Card numbers are not
  rationed either (2.8).
- A device holds at most 6 sockets and 48 live reads summed across its sockets. Beyond that, 400 sockets per address,
  3,000 sockets and 20,000 live reads in the hub are shared caps that refuse visitors only: the teacher is held to
  none of them, and a student let in to a running class is held only to her device's own.
- A device may change its seat (a join or a leave that writes) 6 times an hour. Asking again for the seat it already
  holds, with the same group and name, writes nothing and costs nothing.
- A socket opened by a teacher's session is checked against the session's row once more at the instant it is
  accepted, so a sign-out that arrives while the socket is being opened leaves a visitor's socket, never a
  teacher's. When sign-in is closed for everyone the page says so, in its own words (the hour's closure and the
  clock of the phone), apart from the line for one locked address.
- When the day's writes pass 80,000 only the essential writes (answering, joining, leaving) and reads run for anyone but
  the teacher; above 95,000 no write does, and reads still run. Which calls are which is tagged with the surface
  (`services/surfaceEffects.ts`).

**Risks accepted on the free plan.** The free plan's limits are hard, and the hub cannot tell a script from a
school, so these are known and left open:

- R1. Anyone can use up the day's 100,000 requests; a script at school can do it in minutes with traffic every
  rule permits. The site is then down for everyone until 00:00 UTC.
- R2. A script at school can hold the address's 400 visitor sockets. Students who are not yet let in then cannot
  join, while the teacher and the students already let in keep working.
- R3. A script at school can use up the hour's 1,500 new devices, so brand-new phones are refused for up to an hour
  (the teacher is not refused); because the count is held in memory, it also starts fresh each time the hub sleeps.
- R4. The waiting seats of a class can be filled by scripted devices until the teacher removes them.
- R5. A student on the school's network can lock that network's teacher sign-in for 15 minutes at a time; teachers
  already signed in are unaffected for 7 days.
- R6. The public board shows a card's results to anyone who holds the live class code and a card number (2.8).

The remedy for all of them is the same and is not on the free plan: a paid plan, or a domain of the school's own
with rate-limit rules in front of the Worker, which can count per address before a request costs anything.

What a shared second factor does and does not do:

- It does stop someone who only learned the password.
- It cannot tell teachers apart, and one teacher cannot be removed on her own.
  When someone leaves, or a phone is lost, a new key is made with
  `npm run admin:2fa`, the `ADMIN_TOTP_SECRET` secret is replaced, the site is
  deployed again and everyone re-scans the new QR. The old key stops working
  and everyone signed in is signed out.
- Keep a printed copy of the QR and key somewhere safe. If it is lost, nothing
  is locked forever: whoever can change the repository's secrets can set new
  ones.

### 2.6 Lessons from a file (the main authoring path)

The teacher's flow, with no technical step:

1. Home page → "import lesson" → **copy the instructions**.
2. Paste them into any AI assistant (Claude, ChatGPT, Copilot…) and add the
   lesson material: the topic, the textbook pages, her notes.
3. The assistant interviews her: one short question at a time, each with two or
   three ready options that it worked out from the material, so she answers
   with a number. She never has to come up with a verse, a strategy or a
   real-life example herself; she chooses among viable ones.
4. The assistant writes the lesson file. She copies it into the box (or
   uploads a `.md`, `.json` or `.txt` file) and presses **import**.
5. The lesson opens in the editor, unpublished. She fixes anything in the side
   panel, then publishes.

If the file has problems, each is listed in Arabic with its slide number, and
one button copies them as a correction request to paste back to the assistant.

**The method behind the interview.** The instructions are built on the
"خطّطي حصتكِ" planner of the school's Zad site, whose rule is *one well-designed
activity in which nine axes live*, not nine activities:

| Axis | What the assistant proposes for the teacher to choose |
|---|---|
| مراعاة الفروق الفردية | Two or three ways into the concept (model, picture, numbers, discussion) |
| التمايز | One question at three rising levels: مستكشفة، محلّلة، مبتكرة |
| التغذية الراجعة البنّاءة | Every explanation written as "what was right, the evidence, the next step" |
| أساليب التقويم | A prediction before, a question during, an exit ticket after |
| تفعيل الذكاء الاصطناعي | A plausible but wrong AI claim for the class to judge with evidence |
| ربط المحتوى بالواقع | A real device or situation to open the lesson with |
| تعزيز التنمية المستدامة | Something to calculate or design that saves energy or resources |
| إبراز الهوية القطرية | A Qatari project that is a living context for the concept |
| تعزيز الكفايات الأساسية | Which of the six competencies each stage builds |
| الآية والقيمة | A verse tied to the concept and a value tied to a concrete classroom behaviour |

These map onto the slide kinds that exist: the opening problem and the verse
are content slides; the prediction is a poll; the three levels are three
questions tagged with their level; the AI claim is a choice question followed
by a group text answer; the exit ticket is an individual text answer.

**Verses need a human check.** AI assistants can misquote the Quran. The
instructions tell the assistant to offer only short verses it is certain of,
always with surah and verse number, and tell the teacher to check the wording
against the Mushaf. Imported lessons open unpublished for that review.

The format (`spectrum-lesson`, version 1), deliberately small:

```json
{
  "format": "spectrum-lesson",
  "version": 1,
  "title": "…", "subject": "…", "grade": "…",
  "slides": [
    { "kind": "content", "title": "…", "tag": "…", "body": "…\n- نقطة",
      "images": [], "hidden": "" },
    { "kind": "choice", "title": "…", "tag": "…", "prompt": "…",
      "options": ["…", "…"], "correct": 2, "explanation": "…",
      "scope": "individual", "points": 1 },
    { "kind": "text", "title": "…", "tag": "…", "prompt": "…",
      "placeholder": "…", "images": [], "scope": "group", "points": 2 }
  ]
}
```

- `correct` is the option's number starting at 1, or `null` for a poll or a
  prediction.
- `scope` is `individual` (every student answers) or `group` (one answer per
  group).
- `images` is a list of public links (at most six; Drive photos go through the
  media rule). `hidden` is an optional section in the same format as `body`,
  opened by a button on the slide; it stays empty unless the teacher asks.
- The importer tolerates chat wrapping (prose and code fences around the JSON).
- Export is one button and writes a markdown file that holds nothing but the
  lesson in a fenced block (`domain/lessonFormat.ts`). Free text beside the
  lesson is avoided on purpose, because the reader takes the outermost braces
  and a brace in a title line would mislead it.
- The instructions for the AI are generated from the same registry the
  validator uses, so the two cannot disagree. Export writes the same format, so
  lessons can be backed up, shared between teachers, or handed back to an AI to
  revise.

Later (phase 4): a built-in "generate" button that calls an AI model from a
backend function with the teacher's uploaded material. It needs a server-side
API key, so it waits for the backend.

### 2.7 Backups and restore

Two layers, because the platform's own history is short and may not be there.

- **The hub's own history, where it is available.** Cloudflare can rewind a
  SQLite-backed Durable Object for 30 days. If the free plan includes it, it
  is the answer to "something went wrong today". Cloudflare's documentation
  does not say whether the free plan includes it, or the dashboard's data
  viewer (checked 2026-11-12), so nothing depends on either. It is checked
  once on the real account (5).
- **Half a year, weekly.** The project keeps its own encrypted exports in a
  **private** GitHub repository, `missnohafarid-sudo/noha-pearls-ops`, next to
  the public one. The public repository must never hold student data, and
  files attached to its workflow runs are readable by anyone, so nothing is
  stored there. This layer is the real one: it lives outside Cloudflare, which
  matters because deleting the Worker or the hub's class deletes the data (2.4).

The weekly layer:

- **Weekly backup.** A scheduled workflow in the private repository runs every
  weekend (Friday night, Qatar time). It fetches the data from the hub's own
  **export endpoint**, which is protected by its own secret (there is no vendor
  export command to use instead, 2.4), encrypts the file with a passphrase held
  as a secret in that repository, and commits it there. The last 26 weekly
  files are kept (half a year). The passphrase never goes on the teacher's
  laptop.
- **What is in it.** Everything the platform stores: site content, groups,
  students, lessons and folders, and the history of sessions, answers and
  hearts. The admin password and authenticator key are not in the data; they
  stay in the public repository's secrets.
- **Restore.** A second workflow with a "Run workflow" button on the GitHub
  website. It asks which backup (the latest by default) and for the word
  `RESTORE` typed out, saves a safety copy of the current data first, then
  replaces the data with the chosen backup. The same script can be run from a
  terminal.
- **Why the private repository runs these.** GitHub documents that it switches
  off scheduled workflows in *public* repositories after 60 days without
  activity, and a quiet school holiday would hit that. Its docs state this for
  public repositories only, and this one also commits to itself every week. If
  a schedule is ever switched off, re-enabling it is one button. The cost is a
  few minutes of the free monthly allowance.
- Nothing has to be kept awake: the hub does not pause (2.4).
- Separately, any single lesson can be exported and re-imported as a file from
  the lesson page at any time.

The yearly clearing of students' data (2.4) removes data from the hub, not from
backups already made. Old weekly files age out after 26 weeks.

### 2.8 Who may see a student's results

Decided: **a student sees her own results on her own device**, the one the
teacher let in under her name (2.4): her points, hearts and a row per
question, behind a button on the device's top bar. No camera is needed. The
board page shows group totals to everyone, and a student who holds her card up
to a device's camera there sees the same summary. The teacher sees everything.

The same line holds for the cumulative results (2.4): the board shows the
groups' totals for the current week or month to everyone; a student's own
weekly and monthly totals appear only on her own let-in device, not through
the card on the board; nobody but the teacher sees another student's totals,
the roll, or who was unresponsive. One consequence is accepted: a group with
a single member, or a single girl present, shows that girl's hearts as the
group's.

Three more lines, each settled with the owner:

- **Students keep seeing their classmates' heart counts** on the board and in
  the class. Hearts are meant to be seen; only results, the roll and who was
  unresponsive stay private.
- **A signed-out visitor on the board without a class code** gets a field to
  type the code, not a list of running classes. A list would show every
  teacher's class code and its name to anyone with the link.
- **An unpublished lesson is readable, without its answer key, by the let-in
  seats of a class that uses it.** A teacher may start a class from a lesson
  she has not published; the students' devices still need its slides.

These are light locks on purpose. The reference left all of this public, the
teachers are not technical, and anything that adds work for them (new printouts,
codes to hand out) would get in the way. The card is something every student
already has, so it costs the teacher nothing.

What they do and do not do, so nobody mistakes them for more:

- They keep results away from someone who merely has the link.
- The device path is as strong as being let in: a classmate would need the
  teacher to admit her under another girl's name.
- The card on the board page does not stop a determined classmate: card
  numbers are 1, 2, 3… in a public marker set and every card is held up in
  class, so "card 7" can be shown from a screen. Results here are low-stakes
  classroom feedback; nothing sensitive should ever sit behind this lock.
- The board path needs a camera and camera permission; the device path does
  not.

The admin tools are a different matter and stay behind the password and the
second factor (2.5): behind them sit every lesson and the whole roster.

A stronger variant was considered and set aside: a personal secret QR printed on
each card. It is a real lock, but it means reprinting cards and one more thing
for teachers to manage.

### 2.9 Handover: a repository that defends itself

After handover the repository lives on the maintainer's own GitHub account. She
is not a programmer: she describes what she wants in everyday words to an AI
agent (Google Antigravity with Gemini models), and that agent writes the code.
She cannot judge the agent's work, so the repository has to.

**What the agent reads.** Antigravity loads `AGENTS.md` from the repository
root on every request, plus rule files under `.agents/rules/` and task recipes
("skills") under `.agents/skills/`. It does not load rule files from
subfolders, so everything is anchored at the root.

| File | Purpose |
|---|---|
| `AGENTS.md` | Always on, kept short: how to turn a plain request into a small change, the map of the code, the rules that must never be broken, and the three commands for finishing work |
| `.agents/rules/*.md` | One rule file per layer, loaded when files of that layer are touched |
| `.agents/skills/*/SKILL.md` | Step-by-step recipes for the common requests: change wording, change the look, add a slide kind, add a field, undo, ship |
| `CLAUDE.md` | One line pointing at `AGENTS.md`, so other agents read the same rules |
| `docs/GUIDE-AR.md` | For her, in Arabic: how to ask for a change, with examples, and what to say when something looks wrong |
| `docs/HANDOVER.md` | For whoever sets up her laptop: the one-time checklist |

**What the machine enforces.** Written rules steer an agent; they do not stop
one. These do:

1. **Architecture test.** Part of the unit tests. It fails when code crosses a
   layer boundary, when Arabic text appears outside `src/i18n`, when the
   interface touches browser storage, when a stylesheet uses left/right or a
   colour that is not a design token. Each failure says where the code belongs.
2. **The browser walkthrough is a test.** The run through the whole product
   (243 steps as of 2026-11-13) lives in the repository and runs on every
   check.
3. **One way to finish.** `npm run check` runs everything; it runs online,
   because the teacher's laptop is too slow for it. `npm run ship` runs a
   quick check (types, protected files) and sends the change, as one commit,
   to the branch `try`. CI runs the whole check there and, only when it
   passes, moves `main` to that commit and deploys. A failed change never
   reaches `main`. `npm run deployed` waits for that run and says whether the
   site shows the change or what failed; the agent asks her to keep it, undo
   it, or keep part of it only after that. A git hook still refuses a direct
   push to `main` (the maintainer's) when the whole check fails.
4. **Deploys are gated.** CI runs the whole check on every push to `try` (a
   change shipped from the teacher's laptop) and on every direct push to
   `main` (the maintainer's), and deploys only if it passes. A failed change
   leaves the live site as it was, and one sent through `try` never reaches
   `main` either.
5. **One way back.** `npm run undo` reverts the last shipped change and ships
   the revert.
6. **Protected files.** The guidance, the checks, the workflows and the scripts
   are listed as protected. The check fails if any of them changed, and only
   someone with the maintainer key can accept such a change.

**The honest limit.** The repository's owner and her agent can change anything
in it, including these guards; nothing stored inside a repository can prevent
that. The measures above stop an agent that is trying to help, which is the
real risk. For the rest there are two outside checks: in phase 1 the private
operations repository compares the protected files against its own copy of
their fingerprints every day and raises an issue when they differ, and whoever
supports her can simply watch the repository.

**The backend without the backend.** She should never have to open Cloudflare.
Her laptop holds no Cloudflare token and no database access: only GitHub
Actions deploys. Every backend action is a workflow in the private operations
repository, started by one command that the agent runs for her:

| Command | Does |
|---|---|
| `npm run ops -- status` | Does the live site answer, when was the last backup, did the last deploy succeed, how much of the day's free allowance is used |
| `npm run ops -- backup` | Take a backup now |
| `npm run ops -- restore` | Restore the latest backup (or a named one), after a safety copy and a typed confirmation |

These exist from phase 1, when the backend does. Documents are JSON, so a new
field needs no migration. A change to the layout of the hub's storage goes
through a migration step that may only add, never drop or delete, and the
deploy takes an export first. The Worker's configuration, which names the
hub's class, is a protected file: removing that class deletes the data (2.4).

What her laptop needs, once: Node, git with her SSH key, the GitHub CLI signed
in (an SSH key does not sign the CLI in), and Antigravity set to ask before
running commands outside the project's own `npm run` scripts. Antigravity keeps
that setting on the machine, not in the repository, so it is part of the setup
checklist.

---

## 3. The prototype (in this repository)

Runs entirely in the browser with no backend. **Each browser tab acts as a
separate device**, and tabs of the same browser share data live. That is enough
to test every flow on one computer; it is not multi-device yet.

| Area | In the prototype |
|---|---|
| Arabic RTL interface, own neutral design | Yes |
| Admin sign-in button (password plus authenticator code; development values in the README) | Yes |
| Side editing panel on every page, invisible to visitors | Yes |
| Home page content editing | Yes |
| Lessons: create, edit slides in the panel, reorder, copy a slide, publish, delete | Yes |
| Lesson library with nested folders, moving by drag or dialog | Yes |
| Lesson import (paste or upload `.md`, `.json`, `.txt`), guided AI interview on the nine axes, export as a markdown file | Yes |
| Slide kinds: content, choice (incl. poll), text, media from a public link | Yes |
| Several pictures on a slide or a written question; a hidden section opened by a button | Yes |
| Students see cumulative results: group totals on the board, her own on her device | Yes |
| Leaving a class without losing the seat, and returning by its code | Yes |
| Our own drop-downs, check boxes, file pickers and number fields | Yes |
| Slideshow with keyboard/clicker keys and full-screen | Yes |
| Live session: start from a lesson, QR per group, join by name or shared device | Yes |
| Per-group pacing: follow, free, hold, pinned | Yes |
| Answer from device; live tallies; reveal locks the question | Yes |
| Answer cards: printable sheet, camera scanner, manual fallback | Yes |
| Group monitor | Yes |
| Reinforcement board with teacher and classmate hearts | Yes |
| Brand theme (pearls, rose-gold wordmark) and seven-pearl group score | Yes |
| Text message to groups | Yes |
| Roster editing | Yes |
| Class list import and export (card numbers preserved) | Yes |
| Several class lists and a list of teachers; a class is started from a lesson, a class list and a teacher | Yes |
| Several classes live at once, each with its own pages, code, groups and results | Yes |
| Joining by QR or typed code, then being let in by the teacher's card scan or tap; one device per name | Yes |
| The card scan as the roll call; tallies and group scores over the students present | Yes |
| Group changes for today inside a class; an ended class is read-only and stays reachable | Yes |
| The teacher's hearts after a class has ended | Yes |
| Present or absent by hand, a minimum of interactions per class, and the «غير متفاعلة» mark | Yes |
| A kept record of each ended class; cumulative results per class list by week and month | Yes |
| Clearing class data: ended classes of a class list between two dates, and a yearly clearing the teachers switch on | Yes (started by a signed-in teacher's page; the server's alarm is phase 1) |
| A group's shared device answers for its students | Yes |
| Presenting: docked bar inside full screen, class code on the stage, pearl panel with tabs, group/individual badge | Yes |
| One teacher controlling a class from two devices (two tabs here; real devices need the backend) | Yes |
| Real database, multi-device, real access control | No (phase 1) |

Run it: `npm install`, `npm run dev`, open the printed address. See `README.md`
for a ten-minute walkthrough.

Quality gates: `npm run typecheck`, `npm test`. As of 2026-11-13 there are 492
unit tests and 243 walkthrough steps.

---

## 4. Road map

Each phase follows the agent rules: Sonnet (or Qwen when available)
implementers with the principles restated in the brief, Opus review, structural
changes committed separately from behaviour changes.

**Phase 0: sound sessions, before the backend.** *Several classrooms at once,
and joining that is simple without being loose.* Built in the prototype on
2026-11-11, before the backend, because it changes the data shapes and what
the server must enforce, and at that point it cost no migration. It was
checked by running whole classes from both sides and by code review.
- Classes and teachers as defined lists; groups, students and cards per class.
- A session is started from a lesson, a class and a teacher, owns a copy of
  the class's groups, and no longer ends other sessions (2.4).
- The teacher's pages and the board take their session from the address; the
  teacher's home lists the running classes.
- Group changes inside a session.
- Who is here: the card sweep as the roll call, tallies and group scores over
  the students present (2.4).
- Joining: the session code, the waiting screen, admission by card or tap
  (2.4), and the gaps found by running a whole class from both sides.
- Done when: two classes run side by side in the walkthrough without seeing
  each other, and a student who leaves by mistake gets back in without the
  teacher stopping the lesson.
- Added the same day from the teacher's reading of the step-by-step guide
  (2.4): her hearts after a class, the minimum of interactions and the
  unresponsive mark, the kept record and cumulative results by week and
  month, and the two-device lane in the walkthrough.
- Added on 2026-11-12 and 13, still before the backend (all in 2.4): lesson
  folders, the lesson as one markdown file, several pictures and a hidden
  section on slides, clearing class data by date and at year end, a group's
  shared device answering for its students (a change to the earlier rule),
  and the presenting changes (docked bar, class code on the stage, pearl panel
  with tabs, badges, header and dialogs that stay in view, class cards,
  presence column). The reading rules of 2.8 were settled in the same days.

**Phase 1: real backend and deployment.** *Makes it usable in a classroom.*
Built and proven on this computer first: Cloudflare's local runtime runs the
same Worker and hub with no account, so nothing is deployed until it passes
here. The services already receive their caller as an input (done, so that a
server can build them). In this order, structure before behaviour:

1. Reads projected per caller, as a domain rule with tests
   (`domain/visibility.ts`, 2.4): what each kind of caller may read. It is
   built and proven in the browser first, where it can be seen and tested
   without a server.
2. The store over the hub's SQLite storage, passing the same store tests as the
   browser store, tested in Node.
3. The hub: command transport, live queries, sign-in, cookies, the sign-in
   limits and the per-device limits, and the alarm (2.4, 2.5).
4. The browser side: service stubs in `app/container.ts`; the admin secrets
   and the browser-storage adapters leave the shipped page.
5. The walkthrough and the stress test run against the local server, so the
   check exercises what is deployed. New walkthrough steps: a signed-out
   browser's command is refused; the password without the code is refused; no
   answer key appears in anything a student's device receives; a seat id seen
   by the teacher cannot be used as a phone's identity; a method that is not
   in the callable table is refused. The stress test runs exactly the owner's
   worst day (4 teachers, 4 classes each, 35 students, 4 classes at once) and
   must show every daily limit used well under half (2.4).
6. Deployment: one workflow that checks, deploys the Worker with its secrets,
   then smoke-tests the live address.
7. Backups and the private repository: the weekly encrypted export, the
   one-button restore (2.7), the `npm run ops` commands and the daily check of
   the protected files (2.9). A restore is rehearsed once before the first
   real class.

What the server must close that the browser store cannot (found by review of
the joining rules and later reviews; each needs a test in step 3). Most of it
reads "one command is one transaction in the hub", because the hub runs one
command at a time:

- A device's identity comes from a random token the server issued and keeps in
  a cookie, never from an id the page holds; the stored device id is a hash of
  the token. The same phone then keeps its seat across a closed tab, and a seat
  id seen by the teacher cannot be used to pose as a phone.
- Asking for a seat checks the facts and writes in one command.
- Letting a device in is one command: only if the seat still exists, is still
  waiting and is still the student the teacher saw; it removes every other seat
  for that student in that session, so at most one admitted seat per student
  per session holds.
- A card sweep and "let everyone in" choose their seats and admit them in one
  command.
- An answer or a heart is checked against the seat, the session and the
  reveal in the same command that writes it, so a late answer cannot follow a
  reveal.
- A waiting or removed device can read nothing of the class: "sees no slide"
  is enforced by the server's projection, not by the page.
- A session and its roster are created in one command, and a session code is
  checked for being unused in it, with a retry.
- "Is this class or teacher in use" and the removal are one command; so
  are removing a class with its groups and students, and a class-list import.
- An answer and its mark on the roll, letting a device in and its mark on the
  roll, and the roll-call scan's marks and admissions are each one command.
- A group's shared device and the roll: the shared device answers for its
  group (2.4), its answer is stored for the group and never under a student id
  the page sends, and letting it in puts its group's students on the roll.
- A class that has ended accepts no change except the teacher's hearts,
  checked in the same command as the write.
- Ending a class and writing its record are one command, and a record exists
  once per session. An ended class without a record (a failed write) is
  repaired by the hub's alarm, since the page has no "end" button left to press.
- "Is this lesson in use by a running class" and its removal are one
  command, and starting a class re-checks its lesson, class and teacher in the
  same command, so none can be removed between the check and the start.
- An answer, a roll change or a group change is written only if the class is
  still live, checked in the same command, so none can land after the record
  was built.
- Every clock is the server's: `startedAt`, an answer's or a heart's `at`,
  the notice before a clearing, and the moment a clearing is due. Weeks and
  months come from the domain's school clock (`domain/periods.ts`), never from
  the server's own time zone.
- The yearly clearing (2.4) runs from the hub's own alarm. It has no signed-in
  teacher, so it needs a system caller that no remote request can claim; today
  it is started by a teacher's page. The same alarm repairs records.
- Internal service methods are not callable remotely. Only the methods listed
  in one table are; the clearing, the repair of records and the like are
  absent from it.
- The full records and cumulative results are for the admin only. Two
  narrower reads are public and projected on the server: the group totals of
  a class list for a period, and one student's own totals, found from the
  calling device's let-in seat and never from an id it sends. A student's
  device never receives other seats' ids.
- A lesson is checked by the same slide and media rules when it is saved,
  not only when a file is imported. Sessions stored before the minimum existed
  have none and use the default; classes ended before records existed have no
  record and are not counted.
- Cumulative results are computed on the server from the records and hearts
  of one class list, not by loading whole tables. The class's answers, seats
  and hearts are one row each per class and collection (2.4), so reading them
  is cheap.
- The teacher's sign-in is per device and any number of her devices may hold
  one at a time. Two signed-in devices on one class is a test of the server:
  both press "next" together and the class moves one slide; each sees the
  other's reveal, admission, roll change and end without reloading.
- The functions that change a stored document stay pure, and new ids are made
  before the update, not inside it, so the browser store and the hub's store
  pass the same tests.
- What each caller may read: the roll and students' names never reach a
  visitor; a device receives its own group's answers only; the list of all
  classes with their codes and names, the class lists and a session's roster
  are for the admin; the board without a class code shows a code field and no
  list of classes (2.8).
- Values that TypeScript alone guards today (a pacing mode, an answer's
  source and value) are validated where they enter the server.

Done when: a laptop and two phones on different networks, one of them the
school's own Wi-Fi, run a full session; a signed-out browser, and a browser
with the password but no code, can neither write nor read anything they should
not; the simulated worst day (4 teachers, 4 classes each, 35 students, 4
classes at once) uses every daily free limit well under half; and a
deliberately deleted lesson comes back from a weekly backup (and from the
hub's 30-day history too, if the free plan has it).

**Phase 2: classroom hardening.**
- Shared-device rotation (reference feature 10).
- Reconnect handling: queue an answer while offline, show connection state.
- Scanner tuning on real hardware: distance, lighting, 30 students in frame.
- Roster export/import (CSV).

**Phase 3: more slide kinds and presentation tools.**
- Sort/classify, level ladder, claim-with-evidence, teacher-paced quiz series.
- Image upload (storage) instead of image links. Media of every kind is
  shown from public links today (the media slide, 2.4); storage of our own is
  not planned until someone asks for it.
- A PDF viewer of our own, if real phones turn out not to show PDFs inside a
  frame (a go-live check); Drive's viewer is the path measured to work.
- Slide timer, progressive bullets, black-screen key, "student work" wall.

**Phase 4: people around the class.**
- Guest and supervisor links with their own hearts; voice messages.
- Session history and reports beyond the weekly and monthly totals that
  exist (per question; CSV/print; a term or a custom range).
- Built-in AI lesson generation from uploaded material.
- Survey slide (covers the visitor evaluation form).

**Phase 5: embeds.**
- Simulations hosted elsewhere are already shown by the media slide when
  their site allows framing (PhET does; CodePen does not). What remains is a
  way to run a teacher's OWN simulation code (such as the reference's crystal
  lab, or a pen she wrote) inside a sandboxed slide without a host that
  allows framing, and without putting lesson code in the platform.

---

## 5. Decisions

Settled:

1. **Backend and hosting:** Cloudflare's free plan: one Worker serving the
   site and the server, and one Durable Object, the hub, holding all the data
   in its own SQLite storage; no D1 (2.4). Decided 2026-11-11 in place of
   Supabase with GitHub Pages, because it does not pause, runs our own rules on
   a server, and ships site and server as one version; the storage design
   revised 2026-11-12 (commands without database round trips, no 50-call limit,
   30-day history, one store). GitHub Actions is the only deployer.
2. **Admin access:** password of 8 characters or more, plus one shared
   authenticator code, both checked on the server.
3. **Backups:** the hub's own history where the plan has it, plus a weekly
   encrypted export on the weekend, fetched from our own export endpoint into
   a private repository, with a restore that can be triggered on demand (2.7).
4. **Repository:** public, `missnohafarid-sudo/noha-pearls`; GitHub holds the
   code and runs the checks and the deploy, and no longer hosts the site.
5. **Student results:** unlocked by showing the answer card to the camera
   (2.8). A light lock, by choice.

6. **Maintenance:** by a non-programmer through an AI agent; the repository
   enforces its own rules (2.9).
7. **Several classrooms at once:** a session is a lesson, a class and a
   teacher, with its own copy of the class's groups; group changes during a
   class stay in that session; the teacher is a name picked from a list under
   the shared sign-in (2.4). Built before the backend (4, phase 0).
8. **Joining:** by QR or typed session code, then let in by the teacher's
   card scan or a tap, one device per name (2.4).
9. **Sign-in code:** may be reused while valid, so teachers can sign in
   together (2.5).
10. **Hearts after a class:** the teacher only (2.4).
11. **Taking part:** present or absent by hand; a minimum of interactions per
    session, by default the individual questions minus two; below it a
    present student is marked unresponsive (2.4).
12. **Cumulative results:** per class list, by week (Sunday to Saturday) and
    calendar month on Qatar's clock, from a record kept when each class ends.
    The teacher sees everything; students see group totals on the board and
    their own on their device (2.4, 2.8).
13. **One teacher on several devices:** allowed and tested (2.4).
14. **Media:** shown from public links only, in a media slide; no storage of
    our own; a broken link is the teacher's to fix, and the slide says what
    the page can know (2.4).
15. **Open classes:** a class stays open until ended and may span days;
    leaving keeps the seat; re-entry by card on a later day and attendance
    per day were considered and left out (2.4).
16. **Controls:** the site's own, not the browser's (2.4).
17. **The address:** `https://noha-pearls.miss-noha-farid.workers.dev`. The
    old Pages site is unpublished (2.4).
18. **The private repository:** `missnohafarid-sudo/noha-pearls-ops` (2.7).
19. **Sign-in lasts 7 days** (the owner's choice) as a session on the hub, named by
    a signed cookie; a device left signed in stays a teacher's for that week
    unless she signs out (which ends the session everywhere), and replacing an
    admin secret signs everyone out once the open sockets are dropped, which a deploy does (2.5).
20. **Sign-in locks:** five wrong attempts lock that network address for 15
    minutes, not everyone; a student on the school's network could lock that
    network, which is accepted. More than ten wrong codes behind the right
    password close sign-in for everyone for an hour (2.5).
21. **Capacity bar:** 4 teachers, 4 classes each, 35 students, up to 4 classes
    at once, inside the free plan, proven by a stress test with every daily
    limit well under half (2.4).
22. **Group answers:** a group's shared device answers every question; a
    student's answer is her own, else her group's while she is present
    (2.4, decided 2026-11-13).
23. **Clearing class data:** by date range, and yearly at a date the teachers
    set, never sooner than seven days after it was set; run by the server's
    alarm once there is a server (2.4).
24. **Reading rules:** students see classmates' heart counts; the board
    without a code asks for the code; an unpublished lesson is readable,
    without its key, by the let-in seats of a class that uses it (2.8).

Still open:

1. **The free plan's 30-day rewind and the dashboard's data viewer:** whether
   the free plan includes them is not stated in Cloudflare's documentation
   (checked 2026-11-12). Check once on the real account. Nothing depends on
   the answer (2.7).
2. **The Worker's configuration as a protected file:** it names the hub's
   class, and removing that class deletes the data (2.4). When the file is
   created, the maintainer must add it to the protected list in `AGENTS.md`
   and to the guard; the list there does not name it yet.
3. **The lesson interview's defaults:** it addresses the teacher and students
   in the feminine and offers Qatari contexts, as the Zad method does. Say if
   the platform will also serve boys' classes or schools outside Qatar.
4. **Existing cards:** if the reference class's printed cards are available,
   phase 2 tests against them; otherwise we print ours (identical encoding).
