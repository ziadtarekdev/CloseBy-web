// Wraps the browser Geolocation API so the page deals in outcomes rather than
// in spec error codes.

const TIMEOUT_MS = 8000;

// The spec's `timeout` only starts once permission has been granted. A finder
// who neither allows nor blocks the prompt — or a browser that never shows it —
// would otherwise leave the report stuck on "Getting your location…" forever,
// so the whole request is also capped from the outside. Longer than TIMEOUT_MS
// so a finder who taps "Allow" a few seconds late still gets a fix.
const HARD_CAP_MS = 15000;

/**
 * Asks for the finder's position.
 *
 * Resolves to `{ lat, lng }` on success and to `null` for every failure —
 * permission denied, position unavailable, insecure origin, a prompt left
 * unanswered, or a browser without the API. A report with no location is still
 * a useful report, so nothing here throws.
 */
export function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(cap);
      resolve(value);
    };
    const cap = setTimeout(() => settle(null), HARD_CAP_MS);

    navigator.geolocation.getCurrentPosition(
      (position) =>
        settle({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      // Code 1 is PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT. All three
      // end the same way for the person holding the phone: the report goes out
      // without coordinates.
      () => settle(null),
      {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        // Age 0 forces a fresh fix rather than a cached one from the last time
        // the browser was asked.
        maximumAge: 0,
      },
    );
  });
}
