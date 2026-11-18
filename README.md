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

- `GET /api/events` (optional `?status=...`)
- `GET /api/events/<event_id>`
- `POST /api/registrations` with JSON `{ "user_id": "...", "event_id": "..." }`
- `GET /api/me/registrations?user_id=...`
- `GET /api/events/<event_id>/registrations?user_id=...`

The API currently has no authentication. The caller-supplied `user_id` is not verified, so organizer checks do not provide secure access control. CORS allows any origin as configured in `app.py`.
"# Workshop" 
