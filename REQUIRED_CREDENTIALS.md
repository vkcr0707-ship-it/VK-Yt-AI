# Required credentials and live integrations

This project is built to run without fake credentials, but live external integrations require real provider keys.

## Local-only / no-key required
- Local deterministic LLM
- Local TTS synthesis
- Local SVG image renderer
- Local database fallback via pg-mem when `DATABASE_URL` is absent

## Required for live production features
- `DATABASE_URL` — PostgreSQL connection string for persistent app data
- `YOUTUBE_API_KEY` — live YouTube Data API research and metadata
- `YOUTUBE_CLIENT_ID` — Google OAuth client ID
- `YOUTUBE_CLIENT_SECRET` — Google OAuth client secret
- `YOUTUBE_REDIRECT_URI` — callback URL registered in Google Cloud
- `LLM_API_KEY` or `OPENAI_API_KEY` — live LLM generation
- `LLM_BASE_URL` — optional custom OpenAI-compatible endpoint
- `LLM_MODEL` — optional model override
- `TTS_API_KEY` or `ELEVENLABS_API_KEY` — cloud voice generation
- `IMAGE_API_KEY` — cloud image generation
- `TAVILY_API_KEY` or `WEB_SEARCH_API_KEY` — web fact-check and research
- `SESSION_SECRET` — signing secret for future auth hardening

## Human-only actions still required
- Render hosting authorization — connect the GitHub repository and create the Blueprint from `render.yaml`
- Google Cloud OAuth setup and consent for YouTube connector
- YouTube channel authorization / account verification
- Hosting account login for deployment if you want public production
- Any actual API key purchase or billing approval

## Current deployment blocker
- Render account authorization is required before the service can be created. After authorization, set `DATABASE_URL` and `NEXT_PUBLIC_APP_URL` in Render’s secret environment settings. Add provider credentials only when enabling those live integrations.

## Important rule
Never commit real secrets into source control. Use environment variables and local secrets management only.
