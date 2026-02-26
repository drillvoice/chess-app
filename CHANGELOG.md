# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [2.1.9] - 26 February 2026

- Split the Home goal action into two half-width buttons: `Set goal` and `CFD`
- Add a Chess Free Day modal to schedule a rest day in the next 7 days (including today)
- Show a prominent Home reminder on the selected chess free day
- Show a compact Home reminder when no valid chess free day is nominated
- Persist chess free day selection in cloud-synced user settings (offline-first)
- Add regression tests for chess free day date-window logic and modal submission flow

## [2.1.8] - 24 February 2026

- Add advanced Cloud Sync troubleshooting panel for mobile diagnostics
- Expose recent per-session cloud repair failures directly in the UI
- Add copy-to-clipboard diagnostics snapshot for quick issue reporting

## [2.1.7] - 24 February 2026

- Add live cloud-repair progress display in Account so long repair runs are visible
- Add per-session upload timeouts so one stuck write cannot freeze the repair action indefinitely
- Report incremental processed/uploaded/failed counts during forced cloud repair

## [2.1.6] - 24 February 2026

- Fix force-repair cloud uploads by removing undefined fields from Firestore session payloads
- Validate Date instances before upload serialization to prevent invalid Timestamp conversion failures
- Improve reliability of full local-session upload retry loops during cloud repair

## [2.1.5] - 24 February 2026

- Fix cloud sync reconciliation so newer local sessions can override stale cloud tombstones
- Add startup and account-level repair flows to backfill missing local sessions to cloud
- Add 'Repair cloud data' action in Account > Cloud Sync to force upload all local sessions
- Harden Firebase collection UID resolution to avoid false "synced" states with partial cloud writes

## [2.1.4] - 24 February 2026

- Restore Lichess sync startup for local-only devices after cloud sync auth changes
- Allow account-level Sync Status to become active without requiring cloud sign-in
- Fix disabled 'Sync Now' button regression when a saved Lichess username exists locally
- Add regression test to keep local-only Lichess sync initialization covered

## [2.1.3] - 24 February 2026

- Introduce tablet-first responsive shell sizing to remove phone-width rendering on tablets
- Add reusable tablet layout utilities for consistent two-column page composition
- Redesign Home page for tablet density with split content panels and responsive action grid
- Rework Activity page top section into tablet two-column layout and wrap filter controls
- Apply tablet-responsive layout improvements to Account and Info pages
- Improve top navigation spacing and container width behavior on tablet and desktop

## [2.1.2] - 24 February 2026

- Backfill previously imported local-only sessions to cloud after sync starts so existing devices are repaired
- Trigger cloud backfill after local bulk session replacement (import/restore flows)
- Normalize imported session IDs and dates during reconciliation to support legacy import formats
- Continue backfilling when individual session uploads fail and report partial failures
- Use durable cloud writes for overwrite imports and backup restores

## [2.1.1] - 23 February 2026

- Prevent cloud snapshot reconciliation from removing local-only imported sessions
- Backfill local-only sessions to cloud after realtime reconciliation
- Respect cloud tombstones during local reconciliation
- Add durable import mode to await cloud writes per imported session
- Add regression tests for realtime reconciliation and durable import sync behavior

## [2.1.0] - 23 February 2026

- Fix backup imports to restore cached statistics from backup files
- Prevent overlapping Lichess sync polls and correct imported-games counting
- Fix activity-history bucketing so each session appears in exactly one section
- Preserve provided session dates in server-created training sessions
- Add regression tests for import conflict handling, sync polling, and date grouping

## [2.0.2] - 23 February 2026

- Fix Import Data action to work when file is selected via Import from Google Drive picker
- Improve import UX with explicit no-file-selected feedback before starting import

## [2.0.0] - 23 February 2026

- Launch real-time Google account cloud sync across devices
- Add first-sign-in migration that merges local and cloud data safely
- Add dedicated Cloud Sync section in Account between Data Management and Enhanced Backup & Restore
- Add account-switch protection with separate local profile snapshots
- Upgrade sync metadata and storage typing to support robust two-way syncing

## [0.4.13] - 8 February 2026

- Memoize activity page rendering for smoother scrolling
- Reduce background polling intervals to save battery
- Eliminate duplicate cache warming on startup
- Parallelize startup initialization
- Remove unnecessary delays in Firebase auth flow
- Gate verbose Lichess sync logging in production

## [0.4.12] - 19 October 2025

- Improve service worker navigation handling to fall back to cached shell when network responses fail
- Add logging to trace cache fallbacks for navigation requests

## [0.4.11] - 16 October 2025

- Show puzzles correct before puzzles attempted in tactics modal
- Display tactics duration options on a single row with five buttons

## [0.4.10] - 11 October 2025

- Allow ISO date strings across training session and settings schemas
- Gate verbose Lichess sync logging behind a debug flag

## [0.4.9] - 10 October 2025

- Improve toast notifications: reduce auto-dismiss time from ~16 minutes to 3 seconds
- Make toast close button (X) always visible instead of only on hover
- Change swipe gesture from horizontal to vertical (swipe up to dismiss)
- Overall improvement to toast dismissal UX - faster and easier to remove

## [0.4.8] - 10 October 2025

- Add opponent name tracking for over-the-board games
- Add autocomplete for opponent names based on previous games
- Opponent names now display in activity feed as 'Game v [Opponent Name]'
- Backup/import automatically includes opponent names
- Improve game modal UI with conditional opponent name field

## [0.4.7] - 8 October 2025

- Comprehensive testing improvements: fixed 2 failing tests, added 20 new tests
- Add complete test suite for Vercel API endpoint (15 tests)
- Enhance Lichess sync error handling tests
- Improve test coverage for Vercel deployment and Lichess syncing
- All 132 tests now passing with improved reliability

## [0.4.6] - 8 October 2025

- Migrate to Vercel deployment for backend API support
- Fix Lichess sync to only import future games (not retrospective)
- Fix game timestamps to use actual play time instead of sync time
- Improve Lichess sync diagnostics and error logging

## [0.4.5] - 3 October 2025

- Add real-time Lichess sync status display with active/inactive indicators
- Add manual 'Sync Now' button for immediate game import
- Fix race condition in sync initialization with retry logic
- Add comprehensive error handling with toast notifications
- Fix UI stuck in 'Syncing...' state when no new games available
- Add debug tools for troubleshooting sync issues

## [0.4.4] - 26 September 2025

- Fix duplicate entry issue when logging sessions - now shows single entry immediately with proper pending state

## [0.4.3] - 21 September 2025

- Fix auto-tracked daily goals to refresh instantly after session updates

## [0.4.2] - 17 September 2025

- Improve code quality around daily goals

## [0.4.1b] - 14 September 2025

- Begin adding daily goal autotracking

## [0.4.0a] - 14 September 2025

- Add save to google drive to backup
- Tidy up interface wrt backup
- Simplify import options

## [0.4.0] - 14 September 2025

- Remove google cloud sync and implement simpler back-up feature

## [0.3.9b] - 13 September 2025

- Improve comment retention for lichess synced games

## [0.3.9a] - 7 September 2025

- Add a date picker to games, to log past games

## [0.3.9] - 7 September 2025

- Various changes to improve syncing behaviour

## [0.3.8] - 5 September 2025

- Consolidate API error handling
- Make server port configurable
- Replace response capture with middleware
- Refactor shared schema, reducing duplication
- Split side effects into dedicated hooks
- Modularize offline storage utility
- Abstract common session-creation logic
- Adopt structured logging with levels
- Expand unit and integration test coverage

## [0.3.7b] - 5 September 2025

- Finally making google cloud sync work?

## [0.3.7a] - 3 September 2025

- Bugfixes re lichess syncing and google cloud sync

## [0.3.7] - 1 September 2025

- Change service worker to force update on version upgrade

## [0.3.6] - 31 August 2025

- Bugfix: lichesse name syncing
- UI: activity screen space efficiency

## [0.3.5b] - 30 August 2025

- Bugfix: google cloud syncing

## [0.3.5] - 29 August 2025

- Bugfix: address failing tests
- Bugfix: improve saving of lichess username
- Tweaked tag manager UI including delete confirmation

## [0.3.4] - 25 August 2025

- UI: update 'study' modal to use tags

## [0.3.3] - 25 August 2025

- Bugfix: Improvements to lichess syncing and editing of synced games
- Bugfix: increase static page loads to reduce dynamic import errors

## [0.3.2c] - 24 August 2025

- Bugfix: addressed database issues bedeviling daily goals
- UI: changed account screen to include database debugging and use accordings
- Meta: added instructions.md to assist future AI dev

## [0.3.0] - 24 August 2025

- Introduce user-customisable daily goals
- User can add custom goals reflected on home screen. Updating is manual.

## [0.2.10] - 23 August 2025

- Change titles from title case to sentence case
- Cosmetic changes to game modal to make it clearer when something has been selected

## [0.2.9] - 22 August 2025

- Improve lichess syncing so that synced games automatically appear on homescreen
- UI tweaks to log game modal

## [0.2.8] - 21 August 2025

- UI: tweak log game modal
- Bugfix: better handling of lazy loading and dynamic import
- Bugfix: improve caching behaviour to avoid empty history

## [0.2.7] - 20 August 2025

- Fix cloud syncing bug
- Bugfix: archive button not working
- Bugfix: bad zoom function on iphone
- Feature: record username from lichess sync and show in history

## [1.2.6] - 18 August 2025

- Improve google cloud syncing when migrating from anonymous authentication
- Increase lichess polling frequency to reduce delay
- Add more time control options to match lichess

## [1.2.5] - 17 August 2025

- Persist sessions locally before Firebase sync
- Improve persistent local storage
- Improved local caching

## [1.2.4] - 16 August 2025

- Fixed archive button not removing games from review list
- Fixed review modal validation issues with pre-filled values
- Added optimistic updates for better user experience
- Improved caching

## [1.2.3] - 15 August 2025

- Initial release with game logging
- Added tactics and study tracking
- Implemented weekly goals feature
