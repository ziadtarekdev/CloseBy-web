// Remembers, on this phone only, that a report was already sent for a child.
//
// sessionStorage, not localStorage: the memory belongs to the finder's visit —
// a reload or a second look at the page — not to the device forever. It holds
// a time per public-profile id and nothing else: no location, no name. It is a
// convenience for the person holding the phone, never a source of truth; the
// nursery's record is the report in Firestore. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded and a failure
// simply means nothing is remembered.

const KEY = 'closeby:sent:';

// Long enough to cover a finder reloading or coming back to the tab while
// they wait; short enough that a second, separate sighting later in the day
// is offered as a fresh report.
const REMEMBER_MS = 30 * 60 * 1000;

export function rememberReport(profileId, at) {
  try {
    sessionStorage.setItem(KEY + profileId, at.toISOString());
  } catch {
    // Not remembered; the report itself is unaffected.
  }
}

/** When a report was sent for this profile in this visit, or null. */
export function recallReport(profileId, now = Date.now()) {
  if (typeof profileId !== 'string' || profileId === '') return null;
  try {
    const raw = sessionStorage.getItem(KEY + profileId);
    if (!raw) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime()) || now - at.getTime() > REMEMBER_MS) {
      sessionStorage.removeItem(KEY + profileId);
      return null;
    }
    return at;
  } catch {
    return null;
  }
}

export function forgetReport(profileId) {
  try {
    sessionStorage.removeItem(KEY + profileId);
  } catch {
    // Nothing to forget.
  }
}
