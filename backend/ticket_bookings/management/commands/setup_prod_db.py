# backend/ticket_bookings/management/commands/setup_prod_db.py
from django.core.management.base import BaseCommand
from django.db import connection
from django.contrib.auth.models import User
from ticket_bookings.models import UserProfile

class Command(BaseCommand):
    help = 'Setup production hotfixes database with users and roles'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting database setup...'))

        # 1. Ensure is_organizer column exists
        with connection.cursor() as cursor:
            cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='ticket_bookings_userprofile';")
            columns = [row[0] for row in cursor.fetchall()]
            if 'is_organizer' not in columns:
                self.stdout.write(self.style.WARNING('⚠️ Adding is_organizer column...'))
                cursor.execute("ALTER TABLE ticket_bookings_userprofile ADD COLUMN is_organizer BOOLEAN DEFAULT FALSE;")
                self.stdout.write(self.style.SUCCESS('✅ is_organizer column added'))
            else:
                self.stdout.write(self.style.SUCCESS('✅ is_organizer column exists'))

        # 2. Create/Fix all users
        users_config = [
            ('superadmin', 'superadmin@ticketvolt.com', 'SuperAdmin123!', 'Super', 'Admin', True, True, False),
            ('admin', 'admin@ticketvolt.com', 'Admin123!', 'Admin', 'User', False, True, False),
            ('organizer', 'organizer@ticketvolt.com', 'Organizer123!', 'Organizer', 'User', False, False, True),
            ('user', 'user@ticketvolt.com', 'User123!', 'Regular', 'User', False, False, False),
        ]

        created = 0
        fixed = 0
        for username, email, password, first_name, last_name, is_super, is_staff, is_org in users_config:
            user, user_created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'first_name': first_name,
                    'last_name': last_name,
                    'is_superuser': is_super,
                    'is_staff': is_staff or is_super,
                    'is_active': True
                }
            )
            if user_created:
                user.set_password(password)
                user.save()
                created += 1
                self.stdout.write(self.style.SUCCESS(f'✅ Created: {username}'))
            
            # Create/fix profile
            profile, prof_created = UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'email': email,
                    'is_organizer': is_org,
                    'phone': '+919876543210',
                    'whatsapp_number': '+919876543210',
                    'city': 'Mumbai' if is_org else 'Delhi',
                    'state': 'Maharashtra' if is_org else 'Delhi',
                    'country': 'India'
                }
            )
            if not prof_created and profile.is_organizer != is_org:
                profile.is_organizer = is_org
                profile.save()
                fixed += 1
                self.stdout.write(self.style.SUCCESS(f'✅ Fixed profile: {username} (is_organizer={is_org})'))

        self.stdout.write(self.style.SUCCESS(f'📊 Created {created} user(s), fixed {fixed} profile(s)'))

        # 3. Additional: Fix any users with 'organizer' in email/username
        extra_fixed = 0
        for user in User.objects.filter(username__icontains='organizer') | User.objects.filter(email__icontains='organizer'):
            if user.username not in ['organizer', 'superadmin', 'admin']:
                profile, _ = UserProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        'email': user.email,
                        'is_organizer': True,
                        'phone': '+919876543210',
                        'whatsapp_number': '+919876543210',
                        'city': 'Mumbai',
                        'state': 'Maharashtra',
                        'country': 'India'
                    }
                )
                if not profile.is_organizer:
                    profile.is_organizer = True
                    profile.save()
                    extra_fixed += 1
                    self.stdout.write(self.style.SUCCESS(f'✅ Extra fix: {user.username}'))
        
        self.stdout.write(self.style.SUCCESS(f'📊 Extra organizer fixes: {extra_fixed}'))
        self.stdout.write(self.style.SUCCESS('✅ Database setup complete!'))