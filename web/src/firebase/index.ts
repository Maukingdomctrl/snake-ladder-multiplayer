// web/src/firebase/index.ts
import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAZXQjhsh0ohB7VFhoHgumIM2gvX2s-EZo",
  authDomain: "snake-ladder-maukingdom.firebaseapp.com",
  projectId: "snake-ladder-maukingdom",
  storageBucket: "snake-ladder-maukingdom.firebasestorage.app",
  messagingSenderId: "259745491690",
  appId: "1:259745491690:web:85f90d7245c1b8ec3f0593",
  measurementId: "G-2GYGRH7H0Q"
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});
