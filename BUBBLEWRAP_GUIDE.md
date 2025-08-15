# Bubblewrap TWA Deployment Guide for PawnStar Chess Log

This guide will help you create a Trusted Web Activity (TWA) Android app from your Firebase-hosted PWA using Bubblewrap.

## Prerequisites

1. **Deploy to Firebase first**:

   ```bash
   npm run build
   firebase deploy
   ```

   Your app will be available at: https://chess-logger.web.app

2. **Install Bubblewrap**:

   ```bash
   npm install -g @bubblewrap/cli
   ```

3. **Java Development Kit (JDK) 11 or higher**

## Step 1: Initialize Bubblewrap

Run the init command with your Firebase URL:

```bash
bubblewrap init --manifest=https://chess-logger.web.app/manifest.json
```

When prompted, use these settings:

- **Domain**: chess-logger.web.app
- **Application name**: Pawn Star Chess Log
- **Short name**: Pawn Star
- **Theme color**: #1a2b3d
- **Background color**: #1a2b3d
- **Start URL**: https://chess-logger.web.app/?utm_source=pwa
- **Display mode**: standalone
- **Orientation**: portrait
- **Status bar color**: #1a2b3d
- **Splash screen color**: #1a2b3d
- **Icon URL**: Use the default (it will fetch from manifest)
- **Maskable icon URL**: Use the default
- **Signing key**: Create new or use existing

## Step 2: Build the APK

```bash
bubblewrap build
```

This will create:

- `app-release-signed.apk` - Ready for distribution
- `app-release-unsigned.apk` - Unsigned version

## Step 3: Test the APK

Install on your Android device:

```bash
adb install app-release-signed.apk
```

Or transfer the APK to your phone and install manually.

## Step 4: Prepare for Google Play Store

1. **Digital Asset Links**: Create `.well-known/assetlinks.json` in your public folder:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.web.chesstraining",
      "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
    }
  }
]
```

2. **Get your SHA256 fingerprint**:

```bash
keytool -list -v -keystore android.keystore -alias android
```

3. **Deploy the assetlinks.json**:

```bash
firebase deploy
```

## Troubleshooting

### Manifest.json Content-Type Issues

The Firebase configuration is already set up to serve manifest.json with the correct `Content-Type: application/json` header. If you still encounter issues:

1. Check the response headers:

```bash
curl -I https://chess-logger.web.app/manifest.json
```

2. Verify the Content-Type shows as `application/json`

### Icon Issues

All icons are properly configured in multiple sizes. Bubblewrap will automatically use:

- `/icon-512.png` for the main app icon
- `/icon-192.png` for smaller displays
- Both are marked as "maskable" for adaptive icons

### Common Errors

1. **"Failed to fetch manifest"**: Ensure your Firebase deployment is complete and the URL is accessible.

2. **"Invalid manifest"**: Check that manifest.json is valid JSON using a JSON validator.

3. **"Missing icons"**: All icon paths in manifest.json must be absolute (starting with `/`).

## Updating the TWA

When you update your PWA:

1. Increment the version in `twa-manifest.json`
2. Rebuild: `bubblewrap build`
3. Update on Play Store

## Additional Resources

- [Bubblewrap Documentation](https://github.com/GoogleChromeLabs/bubblewrap)
- [TWA Quality Criteria](https://web.dev/using-a-pwa-in-your-android-app/)
- [Firebase Hosting Headers](https://firebase.google.com/docs/hosting/full-config#headers)
