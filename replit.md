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

### Build Process
1. **Frontend**: Vite builds React app to `dist/public`
2. **Backend**: ESBuild bundles server code to `dist/index.js`
3. **Database**: Drizzle migrations applied via `db:push` command

### Environment Configuration
- **Development**: TSX for hot reloading, in-memory storage
- **Production**: Compiled JavaScript, PostgreSQL database
- **Database URL**: Required environment variable for database connection

### Replit Integration
- **Development Banner**: Automatic development environment detection
- **Error Overlay**: Runtime error modal for development
- **Hot Reloading**: Full-stack development with automatic restarts

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

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

## Changelog

Changelog:
- July 08, 2025. Initial setup