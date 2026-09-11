# Deployment guide

## Architecture
- Frontend and backend: Next.js App Router route handlers deployed as one Node.js service.
- Database: managed PostgreSQL, currently Neon. Drizzle owns the schema in `src/db/schema.ts`.
- Workers: no separate queue worker is required by the current implementation; jobs run through API-triggered handlers and the autonomous loop.
- Redis: not used by the current source tree and therefore not required.
- Rendering: FFmpeg must be installed in the runtime for MP4 output. Without it, the application produces an honest timed HTML preview.
- Storage: generated assets are written under `public/gen`; use persistent/object storage before scaling beyond a single instance.
- Scheduling: no external scheduler is currently wired; invoke the autonomous loop through a protected scheduler endpoint or platform cron when enabled.
- Recommended host: an OCI Always Free VM, because it can run Docker Compose on a persistent Linux VPS without changing the application architecture.

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
- Vercel build: `npm run vercel-build` (synchronizes Drizzle schema, then builds)
- Hosted Compose: `docker compose up -d --build`
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
- Vercel uses `npm run vercel-build`, which runs `drizzle-kit push` against its `DATABASE_URL` before `next build`; review the migration output on each deployment.
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

## OCI Always Free deployment
- Create an Ubuntu or Oracle Linux Always Free VM, install Docker Engine and the Compose plugin, and allow TCP `80`/`443` in the VM firewall and OCI security list.
- Clone `https://github.com/vkcr0707-ship-it/VK-Yt-AI.git` on the VM and create `.env` from `.env.example` using secret storage or protected file permissions.
- Run `npx drizzle-kit push --config=drizzle.config.ts` from a one-off migration container or local admin shell against the intended Neon database; review changes first and never delete existing data.
- Run `docker compose up -d --build`; the app container includes FFmpeg and the Compose file includes Redis with persistent volumes.
- Put Caddy or Nginx in front for HTTPS, then set `NEXT_PUBLIC_APP_URL` and `YOUTUBE_REDIRECT_URI` to the final HTTPS hostname.
- OCI signup may require identity and card/debit verification even when using Always Free resources; no deployment can be created until that human account action is complete.
