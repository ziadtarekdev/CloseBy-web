// How the public page talks to Firestore.
//
// The only collection it touches is `publicProfiles/{profileId}` — the safe
// snapshot the Flutter app writes when a QR is generated, which carries the
// child's name and group and the guardian's name and phone. It never reads
// `nurseries/{uid}/children/{childId}`, the private record, so there is no code
// path on this page that can fetch anything else even if the rules were wrong.
//
// The document id is passed in already resolved and already validated, by
// childLink.js: `uid~childId` for a current QR code, or a bare legacy token for
// a code printed before the URL carried the two ids.
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildFoundReport } from './foundReport';

export const PUBLIC_PROFILES = 'publicProfiles';
export const FOUND_REPORTS = 'foundReports';

/**
 * Reads the public snapshot for one profile document.
 *
 * Returns `{ status: 'found' | 'missing' }` rather than throwing, so a profile
 * whose document was deleted (the child left the nursery) is an ordinary state
 * the page renders, not an error.
 */
export async function fetchPublicProfile(profileId) {
  try {
    const snap = await getDoc(doc(db, PUBLIC_PROFILES, profileId));

    if (!snap.exists()) return { status: 'missing', profile: null };

    return { status: 'found', profile: normalizeProfile(snap.id, snap.data()) };
  } catch (error) {
    throw new PublicProfileError(error);
  }
}

/**
 * Files a sighting for the child this profile belongs to.
 *
 * The report carries the profile's `nurseryId` and `childId`. The security
 * rules stamp nothing server-side, and the owning nursery's reads are keyed on
 * the nurseryId the report holds — so before a report lands, the rules verify
 * both ids against the parent profile this one was read from. A report with a
 * foreign id is refused rather than misfiled.
 *
 * `location` is null when the browser refused or could not produce a position —
 * the report is still worth sending, because the time alone tells the nursery
 * where to start looking.
 *
 * `at` uses the Firestore server timestamp, never the device clock: a phone
 * with a wrong time must not be able to make a report look older than it is.
 *
 * `options` is `{ kind, comment }`, passed through to buildFoundReport: a
 * 'scan' when the page opens, a 'lost' report with an optional comment when
 * the finder asks for help.
 */
export async function submitFoundReport(profile, location, options) {
  try {
    // `location` is geolocation.js's `{ lat, lng }` or null; buildFoundReport
    // is the one place that maps it, and the emulator suite files its reports
    // through the same function.
    const payload = buildFoundReport(profile, location, serverTimestamp(), options);

    const reports = collection(db, PUBLIC_PROFILES, profile.id, FOUND_REPORTS);
    // addDoc resolves only once the backend has acknowledged the write, so
    // 'sent' is never reported for a report Firestore refused or never got.
    await addDoc(reports, payload);
    return { status: 'sent' };
  } catch (error) {
    throw new PublicProfileError(error);
  }
}

/**
 * Shapes the stored document into what the page renders.
 *
 * Every field is optional and every field is coerced: the snapshot today is
 * written with only `nurseryId`, `childId`, `name` and `group`, and it may be
 * extended later with `age`, `notes`, `nurseryName` or `nurseryPhone`. A field
 * of an unexpected type is treated as absent instead of crashing the page,
 * because a stranger standing at a gate needs this to render, not throw.
 *
 * `nurseryId` and `childId` are not rendered. They are carried because a filed
 * report has to stamp them — the security rules verify what the page sends
 * against this same document — and they come from Firestore rather than from
 * the URL, because a legacy token link never carried them at all.
 */
function normalizeProfile(id, data) {
  return {
    id,
    nurseryId: asString(data?.nurseryId),
    childId: asString(data?.childId),
    name: asString(data?.name) ?? '',
    group: asString(data?.group) ?? '',
    age: asInt(data?.age),
    notes: asString(data?.notes) ?? '',
    nurseryName: asString(data?.nurseryName) ?? '',
    nurseryPhone: asString(data?.nurseryPhone) ?? '',
    guardianName: asString(data?.guardianName) ?? '',
    guardianPhone: asString(data?.guardianPhone) ?? '',
  };
}

function asString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function asInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * A Firestore failure translated into something a finder can act on.
 *
 * The message is written for a member of the public. No Firebase code, project
 * name or collection path is ever shown to them — those go to the console, for
 * a developer reading the browser's devtools.
 */
export class PublicProfileError extends Error {
  constructor(cause) {
    const code = typeof cause?.code === 'string' ? cause.code : 'unknown';
    super(messageForCode(code));
    this.name = 'PublicProfileError';
    this.code = code;
    console.error('[closeby] Firestore request failed:', code, cause);
  }
}

function messageForCode(code) {
  switch (code) {
    case 'permission-denied':
    case 'unauthenticated':
      return 'This page cannot read the child record right now. Please contact the nursery.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal':
      return 'No connection. Check your internet and try again.';
    default:
      return 'Something went wrong loading this page. Please scan the code again.';
  }
}