# Orbit — Small habits. Better days.

Orbit is a personalized life-management and habit-tracking product in development. The landing page now links to an interactive habit-tracking app at `app.html`. Guest mode, local persistence, bilingual UI, tab/swipe navigation, export, and Supabase client integration are implemented; backend features remain dependent on project configuration.

## Repository status

| Area | Status |
|---|---|
| Responsive landing-page prototype | Present |
| PWA manifest and Orbit SVG icon | Present; device installation behavior still needs verification |
| Product requirements | `docs/PRD.md` |
| Architecture and setup checklist | `docs/ARCHITECTURE.md` |
| QA matrix | `docs/QA-TEST-PLAN.md` |
| Initial Supabase schema and RLS policies | `supabase/schema.sql` (not yet applied to a project) |
| Email authentication | Client flow implemented; verify email provider and redirect URLs in Supabase |\n| Apple / Google authentication | Client OAuth flow present; each provider still needs credentials and configuration |
| Cloud persistence and cross-device sync | Client sync code present; requires applying schema and testing RLS in Supabase |
| Traditional Chinese / English UI | Implemented in the app UI; needs manual browser QA |
| Swipe navigation and reduced-motion support | Implemented in the app UI; needs touch-device QA |
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
Open `app.html` locally or through the GitHub Pages URL. Guest mode uses browser local storage. The frontend uses the Supabase project URL and publishable key; those values are safe to expose in browser code, but the service-role key is not.

For backend setup, create a **development** Supabase project, review and apply `supabase/schema.sql`, then follow `docs/ARCHITECTURE.md`. Do not put a Supabase service-role key, Apple private key, or Google client secret in frontend code. Test RLS with multiple users before enabling public registration.

## Deployment
The existing GitHub Actions workflow deploys the repository root to GitHub Pages on pushes to `main`. GitHub Pages only hosts static assets; authentication and cloud data are provided separately by Supabase. A workflow passing is necessary but not sufficient to claim the product is production-ready.

## Privacy note
Do not enter real sensitive personal or health information into the current demo. The app's cloud integration is not production-verified until the schema has been applied and authentication, RLS, and cross-device sync have been tested. Orbit is a general lifestyle organization tool, not a medical service.
