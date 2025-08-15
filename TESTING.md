# Testing

## Automated Tests

- `npm test` – runs unit tests with Vitest.
- `npm run test:coverage` – runs unit tests with coverage reporting.
- `npm run test:e2e` – runs Playwright end-to-end tests for Google sign-in/out and Account navigation.

## Manual Cross-Device Verification

1. Deploy or run the app locally and open it on each target device (desktop, tablet, mobile).
2. On each device:
   - Click **Enable Cloud Sync** to sign in with a Google account.
   - Confirm that **Cloud Sync Active** and the user avatar are displayed.
   - Use the navigation bar to go to **Account** and verify that data management options appear.
   - Click **Disable Cloud Sync** and ensure the option returns to **Enable Cloud Sync**.
3. Repeat the sign-in on another device and verify that sessions and goals are consistent across devices.
4. Sign out on all devices to finish the test.
