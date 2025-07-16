# Firebase Hosting Deployment Troubleshooting

## Problem: Cloud Run Error Instead of Firebase Hosting

**Error Message:**
```
Failed. Details: Revision 'chess-app-build-2025-07-16-000' is not ready and cannot serve traffic. 
The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable
```

**Root Cause:**
This error occurs when Firebase CLI tries to deploy to Google Cloud Run instead of Firebase Hosting. This happens when:
1. The project has multiple deployment targets configured
2. The deployment command doesn't specify `--only hosting`
3. There's a Cloud Run configuration in the project

## Solution Steps

### Option 1: Quick Static Deployment
```bash
# Use the static deployment script
./static-deploy.sh
```

### Option 2: Manual Firebase Hosting Setup
```bash
# 1. Login to Firebase
firebase login

# 2. Verify project configuration
firebase projects:list
firebase use chess-logger

# 3. Initialize hosting specifically (if needed)
firebase init hosting

# 4. Deploy only to hosting
firebase deploy --only hosting
```

### Option 3: Reinitialize Firebase Project
```bash
# 1. Remove existing Firebase configuration
rm -f firebase.json .firebaserc

# 2. Initialize fresh Firebase project
firebase init

# Select:
# - Hosting: Configure files for Firebase Hosting
# - Use existing project: chess-logger
# - Public directory: static-build
# - Single-page app: Yes
# - GitHub auto-deploy: No

# 3. Deploy
firebase deploy --only hosting
```

## Key Configuration Files

### Correct firebase.json for Static Hosting
```json
{
  "hosting": {
    "public": "static-build",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

### Correct .firebaserc
```json
{
  "projects": {
    "default": "chess-logger"
  }
}
```

## Common Issues and Solutions

### 1. Wrong Project ID
```bash
# Check current project
firebase projects:list

# Switch to correct project
firebase use chess-logger
```

### 2. Missing Build Directory
```bash
# Create static build directory
mkdir -p static-build
cp -r public/* static-build/
```

### 3. Authentication Issues
```bash
# Re-login to Firebase
firebase logout
firebase login
```

### 4. Cloud Run Configuration Conflict
```bash
# Deploy only to hosting (not Cloud Run)
firebase deploy --only hosting
```

## Verification Steps

After deployment, verify:
1. App loads at https://chess-logger.web.app
2. No server/container errors in logs
3. Static files are served correctly
4. Firebase console shows Hosting (not Cloud Run)

## Firebase Console Verification

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select "chess-logger" project
3. Check "Hosting" section (not "Cloud Run")
4. Verify deployment shows as "Hosting" service

## Alternative: Use Firebase Console UI

If CLI continues to fail:
1. Build your app locally: `npm run build`
2. Go to Firebase Console > Hosting
3. Use the web interface to drag/drop the `dist/public` folder
4. Deploy directly through the console

## Emergency Rollback

If deployment fails:
```bash
# Rollback to previous version
firebase hosting:rollback
```

## Support Resources

- Firebase Hosting Documentation: https://firebase.google.com/docs/hosting
- Firebase CLI Reference: https://firebase.google.com/docs/cli
- Firebase Console: https://console.firebase.google.com/