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
 */
export function buildFoundReport(profile, position, at) {
  if (typeof profile?.nurseryId !== 'string' || profile.nurseryId === '') {
    throw new Error('The loaded profile has no nurseryId to stamp on the report.');
  }
  if (typeof profile?.childId !== 'string' || profile.childId === '') {
    throw new Error('The loaded profile has no childId to stamp on the report.');
  }

  return {
    at,
    location: toLocation(position),
    nurseryId: profile.nurseryId,
    childId: profile.childId,
  };
}

/** `{ lat, lng }` when the position is usable, null otherwise. */
export function toLocation(position) {
  if (position === null || typeof position !== 'object') return null;

  const { lat, lng } = position;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}
