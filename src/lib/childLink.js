// The whole URL contract of the public page, in one place.
//
// A scanned QR code opens one of two URLs, and both of them end up resolving to a
// single Firestore document id:
//
//   /child?uid={nurseryId}&id={childId}      the current scheme
//   /c/{token}                               codes printed before the switch
//
// Nothing else in the app builds a document path. Keeping the mapping here means
// there is one place to look when a link stops resolving, and one place where the
// URL-supplied values are checked before they can reach Firestore.

// Joins the nursery id and the child id into one public-profile document id.
//
// `~` is the separator because it is the one character that cannot appear in
// either part: a Firebase Auth uid and a Firestore auto-ID are both base64url,
// so `_` and `-` are both possible inside them. With a separator drawn from that
// same alphabet the mapping would not be injective — nursery "A_B" with child
// "C" and nursery "A" with child "B_C" would both produce "A_B_C", and one
// child's page would show the other's name.
const SEPARATOR = '~';

// A single Firestore document id, or one path segment of one.
//
// Also what an old QR token looks like: a 20-character Firestore auto-ID.
const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

// An assembled profile id: one or two segments, so it covers the current
// `{nurseryId}{separator}{childId}` form and a legacy single token alike.
const PROFILE_ID = /^[A-Za-z0-9_-]{1,128}(?:~[A-Za-z0-9_-]{1,128})?$/;

/**
 * Whether a value can be used as one path segment of a Firestore document path.
 *
 * The check is not decoration. These values arrive from a query string, and a
 * `/` in either would make the concatenated path address a different document
 * than the link intended — `?id=../otherNursery` would walk out of this child's
 * profile and into another one. Firestore rejects the worst of these, but not by
 * accident: relying on that would mean a bad link produced a *wrong child's*
 * page rather than an error.
 */
export function isSafeSegment(value) {
  return typeof value === 'string' && SEGMENT.test(value);
}

/** Whether an assembled profile id is safe to put in a document path. */
export function isSafeProfileId(value) {
  return typeof value === 'string' && PROFILE_ID.test(value);
}

/**
 * The public-profile document id for a child, or null if either part is unusable.
 *
 * Deterministic on purpose: the URL carries the two ids rather than an opaque
 * token, so the document has to be addressable from them alone. Regenerating a
 * QR therefore produces the same URL — see the README for what that costs.
 */
export function profileIdFor(nurseryId, childId) {
  if (!isSafeSegment(nurseryId) || !isSafeSegment(childId)) return null;
  return `${nurseryId}${SEPARATOR}${childId}`;
}

/**
 * Resolves `/child?uid=..&id=..` to a document id, or null for an incomplete link.
 *
 * Null is the answer for every way the query can be wrong — missing `uid`,
 * missing `id`, an empty value, a duplicated parameter, a value containing a
 * slash. They all land on the same "this link is not complete" screen, because
 * to the person holding the phone they are the same problem and none of them is
 * worth a different sentence.
 */
export function profileIdFromQuery(search) {
  const params = new URLSearchParams(search);

  // A repeated parameter means the link was assembled wrong somewhere. `get`
  // would silently take the first, so the ambiguity is refused instead.
  if (params.getAll('uid').length !== 1) return null;
  if (params.getAll('id').length !== 1) return null;

  return profileIdFor(params.get('uid'), params.get('id'));
}
