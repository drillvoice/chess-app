import { createRoot } from "react-dom/client";
import App from "./App";

// Load main CSS file normally - let Vite handle the CSS loading
import "./index.css";

// Import Firebase modules statically to avoid dynamic/static conflict
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Initialize Firebase synchronously
const initializeFirebase = async () => {
  try {
    
    // Initialize Firebase with hardcoded config for this project
    const firebaseConfig = {
      apiKey: "AIzaSyAi_YUEMC5-9-iSKChB2TBCor9hU3b5oDI",
      authDomain: "chess-logger.firebaseapp.com",
      projectId: "chess-logger",
      storageBucket: "chess-logger.firebasestorage.app",
      messagingSenderId: "174377329737",
      appId: "1:174377329737:web:003bfcbb44e2700e290b98",
      measurementId: "G-8J3PQJQCYK"
    };
    
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    // Enable offline persistence
    try {
      await enableIndexedDbPersistence(db);
    } catch (err) {
      console.warn('IndexedDB persistence failed:', err);
    }
    
    // Store globally for access by Firebase utils
    window.__firebaseApp = app;
    window.__firebaseAuth = auth;
    window.__firebaseDB = db;
    
    console.log('Firebase initialized asynchronously');
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
};

// CSS is now loaded directly via import statement above

// Initialize Firebase immediately after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure app starts rendering first
  setTimeout(initializeFirebase, 50);
});

// Register service worker for offline functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
