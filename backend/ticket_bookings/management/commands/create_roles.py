# backend/ticket_bookings/management/commands/create_roles.py
import os
import sys

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from ticket_bookings.models import UserProfile
# ADDED FOR 6-TIER HIERARCHY: tenancy models
from ticket_bookings.models_tenancy import Organization, OrganizationMembership, OrgRole


class Command(BaseCommand):
    help = 'Create users with different roles using passwords from environment variables'

    # Environment variable names for each role's password.
    ENV_SUPERADMIN_PASSWORD = 'DJANGO_SUPERADMIN_PASSWORD'
    ENV_ADMIN_PASSWORD      = 'DJANGO_ADMIN_PASSWORD'
    ENV_ORGANIZER_PASSWORD  = 'DJANGO_ORGANIZER_PASSWORD'  # KEPT: legacy alias for owner
    ENV_OWNER_PASSWORD      = 'DJANGO_OWNER_PASSWORD'      # ADDED FOR 6-TIER HIERARCHY
    ENV_STAFF_PASSWORD      = 'DJANGO_STAFF_PASSWORD'      # ADDED FOR 6-TIER HIERARCHY
    ENV_MEMBER_PASSWORD     = 'DJANGO_MEMBER_PASSWORD'     # ADDED FOR 6-TIER HIERARCHY
    ENV_USER_PASSWORD       = 'DJANGO_USER_PASSWORD'

    # ✅ Email addresses from env vars, with sensible non-PII defaults for local dev
    ENV_SUPERADMIN_EMAIL = 'DJANGO_SUPERADMIN_EMAIL'
    ENV_ADMIN_EMAIL      = 'DJANGO_ADMIN_EMAIL'
    ENV_ORGANIZER_EMAIL  = 'DJANGO_ORGANIZER_EMAIL'  # KEPT: legacy alias for owner
    ENV_OWNER_EMAIL      = 'DJANGO_OWNER_EMAIL'      # ADDED FOR 6-TIER HIERARCHY
    ENV_STAFF_EMAIL      = 'DJANGO_STAFF_EMAIL'      # ADDED FOR 6-TIER HIERARCHY
    ENV_MEMBER_EMAIL     = 'DJANGO_MEMBER_EMAIL'     # ADDED FOR 6-TIER HIERARCHY
    ENV_USER_EMAIL       = 'DJANGO_USER_EMAIL'

    # ADDED FOR 6-TIER HIERARCHY: default org name for owner creation
    DEFAULT_ORG_NAME = 'Demo Organization'
    ENV_ORG_NAME     = 'DJANGO_ORG_NAME'

    MIN_PASSWORD_LENGTH = 10

    def add_arguments(self, parser):
        parser.add_argument('--superadmin', action='store_true', help='Create super admin')
        parser.add_argument('--admin', action='store_true', help='Create admin')
        # UPDATED FOR 6-TIER HIERARCHY: --organizer kept as alias, --owner added
        parser.add_argument('--organizer', action='store_true', help='Create organizer (alias for --owner)')
        parser.add_argument('--owner', action='store_true', help='Create organization owner')  # ADDED
        parser.add_argument('--staff', action='store_true', help='Create staff member')         # ADDED
        parser.add_argument('--member', action='store_true', help='Create org member')          # ADDED
        parser.add_argument('--user', action='store_true', help='Create regular user')
        parser.add_argument('--all', action='store_true', help='Create all user types')
        # ADDED FOR 6-TIER HIERARCHY: org name override
        parser.add_argument('--org-name', type=str, default=None,
                            help='Organization name for owner (default: Demo Organization)')

    def handle(self, *args, **options):
        create_all = options['all']

        # UPDATED FOR 6-TIER HIERARCHY: expanded role flag check
        role_flags = ('superadmin', 'admin', 'organizer', 'owner', 'staff', 'member', 'user')
        if not create_all and not any(options[k] for k in role_flags):
            self.stdout.write(self.style.WARNING(
                '⚠️  No role flags provided. Use --all or one of: '
                '--superadmin --admin --owner --staff --member --user'
            ))
            return

        if create_all or options['superadmin']:
            self.create_super_admin()

        if create_all or options['admin']:
            self.create_admin()

        # UPDATED FOR 6-TIER HIERARCHY: --organizer is now an alias for --owner
        if create_all or options['organizer'] or options['owner']:
            self.create_owner(org_name=options.get('org_name'))

        # ADDED FOR 6-TIER HIERARCHY: staff and member creation
        if create_all or options['staff']:
            self.create_staff()

        if create_all or options['member']:
            self.create_member()

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

    # UPDATED FOR 6-TIER HIERARCHY: create_organizer → create_owner
    # Now creates an Organization and assigns OWNER membership.
    # The old --organizer flag still works as an alias.
    def create_owner(self, org_name=None):
        username = 'owner'
        # Also check legacy 'organizer' username to avoid duplicates
        if User.objects.filter(username__in=['owner', 'organizer']).exists():
            existing = User.objects.filter(username__in=['owner', 'organizer']).first()
            self._report_skip('Owner', existing.username)
            return

        # ADDED: resolve password — try new env var first, fall back to legacy
        try:
            password = self._get_password(self.ENV_OWNER_PASSWORD, 'owner')
        except CommandError:
            password = self._get_password(self.ENV_ORGANIZER_PASSWORD, 'owner')

        email = self._get_email(self.ENV_OWNER_EMAIL,
                                self._get_email(self.ENV_ORGANIZER_EMAIL, 'owner@example.local'))

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Org',
            last_name='Owner',
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
                'is_organizer': True,  # KEPT: legacy profile flag still used by some views
            },
        )

        # ADDED FOR 6-TIER HIERARCHY: create Organization + OWNER membership
        resolved_org_name = (
            org_name
            or os.environ.get(self.ENV_ORG_NAME, '').strip()
            or self.DEFAULT_ORG_NAME
        )
        slug = resolved_org_name.lower().replace(' ', '-').replace('_', '-')

        org, org_created = Organization.objects.get_or_create(
            name=resolved_org_name,
            defaults={'slug': slug},
        )
        if org_created:
            self.stdout.write(self.style.SUCCESS(
                f'✅ Organization created: {resolved_org_name} ({slug})'
            ))

        membership, mem_created = OrganizationMembership.objects.get_or_create(
            user=user,
            organization=org,
            defaults={'role': OrgRole.OWNER},
        )
        if mem_created:
            self.stdout.write(self.style.SUCCESS(
                f'✅ {email} assigned as OWNER of {resolved_org_name}'
            ))
        elif membership.role != OrgRole.OWNER:
            membership.role = OrgRole.OWNER
            membership.save(update_fields=['role'])
            self.stdout.write(self.style.SUCCESS(
                f'🔄 {email} role updated to OWNER'
            ))

        self._report_success('Owner', user.username)

    # ADDED FOR 6-TIER HIERARCHY: create_staff
    def create_staff(self):
        username = 'staff'
        if User.objects.filter(username=username).exists():
            self._report_skip('Staff', username)
            return

        password = self._get_password(self.ENV_STAFF_PASSWORD, 'staff')
        email = self._get_email(self.ENV_STAFF_EMAIL, 'staff@example.local')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Event',
            last_name='Staff',
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

        # Assign STAFF role to the first available org (or the default demo org)
        org = Organization.objects.filter(slug__startswith='demo').first() \
              or Organization.objects.first()
        if org:
            OrganizationMembership.objects.get_or_create(
                user=user,
                organization=org,
                defaults={'role': OrgRole.STAFF},
            )
            self.stdout.write(self.style.SUCCESS(
                f'✅ {email} assigned as STAFF of {org.name}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'⚠️  No organization found. {email} created but has no org membership. '
                f'Run --owner first to create an organization.'
            ))

        self._report_success('Staff', user.username)

    # ADDED FOR 6-TIER HIERARCHY: create_member
    def create_member(self):
        username = 'member'
        if User.objects.filter(username=username).exists():
            self._report_skip('Member', username)
            return

        password = self._get_password(self.ENV_MEMBER_PASSWORD, 'member')
        email = self._get_email(self.ENV_MEMBER_EMAIL, 'member@example.local')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Org',
            last_name='Member',
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

        # Assign MEMBER role to the first available org
        org = Organization.objects.filter(slug__startswith='demo').first() \
              or Organization.objects.first()
        if org:
            OrganizationMembership.objects.get_or_create(
                user=user,
                organization=org,
                defaults={'role': OrgRole.MEMBER},
            )
            self.stdout.write(self.style.SUCCESS(
                f'✅ {email} assigned as MEMBER of {org.name}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'⚠️  No organization found. {email} created but has no org membership. '
                f'Run --owner first to create an organization.'
            ))

        self._report_success('Member', user.username)

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