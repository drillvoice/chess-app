# Fix for manifest.json 404 Issue

## Problem

Firebase hosting is serving `/manifest.json` as HTML instead of JSON due to rewrite rules.

## Solution

### 1. Updated Firebase Configuration

The `firebase.json` file has been updated with:

- Proper Content-Type headers for manifest.json
- Exclusion of static files from rewrite rules

### 2. Deploy the Fix

Run this command to deploy the configuration changes:

```bash
firebase deploy --only hosting --project chess-logger
```

### 3. Alternative: Manual Firebase Console Fix

If CLI deployment fails, you can also fix this in Firebase Console:

1. Go to Firebase Console > Hosting
2. Add hosting configuration for proper Content-Type headers
3. Update rewrite rules to exclude manifest.json

### 4. Test the Fix

After deployment, test with:

```bash
curl -I https://chess-logger.web.app/manifest.json
```

Should return:

```
HTTP/2 200
content-type: application/json
```

### 5. For Bubblewrap

Once fixed, use this URL in Bubblewrap:

```
https://chess-logger.web.app/manifest.json
```

## Current firebase.json Configuration

```json
{
  "hosting": {
    "public": "dist/public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "/manifest.json",
        "headers": [{ "key": "Content-Type", "value": "application/json" }]
      },
      {
        "source": "/sw.js",
        "headers": [{ "key": "Content-Type", "value": "application/javascript" }]
      },
      {
        "source": "**/*.svg",
        "headers": [{ "key": "Content-Type", "value": "image/svg+xml" }]
      }
    ],
    "rewrites": [
      {
        "source": "!/{manifest.json,sw.js,icon-*.png,icon-*.svg}",
        "destination": "/index.html"
      }
    ]
  }
}
```

This excludes manifest.json, sw.js, and icon files from being rewritten to index.html.
