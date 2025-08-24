# Development Instructions & Preferences

## Project Overview
This is a **chess training app** built with React, TypeScript, and Firebase. It's a PWA (Progressive Web App) with offline capabilities, focusing on tracking chess training sessions, tactics, and study goals.

## Tech Stack & Architecture

### Core Technologies
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Radix UI components
- **State Management**: TanStack Query (React Query) + React hooks
- **Backend**: Firebase (Firestore, Auth, Hosting)
- **Database**: Firestore + IndexedDB (offline storage)
- **Testing**: Vitest + Playwright
- **Build**: Vite + esbuild
- **Deployment**: Firebase Hosting

### Project Structure
```
chess-app/
├── client/src/          # React frontend
│   ├── components/      # UI components (shadcn/ui + custom)
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilities, Firebase, storage
│   ├── pages/          # Route components
│   └── types/          # TypeScript definitions
├── server/             # Express backend (dev only)
├── shared/             # Shared schemas and types
├── public/             # PWA assets and manifest
└── tests/              # E2E tests
```

## Coding Standards & Preferences

### TypeScript Configuration
- **Strict mode enabled** - No compromises on type safety
- **Path aliases**: `@/*` for client/src, `@shared/*` for shared
- **Module resolution**: Bundler mode with ESNext
- **JSX**: Preserve mode for Vite

### React Patterns
- **Functional components** with hooks only
- **Explicit imports** - Always import React hooks explicitly:
  ```typescript
  import { useState, useEffect, useCallback, useMemo } from 'react';
  ```
- **Custom hooks** for complex logic and state management
- **Error boundaries** for graceful error handling
- **Lazy loading** for route components and heavy features

### Component Structure
- **Props interface** at the top of each component
- **Validation functions** before component definition
- **Local state** for form handling and validation
- **useMemo/useCallback** for performance optimization
- **Consistent naming**: camelCase for variables, PascalCase for components

### State Management
- **TanStack Query** for server state and caching
- **React hooks** for local component state
- **Custom hooks** for complex state logic
- **Offline-first** approach with IndexedDB fallback

### Styling Approach
- **Tailwind CSS** for utility-first styling
- **Radix UI** components for accessibility
- **CSS variables** for theming (dark/light mode)
- **Responsive design** with mobile-first approach
- **Consistent spacing** using Tailwind's spacing scale

### Form Handling
- **React Hook Form** for complex forms
- **Zod validation** for type-safe form validation
- **Real-time validation** with immediate feedback
- **Error states** clearly displayed to users

## Testing Strategy

### Unit Testing
- **Vitest** as the test runner
- **React Testing Library** for component testing
- **Mocking** for external dependencies (Firebase, etc.)
- **Test files** co-located with source files (`.test.tsx`)
- **Coverage reporting** with v8 provider

### E2E Testing
- **Playwright** for end-to-end testing
- **Cross-device verification** for PWA functionality
- **Authentication flows** testing
- **Offline functionality** testing

### Test Patterns
- **Arrange-Act-Assert** pattern
- **Descriptive test names** that explain the scenario
- **Setup/teardown** with beforeEach/afterEach
- **Mock cleanup** to prevent test pollution

## Code Quality & Validation

### Pre-commit Checks
```bash
npm run validate  # Runs type-check + lint + test
```

### Linting Rules
- **ESLint** with TypeScript and React plugins
- **Import validation** to catch missing imports
- **React hooks rules** enforcement
- **Accessibility** rules with jsx-a11y
- **Prettier** for consistent formatting

### Common Issues to Avoid
1. **Missing React imports** - Always import hooks explicitly
2. **Unused variables** - Use underscore prefix for ignored vars
3. **Missing dependencies** in useEffect/useCallback
4. **Type safety** - No `any` types, use proper interfaces

## Firebase Integration

### Authentication
- **Google Sign-in** as primary auth method
- **Anonymous auth** as fallback
- **Auth state persistence** across sessions
- **User settings** stored in Firestore

### Data Management
- **Offline-first** with IndexedDB caching
- **Real-time sync** when online
- **Conflict resolution** for offline changes
- **Data export/import** functionality

### Security
- **Firestore rules** for data access control
- **User-specific data** isolation
- **Input validation** on both client and server

## PWA Features

### Service Worker
- **Cache-first** strategy for static assets
- **Network-first** for API calls
- **Background sync** for offline actions
- **Push notifications** support

### Manifest
- **App icons** in multiple sizes
- **Theme colors** for browser UI
- **Display mode** set to standalone
- **Orientation** locked to portrait for mobile

## Performance Considerations

### Optimization
- **Code splitting** with lazy loading
- **Bundle analysis** and optimization
- **Image optimization** and lazy loading
- **Critical CSS** inlining

### Caching Strategy
- **Service worker** for static assets
- **React Query** for API data
- **IndexedDB** for offline storage
- **Memory management** for large datasets

## Deployment & CI/CD

### Build Process
```bash
npm run build  # Builds client and server
npm run deploy # Deploys to Firebase Hosting
```

### Environment Management
- **Development** server with hot reload
- **Production** build optimization
- **Environment variables** for configuration
- **Feature flags** for gradual rollouts

### Monitoring
- **Error tracking** with error boundaries
- **Performance monitoring** with web vitals
- **User analytics** for feature usage
- **Crash reporting** for debugging

## User Context & Communication Style

### Important: AI-Generated Codebase
- **All code is written by AI** - The user is smart but not a professional coder
- **Risk assessment is crucial** - Always flag potential breaking changes or high-risk modifications
- **Complexity communication** - Explain the scope and complexity of changes clearly
- **Conservative approach** - Prefer smaller, safer changes over large refactors
- **Testing emphasis** - Always suggest testing for any changes, especially risky ones

### Development Workflow
- **Windows environment** with PowerShell
- **VS Code** as primary editor
- **Git** for version control
- **Firebase CLI** for deployment

### Code Organization
- **Feature-based** file organization
- **Shared types** in dedicated directory
- **Utility functions** in lib directory
- **Component composition** over inheritance

### Quality Standards
- **Type safety** is non-negotiable
- **Accessibility** is a priority
- **Performance** matters for mobile users
- **Offline functionality** is essential

### Communication Guidelines
- **Clear and concise** code comments
- **Descriptive variable names**
- **Consistent formatting** across files
- **Documentation** for complex logic
- **Always explain complexity** - Don't assume the user knows how complex something is
- **Flag risks explicitly** - If something could break, say so clearly
- **Suggest alternatives** - For risky changes, provide safer alternatives
- **Break down large changes** - Suggest incremental approaches when possible

## Core Coding Principles

### Function & Component Design
- **Single responsibility** - Each function/component should do one thing well
- **Descriptive naming** - Names should clearly indicate purpose (e.g., `validateGoalInput`, `handleSaveSettings`)
- **Small and focused** - Keep functions under 20-30 lines when possible
- **Type safety first** - Always use proper TypeScript interfaces and avoid `any`

### Code Documentation
- **JSDoc comments** for complex functions explaining parameters, returns, and edge cases
- **Inline comments** only for non-obvious business logic or complex algorithms
- **Component purpose** - Brief comment explaining what each component does
- **Example usage** - Show how to use complex utilities or hooks

### Error Handling & Validation
- **Defensive programming** - Always validate inputs and handle edge cases
- **User-friendly errors** - Display meaningful error messages to users
- **Graceful degradation** - App should work even when parts fail
- **Error boundaries** - Catch and handle React errors gracefully

### Code Organization
- **Logical grouping** - Related functions and components together
- **Consistent patterns** - Follow established patterns in the codebase
- **Separation of concerns** - Keep UI, business logic, and data access separate
- **Reusable utilities** - Extract common logic into shared functions

### Testing & Reliability
- **Testable code** - Write functions that are easy to test in isolation
- **Mock external dependencies** - Don't let tests depend on Firebase, network, etc.
- **Edge case coverage** - Test error conditions and boundary values
- **Integration testing** - Test how components work together

### Performance & Maintainability
- **Avoid premature optimization** - Write clear code first, optimize when needed
- **Memory management** - Clean up event listeners, timers, and subscriptions
- **Bundle size awareness** - Be mindful of import sizes and code splitting
- **Readable over clever** - Prefer clear, obvious code over clever solutions

## Common Patterns & Solutions

### Modal Components
- **Controlled state** with isOpen prop
- **Backdrop click** to close
- **Escape key** handling
- **Focus management** for accessibility

### Form Validation
- **Real-time validation** with immediate feedback
- **Error states** clearly displayed
- **Success states** for user confirmation
- **Loading states** during submission

### Data Fetching
- **React Query** for caching and synchronization
- **Error boundaries** for failed requests
- **Loading skeletons** for better UX
- **Retry logic** for network failures

### Offline Handling
- **Graceful degradation** when offline
- **Queue system** for offline actions
- **Sync indicators** for user feedback
- **Conflict resolution** strategies

## Risk Assessment & Change Management

### High-Risk Changes to Avoid
1. **Database schema changes** - Can break existing data
2. **Authentication flow modifications** - Can lock users out
3. **Service worker updates** - Can break offline functionality
4. **Major dependency updates** - Can introduce breaking changes
5. **File structure reorganization** - Can break imports and paths

### Safe Change Patterns
1. **Additive changes** - New features without modifying existing code
2. **UI improvements** - Styling and layout changes
3. **Bug fixes** - Targeted fixes to specific issues
4. **Performance optimizations** - When clearly beneficial
5. **Documentation updates** - Comments and README improvements

### Before Making Changes
- **Assess impact** - What could break?
- **Consider testing** - How can we verify it works?
- **Plan rollback** - How can we undo if needed?
- **Communicate risks** - Explain potential issues clearly

## Troubleshooting Guide

### Common Issues
1. **Import errors** - Check explicit imports
2. **Type errors** - Ensure strict TypeScript compliance
3. **Build failures** - Run validation scripts
4. **Test failures** - Check mock implementations

### Debugging Tools
- **React DevTools** for component inspection
- **Network tab** for API debugging
- **Application tab** for storage inspection
- **Console logs** for development debugging

### Performance Issues
- **Bundle analysis** with webpack-bundle-analyzer
- **Lighthouse** for PWA metrics
- **React Profiler** for component performance
- **Memory leaks** detection with DevTools

## Future Considerations

### Scalability
- **Micro-frontend** architecture consideration
- **Database optimization** for large datasets
- **CDN integration** for global performance
- **API versioning** strategy

### Feature Development
- **A/B testing** framework integration
- **Analytics** for user behavior tracking
- **Internationalization** support
- **Advanced offline** capabilities

### Maintenance
- **Dependency updates** strategy
- **Security audits** for vulnerabilities
- **Performance monitoring** setup
- **Documentation** maintenance

---

## Key Principles for AI Assistants

### Communication Approach
- **Always explain complexity** - Don't assume the user understands the technical implications
- **Flag risks explicitly** - If something could break the app, say so clearly and explain why
- **Suggest testing strategies** - Always recommend how to verify changes work
- **Provide context** - Explain why a change is needed and what it accomplishes

### Change Management
- **Prefer small, incremental changes** over large refactors
- **Always suggest testing** before and after changes
- **Explain rollback strategies** for risky changes
- **Consider user impact** - Will this break existing functionality?

### Technical Guidance
- **Be conservative** - When in doubt, suggest the safer approach
- **Explain trade-offs** - Help the user understand the pros and cons
- **Suggest alternatives** - For risky changes, provide safer options
- **Break down complexity** - Large changes should be broken into smaller steps

**Remember**: This is a chess training app focused on helping users improve their game through consistent practice tracking. Always prioritize user experience, offline functionality, and data integrity. The user is smart but relies on AI for coding, so always communicate risks and complexity clearly.
