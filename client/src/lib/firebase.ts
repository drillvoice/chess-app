// Lazy-loaded Firebase instances - initialized asynchronously in main.tsx
declare global {
  interface Window {
    __firebaseApp?: any;
    __firebaseAuth?: any;
    __firebaseDB?: any;
  }
}

// Wait for Firebase to be initialized
const waitForFirebase = async (maxRetries = 100, delay = 100): Promise<void> => {
  for (let i = 0; i < maxRetries; i++) {
    if (window.__firebaseApp && window.__firebaseAuth && window.__firebaseDB) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('Firebase initialization timeout - please refresh the page');
};

// Get Firebase instances with lazy loading
export const getFirebaseInstances = async () => {
  await waitForFirebase();
  return {
    app: window.__firebaseApp,
    auth: window.__firebaseAuth,
    db: window.__firebaseDB,
  };
};

// Backward compatibility exports with lazy loading
export const db = new Proxy({}, {
  get: async () => {
    const instances = await getFirebaseInstances();
    return instances.db;
  }
});

export const auth = new Proxy({}, {
  get: async () => {
    const instances = await getFirebaseInstances();
    return instances.auth;
  }
});

export const app = new Proxy({}, {
  get: async () => {
    const instances = await getFirebaseInstances();
    return instances.app;
  }
});