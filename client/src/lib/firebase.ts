import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAi_YUEMC5-9-iSKChB2TBCor9hU3b5oDI",
  authDomain: "chess-logger.firebaseapp.com",
  projectId: "chess-logger",
  storageBucket: "chess-logger.firebasestorage.app",
  messagingSenderId: "174377329737",
  appId: "1:174377329737:web:003bfcbb44e2700e290b98",
  measurementId: "G-8J3PQJQCYK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Enable offline persistence for Firestore
import { enableIndexedDbPersistence } from 'firebase/firestore';

// Enable offline persistence (this will use IndexedDB)
enableIndexedDbPersistence(db, {
  synchronizeTabs: true // Allow multiple tabs to use the same cache
}).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time
    console.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // The current browser doesn't support persistence
    console.warn('Firestore persistence not supported in this browser');
  }
});

export { app };