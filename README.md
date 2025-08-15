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

## Testing

Run the test suites to verify functionality:

```bash
npm test         # Unit tests with Vitest
npm run test:e2e # End-to-end tests with Playwright
```

See [TESTING.md](TESTING.md) for additional details.

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

## Lichess Integration

### Setup
1. Navigate to **Account → Lichess** in the app
2. Enter your Lichess username (3-20 characters, letters, numbers, underscores, hyphens only)
3. Click "Save" to store your username

### Features
- Automatic import of newly finished games from Lichess
- Games are saved as `game` training sessions with duration tracking
- Imported time contributes to your total training hours in statistics
- Works offline - settings are cached locally and synced when online

### Troubleshooting
- **"Failed to save username"**: Check your internet connection and try again
- **"Could not load username"**: Your username is still saved locally, it will sync when connection is restored
- **Validation errors**: Username must be 3-20 characters and contain only letters, numbers, underscores, and hyphens
- **No games importing**: Verify your username is correct and you have recent games on Lichess

### Privacy
- Only your username is stored, no passwords or personal data
- Username is used solely to fetch your public game history from Lichess API

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
