import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Flutter app writes QR URLs as https://closeby-28cdc.web.app/c/{token},
// so hosting must serve the SPA at /c/* as well as at the root. Firebase
// Hosting does that for any rewrite target, but the dev server needs the same
// history fallback for local testing of a scanned link.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The Firestore SDK is most of the bundle and never changes between
        // deploys, while the page code does. Splitting it means a nursery that
        // reloads after an update does not re-download the SDK.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});