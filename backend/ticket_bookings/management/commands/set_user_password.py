"""Safely set a user's password through Django's password hasher."""
import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Set a user password using Django password hashing (not raw SQL).'

    def add_arguments(self, parser):
        parser.add_argument('--email', help='User email address')
        parser.add_argument('--username', help='Username (alternative to email)')
        parser.add_argument('--password', help='New password (or set USER_PASSWORD)')

    def handle(self, *args, **options):
        email = (options.get('email') or '').strip()
        username = (options.get('username') or '').strip()
        password = options.get('password') or os.environ.get('USER_PASSWORD') or ''
        if not email and not username:
            raise CommandError('Pass --email or --username.')
        if not password:
            raise CommandError('Pass --password or set USER_PASSWORD.')
        if len(password) < 10:
            raise CommandError('Password must be at least 10 characters.')

        users = User.objects.all()
        if email:
            users = users.filter(email__iexact=email)
        if username:
            users = users.filter(username=username)
        user = users.first()
        if user is None:
            raise CommandError('User not found.')

        user.set_password(password)
        user.is_active = True
        user.save(update_fields=['password', 'is_active'])
        user.refresh_from_db()
        if not user.check_password(password):
            raise CommandError('Password verification failed after save.')
        self.stdout.write(self.style.SUCCESS(
            f'✅ Password updated and verified for {user.username} <{user.email}>'
        ))
