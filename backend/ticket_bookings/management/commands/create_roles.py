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
    # These MUST be set in the environment (or .env loaded by settings)
    # when the corresponding role is being created.
    ENV_SUPERADMIN_PASSWORD = 'DJANGO_SUPERADMIN_PASSWORD'
    ENV_ADMIN_PASSWORD      = 'DJANGO_ADMIN_PASSWORD'
    ENV_ORGANIZER_PASSWORD  = 'DJANGO_ORGANIZER_PASSWORD'
    ENV_USER_PASSWORD       = 'DJANGO_USER_PASSWORD'

    # Minimum length enforced at the command level in addition to Django validators.
    MIN_PASSWORD_LENGTH = 12

    def add_arguments(self, parser):
        parser.add_argument('--superadmin', action='store_true', help='Create super admin')
        parser.add_argument('--admin', action='store_true', help='Create admin')
        parser.add_argument('--organizer', action='store_true', help='Create organizer')
        parser.add_argument('--user', action='store_true', help='Create regular user')
        parser.add_argument('--all', action='store_true', help='Create all user types')

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        create_all = options['all']

        # Warn loudly if the operator didn't ask for anything specific.
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

    # ------------------------------------------------------------------
    # Password loading + validation helpers
    # ------------------------------------------------------------------
    def _get_password(self, env_var: str, role: str) -> str:
        """
        Load a password from the environment and validate it.

        Fails with CommandError if:
          - the env var is missing or empty
          - the password is too short
          - the password fails Django's password validators

        The password is NEVER printed to stdout/stderr.
        """
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

        # Run Django's configured password validators (UserAttributeSimilarity,
        # MinimumLength, CommonPassword, NumericPassword).
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError(
                f"❌ Password for {role} failed validation: "
                + ' | '.join(exc.messages)
            )

        return password

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

        user = User.objects.create_superuser(
            username=username,
            email='superadmin@ticketvolt.com',
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

        user = User.objects.create_user(
            username=username,
            email='admin@ticketvolt.com',
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

        user = User.objects.create_user(
            username=username,
            email='organizer@ticketvolt.com',
            password=password,
            first_name='Organizer',
            last_name='User',
        )

        UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'email': 'organizer@ticketvolt.com',
                'phone': '+919876543210',
                'whatsapp_number': '+919876543210',
                'city': 'Mumbai',
                'state': 'Maharashtra',
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

        user = User.objects.create_user(
            username=username,
            email='user@ticketvolt.com',
            password=password,
            first_name='Regular',
            last_name='User',
        )

        UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'email': 'user@ticketvolt.com',
                'phone': '+919876543211',
                'whatsapp_number': '+919876543211',
                'city': 'Delhi',
                'state': 'Delhi',
                'country': 'India',
                'is_organizer': False,
            },
        )
        self._report_success('Regular User', user.username)