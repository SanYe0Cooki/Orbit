# Orbit v1 Product Requirements Document

- Status: proposed implementation baseline (not a claim of production readiness)
- Product: Orbit — personalized life management
- Platforms: responsive web/PWA first; native app packaging is a later decision
- Languages: Traditional Chinese (zh-TW), English (en)
- Primary audience: people who want one calm place to plan routines, track habits, and reflect on progress

## 1. Product promise
Help people turn personal intentions into small repeatable actions. Orbit is a general lifestyle organizer, not a medical product, diagnostic tool, or emergency service.

## 2. MVP outcomes
1. A user can try the app as a guest without an account.
2. A user can create, edit, pause, archive, and complete recurring habits.
3. Daily progress and historical check-ins are calculated from saved records.
4. A user can register/sign in with email; Apple and Google are supported after provider credentials are configured.
5. Authenticated data is stored in Supabase and is isolated per user using Row Level Security (RLS).
6. A user can change between Traditional Chinese and English.
7. Core mobile navigation supports touch swipes and accessible reduced-motion behavior.
8. A user can export or delete their account data through a documented flow before public launch.

## 3. Non-goals for v1
- Medical advice, diagnosis, prescriptions, or emergency monitoring
- Social feed, public profiles, chat, marketplace
- Paid subscriptions or billing until pricing, entitlements, and store/web payment requirements are settled
- Guaranteed background reminders on all mobile browsers
- Claiming native iOS/Android behavior from a PWA

## 4. Personas and jobs to be done
- Busy planner: "Help me see today's few important actions."
- Habit builder: "Let me track consistency without shame after a missed day."
- Cross-device user: "Keep my records when I switch phone or browser."
- Privacy-conscious guest: "Let me try before sharing an email."

## 5. Information architecture
- Onboarding: language, goals, preferred routine (skippable)
- Today: greeting/date, daily completion ring, today's habits, quick complete/undo, add habit
- Habits: active/paused/archived list, search/filter, create/edit form
- Habit detail: schedule, notes, history/calendar, completion rate
- Insights: weekly/monthly completion trends and consistency; empty states when insufficient data
- Profile & settings: account, language, timezone, reminders, export/delete account, privacy/help
- Auth: guest continue, email sign-in/sign-up, password reset, Apple and Google buttons when configured
- Global states: loading, empty, offline/pending sync, validation, retryable error

## 6. Functional requirements
### Guest mode
- Generate a local anonymous guest identifier and store guest habits/logs in local storage or IndexedDB.
- Do not send guest records to a server before consent/sign-in.
- On account upgrade, offer an explicit merge/import step and report conflicts; never silently overwrite cloud records.
- Guest records can be lost if browser data is cleared; explain this in the UI.

### Authentication
- Email/password sign-up, sign-in, sign-out, email verification, password reset.
- Apple and Google OAuth via Supabase Auth after redirect URLs and provider secrets are configured.
- Restore session on reload; show clear errors for cancellation, expired link, invalid credentials, and network failure.
- Never store passwords or OAuth client secrets in frontend code.
- Account deletion must delete user-owned data and then the auth identity, with confirmation and re-authentication where required.

### Habits and check-ins
- Habit fields: name, optional description, icon/color, schedule, target count, status, timezone, created/updated timestamps.
- Schedules: selected weekdays and/or daily; custom complex recurrence is out of scope for first MVP.
- Check-in is unique per habit and local calendar date. Completing twice must not create duplicate logs.
- Allow undo/edit for the same day; retain created/updated timestamps.
- Paused or archived habits do not appear in today's active list.
- Completion percentage must use eligible scheduled habits for that date, not all habits ever created.

### Insights
- Weekly/monthly summaries derive from stored check-ins and schedules.
- Clearly label incomplete data; never fabricate sample data as user history.
- Timezone changes must not silently shift historical check-in dates.

### Localization
- All visible UI strings use translation dictionaries, not inline hard-coded text.
- Persist language preference locally and to profile for signed-in users.
- Format dates/numbers with locale-aware APIs and use user-selected timezone.

### Motion and touch
- Bottom navigation: Today, Habits, Insights, Profile.
- Horizontal swipe between primary tabs only when gesture starts outside interactive controls and scrollable content.
- Keep native vertical scrolling; avoid hijacking text selection, forms, sliders, and horizontal carousels.
- Use spring-like easing for panel/card transitions, subtle press feedback, and reduced-motion fallback.
- Respect safe-area insets, keyboard, dynamic island/notch, and bottom home indicator.
- Every gesture action has an equivalent visible button/tab for accessibility.

### Sync and resilience
- Authenticated records are server-authoritative; optimistic UI rolls back with a clear error if a write fails.
- Show sync state when offline or pending.
- Avoid last-write-wins data loss for conflicting edits; compare updated_at and prompt/resolve deterministically.
- Retry transient failures with bounded backoff; no infinite retry loops.

## 7. Data entities
- auth.users: managed by Supabase Auth
- profiles: user locale, timezone, display name
- habits: user-owned habit definitions
- habit_logs: per-habit per-local-date completion records
- user_settings (future extension): reminder preferences and UI settings
- audit/retention events (future extension): only if operationally required and documented

See ../supabase/schema.sql for the initial PostgreSQL schema and RLS policies.

## 8. Suggested architecture
- Phase 1 frontend: existing static HTML prototype progressively modularized into accessible UI modules; avoid a framework migration until the interactive MVP is specified.
- Backend: Supabase Auth + PostgreSQL + Row Level Security.
- Data access: one typed repository/service layer; validate inputs on client and database.
- Localization: en and zh-TW dictionaries with key parity checks.
- Deployment: GitHub Pages may host static frontend only; it does not run backend code. Configure Supabase URL and anon key as public client configuration (never service-role key).
- Secrets: provider secrets and database credentials live only in Supabase/GitHub Actions secrets as appropriate.
- Monitoring: add error reporting only after privacy review and consent requirements are decided.

## 9. Security and privacy baseline
- RLS enabled on every user-owned table.
- Policies scope SELECT/INSERT/UPDATE/DELETE to auth.uid().
- Validate ownership via foreign keys and database policies; do not trust user_id from client input.
- No sensitive health data in logs or analytics.
- Add privacy policy, retention policy, account export/delete flow, and provider callback review before public launch.
- Rate limiting and abuse controls must be configured for auth and any future public endpoint.

## 10. Acceptance criteria
- Guest can create/check off a habit and reload without losing it on the same browser.
- Email sign-up/sign-in/reset works against a configured test Supabase project.
- Apple/Google auth succeeds only after provider configuration; otherwise buttons are hidden or marked unavailable, never fake-success.
- User A cannot read or mutate User B's profiles, habits, or logs through direct API requests.
- Duplicate check-in for same habit/date is prevented by a database constraint.
- Locale switch updates navigation, dates, forms, errors, and empty states.
- Swipe navigation works on touch devices without breaking vertical scrolling or form input.
- prefers-reduced-motion disables non-essential movement.
- Tests cover sign-in failures, offline writes, timezone boundaries, duplicate check-ins, and account deletion.
- Deployment status is verified from GitHub Actions and live smoke tests before claiming release.

## 11. Release gates
1. Schema reviewed and applied to a non-production Supabase project.
2. Auth redirect URLs and provider credentials configured.
3. RLS tests pass with at least two test users.
4. iOS Safari and Android Chrome smoke tests pass.
5. Privacy, deletion, export, and support contact are published.
6. GitHub Pages workflow and deployed site verified.
