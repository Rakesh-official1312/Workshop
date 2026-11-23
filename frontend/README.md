# EventPulse frontend

EventPulse is a React single-page app built with Vite.

## Deploy from GitHub to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `frontend`.
3. Choose **Vite** as the framework preset. Use `npm run build` as the build command and `dist` as the output directory.
4. Deploy.

The checked-in `vercel.json` sets the build output, SPA fallback, and a few browser security headers. The Vercel root directory is a project setting and must point at `frontend` for this repository layout.

## Connect the deployed API

The browser must call a public HTTPS URL for the Flask backend. Either set a Vercel project environment variable named `VITE_API_BASE_URL` (production and preview as needed), or put the value in `public/config.js` before deploying:

```js
window.EVENTPULSE_CONFIG = { API_BASE_URL: "https://your-events-api.example.com" };
```

Use the base URL only; do not append `/api`. The UI can also save the backend URL under **API settings**, which stores it in that browser's local storage. The public config file is served without caching. The Vite variable is embedded in the client build, so changing it in Vercel requires a redeploy.

The backend allows cross-origin `GET`, `POST`, and preflight `OPTIONS` requests from browser origins. The frontend connects to the backend's event list, event detail, registration, personal registration, and organizer attendee routes. This frontend only needs the public API URL; never place Supabase keys or other secrets in `config.js` or browser code.

## Local development

Use Node.js 20.19+ or 22.12+, then run `npm install` and `npm run dev` from this folder. Run the Flask API from `backend` with its environment configured. `http://localhost:5000` is the frontend's local API default; use **API settings** to change it if needed.

Run `npm run build` to create the Vercel-ready `dist` folder, or `npm run preview` to view that production build locally.
