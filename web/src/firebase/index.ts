import { initializeApp, FirebaseOptions, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";

// Firebase web config is public by design (it ships in the bundle), so it lives
// here rather than in env vars — old VITE_FIREBASE_* values left in .env.local
// or on Vercel used a key that can't do sign-in.
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAZXQjhsh0ohB7VFhoHgumIM2gvX2s-EZo",
  authDomain: "snake-ladder-maukingdom.firebaseapp.com",
  projectId: "snake-ladder-maukingdom",
  storageBucket: "snake-ladder-maukingdom.firebasestorage.app",
  messagingSenderId: "259745491690",
  appId: "1:259745491690:web:85f90d7245c1b8ec3f0593",
};

// Local development against the Firebase emulators (see README). A demo-*
// project id can never reach the real project.
const useEmulators = Boolean(import.meta.env.VITE_FIREBASE_EMULATORS);
if (useEmulators) firebaseConfig.projectId = "demo-snake-ladder";

let db: Firestore;
const isFirstInit = getApps().length === 0;
const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

if (isFirstInit) {
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} else {
  // App already exists (Vite HMR hot reload)
  db = getFirestore(app);
}

// initializeAuth (instead of getAuth) skips the Google popup/redirect helper,
// which we don't use, and falls back to in-memory storage when a browser
// (incognito, in-app webviews) blocks IndexedDB/localStorage.
const auth = isFirstInit
  ? initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
    })
  : getAuth(app);

if (isFirstInit && useEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

export { app, db, auth };
