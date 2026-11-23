# Events API

Flask API backed by Supabase. The deployment files in this folder are ready for a Render Python web service.

## Deploy to Render

1. Push this backend folder to a Git repository (or set `backend` as the service root directory if the repository also contains other projects).
2. In Render, choose **New → Blueprint** and connect the repository containing `render.yaml`, or create a Python web service with this folder as its root.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the Render service environment. `render.yaml` prompts for both values when creating the service.
4. Deploy. Render installs `requirements.txt` and starts the service with Gunicorn.

The equivalent manual settings are:

- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app`
- Health check path: `/`

For local development, create `.env` from `.env.example`, fill in the Supabase values, then run `python app.py`.

## Routes

- `POST /api/auth/signup` with `{ "email": "...", "password": "..." }`
- `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
- `POST /api/auth/refresh` with `{ "refresh_token": "..." }`
- `GET /api/auth/me` with a Supabase bearer token
- `GET /api/events` (optional `?status=...`)
- `GET /api/events/<event_id>`
- `POST /api/registrations` with JSON `{ "event_id": "..." }` and a signed-in bearer token
- `GET /api/me/registrations` with a signed-in bearer token
- `GET /api/events/<event_id>/registrations` with the organizer's bearer token

## Supabase setup for email accounts

Enable Email authentication in Supabase. Then run `supabase_auth_setup.sql` once in the Supabase SQL Editor. It adds the row-level security policies that let authenticated users map their email to a `users` row and read their registrations. A database function validates event status, duplicate registrations, and capacity inside one transaction before inserting. Event reads remain public. If email confirmation is enabled in Supabase, new users must confirm their address before signing in.
"# Workshop" 
