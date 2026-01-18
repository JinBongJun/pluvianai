# Analytics Setup (PostHog)

## Required Environment Variables

Frontend (Vercel / local `.env`):
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (optional, defaults to `https://app.posthog.com`)

## Behavior Tracking

Currently tracked events:
- `user_login`
- `user_register`
- `project_created`
- `api_key_created`
- `export_started`

## Notes
- If `NEXT_PUBLIC_POSTHOG_KEY` is not set, analytics is disabled.
- Ad blockers may block analytics requests in some browsers.
