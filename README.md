# Orbit — Small habits. Better days.

Orbit is a personalized life-management and habit-tracking product in development. The current public page is still a static concept prototype; the documentation and initial database schema define the v1 implementation baseline.

## Repository status

| Area | Status |
|---|---|
| Responsive landing-page prototype | Present |
| PWA manifest and Orbit SVG icon | Present; device installation behavior still needs verification |
| Product requirements | `docs/PRD.md` |
| Architecture and setup checklist | `docs/ARCHITECTURE.md` |
| QA matrix | `docs/QA-TEST-PLAN.md` |
| Initial Supabase schema and RLS policies | `supabase/schema.sql` (not yet applied to a project) |
| Real email / Apple / Google authentication | Not implemented; provider configuration required |
| Cloud persistence and cross-device sync | Not implemented |
| Fully localized Traditional Chinese / English UI | Not implemented |
| Native-feeling swipe navigation and motion | Specification documented; not implemented in the prototype |
| Automated tests | Not configured or run |
| Live deployment | Must be verified from GitHub Actions and a live smoke test |

## Planned v1
- Guest mode with local-only data before account linking
- Today, Habits, Insights, and Profile tabs
- Habit scheduling, daily check-ins, history, and derived progress
- Email authentication plus Apple and Google OAuth
- Supabase Auth/PostgreSQL with Row Level Security
- Traditional Chinese and English
- Touch swipe navigation, motion preferences, safe-area support
- Account data export and deletion before public launch

## Local development
The existing prototype is static HTML and can be opened directly in a browser. The backend setup is not yet complete.

For backend setup, create a **development** Supabase project, review and apply `supabase/schema.sql`, then follow `docs/ARCHITECTURE.md`. Do not put a Supabase service-role key, Apple private key, or Google client secret in frontend code. Test RLS with multiple users before enabling public registration.

## Deployment
The existing GitHub Actions workflow deploys the repository root to GitHub Pages on pushes to `main`. GitHub Pages only hosts static assets; authentication and cloud data are provided separately by Supabase. A workflow passing is necessary but not sufficient to claim the product is production-ready.

## Privacy note
Do not enter real sensitive personal or health information into the current demo. The current prototype does not implement account storage or cloud sync. Orbit is a general lifestyle organization tool, not a medical service.
