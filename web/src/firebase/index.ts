// web/src/firebase/index.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your actual Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAZXQjhsh0ohB7VFhoHgumIM2gvX2s-EZo",
  authDomain: "snake-ladder-maukingdom.firebaseapp.com",
  projectId: "snake-ladder-maukingdom",
  storageBucket: "snake-ladder-maukingdom.firebasestorage.app",
  messagingSenderId: "259745491690",
  appId: "1:259745491690:web:85f90d7245c1b8ec3f0593",
  measurementId: "G-2GYGRH7H0Q"
};

// Initialize Firebase for the browser
const app = initializeApp(firebaseConfig);

// Export Firestore so your game can talk to the database
export const db = getFirestore(app);