"""Create the standard deployment users from environment variables.

No passwords are hardcoded. Missing role passwords are skipped, so this
command is safe to run repeatedly and can be enabled per environment.
"""
import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from ticket_bookings.models import UserProfile

ROLES = [
    ('superadmin', 'DJANGO_SUPERADMIN_EMAIL', 'DJANGO_SUPERADMIN_PASSWORD', True, True),
    ('admin', 'DJANGO_ADMIN_EMAIL', 'DJANGO_ADMIN_PASSWORD', False, True),
    ('organizer', 'DJANGO_ORGANIZER_EMAIL', 'DJANGO_ORGANIZER_PASSWORD', False, False),
    ('user', 'DJANGO_USER_EMAIL', 'DJANGO_USER_PASSWORD', False, False),
]


class Command(BaseCommand):
    help = 'Create default users from DJANGO_* environment variables.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all', action='store_true',
            help='Create every role whose email and password env vars are set.',
        )

    def handle(self, *args, **options):
        created = 0
        updated = 0
        skipped = 0
        for username, email_key, password_key, is_super, is_staff in ROLES:
            email = (os.environ.get(email_key) or '').strip()
            password = (os.environ.get(password_key) or '').strip()
            if not email or not password:
                skipped += 1
                self.stdout.write(self.style.WARNING(
                    f'• {username}: skipped (set {email_key} and {password_key})'
                ))
                continue
            if len(password) < 10:
                skipped += 1
                self.stdout.write(self.style.WARNING(
                    f'• {username}: skipped (password must be at least 10 characters)'
                ))
                continue

            user, was_created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'is_superuser': is_super,
                    'is_staff': is_staff,
                    'is_active': True,
                },
            )
            if was_created:
                user.set_password(password)
                created += 1
                self.stdout.write(self.style.SUCCESS(f'✅ Created {username}'))
            else:
                changed = False
                for field, value in (
                    ('email', email),
                    ('is_superuser', is_super),
                    ('is_staff', is_staff),
                    ('is_active', True),
                ):
                    if getattr(user, field) != value:
                        setattr(user, field, value)
                        changed = True
                if changed:
                    user.save()
                    updated += 1
                self.stdout.write(f'• {username}: already exists')
            UserProfile.objects.get_or_create(
                user=user, defaults={'email': email},
            )

        self.stdout.write(self.style.SUCCESS(
            f'Default users: created={created}, updated={updated}, skipped={skipped}'
        ))
