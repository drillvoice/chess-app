import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAi_YUEMC5-9-iSKChB2TBCor9hU3b5oDI",
  authDomain: "chess-logger.firebaseapp.com",
  projectId: "chess-logger",
  storageBucket: "chess-logger.firebasestorage.app",
  messagingSenderId: "174377329737",
  appId: "1:174377329737:web:003bfcbb44e2700e290b98",
  measurementId: "G-8J3PQJQCYK"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(err => {
  console.warn('IndexedDB persistence failed:', err);
});

export { app, auth, db };
