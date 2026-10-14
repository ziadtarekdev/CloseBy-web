// What a scanned or pasted QR code is allowed to open.
//
// The phone's own camera app is the main way in: it reads the QR, which
// encodes only a URL, and opens it — the page never sees the code itself. The
// in-page scanner and the "paste the link" box on the home page are the
// fallback, and both hand their raw text to this module.
//
// Plain ESM with no Firebase or React import, so the emulator suite can test it
// exactly as the browser runs it.
import { isSafeSegment, profileIdFromQuery } from './childLink.js';

// The hosts a printed CloseBy code can point at. The Flutter app writes
// https://closeby-28cdc.web.app/child?... (ChildrenRepositoryImpl._publicBase);
// the firebaseapp.com alias serves the same site. The page's own host is added
// at call time, so a local or preview build accepts its own links too.
export const CODE_HOSTS = ['closeby-28cdc.web.app', 'closeby-28cdc.firebaseapp.com'];

/**
 * The in-app route for a scanned code, or null if it is not a CloseBy child
 * link.
 *
 * Accepts the two shapes a printed code can carry — `/child?uid=..&id=..` and
 * the legacy `/c/{token}` — and nothing else. The ids are validated with the
 * same rules the child page applies, so a code that passes here resolves to a
 * real document id rather than to "this link is not complete". A QR that holds
 * any other URL (a menu, a payment link, a phishing page) is refused instead
 * of being followed: the page only ever navigates inside itself.
 */
export function routeFromScannedText(text, currentHost = '') {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > 2048) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // Plain http only for the page's own host, which is what a local run is.
  const hosts = currentHost ? [...CODE_HOSTS, currentHost] : CODE_HOSTS;
  if (!hosts.includes(url.host)) return null;
  if (url.protocol === 'http:' && url.host !== currentHost) return null;

  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/child') {
    if (profileIdFromQuery(url.search) === null) return null;
    const params = new URLSearchParams(url.search);
    // Rebuilt from the two ids only, so nothing else in the scanned query
    // string is carried into the app.
    const uid = encodeURIComponent(params.get('uid'));
    const id = encodeURIComponent(params.get('id'));
    return `/child?uid=${uid}&id=${id}`;
  }

  const legacy = /^\/c\/([^/]+)$/.exec(path);
  if (legacy && isSafeSegment(legacy[1])) return `/c/${legacy[1]}`;

  return null;
}

/**
 * Whether this browser can read a QR code from the camera itself: the built-in
 * BarcodeDetector plus camera access. Chrome on Android has both; Safari,
 * Firefox and desktop Chrome on Windows do not, and the home page then points
 * to the phone's camera app instead.
 */
export function canScanInBrowser() {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}
