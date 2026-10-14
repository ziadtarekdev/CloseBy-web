// Local end-to-end check of the scanned-QR page. Nothing is deployed.
//
// Runs under `firebase emulators:exec`, so the Firestore emulator is judging
// firestore.rules.proposed — a byte-for-byte mirror of close_by/firestore.rules,
// the file that deploys — and the
// hosting emulator is serving the built dist/ with the production rewrites. The
// two halves together are the thing that matters: the page only works if a URL
// of the QR's shape both resolves to index.html and passes the rules.
//
//   npm run test:local
//
// What it cannot check is how React renders. There is no browser here, so the
// component tree is exercised by reading the module the page reads its URL with,
// and by asserting the Firestore reads that tree issues are allowed to make.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

// The module the /child route parses its URL with. Plain ESM with no Firebase
// import, so it runs here exactly as it runs in the browser.
import { isSafeSegment, profileIdFromQuery } from '../src/lib/childLink.js';

// The module submitFoundReport builds its payload with. Every sighting the
// suite files as "the page" goes through this function, so a payload the page
// would get wrong fails here instead of being masked by a hand-written one.
import { buildFoundReport, toLocation } from '../src/lib/foundReport.js';

// The module the home page's scanner and paste box resolve a code with.
import { routeFromScannedText } from '../src/lib/scanLink.js';

// Exactly what geolocation.js resolves to on success. The page hands this
// object, untouched, to buildFoundReport.
const GEO_FIX = { lat: 51.5, lng: -0.12 };

// The report the page files for a loaded profile: geolocation's result (or
// null) and a server timestamp, through the page's own builder.
const pageReport = (profile, position) =>
  buildFoundReport(profile, position, serverTimestamp());

// Emulator host and port are read from firebase.emulator.json rather than
// repeated, so moving one there moves it here too.
const emulatorConfig = JSON.parse(
  readFileSync(new URL('../firebase.emulator.json', import.meta.url), 'utf8'),
);
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_PORT ?? emulatorConfig.emulators.firestore.port);
const hostingPort = Number(process.env.HOSTING_EMULATOR_PORT ?? emulatorConfig.emulators.hosting.port);
const HOSTING = process.env.HOSTING_EMULATOR_HOST ?? `127.0.0.1:${hostingPort}`;

// The ids from the URL this was built for. Hard-coded rather than generated, so
// the assertion names the exact link shape that gets printed on a bracelet.
const NURSERY = 'pm3GWmZuBRT2kSq1wwXTgoWNB1B3';
const CHILD = 'MV5n3lLElf9jyGDvozhJ';
const OTHER_NURSERY = 'OTHERnurseryId000000000000X';
const OTHER_CHILD = 'OTHERchildId00000000000ab';

const profileId = `${NURSERY}~${CHILD}`;

let passed = 0;
const failures = [];

async function check(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message.split('\n')[0]}`);
  }
}

/**
 * Like assertFails, but insists that somewhere in the ruleset an explicit
 * `false` decided the refusal, rather than the decision resting on evaluation
 * errors alone.
 *
 * Evaluation noise alongside a decision is tolerated. The emulator reports a
 * `set` on a missing document through both the create and the update branch —
 * the update branch has no resource to read, so it errors even when the create
 * branch decided cleanly — and a write carrying serverTimestamp() is evaluated
 * once with the sentinel still unresolved. An error can only contribute
 * `false`, so security is unaffected either way; what this guards against is a
 * refusal where no rule ever produced a decision at all.
 */
async function assertCleanlyDenied(request) {
  try {
    await request;
  } catch (error) {
    const detail = `${error.code ?? ''} ${error.message ?? ''}`;
    assert.equal(error.code, 'permission-denied', `expected permission-denied, got: ${detail}`);
    assert.match(
      detail,
      /false for '/,
      `no rule decided to refuse — the engine only errored: ${detail}`,
    );
    return;
  }
  assert.fail('the write was allowed, but no rule grants it');
}

// ═══ The URL contract ════════════════════════════════════════════════════════
//
// Nothing else in the app decides what a QR link means, so this is where a typo
// in the printed URL would be caught.

const urlChecks = {
  'resolves the two ids the QR carries': () => {
    const query = `?uid=${NURSERY}&id=${CHILD}`;
    assert.equal(
      profileIdFromQuery(query),
      profileId,
      'the URL must resolve to the document the app wrote',
    );
  },

  'carries no token and no page state': () => {
    // The whole point of the flow being automatic: the link holds the two ids
    // and nothing else a person would have to supply.
    const resolved = profileIdFromQuery(`?uid=${NURSERY}&id=${CHILD}`);
    assert.equal(resolved.split('~').length, 2);
    assert.equal(resolved.includes('token'), false);
  },

  'refuses an incomplete link': () => {
    // Each of these is a link a finder could reach by a truncated scan or a
    // hand-edited URL, and none of them may address a document.
    for (const query of [
      '',
      `?uid=${NURSERY}`,
      `?id=${CHILD}`,
      `?uid=&id=${CHILD}`,
      `?uid=${NURSERY}&id=`,
      `?uid=${NURSERY}&id=${CHILD}&uid=${OTHER_NURSERY}`,
      `?uid=${NURSERY}&id=${CHILD}&id=${CHILD}`,
    ]) {
      assert.equal(
        profileIdFromQuery(query),
        null,
        `must refuse: ${JSON.stringify(query)}`,
      );
    }
  },

  'refuses ids that would walk out of the document path': () => {
    for (const id of ['../otherNursery', 'a/b', 'a~b', 'a b', 'a.b', '', 'x'.repeat(129)]) {
      assert.equal(
        profileIdFromQuery(`?uid=${NURSERY}&id=${encodeURIComponent(id)}`),
        null,
        `must refuse child id: ${JSON.stringify(id)}`,
      );
      assert.equal(isSafeSegment(id), false, `must refuse segment: ${JSON.stringify(id)}`);
    }
  },

  'keeps two children from sharing one document': () => {
    // The separator has to be outside the base64url alphabet both ids are drawn
    // from, or "A_B" + "C" and "A" + "B_C" would collide and one child's page
    // would show the other's name.
    assert.notEqual(
      profileIdFromQuery(`?uid=A_B&id=C`),
      profileIdFromQuery(`?uid=A&id=B_C`),
    );
  },
};

// ═══ Scanned and pasted codes ═══════════════════════════════════════════════
//
// The home page's scanner and paste box hand raw QR text to
// routeFromScannedText. Only a CloseBy child link may become a route; every
// other QR — a menu, a payment page, a lookalike domain — must be refused
// rather than followed.

const scanChecks = {
  'opens the link a printed code carries': () => {
    assert.equal(
      routeFromScannedText(`https://closeby-28cdc.web.app/child?uid=${NURSERY}&id=${CHILD}`),
      `/child?uid=${NURSERY}&id=${CHILD}`,
    );
    assert.equal(
      routeFromScannedText(`  https://closeby-28cdc.firebaseapp.com/child/?uid=${NURSERY}&id=${CHILD}\n`),
      `/child?uid=${NURSERY}&id=${CHILD}`,
    );
  },

  'opens a code printed in the old format': () => {
    assert.equal(routeFromScannedText(`https://closeby-28cdc.web.app/c/${CHILD}`), `/c/${CHILD}`);
  },

  'drops anything else the scanned query carried': () => {
    assert.equal(
      routeFromScannedText(`https://closeby-28cdc.web.app/child?uid=${NURSERY}&id=${CHILD}&next=https://evil.test`),
      `/child?uid=${NURSERY}&id=${CHILD}`,
    );
  },

  'accepts the page’s own host, including plain http locally': () => {
    assert.equal(
      routeFromScannedText(`http://127.0.0.1:5173/child?uid=${NURSERY}&id=${CHILD}`, '127.0.0.1:5173'),
      `/child?uid=${NURSERY}&id=${CHILD}`,
    );
  },

  'refuses every QR that is not a CloseBy child link': () => {
    for (const text of [
      '',
      'not a link',
      'https://example.com/child?uid=a&id=b',
      'https://closeby-28cdc.web.app.evil.test/child?uid=a&id=b',
      'https://evil.test/?u=https://closeby-28cdc.web.app/child?uid=a&id=b',
      'http://closeby-28cdc.web.app/child?uid=a&id=b',
      'javascript:alert(1)',
      'https://closeby-28cdc.web.app/',
      'https://closeby-28cdc.web.app/admin',
      `https://closeby-28cdc.web.app/child?uid=${NURSERY}`,
      `https://closeby-28cdc.web.app/child?uid=${NURSERY}&id=../x`,
      'https://closeby-28cdc.web.app/c/a~b',
      'https://closeby-28cdc.web.app/c/a/b',
      `https://closeby-28cdc.web.app/child?uid=a&id=${'x'.repeat(3000)}`,
      null,
    ]) {
      assert.equal(routeFromScannedText(text, '127.0.0.1:5173'), null, `must refuse: ${String(text).slice(0, 80)}`);
    }
  },
};

// ═══ The report payload ═════════════════════════════════════════════════════
//
// The page sends exactly what buildFoundReport returns. These pin the mapping
// from geolocation's `{ lat, lng }` — the shape the page once misread as
// `latitude`/`longitude`, which sent `undefined` coordinates and failed every
// report from a finder who allowed location.

const loadedProfile = { id: `${NURSERY}~${CHILD}`, nurseryId: NURSERY, childId: CHILD };

const payloadChecks = {
  'carries the finder’s position when location was allowed': () => {
    const at = Symbol('serverTimestamp');
    assert.deepEqual(buildFoundReport(loadedProfile, GEO_FIX, at), {
      at,
      location: { lat: 51.5, lng: -0.12 },
      nurseryId: NURSERY,
      childId: CHILD,
    });
  },

  'sends location null when location was denied or unavailable': () => {
    const report = buildFoundReport(loadedProfile, null, 'ts');
    assert.equal(report.location, null);
    assert.deepEqual(Object.keys(report).sort(), ['at', 'childId', 'location', 'nurseryId']);
  },

  'never sends an undefined coordinate': () => {
    // The old bug's shape, plus every other way a position can be unusable.
    // Firestore refuses `undefined`, and the rules refuse anything but two
    // in-range numbers, so each of these must degrade to "no location".
    for (const bad of [
      { latitude: 51.5, longitude: -0.12 },
      { lat: 51.5 },
      { lat: Number.NaN, lng: 0 },
      { lat: 91, lng: 0 },
      { lat: 0, lng: -181 },
      { lat: '51.5', lng: '-0.12' },
      undefined,
    ]) {
      assert.equal(toLocation(bad), null, `must drop: ${JSON.stringify(bad)}`);
    }
  },

  'stamps the ids from the loaded profile, not the URL': () => {
    const report = buildFoundReport(
      { id: 'legacyToken', nurseryId: NURSERY, childId: CHILD },
      null,
      'ts',
    );
    assert.equal(report.nurseryId, NURSERY);
    assert.equal(report.childId, CHILD);
  },

  'refuses to build a report for a profile without ids': () => {
    assert.throws(() => buildFoundReport({ id: 'x', nurseryId: null, childId: CHILD }, null, 'ts'));
    assert.throws(() => buildFoundReport({ id: 'x', nurseryId: NURSERY, childId: '' }, null, 'ts'));
  },
};

// ═══ Hosting ══════════════════════════════════════════════════════════════════
//
// The rewrite table is what turns a scanned link into the app. A missing or
// mistyped rule here is a 404 for every finder, and it only shows up on the exact
// URL shape the QR carries.

const hostingChecks = {
  'serves the app at the scanned URL': async () => {
    const url = `http://${HOSTING}/child?uid=${NURSERY}&id=${CHILD}`;
    const response = await fetch(url);

    assert.equal(response.status, 200, `expected 200 from ${url}`);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);

    const body = await response.text();
    assert.match(body, /<div id="root">/, 'the SPA shell must be served');
    assert.match(body, /<script[^>]+src="[^"]+\.js"/, 'the bundle must be referenced');
  },

  'still serves a code printed in the old format': async () => {
    const response = await fetch(`http://${HOSTING}/c/${CHILD}`);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root">/);
  },

  'keeps the query string on the rewrite': async () => {
    // A rewrite that dropped the parameters would serve the app and then show
    // "this link is not complete" — the worst outcome, because it looks like the
    // app is broken rather than the link.
    const response = await fetch(
      `http://${HOSTING}/child?uid=${NURSERY}&id=${CHILD}`,
      { redirect: 'manual' },
    );

    assert.equal(response.status, 200, 'must not redirect away from /child');
    assert.equal(new URL(response.url).search, `?uid=${NURSERY}&id=${CHILD}`);
  },
};

// ═══ Security rules ══════════════════════════════════════════════════════════
//
// The private child document holds a guardian's name and phone number. Every
// assertion about it failing is what keeps that out of a stranger's hands, and
// this file is the only place that reads it.

const anonymousChecks = {
  'reads the public profile the QR points at': async (anon) => {
    const snapshot = await assertSucceeds(
      getDoc(doc(anon, 'publicProfiles', profileId)),
    );

    assert.equal(snapshot.exists(), true, 'the profile must resolve');
    assert.equal(snapshot.data().name, 'Amina Hassan');
    assert.equal(snapshot.data().group, 'Sunflowers');
  },

  'cannot read the private child record': async (anon) => {
    await assertFails(getDoc(doc(anon, 'nurseries', NURSERY, 'children', CHILD)));
  },

  'cannot read the nursery record': async (anon) => {
    await assertFails(getDoc(doc(anon, 'nurseries', NURSERY)));
  },

  'cannot list the profiles and work through them': async (anon) => {
    // Without this, one child's link would lead to every other child's link.
    await assertFails(getDocs(collection(anon, 'publicProfiles')));
  },

  'cannot write a profile': async (anon) => {
    await assertFails(
      setDoc(doc(anon, 'publicProfiles', `${NURSERY}~${CHILD}`), {
        nurseryId: NURSERY,
        childId: CHILD,
        name: 'Someone Else',
        group: 'Stars',
      }),
    );
  },

  'can file a sighting with location, built as the page builds it': async (anon) => {
    // The profile as the page loaded it, then the page's own payload builder
    // with geolocation's own result shape.
    const snap = await getDoc(doc(anon, 'publicProfiles', profileId));
    const loaded = { id: snap.id, ...snap.data() };
    const ref = await assertSucceeds(
      addDoc(
        collection(anon, 'publicProfiles', profileId, 'foundReports'),
        pageReport(loaded, GEO_FIX),
      ),
    );
    assert.ok(ref.id, 'the write must be acknowledged with a document id');
  },

  'can file a sighting with no location, built as the page builds it': async (anon) => {
    // Denied location must not cost the nursery the time, which is the part that
    // tells them where to start looking.
    const snap = await getDoc(doc(anon, 'publicProfiles', profileId));
    await assertSucceeds(
      addDoc(
        collection(anon, 'publicProfiles', profileId, 'foundReports'),
        pageReport({ id: snap.id, ...snap.data() }, null),
      ),
    );
  },

  'cannot change or delete a sighting': async (anon) => {
    await assertFails(
      setDoc(
        doc(anon, 'publicProfiles', profileId, 'foundReports', 'anyReportId'),
        { location: null },
        { merge: true },
      ),
    );
    await assertFails(deleteDoc(doc(anon, 'publicProfiles', profileId, 'foundReports', 'anyReportId')));
  },

  'cannot read a nursery’s resolved markers': async (anon) => {
    await assertFails(getDocs(collection(anon, 'nurseries', NURSERY, 'alertStates')));
  },

  'cannot smuggle anything extra into a sighting': async (anon) => {
    await assertCleanlyDenied(
      addDoc(collection(anon, 'publicProfiles', profileId, 'foundReports'), {
        at: serverTimestamp(),
        location: null,
        nurseryId: NURSERY,
        childId: CHILD,
        finderPhone: '555',
      }),
    );
  },

  'cannot stamp a foreign nursery onto a sighting': async (anon) => {
    // The owning nursery's reads are keyed on the stamped nurseryId, so a
    // report claiming another nursery would hand that nursery a sighting for a
    // child it does not look after. The rules compare the stamp against the
    // parent profile instead of trusting the browser.
    await assertCleanlyDenied(
      addDoc(collection(anon, 'publicProfiles', profileId, 'foundReports'), {
        at: serverTimestamp(),
        location: null,
        nurseryId: OTHER_NURSERY,
        childId: CHILD,
      }),
    );
  },

  'cannot stamp a foreign child onto a sighting': async (anon) => {
    await assertCleanlyDenied(
      addDoc(collection(anon, 'publicProfiles', profileId, 'foundReports'), {
        at: serverTimestamp(),
        location: null,
        nurseryId: NURSERY,
        childId: OTHER_CHILD,
      }),
    );
  },

  'cannot file a sighting under a profile that does not exist': async (anon) => {
    // validReportIds reads the parent, and a failed read refuses the create —
    // there is no sighting without a live profile behind it.
    await assertCleanlyDenied(
      addDoc(
        collection(anon, 'publicProfiles', `${NURSERY}~doesNotExist`, 'foundReports'),
        {
          at: serverTimestamp(),
          location: null,
          nurseryId: NURSERY,
          childId: 'doesNotExist',
        },
      ),
    );
  },

  'cannot backdate a sighting': async (anon) => {
    await assertCleanlyDenied(
      addDoc(collection(anon, 'publicProfiles', profileId, 'foundReports'), {
        at: new Date('2020-01-01'),
        location: null,
        nurseryId: NURSERY,
        childId: CHILD,
      }),
    );
  },

  'cannot read a sighting even by its exact path': async (anon) => {
    await assertFails(
      getDoc(doc(anon, 'publicProfiles', profileId, 'foundReports', 'anyReportId')),
    );
  },

  'cannot read other people’s sightings': async (anon) => {
    await assertFails(getDocs(collection(anon, 'publicProfiles', profileId, 'foundReports')));
  },

  'reports a deleted child as gone rather than blank': async (anon) => {
    // What deleteChild relies on: the page must stop resolving, so it shows
    // "this code is no longer active" instead of a stale name.
    const snapshot = await assertSucceeds(
      getDoc(doc(anon, 'publicProfiles', `${NURSERY}~doesNotExist`)),
    );
    assert.equal(snapshot.exists(), false);
  },
};

const ownerChecks = {
  'issues a QR by writing the profile the URL resolves to': async (owner) => {
    await assertSucceeds(
      setDoc(doc(owner, 'publicProfiles', `${NURSERY}~${OTHER_CHILD}`), {
        nurseryId: NURSERY,
        childId: OTHER_CHILD,
        name: 'Yusuf Karim',
        group: 'Rainbows',
        createdAt: serverTimestamp(),
      }),
    );
  },

  'cannot publish a guardian’s phone number': async (owner) => {
    // The reason the public copy is a separate document at all. A Firestore get
    // returns every field, so the only defence is refusing to store one here.
    await assertFails(
      setDoc(doc(owner, 'publicProfiles', `${NURSERY}~sneaky1`), {
        nurseryId: NURSERY,
        childId: 'sneaky1',
        name: 'Yusuf Karim',
        group: 'Rainbows',
        guardianPhone: '07700 900123',
      }),
    );
  },

  'cannot take over another nursery’s page': async (owner) => {
    // The write is the caller's own profile as far as `create` is concerned —
    // they are the one writing it — but it lands on the document id the other
    // nursery's QR URL resolves to, so that nursery's page would start showing
    // whatever was written here. The rules require the id to match the contents.
    await assertCleanlyDenied(
      setDoc(doc(owner, 'publicProfiles', `${OTHER_NURSERY}~${OTHER_CHILD}`), {
        nurseryId: NURSERY,
        childId: OTHER_CHILD,
        name: 'Yusuf Karim',
        group: 'Rainbows',
      }),
    );
  },

  'cannot retag another nursery’s page to make the id match': async (owner) => {
    // The other half of the guard. Claiming the victim's nurseryId is no escape:
    // the owner check then refuses, because the caller is not that nursery.
    await assertCleanlyDenied(
      setDoc(doc(owner, 'publicProfiles', `${OTHER_NURSERY}~${OTHER_CHILD}`), {
        nurseryId: OTHER_NURSERY,
        childId: OTHER_CHILD,
        name: 'Yusuf Karim',
        group: 'Rainbows',
      }),
    );
  },

  'cannot rename another nursery’s child': async (owner) => {
    await assertFails(
      setDoc(doc(owner, 'nurseries', NURSERY, 'children', CHILD), {
        name: 'Someone Else',
        age: 4,
        group: 'Stars',
        guardianName: 'A',
        guardianPhone: 'B',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  },

  'cannot overwrite another nursery’s profile': async (owner) => {
    await assertFails(
      setDoc(doc(owner, 'publicProfiles', `${NURSERY}~${CHILD}`), {
        nurseryId: OTHER_NURSERY,
        childId: CHILD,
        name: 'Yusuf Karim',
        group: 'Rainbows',
      }),
    );
  },

  'can refresh the name on its own live page': async (owner) => {
    await assertSucceeds(
      setDoc(
        doc(owner, 'publicProfiles', `${NURSERY}~${CHILD}`),
        { name: 'Amina H.', group: 'Sunflowers' },
        { merge: true },
      ),
    );
  },

  'can read the sightings filed under its own profile': async (owner) => {
    // The anonymous checks each filed one sighting under this profile; the
    // owning nursery is the only reader the rules let in. The nurseryId filter
    // is not decoration — without it the rules engine cannot prove the caller
    // owns every result and refuses the query outright.
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(owner, 'publicProfiles', profileId, 'foundReports'),
          where('nurseryId', '==', NURSERY),
        ),
      ),
    );
    assert.ok(snap.size >= 2, 'the anonymous sightings must be readable');
  },

  'can list its own sightings across every profile': async (owner) => {
    // The query the reports repository is expected to send: a collection group
    // filtered to the caller's nursery. The where clause is what lets the rules
    // engine prove every result satisfies isOwner.
    const snap = await assertSucceeds(
      getDocs(
        query(
          collectionGroup(owner, 'foundReports'),
          where('nurseryId', '==', NURSERY),
        ),
      ),
    );
    assert.ok(snap.size >= 2, 'the nursery-wide read must reach its sightings');
  },

  'cannot list another nursery’s sightings': async (owner) => {
    await assertFails(
      getDocs(
        query(
          collectionGroup(owner, 'foundReports'),
          where('nurseryId', '==', OTHER_NURSERY),
        ),
      ),
    );
  },

  'cannot list sightings without the nursery filter': async (owner) => {
    // Without the where clause the rules engine cannot prove the caller owns
    // every result, so the query itself is refused rather than narrowed.
    await assertFails(getDocs(collectionGroup(owner, 'foundReports')));
  },

  'cannot alter a sighting once filed': async (owner) => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(owner, 'publicProfiles', profileId, 'foundReports'),
          where('nurseryId', '==', NURSERY),
        ),
      ),
    );
    assert.ok(snap.size > 0, 'a sighting must exist from the anonymous checks');
    const reportRef = snap.docs[0].ref;
    // Reports are immutable for now: no update, no delete, not even for the
    // owning nursery. A resolve/status workflow would change this deliberately.
    await assertFails(setDoc(reportRef, { location: null }, { merge: true }));
    await assertFails(deleteDoc(reportRef));
  },

  'can retire a child’s page by deleting it': async (owner) => {
    await assertSucceeds(deleteDoc(doc(owner, 'publicProfiles', `${NURSERY}~${OTHER_CHILD}`)));
  },
};

// ═══ Run ═════════════════════════════════════════════════════════════════════

console.log('\nCloseBy — local check of the scanned-QR flow\n');

if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('dist/index.html is missing. Run `npm run build` first.');
  process.exit(1);
}

console.log('URL contract');
for (const [name, run] of Object.entries(urlChecks)) {
  await check(name, run);
}

console.log('\nScanned and pasted codes');
for (const [name, run] of Object.entries(scanChecks)) {
  await check(name, run);
}

console.log('\nReport payload');
for (const [name, run] of Object.entries(payloadChecks)) {
  await check(name, run);
}

console.log('\nHosting rewrites');
for (const [name, run] of Object.entries(hostingChecks)) {
  await check(name, run);
}

const testEnv = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT ?? 'closeby-28cdc',
  firestore: {
    host: '127.0.0.1',
    port: firestorePort,
    rules: readFileSync(new URL('../firestore.rules.proposed', import.meta.url), 'utf8'),
  },
});

// Seeded exactly as ChildrenRepositoryImpl.generateQr writes it, so the tests
// are asserting against the shape the app really produces.
const owner = testEnv.authenticatedContext(NURSERY).firestore();
await assertSucceeds(
  setDoc(doc(owner, 'nurseries', NURSERY, 'children', CHILD), {
    name: 'Amina Hassan',
    age: 4,
    group: 'Sunflowers',
    qrActive: true,
    lastScan: 'Never scanned',
    guardianName: 'Yusuf Karim',
    guardianPhone: '07700 900123',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);
await assertSucceeds(
  setDoc(doc(owner, 'publicProfiles', profileId), {
    nurseryId: NURSERY,
    childId: CHILD,
    name: 'Amina Hassan',
    group: 'Sunflowers',
    createdAt: serverTimestamp(),
  }),
);

console.log('\nRules — a stranger holding the QR, not signed in');
const anon = testEnv.unauthenticatedContext().firestore();
for (const [name, run] of Object.entries(anonymousChecks)) {
  await check(name, () => run(anon));
}

console.log('\nRules — a signed-in nursery');
for (const [name, run] of Object.entries(ownerChecks)) {
  await check(name, () => run(owner));
}

// ═══ The Flutter app's alert feed, resolution and nursery settings ══════════
//
// The exact queries AlertsRepositoryImpl sends, and the writes the alert and
// nursery-settings screens make. The emulator does not enforce composite
// indexes, so these prove the rules side only; firestore.indexes.json carries
// the two indexes the live project needs for the same queries.

const other = testEnv.authenticatedContext(OTHER_NURSERY).firestore();

console.log('\nRules — the app’s alert feed and nursery settings');

await check('the alert feed query is allowed for its own nursery', async () => {
  const snap = await assertSucceeds(
    getDocs(
      query(
        collectionGroup(owner, 'foundReports'),
        where('nurseryId', '==', NURSERY),
        orderBy('at', 'desc'),
        limit(100),
      ),
    ),
  );
  assert.ok(snap.size >= 2);
  // Newest first, as the feed renders them.
  const times = snap.docs.map((d) => d.data().at.toMillis());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  // A report filed with location carries it in the shape the app parses.
  assert.ok(
    snap.docs.some((d) => d.data().location?.lat === GEO_FIX.lat && d.data().location?.lng === GEO_FIX.lng),
    'the located sighting must arrive with { lat, lng }',
  );
});

await check('the per-child last-scan query is allowed for its own nursery', async () => {
  const snap = await assertSucceeds(
    getDocs(
      query(
        collectionGroup(owner, 'foundReports'),
        where('nurseryId', '==', NURSERY),
        where('childId', '==', CHILD),
        orderBy('at', 'desc'),
        limit(1),
      ),
    ),
  );
  assert.equal(snap.size, 1);
});

await check('another nursery cannot run the feed query for this nursery', async () => {
  await assertFails(
    getDocs(
      query(
        collectionGroup(other, 'foundReports'),
        where('nurseryId', '==', NURSERY),
        orderBy('at', 'desc'),
        limit(100),
      ),
    ),
  );
});

await check('another nursery’s own feed does not include these reports', async () => {
  const snap = await assertSucceeds(
    getDocs(query(collectionGroup(other, 'foundReports'), where('nurseryId', '==', OTHER_NURSERY))),
  );
  assert.equal(snap.size, 0);
});

await check('a nursery can resolve an alert in its own space', async () => {
  const ref = doc(owner, 'nurseries', NURSERY, 'alertStates', 'someReportId');
  await assertSucceeds(setDoc(ref, { status: 'resolved', resolvedAt: serverTimestamp() }));
  const snap = await assertSucceeds(getDocs(collection(owner, 'nurseries', NURSERY, 'alertStates')));
  assert.equal(snap.docs.find((d) => d.id === 'someReportId')?.data().status, 'resolved');
});

await check('a resolution must be exactly the status and the server time', async () => {
  const ref = doc(owner, 'nurseries', NURSERY, 'alertStates', 'badReportId');
  await assertCleanlyDenied(setDoc(ref, { status: 'resolved', resolvedAt: new Date('2020-01-01') }));
  await assertCleanlyDenied(setDoc(ref, { status: 'resolved', resolvedAt: serverTimestamp(), note: 'x' }));
  await assertCleanlyDenied(setDoc(ref, { status: 'open', resolvedAt: serverTimestamp() }));
});

await check('another nursery cannot read or write this nursery’s resolutions', async () => {
  await assertFails(getDocs(collection(other, 'nurseries', NURSERY, 'alertStates')));
  await assertFails(
    setDoc(doc(other, 'nurseries', NURSERY, 'alertStates', 'x'), {
      status: 'resolved',
      resolvedAt: serverTimestamp(),
    }),
  );
});

await check('a nursery can save its public contact', async () => {
  await assertSucceeds(
    setDoc(doc(owner, 'nurseries', NURSERY), {
      publicName: 'Sunny Steps Nursery',
      publicPhone: '+20 100 000 0000',
      updatedAt: serverTimestamp(),
    }),
  );
});

await check('the nursery document refuses anything but the public contact', async () => {
  await assertCleanlyDenied(
    setDoc(doc(owner, 'nurseries', NURSERY), {
      publicName: 'Sunny Steps Nursery',
      guardianPhone: '07700 900123',
      updatedAt: serverTimestamp(),
    }),
  );
  await assertCleanlyDenied(
    setDoc(doc(owner, 'nurseries', NURSERY), { publicPhone: 'x'.repeat(41) }),
  );
});

await check('nobody else can read the nursery document', async () => {
  await assertFails(getDoc(doc(other, 'nurseries', NURSERY)));
  await assertFails(getDoc(doc(anon, 'nurseries', NURSERY)));
});

await check('the public contact can be copied onto a live page, and read by a finder', async () => {
  // NurseryRepositoryImpl.saveProfile's write to every active page.
  await assertSucceeds(
    setDoc(
      doc(owner, 'publicProfiles', profileId),
      {
        nurseryId: NURSERY,
        childId: CHILD,
        name: 'Amina H.',
        group: 'Sunflowers',
        nurseryName: 'Sunny Steps Nursery',
        nurseryPhone: '+20 100 000 0000',
      },
      { merge: true },
    ),
  );
  const page = await assertSucceeds(getDoc(doc(anon, 'publicProfiles', profileId)));
  assert.equal(page.data().nurseryPhone, '+20 100 000 0000');
  assert.equal(page.data().guardianPhone, undefined);

  // Clearing the phone in settings deletes it from the page.
  await assertSucceeds(
    setDoc(doc(owner, 'publicProfiles', profileId), { nurseryPhone: deleteField() }, { merge: true }),
  );
  const cleared = await assertSucceeds(getDoc(doc(anon, 'publicProfiles', profileId)));
  assert.equal(cleared.data().nurseryPhone, undefined);
});

// A legacy code, keyed by token instead of by the two ids, must still resolve.
//
// Seeded with the rules switched off, because these documents only ever came
// into existence under the old scheme: `create` now requires the document id to
// be the derived one, which is correct for anything the app writes today, but it
// also means the documents already sitting in the live project cannot be
// recreated here by writing to them.
const legacyToken = 'LGCAgY20LEGACYtoken000';
await testEnv.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'publicProfiles', legacyToken), {
    nurseryId: NURSERY,
    childId: CHILD,
    name: 'Amina Hassan',
    group: 'Sunflowers',
    createdAt: serverTimestamp(),
  });
});

console.log('\nRules — a code printed before the URL change');
await check('still resolves for its token', async () => {
  const snapshot = await assertSucceeds(getDoc(doc(anon, 'publicProfiles', legacyToken)));
  assert.equal(snapshot.data().name, 'Amina Hassan');
});
await check('can still be refreshed by its owner', async () => {
  await assertSucceeds(
    setDoc(doc(owner, 'publicProfiles', legacyToken), { name: 'Amina H.' }, { merge: true }),
  );
});
await check('still accepts sightings stamped from its own profile', async () => {
  // validReportIds reads the parent by document id, so the same check has to
  // pass for a token-keyed profile as for a derived-id one.
  await assertSucceeds(
    addDoc(collection(anon, 'publicProfiles', legacyToken, 'foundReports'), {
      at: serverTimestamp(),
      location: null,
      nurseryId: NURSERY,
      childId: CHILD,
    }),
  );
});
await check('cannot be re-created by anyone once deleted', async () => {
  // `create` only accepts the derived id, so a token-keyed document can never be
  // written back into existence — deleting one retires the code for good.
  await assertSucceeds(deleteDoc(doc(owner, 'publicProfiles', legacyToken)));
  await assertCleanlyDenied(
    setDoc(doc(owner, 'publicProfiles', legacyToken), {
      nurseryId: NURSERY,
      childId: CHILD,
      name: 'Amina Hassan',
      group: 'Sunflowers',
    }),
  );
});

// ═══ Full cycle — registration to deletion ══════════════════════════════════
//
// The checks above prove individual grants. This section replays the exact
// write sequence ChildrenRepositoryImpl performs over one child's life —
// addChild, generateQr, an edit that republishes, a regeneration that retires
// a legacy bracelet, deleteChild — so a rules change that breaks the Flutter
// app's writes fails here, where the bracelet is still printable, rather than
// at a nursery gate with a child who cannot be scanned.

const CYCLE_CHILD = 'CYCLEchild00000000000ab';
const CYCLE_LEGACY_TOKEN = 'CYCLElegacyToken00000';
const cycleChildRef = doc(owner, 'nurseries', NURSERY, 'children', CYCLE_CHILD);
const cycleProfileRef = doc(owner, 'publicProfiles', `${NURSERY}~${CYCLE_CHILD}`);

// The URL generateQr builds and the QR encodes. The format is a fixed base
// plus the two ids in query order and nothing else — there is no room in it
// for a name, a guardian or a phone number to ride along on the bracelet.
const cycleUrl = `https://closeby-28cdc.web.app/child?uid=${NURSERY}&id=${CYCLE_CHILD}`;
assert.match(
  cycleUrl,
  /^https:\/\/closeby-28cdc\.web\.app\/child\?uid=[A-Za-z0-9_-]+&id=[A-Za-z0-9_-]+$/,
);

// addChild's write: the form fields, the QR defaults, and the server timestamps.
const cycleChildSeed = {
  name: 'Amina Hassan',
  age: 4,
  group: 'Sunflowers',
  qrActive: false,
  lastScan: 'Never scanned',
  guardianName: 'Yusuf Karim',
  guardianPhone: '07700 900123',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

// What the nursery-settings checks above saved to nurseries/{uid}, and so
// what generateQr and updateChild copy onto the page.
const CONTACT = { nurseryName: 'Sunny Steps Nursery', nurseryPhone: '+20 100 000 0000' };

console.log('\nFull cycle — registration to deletion');

await check('registers a child exactly as addChild writes it', async () => {
  await assertSucceeds(setDoc(cycleChildRef, cycleChildSeed));
});

await check('issues a QR exactly as generateQr writes it', async () => {
  const batch = writeBatch(owner);
  batch.update(cycleChildRef, {
    qrUrl: cycleUrl,
    qrActive: true,
    qrGeneratedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(cycleProfileRef, {
    nurseryId: NURSERY,
    childId: CYCLE_CHILD,
    name: 'Amina Hassan',
    group: 'Sunflowers',
    ...CONTACT,
    createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

await check('serves the issued URL to a scanner', async () => {
  const response = await fetch(
    `http://${HOSTING}/child?uid=${NURSERY}&id=${CYCLE_CHILD}`,
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root">/);
});

await check('shows a finder only the safe copy of the child', async () => {
  const profile = await assertSucceeds(getDoc(cycleProfileRef));
  assert.deepEqual(
    Object.keys(profile.data()).sort(),
    ['childId', 'createdAt', 'group', 'name', 'nurseryId', 'nurseryName', 'nurseryPhone'],
    'the public document must hold the whitelist and nothing else',
  );

  // The same child's private record, read by its own nursery: the guardian
  // fields exist there, and only there.
  const privateChild = await assertSucceeds(getDoc(cycleChildRef));
  assert.equal(privateChild.data().guardianPhone, '07700 900123');
});

await check('a finder files a sighting as the page sends it', async () => {
  // Exactly submitFoundReport's payload: at, location, and the ids stamped
  // from the profile the page loaded — never from the URL.
  const snap = await assertSucceeds(
    getDoc(doc(anon, 'publicProfiles', `${NURSERY}~${CYCLE_CHILD}`)),
  );
  await assertSucceeds(
    addDoc(
      collection(anon, 'publicProfiles', `${NURSERY}~${CYCLE_CHILD}`, 'foundReports'),
      pageReport({ id: snap.id, ...snap.data() }, { lat: 30.0444, lng: 31.2357 }),
    ),
  );
});

await check('the nursery finds the sighting in its reports query', async () => {
  const snap = await assertSucceeds(
    getDocs(
      query(
        collectionGroup(owner, 'foundReports'),
        where('nurseryId', '==', NURSERY),
      ),
    ),
  );
  const report = snap.docs.find(
    (d) => d.ref.parent.parent.id === `${NURSERY}~${CYCLE_CHILD}`,
  );
  assert.ok(report, 'the cycle sighting must be in the nursery-wide query');
  assert.deepEqual(
    Object.keys(report.data()).sort(),
    ['at', 'childId', 'location', 'nurseryId'],
    'a sighting carries the report and nothing about the finder',
  );
});

await check('an edit reaches the printed page via the republish', async () => {
  // updateChild: one batch — the merge of the form fields and, because
  // qrActive is true, the profile republished with only the safe fields and the
  // nursery's public contact.
  const batch = writeBatch(owner);
  batch.set(
      cycleChildRef,
      {
        name: 'Amina Saad',
        age: 4,
        group: 'Sunflowers',
        qrActive: true,
        lastScan: 'Never scanned',
        guardianName: 'Yusuf Karim',
        guardianPhone: '07700 900123',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
  );
  batch.set(
    cycleProfileRef,
    {
      nurseryId: NURSERY,
      childId: CYCLE_CHILD,
      name: 'Amina Saad',
      group: 'Sunflowers',
      ...CONTACT,
    },
    { merge: true },
  );
  await assertSucceeds(batch.commit());

  const profile = await assertSucceeds(getDoc(cycleProfileRef));
  assert.equal(profile.data().name, 'Amina Saad');
  assert.deepEqual(
    Object.keys(profile.data()).sort(),
    ['childId', 'createdAt', 'group', 'name', 'nurseryId', 'nurseryName', 'nurseryPhone'],
  );
});

await check('a legacy bracelet still resolves before the re-issue', async () => {
  await assertSucceeds(
    setDoc(
      cycleChildRef,
      { qrToken: CYCLE_LEGACY_TOKEN, updatedAt: serverTimestamp() },
      { merge: true },
    ),
  );
  // Seeded with the rules off: a token-keyed document only ever came from the
  // old scheme, and create no longer accepts that id.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'publicProfiles', CYCLE_LEGACY_TOKEN), {
      nurseryId: NURSERY,
      childId: CYCLE_CHILD,
      name: 'Amina Saad',
      group: 'Sunflowers',
      createdAt: serverTimestamp(),
    });
  });

  const legacy = await assertSucceeds(
    getDoc(doc(anon, 'publicProfiles', CYCLE_LEGACY_TOKEN)),
  );
  assert.equal(
    legacy.exists(),
    true,
    'the printed bracelet works until the code is re-issued',
  );
});

await check('regenerating retires the legacy bracelet in the same batch', async () => {
  const batch = writeBatch(owner);
  batch.update(cycleChildRef, {
    qrUrl: cycleUrl,
    qrActive: true,
    qrGeneratedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    qrToken: deleteField(),
  });
  batch.set(cycleProfileRef, {
    nurseryId: NURSERY,
    childId: CYCLE_CHILD,
    name: 'Amina Saad',
    group: 'Sunflowers',
    ...CONTACT,
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(owner, 'publicProfiles', CYCLE_LEGACY_TOKEN));
  await assertSucceeds(batch.commit());

  const legacy = await assertSucceeds(
    getDoc(doc(anon, 'publicProfiles', CYCLE_LEGACY_TOKEN)),
  );
  assert.equal(legacy.exists(), false, 'the old bracelet must stop resolving');
  const child = await assertSucceeds(getDoc(cycleChildRef));
  assert.equal(child.data().qrToken, undefined);
});

await check('deleting the child retires the page', async () => {
  const batch = writeBatch(owner);
  batch.delete(cycleChildRef);
  batch.delete(cycleProfileRef);
  await assertSucceeds(batch.commit());

  const profile = await assertSucceeds(getDoc(cycleProfileRef));
  assert.equal(profile.exists(), false, 'the page must show "no longer active"');

  const child = await assertSucceeds(getDoc(cycleChildRef));
  assert.equal(child.exists(), false);
});

await check('an orphaned sighting survives, readable by its nursery only', async () => {
  // Firestore does not cascade-delete subcollections: deleting the profile
  // leaves its sighting behind. The rules keep that orphan nursery-only —
  // reads key on the stamped nurseryId — so what remains is a hygiene
  // question, and cleaning up is a deliberate decision for the reports phase.
  const snap = await assertSucceeds(
    getDocs(
      query(
        collectionGroup(owner, 'foundReports'),
        where('nurseryId', '==', NURSERY),
      ),
    ),
  );
  const report = snap.docs.find(
    (d) => d.ref.parent.parent.id === `${NURSERY}~${CYCLE_CHILD}`,
  );
  assert.ok(report, 'the orphaned sighting is still in the nursery query');

  await assertFails(
    getDoc(
      doc(anon, 'publicProfiles', `${NURSERY}~${CYCLE_CHILD}`, 'foundReports', report.id),
    ),
  );
});

// ═══ Deleting a page that is not there ═══════════════════════════════════════
//
// deleteChild and generateQr delete public pages in the same batch as their
// other writes, without first checking the page exists. A child whose code was
// never generated has no page, and a legacy bracelet's page may already be
// gone. A refused delete fails the whole batch, so these must succeed — while
// a page that does exist stays deletable by its owner only.

const NO_CODE_CHILD = 'NOCODEchild0000000000ab';
const noCodeChildRef = doc(owner, 'nurseries', NURSERY, 'children', NO_CODE_CHILD);
const noCodeProfileRef = doc(owner, 'publicProfiles', `${NURSERY}~${NO_CODE_CHILD}`);
const GONE_LEGACY_TOKEN = 'GONElegacyToken000000';

console.log('\nRules — deleting a page that is not there');

await check('deletes a child whose code was never generated, as deleteChild writes it', async () => {
  await assertSucceeds(setDoc(noCodeChildRef, cycleChildSeed));

  const batch = writeBatch(owner);
  batch.delete(noCodeChildRef);
  batch.delete(noCodeProfileRef);
  await assertSucceeds(batch.commit());

  const child = await assertSucceeds(getDoc(noCodeChildRef));
  assert.equal(child.exists(), false);
});

await check('deletes a child whose legacy page is already gone', async () => {
  await assertSucceeds(setDoc(noCodeChildRef, cycleChildSeed));

  const batch = writeBatch(owner);
  batch.delete(noCodeChildRef);
  batch.delete(noCodeProfileRef);
  batch.delete(doc(owner, 'publicProfiles', GONE_LEGACY_TOKEN));
  await assertSucceeds(batch.commit());
});

await check('regenerates a code whose legacy page is already gone, as generateQr writes it', async () => {
  await assertSucceeds(setDoc(noCodeChildRef, { ...cycleChildSeed, qrToken: GONE_LEGACY_TOKEN }));

  const batch = writeBatch(owner);
  batch.update(noCodeChildRef, {
    qrUrl: `https://closeby-28cdc.web.app/child?uid=${NURSERY}&id=${NO_CODE_CHILD}`,
    qrActive: true,
    qrGeneratedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    qrToken: deleteField(),
  });
  batch.set(noCodeProfileRef, {
    nurseryId: NURSERY,
    childId: NO_CODE_CHILD,
    name: 'Amina Hassan',
    group: 'Sunflowers',
    ...CONTACT,
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(owner, 'publicProfiles', GONE_LEGACY_TOKEN));
  await assertSucceeds(batch.commit());
});

await check('another nursery still cannot delete an existing page', async () => {
  // The page regenerated above exists, so the owner check applies.
  await assertFails(deleteDoc(doc(other, 'publicProfiles', `${NURSERY}~${NO_CODE_CHILD}`)));
  const page = await assertSucceeds(getDoc(noCodeProfileRef));
  assert.equal(page.exists(), true, 'the page must survive the refused delete');
});

await check('a finder cannot delete a page, present or not', async () => {
  await assertFails(deleteDoc(doc(anon, 'publicProfiles', `${NURSERY}~${NO_CODE_CHILD}`)));
  await assertFails(deleteDoc(doc(anon, 'publicProfiles', GONE_LEGACY_TOKEN)));
});

await testEnv.cleanup();

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failures.length} failed\n`,
);

if (failures.length > 0) {
  for (const { name, error } of failures) {
    console.error(`--- ${name}\n${error.stack}\n`);
  }
  process.exit(1);
}
