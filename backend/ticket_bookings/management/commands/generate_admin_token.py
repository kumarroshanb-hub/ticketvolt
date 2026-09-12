# backend/ticket_bookings/management/commands/generate_admin_token.py
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

class Command(BaseCommand):
    help = 'Generate admin token for WhatsApp gateway'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default='whatsapp_bot',
            help='Username for the service account'
        )
        parser.add_argument(
            '--email',
            type=str,
            default='whatsapp@ticketvolt.com',
            help='Email for the service account'
        )
        parser.add_argument(
            '--create',
            action='store_true',
            help='Create user if not exists'
        )

    def handle(self, *args, **options):
        username = options['username']
        email = options['email']
        create = options['create']
        
        try:
            user = User.objects.get(username=username)
            self.stdout.write(self.style.SUCCESS(f"✅ User found: {username}"))
        except User.DoesNotExist:
            if create:
                password = input("Enter password for the new user: ")
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=password
                )
                user.is_active = True
                user.save()
                self.stdout.write(self.style.SUCCESS(f"✅ User created: {username}"))
            else:
                self.stdout.write(self.style.ERROR(f"❌ User '{username}' not found. Use --create to create a new user."))
                return
        
        # Generate token
        refresh = RefreshToken.for_user(user)
        token = str(refresh.access_token)
        refresh_token = str(refresh)
        
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("🔑 ADMIN TOKEN GENERATED"))
        self.stdout.write("=" * 60)
        self.stdout.write(f"\nAccess Token:\n{token}\n")
        self.stdout.write(f"Refresh Token:\n{refresh_token}\n")
        self.stdout.write("=" * 60)
        self.stdout.write(f"Username: {username}")
        self.stdout.write(f"Email: {email}")
        self.stdout.write("=" * 60)