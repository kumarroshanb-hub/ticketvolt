# TicketVolt Cloud Deployment

## Stack
- **DB:** Neon (PostgreSQL)
- **Backend:** Render Web Service (Docker)
- **Frontend:** Render Static Site
- **WhatsApp:** Fly.io (pending)

## URLs
- Frontend: https://your-frontend.onrender.com
- Backend: https://ticketvault-backend-service.onrender.com

## Deploy Steps
1. Push to `Production_Release` branch
2. Render auto-builds both services
3. If migrations changed: `git add -f backend/*/migrations/*.py`

## Env Vars (Backend)
- ENVIRONMENT=production
- DEBUG=False
- DB_HOST=neon.tech
- CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com
- ...

## Env Vars (Frontend)
- REACT_APP_API_URL=https://ticketvault-backend-service.onrender.com/api

## Default Logins
- superadmin@ticketvolt.com / REDACTED
- admin@ticketvolt.com / REDACTED
- organizer@ticketvolt.com / REDACTED
- user@ticketvolt.com / REDACTED

## Troubleshooting
- Backend sleeps after 15 min → UptimeRobot
- Migrations missing → `git add -f backend/*/migrations/*.py`
- CORS errors → check CORS_ALLOWED_ORIGINS on Render