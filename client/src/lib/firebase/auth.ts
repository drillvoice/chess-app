export { ensureAuthentication } from './core';

// Stub functions for backward compatibility
export async function refreshAuthState(): Promise<void> {
  console.log('refreshAuthState called - no-op in backup-only mode');
}

export async function getCurrentUserId(): Promise<string | null> {
  console.log('getCurrentUserId called - returning null in backup-only mode');
  return null;
}

export async function startAuthFlow(): Promise<void> {
  console.log('startAuthFlow called - no-op in backup-only mode');
}

export async function stopSessionSync(): Promise<void> {
  console.log('stopSessionSync called - no-op in backup-only mode');
}

export async function startSessionSync(): Promise<void> {
  console.log('startSessionSync called - no-op in backup-only mode');
}
