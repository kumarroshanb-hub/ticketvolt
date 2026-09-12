# ⚡🎫 TicketVolt - Complete Ticketing System

## 🚀 Quick Start

```bash
# Start all services
docker-compose up -d

# Initialize Django
docker-compose exec django-backend python manage.py migrate
docker-compose exec django-backend python manage.py createsuperuser

# Access the application
# Admin UI: http://localhost:3000/login
# Email: admin@ticketvolt.com
# Password: REDACTED
