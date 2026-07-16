# Gemini Clone backend

Express API that validates and streams Gemini responses. Keep `GEMINI_API_KEY` server-side; `.env` is ignored by Git.

## Run locally

1. Copy `.env.example` to `.env` and provide a Gemini API key.
2. Run `npm install`.
3. Run `npm run dev` (or `npm start`).

`GET /health` confirms whether the server has been configured. `POST /api/chat/stream` accepts a validated `messages` array and streams plain-text output.

## Deployment notes

Set `FRONTEND_URL` to your deployed client origin (multiple comma-separated origins are supported). The in-memory request limit is a basic single-instance safeguard; use a shared rate limiter such as Redis when scaling to multiple instances.
