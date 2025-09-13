# Cloud Sync & Persistent Storage

The app uses both local storage and Firebase to keep your training data safe across devices. Some browsers may purge data when storage is low unless you grant **persistent storage** permission. When granted, the browser will retain IndexedDB data and avoid wiping your sessions.

## Persistent Storage Permission

Follow your browser's guidance to allow persistent storage so sessions are not lost when the device is under storage pressure.

## `hasRealLogin` Flag

The app stores a `hasRealLogin` flag in `localStorage` after you sign in. This flag lets the UI know that you previously authenticated. If the session expires, the app can show a **Re‑enable Cloud Sync** prompt instead of the initial **Enable Cloud Sync** option.

## Status Messages

- **"Authentication lost. Re‑enable Cloud Sync"** – your sign‑in expired; sign in again to resume syncing.
- **"Network error. Sync paused"** – the device is offline or unreachable; data will sync automatically when a connection returns or after you retry.

## Troubleshooting

### Storage denied

- Revisit your browser's site settings and grant persistent storage.
- Consider exporting your data as a backup before closing the app.

### Network offline

- Check your internet connection and retry syncing.
- The app queues sessions locally and will sync automatically when online.

### Session expired

- Sign back in with the same account and choose **Re‑enable Cloud Sync**.
- If you cannot sign in, your data remains stored locally until cleared.
