# Firebase Hosting Setup Guide for Chess Training Logger

This guide will walk you through deploying your chess training app to Firebase Hosting, making it accessible from anywhere on the web.

## Prerequisites

Before starting, ensure you have:
- A Google account
- Node.js and npm installed
- Firebase CLI installed (`firebase-tools` package is already included)

## Step 1: Firebase Console Setup

### 1.1 Create/Verify Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Your project "chess-logger" should already exist from the Firestore setup
3. If not, click "Add project" and name it "chess-logger"

### 1.2 Enable Firebase Hosting
1. In your Firebase project console, click "Hosting" in the left sidebar
2. Click "Get started" if you haven't used Hosting before
3. Follow the setup wizard (we'll handle the CLI steps below)

## Step 2: Local Setup and Authentication

### 2.1 Login to Firebase
```bash
firebase login
```
This will open a browser window for you to authenticate with your Google account.

### 2.2 Initialize Firebase Hosting (if needed)
The project is already configured with `firebase.json` and `.firebaserc`, but if you need to reinitialize:
```bash
firebase init hosting
```
- Select "Use an existing project"
- Choose "chess-logger"
- Set public directory to: `dist/public`
- Configure as single-page app: `Yes`
- Set up automatic builds: `No`

## Step 3: Build and Deploy

### 3.1 Build the Application
```bash
npm run build
```
This creates optimized production files in the `dist` directory.

### 3.2 Deploy to Firebase Hosting
```bash
firebase deploy
```
Or use the convenient deployment script:
```bash
./deploy.sh
```

## Step 4: Access Your Live App

After successful deployment, your app will be available at:
- **Primary URL**: `https://chess-logger.web.app`
- **Alternative URL**: `https://chess-logger.firebaseapp.com`

## Step 5: Environment Variables for Production

### 5.1 Firebase Configuration
The app is already configured to use your Firebase project:
- Project ID: `chess-logger`
- All Firebase services (Auth, Firestore) are properly configured

### 5.2 Production Environment
Since this is a client-side app, all configuration is built into the application. The Firebase config is already set up for production use.

## Deployment Commands Reference

### Quick Deploy
```bash
# Build and deploy in one command
./deploy.sh
```

### Manual Deploy
```bash
# Build the app
npm run build

# Deploy to Firebase
firebase deploy
```

### Deploy Specific Services
```bash
# Deploy only hosting
firebase deploy --only hosting

# Deploy only Firestore rules/indexes
firebase deploy --only firestore
```

## Firebase Hosting Features

Your deployed app includes:
- **PWA Support**: Users can install the app on their devices
- **Offline Functionality**: Works without internet connection
- **Cloud Sync**: Data syncs across devices when online
- **Custom Domain**: Can be configured in Firebase Console
- **SSL/HTTPS**: Automatic SSL certificate
- **CDN**: Global content delivery network
- **Analytics**: Can be enabled in Firebase Console

## Troubleshooting

### Common Issues

1. **Build Errors**
   ```bash
   # Clear node modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

2. **Firebase Authentication Errors**
   ```bash
   # Re-login to Firebase
   firebase logout
   firebase login
   ```

3. **Deployment Errors**
   ```bash
   # Check Firebase project
   firebase projects:list
   
   # Verify current project
   firebase use chess-logger
   ```

4. **Domain Configuration**
   - Custom domains can be configured in Firebase Console > Hosting
   - DNS configuration required for custom domains

### Monitoring and Management

1. **Firebase Console**: Monitor usage, performance, and errors
2. **Analytics**: Enable Firebase Analytics for user insights
3. **Performance**: Monitor app performance in Firebase Console
4. **Security**: Review Firestore security rules regularly

## Production Checklist

Before deploying to production:
- [ ] Test all app functionality locally
- [ ] Verify Firebase authentication works
- [ ] Test offline functionality
- [ ] Check PWA install prompt
- [ ] Verify cloud sync functionality
- [ ] Test on different devices/browsers
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring and analytics
- [ ] Review security rules

## Updates and Maintenance

### Updating the App
1. Make changes to your code
2. Test locally with `npm run dev`
3. Deploy with `./deploy.sh`

### Monitoring
- Firebase Console provides hosting metrics
- Error monitoring available in Firebase Console
- Performance insights for user experience

### Backup
- Your code is your backup
- Firebase Hosting automatically maintains versions
- Firestore data is automatically backed up by Firebase

## Security Notes

- Firebase security rules protect your Firestore data
- HTTPS is enforced automatically
- Anonymous authentication provides security without user accounts
- Client-side app means all code is publicly viewable

## Support

For issues with:
- **Firebase**: Check Firebase Console status and documentation
- **App functionality**: Debug using browser developer tools
- **Deployment**: Check Firebase CLI logs and status

Your chess training app is now ready for production use with Firebase Hosting!