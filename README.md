# Pawn Star Chess Log

A Progressive Web App for tracking chess training sessions with cloud synchronization and offline functionality.

## Features

- **Training Session Logging**: Track tactics, games, and study sessions
- **Cloud Sync**: Firebase Firestore integration for cross-device synchronization with automatic redirect fallback when popups are blocked
- **Offline Support**: Works offline with IndexedDB storage
- **Progressive Web App**: Installable on mobile devices
- **Statistics Dashboard**: Track your progress over time
- **Data Export**: Backup your training data
- **Clear Local Data Option**: Disabling cloud sync retains existing data locally; clear it manually when needed
- **Automatic Lichess Game Import**: Link a Lichess account to automatically add new games to your log

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Storage**: Hybrid system (IndexedDB + Firebase Firestore)
- **UI**: Tailwind CSS with shadcn/ui components
- **Build**: Vite
- **Hosting**: Firebase Hosting

## Environment & Secrets

Local development uses a `.env.local` file that is not committed to version control. Follow these steps to set up your environment:

1. **Create `.env.local`**
   ```bash
   NEXT_PUBLIC_FIREBASE_CLIENT_ID=your-client-id
   ```

2. **Store production secrets with Firebase**
   ```bash
   firebase functions:secrets:set GOOGLE_API_KEY
   ```

3. **Access secrets in Firebase Functions**
   ```ts
   import { defineSecret } from "firebase-functions/params";

   const apiKey = defineSecret("GOOGLE_API_KEY");

   apiKey.value();
   ```

   The Firebase CLI prompts for the secret value during the `firebase functions:secrets:set` command.

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

   The CLI will prompt for any missing secret values when deploying.

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

## Automatic Lichess game import

1. Open **Account → Lichess** and enter your Lichess username.
2. Newly finished games on Lichess are fetched and saved as `game` training sessions.
3. Each imported game stores its duration in minutes, so your statistics dashboard adds this time to `totalHours` automatically.

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