# Backend Deploy Notes

Use this directory as the Root Directory for the backend Vercel project.

Expected Vercel setup:

- Root Directory: `backend`
- Framework: `FastAPI` (or auto-detected Python runtime)
- Entrypoint: `server.py` exports `app`

Required environment variables:

- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS=https://YOUR-FRONTEND.vercel.app`

Optional:

- `LINEAR_API_KEY`
