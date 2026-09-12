# backend/core/celery.py
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

app = Celery('ticketvolt')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')

# ============================================
# CELERY BEAT SCHEDULE
# ============================================
app.conf.beat_schedule = {
    # Update event status to completed/sold_out
    'update-event-status-every-hour': {
        'task': 'ticket_bookings.tasks.update_event_status',
        'schedule': crontab(minute=0, hour='*'),  # Run every hour at minute 0
    },
    
    # Update completed events more frequently (every 15 minutes)
    'update-completed-events-every-15-min': {
        'task': 'ticket_bookings.tasks.update_completed_events',
        'schedule': crontab(minute='*/15'),  # Run every 15 minutes
    },
    
    # Update sold out events every 30 minutes
    'update-sold-out-events-every-30-min': {
        'task': 'ticket_bookings.tasks.update_sold_out_events',
        'schedule': crontab(minute='*/30'),  # Run every 30 minutes
    },
}