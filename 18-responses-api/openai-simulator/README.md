# OpenAI Simulator

To run:

create a `.env.local` file in the root of this project and add

```
OPENAI_API_KEY=sk-proj...
LINEAR_API_KEY=lin_api_...
```

Then start the backend in one terminal:

```
npm i
npm run backend
```

And the game in another:

```
npm run dev
```

## Vercel

The simplest reliable deploy is:

1. Create a Vercel project for the frontend from this repo root.
2. Create a second Vercel project for the backend from this same repo.

Frontend project:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:
  - `VITE_API_BASE_URL=https://YOUR-BACKEND-PROJECT.vercel.app`

Backend project:

- Framework preset: `FastAPI` (or `Other` with Python runtime)
- Root can stay at this repo root
- Environment variables:
  - `OPENAI_API_KEY=...`
  - `LINEAR_API_KEY=...` (optional)
  - `ALLOWED_ORIGINS=https://YOUR-FRONTEND-PROJECT.vercel.app`

Notes:

- The frontend now reads `VITE_API_BASE_URL` when set, and falls back to the local `/api` proxy during development.
- The backend now reads `ALLOWED_ORIGINS` as a comma-separated list for CORS.
