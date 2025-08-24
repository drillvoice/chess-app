export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

export async function safeDatabaseOperation<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 10000,
  fallback: T
): Promise<T> {
  try {
    return await withTimeout(operation(), timeoutMs);
  } catch (error) {
    console.error('Database operation failed or timed out:', error);
    return fallback;
  }
}
