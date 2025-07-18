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
- **Database**: Firebase Firestore (cloud NoSQL database)
- **Authentication**: Firebase Anonymous Authentication
- **Data Layer**: Direct Firebase utilities for CRUD operations
- **Validation**: Zod schemas shared between frontend and backend
- **Storage**: Firestore-only approach with export/import functionality for data portability

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

### Data Layer Architecture
- **Firebase Utils**: Direct Firestore operations without abstraction layers
- **Authentication**: Streamlined anonymous auth initialization
- **Query Pattern**: React Query with Firebase functions, no fake API layer
- **Performance**: Eliminated complexity from hybrid storage and fake REST endpoints

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
Version numbering: Update to v1.1.2 for next release (incremental fixes/improvements).

## Recent Changes

- July 17, 2025: Mobile modal UI improvements and build optimization
  - Fixed mobile keyboard overlay issues in all modals (tactics, study, game, goal)
  - Improved modal sizing and positioning for better mobile experience
  - Added responsive height adjustments for devices with limited screen space
  - Added touch-friendly button sizes and prevented iOS zoom on form inputs
  - Fixed dynamic/static import conflicts that were causing build warnings
  - Made Firebase modules consistently static imports to avoid conflicts
  - Made firebase-utils.ts consistently dynamic imports for better code splitting
  - Improved build efficiency by eliminating mixed import patterns
  - Created separate firebase-utils chunk for better code organization
  - Build now completes without warnings about module import conflicts

- July 17, 2025: Enhanced UI improvements and visual chart implementation
  - Created visual column chart for weekly activity stats with color-coded activity types
  - Added sequential activity display showing order of completion each day
  - Implemented game duration estimates using time control rules (5+3=7m, 10=12m, 10+5=18m, 15+10=25m)
  - Added color legend for activity types (blue=tactics, green=games, orange=study, purple=goals)
  - Reorganized training history into chronological sections (Today, Yesterday, Earlier)
  - Updated app branding from "Chess Training Logger" to "Pawn Star Chess Log"
  - Set version to v0.1.0b to reflect beta status

- July 16, 2025: CSS loading fix and performance improvement
  - Fixed CSS loading issue that was causing styling problems
  - Replaced complex deferred CSS loading system with direct CSS import
  - Removed duplicate critical.css file to eliminate conflicts
  - Simplified CSS loading to use standard Vite CSS handling
  - App now loads styles correctly without render blocking issues

- July 16, 2025: Bug fix for application startup issues
  - Fixed syntax error in firebase-utils.ts that was causing app startup failures
  - Resolved missing try-catch block structure in subscribeToSessions function
  - App now starts successfully without compilation errors
  - Updated to version 1.1.2 ready for Git push

- July 16, 2025: Performance optimization and CSS inlining implementation
  - Implemented CSS inlining in HTML head to eliminate render blocking requests
  - Added deferred CSS loading for non-critical styles to improve initial page load
  - Started Firebase lazy loading implementation to break critical request chain
  - Added comprehensive error handling for Firebase operations and weekly goals
  - Improved app initialization timing to reduce critical path latency
  - Modified main.tsx to load Firebase asynchronously instead of blocking critical path
  - Enhanced loading states and error boundaries for better user experience

- July 16, 2025: Critical technical debt cleanup and performance optimization
  - Removed unused hybrid storage files: storage.ts, hybridStorage.ts, indexedDB.ts, fileSystemSync.ts
  - Eliminated fake API layer in queryClient.ts that was causing unnecessary complexity
  - Migrated all components to use Firebase utilities directly instead of fake REST endpoints
  - Streamlined Firebase authentication flow by removing duplicate auth methods
  - Updated all modal components (tactics, game, study, goal) to call Firestore directly
  - Updated pages (home, history, dashboard) to use new Firebase utilities
  - Simplified query keys from "/api/xxx" to clean names like "statistics", "sessions"
  - Removed firestoreStorage.ts class in favor of functional Firebase utilities
  - Improved performance by eliminating abstraction layers and fake API calls
  - Cleaned up unused imports and removed technical debt from previous hybrid storage approach
  - Fixed modal UX: replaced serverTimestamp() with direct timestamp for faster saving
  - Modals now close immediately after save operation instead of lingering with "Saving..." state

- July 16, 2025: Architecture improvements and UX enhancements
  - Added comprehensive error boundaries for better error handling
  - Implemented lazy loading for modal components to improve initial page load performance
  - Added skeleton loading states for better user experience during data fetching
  - Implemented real-time Firebase listeners for live data updates
  - Added optimistic updates for tactics modal to provide instant feedback
  - Improved query caching with staleTime configuration for better performance
  - Added Suspense boundaries for lazy-loaded components
  - Fixed modal stuck issue: moved modal close to onMutate for immediate UX response
  - Added timeout protection (10s) to Firebase operations to prevent hanging
  - Added authentication timeout (5s) to prevent infinite waiting
  - Enhanced error handling with better timeout detection and user feedback

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
  - Fixed Firebase App Hosting deployment issues by creating static server configuration
  - Added apphosting.yaml and start-static.js for proper port 8080 container deployment
  - Created troubleshooting guides for both Firebase Hosting and App Hosting
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