# Chess Training Logger

A comprehensive Progressive Web App for tracking chess training sessions with cloud synchronization using Firebase.

## Features

- 📱 **Progressive Web App (PWA)**: Install on any device
- 🔄 **Cloud Sync**: Data synchronized across all devices with Firebase Firestore
- 💾 **Offline Support**: Full functionality without internet connection
- 📊 **Statistics Tracking**: Monitor progress and performance
- 🎯 **Goal Setting**: Set and track weekly training goals
- 📈 **Session History**: Complete history of all training sessions
- 🔐 **Anonymous Authentication**: Secure cloud sync without account creation
- 💽 **File System Backup**: Automatic backup to local file system

## Training Types

- **Tactics**: Points gained, final score, notes
- **Games**: Win/loss/draw results, color, platform, time control
- **Study**: Study type, notes, duration
- **Goals**: Weekly goal setting with title and description

## Quick Start

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```

## Firebase Hosting Deployment

### Prerequisites
- Firebase project "chess-logger" already configured
- Firebase CLI installed (already included in dependencies)

### Deploy Steps
1. **Login to Firebase**
   ```bash
   firebase login
   ```

2. **Build and Deploy**
   ```bash
   ./deploy.sh
   ```
   
   Or manually:
   ```bash
   npm run build
   firebase deploy
   ```

3. **Access Your App**
   - Live URL: `https://chess-logger.web.app`
   - Alternative: `https://chess-logger.firebaseapp.com`

### Configuration Files
- `firebase.json`: Firebase hosting configuration
- `.firebaserc`: Firebase project configuration  
- `deploy.sh`: Automated deployment script

## Technology Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack React Query
- **Database**: Firebase Firestore (cloud) + IndexedDB (offline)
- **Authentication**: Firebase Anonymous Auth
- **Build**: Vite + ESBuild
- **Hosting**: Firebase Hosting

## Architecture

### Storage System
- **Hybrid Storage**: Combines IndexedDB (offline) with Firestore (cloud sync)
- **File System Sync**: Automatic backup to user-selected folder
- **Conflict Resolution**: Cloud data takes precedence in sync conflicts

### PWA Features
- Service Worker for offline functionality
- Web App Manifest for installation
- Background sync for data synchronization
- Push notification capability (future feature)

## Environment Variables

For production deployment, the app uses built-in Firebase configuration:
- Project ID: `chess-logger`
- Authentication: Anonymous sign-in enabled
- Firestore: Cloud sync with offline persistence

## Security

- Firebase security rules protect user data
- Anonymous authentication provides security without accounts
- HTTPS enforced automatically by Firebase Hosting
- Client-side validation with server-side backup

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Mobile browsers with PWA support

## File Structure

```
├── client/src/          # React frontend
├── server/             # Express backend (development)
├── shared/             # Shared TypeScript schemas
├── public/             # Static assets and PWA files
├── firebase.json       # Firebase hosting config
├── deploy.sh          # Deployment script
└── FIREBASE_HOSTING_GUIDE.md  # Detailed deployment guide
```

## Development Commands

```bash
# Development server
npm run dev

# Production build
npm run build

# Type checking
npm run check

# Database schema push
npm run db:push

# Firebase deployment
./deploy.sh
```

## Deployment Checklist

- [ ] Firebase project configured
- [ ] Build completes successfully
- [ ] PWA functionality tested
- [ ] Cloud sync working
- [ ] Offline mode tested
- [ ] Mobile responsiveness verified
- [ ] Custom domain configured (optional)

## Support

For detailed deployment instructions, see `FIREBASE_HOSTING_GUIDE.md`.

## License

MIT License