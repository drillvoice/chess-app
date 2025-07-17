# Pawn Star Chess Log

A Progressive Web App for tracking chess training sessions with cloud synchronization and offline functionality.

## Features

- **Training Session Logging**: Track tactics, games, and study sessions
- **Cloud Sync**: Firebase Firestore integration for cross-device synchronization
- **Offline Support**: Works offline with IndexedDB storage
- **Progressive Web App**: Installable on mobile devices
- **Statistics Dashboard**: Track your progress over time
- **Data Export**: Backup your training data

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Storage**: Hybrid system (IndexedDB + Firebase Firestore)
- **UI**: Tailwind CSS with shadcn/ui components
- **Build**: Vite
- **Hosting**: Firebase Hosting

## Firebase Hosting Deployment

This app is configured for Firebase Hosting deployment (static hosting), not Firebase App Hosting.

### Prerequisites

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

### Deploy to Firebase Hosting

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Deploy to Firebase Hosting:**
   ```bash
   firebase deploy --only hosting
   ```

   Or use the deployment script:
   ```bash
   ./deploy.sh
   ```

### Configuration Files

- `firebase.json` - Firebase Hosting configuration
- `.firebaserc` - Firebase project configuration
- `deploy.sh` - Automated deployment script

### Live URLs

- Primary: https://chess-logger.web.app
- Alternative: https://chess-logger.firebaseapp.com

## Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── lib/          # Storage and Firebase logic
│   │   └── hooks/        # Custom React hooks
├── server/                # Express backend (dev only)
├── shared/               # Shared types and schemas
├── public/               # PWA assets
├── firebase.json         # Firebase Hosting config
└── deploy.sh            # Deployment script
```

## Storage System

The app uses a hybrid storage approach:

- **IndexedDB**: Primary offline storage
- **Firebase Firestore**: Cloud sync for cross-device access
- **File System API**: Optional local backup

## PWA Features

- Offline functionality
- Install prompt for mobile devices
- Service worker for caching
- App-like experience on mobile

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License