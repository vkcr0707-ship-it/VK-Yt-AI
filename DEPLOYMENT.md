# Deployment guide

## Architecture
- Frontend and backend: Next.js App Router route handlers deployed as one Node.js service.
- Database: managed PostgreSQL, currently Neon. Drizzle owns the schema in `src/db/schema.ts`.
- Workers: no separate queue worker is required by the current implementation; jobs run through API-triggered handlers and the autonomous loop.
- Redis: not used by the current source tree and therefore not required.
- Rendering: FFmpeg must be installed in the runtime for MP4 output. Without it, the application produces an honest timed HTML preview.
- Storage: generated assets are written under `public/gen`; use persistent/object storage before scaling beyond a single instance.
- Scheduling: no external scheduler is currently wired; invoke the autonomous loop through a protected scheduler endpoint or platform cron when enabled.

## Local development
1. Copy `.env.example` to `.env` and provide a real `DATABASE_URL`.
2. Run `npm install`.
3. Apply the schema with `npx drizzle-kit push --config=drizzle.config.ts`.
4. Run `npm run dev` or use `npm run build` followed by `npm run start -- -p 3001`.

## Build and start
- Install: `npm install`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Start: `npm run start -- -p 3001`
- Health check: `GET /api/health`

## Environment variables
- Required runtime: `DATABASE_URL`, `SESSION_SECRET`.
- Optional live providers: `LLM_API_KEY`, `TTS_API_KEY`, `IMAGE_API_KEY`, `TAVILY_API_KEY` or `WEB_SEARCH_API_KEY`, `YOUTUBE_API_KEY`.
- YouTube OAuth: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`.
- App routing: `PORT`, `NEXT_PUBLIC_APP_URL`.
- Keep all credentials in the deployment platform secret store. Never commit `.env` or credential-bearing URLs.

## Database and migrations
- Use the managed production PostgreSQL URL in the deployment secret store.
- Apply `drizzle/0000_tense_the_renegades.sql` through the deployment migration step, or run `npx drizzle-kit push --config=drizzle.config.ts` against a newly provisioned database.
- Verify `/api/health` and a real authenticated read/write operation after migration.
- Do not delete existing data to resolve schema drift.

## OAuth callback
- Register `YOUTUBE_REDIRECT_URI` exactly in Google Cloud OAuth settings.
- Local default: `http://localhost:3001/api/v1/production?action=oauth-callback`.
- Production: use the HTTPS deployment hostname with `/api/v1/production?action=oauth-callback`.

## Production smoke tests
1. `GET /api/health` returns `{ "ok": true }`.
2. Homepage returns `200`.
3. Signup and login establish an HttpOnly session cookie.
4. Authenticated channel listing and setup wizard persist to PostgreSQL.
5. `/api/v1/ops?action=providers` reports provider status without secrets.
6. FFmpeg availability and generated asset persistence are verified on the target runtime.

## Production hardening
- Use HTTPS and secure cookie settings in production.
- Restrict OAuth redirect URIs to the production host.
- Protect scheduler/autonomous-loop triggers with authentication and rate limits.
- Use persistent/object storage for generated media on ephemeral hosts.
