import { createRoot } from "react-dom/client";
import App from "./App";

// Defer non-critical CSS loading to avoid render blocking
const loadNonCriticalCSS = () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/src/index.css';
  link.media = 'print';
  link.onload = () => {
    link.media = 'all';
  };
  document.head.appendChild(link);
};

// Lazy load Firebase to break critical request chain
const initializeFirebase = async () => {
  try {
    // Dynamic import Firebase modules only when needed
    const { initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const { getFirestore, enableIndexedDbPersistence } = await import('firebase/firestore');
    
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

// Load CSS after initial render
requestAnimationFrame(loadNonCriticalCSS);

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
