# Orbit v1 Architecture and Implementation Notes

## Current repository baseline (reviewed 2026-10-09)
- `index.html`: one static HTML/CSS/JavaScript landing-page prototype.
- `manifest.webmanifest`: PWA metadata and SVG icon reference.
- `orbit-icon.svg`: app mark.
- `.github/workflows/deploy-pages.yml`: deploys repository root to GitHub Pages on pushes to main.
- No package manifest, automated test suite, application server, database client, auth integration, cloud sync, or provider configuration was found in the reviewed baseline.
- Existing JavaScript contains local demo interactions only; the email interest modal explicitly does not submit to a server.
- GitHub Pages is static hosting and cannot run server-side auth/database code.

## Target architecture
- Client: mobile-first web/PWA with four primary tabs and localized string dictionaries.
- Auth/data: Supabase Auth + PostgreSQL + RLS.
- Database migration: `supabase/schema.sql`.
- Browser configuration: public `SUPABASE_URL` and `SUPABASE_ANON_KEY` supplied at build/config time only; anon key is not a secret but must be protected by RLS.
- Secrets: Apple Service ID/private key, Google OAuth client secret, Supabase service-role key are never embedded in HTML/JS.
- Hosting: GitHub Pages for static frontend; Supabase for backend services.
- Native distribution: if app-store presence and stronger native capabilities are required, evaluate Capacitor or a dedicated native client after web MVP acceptance.

## Auth setup checklist (manual credentials required)
1. Create a Supabase project and apply schema.sql in a staging project.
2. Enable email/password and configure SMTP/verification/password-reset URLs.
3. Configure allowed Site URL and redirect URLs for local, GitHub Pages, and any custom domain.
4. Configure Google OAuth client ID/secret in provider settings and authorized redirect URI.
5. Configure Sign in with Apple identifiers, key, team ID, and redirect URI.
6. Test callback/cancel/error flows on real iOS Safari and Android Chrome.
7. Store any deployment-time public frontend config in repository variables; keep provider secrets in provider/backend secret stores.
8. Do not turn on public registration until RLS and deletion flows are verified.

## Swipe and motion specification
- Tabs: Today, Habits, Insights, Profile; bottom navigation remains visible in mobile layout.
- Gesture: horizontal swipe threshold 56 px or velocity-based equivalent; require horizontal movement to dominate vertical movement.
- Do not capture gestures originating from inputs, textareas, buttons, selects, links, sliders, or horizontally scrollable components.
- Animate page content with short transform/opacity transition and spring-like cubic-bezier; target 180–320 ms.
- Add/remove/edit sheets slide from bottom with dimmed backdrop; close via close button, Escape where available, or backdrop when safe.
- Check-in feedback: subtle scale/opacity, progress ring transition, optional haptic only where platform supports it.
- Honor `prefers-reduced-motion: reduce`; do not animate solely for decoration when it impairs task completion.
- Keep vertical scroll native and do not use full-screen swipe navigation if it conflicts with nested horizontal content.

## Delivery order
1. Documents and schema baseline.
2. App shell + i18n + guest persistence.
3. Habit CRUD + check-ins + derived insights.
4. Supabase auth and cloud persistence.
5. OAuth providers and cross-device sync.
6. motion/accessibility polish.
7. security review, automated tests, deployment verification.

## Known release blockers
- No Supabase project URL or credentials provided.
- Apple/Google provider credentials and callback URLs not configured.
- No evidence that current GitHub Pages deployment has completed successfully.
- iOS/Android device validation has not been performed.
