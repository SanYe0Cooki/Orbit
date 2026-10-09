# Orbit v1 QA and Test Plan

## Test environments
- Development Supabase project with email auth; Apple/Google providers configured only in a separate test environment.
- iOS Safari current and previous major version where available.
- Android Chrome current version.
- Desktop Chrome, Safari, Firefox, Edge smoke coverage.
- Network profiles: normal, slow, offline, reconnect.
- Accounts: guest, verified user A, verified user B.

## Functional test cases
| ID | Area | Scenario | Expected result |
|---|---|---|---|
| AUTH-01 | Guest | Continue without login | App opens; no remote user record created |
| AUTH-02 | Email | Valid sign-up | Verification flow is shown; profile created after auth trigger |
| AUTH-03 | Email | Invalid email / weak password | Inline localized validation; no crash |
| AUTH-04 | Email | Wrong password | Non-sensitive error; no session granted |
| AUTH-05 | Password reset | Request reset | User receives configured email; redirect URL is allowlisted |
| AUTH-06 | OAuth | Cancel Apple/Google flow | Returns to app without false success or data loss |
| AUTH-07 | Session | Reload / sign out | Session restores securely / session is ended |
| DATA-01 | Habit | Create/edit/pause/archive | Changes persist and lists update |
| DATA-02 | Check-in | Complete and undo today | Progress updates and one row per habit/date remains |
| DATA-03 | Sync | Edit on device A, refresh device B | Authenticated data converges to server state |
| DATA-04 | Conflict | Two devices edit same habit | Conflict is surfaced/resolved; silent data loss avoided |
| DATA-05 | Ownership | User A requests user B's rows via API | RLS denies access |
| DATA-06 | Delete | Delete habit/account | Related records cascade as specified; confirmation required |
| I18N-01 | Language | Switch zh-TW ↔ en | All screens and validation strings change |
| I18N-02 | Dates | Change timezone / midnight boundary | Local date and history remain consistent |
| MOTION-01 | Swipe | Swipe primary page left/right | Page follows gesture; vertical scroll remains usable |
| MOTION-02 | Controls | Swipe begins on input/button | Input and button remain functional; no accidental page switch |
| MOTION-03 | Accessibility | Enable reduced motion | Nonessential transitions are removed or reduced |
| MOTION-04 | Layout | Keyboard / safe area | Content remains visible; no controls hidden behind keyboard/home indicator |
| RES-01 | Offline | Create check-in offline | Pending/error state shown; no false sync success |
| RES-02 | Recovery | Reconnect after offline change | Bounded retry or explicit retry restores consistency |
| PWA-01 | Install | Add to home screen | Correct icon/name and standalone launch where supported |
| PWA-02 | Deploy | Push main | GitHub Actions passes and deployed URL responds successfully |

## Accessibility
- All controls have accessible names and visible focus states.
- Touch targets aim for at least 44x44 CSS px.
- Keyboard users can navigate all core flows.
- Screen-reader status announces successful check-ins and validation errors.
- Color is not the only way to convey completion or error.
- Reduced-motion mode is tested.

## Security checks
- Inspect frontend bundle/source for secrets; only public Supabase URL and anon key may be exposed.
- Verify RLS using direct API calls for two different users.
- Verify user_id cannot be spoofed to write into another user's rows.
- Confirm redirect URL allowlist and email verification behavior.
- Ensure logs do not include passwords, auth tokens, or habit notes.
- Test account deletion and export against a disposable user.

## Release exit criteria
- No unresolved critical/high severity issues.
- All auth/data ownership tests pass.
- Cross-device sync and duplicate check-in tests pass.
- iOS Safari and Android Chrome smoke tests pass.
- Reduced-motion and keyboard flows pass.
- Deployment workflow and production URL are independently verified.
- Privacy policy, data deletion instructions, and support contact are published.

## Current status
This file is a planned test matrix, not a test execution report. Tests have not been run against a configured Supabase project or physical devices.
