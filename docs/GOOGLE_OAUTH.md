# Google OAuth setup

## Google Cloud Console

Create an OAuth 2.0 Client ID of type **Web application**.

Authorised redirect URIs:

- Local: `http://localhost:8000/api/auth/google/callback/`
- Render: `https://<your-backend-service>.onrender.com/api/auth/google/callback/`

Authorised JavaScript origins are not required for this server-side flow.

## Backend environment

Set these on Render (and in `backend/.env.local` for Docker):

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<your-backend-service>.onrender.com/api/auth/google/callback/
BASE_URL=https://<your-backend-service>.onrender.com
FRONTEND_URL=https://<your-frontend-service>.onrender.com
```

For local Docker:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback/
BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

Restart the backend after changing environment values.

## Frontend environment

The frontend must point at the backend API:

```dotenv
REACT_APP_API_URL=https://<your-backend-service>.onrender.com/api
```

The SPA callback is `/auth/google/callback`; the backend redirects there with a
short-lived one-time ticket. The frontend exchanges that ticket for JWTs.

## Enable the method

1. Sign in as Platform Admin.
2. Go to **Settings → Login methods**.
3. Enable **Google**.
4. Optionally restrict Google per organisation under **Organizations → Edit →
   Allowed login methods**.

Only enabled methods are rendered on the login page, and the backend checks the
same policy again during OAuth start, callback and ticket exchange.
