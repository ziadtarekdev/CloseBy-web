// The sighting report a finder files, built in one place.
//
// Plain ESM with no Firebase import, like childLink.js, so the emulator suite in
// scripts/local-test.mjs can build its reports with this exact function rather
// than with a hand-written copy of the payload. A hand-written copy is how the
// page once sent `location.latitude` for a position that only ever carried
// `lat`, while the suite — writing `{ lat, lng }` itself — kept passing.

/**
 * The Firestore payload for one sighting.
 *
 * `position` is what geolocation.js resolves to: `{ lat, lng }`, or null when
 * the finder refused or the browser could not produce a fix. Anything else —
 * a missing or non-finite coordinate, or one outside the valid range — is sent
 * as `location: null` rather than as a broken object. The security rules reject
 * a location with any other shape, so a malformed position would otherwise cost
 * the nursery the whole report instead of just the coordinates.
 *
 * `at` is passed in rather than created here so this module stays free of the
 * Firebase SDK: the page passes `serverTimestamp()`, never the device clock,
 * and the rules require it to equal the server's request time.
 *
 * `nurseryId` and `childId` come from the profile the page loaded, never from
 * the URL — a legacy `/c/{token}` link does not carry them at all, and the
 * rules compare both against that same parent profile.
 *
 * `kind` is 'scan' for the alert the page files on its own when it opens, and
 * 'lost' for a finder pressing "This child is lost". A scan never carries a
 * location or a comment — nobody was asked for either, and the rules refuse
 * them — so both are dropped here rather than costing the nursery the alert.
 * A lost report carries the finder's comment, trimmed and capped at
 * COMMENT_MAX, and only when there is one.
 */
export function buildFoundReport(profile, position, at, { kind = 'lost', comment = '' } = {}) {
  if (typeof profile?.nurseryId !== 'string' || profile.nurseryId === '') {
    throw new Error('The loaded profile has no nurseryId to stamp on the report.');
  }
  if (typeof profile?.childId !== 'string' || profile.childId === '') {
    throw new Error('The loaded profile has no childId to stamp on the report.');
  }

  if (kind !== 'scan' && kind !== 'lost') {
    throw new Error(`Unknown report kind: ${kind}`);
  }

  const report = {
    at,
    location: kind === 'scan' ? null : toLocation(position),
    nurseryId: profile.nurseryId,
    childId: profile.childId,
    kind,
  };

  const note = typeof comment === 'string' ? comment.trim().slice(0, COMMENT_MAX) : '';
  if (kind === 'lost' && note !== '') report.comment = note;

  return report;
}

/** The longest comment the rules accept on a lost report. */
export const COMMENT_MAX = 500;

/** `{ lat, lng }` when the position is usable, null otherwise. */
export function toLocation(position) {
  if (position === null || typeof position !== 'object') return null;

  const { lat, lng } = position;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}
