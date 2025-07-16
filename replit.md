# Chess Training Logger

## Overview

This is a full-stack web application for tracking chess training sessions. Built with React on the frontend and Express on the backend, it allows users to log different types of chess training activities including tactics practice, game play, and study sessions. The application provides a mobile-first interface with statistics tracking and session history management.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Validation**: Zod schemas shared between frontend and backend
- **Session Storage**: In-memory storage with export/import functionality for data persistence

### Mobile-First Design
- Responsive design optimized for mobile devices
- Maximum width container with shadow effects
- Touch-friendly interface elements
- Mobile-specific navigation patterns

## Key Components

### Data Models
- **Training Sessions**: Core entity with type discrimination (tactics, game, study)
- **Tactics Sessions**: Points gained, final score, duration tracking
- **Game Sessions**: Result tracking (win/loss), game type classification, comments
- **Study Sessions**: Study type categorization, notes, duration tracking

### Frontend Components
- **Modal System**: Separate modals for each training type with type-specific forms
- **Navigation**: Bottom navigation with active state management
- **Statistics Dashboard**: Real-time stats display with visual indicators
- **History View**: Filterable session history with date formatting
- **UI Components**: Comprehensive shadcn/ui component library integration

### Backend Services
- **Storage Interface**: Abstracted storage layer with memory implementation
- **Route Handlers**: RESTful API endpoints for CRUD operations
- **Validation**: Shared Zod schemas ensure type safety across the stack
- **Error Handling**: Centralized error handling with proper HTTP status codes

## Data Flow

### Session Creation Flow
1. User selects training type from home page
2. Type-specific modal opens with validated form
3. Form data validated using Zod schemas
4. POST request to corresponding endpoint
5. Data stored via storage interface
6. Query cache invalidated to refresh UI
7. Success toast notification displayed

### Statistics Flow
1. Dashboard and home page query statistics endpoint
2. Server aggregates data from all sessions
3. Real-time calculations for metrics like total hours, win rates
4. Auto-refresh every 30 seconds for live updates

### History Management
1. History page fetches all sessions
2. Client-side filtering by session type
3. Chronological sorting with relative date display
4. Color-coded session types for visual distinction

## External Dependencies

### Database
- **Neon Database**: Serverless PostgreSQL provider
- **Drizzle ORM**: Type-safe database operations
- **Migration System**: Schema versioning through Drizzle Kit

### UI Framework
- **shadcn/ui**: Complete component library built on Radix UI
- **Tailwind CSS**: Utility-first styling with design system
- **Lucide React**: Icon library for consistent iconography

### Development Tools
- **Vite**: Fast build tool with HMR support
- **TypeScript**: Full type safety across the stack
- **ESBuild**: Production bundling for server code

## Deployment Strategy

### Firebase Hosting Production
1. **Frontend**: Vite builds React app to `dist/public`
2. **Database**: Firebase Firestore (cloud) + IndexedDB (offline)
3. **Authentication**: Firebase Anonymous Auth
4. **Hosting**: Firebase Hosting with CDN, SSL, and custom domain support

### Build Process
```bash
npm run build              # Build frontend to dist/public
firebase deploy           # Deploy to Firebase Hosting
```

### Environment Configuration
- **Development**: TSX for hot reloading, hybrid storage
- **Production**: Firebase Hosting, Firestore cloud sync
- **URLs**: https://chess-logger.web.app (primary), https://chess-logger.firebaseapp.com (alternate)

### Deployment Files
- `firebase.json`: Firebase hosting configuration
- `.firebaserc`: Firebase project configuration
- `deploy.sh`: Automated deployment script
- `README.md`: Production deployment guide
- `FIREBASE_HOSTING_GUIDE.md`: Detailed hosting instructions

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

- July 15, 2025: Complete Firebase integration and hosting setup
  - Successfully integrated Firebase Firestore cloud sync with hybrid storage system
  - Fixed React import conflicts by carefully implementing Firebase step-by-step
  - Created hybrid storage combining IndexedDB (offline) with Firestore (cloud sync)
  - Added Firebase authentication with anonymous sign-in for secure cloud access
  - Implemented real-time data synchronization across devices
  - Added cloud sync controls and force sync functionality in data management
  - Maintained offline-first approach with automatic file system backup
  - Enhanced PWA with seamless cloud backup and cross-device synchronization
  - Prepared complete Firebase hosting deployment with detailed guides
  - Created firebase.json, .firebaserc, and deploy.sh for easy deployment
  - Added comprehensive README.md and FIREBASE_HOSTING_GUIDE.md
  - Ready for production deployment to https://chess-logger.web.app

- July 08, 2025: Enhanced training session logging with additional fields
  - Added tactics notes field for quick observations
  - Added game logging fields: player colour selection (white/black), platform (lichess/chess.com/otb), time control buttons (5+3, 10+5, 10, 15+10)
  - Added weekly goal setting feature with title and description
  - Updated schema to support all new fields
  - Added goal filtering in history page
  - Fixed TypeScript errors in storage layer
  - Refined UI based on user feedback: removed redundant "game type" field, reordered fields with "Colour" first, made time controls fully optional and deselectable
  - Implemented weekly goal display on homescreen with automatic detection of week-old goals and prompts for new goals
  - Added prompt to set weekly goal when no goal currently exists
  - Added data export/backup functionality to save training data as downloadable files, providing free alternative to paid database services
  - Converted to Progressive Web App (PWA) with offline functionality for mobile installation
  - Added localStorage-based offline storage system for complete offline functionality
  - Implemented service worker for app caching and offline access
  - Added install prompt for "Add to Home Screen" functionality on mobile devices
  - Fixed PWA validation errors: manifest JSON syntax, service worker registration, required fields
  - Added proper Content-Type headers for PWA files (manifest.json, sw.js)
  - Created PWA test page for validation and troubleshooting
  - Fixed Content-Type error for PWA Builder: SVG icons now serve with correct image/svg+xml headers
  - Added PNG icon alternatives and proper routes for Google Play Store packaging compatibility
  - Upgraded storage from localStorage to IndexedDB for more reliable data persistence
  - Implemented automatic data migration from localStorage to IndexedDB
  - Added fallback mechanism: uses IndexedDB when available, falls back to localStorage if needed
  - Enhanced PWA with better offline data reliability and larger storage capacity
  - Added `navigator.storage.persist()` calls for maximum data protection against browser cleanup
  - Implemented storage quota monitoring for usage tracking and optimization
  - Enhanced game logging to include draw results alongside wins and losses
  - Updated statistics calculations to properly track wins, draws, and losses
  - Modified history display to show draws with appropriate color coding
  - Implemented automatic file system synchronization using File System Access API
  - Added bulletproof data persistence by auto-saving to user-selected folder
  - Created file system sync controls in data management interface
  - Added automatic data restoration from file system on app startup

## Changelog

Changelog:
- July 08, 2025. Initial setup