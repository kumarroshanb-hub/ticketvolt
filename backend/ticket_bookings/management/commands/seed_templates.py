# backend/ticket_bookings/management/commands/seed_templates.py
from django.core.management.base import BaseCommand
from ticket_bookings.models import EventTemplateType
import uuid

class Command(BaseCommand):
    help = 'Seed template types for events'

    def handle(self, *args, **options):
        types = [
            {'slug': 'announcement', 'name': 'Event Announcement', 'icon': '📢'},
            {'slug': 'ticket', 'name': 'Ticket', 'icon': '🎫'},
            {'slug': 'flyer', 'name': 'Flyer/Poster', 'icon': '📄'},
            {'slug': 'social', 'name': 'Social Media', 'icon': '📱'},
            {'slug': 'invite', 'name': 'Invitation', 'icon': '💌'},
            {'slug': 'certificate', 'name': 'Certificate', 'icon': '🏆'},
        ]
        
        created_count = 0
        for type_data in types:
            obj, created = EventTemplateType.objects.get_or_create(
                slug=type_data['slug'],
                defaults={
                    'name': type_data['name'],
                    'icon': type_data['icon'],
                    'is_active': True
                }
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'✅ Created template type: {obj.name}'))
                created_count += 1
            else:
                self.stdout.write(f'⏭️ Template type already exists: {obj.name}')
        
        if created_count > 0:
            self.stdout.write(self.style.SUCCESS(f'✅ Created {created_count} template types successfully!'))
        else:
            self.stdout.write(self.style.WARNING('⚠️ All template types already exist. No changes made.'))