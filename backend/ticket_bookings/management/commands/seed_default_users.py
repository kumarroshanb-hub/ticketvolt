"""Create the standard deployment users and their organization roles.

Roles in this project are split into two layers:

* Platform: Platform Admin = User.is_superuser; Regular User = neither
  is_superuser nor is_staff.
* Organization: Owner / Admin / Finance / Staff / Member, stored on
  OrganizationMembership. Owner is an Admin membership with is_owner=True.

No passwords are hardcoded. Missing role passwords are skipped.
"""
import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from ticket_bookings.models import UserProfile
from ticket_bookings.models_tenancy import (
    Organization,
    OrganizationMembership,
    OrgRole,
)

ROLES = [
    # key, email env, password env, platform admin?, org role
    ('superadmin', 'DJANGO_SUPERADMIN_EMAIL', 'DJANGO_SUPERADMIN_PASSWORD', True, None),
    ('owner', 'DJANGO_OWNER_EMAIL', 'DJANGO_OWNER_PASSWORD', False, 'owner'),
    ('admin', 'DJANGO_ADMIN_EMAIL', 'DJANGO_ADMIN_PASSWORD', False, 'admin'),
    ('finance', 'DJANGO_FINANCE_EMAIL', 'DJANGO_FINANCE_PASSWORD', False, 'finance'),
    ('staff', 'DJANGO_STAFF_EMAIL', 'DJANGO_STAFF_PASSWORD', False, 'staff'),
    ('member', 'DJANGO_MEMBER_EMAIL', 'DJANGO_MEMBER_PASSWORD', False, 'member'),
    ('user', 'DJANGO_USER_EMAIL', 'DJANGO_USER_PASSWORD', False, None),
]


def _first_env(*names):
    for name in names:
        value = (os.environ.get(name) or '').strip()
        if value:
            return value
    return ''


class Command(BaseCommand):
    help = 'Create default platform users and organization memberships from environment variables.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all', action='store_true',
            help='Create every role whose email and password env vars are set.',
        )
        parser.add_argument(
            '--reset-passwords', action='store_true',
            help='Reset passwords for existing seeded users to the configured env values.',
        )

    def _seed_org(self):
        name = (os.environ.get('DJANGO_ORG_NAME') or 'Demo Organization').strip()
        org = Organization.objects.filter(name=name).first()
        if org is None:
            org = Organization.objects.create(name=name)
            self.stdout.write(self.style.SUCCESS(f'✅ Created organization {org.name}'))
        return org

    def _membership(self, org, user, role):
        if role is None:
            return
        membership = OrganizationMembership.objects.filter(
            organization=org, user=user,
        ).first()
        is_owner = role == 'owner'
        actual_role = OrgRole.ADMIN if is_owner else role
        if is_owner and OrganizationMembership.objects.filter(
            organization=org, is_owner=True, removed_at__isnull=True,
        ).exclude(user=user).exists():
            self.stdout.write(self.style.WARNING(
                f'⚠️ {org.name} already has an owner; {user.username} kept as Admin.'
            ))
            is_owner = False
            actual_role = OrgRole.ADMIN
        defaults = {
            'role': actual_role,
            'is_owner': is_owner,
            'is_active': True,
            'valid_from': timezone.now(),
            'removed_at': None,
        }
        if membership is None:
            OrganizationMembership.objects.create(
                organization=org, user=user, **defaults,
            )
            return
        membership.role = actual_role
        membership.is_owner = is_owner
        membership.is_active = True
        membership.removed_at = None
        membership.save(update_fields=['role', 'is_owner', 'is_active', 'removed_at'])

    def handle(self, *args, **options):
        created = 0
        updated = 0
        skipped = 0
        org = None
        superadmin_user = None

        for username, email_key, password_key, platform_admin, org_role in ROLES:
            if username == 'superadmin':
                email = _first_env('DJANGO_SUPERADMIN_EMAIL', 'DJANGO_SUPERUSER_EMAIL', 'SUPERADMIN_EMAIL', 'SUPER_ADMIN_EMAIL')
                password = _first_env('DJANGO_SUPERADMIN_PASSWORD', 'DJANGO_SUPERUSER_PASSWORD', 'SUPERADMIN_PASSWORD', 'SUPER_ADMIN_PASSWORD')
            else:
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
                    'is_superuser': platform_admin,
                    'is_staff': platform_admin,
                    'is_active': True,
                },
            )
            if was_created:
                user.set_password(password)
                created += 1
                self.stdout.write(self.style.SUCCESS(f'✅ Created {username}'))
            else:
                if options.get('reset_passwords'):
                    user.set_password(password)
                    user.save(update_fields=['password'])
                    self.stdout.write(self.style.SUCCESS(f'🔑 Password reset for {username}'))
                else:
                    self.stdout.write(self.style.WARNING(
                        f'🔒 {username}: password unchanged. Rerun with '
                        '--reset-passwords to apply the env password.'
                    ))
                changed = False
                for field, value in (
                    ('email', email),
                    ('is_superuser', platform_admin),
                    ('is_staff', platform_admin),
                    ('is_active', True),
                ):
                    if getattr(user, field) != value:
                        setattr(user, field, value)
                        changed = True
                if changed:
                    user.save()
                    updated += 1
                self.stdout.write(f'• {username}: already exists')
            UserProfile.objects.get_or_create(user=user, defaults={'email': email})

            if platform_admin:
                superadmin_user = user

            if org_role is not None:
                org = org or self._seed_org()
                self._membership(org, user, org_role)

        # Platform Admins are platform-wide and must not hold organization
        # memberships. If an existing owner membership is found, transfer the
        # owner seat to the seeded 'owner' user before removing the superuser
        # membership. This also cleans up old deployments created before the
        # platform/tenant separation.
        if superadmin_user is not None:
            owner_user = User.objects.filter(username='owner').first()
            memberships = list(
                OrganizationMembership.objects.filter(user=superadmin_user)
                .select_related('organization')
            )
            for membership in memberships:
                if membership.is_owner and owner_user is not None:
                    # Demote the superuser first so the one-live-owner
                    # constraint never sees two owners at once.
                    membership.is_owner = False
                    membership.save(update_fields=['is_owner'])
                    owner_membership = OrganizationMembership.objects.filter(
                        organization=membership.organization, user=owner_user,
                    ).first()
                    if owner_membership is None:
                        OrganizationMembership.objects.create(
                            organization=membership.organization,
                            user=owner_user,
                            role=OrgRole.ADMIN,
                            is_owner=True,
                            is_active=True,
                            valid_from=timezone.now(),
                        )
                    else:
                        owner_membership.role = OrgRole.ADMIN
                        owner_membership.is_owner = True
                        owner_membership.is_active = True
                        owner_membership.removed_at = None
                        owner_membership.save(update_fields=[
                            'role', 'is_owner', 'is_active', 'removed_at',
                        ])
                    self.stdout.write(self.style.SUCCESS(
                        f'🔁 Transferred {membership.organization.name} ownership to owner'
                    ))
                membership.delete()
                self.stdout.write(self.style.SUCCESS(
                    '🧹 Removed superuser organization membership'
                ))

        self.stdout.write(self.style.SUCCESS(
            f'Default users: created={created}, updated={updated}, skipped={skipped}'
        ))
