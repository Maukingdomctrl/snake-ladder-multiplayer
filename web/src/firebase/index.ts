import { initializeApp, FirebaseOptions, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase web config is public by design (it ships in the bundle); env vars
// can override it, e.g. to point a preview build at another project.
const env = import.meta.env;
const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyAZXQjhsh0ohB7VFhoHgumIM2gvX2s-EZo",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "snake-ladder-maukingdom.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "snake-ladder-maukingdom",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "snake-ladder-maukingdom.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "259745491690",
  appId: env.VITE_FIREBASE_APP_ID || "1:259745491690:web:85f90d7245c1b8ec3f0593",
};

let db: Firestore;
const isFirstInit = getApps().length === 0;
const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

if (isFirstInit) {
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} else {
  // App already exists (Vite HMR hot reload)
  db = getFirestore(app);
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export { app, db, auth, googleProvider };
