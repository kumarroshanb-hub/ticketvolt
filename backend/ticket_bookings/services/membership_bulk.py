"""
Bulk import of offline memberships.

Tenant admins/staff upload a CSV of people who have paid (or will pay)
offline. Each valid row creates or reuses a User, ensures an
OrganizationMembership(role=MEMBER), and creates a PENDING_OFFLINE
Membership row. The existing offline review screen then activates or
rejects each row — activation remains an owner/admin action.

CSV columns (header aliases are accepted case-insensitively):
    email*            member email (required, unique per org)
    name              full name
    phone             phone (stored on UserProfile if available)
    amount            amount paid offline (optional, default 0)
    offline_reference receipt / bank reference (optional)
    payment_method    cash | offline (default offline)
"""
import csv
import io
import re
import secrets
from decimal import Decimal, InvalidOperation

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from ..models_membership import Membership
from ..models_tenancy import OrganizationMembership

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ROWS = 1000

_HEADER_ALIASES = {
    'email': 'email',
    'e-mail': 'email',
    'mail': 'email',
    'name': 'name',
    'full_name': 'name',
    'fullname': 'name',
    'phone': 'phone',
    'mobile': 'phone',
    'amount': 'amount',
    'fee': 'amount',
    'price': 'amount',
    'offline_reference': 'offline_reference',
    'reference': 'offline_reference',
    'receipt': 'offline_reference',
    'receipt_no': 'offline_reference',
    'payment_method': 'payment_method',
    'method': 'payment_method',
}


class BulkUploadError(ValueError):
    pass


def _normalise_headers(fieldnames):
    mapping = {}
    for raw in fieldnames or []:
        key = str(raw or '').strip().lower().replace(' ', '_')
        target = _HEADER_ALIASES.get(key)
        if target:
            mapping[raw] = target
    return mapping


def _pick(row, mapping, key):
    for original, target in mapping.items():
        if target == key:
            value = row.get(original)
            if value is not None and str(value).strip() != '':
                return str(value).strip()
    return ''


def _username_for(email):
    base = re.sub(r'[^A-Za-z0-9._-]', '', email.split('@')[0] or 'member')[:140]
    base = base or 'member'
    candidate = base
    while User.objects.filter(username=candidate).exists():
        candidate = f'{base}{secrets.token_hex(3)}'
    return candidate


def _split_name(full_name):
    parts = (full_name or '').strip().split(None, 1)
    if not parts:
        return '', ''
    if len(parts) == 1:
        return parts[0], ''
    return parts[0], parts[1]


def _get_or_create_user(email, name):
    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        return user, False

    first_name, last_name = _split_name(name)
    user = User(
        username=_username_for(email),
        email=email,
        first_name=first_name,
        last_name=last_name,
        is_active=True,
    )
    user.set_unusable_password()
    user.save()
    return user, True


def _ensure_org_membership(organization, user):
    membership, created = OrganizationMembership.objects.get_or_create(
        organization=organization,
        user=user,
        defaults={
            'role': OrganizationMembership.OrgRole.MEMBER,
            'is_active': True,
            'removed_at': None,
        },
    )
    if created:
        return membership, True

    # Re-inviting a previously removed user: reactivate the existing row
    # without demoting a higher role (e.g. a former staff member).
    if membership.removed_at is not None or not membership.is_active:
        membership.removed_at = None
        membership.is_active = True
        membership.save(update_fields=['removed_at', 'is_active'])
    return membership, False


@transaction.atomic
def bulk_import_offline_members(*, organization, tier, file_obj, actor):
    """Parse and persist the uploaded CSV. Returns a result summary.

    Each row gets its own savepoint, so one bad row does not roll back
    the whole batch. Rows are never auto-activated: they land in the
    existing Pending Offline review queue.
    """
    raw = file_obj.read()
    if len(raw) > MAX_FILE_BYTES:
        raise BulkUploadError('File is larger than 2 MB.')

    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise BulkUploadError('File must be UTF-8 CSV.')

    reader = csv.DictReader(io.StringIO(text))
    mapping = _normalise_headers(reader.fieldnames)
    if 'email' not in mapping.values():
        raise BulkUploadError(
            'CSV must contain an "email" column. '
            'Expected headers: email,name,phone,amount,offline_reference.'
        )

    created = []
    skipped = []
    errors = []
    users_created = 0
    now = timezone.now()

    for index, row in enumerate(reader, start=2):
        if index - 1 > MAX_ROWS:
            errors.append({
                'row': index,
                'email': '',
                'error': f'Row limit exceeded ({MAX_ROWS}).',
            })
            break

        email = _pick(row, mapping, 'email').lower()
        if not email:
            # Blank trailing lines are common; don't report them.
            if any(str(v or '').strip() for v in row.values()):
                errors.append({'row': index, 'email': '', 'error': 'Missing email.'})
            continue

        try:
            validate_email(email)
        except ValidationError:
            errors.append({'row': index, 'email': email, 'error': 'Invalid email.'})
            continue

        name = _pick(row, mapping, 'name')
        phone = _pick(row, mapping, 'phone')
        reference = _pick(row, mapping, 'offline_reference')[:128]
        payment_method = _pick(row, mapping, 'payment_method').lower() or 'offline'
        if payment_method not in ('cash', 'offline'):
            errors.append({
                'row': index,
                'email': email,
                'error': 'payment_method must be "cash" or "offline".',
            })
            continue

        raw_amount = _pick(row, mapping, 'amount')
        try:
            amount = Decimal(raw_amount) if raw_amount else Decimal('0.00')
        except (InvalidOperation, TypeError):
            errors.append({'row': index, 'email': email, 'error': 'Invalid amount.'})
            continue
        if amount < 0:
            errors.append({'row': index, 'email': email, 'error': 'Amount cannot be negative.'})
            continue

        try:
            with transaction.atomic():
                user, user_created = _get_or_create_user(email, name)
                if user_created:
                    users_created += 1

                _ensure_org_membership(organization, user)

                if Membership.active_for(user, organization) is not None:
                    skipped.append({
                        'row': index,
                        'email': email,
                        'reason': 'Already has an active membership.',
                    })
                    continue

                if Membership.objects.filter(
                    organization=organization,
                    user=user,
                    status=Membership.Status.PENDING_OFFLINE,
                ).exists():
                    skipped.append({
                        'row': index,
                        'email': email,
                        'reason': 'Already has a pending offline request.',
                    })
                    continue

                membership = Membership.objects.create(
                    organization=organization,
                    user=user,
                    tier=tier,
                    price_paid=amount,
                    currency_code=tier.currency_code or organization.currency_code,
                    status=Membership.Status.PENDING_OFFLINE,
                    payment_method=payment_method,
                    offline_reference=reference,
                    started_at=now,
                    valid_until=None,
                )
                created.append({
                    'row': index,
                    'membership_id': str(membership.id),
                    'email': email,
                    'name': name,
                    'user_created': user_created,
                })
        except Exception as exc:  # per-row isolation
            errors.append({
                'row': index,
                'email': email,
                'error': str(exc)[:300] or 'Could not import row.',
            })

    return {
        'created_count': len(created),
        'skipped_count': len(skipped),
        'error_count': len(errors),
        'users_created': users_created,
        'created': created,
        'skipped': skipped,
        'errors': errors,
        'tier_id': str(tier.id),
        'tier_name': tier.name,
    }
