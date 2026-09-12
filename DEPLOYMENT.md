# Deployment guide

## Architecture
- Frontend and backend: Next.js App Router route handlers deployed as one Node.js service.
- Database: managed PostgreSQL, currently Neon. Drizzle owns the schema in `src/db/schema.ts`.
- Workers: API-triggered jobs run synchronously by default; the optional rendering worker polls the same PostgreSQL jobs table when enabled.
- Redis: not used by the current source tree and therefore not required.
- Rendering: the persistent worker image includes FFmpeg and ffprobe and is the only production runtime that executes MP4 rendering. Missing capabilities or invalid media fail the render and remain visible in the job log.
- Storage: production should use the private Backblaze B2 S3-compatible adapter. Objects are materialized into unique temporary worker files, validated, rendered, validated again, and uploaded back to private storage.
- Storage capability: local filesystem mode is temporary. S3 mode is durable only when all S3 variables are configured and the private bucket is reachable.
- Scheduling: no external scheduler is currently wired; invoke the autonomous loop through a protected scheduler endpoint or platform cron when enabled.
- Workers: local jobs run synchronously by default. In production, set `WORKER_MODE=external` in both the web app and the dedicated `Dockerfile.render-worker` service. The web app queues jobs; the worker atomically claims them from the shared PostgreSQL jobs table. No Redis queue is required.
- Recommended host: an OCI Always Free VM, because it can run Docker Compose on a persistent Linux VPS without changing the application architecture.

## Local development
1. Copy `.env.example` to `.env` and provide a real `DATABASE_URL`.
2. Run `npm install`.
3. Apply committed additive migrations with `npm run db:migrate`.
4. Run `npm run dev` or use `npm run build` followed by `npm run start -- -p 3001`.

## Build and start
- Install: `npm install`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build` (build only; does not mutate the database)
- Start: `npm run start -- -p 3001`
- Vercel build: `npm run vercel-build` (build only; does not mutate the database)
- Hosted Compose: `docker compose up -d --build`
- Rendering worker: `docker compose build render-worker` then `docker compose up -d render-worker`; the image includes FFmpeg and ffprobe. The web and worker containers must share the same production `DATABASE_URL` and private S3 configuration.
- Health check: `GET /api/health`

## Environment variables
- Required runtime: `DATABASE_URL`, `SESSION_SECRET`.
- Optional live providers: `LLM_API_KEY`, `TTS_API_KEY`, `IMAGE_API_KEY`, `TAVILY_API_KEY` or `WEB_SEARCH_API_KEY`, `YOUTUBE_API_KEY`.
- YouTube OAuth: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`.
- App routing: `PORT`, `NEXT_PUBLIC_APP_URL`.
- Optional protection: `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_MS` configure the in-process development fallback.
- Media storage: set `MEDIA_STORAGE_PROVIDER=local` for local development, or `MEDIA_STORAGE_PROVIDER=s3` with `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` for a private Backblaze B2 S3-compatible bucket. The endpoint must be `https://s3.<region>.backblazeb2.com`; do not guess the region.
- Production worker: `WORKER_MODE=external`, `WORKER_POLL_MS`, and `WORKER_BATCH_SIZE`; the worker also requires `DATABASE_URL` and the same private S3 variables as the web app.
- Keep all credentials in the deployment platform secret store. Never commit `.env` or credential-bearing URLs.

## Database and migrations
- Use the managed production PostgreSQL URL in the deployment secret store.
- Apply committed migrations with `npm run db:migrate` against the intended database, reviewing the SQL first. Do not use `drizzle-kit push` against production.
- Node startup applies committed Drizzle migrations through `src/instrumentation.ts`; build commands remain read-only so Vercel builds cannot mutate production schema.
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
- Run `npm run db:migrate` from a one-off migration container or local admin shell against the intended Neon database; review changes first and never delete existing data.
- Run `docker compose up -d --build`; the app container includes FFmpeg and the Compose file includes Redis with persistent volumes.
- Put Caddy or Nginx in front for HTTPS, then set `NEXT_PUBLIC_APP_URL` and `YOUTUBE_REDIRECT_URI` to the final HTTPS hostname.
- OCI signup may require identity and card/debit verification even when using Always Free resources; no deployment can be created until that human account action is complete.
