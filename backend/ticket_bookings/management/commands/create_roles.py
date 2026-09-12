# backend/ticket_bookings/management/commands/create_roles.py
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from ticket_bookings.models import UserProfile

class Command(BaseCommand):
    help = 'Create users with different roles'

    def add_arguments(self, parser):
        parser.add_argument('--superadmin', action='store_true', help='Create super admin')
        parser.add_argument('--admin', action='store_true', help='Create admin')
        parser.add_argument('--organizer', action='store_true', help='Create organizer')
        parser.add_argument('--user', action='store_true', help='Create regular user')
        parser.add_argument('--all', action='store_true', help='Create all user types')

    def handle(self, *args, **options):
        if options['all'] or options['superadmin']:
            self.create_super_admin()
        
        if options['all'] or options['admin']:
            self.create_admin()
        
        if options['all'] or options['organizer']:
            self.create_organizer()
        
        if options['all'] or options['user']:
            self.create_regular_user()

    def create_super_admin(self):
        if not User.objects.filter(username='superadmin').exists():
            user = User.objects.create_superuser(
                username='superadmin',
                email='superadmin@ticketvolt.com',
                password='REDACTED',
                first_name='Super',
                last_name='Admin'
            )
            self.stdout.write(self.style.SUCCESS(f'✅ Super Admin created: {user.username}'))
        else:
            self.stdout.write(self.style.WARNING('⚠️ Super Admin already exists'))

    def create_admin(self):
        if not User.objects.filter(username='admin').exists():
            user = User.objects.create_user(
                username='admin',
                email='admin@ticketvolt.com',
                password='REDACTED',
                first_name='Admin',
                last_name='User'
            )
            user.is_staff = True
            user.save()
            self.stdout.write(self.style.SUCCESS(f'✅ Admin created: {user.username}'))
        else:
            self.stdout.write(self.style.WARNING('⚠️ Admin already exists'))

    def create_organizer(self):
        if not User.objects.filter(username='organizer').exists():
            user = User.objects.create_user(
                username='organizer',
                email='organizer@ticketvolt.com',
                password='REDACTED',
                first_name='Organizer',
                last_name='User'
            )
            user.save()
            
            # ✅ FIX: Set is_organizer=True
            UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'email': 'organizer@ticketvolt.com',
                    'phone': '+919876543210',
                    'whatsapp_number': '+919876543210',
                    'city': 'Mumbai',
                    'state': 'Maharashtra',
                    'country': 'India',
                    'is_organizer': True  # ✅ ADD THIS
                }
            )
            self.stdout.write(self.style.SUCCESS(f'✅ Organizer created: {user.username}'))
        else:
            self.stdout.write(self.style.WARNING('⚠️ Organizer already exists'))

    def create_regular_user(self):
        if not User.objects.filter(username='user').exists():
            user = User.objects.create_user(
                username='user',
                email='user@ticketvolt.com',
                password='REDACTED',
                first_name='Regular',
                last_name='User'
            )
            user.save()
            
            UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'email': 'user@ticketvolt.com',
                    'phone': '+919876543211',
                    'whatsapp_number': '+919876543211',
                    'city': 'Delhi',
                    'state': 'Delhi',
                    'country': 'India',
                    'is_organizer': False
                }
            )
            self.stdout.write(self.style.SUCCESS(f'✅ Regular User created: {user.username}'))
        else:
            self.stdout.write(self.style.WARNING('⚠️ Regular User already exists'))