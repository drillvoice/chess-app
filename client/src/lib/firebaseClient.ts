import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAi_YUEMC5-9-iSKChB2TBCor9hU3b5oDI',
  authDomain: 'chess-logger.firebaseapp.com',
  projectId: 'chess-logger',
  storageBucket: 'chess-logger.firebasestorage.app',
  messagingSenderId: '174377329737',
  appId: '1:174377329737:web:003bfcbb44e2700e290b98',
  measurementId: 'G-8J3PQJQCYK',
};

let appPromise: Promise<FirebaseApp> | undefined;
let authPromise: Promise<Auth> | undefined;
let dbPromise: Promise<Firestore> | undefined;

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = import('firebase/app').then(({ initializeApp, getApps }) => {
      const apps = getApps();
      return apps.length ? apps[0] : initializeApp(firebaseConfig);
    });
  }
  return appPromise;
}

export async function getFirebaseAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = Promise.all([getFirebaseApp(), import('firebase/auth')]).then(
      ([app, authModule]) => {
        const { getAuth, initializeAuth, indexedDBLocalPersistence } = authModule;
        try {
          return getAuth(app);
        } catch {
          return initializeAuth(app, { persistence: indexedDBLocalPersistence });
        }
      },
    );
  }
  return authPromise;
}

export async function getFirestoreDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = Promise.all([getFirebaseApp(), import('firebase/firestore')]).then(
      async ([app, firestore]) => {
        const { getFirestore, enableIndexedDbPersistence } = firestore;
        const db = getFirestore(app);
        try {
          await enableIndexedDbPersistence(db);
        } catch (err) {
          console.warn('IndexedDB persistence failed:', err);
        }
        return db;
      },
    );
  }
  return dbPromise;
}
