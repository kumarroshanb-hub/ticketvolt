# backend/ticket_bookings/api/membership_api.py
"""
Membership endpoints.

Buyer-facing:
  POST   /api/memberships/checkout/                              — start a signup
  POST   /api/memberships/verify/                                — sync payment verify
  GET    /api/memberships/mine/                                  — list my memberships
  GET    /api/memberships/<id>/                                  — detail + dependents
  POST   /api/memberships/<id>/cancel/                           — cancel auto-renewal
  POST   /api/memberships/<id>/dependents/                       — add a dependent
  DELETE /api/memberships/<id>/dependents/<dep_id>/              — remove a dependent
  POST   /api/memberships/<id>/dependents/<dep_id>/promote/      — promote to full user

Org manager:
  GET    /api/memberships/org-members/                           — list members of my org(s)

Owner/Admin review (offline / cash):
  GET    /api/memberships/pending-offline/                       — pending queue
  POST   /api/memberships/<id>/review/                           — activate/reject one
  POST   /api/memberships/bulk-review/                           — activate/reject many

Tier CRUD (Owner/Admin):
  GET/POST         /api/membership-tiers/
  GET/PATCH/DELETE /api/membership-tiers/<id>/
"""
import logging

from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction

from rest_framework import status, viewsets
from rest_framework.decorators import (
    action, api_view, parser_classes, permission_classes,
)
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models_membership import (
    Membership,
    MembershipDependent,
    MembershipPayment,
    MembershipTier,
)
from ..models_tenancy import Organization
from ..services import membership_fulfillment
from ..services.membership_bulk import (
    BulkUploadError,
    bulk_import_offline_members,
)
from ..services.membership_fulfillment import (
    MembershipReviewError,
    activate_offline_membership,
    reject_offline_membership,
)
from ..services.payments import get_provider
from ..services.tenancy import (
    can_manage_org,
    can_operate_org,
    is_platform_admin,
    user_membership_org_ids,
    user_org_ids,
)

from .serializers import (
    MembershipDependentSerializer,
    MembershipPaymentSerializer,   # noqa: F401 — re-exported for future use
    MembershipSerializer,
    MembershipTierSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tier management (Owner/Admin)
# ---------------------------------------------------------------------------

class MembershipTierViewSet(viewsets.ModelViewSet):
    """
    CRUD for the tiers an organization offers.

    Visibility rules:
      • Platform admin      → every tier in every org.
      • Org Owner / Admin   → every tier in their org(s) (incl. inactive).
      • Org Staff / Member  → only ACTIVE tiers in their org(s).
      • Everyone else       → only public + active tiers.

    Mutations require Owner/Admin of the tier's organization (or
    platform admin), enforced in `_resolve_org` and the perform_* hooks.
    """
    serializer_class = MembershipTierSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MembershipTier.objects.select_related('organization')

        org_id = self.request.query_params.get('organization_id')
        if org_id:
            qs = qs.filter(organization_id=org_id)

        user = self.request.user

        if is_platform_admin(user):
            return qs

        manager_org_ids = set(user_org_ids(user))
        member_org_ids = set(user_membership_org_ids(user))
        non_manager_org_ids = member_org_ids - manager_org_ids

        conditions = Q(is_public=True, is_active=True)

        if manager_org_ids:
            conditions |= Q(organization_id__in=manager_org_ids)

        if non_manager_org_ids:
            conditions |= Q(organization_id__in=non_manager_org_ids, is_active=True)

        return qs.filter(conditions).distinct()

    def _resolve_org(self, raw_org_id):
        if raw_org_id in (None, '', 'null'):
            return None, Response(
                {'error': 'organization_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            org = Organization.objects.get(id=raw_org_id)
        except (Organization.DoesNotExist, ValueError, TypeError):
            return None, Response(
                {'error': 'Organization not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_org(self.request.user, org):
            return None, Response(
                {'error': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return org, None

    def perform_create(self, serializer):
        org, err = self._resolve_org(self.request.data.get('organization_id'))
        if err is not None:
            raise PermissionDenied(err.data['error'])
        serializer.save(organization=org)

    def perform_update(self, serializer):
        instance = self.get_object()
        if not can_manage_org(self.request.user, instance.organization):
            raise PermissionDenied('You do not have permission to edit this tier.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not can_manage_org(request.user, instance.organization):
            raise PermissionDenied('You do not have permission to delete this tier.')

        # Soft-delete when live memberships exist, so members keep their benefits.
        if instance.memberships.filter(status=Membership.Status.ACTIVE).exists():
            instance.is_active = False
            instance.is_public = False
            instance.save(update_fields=['is_active', 'is_public', 'updated_at'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        return super().destroy(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# Checkout — shared implementation (called by MembershipViewSet.checkout)
# ---------------------------------------------------------------------------

def _are_payments_enabled():
    try:
        from ..models import SystemSettings
        return SystemSettings.get().payments_enabled
    except Exception:
        return False


def _create_checkout_impl(request):
    """
    Shared implementation of MembershipViewSet.checkout.

    Kept as a module-level function so unit tests can call it with a
    bare request without going through the router. The @action on the
    viewset is a one-line delegate.
    """
    tier_id = request.data.get('tier_id')
    if not tier_id:
        return Response({'error': 'tier_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    tier = get_object_or_404(MembershipTier, id=tier_id, is_active=True)
    if not tier.is_public and not can_manage_org(request.user, tier.organization):
        return Response({'error': 'This tier is not available.'}, status=status.HTTP_403_FORBIDDEN)

    existing = Membership.active_for(request.user, tier.organization)
    if existing is not None:
        return Response(
            {
                'error': 'You already have an active membership in this organization.',
                'membership_id': str(existing.id),
                'valid_until': existing.valid_until.isoformat() if existing.valid_until else None,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Also refuse if there is already a pending-offline request for this org —
    # avoids duplicate submissions from double-clicks.
    pending_offline = Membership.objects.filter(
        user=request.user,
        organization=tier.organization,
        status=Membership.Status.PENDING_OFFLINE,
    ).first()
    if pending_offline is not None:
        return Response(
            {
                'error': 'You already have a pending offline request for this organization.',
                'membership_id': str(pending_offline.id),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()

    # ---- Offline / cash branch ----
    payment_method = (request.data.get('payment_method') or 'online').lower()
    if payment_method in ('cash', 'offline'):
        offline_ref = (request.data.get('offline_reference') or '').strip()[:128]

        pending = Membership.objects.create(
            organization=tier.organization,
            user=request.user,
            tier=tier,
            price_paid=0,
            currency_code=tier.currency_code,
            status=Membership.Status.PENDING_OFFLINE,
            payment_method=payment_method,
            offline_reference=offline_ref,
            started_at=now,
            valid_until=None,
        )
        return Response(
            {
                'status': 'pending_offline',
                'membership': MembershipSerializer(
                    pending, context={'request': request},
                ).data,
                'message': (
                    'Your request has been submitted. The organization '
                    'will review your payment and activate your membership.'
                ),
            },
            status=status.HTTP_201_CREATED,
        )

    # ---- Free tier ----
    if tier.price <= 0:
        membership = Membership.objects.create(
            organization=tier.organization,
            user=request.user,
            tier=tier,
            price_paid=0,
            currency_code=tier.currency_code,
            status=Membership.Status.ACTIVE,
            payment_method='online',
            started_at=now,
            valid_until=(now + timezone.timedelta(days=tier.duration_days)) if tier.duration_days else None,
        )
        return Response({
            'status': 'active',
            'membership': MembershipSerializer(
                membership, context={'request': request},
            ).data,
        }, status=status.HTTP_201_CREATED)

    # ---- Paid tier, online gateway ----
    if not _are_payments_enabled():
        return Response(
            {
                'error': (
                    'Online payments are currently disabled by the platform '
                    'administrator. Please contact support.'
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    gateway_name = (request.data.get('gateway') or settings.PAYMENTS['DEFAULT_GATEWAY']).lower()
    provider = get_provider(gateway_name)

    mp = MembershipPayment.objects.create(
        organization=tier.organization,
        user=request.user,
        tier=tier,
        gateway=gateway_name,
        amount=tier.price,
        currency=tier.currency_code,
        status=MembershipPayment.Status.CREATED,
    )

    try:
        checkout = provider.create_order(mp)
    except Exception:
        logger.exception('Membership checkout create_order failed')
        mp.status = MembershipPayment.Status.FAILED
        mp.save(update_fields=['status', 'updated_at'])
        return Response({'error': 'Failed to create payment order.'}, status=status.HTTP_502_BAD_GATEWAY)

    mp.provider_order_id = checkout['provider_order_id']
    mp.checkout = checkout.get('client', {})
    mp.save(update_fields=['provider_order_id', 'checkout', 'updated_at'])

    return Response({
        'membership_payment_id': str(mp.id),
        'gateway': gateway_name,
        'amount': str(mp.amount),
        'currency': mp.currency,
        'order_id': mp.provider_order_id,
        'client': mp.checkout,
    }, status=status.HTTP_201_CREATED)


def _verify_checkout_impl(request):
    """
    Shared implementation of MembershipViewSet.verify.
    """
    mp_id = request.data.get('membership_payment_id')
    if not mp_id:
        return Response({'error': 'membership_payment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        mp = MembershipPayment.objects.get(pk=mp_id, user=request.user)
    except (MembershipPayment.DoesNotExist, ValueError):
        return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)

    if mp.status == MembershipPayment.Status.PAID and mp.membership_id:
        return Response({
            'status': 'paid',
            'membership': MembershipSerializer(
                mp.membership, context={'request': request},
            ).data,
        })

    provider = get_provider(mp.gateway)
    params = request.data.get('params') or request.data
    if not provider.verify_checkout(mp, params):
        return Response({'error': 'Payment verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

    mp.provider_payment_id = params.get('razorpay_payment_id') or mp.provider_payment_id
    mp.save(update_fields=['provider_payment_id', 'updated_at'])

    try:
        membership = membership_fulfillment.fulfill_membership(mp.id)
    except membership_fulfillment.MembershipStateError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_409_CONFLICT)

    return Response({
        'status': 'paid',
        'membership': MembershipSerializer(
            membership, context={'request': request},
        ).data,
    })


# ---------------------------------------------------------------------------
# Buyer-facing membership viewset
# ---------------------------------------------------------------------------

class MembershipViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read + operational actions on memberships.

    Checkout and verify are declared as @actions so DRF's router wires
    them at /memberships/checkout/ and /memberships/verify/ BEFORE the
    <pk> detail pattern. Without this, Django matched `checkout` and
    `verify` as a `pk` value on this ReadOnlyModelViewSet, which has no
    POST handler, and returned 405.
    """
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]

    # FIX #1a: keep get_queryset narrow (own memberships only) so that
    # detail mutating actions (cancel, dependents, promote) are not
    # accidentally reachable by org managers on other users' rows.
    # Org managers get their own read-only listing via `org_members` below.
    def get_queryset(self):
        qs = Membership.objects.select_related('tier', 'organization', 'user')
        if is_platform_admin(self.request.user):
            return qs
        return qs.filter(user=self.request.user)

    # ---- checkout / verify ----

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def checkout(self, request):
        """POST /api/memberships/checkout/"""
        return _create_checkout_impl(request)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def verify(self, request):
        """POST /api/memberships/verify/"""
        return _verify_checkout_impl(request)

    # ---- my memberships ----

    @action(detail=False, methods=['get'])
    def mine(self, request):
        # FIX #1b: scope explicitly to the requesting user, independent of
        # get_queryset(), so this stays "my memberships" even if the base
        # queryset is ever widened.
        qs = (
            Membership.objects
            .filter(user=request.user)
            .select_related('tier', 'organization', 'user')
            .order_by('-created_at')
        )
        return Response(
            MembershipSerializer(
                qs, many=True, context={'request': request},
            ).data
        )

    # ---- org manager listing (FIX #1c) ----

    @action(detail=False, methods=['get'], url_path='org-members')
    def org_members(self, request):
        """
        GET /api/memberships/org-members/?organization_id=<id>&status=<status>

        Read-only listing of memberships in the org(s) the caller manages.
        Platform admins see all orgs unless filtered.
        """
        user = request.user
        qs = (
            Membership.objects
            .select_related('tier', 'organization', 'user')
            .order_by('-created_at')
        )

        org_id = request.query_params.get('organization_id')

        if is_platform_admin(user):
            if org_id:
                qs = qs.filter(organization_id=org_id)
        else:
            managed_ids = set(user_org_ids(user))
            if not managed_ids:
                return Response(
                    {'error': 'You do not manage any organizations.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if org_id:
                if org_id not in {str(x) for x in managed_ids}:
                    return Response(
                        {'error': 'Permission denied.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                qs = qs.filter(organization_id=org_id)
            else:
                qs = qs.filter(organization_id__in=managed_ids)

        status_filter = request.query_params.get('status')
        if status_filter:
            if status_filter not in Membership.Status.values:
                return Response(
                    {'error': f'Invalid status. Allowed: {sorted(Membership.Status.values)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(status=status_filter)

        return Response({
            'count': qs.count(),
            'results': MembershipSerializer(
                qs, many=True, context={'request': request},
            ).data,
        })

    # ---- cancel ----

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        m = self.get_object()
        # FIX #1d: ownership guard for detail mutations (defensive; get_queryset
        # already scopes to request.user for non-admins).
        if m.user_id != request.user.id and not is_platform_admin(request.user):
            raise PermissionDenied('You do not have permission to modify this membership.')

        if m.status not in (Membership.Status.ACTIVE, Membership.Status.PENDING_OFFLINE):
            return Response(
                {'error': 'Family members can only be added to an active or pending-offline membership.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        m.cancelled_at = timezone.now()
        m.cancelled_reason = (request.data.get('reason') or '')[:255]
        m.save(update_fields=['cancelled_at', 'cancelled_reason', 'updated_at'])

        return Response(
            MembershipSerializer(m, context={'request': request}).data
        )

    # ---- dependents ----

    @action(detail=True, methods=['post'], url_path='dependents')
    def add_dependent(self, request, pk=None):
        m = self.get_object()
        if m.user_id != request.user.id and not is_platform_admin(request.user):
            raise PermissionDenied('You do not have permission to modify this membership.')

        if m.status not in (Membership.Status.ACTIVE, Membership.Status.PENDING_OFFLINE):
            return Response(
                {'error': 'Family members can only be added to an active or pending-offline membership.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not m.has_seat_available():
            return Response(
                {
                    'error': f'This tier covers up to {m.tier.max_members} people '
                             f'(including you). Remove a dependent or upgrade first.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = MembershipDependentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        dep = ser.save(membership=m)
        return Response(MembershipDependentSerializer(dep).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'dependents/(?P<dep_id>[^/.]+)')
    def remove_dependent(self, request, pk=None, dep_id=None):
        m = self.get_object()
        if m.user_id != request.user.id and not is_platform_admin(request.user):
            raise PermissionDenied('You do not have permission to modify this membership.')
        try:
            dep = m.dependents.get(id=dep_id)
        except MembershipDependent.DoesNotExist:
            return Response({'error': 'Dependent not found.'}, status=status.HTTP_404_NOT_FOUND)
        dep.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True, methods=['post'],
        url_path=r'dependents/(?P<dep_id>[^/.]+)/promote',
    )
    def promote_dependent(self, request, pk=None, dep_id=None):
        m = self.get_object()
        if m.user_id != request.user.id and not is_platform_admin(request.user):
            raise PermissionDenied('You do not have permission to modify this membership.')
        try:
            dep = m.dependents.get(id=dep_id)
        except MembershipDependent.DoesNotExist:
            return Response({'error': 'Dependent not found.'}, status=status.HTTP_404_NOT_FOUND)

        if dep.promoted_user_id:
            return Response(
                {'error': 'This dependent already has a login.', 'user_id': dep.promoted_user_id},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not dep.email:
            return Response(
                {'error': 'Add an email address to this dependent first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.contrib.auth.models import User
        from ..services.serializers_helpers import resolve_or_create_user_for_booking

        user = User.objects.filter(email__iexact=dep.email).first()
        if user is None:
            user = resolve_or_create_user_for_booking(
                customer_email=dep.email,
                customer_name=dep.full_name,
                customer_phone=dep.phone or '',
            )
        dep.promoted_user = user
        dep.save(update_fields=['promoted_user'])

        try:
            from ..services import auth_emails
            import secrets
            from datetime import timedelta
            from ..models import UserProfile
            profile, _ = UserProfile.objects.get_or_create(
                user=user, defaults={'email': user.email},
            )
            token = secrets.token_urlsafe(48)
            profile.magic_token = token
            profile.magic_token_expires = timezone.now() + timedelta(minutes=15)
            profile.save(update_fields=['magic_token', 'magic_token_expires'])
            link = f'{settings.FRONTEND_URL}/auth/verify?token={token}'
            auth_emails.send_magic_link_email(user, link)
        except Exception:
            logger.exception('Could not send promotion magic link (non-blocking)')

        return Response({
            'success': True,
            'user_id': user.id,
            'email': user.email,
            'message': 'A login link has been emailed to the dependent.',
        })


# ===========================================================================
# OFFLINE MEMBERSHIP REVIEW (Owner / Admin)
# ===========================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_pending_offline(request):
    """
    List memberships awaiting offline payment review.

    Scope:
      • Platform admin      → all orgs, or the org in ?organization_id=
      • Owner/Admin of org  → their org(s) only
    """
    org_id = request.query_params.get('organization_id')

    qs = (
        Membership.objects
        .filter(status=Membership.Status.PENDING_OFFLINE)
        .select_related('tier', 'organization', 'user')
        .order_by('created_at')
    )

    if is_platform_admin(request.user):
        # Superuser: filter by org if provided, else everything.
        if org_id:
            qs = qs.filter(organization_id=org_id)
    else:
        managed_ids = user_org_ids(request.user)
        if org_id:
            if org_id not in {str(x) for x in managed_ids}:
                return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            qs = qs.filter(organization_id=org_id)
        else:
            qs = qs.filter(organization_id__in=managed_ids)

    return Response({
        'count': qs.count(),
        'results': MembershipSerializer(qs, many=True, context={'request': request},).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def bulk_upload_offline_members(request):
    """POST /api/memberships/offline-upload/

    Bulk-import members who paid offline. Available to OWNER/ADMIN and
    STAFF of the target organization (staff can onboard, but activation
    remains an OWNER/ADMIN action in the review queue).

    Form fields:
      organization_id — target tenant (must be one the caller operates)
      tier_id         — membership plan for the batch
      file            — UTF-8 CSV (email,name,phone,amount,offline_reference)
    """
    org_id = request.data.get('organization_id')
    tier_id = request.data.get('tier_id')
    upload = request.FILES.get('file')

    if not org_id:
        return Response(
            {'error': 'organization_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not tier_id:
        return Response(
            {'error': 'tier_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload is None:
        return Response(
            {'error': 'A CSV file is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    organization = Organization.objects.filter(pk=org_id).first()
    if organization is None:
        return Response(
            {'error': 'Organization not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Tenant admins AND staff may upload (per product requirement). The
    # import only creates PENDING_OFFLINE rows; it never activates them.
    if not can_operate_org(request.user, organization):
        return Response(
            {'error': 'You do not have permission to add members to this organization.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    tier = MembershipTier.objects.filter(
        pk=tier_id, organization=organization, is_active=True,
    ).first()
    if tier is None:
        return Response(
            {'error': 'Membership plan not found for this organization.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = bulk_import_offline_members(
            organization=organization,
            tier=tier,
            file_obj=upload,
            actor=request.user,
        )
    except BulkUploadError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(
        'Bulk offline member upload: org=%s tier=%s by=%s created=%d skipped=%d errors=%d',
        organization.slug, tier.name, request.user.username,
        result['created_count'], result['skipped_count'], result['error_count'],
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def review_offline_membership(request, membership_id):
    """
    Activate or reject a single offline membership.

    Body: {"action": "activate" | "reject", "reference": "...", "reason": "..."}
    """
    action_value = (request.data.get('action') or '').lower()
    if action_value not in ('activate', 'reject'):
        return Response(
            {'error': 'action must be "activate" or "reject".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        if action_value == 'activate':
            m = activate_offline_membership(
                membership_id=membership_id,
                reviewed_by=request.user,
                reference=request.data.get('reference') or '',
            )
        else:
            m = reject_offline_membership(
                membership_id=membership_id,
                reviewed_by=request.user,
                reason=request.data.get('reason') or '',
            )
    except Membership.DoesNotExist:
        return Response({'error': 'Membership not found.'}, status=status.HTTP_404_NOT_FOUND)
    except MembershipReviewError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        'success': True,
        'action': action_value,
        'membership': MembershipSerializer(m, context={'request': request},).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bulk_review_offline_memberships(request):
    """
    Bulk activate or reject offline memberships.

    Body: {"action": "activate" | "reject", "membership_ids": [...], "reference": "...", "reason": "..."}

    Response per-row status is one of: success | not_found | forbidden | conflict | error.
    """
    action_value = (request.data.get('action') or '').lower()
    if action_value not in ('activate', 'reject'):
        return Response(
            {'error': 'action must be "activate" or "reject".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ids = request.data.get('membership_ids') or []
    if not isinstance(ids, list) or not ids:
        return Response(
            {'error': 'membership_ids must be a non-empty list.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(ids) > 200:
        return Response(
            {'error': 'Maximum 200 memberships per bulk action.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reference = (request.data.get('reference') or '').strip()
    reason = (request.data.get('reason') or '').strip()

    # FIX #3a: normalize ids to strings for stable lookups / echo.
    ids = [str(mid) for mid in ids]

    # FIX #3b: pre-validate existence and permission so we can bucket
    # "not found" and "forbidden" distinctly, and fail fast on the caller
    # having zero access to any of the requested orgs.
    existing = {
        str(m.id): m
        for m in Membership.objects
            .select_related('organization', 'user')
            .filter(id__in=ids)
    }

    managed_ids = set(user_org_ids(request.user))
    is_admin = is_platform_admin(request.user)

    # FIX #3c: if the caller manages no orgs and isn't an admin, reject upfront.
    if not is_admin and not managed_ids:
        return Response(
            {'error': 'You do not manage any organizations.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    results = []
    succeeded = 0
    failed = 0
    not_found = 0
    forbidden = 0

    for mid in ids:
        m_pre = existing.get(mid)
        if m_pre is None:
            not_found += 1
            results.append({
                'membership_id': mid,
                'status': 'not_found',
                'error': 'Not found',
            })
            continue

        if not is_admin and m_pre.organization_id not in managed_ids:
            forbidden += 1
            results.append({
                'membership_id': mid,
                'status': 'forbidden',
                'error': 'Permission denied for this organization.',
            })
            continue

        try:
            with transaction.atomic():
                if action_value == 'activate':
                    m = activate_offline_membership(
                        membership_id=mid,
                        reviewed_by=request.user,
                        reference=reference,
                    )
                else:
                    m = reject_offline_membership(
                        membership_id=mid,
                        reviewed_by=request.user,
                        reason=reason,
                    )
            succeeded += 1
            results.append({
                'membership_id': str(m.id),
                'status': 'success',
                # FIX #3d: email may be empty for magic-link users.
                'user_email': m.user.email or m.user.username,
            })
        except Membership.DoesNotExist:
            # Race: row disappeared between pre-validation and service call.
            not_found += 1
            results.append({
                'membership_id': mid,
                'status': 'not_found',
                'error': 'Not found',
            })
        except MembershipReviewError as exc:
            # Service-level rejection (e.g. wrong state / no permission
            # resolved from the row itself). Bucket as forbidden when it
            # looks like a permission problem, otherwise conflict.
            msg = str(exc)
            if 'permission' in msg.lower() or 'not allowed' in msg.lower():
                forbidden += 1
                results.append({
                    'membership_id': mid,
                    'status': 'forbidden',
                    'error': msg,
                })
            else:
                failed += 1
                results.append({
                    'membership_id': mid,
                    'status': 'conflict',
                    'error': msg,
                })
        except Exception:  # noqa: BLE001
            logger.exception('Bulk review failed for %s', mid)
            failed += 1
            results.append({
                'membership_id': mid,
                'status': 'error',
                'error': 'Internal error',
            })

    return Response({
        'action': action_value,
        'requested': len(ids),
        'succeeded': succeeded,
        'failed': failed,
        'not_found': not_found,
        'forbidden': forbidden,
        'results': results,
    })