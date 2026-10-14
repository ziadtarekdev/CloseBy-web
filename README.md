# CloseBy — public child page

The page a scanned QR code opens. React + Vite + the Firebase Web SDK, built and
served by Firebase Hosting.

---

## The URL this page expects

```
https://closeby-28cdc.web.app/child?uid={nurseryId}&id={childId}
```

`/child` is the route. `{nurseryId}` is the nursery's Firebase Auth uid and
`{childId}` is the child's Firestore document id — the two ids, and nothing
else. No token, no lookup table: the link is resolved straight to the public
profile document `publicProfiles/{nurseryId}~{childId}`. Both ids are generated
by the Flutter side; `generateQr` in
`close_by/lib/features/Children/data/repositories/children_repository_impl.dart`
builds exactly this URL, and the QR encodes only the URL — never a name, a
guardian or a phone number.

Codes printed in an older shape, `/c/{token}` with a 20-character Firestore
auto-ID, keep working: that route resolves to the same collection by token.

Do not add or change a route here without changing that line in Dart. The QR
code is already printed.

---

## What it reads and writes

Only two paths, both under the public snapshot. It never touches
`nurseries/{uid}/children/{childId}`, the private child record.

```
publicProfiles/{profileId}                          ← get by id, anonymous
  {profileId} = {nurseryId}~{childId} for a current code, or a legacy token
  nurseryId, childId, name, group, guardianName, guardianPhone, createdAt
  (the page also renders age, notes, nurseryName, nurseryPhone if present)

publicProfiles/{profileId}/foundReports/{reportId}  ← create, anonymous
  at: serverTimestamp
  location: { lat, lng } | null      (always null for a scan)
  nurseryId, childId
  kind: 'scan' | 'lost'              (missing on older reports = 'lost')
  comment: string ≤ 500              (lost reports only, optional)
```

Opening the page files a `scan` report on its own, so the nursery sees that the
code was scanned. A reload within 10 minutes does not file another
(`src/lib/sentReports.js`). **"This child is lost"** opens a short form — a
comment and a note that the browser will ask for location — and files a `lost`
report, which the Flutter app shows as a danger alert.

The report's `nurseryId` and `childId` are copied from the profile the page
already loaded — never from the URL, which a legacy token link does not carry —
and the security rules verify both against that same parent profile before the
write lands. The owning nursery's reads of reports are keyed on the stamped
`nurseryId`, which is why the stamp exists at all.

The Flutter app writes `name`, `group`, `guardianName` and `guardianPhone`
into the snapshot, plus the nursery contact when the nursery has set one. The
guardian's name and phone are public on purpose: whoever scans the code can call
the family directly. Pages published before the guardian fields existed show
them once the child is edited or the code is regenerated. `age` and `notes`
are rendered only when present.

### Why a separate public document

A `get` with no predicate returns the entire document. There is no field-level
hiding in Firestore: any field stored on a publicly readable document is
readable by anyone who can address that document. So the child record cannot be
made safe by rules alone — the safe data has to be a separate document written
by the app. `publicProfiles` is that document, and it is already what
`generateQr` writes.

---

## Setup

```bash
npm install
cp .env.example .env.local     # values are already filled in
npm run dev                    # http://localhost:5173
```

The env values match `DefaultFirebaseOptions.web` in
`close_by/lib/firebase_options.dart`, so both clients talk to project
`closeby-28cdc`. A Firebase web config is not a secret — it identifies the
project, it does not grant access. Everything is enforced by
`firestore.rules`.

To test with a real code, print a QR from the Flutter app on a child already in
Firestore, and scan it — or copy the printed URL straight into a browser.

```bash
npm run lint
npm run build      # -> dist/
npm run preview
```

Geolocation requires a secure context. `localhost` counts as one, so location
works under `npm run dev`; opening the built files over `file://` does not.

### Running against the local emulator

`npm run dev` on its own reads the **live** project. To click through the whole
flow — including "This child is lost" — without writing real reports, run the
page against the Firestore emulator. Nothing in `.env.local` needs to change:
variables already set in the shell take priority over `.env` files.

```bash
npm run emulator                                   # terminal 1: Firestore :8180
VITE_FIRESTORE_EMULATOR=true VITE_FIRESTORE_EMULATOR_PORT=8180 \
  CHOKIDAR_USEPOLLING=true npm run dev             # terminal 2: http://127.0.0.1:5173
```

The emulator starts empty; seed a `publicProfiles/{uid}~{childId}` document (as
`scripts/local-test.mjs` does) before opening `/child?uid=..&id=..`.
`CHOKIDAR_USEPOLLING` is only needed on a network drive, where Vite's file
watcher otherwise misses edits and serves stale modules.

---

## How a code is scanned

The QR encodes only the URL. The **phone's own camera app** is the main way in:
it reads the code and opens the link, so the page never handles the image.

Opened without a code, `/` is a short landing page with two fallbacks:

- **Scan here** — an in-page camera scanner using the browser's built-in
  `BarcodeDetector`. Offered only where the browser has it (Chrome on
  Android); elsewhere the page points to the camera app instead. No scanning
  library is bundled.
- **Paste the link** — for a link copied from a message or a photo.

Both hand the raw text to `routeFromScannedText` (`src/lib/scanLink.js`),
which accepts only a CloseBy child link on a CloseBy host — `/child?uid&id` or
the legacy `/c/{token}` — and rebuilds the route from the validated ids. Any
other QR (a menu, a payment page, a lookalike domain) is refused, never
followed.

On the child page, a report is shown as sent only after Firestore has accepted
it. A slow connection shows "still sending" while the SDK keeps retrying; a
refused write shows the error with "Try again". The time of a report sent in
this visit is kept in `sessionStorage` (`src/lib/sentReports.js`, time only,
30 minutes), so a reload says "You already told the nursery at 14:05" and
offers "Send an update" instead of looking as if nothing was sent. Three taps in
a row file one report.

---

## Security rules

The rules live in `close_by/firestore.rules` — the Flutter project is the source
of truth, and deploying from anywhere else would invite drift. There is no
`firestore.rules` in this directory on purpose.

**`firestore.rules.proposed`** is a byte-for-byte mirror of that file, kept only
so `firebase.emulator.json` can point the local test suite at the exact rules
that deploy. `close_by/firestore.rules` is deploy-ready (`firebase deploy --only
firestore:rules` from `close_by`) and **has not been deployed yet**.

The mirror also lets the test suite replay the Flutter repository's whole write
sequence — addChild, generateQr, an edit that republishes, a regeneration that
retires a legacy bracelet, deleteChild — against the real rules, so a change
that would break QR generation fails locally instead of at a nursery gate.

The public block is deliberately narrow:

| Path | Anonymous | Signed-in nursery |
| --- | --- | --- |
| `publicProfiles/{profileId}` get | yes | yes |
| `publicProfiles/{profileId}` list | no | no |
| `publicProfiles/{profileId}` write | no | own only |
| `publicProfiles/{profileId}/foundReports/*` create | yes, validated | yes |
| `publicProfiles/{profileId}/foundReports/*` read | no | own only, filtered on `nurseryId` |
| `nurseries/{uid}/…` | no | own only |

Three rules carry the weight:

- **`list` is not granted.** Only an exact `get` by id. Without that, anyone
  who found one child's URL could enumerate the collection and reach every other
  child's page.
- **`validPublicProfile` uses `hasOnly`.** An owner cannot append a field to a
  profile and have it become world-readable. A closed field list is what makes
  this collection safe to open.
- **A sighting's ids are verified, not trusted.** The browser sends the report's
  `nurseryId`/`childId`, so `create` compares both against the parent profile
  the QR resolves to, and `at` must equal the server's request time.

The rules also allow `qrToken`, `qrUrl` and `qrGeneratedAt` on
`nurseries/{uid}/children` updates. That is a fix, not an expansion: `generateQr`
writes exactly those three fields, and without them the server rejects **every**
QR generation with `permission-denied`. They hold no personal data.

---

## Behaviour

**Loading** — a spinner with a polite live region. The page shows nothing about a
child until the profile has actually loaded, so a slow connection cannot leave a
half-rendered name on screen.

**States** — each one is a distinct screen, not a sentence swapped into a
success slot:

| Condition | Screen |
| --- | --- |
| no or malformed link | "This link is not complete" |
| link valid, no such document | "This code is no longer active" |
| read failed | "We could not open this page" |
| offline / Firestore unavailable | same, with a connection message |
| rules blocking the read | same, with a contact-nursery message |

The link's ids are validated against `/^[A-Za-z0-9_-]+$/` before they are put
into a document path. They build a Firestore path, so a value containing `/`
would otherwise address a different document than the QR intended.

**No raw Firebase errors.** Every Firestore code is translated to plain
language in `src/lib/publicProfile.js`. Codes, project name and collection paths
go to `console.error` only, for a developer in devtools.

**"This child is lost"** asks for location, then writes one `lost` report:

- `at` is a Firestore server timestamp, never the device clock — a phone with a
  wrong time must not be able to make a report look older than it is.
- Location denied, unavailable, timed out (8s), insecure origin or no API at all
  all resolve to `location: null`, and the report is still sent. The time alone
  tells the nursery where to start looking.
- The button is disabled while in flight and hidden after success, so a double
  tap cannot file two sightings.
- Nothing about the finder beyond an optional comment. The rules enforce that
  too: a report with any field other than `at`, `location`, `nurseryId`,
  `childId`, `kind` and `comment` is rejected, a scan may carry neither a
  location nor a comment, and the two ids are checked against the profile the
  page was read from.

**Contact nursery** renders only when `nurseryPhone` exists. A nursery name on
its own is information, not an action.

---

## Design

Mobile-first: the reader is on a phone, standing, one-handed. Tap targets are at
least 52px. Colours are copied from `close_by/lib/core/theme/app_colors.dart` —
indigo `#3347BE` primary, the four logo dots for the avatar, teal for success,
coral for errors, yellow for the child's note. That Flutter file is the source of
truth; `src/styles/brand.js` is a copy, not a new identity.

No child is shown a photo. The avatar is generated initials, so the public page
carries no image of a child.

---

## Files

| Path | Purpose |
| --- | --- |
| `src/main.jsx` | React root, router |
| `src/App.jsx` | Routes: `/`, `/child`, `/c/:token`, catch-all |
| `src/pages/ChildByIdPage.jsx` | The page a current QR opens: `/child?uid=..&id=..` |
| `src/pages/ChildPage.jsx` | The page a legacy `/c/{token}` code opens |
| `src/components/ChildRecordPage.jsx` | The shared child screen and its states |
| `src/pages/HomePage.jsx` | Opened without a code: camera-app guidance, scanner, paste box |
| `src/components/QrScanner.jsx` | In-page camera scanner (BarcodeDetector) |
| `src/lib/scanLink.js` | Scanned/pasted text → in-app route, or refused |
| `src/lib/foundReport.js` | The report payload, built once for page and tests |
| `src/lib/sentReports.js` | This visit's memory of a sent report |
| `src/pages/NotFoundPage.jsx` | Unknown route |
| `src/components/Chrome.jsx` | Brand, avatar, spinner, message state |
| `src/hooks/useChildProfile.js` | Loads the profile, files the report |
| `src/lib/childLink.js` | The URL contract: link → profile document id |
| `src/lib/publicProfile.js` | Firestore reads/writes, error translation |
| `src/lib/geolocation.js` | Position, or null on any failure |
| `src/lib/initials.js` | Initials, stable avatar colour |
| `src/lib/copy.js` | Every string the public sees |
| `src/lib/firebase.js` | Firebase init, fails loudly on missing config |
| `src/styles/brand.js` | Colour copy of app_colors.dart |
| `src/styles/global.css` | All styling |
| `firestore.rules.proposed` | Mirror of `close_by/firestore.rules`, for the emulator suite |
| `scripts/local-test.mjs` | The local end-to-end suite (`npm run test:local`) |
| `firebase.json` | Hosting config, SPA rewrite for every route |