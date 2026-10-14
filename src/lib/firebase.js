// Firebase Web SDK setup for the public CloseBy child page.
//
// The page is anonymous by design: a stranger holding a printed QR code is not
// signed in and has no account. Everything it is allowed to do is expressed in
// firestore.rules, not here — this module only opens a connection to the one
// project the Flutter app also writes to (closeby-28cdc).
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Matches DefaultFirebaseOptions.web in close_by/lib/firebase_options.dart.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  // Failing here beats failing later: without a config the first Firestore call
  // would reject with an auth error that looks like a server problem, and the
  // person scanning the QR would be told to check their connection.
  throw new Error(
    `Missing Firebase config: ${missing.join(', ')}. Copy .env.example to .env.local and fill it in.`,
  );
}

const app = initializeApp(firebaseConfig);

// getFirestore with no auth: anonymous. Nothing in this app signs anyone in.
export const db = getFirestore(app);

// Local testing only, and opt-in, so that a production build cannot be pointed
// at a local emulator by accident. Set VITE_FIRESTORE_EMULATOR=true, start
// `npm run emulator`, and the page reads seeded data and is judged by the
// proposed security rules instead of whatever is currently deployed. Left unset —
// the normal case — nothing below runs and the SDK talks to closeby-28cdc.
//
// The host and port come from the environment rather than being written here, so
// the one number in firebase.emulator.json is the one that applies.
//
// connectFirestoreEmulator must run before the first read, and this module is
// imported before any page can issue one, so module scope is the right place.
if (import.meta.env.VITE_FIRESTORE_EMULATOR === 'true') {
  connectFirestoreEmulator(
    db,
    import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? '127.0.0.1',
    Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? 8080),
  );
}