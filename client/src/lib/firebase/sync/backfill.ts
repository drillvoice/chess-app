import type { TrainingSession } from '@shared/schema';

export interface BackfillProgress {
  processed: number;
  total: number;
  uploadedCount: number;
  failedCount: number;
}

export interface BackfillWorkerOptions {
  concurrency?: number;
  perItemTimeoutMs?: number;
  onProgress?: (progress: BackfillProgress) => void;
  onFailure?: (detail: string, samples: string[]) => void;
}

export interface BackfillWorkerResult {
  uploadedCount: number;
  failedCount: number;
  failureSamples: string[];
}

export function formatSyncError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? `${code}: ${error.message}` : error.message;
  }
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    if (typeof code === 'string' && typeof message === 'string') {
      return `${code}: ${message}`;
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Unknown sync error';
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function backfillSessionsToCloud(
  sessionsToUpload: TrainingSession[],
  uploadSession: (session: TrainingSession) => Promise<void>,
  options: BackfillWorkerOptions = {},
): Promise<BackfillWorkerResult> {
  const concurrency = options.concurrency ?? 4;
  const perItemTimeoutMs = options.perItemTimeoutMs ?? 15000;
  if (sessionsToUpload.length === 0) {
    return { uploadedCount: 0, failedCount: 0, failureSamples: [] };
  }

  const queue = [...sessionsToUpload];
  let uploadedCount = 0;
  let failedCount = 0;
  let processed = 0;
  const total = sessionsToUpload.length;
  const failureSamples: string[] = [];

  const emitProgress = () => {
    options.onProgress?.({
      processed,
      total,
      uploadedCount,
      failedCount,
    });
  };

  emitProgress();

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const session = queue.shift();
      if (!session) continue;
      try {
        await withTimeout(
          uploadSession(session),
          perItemTimeoutMs,
          `Timed out uploading session ${session.id}`,
        );
        uploadedCount += 1;
      } catch (error) {
        failedCount += 1;
        const detail = `Session ${session.id}: ${formatSyncError(error)}`;
        if (failureSamples.length < 10 && !failureSamples.includes(detail)) {
          failureSamples.push(detail);
        }
        options.onFailure?.(detail, [...failureSamples]);
        console.warn(`Failed to backfill local-only session ${session.id} to cloud`, error);
      } finally {
        processed += 1;
        emitProgress();
      }
    }
  });

  await Promise.all(workers);
  return { uploadedCount, failedCount, failureSamples };
}
