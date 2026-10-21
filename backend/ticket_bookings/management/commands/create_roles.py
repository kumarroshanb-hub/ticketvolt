# backend/ticket_bookings/management/commands/create_roles.py
import os
import sys

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from ticket_bookings.models import UserProfile


class Command(BaseCommand):
    help = 'Create users with different roles using passwords from environment variables'

    # Environment variable names for each role's password.
    ENV_SUPERADMIN_PASSWORD = 'DJANGO_SUPERADMIN_PASSWORD'
    ENV_ADMIN_PASSWORD      = 'DJANGO_ADMIN_PASSWORD'
    ENV_ORGANIZER_PASSWORD  = 'DJANGO_ORGANIZER_PASSWORD'
    ENV_USER_PASSWORD       = 'DJANGO_USER_PASSWORD'

    # ✅ Email addresses from env vars, with sensible non-PII defaults for local dev
    ENV_SUPERADMIN_EMAIL = 'DJANGO_SUPERADMIN_EMAIL'
    ENV_ADMIN_EMAIL      = 'DJANGO_ADMIN_EMAIL'
    ENV_ORGANIZER_EMAIL  = 'DJANGO_ORGANIZER_EMAIL'
    ENV_USER_EMAIL       = 'DJANGO_USER_EMAIL'

    MIN_PASSWORD_LENGTH = 12

    def add_arguments(self, parser):
        parser.add_argument('--superadmin', action='store_true', help='Create super admin')
        parser.add_argument('--admin', action='store_true', help='Create admin')
        parser.add_argument('--organizer', action='store_true', help='Create organizer')
        parser.add_argument('--user', action='store_true', help='Create regular user')
        parser.add_argument('--all', action='store_true', help='Create all user types')

    def handle(self, *args, **options):
        create_all = options['all']

        if not create_all and not any(
            options[k] for k in ('superadmin', 'admin', 'organizer', 'user')
        ):
            self.stdout.write(self.style.WARNING(
                '⚠️  No role flags provided. Use --all or one of: '
                '--superadmin --admin --organizer --user'
            ))
            return

        if create_all or options['superadmin']:
            self.create_super_admin()

        if create_all or options['admin']:
            self.create_admin()

        if create_all or options['organizer']:
            self.create_organizer()

        if create_all or options['user']:
            self.create_regular_user()

    def _get_password(self, env_var: str, role: str) -> str:
        password = os.environ.get(env_var, '').strip()

        if not password:
            raise CommandError(
                f"❌ Cannot create {role}: environment variable '{env_var}' "
                f"is not set or is empty.\n"
                f"   Set it before running this command, e.g.:\n"
                f"     export {env_var}='a-very-long-random-password'\n"
                f"   or pass it inline:\n"
                f"     {env_var}='...' python manage.py create_roles --{role}"
            )

        if len(password) < self.MIN_PASSWORD_LENGTH:
            raise CommandError(
                f"❌ Password for {role} is too short "
                f"(must be at least {self.MIN_PASSWORD_LENGTH} characters)."
            )

        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError(
                f"❌ Password for {role} failed validation: "
                + ' | '.join(exc.messages)
            )

        return password

    def _get_email(self, env_var: str, default: str) -> str:
        """
        Read email from env var. Falls back to a safe placeholder for local dev.
        In production, always set the env var so real users get real emails.
        """
        return os.environ.get(env_var, '').strip() or default

    def _report_skip(self, role: str, username: str) -> None:
        self.stdout.write(self.style.WARNING(
            f'⚠️  {role} already exists: {username} (skipping)'
        ))

    def _report_success(self, role: str, username: str) -> None:
        self.stdout.write(self.style.SUCCESS(
            f'✅ {role} created: {username}'
        ))

    # ------------------------------------------------------------------
    # Role creators
    # ------------------------------------------------------------------
    def create_super_admin(self):
        username = 'superadmin'
        if User.objects.filter(username=username).exists():
            self._report_skip('Super Admin', username)
            return

        password = self._get_password(self.ENV_SUPERADMIN_PASSWORD, 'superadmin')
        email = self._get_email(self.ENV_SUPERADMIN_EMAIL, 'superadmin@example.local')

        user = User.objects.create_superuser(
            username=username,
            email=email,
            password=password,
            first_name='Super',
            last_name='Admin',
        )
        self._report_success('Super Admin', user.username)

    def create_admin(self):
        username = 'admin'
        if User.objects.filter(username=username).exists():
            self._report_skip('Admin', username)
            return

        password = self._get_password(self.ENV_ADMIN_PASSWORD, 'admin')
        email = self._get_email(self.ENV_ADMIN_EMAIL, 'admin@example.local')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Admin',
            last_name='User',
        )
        user.is_staff = True
        user.save(update_fields=['is_staff'])
        self._report_success('Admin', user.username)

    def create_organizer(self):
        username = 'organizer'
        if User.objects.filter(username=username).exists():
            self._report_skip('Organizer', username)
            return

        password = self._get_password(self.ENV_ORGANIZER_PASSWORD, 'organizer')
        email = self._get_email(self.ENV_ORGANIZER_EMAIL, 'organizer@example.local')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Organizer',
            last_name='User',
        )

        UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'email': email,
                'phone': '',
                'whatsapp_number': '',
                'city': '',
                'state': '',
                'country': 'India',
                'is_organizer': True,
            },
        )
        self._report_success('Organizer', user.username)

    def create_regular_user(self):
        username = 'user'
        if User.objects.filter(username=username).exists():
            self._report_skip('Regular User', username)
            return

        password = self._get_password(self.ENV_USER_PASSWORD, 'user')
        email = self._get_email(self.ENV_USER_EMAIL, 'user@example.local')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Regular',
            last_name='User',
        )

        UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'email': email,
                'phone': '',
                'whatsapp_number': '',
                'city': '',
                'state': '',
                'country': 'India',
                'is_organizer': False,
            },
        )
        self._report_success('Regular User', user.username)