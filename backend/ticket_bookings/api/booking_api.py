# backend/ticket_bookings/api/booking_api.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.db.models import F, Q, Count, Case, When, Value, IntegerField, Sum
from django.contrib.auth.models import User
from django.core.mail import send_mail, EmailMultiAlternatives
from django.core.exceptions import ValidationError
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
import logging
import uuid
import qrcode
from io import BytesIO
import base64
import json
import re
# ✅ FIX [P5]: import copy so we can take a shallow copy of request.data.
import copy

from ticket_bookings.models import (
    Booking, Ticket, Event, TicketTier,
    Session, CheckInLog
)
from .serializers import (
    BookingSerializer,
    BookingListSerializer,
    BookingAdminSerializer,
    BookingDetailSerializer,
    TicketSerializer,
    CheckInLogSerializer,
    UserSerializer
)
from core.permissions import IsOrganizerOrAdmin

# NEW IMPORTS
from .ticket_generator import TicketGenerator
from .ticket_combiner import TicketCombiner
# ✅ Canonical signed QR payload builder — single source of truth.
from ..services.qr_payload import serialise_ticket_qr_payload

from ..managers import SOLD_BOOKING_STATUSES
from ..services.ticket_cancellation import cancel_tickets, CancellationError
# ✅ FIX [P9]: single canonical reconciler.
from ..services.booking_status import reconcile_completed_booking
from ..constants import BookingStatus, TicketStatus

logger = logging.getLogger(__name__)


def _is_organizer(user):
    return (
        (hasattr(user, 'profile') and getattr(user.profile, 'is_organizer', False))
        or hasattr(user, 'organizer')
    )


# ============================================================
# DIAGNOSTIC EMAIL SENDER
# ============================================================
def _safe_send_email(email_message, context_label=''):
    """
    Send a Django EmailMessage and log the outcome explicitly.
    Never raises — returns True on success, False on failure.
    """
    try:
        sent = email_message.send(fail_silently=False)

        if sent == 1:
            logger.info(
                f"📧 [{context_label}] SMTP accepted 1 email → {email_message.to}"
            )
            return True

        logger.warning(
            f"📧 [{context_label}] SMTP returned {sent} (unexpected). "
            f"Recipients: {email_message.to}"
        )
        return False

    except Exception as exc:
        logger.exception(
            f"📧 [{context_label}] SMTP FAILURE: {type(exc).__name__}: {exc} "
            f"| Recipients: {email_message.to}"
        )
        return False


# ============================================================
# BULK ACTION WHITELIST
# ============================================================
BULK_ACTION_MAP = {
    'mark_payment_received':                'confirm_payment',
    'confirm_payment':                      'confirm_payment',
    'confirm_payment_and_issue_tickets':    'confirm_payment_and_issue',
    'confirm_payment_and_issue':            'confirm_payment_and_issue',
    'issue_tickets':                        'issue_tickets',
    'regenerate_ticket_qr':                 'regenerate_ticket_qr',
    'cancel_booking':                       'cancel_booking',
    'refund_booking':                       'refund_booking',
}

BULK_ACTION_HANDLERS = {
    'confirm_payment',
    'confirm_payment_and_issue',
    'issue_tickets',
    'regenerate_ticket_qr',
    'cancel_booking',
    'refund_booking',
}

assert set(BULK_ACTION_MAP.values()) <= BULK_ACTION_HANDLERS, (
    "BULK_ACTION_MAP contains a target with no handler: "
    f"{set(BULK_ACTION_MAP.values()) - BULK_ACTION_HANDLERS}"
)


class IsAdminOrOrganizer(permissions.BasePermission):
    """Allows access only to admin/staff or organizer users."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_staff or request.user.is_superuser:
            return True
        if _is_organizer(request.user):
            return True
        if hasattr(request.user, 'organizer'):
            return True
        return False


class BookingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing bookings with admin actions.
    All endpoints are throttled via ScopedRateThrottle.

    Slot capacity invariant
    -----------------------
    `Session.booked` is the number of seats held by bookings in a
    non-cancelled, non-refunded state. It is incremented at booking
    creation (inside a row lock) and decremented whenever a booking
    or individual ticket is cancelled or refunded.

    Because capacity is reserved at creation time, `_issue_tickets_for_booking`
    does NOT touch `session.booked` — doing so would double-count. See the
    comment inside that method.
    """
    queryset = Booking.objects.all().order_by('-created_at')
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]

    def get_throttles(self):
        if self.action == 'create':
            self.throttle_scope = 'booking_create'
        elif self.action in ('resend_tickets',):
            self.throttle_scope = 'booking_resend'
        else:
            self.throttle_scope = 'user'
        return super().get_throttles()

    def get_permissions(self):
        admin_actions = [
            'bulk_action', 'confirm_payment_and_issue_tickets',
            'mark_payment_received', 'issue_tickets',
            'cancel_booking', 'refund_booking', 'regenerate_ticket_qr',
            'for_confirm_payment', 'for_mark_payment', 'for_issue_tickets',
            'bulk_action_counts', 'confirm_payment', 'refund', 'apply_discount'
        ]
        # validate_discount is intentionally public — the cart calls it
        # before the user has booked anything.
        if self.action == 'validate_discount':
            return [permissions.AllowAny()]
        if self.action in admin_actions:
            return [IsAdminOrOrganizer()]
        return [permissions.IsAuthenticated()]

    # ============================================================
    # SLOT CAPACITY HELPERS
    # ============================================================
    def _count_requested_tickets(self, data):
        """
        Return how many tickets the incoming request is asking for.

        ✅ FIX [P11]: the "tier_ids + tier_quantities" branch used to
        default missing quantities to 1 (silently reserving one seat per
        unknown tier). It now defaults to 0 and — if the request shape is
        ambiguous — returns 0 (skip capacity reservation) so the
        serializer's own count is the single authority.

        Never raises. Returns 0 if no count can be determined.
        """
        def _len(x):
            return len(x) if isinstance(x, list) else 0

        # 1. Top-level
        n = _len(data.get('tickets'))
        if n > 0:
            return n

        md = data.get('metadata')
        if isinstance(md, dict):
            # 2. metadata.tickets
            n = _len(md.get('tickets'))
            if n > 0:
                return n

            # 3. metadata.ticket_types
            n = _len(md.get('ticket_types'))
            if n > 0:
                return n

            # 4. metadata.tier_ids + tier_quantities
            tier_ids = md.get('tier_ids')
            tier_quantities = md.get('tier_quantities')
            if isinstance(tier_ids, list) and isinstance(tier_quantities, dict):
                total = 0
                for tid in tier_ids:
                    # ✅ FIX [P11]: default 0, not 1. A missing quantity
                    # is NOT a request for 1 seat — it's a malformed
                    # request. Let the serializer reject it, don't reserve.
                    raw = tier_quantities.get(str(tid), 0)
                    try:
                        qty = int(raw)
                    except (ValueError, TypeError):
                        qty = 0
                    if qty > 0:
                        total += qty
                if total > 0:
                    return total

        return 0

    def _release_session_seats(self, booking, count):
        """
        Return `count` seats to the booking's session.

        Called from every cancellation / refund path AFTER the relevant
        tickets have been marked cancelled/refunded. Locked so two
        concurrent releases on the same session can't race — this matters
        because an admin cancelling one booking and a customer cancelling
        another could otherwise both read the same `booked` value and
        both write the same decremented result, losing one release.

        Clamped at 0 so a bug that double-releases doesn't leave `booked`
        negative. A negative `booked` would make the session look like
        it has more capacity than it started with.
        """
        if not booking.session_id or count <= 0:
            return

        with transaction.atomic():
            session = (
                Session.objects
                .select_for_update()
                .filter(id=booking.session_id)
                .first()
            )
            if session is None:
                logger.warning(
                    "Cannot release %d seat(s) for booking %s — session %s "
                    "no longer exists.",
                    count, booking.booking_reference, booking.session_id,
                )
                return

            session.booked = max(0, session.booked - count)
            session.save(update_fields=['booked'])
            logger.info(
                "✅ Released %d seat(s) from session %s "
                "(booking=%s, booked=%d, capacity=%d)",
                count, session.id, booking.booking_reference,
                session.booked, session.capacity,
            )

    # ============================================================
    # ✅ NEW HELPER — normalize a metadata ticket entry's tier_id and
    # resolve it to a TicketTier. Never returns None unless the event
    # truly has zero tiers.
    # ============================================================
    def _resolve_tier_for_metadata_entry(self, entry, valid_tiers, tiers_in_order, idx):
        """
        Given a single ticket entry from `booking.metadata['tickets']`
        (or `metadata['ticket_types']`), resolve its `tier_id` to a real
        `TicketTier` instance.

        Resolution strategy (first hit wins):
          1. Exact match by stringified `tier_id` in `valid_tiers`.
          2. Match by `tier_name` (case-insensitive) among the event's tiers.
          3. First tier in `tiers_in_order`.

        Returns (tier_instance, fallback_reason) — `fallback_reason` is
        None if the exact match was used, or a short string describing
        why a fallback was chosen.
        """
        raw_tier_id = entry.get('tier_id') if isinstance(entry, dict) else None
        tier_id = None

        if raw_tier_id is not None:
            try:
                tier_id = str(raw_tier_id).strip()
            except Exception:
                tier_id = None

            if tier_id == '':
                tier_id = None

        # ---- 1. Exact tier_id match ----
        if tier_id and tier_id in valid_tiers:
            return valid_tiers[tier_id], None

        # ---- 2. Match by tier_name ----
        tier_name_hint = ''
        if isinstance(entry, dict):
            tier_name_hint = (entry.get('tier_name') or '').strip().lower()

        if tier_name_hint:
            for t in tiers_in_order:
                if (t.name or '').strip().lower() == tier_name_hint:
                    logger.warning(
                        "⚠️ Ticket #%d: tier_id %r not found; "
                        "matched by tier_name %r instead.",
                        idx, raw_tier_id, t.name,
                    )
                    return t, f'tier_name match ({t.name})'

        # ---- 3. First available tier ----
        if tiers_in_order:
            fallback = tiers_in_order[0]
            logger.warning(
                "⚠️ Ticket #%d: tier_id %r not found and no tier_name match; "
                "falling back to first tier %r.",
                idx, raw_tier_id, fallback.name,
            )
            return fallback, f'first-tier fallback ({fallback.name})'

        logger.error(
            "❌ Ticket #%d: tier_id %r could not be resolved and the "
            "event has no tiers at all.",
            idx, raw_tier_id,
        )
        return None, 'no-tiers-available'

    # ============================================================
    # CREATE — atomic, row-locked, capacity-reserving
    # ============================================================
    def create(self, request, *args, **kwargs):
        """
        POST /api/bookings/

        ✅ FIX [P5]: never mutate `request.data` in place. DRF's parsed
        data may be reused (retries, tests, middleware) and the previous
        code mutated the caller's dict directly. We take a shallow copy
        up front and operate on that.

        ✅ FIX [P40]: DRF's `Request.data` is a read-only property.
        The previous implementation assigned `request.data = data` and
        crashed with `AttributeError: property 'data' of 'Request'
        object has no setter`. We now build the serializer directly with
        our normalised `data` and never touch `request.data`.

        All other behaviour (session lock, capacity reservation, undo on
        downstream failure) is preserved verbatim.
        """
        # ✅ FIX [P5]: shallow copy of request.data so downstream code
        # cannot observe our normalisations.
        data = copy.copy(request.data) if hasattr(request.data, 'copy') else dict(request.data)

        # ---------- Sanitize incoming metadata ----------
        if isinstance(data.get('metadata'), dict):
            # Also copy the metadata dict, since we mutate it below.
            data['metadata'] = copy.copy(data['metadata'])
            md = data['metadata']
            for forbidden in ('is_organizer', 'role', 'is_staff', 'is_superuser'):
                md.pop(forbidden, None)

        # ---------- Normalize event field name ----------
        if 'event_id' in data and 'event' not in data:
            data['event'] = data['event_id']

        # ---------- Event lookup + bookability checks ----------
        event_id = data.get('event') or data.get('event_id')
        event_obj = None
        if event_id:
            try:
                event_obj = Event.objects.get(id=event_id)
                if event_obj.status not in ['active', 'published']:
                    return Response(
                        {'error': 'This event is not available for booking'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if event_obj.end_date and event_obj.end_date < timezone.now():
                    return Response(
                        {'error': 'This event has already ended'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not event_obj.is_public and not (
                    request.user.is_staff or request.user.is_superuser
                ):
                    return Response(
                        {'error': 'This event is not available for public booking'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except Event.DoesNotExist:
                return Response(
                    {'error': 'Event not found'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ---------- Fallback total_amount if client sent nothing ----------
        if 'total_amount' not in data or data['total_amount'] is None:
            tickets = data.get('tickets', [])
            total = 0
            for ticket in tickets:
                tier_id = ticket.get('tier_id')
                if tier_id:
                    try:
                        tier = TicketTier.objects.get(id=tier_id)
                        total += float(tier.price)
                    except TicketTier.DoesNotExist:
                        pass
            data['total_amount'] = str(total)

        # ---------- Resolve session id + requested ticket count ----------
        session_id = (
            data.get('session')
            or data.get('session_id')
            or (data.get('metadata') or {}).get('slot_id')
        )
        requested_count = self._count_requested_tickets(data)

        # ---------- Atomic create with row lock on the session ----------
        try:
            with transaction.atomic():
                locked_session = None

                if session_id and requested_count > 0:
                    locked_session = (
                        Session.objects
                        .select_for_update()
                        .filter(id=session_id)
                        .first()
                    )

                    if locked_session is None:
                        return Response(
                            {'error': 'The selected slot was not found.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    if event_obj and locked_session.event_id != event_obj.id:
                        return Response(
                            {'error': 'The selected slot does not belong to this event.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    ok, reason = locked_session.check_capacity(requested_count)
                    if not ok:
                        return Response(
                            {'session': [reason]},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    locked_session.booked += requested_count
                    locked_session.save(update_fields=['booked'])

                # ---------- Delegate actual creation to the serializer ----------
                # ✅ FIX [P40]: build the serializer with our normalised
                # `data` instead of overwriting `request.data` (which is
                # a read-only property on DRF's Request). `super().create()`
                # is not called here because it reads `request.data`.
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                self.perform_create(serializer)

                headers = self.get_success_headers(serializer.data)
                response = Response(
                    serializer.data,
                    status=status.HTTP_201_CREATED,
                    headers=headers,
                )

                if locked_session is not None and response.status_code >= 400:
                    locked_session.booked = max(
                        0, locked_session.booked - requested_count
                    )
                    locked_session.save(update_fields=['booked'])
                    logger.warning(
                        "↩️ Booking creation returned %s; released %d "
                        "reserved seat(s) from session %s.",
                        response.status_code, requested_count, locked_session.id,
                    )

                return response

        except Exception:
            logger.exception("Booking creation failed; transaction rolled back")
            raise

    # ==================== HELPER METHOD TO UPDATE EVENT COUNTS ====================

    def _update_event_counts(self, event):
        """
        Delegate to the model so the counting logic lives in exactly one
        place (managers.py). Called after issuing/cancelling/refunding
        tickets.
        """
        if not event:
            return False

        event.update_ticket_counts()
        logger.info(
            "✅ Updated event %s counts via update_ticket_counts(): "
            "tickets=%s revenue=%s",
            event.id,
            event.total_tickets_sold,
            event.total_revenue,
        )
        return True

    def _send_partial_cancellation_email(
        self, booking, *, cancelled_ids, refund_amount, fully_cancelled,
    ):
        """
        Send a plain-text notification about the cancellation.
        Doesn't render tickets or attachments — this is a courtesy note.
        """
        from django.core.mail import EmailMultiAlternatives

        if fully_cancelled:
            subject = f'Booking Cancelled - {booking.booking_reference}'
            intro = 'Your entire booking has been cancelled.'
        else:
            subject = f'Tickets Cancelled - {booking.booking_reference}'
            intro = f'{len(cancelled_ids)} ticket(s) on your booking have been cancelled.'

        html = f"""
        <p>Hi {booking.customer_name},</p>
        <p>{intro}</p>
        <p><strong>Refund amount:</strong> ₹{refund_amount}</p>
        <p><strong>Booking reference:</strong> {booking.booking_reference}</p>
        <p>If you did not request this, please contact support.</p>
        """

        email = EmailMultiAlternatives(
            subject,
            '',
            settings.DEFAULT_FROM_EMAIL,
            [booking.customer_email],
        )
        email.attach_alternative(html, 'text/html')
        _safe_send_email(email, context_label='partial_cancellation')

    @action(detail=True, methods=['post'])
    def cancel_tickets(self, request, pk=None):
        """
        POST /api/bookings/<id>/cancel_tickets/

        Body:
            {
              "ticket_ids": ["<uuid>", "<uuid>"],
              "reason": "Customer requested",        # optional
              "allow_used": false                    # staff only
            }

        Cancels individual tickets within a booking. The booking itself
        only flips to `cancelled` when every ticket is cancelled, and to
        `completed` when the remaining tickets are all already used.
        """
        booking = self.get_object()

        if booking.status in [
            BookingStatus.CANCELLED,
            BookingStatus.REFUNDED,
            BookingStatus.COMPLETED,
        ]:
            return Response(
                {'error': f'Booking is already {booking.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket_ids = request.data.get('ticket_ids') or []
        if not isinstance(ticket_ids, list) or not ticket_ids:
            return Response(
                {'error': 'ticket_ids must be a non-empty list'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()

        allow_used = bool(request.data.get('allow_used', False))
        if allow_used and not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'Only staff may cancel checked-in tickets'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            result = cancel_tickets(
                booking=booking,
                ticket_ids=ticket_ids,
                actor=request.user,
                reason=reason,
                allow_used=allow_used,
            )
        except CancellationError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ Release seats back to the session. The cancellation service
        #    flips individual tickets to cancelled but does not touch
        #    `session.booked`; we do that here so the seat math stays in
        #    one place.
        released_count = len(result.get('cancelled_ticket_ids', []))
        if released_count > 0:
            self._release_session_seats(booking, released_count)

        # ✅ Reconcile booking status. If the remaining tickets are all
        #    `used`, this flips the booking to `completed`. If they are
        #    all `cancelled`/`refunded`, the service already handled that
        #    case and this call is a no-op.
        booking.refresh_from_db()
        self._check_and_complete_booking(booking)
        booking.refresh_from_db()

        if result['cancelled_ticket_ids']:
            try:
                self._send_partial_cancellation_email(
                    booking,
                    cancelled_ids=result['cancelled_ticket_ids'],
                    refund_amount=result['refund_amount_added'],
                    fully_cancelled=result['fully_cancelled'],
                )
            except Exception as exc:
                logger.warning(
                    'Partial cancellation email failed (not blocking): %s', exc,
                )

        return Response(
            {
                'status': 'success',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'cancelled_ticket_ids': result['cancelled_ticket_ids'],
                'skipped': result['skipped'],
                'refund_amount_added': float(result['refund_amount_added']),
                'seats_released': released_count,
                'booking_status': booking.status,
                'fully_cancelled': result['fully_cancelled'],
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'])
    def preview_cancellation(self, request, pk=None):
        """
        POST /api/bookings/<id>/preview_cancellation/

        Body: { "ticket_ids": [...] }

        Returns what the refund WOULD be if these tickets were cancelled
        right now. Does NOT mutate anything.
        """
        from ..services.cancellation_policy import compute_refund
        from ..services.ticket_cancellation import (
            _policy_rules_for,
            _compute_net_paid_for_ticket,
        )
        from decimal import Decimal

        booking = self.get_object()
        ticket_ids = request.data.get('ticket_ids') or []

        if not isinstance(ticket_ids, list) or not ticket_ids:
            return Response(
                {'error': 'ticket_ids must be a non-empty list'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rules = _policy_rules_for(booking)
        if not rules:
            return Response({
                'cancellable': False,
                'reason': 'No cancellation policy attached to this booking.',
            })

        event_start = booking.event.start_date if booking.event else None
        now = timezone.now()
        preview = []
        total_refund = Decimal('0.00')

        tickets = (
            booking.tickets
            .filter(id__in=ticket_ids)
            .select_related('tier')
        )
        for ticket in tickets:
            net = _compute_net_paid_for_ticket(ticket, booking)
            decision = compute_refund(
                policy_rules=rules,
                event_start=event_start,
                ticket_status=ticket.status,
                net_paid_amount=net,
                now=now,
            )
            preview.append({
                'ticket_id': str(ticket.id),
                'unique_code': ticket.unique_code,
                'status': ticket.status,
                'net_paid': float(net),
                'refund_percent': decision.refund_percent,
                'refund_amount': float(decision.net_refund),
                'cancellation_fee': float(decision.cancellation_fee),
                'tier_label': decision.tier_label,
                'allowed': decision.allowed,
                'reason': decision.reason or None,
            })
            if decision.allowed:
                total_refund += decision.net_refund

        return Response({
            'cancellable': any(p['allowed'] for p in preview),
            'preview': preview,
            'total_refund': float(total_refund),
            'policy_name': (
                booking.cancellation_policy_snapshot or {}
            ).get('policy_name'),
        })

    # ============================================================
    # DISCOUNT VALIDATION — public, no booking required
    # ============================================================
    @action(
        detail=False,
        methods=['post'],
        permission_classes=[permissions.AllowAny],
    )
    def validate_discount(self, request):
        """
        POST /api/bookings/validate_discount/

        Body:
            {
              "code": "SAVE20",
              "event_id": "<uuid>",
              "subtotal": 430.00,
              "ticket_count": 3
            }

        Pre-flight validation for the cart page. Never creates a booking.
        Returns the computed discount amount so the UI can show the
        correct total *before* the user confirms.
        """
        from decimal import Decimal
        from ticket_bookings.models import Discount, DiscountUsage

        code = (request.data.get('code') or '').strip().upper()
        event_id = request.data.get('event_id')
        subtotal = Decimal(str(request.data.get('subtotal') or 0))
        ticket_count = int(request.data.get('ticket_count') or 0)

        if not code:
            return Response(
                {'valid': False, 'reason': 'No code provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            discount = Discount.objects.get(code__iexact=code, is_active=True)
        except Discount.DoesNotExist:
            return Response(
                {'valid': False, 'reason': 'Invalid or inactive code.'},
                status=status.HTTP_200_OK,
            )

        event = None
        if event_id:
            try:
                event = Event.objects.get(id=event_id)
            except Event.DoesNotExist:
                return Response(
                    {'valid': False, 'reason': 'Event not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not (request.user.is_staff or request.user.is_superuser):
                if discount.organizer_id != event.organizer_id:
                    return Response(
                        {
                            'valid': False,
                            'reason': 'This code is not valid for this event.',
                        },
                        status=status.HTTP_200_OK,
                    )

            scoped_ids = list(
                discount.applicable_events.values_list('id', flat=True)
            )
            if scoped_ids and event.id not in scoped_ids:
                return Response(
                    {
                        'valid': False,
                        'reason': 'This code is not valid for this event.',
                    },
                    status=status.HTTP_200_OK,
                )

        now = timezone.now()
        if discount.valid_from and discount.valid_from > now:
            return Response(
                {'valid': False, 'reason': 'This code is not yet valid.'},
                status=status.HTTP_200_OK,
            )
        if discount.valid_to and discount.valid_to < now:
            return Response(
                {'valid': False, 'reason': 'This code has expired.'},
                status=status.HTTP_200_OK,
            )

        if discount.max_uses and discount.used_count >= discount.max_uses:
            return Response(
                {'valid': False, 'reason': 'This code has reached its limit.'},
                status=status.HTTP_200_OK,
            )

        if discount.max_uses_per_user and request.user.is_authenticated:
            used = DiscountUsage.objects.filter(
                discount=discount,
                user=request.user,
                reversed_at__isnull=True,
            ).count()
            if used >= discount.max_uses_per_user:
                return Response(
                    {
                        'valid': False,
                        'reason': 'You have already used this code.',
                    },
                    status=status.HTTP_200_OK,
                )

        if discount.first_time_buyers_only and request.user.is_authenticated:
            prior = Booking.objects.filter(
                user=request.user,
                status__in=SOLD_BOOKING_STATUSES,
            ).exists()
            if prior:
                return Response(
                    {
                        'valid': False,
                        'reason': 'This code is only for first-time buyers.',
                    },
                    status=status.HTTP_200_OK,
                )

        if discount.min_order_amount and subtotal < Decimal(str(discount.min_order_amount)):
            return Response(
                {
                    'valid': False,
                    'reason': f'Minimum order ₹{discount.min_order_amount} required.',
                },
                status=status.HTTP_200_OK,
            )

        if discount.min_ticket_count and ticket_count < discount.min_ticket_count:
            return Response(
                {
                    'valid': False,
                    'reason': f'Minimum {discount.min_ticket_count} tickets required.',
                },
                status=status.HTTP_200_OK,
            )

        if discount.type == 'percentage':
            amount = (
                subtotal * Decimal(str(discount.value)) / Decimal('100')
            ).quantize(Decimal('0.01'))
            if discount.max_discount and amount > Decimal(str(discount.max_discount)):
                amount = Decimal(str(discount.max_discount))
        else:
            amount = Decimal(str(discount.value))
            if amount > subtotal:
                amount = subtotal

        return Response(
            {
                'valid': True,
                'code': discount.code,
                'type': discount.type,
                'value': float(discount.value),
                'discount_amount': float(amount),
                'min_order_amount': float(discount.min_order_amount or 0),
                'new_subtotal': float(subtotal - amount),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post', 'get'])
    def debug(self, request):
        if not settings.DEBUG:
            return Response(
                {'error': 'Debug endpoint disabled in production'},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_body_len = 0
        try:
            if request.body:
                raw_body_len = len(request.body)
        except Exception:
            raw_body_len = -1

        parsed_data = {}
        if hasattr(request, 'data'):
            if isinstance(request.data, dict):
                parsed_data = request.data
            elif hasattr(request.data, 'dict'):
                parsed_data = request.data.dict()
            else:
                parsed_data = str(request.data)

        content_type = request.content_type or request.headers.get('Content-Type', 'unknown')

        headers = dict(request.headers)
        headers.pop('Authorization', None)
        headers.pop('authorization', None)

        SENSITIVE_KEYS = {
            'password', 'password_confirm', 'current_password',
            'new_password', 'token', 'refresh', 'access',
            'secret', 'api_key', 'admin_token',
        }
        if isinstance(parsed_data, dict):
            parsed_data = {
                k: ('[REDACTED]' if k.lower() in SENSITIVE_KEYS else v)
                for k, v in parsed_data.items()
            }

        return Response({
            'content_type': content_type,
            'method': request.method,
            'parsed_data': parsed_data,
            'raw_body_length': raw_body_len,
            'headers': headers,
            'query_params': dict(request.query_params) if hasattr(request, 'query_params') else {},
        })

    def get_serializer_class(self):
        if self.action == 'list':
            return BookingListSerializer
        elif self.action == 'retrieve':
            return BookingAdminSerializer
        elif self.action in ['bulk_action', 'confirm_payment_and_issue_tickets',
                             'mark_payment_received', 'issue_tickets',
                             'cancel_booking', 'refund_booking']:
            return BookingAdminSerializer
        return BookingSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return Booking.objects.all().order_by('-created_at')

        is_organizer = False
        if _is_organizer(user):
            is_organizer = True

        if is_organizer:
            return Booking.objects.filter(
                event__organizer=user
            ).order_by('-created_at')

        return Booking.objects.filter(user=user).order_by('-created_at')

    def get_object(self):
        obj = super().get_object()
        user = self.request.user

        if user.is_superuser or user.is_staff:
            return obj

        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if is_organizer and obj.event.organizer_id == user.id:
            return obj

        if obj.user_id == user.id:
            return obj

        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to access this booking.")

    # ==================== FILTERED BOOKING LISTS FOR BULK ACTIONS ====================

    @action(detail=False, methods=['get'])
    def for_confirm_payment(self, request):
        user = request.user
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            queryset = Booking.objects.all()
        elif is_organizer:
            queryset = Booking.objects.filter(event__organizer=user)
        else:
            queryset = Booking.objects.filter(user=user)

        queryset = queryset.filter(
            status__in=['pending', 'processing']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            )
        ).filter(active_ticket_count=0).order_by('-created_at')

        serializer = BookingAdminSerializer(queryset, many=True)
        return Response({
            'action': 'confirm_payment_and_issue',
            'description': 'Bookings eligible for Confirm Payment & Issue Tickets',
            'count': queryset.count(),
            'bookings': serializer.data
        })

    @action(detail=False, methods=['get'])
    def for_mark_payment(self, request):
        user = request.user
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            queryset = Booking.objects.all()
        elif is_organizer:
            queryset = Booking.objects.filter(event__organizer=user)
        else:
            queryset = Booking.objects.filter(user=user)

        queryset = queryset.filter(
            status__in=['pending', 'processing']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            ),
            total_ticket_count=Count('tickets')
        ).order_by('-created_at')

        serializer = BookingAdminSerializer(queryset, many=True)
        return Response({
            'action': 'mark_payment_received',
            'description': 'Bookings eligible for Mark Payment Received',
            'count': queryset.count(),
            'bookings': serializer.data,
            'note': 'This action will mark payment as received without generating tickets'
        })

    @action(detail=False, methods=['get'])
    def for_issue_tickets(self, request):
        user = request.user
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            queryset = Booking.objects.all()
        elif is_organizer:
            queryset = Booking.objects.filter(event__organizer=user)
        else:
            queryset = Booking.objects.filter(user=user)

        queryset = queryset.filter(
            status__in=['paid', 'confirmed']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            )
        ).filter(active_ticket_count=0).order_by('-created_at')

        serializer = BookingAdminSerializer(queryset, many=True)
        return Response({
            'action': 'issue_tickets',
            'description': 'Bookings eligible for Issue Tickets (Paid status, no active tickets)',
            'count': queryset.count(),
            'bookings': serializer.data,
            'note': 'These bookings are already paid and ready for ticket issuance'
        })

    @action(detail=False, methods=['get'])
    def bulk_action_counts(self, request):
        user = request.user
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            base_queryset = Booking.objects.all()
        elif is_organizer:
            base_queryset = Booking.objects.filter(event__organizer=user)
        else:
            base_queryset = Booking.objects.filter(user=user)

        confirm_payment_count = base_queryset.filter(
            status__in=['pending', 'processing'],
            tickets__isnull=True
        ).count()

        mark_payment_count = base_queryset.filter(
            status__in=['pending', 'processing']
        ).count()

        issue_tickets_count = base_queryset.filter(
            status__in=['paid', 'confirmed']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            )
        ).filter(active_ticket_count=0).count()

        return Response({
            'confirm_payment_and_issue': {
                'count': confirm_payment_count,
                'description': 'Pending bookings ready for payment confirmation and ticket issuance'
            },
            'mark_payment_received': {
                'count': mark_payment_count,
                'description': 'Pending bookings ready for payment confirmation only'
            },
            'issue_tickets': {
                'count': issue_tickets_count,
                'description': 'Paid bookings ready for ticket issuance'
            }
        })

    # ==================== BULK ACTION (STRICT WHITELIST) ====================

    @action(detail=False, methods=['post'])
    def bulk_action(self, request):
        logger.info("=" * 80)
        logger.info("📥 BULK ACTION REQUEST")
        logger.info("=" * 80)

        data = request.data

        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                return Response(
                    {'error': 'Invalid JSON body'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if hasattr(data, 'dict'):
            data = data.dict()

        if not isinstance(data, dict):
            return Response(
                {'error': 'Request body must be a JSON object'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        original_action = data.get('action')
        if original_action is None:
            original_action = data.get('type') or data.get('operation')

        if not isinstance(original_action, str):
            return Response(
                {
                    'error': 'action is required and must be a string',
                    'allowed_actions': sorted(BULK_ACTION_MAP.keys()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        original_action = original_action.strip()
        backend_action = BULK_ACTION_MAP.get(original_action)

        if backend_action is None:
            return Response(
                {
                    'error': f'Invalid action: {original_action!r}',
                    'allowed_actions': sorted(BULK_ACTION_MAP.keys()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking_ids_raw = None
        for key in ('booking_ids', 'bookingIds', 'ids', 'selected_ids', 'selectedIds', 'bookings'):
            if key in data:
                booking_ids_raw = data[key]
                break

        if booking_ids_raw is None:
            return Response(
                {
                    'error': 'booking_ids is required',
                    'expected_format': {
                        'booking_ids': ['<uuid>', '<uuid>'],
                        'action': 'mark_payment_received',
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if isinstance(booking_ids_raw, str):
            stripped = booking_ids_raw.strip()
            if stripped.startswith('['):
                try:
                    booking_ids_raw = json.loads(stripped)
                except json.JSONDecodeError:
                    booking_ids_raw = [stripped]
            elif ',' in stripped:
                booking_ids_raw = [p.strip() for p in stripped.split(',') if p.strip()]
            else:
                booking_ids_raw = [stripped]
        elif not isinstance(booking_ids_raw, list):
            booking_ids_raw = [booking_ids_raw]

        booking_ids = []
        for item in booking_ids_raw:
            if isinstance(item, dict):
                item = item.get('id') or item.get('booking_id')
            if item is None:
                continue
            s = str(item).strip()
            if s and s not in ('null', 'undefined'):
                booking_ids.append(s)

        if not booking_ids:
            return Response(
                {'error': 'No valid booking_ids provided'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        MAX_BULK = 200
        if len(booking_ids) > MAX_BULK:
            return Response(
                {'error': f'Maximum {MAX_BULK} bookings per bulk action.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bookings = []
        not_found = []
        permission_denied = []

        for booking_id in booking_ids:
            try:
                booking = Booking.objects.get(id=booking_id)
            except (Booking.DoesNotExist, ValueError, ValidationError):
                not_found.append({'booking_id': booking_id, 'reason': 'Booking not found'})
                continue

            if self._can_manage_booking(request.user, booking):
                bookings.append(booking)
            else:
                permission_denied.append({
                    'booking_id': booking_id,
                    'reference': booking.booking_reference,
                    'reason': 'Permission denied',
                })

        if not bookings:
            return Response(
                {
                    'status': 'failed',
                    'message': 'No valid bookings found',
                    'errors': {'not_found': not_found, 'permission_denied': permission_denied},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation_results = self._validate_bookings_for_action(bookings, backend_action)

        if validation_results['invalid']:
            return Response(
                {
                    'status': 'validation_failed',
                    'message': (
                        f'{len(validation_results["invalid"])} booking(s) are not '
                        f'eligible for {original_action}'
                    ),
                    'action': original_action,
                    'mapped_action': backend_action,
                    'validation_results': {
                        'valid_count': len(validation_results['valid']),
                        'invalid_count': len(validation_results['invalid']),
                        'invalid': validation_results['invalid'],
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        handler = {
            'confirm_payment':           self._confirm_payment_for_booking,
            'confirm_payment_and_issue': self._confirm_payment_and_issue_tickets_for_booking,
            'issue_tickets':             self._issue_tickets_for_booking,
            'regenerate_ticket_qr':      self._regenerate_ticket_qr_for_booking,
            'cancel_booking':            self._cancel_booking_action,
            'refund_booking':            self._refund_booking_action,
        }[backend_action]

        results = []
        errors = []

        with transaction.atomic():
            for booking_id in validation_results['valid']:
                try:
                    booking = Booking.objects.get(id=booking_id)
                    result = handler(booking)
                    results.append({
                        'booking_id': str(booking.id),
                        'reference': booking.booking_reference,
                        'customer_name': booking.customer_name,
                        'current_status': booking.status,
                        'result': result,
                        'status': 'success' if 'error' not in result else 'failed',
                    })
                except Exception as exc:
                    logger.exception("Bulk action failed for booking %s", booking_id)
                    errors.append({'booking_id': booking_id, 'error': str(exc)})

        return Response(
            {
                'status': 'completed',
                'action': original_action,
                'mapped_action': backend_action,
                'summary': {
                    'total_processed': len(results),
                    'successful': sum(1 for r in results if r.get('status') == 'success'),
                    'failed': len(errors),
                },
                'results': results,
                'errors': errors or None,
            },
            status=status.HTTP_200_OK,
        )

    def _validate_bookings_for_action(self, bookings, action):
        valid = []
        invalid = []

        for booking in bookings:
            is_valid = True
            validation_errors = []

            if action == 'confirm_payment':
                if booking.status not in ['pending', 'processing']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be pending or processing. Current status: {booking.status}'
                    })
                if booking.status == 'cancelled':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot confirm payment for cancelled booking'})
                if booking.status == 'refunded':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot confirm payment for refunded booking'})
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Booking is already completed'})
                if booking.paid_at:
                    is_valid = False
                    validation_errors.append({
                        'field': 'paid_at',
                        'message': 'Payment already confirmed at ' + booking.paid_at.strftime('%Y-%m-%d %H:%M')
                    })

            elif action == 'confirm_payment_and_issue':
                if booking.status not in ['pending', 'processing']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be pending or processing. Current status: {booking.status}'
                    })
                if booking.status == 'cancelled':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot process cancelled booking'})
                if booking.status == 'refunded':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot process refunded booking'})
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Booking is already completed'})

                if is_valid:
                    existing_tickets = booking.tickets.filter(status='active')
                    if existing_tickets.exists():
                        is_valid = False
                        ticket_details = [{
                            'ticket_code': t.unique_code,
                            'tier_name': t.tier.name if t.tier else 'Unknown',
                            'attendee_name': t.attendee_name or 'Guest',
                            'status': t.status,
                        } for t in existing_tickets]
                        validation_errors.append({
                            'field': 'tickets',
                            'message': f'This booking already has {existing_tickets.count()} active ticket(s). New tickets cannot be issued.',
                            'ticket_details': ticket_details,
                        })

                if booking.paid_at:
                    validation_errors.append({
                        'field': 'paid_at',
                        'message': f'Payment already confirmed at {booking.paid_at.strftime("%Y-%m-%d %H:%M")}. Use "Issue Tickets" action instead.'
                    })

            elif action == 'issue_tickets':
                if booking.status not in ['paid', 'confirmed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be paid or confirmed. Current status: {booking.status}'
                    })
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': 'Booking is already completed. Tickets have been fully used.'
                    })
                if is_valid:
                    existing_tickets = booking.tickets.filter(status='active')
                    if existing_tickets.exists():
                        is_valid = False
                        ticket_details = [{
                            'ticket_code': t.unique_code,
                            'tier_name': t.tier.name if t.tier else 'Unknown',
                            'attendee_name': t.attendee_name or 'Guest',
                            'status': t.status,
                        } for t in existing_tickets]
                        validation_errors.append({
                            'field': 'tickets',
                            'message': f'This booking already has {existing_tickets.count()} active ticket(s). New tickets cannot be issued.',
                            'ticket_details': ticket_details,
                        })

            elif action == 'regenerate_ticket_qr':
                if booking.status not in ['paid', 'confirmed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be paid or confirmed. Current status: {booking.status}'
                    })
                if is_valid:
                    if not booking.tickets.filter(status='active').exists():
                        is_valid = False
                        validation_errors.append({
                            'field': 'tickets',
                            'message': 'No active tickets found to regenerate QR codes'
                        })

            elif action == 'cancel_booking':
                if booking.status in ['cancelled', 'refunded', 'completed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking is already {booking.status}'
                    })

            elif action == 'refund_booking':
                if booking.status not in ['paid', 'confirmed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Only paid or confirmed bookings can be refunded. Current status: {booking.status}'
                    })
                if booking.status == 'refunded':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Booking is already refunded'})
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': 'Cannot refund a completed booking (all tickets already used)'
                    })

            if is_valid and not booking.event:
                is_valid = False
                validation_errors.append({'field': 'event', 'message': 'Booking has no associated event'})

            if is_valid and booking.event and booking.event.status == 'cancelled':
                is_valid = False
                validation_errors.append({
                    'field': 'event_status',
                    'message': 'Cannot process booking for cancelled event'
                })

            if is_valid:
                valid.append(str(booking.id))
            else:
                invalid.append({
                    'booking_id': str(booking.id),
                    'reference': booking.booking_reference,
                    'customer_name': booking.customer_name,
                    'current_status': booking.status,
                    'ticket_count': booking.tickets.count(),
                    'active_ticket_count': booking.tickets.filter(status='active').count(),
                    'used_ticket_count': booking.tickets.filter(status='used').count(),
                    'errors': validation_errors,
                })

        return {'valid': valid, 'invalid': invalid}

    def _can_manage_booking(self, user, booking):
        if user.is_superuser or user.is_staff:
            return True
        if _is_organizer(user):
            return booking.event.organizer_id == user.id
        return booking.user_id == user.id

    # ==================== CONFIRM PAYMENT ====================

    def _confirm_payment_for_booking(self, booking):
        if booking.status in ['paid', 'confirmed', 'completed']:
            return {'warning': f'Booking is already {booking.status}'}

        if booking.status == 'cancelled':
            return {'error': 'Cannot confirm payment for cancelled booking'}

        if booking.status == 'refunded':
            return {'error': 'Cannot confirm payment for refunded booking'}

        booking.status = 'paid'
        booking.paid_at = timezone.now()
        booking.save()

        try:
            self._send_payment_confirmation_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Payment confirmation email failed (not blocking): {str(e)}")

        return {
            'success': 'Payment confirmed successfully',
            'tickets_generated': 0,
            'note': 'No tickets were generated. Use "Issue Tickets" action separately if needed.'
        }

    def _confirm_payment_and_issue_tickets_for_booking(self, booking):
        if booking.status not in ['pending', 'processing']:
            return {'error': f'Cannot process booking with status: {booking.status}'}

        if booking.status == 'completed':
            return {'error': 'Booking is already completed'}

        if booking.tickets.filter(status='active').exists():
            active_tickets = booking.tickets.filter(status='active')
            ticket_details = [{'code': t.unique_code, 'status': t.status} for t in active_tickets]
            return {
                'error': 'Cannot issue tickets. Booking already has active tickets.',
                'active_tickets': active_tickets.count(),
                'ticket_details': ticket_details,
            }

        booking.status = 'confirmed'
        booking.paid_at = timezone.now()
        booking.save()

        logger.info(f"✅ Booking {booking.booking_reference} status set to confirmed (payment + tickets)")

        tickets_result = self._issue_tickets_for_booking(booking)

        if 'error' in tickets_result:
            booking.status = 'pending'
            booking.save()
            return tickets_result

        self._update_event_counts(booking.event)

        return {
            'success': 'Payment confirmed and tickets issued successfully',
            'tickets_generated': tickets_result.get('tickets_created', 0),
            'email_sent': tickets_result.get('email_sent', False),
            'email_message': tickets_result.get('email_message', ''),
        }

    # ============ SLOT VALIDATION AND RE-ALLOCATION ============

    def _validate_and_allocate_slot(self, booking):
        if not booking.session:
            logger.info(f"🔄 No session assigned for booking {booking.booking_reference}")
            return self._allocate_best_slot(booking)

        session = booking.session
        session.refresh_from_db()
        remaining_capacity = session.capacity - session.booked

        if remaining_capacity > 0:
            logger.info(f"✅ Slot {session.id} still has {remaining_capacity} capacity for booking {booking.booking_reference}")
            return True, session, "Slot confirmed"

        logger.warning(f"⚠️ Slot {session.id} is full for booking {booking.booking_reference}")
        return self._allocate_best_slot(booking)

    def _allocate_best_slot(self, booking):
        slot_preferences = []
        if hasattr(booking, 'metadata') and booking.metadata:
            slot_preferences = booking.metadata.get('slot_preferences', [])

        sessions = booking.event.sessions.filter(is_active=True)

        if not sessions.exists():
            logger.error(f"❌ No active sessions found for event {booking.event.id}")
            return False, None, "No sessions available for this event. Please contact support."

        allocated_slot = None
        allocation_message = ""
        checked_slots = []

        if slot_preferences:
            for pref_slot_id in slot_preferences:
                try:
                    pref_slot = sessions.get(id=pref_slot_id)
                    pref_slot.refresh_from_db()
                    remaining_capacity = pref_slot.capacity - pref_slot.booked

                    checked_slots.append({
                        'slot_id': str(pref_slot.id),
                        'available': remaining_capacity > 0,
                        'remaining': remaining_capacity,
                    })

                    if remaining_capacity > 0:
                        allocated_slot = pref_slot
                        preference_rank = slot_preferences.index(pref_slot_id) + 1
                        allocation_message = f"Allocated based on your Preference #{preference_rank}"
                        break
                except sessions.model.DoesNotExist:
                    continue

        if not allocated_slot:
            for session in sessions:
                session.refresh_from_db()
                remaining_capacity = session.capacity - session.booked
                if remaining_capacity > 0:
                    allocated_slot = session
                    allocation_message = "Allocated to next available slot (your preferred slots were full)"
                    break

        if not allocated_slot:
            return False, None, "All slots are currently full. Please contact support."

        booking.session = allocated_slot
        booking.save(update_fields=['session', 'updated_at'])

        if hasattr(booking, 'metadata'):
            if not booking.metadata:
                booking.metadata = {}
            booking.metadata['slot_allocation_message'] = allocation_message
            booking.metadata['slot_allocated_at'] = timezone.now().isoformat()
            booking.metadata['slot_allocation_checked_slots'] = checked_slots
            booking.save(update_fields=['metadata'])

        return True, allocated_slot, allocation_message

    # ============================================================
    # ✅ FIX [P21]: `_issue_tickets_for_booking` was a 500-line method.
    # The pure data-transformation steps are extracted below so they are
    # unit-testable in isolation and the orchestrator stays readable.
    # ============================================================

    def _collect_tickets_data_from_metadata(self, booking):
        """
        Extract the list of per-attendee ticket dicts from a booking's
        metadata, trying every shape the codebase has historically
        written: `metadata.tickets`, `metadata.ticket_types`,
        `metadata.tier_ids` + `tier_quantities`, and finally a flat
        `metadata.tier_id` + `metadata.quantity` pair.

        Returns a list of dicts (never None).
        """
        tickets_data = []
        if not (hasattr(booking, 'metadata') and booking.metadata):
            return tickets_data

        tickets_data = booking.metadata.get('tickets', [])
        logger.info(
            f"📊 Found {len(tickets_data)} tickets in "
            f"metadata.tickets for booking {booking.booking_reference}"
        )

        if not tickets_data:
            tickets_data = booking.metadata.get('ticket_types', [])
            logger.info(f"📊 Found {len(tickets_data)} tickets in metadata.ticket_types")

        if not tickets_data:
            tier_ids = booking.metadata.get('tier_ids', [])
            tier_quantities = booking.metadata.get('tier_quantities', {})
            attendee_names = booking.metadata.get('attendee_names', {})

            if tier_ids:
                for tier_id in tier_ids:
                    # ✅ FIX [P11]: 0 is the only safe default here.
                    quantity = tier_quantities.get(str(tier_id), 0)
                    try:
                        quantity = int(quantity)
                    except (ValueError, TypeError):
                        quantity = 0
                    if quantity <= 0:
                        continue
                    names = attendee_names.get(str(tier_id), [booking.customer_name] * quantity)
                    for i in range(quantity):
                        attendee_name = names[i] if i < len(names) else booking.customer_name
                        tickets_data.append({
                            'tier_id': tier_id,
                            'attendee_name': attendee_name,
                        })
                logger.info(f"📊 Reconstructed {len(tickets_data)} tickets from tier_ids")

        if not tickets_data:
            tier_id = booking.metadata.get('tier_id')
            quantity = booking.metadata.get('quantity', 0)
            try:
                quantity = int(quantity)
            except (ValueError, TypeError):
                quantity = 0
            if tier_id and quantity > 0:
                for i in range(quantity):
                    tickets_data.append({
                        'tier_id': tier_id,
                        'attendee_name': booking.customer_name,
                    })

        return tickets_data

    def _distribute_net_paid_across_tickets(self, booking):
        """
        Prorate the booking-level discount across each ticket and persist
        `net_paid_amount` on each row. This is the base for refund calc.
        """
        if not booking.tickets.exists():
            return

        from decimal import Decimal, ROUND_HALF_UP

        all_tickets = list(booking.tickets.all())
        gross_sum = sum(
            Decimal(str(t.tier.price)) for t in all_tickets if t.tier
        )
        discount = Decimal(str(booking.discount_applied or 0))
        net_total = Decimal(str(booking.total_amount)) - discount
        if net_total < 0:
            net_total = Decimal('0.00')

        for t in all_tickets:
            if gross_sum > 0 and t.tier:
                share = Decimal(str(t.tier.price)) / gross_sum
                t.net_paid_amount = (net_total * share).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )
            else:
                t.net_paid_amount = Decimal('0.00')
            t.save(update_fields=['net_paid_amount'])

        logger.info(
            "Distributed ₹%s net across %d tickets on booking %s",
            net_total, len(all_tickets), booking.booking_reference,
        )

    def _issue_tickets_for_booking(self, booking):
        """
        Create one Ticket row per attendee entry stored on the booking's
        metadata, then send the ticket email.

        NOTE ON SESSION CAPACITY
        ------------------------
        Seats are reserved at booking creation (see `create()`). Do NOT
        increment `session.booked` here — that would double-count.
        """
        logger.info(f"🔍 Starting _issue_tickets_for_booking for {booking.booking_reference}")

        # ---- 1. Ensure a session is assigned ----
        if not booking.session:
            if hasattr(booking, 'metadata') and booking.metadata:
                slot_id = booking.metadata.get('slot_id')
                if slot_id:
                    try:
                        session = Session.objects.get(id=slot_id)
                        booking.session = session
                        booking.save(update_fields=['session'])
                    except Session.DoesNotExist:
                        logger.error(f"❌ Session {slot_id} from metadata not found")

        # ---- 2. Validate + allocate a slot ----
        is_valid, allocated_slot, allocation_message = self._validate_and_allocate_slot(booking)
        if not is_valid:
            return {
                'error': 'No slot available for this booking',
                'message': allocation_message,
                'tickets_created': 0,
            }

        # ---- 3. Persist allocation message ----
        if hasattr(booking, 'metadata'):
            if not booking.metadata:
                booking.metadata = {}
            booking.metadata['slot_allocation_message'] = allocation_message
            booking.metadata['slot_allocated_at'] = timezone.now().isoformat()
            booking.save(update_fields=['metadata'])

        # ---- 4. Reject if tickets already exist ----
        existing_tickets = booking.tickets.filter(status='active')
        if existing_tickets.exists():
            ticket_details = [{
                'code': t.unique_code,
                'tier': t.tier.name if t.tier else 'Unknown',
                'attendee': t.attendee_name or 'Guest',
                'status': t.status,
            } for t in existing_tickets]
            return {
                'error': f'Cannot issue tickets. Booking already has {existing_tickets.count()} active ticket(s)',
                'existing_tickets': ticket_details,
                'tickets_created': 0,
            }

        if booking.status == 'completed':
            return {'error': 'Booking is already completed. All tickets have been used.'}

        # ---- 5. Resolve session ----
        session_to_use = booking.session
        if not session_to_use:
            if hasattr(booking, 'metadata') and booking.metadata:
                slot_id = booking.metadata.get('slot_id')
                if slot_id:
                    try:
                        session_to_use = Session.objects.get(id=slot_id)
                        booking.session = session_to_use
                        booking.save(update_fields=['session'])
                    except Session.DoesNotExist:
                        logger.error(f"❌ Session {slot_id} not found")

        # ---- 6. Gather ticket data ----
        tickets_data = self._collect_tickets_data_from_metadata(booking)
        expected_count = len(tickets_data) if tickets_data else 0

        # ---- 7. Create tickets ----
        tickets_created = 0
        created_ticket_ids = []
        fallback_log = []

        valid_tiers = {
            str(t.id): t
            for t in TicketTier.objects.filter(event=booking.event)
        }
        tiers_in_order = list(valid_tiers.values())

        if expected_count > 0 and not tiers_in_order:
            return {
                'error': (
                    'This event has no ticket tiers configured. '
                    'Tickets cannot be issued until at least one tier exists.'
                ),
                'tickets_created': 0,
                'debug_info': {
                    'booking_id': str(booking.id),
                    'reference': booking.booking_reference,
                    'expected_tickets': expected_count,
                    'event_tiers_count': 0,
                },
            }

        for idx, ticket_data in enumerate(tickets_data):
            attendee_name = (
                ticket_data.get('attendee_name', booking.customer_name)
                if isinstance(ticket_data, dict)
                else booking.customer_name
            )

            tier, fallback_reason = self._resolve_tier_for_metadata_entry(
                ticket_data, valid_tiers, tiers_in_order, idx,
            )

            if tier is None:
                logger.error(
                    "❌ Ticket #%d for %s: no tier could be resolved. "
                    "Skipping attendee %r.",
                    idx, booking.booking_reference, attendee_name,
                )
                fallback_log.append({
                    'index': idx,
                    'attendee_name': attendee_name,
                    'reason': 'no-tier-available',
                    'created': False,
                })
                continue

            if fallback_reason:
                fallback_log.append({
                    'index': idx,
                    'attendee_name': attendee_name,
                    'reason': fallback_reason,
                    'created': True,
                })

            try:
                ticket = Ticket.objects.create(
                    booking=booking,
                    tier=tier,
                    event=booking.event,
                    session=session_to_use,
                    status='active',
                    attendee_name=attendee_name,
                    attendee_email=booking.customer_email,
                    attendee_phone=booking.customer_phone,
                )
                self._generate_qr_code(ticket)

                tier.quantity_sold += 1
                tier.save(update_fields=['quantity_sold'])

                booking.event.total_tickets_sold += 1
                booking.event.save(update_fields=['total_tickets_sold'])

                tickets_created += 1
                created_ticket_ids.append(str(ticket.id))
                logger.info(
                    "✅ Created ticket %s for %s (Tier: %s)",
                    ticket.unique_code, attendee_name, tier.name,
                )
            except Exception as e:
                logger.exception(
                    "❌ Error creating ticket #%d for %r: %s",
                    idx, attendee_name, e,
                )
                fallback_log.append({
                    'index': idx,
                    'attendee_name': attendee_name,
                    'reason': f'exception: {e}',
                    'created': False,
                })
                continue

        if tickets_created > 0:
            booking.metadata['ticket_created'] = True
            booking.metadata['tickets_created_count'] = tickets_created
            booking.metadata['ticket_ids'] = created_ticket_ids
            if fallback_log:
                booking.metadata['ticket_issuance_fallback_log'] = fallback_log
            booking.save(update_fields=['metadata'])
            logger.info(
                "✅ Updated metadata: ticket_created=True, count=%d",
                tickets_created,
            )

        # ---- 7b. Integrity check ----
        if expected_count > 0 and tickets_created < expected_count:
            missing = expected_count - tickets_created
            logger.error(
                "🚨 TICKET ISSUANCE MISMATCH on booking %s: "
                "expected %d, created %d (%d missing). "
                "fallback_log=%s",
                booking.booking_reference,
                expected_count,
                tickets_created,
                missing,
                fallback_log,
            )
            return {
                'error': (
                    f'Ticket issuance incomplete: expected '
                    f'{expected_count} tickets, created '
                    f'{tickets_created}. {missing} attendee(s) were '
                    f'dropped. See server logs for details.'
                ),
                'tickets_created': tickets_created,
                'ticket_ids': created_ticket_ids,
                'expected_count': expected_count,
                'fallback_log': fallback_log,
            }

        # ---- 8. Fallback ticket if metadata had none ----
        if tickets_created == 0:
            logger.warning(
                f"⚠️ No ticket data found in metadata for booking "
                f"{booking.booking_reference}"
            )

            if booking.event and booking.event.tiers.exists():
                available_tiers = booking.event.tiers.filter(
                    quantity_total__gt=F('quantity_sold')
                )

                if available_tiers.exists():
                    tier = available_tiers.first()
                    tickets_created = self._generate_tickets(
                        booking, tier, 1, session_to_use,
                    )
                    logger.info(
                        f"✅ Created {tickets_created} fallback ticket "
                        f"from tier: {tier.name}"
                    )

                    booking.metadata['fallback_ticket_created'] = True
                    booking.metadata['fallback_tier_id'] = str(tier.id)
                    booking.metadata['fallback_tier_name'] = tier.name
                    booking.save(update_fields=['metadata'])
                else:
                    return {
                        'error': (
                            'No available ticket tiers found for this '
                            'event. Please contact support.'
                        ),
                        'tickets_created': 0,
                        'debug_info': {
                            'booking_id': str(booking.id),
                            'reference': booking.booking_reference,
                            'metadata': booking.metadata,
                            'event_tiers_count': (
                                booking.event.tiers.count()
                                if booking.event else 0
                            ),
                        },
                    }
            else:
                return {
                    'error': (
                        'No ticket information found for this booking. '
                        'Please contact support.'
                    ),
                    'tickets_created': 0,
                    'debug_info': {
                        'booking_id': str(booking.id),
                        'reference': booking.booking_reference,
                        'metadata': booking.metadata,
                        'has_event': booking.event is not None,
                        'event_tiers_count': (
                            booking.event.tiers.count()
                            if booking.event else 0
                        ),
                    },
                }

        # ---- 9. Prorate net_paid_amount ----
        if tickets_created > 0:
            self._distribute_net_paid_across_tickets(booking)

        # ---- 10. Session capacity: NO-OP (see docstring) ----

        # ---- 11. Promote status from paid → confirmed ----
        if booking.status == 'paid':
            booking.status = 'confirmed'
            booking.save(update_fields=['status'])

        booking.refresh_from_db()
        final_ticket_count = booking.tickets.count()

        # ---- 12. Send tickets email ----
        try:
            email_result = self._send_tickets_email(booking, allocation_message)
        except Exception as e:
            logger.warning(f"⚠️ Tickets email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'message': str(e)}

        return {
            'success': (
                f'Generated {tickets_created} tickets for slot '
                f'{booking.session.id if booking.session else "Unknown"}'
            ),
            'tickets_created': tickets_created,
            'final_ticket_count': final_ticket_count,
            'ticket_ids': created_ticket_ids,
            'email_sent': email_result.get('success', False),
            'email_message': email_result.get('message', ''),
            'slot_allocation': {
                'slot_id': str(booking.session.id) if booking.session else None,
                'slot_start': (
                    booking.session.start_time.isoformat()
                    if booking.session else None
                ),
                'slot_end': (
                    booking.session.end_time.isoformat()
                    if booking.session else None
                ),
                'allocation_message': allocation_message,
            },
        }

    # ==================== DEBUG METADATA ENDPOINT ====================

    @action(detail=True, methods=['get'])
    def debug_metadata(self, request, pk=None):
        if not settings.DEBUG:
            return Response(
                {'error': 'Debug endpoint disabled in production'},
                status=status.HTTP_404_NOT_FOUND,
            )

        booking = self.get_object()
        metadata = booking.metadata or {}

        tickets_data = metadata.get('tickets', [])
        ticket_types = metadata.get('ticket_types', [])
        tier_ids = metadata.get('tier_ids', [])
        tier_quantities = metadata.get('tier_quantities', {})
        attendee_names = metadata.get('attendee_names', {})

        event_tiers = []
        if booking.event:
            for tier in booking.event.tiers.all():
                event_tiers.append({
                    'id': str(tier.id),
                    'name': tier.name,
                    'price': float(tier.price),
                    'available': tier.quantity_total - tier.quantity_sold,
                    'total': tier.quantity_total,
                    'sold': tier.quantity_sold,
                })

        existing_tickets = []
        for ticket in booking.tickets.all():
            existing_tickets.append({
                'id': str(ticket.id),
                'unique_code': ticket.unique_code,
                'tier_id': str(ticket.tier.id) if ticket.tier else None,
                'tier_name': ticket.tier.name if ticket.tier else None,
                'attendee_name': ticket.attendee_name,
                'status': ticket.status,
            })

        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'customer_name': booking.customer_name,
            'customer_email': booking.customer_email,
            'total_amount': booking.total_amount,
            'has_session': booking.session is not None,
            'session_id': str(booking.session.id) if booking.session else None,
            'ticket_count': booking.tickets.count(),
            'existing_tickets': existing_tickets,
            'metadata': {
                'tickets': tickets_data,
                'ticket_types': ticket_types,
                'tier_ids': tier_ids,
                'tier_quantities': tier_quantities,
                'attendee_names': attendee_names,
                'all_metadata_keys': list(metadata.keys()),
            },
            'event_tiers': event_tiers,
            'validation_check': {
                'has_tickets_data': len(tickets_data) > 0,
                'has_ticket_types': len(ticket_types) > 0,
                'has_tier_ids': len(tier_ids) > 0,
                'has_existing_tickets': len(existing_tickets) > 0,
                'can_issue_tickets': (
                    len(existing_tickets) == 0
                    and (
                        len(tickets_data) > 0
                        or len(ticket_types) > 0
                        or len(tier_ids) > 0
                    )
                ),
            },
        }, status=status.HTTP_200_OK)

    # ==================== ISSUE TICKETS ACTION ====================

    @action(detail=True, methods=['post'])
    def issue_tickets(self, request, pk=None):
        booking = self.get_object()

        existing_tickets = booking.tickets.filter(status='active')
        if existing_tickets.exists():
            return Response({
                'status': 'validation_failed',
                'error': f'Booking already has {existing_tickets.count()} active ticket(s)',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'existing_tickets': [
                    {'code': t.unique_code, 'attendee': t.attendee_name, 'status': t.status}
                    for t in existing_tickets
                ],
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status not in ['paid', 'confirmed']:
            return Response({
                'status': 'validation_failed',
                'error': f'Booking must be paid or confirmed. Current status: {booking.status}',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'current_status': booking.status,
                'suggestion': 'Use "Mark Payment Received" action first if booking is pending',
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status == 'completed':
            return Response({
                'status': 'validation_failed',
                'error': 'Booking is already completed. All tickets have been used.',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
            }, status=status.HTTP_400_BAD_REQUEST)

        result = self._issue_tickets_for_booking(booking)

        booking.refresh_from_db()

        if 'error' in result:
            return Response({
                'status': 'failed',
                'error': result.get('error'),
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'debug_info': result.get('debug_info', {}),
                'metadata': booking.metadata,
                'tickets_after_attempt': booking.tickets.count(),
            }, status=status.HTTP_400_BAD_REQUEST)

        final_ticket_count = booking.tickets.count()

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'tickets_generated': result.get('tickets_created', 0),
            'final_ticket_count': final_ticket_count,
            'ticket_ids': result.get('ticket_ids', []),
            'email_sent': result.get('email_sent', False),
            'email_message': result.get('email_message', ''),
            'result': result,
        }, status=status.HTTP_200_OK)

    # ==================== TICKET GENERATION HELPERS ====================

    def _generate_tickets(self, booking, tier, quantity, session=None):
        tickets_created = 0
        session_to_use = session or booking.session

        if not session_to_use:
            if hasattr(booking, 'metadata') and booking.metadata:
                slot_id = booking.metadata.get('slot_id')
                if slot_id:
                    try:
                        session_to_use = Session.objects.get(id=slot_id)
                        booking.session = session_to_use
                        booking.save(update_fields=['session'])
                    except Session.DoesNotExist:
                        logger.error(f"❌ Session {slot_id} not found in _generate_tickets")

        for i in range(quantity):
            try:
                ticket = Ticket.objects.create(
                    booking=booking,
                    tier=tier,
                    event=booking.event,
                    session=session_to_use,
                    status='active',
                    attendee_name=booking.customer_name,
                    attendee_email=booking.customer_email,
                    attendee_phone=booking.customer_phone,
                )

                self._generate_qr_code(ticket)

                tier.quantity_sold += 1
                tier.save()

                booking.event.total_tickets_sold += 1
                booking.event.save()

                tickets_created += 1

            except Exception as e:
                logger.error(f"Error generating ticket {i}: {str(e)}")
                raise

        return tickets_created

    def _generate_qr_code(self, ticket):
        """
        Generate QR code for a ticket.

        ✅ Uses the canonical SIGNED payload builder. The QR contents are:
            {"v":1,"type":"ticket","code":"TIX...","sig":"<hex>"}
        The scanner's client-side strict parser requires exactly this shape.
        """
        try:
            payload = serialise_ticket_qr_payload(ticket)

            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(payload)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")

            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()

            ticket.qr_code = img_str
            ticket.save(update_fields=['qr_code'])

            return True

        except Exception as e:
            logger.error(f"Error generating QR code for ticket {ticket.unique_code}: {str(e)}")
            return False

    # ==================== BOOKING STATUS RECONCILIATION ====================

    def _check_and_complete_booking(self, booking):
        """
        ✅ FIX [P9]: delegate to the canonical reconciler in
        `services.booking_status`. Behaviour is identical to the old
        inline implementation; the only difference is that all three
        callers (this viewset, checkin_api, views) now share one source.
        """
        return reconcile_completed_booking(booking)

    def _regenerate_ticket_qr_for_booking(self, booking):
        tickets = booking.tickets.filter(status='active')

        if not tickets.exists():
            return {'error': 'No active tickets found to regenerate QR codes'}

        regenerated_count = 0
        for ticket in tickets:
            try:
                self._generate_qr_code(ticket)
                regenerated_count += 1
            except Exception as e:
                logger.error(f"Error regenerating QR for ticket {ticket.unique_code}: {str(e)}")

        return {
            'success': f'Regenerated QR codes for {regenerated_count} tickets',
            'tickets_regenerated': regenerated_count,
        }

    def _cancel_booking_action(self, booking):
        if booking.status in ['cancelled', 'refunded', 'completed']:
            return {'error': f'Booking is already {booking.status}'}

        # Count the seats BEFORE flipping status. Only `active` tickets
        # held a seat — used / cancelled / refunded ones were already
        # accounted for in a previous release.
        seats_to_release = booking.tickets.filter(status='active').count()

        booking.status = 'cancelled'
        booking.save()

        booking.tickets.filter(status='active').update(status='cancelled')

        # ✅ Release reserved seats back to the session.
        self._release_session_seats(booking, seats_to_release)

        # ✅ Keep the denormalized event counters consistent.
        self._update_event_counts(booking.event)

        try:
            email_result = self._send_cancellation_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Cancellation email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return {
            'success': 'Booking cancelled successfully',
            'seats_released': seats_to_release,
            'email_sent': email_result.get('success', False),
        }

    def _refund_booking_action(self, booking):
        if booking.status not in ['paid', 'confirmed']:
            return {'error': f'Only paid or confirmed bookings can be refunded. Current status: {booking.status}'}

        if booking.status == 'refunded':
            return {'error': 'Booking is already refunded'}

        if booking.status == 'completed':
            return {'error': 'Cannot refund a completed booking (all tickets already used)'}

        seats_to_release = booking.tickets.filter(status='active').count()

        booking.status = 'refunded'
        booking.save()

        booking.tickets.filter(status='active').update(status='refunded')

        # ✅ Release reserved seats back to the session.
        self._release_session_seats(booking, seats_to_release)

        # ✅ Keep the denormalized event counters consistent.
        self._update_event_counts(booking.event)

        try:
            email_result = self._send_refund_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Refund email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return {
            'success': 'Booking refunded successfully',
            'seats_released': seats_to_release,
            'email_sent': email_result.get('success', False),
        }

    # ==================== EMAIL METHODS ====================
    #
    # ✅ FIX [P27]: real bodies are back.
    #
    # Design notes:
    #   • All five methods are safe to call from inside a `try/except`
    #     wrapper (the callers do that already). They return a dict with
    #     at least `success` and `message` so the caller can propagate
    #     the outcome into the API response.
    #   • None of them raise on delivery failure — SMTP / Resend errors
    #     are logged and folded into `success: False`. The caller
    #     already handles that. This is deliberate: a booking is not
    #     invalid just because email is having a bad day, and the
    #     `resend_tickets` action exists for the operator to retry.
    #   • Ticket PDFs/PNGs are generated per-ticket using the canonical
    #     signed QR payload via `TicketGenerator` — no local QR
    #     generation here. This matches the rest of the codebase.
    #   • `combine_tickets` and `ticket_format` on the event are
    #     honoured exactly as the Event admin UI exposes them:
    #       - 'pdf'  → one PDF per ticket
    #       - 'png'  → one PNG per ticket
    #       - 'both' → one PDF + one PNG per ticket
    #       - combine_tickets=True → a single combined PDF/PNG of all
    #         tickets on the booking, in addition to (or instead of)
    #         the individual ones, depending on the format.
    #
    # ✅ FIX [P27-bug3]: `_build_email_html` no longer receives the
    # duplicated `ticket_buffers` list when `ticket_format='both'`.
    # It receives a de-duplicated `tickets` list, so the template
    # renders each ticket exactly once.
    #
    # ✅ FIX [P27-bug4]: `first_qr_base64` is now an actual QR-only
    # data-URL produced by `QRCodeService.generate_ticket_qr`, not a
    # data-URL of the whole ticket PDF/PNG. Mail clients can render
    # it inline.
    #
    # ✅ FIX [P27-mem]: every BytesIO produced by the generator and
    # combiner is closed in a `finally` block, so a booking with 20
    # tickets doesn't hold 20 open buffers until response teardown.
    #
    # ✅ FIX [P41]: `combine_to_pdf` / `combine_to_paginated_image`
    # were being handed a buffer whose position was not at 0, OR a
    # buffer that had been consumed by a previous read. The combiner
    # treats PDF buffers as images, which fails with
    #   "cannot identify image file".
    #   - We now seek(0) *immediately before* every combiner call and
    #     re-verify `buffer.tell() == 0`.
    #   - If the combiner raises, we DO NOT abort the whole email.
    #     We fall back to sending the individual attachments for that
    #     format so the customer still receives their tickets.
    #   - We log the combined-file outcome explicitly so operators can
    #     see exactly why an email was sent (or was not).
    # ========================================================

    def _send_payment_confirmation_email(self, booking):
        """
        Notify the customer that their payment has been received and
        their tickets are being prepared.

        Returns {success, message} — never raises.
        """
        from django.core.mail import EmailMultiAlternatives
        from django.template.loader import render_to_string
        from django.utils.html import strip_tags

        try:
            if not booking.customer_email:
                return {
                    'success': False,
                    'message': 'No customer email on booking.',
                }

            context = {
                'booking': booking,
                'event': booking.event,
                'customer_name': booking.customer_name,
            }

            html_content = render_to_string(
                'emails/booking_confirmation.html', context,
            )
            text_content = strip_tags(html_content)

            subject = f'✅ Payment Received - {booking.booking_reference}'

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[booking.customer_email],
            )
            email.attach_alternative(html_content, 'text/html')

            sent_ok = _safe_send_email(
                email, context_label='payment_confirmation',
            )
            return {
                'success': sent_ok,
                'message': (
                    'Payment confirmation email sent.'
                    if sent_ok else
                    'Payment confirmation email failed (see logs).'
                ),
            }

        except Exception as exc:
            logger.exception(
                '❌ _send_payment_confirmation_email failed for %s: %s',
                booking.booking_reference, exc,
            )
            return {
                'success': False,
                'message': f'Email error: {exc}',
            }

    def _build_email_html(
        self, booking, ticket_buffers,
        format_names, is_combined, attachments, first_qr_base64,
    ):
        """
        Build the HTML body of the ticket email.

        `ticket_buffers` is the list of per-ticket entries (may contain
        both a PDF and a PNG entry for the same ticket when
        `ticket_format='both'`). The `tickets` context value is
        de-duplicated so the template renders each ticket once.

        `first_qr_base64` is a data-URL of the first ticket's QR
        (a real image, not a PDF/PNG of the whole ticket) so mail
        clients that strip attachments still show something scannable.

        Returns (html_string, text_string).
        """
        from django.template.loader import render_to_string
        from django.utils.html import strip_tags

        # ✅ FIX [P27-bug3]: de-duplicate by ticket id so 'both'
        # doesn't render every ticket twice in the email body.
        seen_ticket_ids = set()
        unique_tickets = []
        for tb in ticket_buffers:
            ticket = tb.get('ticket')
            if not ticket:
                continue
            if ticket.id in seen_ticket_ids:
                continue
            seen_ticket_ids.add(ticket.id)
            unique_tickets.append(ticket)

        first_ticket = unique_tickets[0] if unique_tickets else None
        ticket_url = (
            f"{settings.FRONTEND_URL}/tickets/{first_ticket.id}"
            if first_ticket else
            settings.FRONTEND_URL
        )

        context = {
            'booking': booking,
            'event': booking.event,
            'customer_name': booking.customer_name,
            'tickets': list(booking.tickets.filter(status='active')),
            'format_names': format_names or '',
            'is_combined': bool(is_combined),
            'attachments_count': len(attachments or []),
            'first_qr_base64': first_qr_base64 or '',
            'frontend_url': settings.FRONTEND_URL,
            #'ticket_url': ticket_url,# ❌ REMOVE OR COMMENT OUT THIS LINE
        }

        html_content = render_to_string('emails/ticket_email.html', context)
        text_content = strip_tags(html_content)
        return html_content, text_content

    def _seek_buffer(self, buf):
        """
        ✅ FIX [P41]: defensive rewind for a BytesIO before it is
        handed to a consumer (combiner, reader, etc). Some consumers
        (Pillow's Image.open via the combiner) inspect `buf` and
        expect `buf.tell() == 0`. If a previous step (e.g. attachment
        read) left the position at EOF, the consumer sees zero bytes
        and errors with `cannot identify image file`.

        Returns True on success, False on failure.
        """
        try:
            buf.seek(0)
            # Sanity check — a BytesIO whose position is not 0 after
            # `seek(0)` indicates something very strange is going on.
            if hasattr(buf, 'tell') and buf.tell() != 0:
                return False
            return True
        except Exception:
            return False

    def _read_buffer_bytes(self, buf):
        """
        ✅ FIX [P41]: read a BytesIO's full contents and rewind it
        afterwards, so the same buffer can be reused for both an
        attachment AND a combiner input. Returns bytes or None.
        """
        if not self._seek_buffer(buf):
            return None
        try:
            raw = buf.read()
            # Rewind again so the caller can still pass the buffer to
            # another consumer (e.g. combiner) without losing data.
            self._seek_buffer(buf)
            return raw
        except Exception:
            return None

    def _send_tickets_email(self, booking, allocation_message=None):
        """
        Generate ticket files and email them to the customer.

        Honours `event.ticket_format` ('pdf' | 'png' | 'both') and
        `event.combine_tickets` (single combined file vs. one per
        ticket) and `event.tickets_per_page` (for the combined file).

        Returns {
            success: bool,
            message: str,
            formats: str,          # e.g. 'PDF' or 'PDF+PNG'
            combined: bool,
            attachments: int,
        }

        Never raises.

        ✅ FIX [P41]: the previous implementation passed buffers to the
        combiner without rewinding them, then read the same buffers for
        attachments. A failed combine aborted the whole email (the
        exception was caught, but the return value was `success: False`
        with no individual attachments). Now:

          - Every buffer is seek(0)'d immediately before each consumer
            call.
          - Combined-file failures fall back to sending the individual
            attachments for that format. One broken combine must NOT
            cost the customer their tickets.
          - The combined-file outcome is logged explicitly.
        """
        from django.core.mail import EmailMultiAlternatives
        import base64 as _base64

        # Track every buffer we open so we can close them in `finally`,
        # even if an exception is raised mid-flight.
        opened_buffers = []
        ticket_buffers = []

        try:
            tickets = list(booking.tickets.filter(status='active'))
            if not tickets:
                return {
                    'success': False,
                    'message': 'No active tickets to send.',
                    'formats': '',
                    'combined': False,
                    'attachments': 0,
                }

            if not booking.customer_email:
                return {
                    'success': False,
                    'message': 'No customer email on booking.',
                    'formats': '',
                    'combined': False,
                    'attachments': 0,
                }

            event = booking.event
            ticket_format = (getattr(event, 'ticket_format', None) or 'pdf').lower()
            combine = bool(getattr(event, 'combine_tickets', False))
            per_page = int(getattr(event, 'tickets_per_page', 4) or 4)

            generator = TicketGenerator()
            combiner = TicketCombiner()

            attachments = []   # list of (filename, bytes, mimetype)
            format_names = []

            want_pdf = ticket_format in ('pdf', 'both')
            want_png = ticket_format in ('png', 'both')

            if want_pdf:
                format_names.append('PDF')
            if want_png:
                format_names.append('PNG')

            # ---- 1. Per-ticket files ----
            for ticket in tickets:
                if want_pdf:
                    pdf_buf = generator.generate_ticket_pdf(
                        ticket, booking, event,
                    )
                    if pdf_buf:
                        opened_buffers.append(pdf_buf)
                        ticket_buffers.append({
                            'ticket': ticket,
                            'buffer': pdf_buf,
                            'format': 'pdf',
                        })

                if want_png:
                    png_buf = generator.generate_ticket_png(
                        ticket, booking, event,
                    )
                    if png_buf:
                        opened_buffers.append(png_buf)
                        ticket_buffers.append({
                            'ticket': ticket,
                            'buffer': png_buf,
                            'format': 'png',
                        })

            # ✅ FIX [P27-bug4]: `first_qr_base64` is a real QR image
            # (not the whole ticket). Mail clients can render it inline.
            # ✅ FIX: Ensure the string is a full Data URI for email rendering
            first_qr_base64 = ''
            if tickets:
                try:
                    from ..services.qr_service import QRCodeService
                    raw_qr = QRCodeService.generate_ticket_qr(tickets[0]) or ''
                    
                    if raw_qr and not raw_qr.startswith('data:image'):
                        first_qr_base64 = f"data:image/png;base64,{raw_qr}"
                    else:
                        first_qr_base64 = raw_qr
                except Exception as exc:
                    logger.warning(
                        "⚠️ Could not generate inline QR for booking %s: %s",
                        booking.booking_reference, exc,
                    )
                    first_qr_base64 = ''

            # ---- 2. Combined file (only when combine=True) ----
            #
            # ✅ FIX [P41]: the combined file is a "nice to have". If it
            # fails, we still want the individual attachments to be sent.
            # Build the combined files first, and only skip the
            # individual ones if EVERY combined file we tried succeeded.
            combined_attachments = []
            combined_failed = False

            if combine:
                pdf_entries = [e for e in ticket_buffers if e['format'] == 'pdf']
                png_entries = [e for e in ticket_buffers if e['format'] == 'png']

                if pdf_entries:
                    try:
                        combine_input = []
                        for e in pdf_entries:
                            if not self._seek_buffer(e['buffer']):
                                raise ValueError(
                                    f"PDF buffer for ticket "
                                    f"{e['ticket'].unique_code} is not readable"
                                )
                            combine_input.append({
                                'buffer': e['buffer'],
                                'ticket': e['ticket'],
                            })

                        combined_pdf = combiner.combine_to_pdf(
                            combine_input,
                            booking,
                            tickets_per_page=per_page,
                        )
                    except Exception as exc:
                        logger.error(
                            "❌ combine_to_pdf failed for booking %s: %s "
                            "— falling back to individual PDF attachments.",
                            booking.booking_reference, exc,
                        )
                        combined_pdf = None
                        combined_failed = True

                    if combined_pdf:
                        opened_buffers.append(combined_pdf)
                        raw = self._read_buffer_bytes(combined_pdf)
                        if raw is not None:
                            combined_attachments.append((
                                f'tickets_{booking.booking_reference}.pdf',
                                raw,
                                'application/pdf',
                            ))
                            logger.info(
                                "✅ Combined PDF built for booking %s (%d bytes)",
                                booking.booking_reference, len(raw),
                            )
                        else:
                            logger.warning(
                                "⚠️ Combined PDF for booking %s was "
                                "generated but could not be read back.",
                                booking.booking_reference,
                            )
                            combined_failed = True

                if png_entries:
                    try:
                        combine_input = []
                        for e in png_entries:
                            if not self._seek_buffer(e['buffer']):
                                raise ValueError(
                                    f"PNG buffer for ticket "
                                    f"{e['ticket'].unique_code} is not readable"
                                )
                            combine_input.append({
                                'buffer': e['buffer'],
                                'ticket': e['ticket'],
                            })

                        combined_png = combiner.combine_to_paginated_image(
                            combine_input,
                            booking,
                            tickets_per_page=per_page,
                            output_format='PNG',
                        )
                    except Exception as exc:
                        logger.error(
                            "❌ combine_to_paginated_image failed for "
                            "booking %s: %s — falling back to individual "
                            "PNG attachments.",
                            booking.booking_reference, exc,
                        )
                        combined_png = None
                        combined_failed = True

                    if combined_png:
                        opened_buffers.append(combined_png)
                        raw = self._read_buffer_bytes(combined_png)
                        if raw is not None:
                            combined_attachments.append((
                                f'tickets_{booking.booking_reference}.png',
                                raw,
                                'image/png',
                            ))
                            logger.info(
                                "✅ Combined PNG built for booking %s (%d bytes)",
                                booking.booking_reference, len(raw),
                            )
                        else:
                            logger.warning(
                                "⚠️ Combined PNG for booking %s was "
                                "generated but could not be read back.",
                                booking.booking_reference,
                            )
                            combined_failed = True

            # ---- 3. Decide which attachments to actually send ----
            #
            # If `combine` is requested AND we got at least one combined
            # file AND none of the combine attempts failed, send ONLY
            # the combined file(s). Otherwise send the individual files
            # (so the customer still receives their tickets when the
            # combiner is broken).
            use_combined = (
                combine
                and bool(combined_attachments)
                and not combined_failed
            )

            if use_combined:
                attachments.extend(combined_attachments)
                logger.info(
                    "📎 Sending combined file(s) only for booking %s",
                    booking.booking_reference,
                )
            else:
                for entry in ticket_buffers:
                    ticket = entry['ticket']
                    raw = self._read_buffer_bytes(entry['buffer'])
                    if raw is None:
                        logger.warning(
                            "⚠️ Could not read buffer for ticket %s",
                            ticket.unique_code,
                        )
                        continue

                    if entry['format'] == 'pdf':
                        attachments.append((
                            f'ticket_{ticket.unique_code}.pdf',
                            raw,
                            'application/pdf',
                        ))
                    else:
                        attachments.append((
                            f'ticket_{ticket.unique_code}.png',
                            raw,
                            'image/png',
                        ))

                if combine and not use_combined:
                    logger.warning(
                        "⚠️ Combined file(s) requested but not sent for "
                        "booking %s — sending individual attachments "
                        "instead (%d files).",
                        booking.booking_reference, len(attachments),
                    )

            if not attachments:
                return {
                    'success': False,
                    'message': 'No ticket files could be generated.',
                    'formats': '+'.join(format_names),
                    'combined': use_combined,
                    'attachments': 0,
                }

            # ---- 4. Build the email body ----
            html_content, text_content = self._build_email_html(
                booking,
                ticket_buffers,
                '+'.join(format_names),
                use_combined,
                attachments,
                first_qr_base64,
            )

            subject = (
                f'🎫 Your Tickets for '
                f'{booking.event.title if booking.event else "Event"}'
            )

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[booking.customer_email],
            )
            email.attach_alternative(html_content, 'text/html')

            for filename, raw, mimetype in attachments:
                email.attach(filename, raw, mimetype)

            sent_ok = _safe_send_email(email, context_label='tickets')

            # ✅ FIX [P27-h4]: one line summary so operators can see the
            # actual output without grepping individual logs.
            logger.info(
                "📧 tickets_email: booking=%s, pdf=%d, png=%d, "
                "combined=%s, attachments=%d, sent=%s",
                booking.booking_reference,
                sum(1 for e in ticket_buffers if e['format'] == 'pdf'),
                sum(1 for e in ticket_buffers if e['format'] == 'png'),
                use_combined,
                len(attachments),
                sent_ok,
            )

            return {
                'success': sent_ok,
                'message': (
                    f'Tickets sent to {booking.customer_email}.'
                    if sent_ok else
                    'Ticket email failed (see logs).'
                ),
                'formats': '+'.join(format_names),
                'combined': use_combined,
                'attachments': len(attachments),
            }

        except Exception as exc:
            logger.exception(
                '❌ _send_tickets_email failed for %s: %s',
                booking.booking_reference, exc,
            )
            return {
                'success': False,
                'message': f'Email error: {exc}',
                'formats': '',
                'combined': False,
                'attachments': 0,
            }

        finally:
            # ✅ FIX [P27-mem]: close every buffer we opened, regardless
            # of whether the send succeeded. On CPython this is mostly
            # belt-and-braces (BytesIO has no OS resource), but it
            # ensures we never hold a reference to a buffer that a
            # later code path might try to write to.
            for buf in opened_buffers:
                try:
                    buf.close()
                except Exception:
                    pass

    def _send_cancellation_email(self, booking):
        """
        Notify the customer that the entire booking has been cancelled.

        Returns {success, error} — never raises.
        """
        from django.core.mail import EmailMultiAlternatives
        from django.template.loader import render_to_string
        from django.utils.html import strip_tags

        try:
            if not booking.customer_email:
                return {'success': False, 'error': 'No customer email.'}

            context = {
                'booking': booking,
                'event': booking.event,
                'customer_name': booking.customer_name,
                'refund_amount': booking.refund_amount or 0,
            }

            try:
                html_content = render_to_string(
                    'emails/booking_cancelled.html', context,
                )
            except Exception:
                html_content = (
                    f'<p>Hi {booking.customer_name},</p>'
                    f'<p>Your booking <strong>{booking.booking_reference}</strong> '
                    f'has been cancelled.</p>'
                    f'<p>Refund amount: ₹{booking.refund_amount or 0}</p>'
                )

            text_content = strip_tags(html_content)
            subject = f'❌ Booking Cancelled - {booking.booking_reference}'

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[booking.customer_email],
            )
            email.attach_alternative(html_content, 'text/html')

            sent_ok = _safe_send_email(
                email, context_label='cancellation',
            )
            return {
                'success': sent_ok,
                'error': None if sent_ok else 'Delivery failed (see logs).',
            }

        except Exception as exc:
            logger.exception(
                '❌ _send_cancellation_email failed for %s: %s',
                booking.booking_reference, exc,
            )
            return {'success': False, 'error': str(exc)}

    def _send_refund_email(self, booking):
        """
        Notify the customer that the booking has been refunded.

        Returns {success, error} — never raises.
        """
        from django.core.mail import EmailMultiAlternatives
        from django.template.loader import render_to_string
        from django.utils.html import strip_tags

        try:
            if not booking.customer_email:
                return {'success': False, 'error': 'No customer email.'}

            context = {
                'booking': booking,
                'event': booking.event,
                'customer_name': booking.customer_name,
                'refund_amount': booking.refund_amount or 0,
            }

            try:
                html_content = render_to_string(
                    'emails/booking_refunded.html', context,
                )
            except Exception:
                html_content = (
                    f'<p>Hi {booking.customer_name},</p>'
                    f'<p>Your booking <strong>{booking.booking_reference}</strong> '
                    f'has been refunded.</p>'
                    f'<p>Refund amount: ₹{booking.refund_amount or 0}</p>'
                )

            text_content = strip_tags(html_content)
            subject = f'💸 Booking Refunded - {booking.booking_reference}'

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[booking.customer_email],
            )
            email.attach_alternative(html_content, 'text/html')

            sent_ok = _safe_send_email(
                email, context_label='refund',
            )
            return {
                'success': sent_ok,
                'error': None if sent_ok else 'Delivery failed (see logs).',
            }

        except Exception as exc:
            logger.exception(
                '❌ _send_refund_email failed for %s: %s',
                booking.booking_reference, exc,
            )
            return {'success': False, 'error': str(exc)}

    # ==================== MISC ACTIONS ====================

    @action(detail=True, methods=['get'])
    def status_info(self, request, pk=None):
        pass

    @action(detail=True, methods=['post'])
    def confirm_payment_and_issue_tickets(self, request, pk=None):
        booking = self.get_object()

        validation = self._validate_bookings_for_action([booking], 'confirm_payment_and_issue')
        if validation['invalid']:
            return Response({
                'status': 'validation_failed',
                'errors': validation['invalid'],
            }, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            result = self._confirm_payment_and_issue_tickets_for_booking(booking)

            if 'error' in result:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'success',
            'booking': {
                'id': str(booking.id),
                'reference': booking.booking_reference,
                'status': booking.status,
            },
            'result': result,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def mark_payment_received(self, request, pk=None):
        booking = self.get_object()

        validation = self._validate_bookings_for_action([booking], 'confirm_payment')
        if validation['invalid']:
            return Response({
                'status': 'validation_failed',
                'errors': validation['invalid'],
            }, status=status.HTTP_400_BAD_REQUEST)

        result = self._confirm_payment_for_booking(booking)

        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'result': result,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def regenerate_ticket_qr(self, request, pk=None):
        booking = self.get_object()

        tickets = booking.tickets.filter(status='active')
        if not tickets.exists():
            return Response(
                {'error': 'No active tickets found to regenerate QR codes'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            regenerated_count = 0
            for ticket in tickets:
                try:
                    self._generate_qr_code(ticket)
                    regenerated_count += 1
                except Exception as e:
                    logger.error(f"Error regenerating QR for ticket {ticket.unique_code}: {str(e)}")

            return Response({
                'status': 'success',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'tickets_regenerated': regenerated_count,
                'message': f'Regenerated QR codes for {regenerated_count} tickets',
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error regenerating QR codes: {str(e)}")
            return Response(
                {'error': f'Failed to regenerate QR codes: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'])
    def cancel_booking(self, request, pk=None):
        booking = self.get_object()

        if booking.status in ['cancelled', 'refunded', 'completed']:
            return Response({
                'error': f'Booking is already {booking.status}',
            }, status=status.HTTP_400_BAD_REQUEST)

        event = booking.event
        seats_to_release = booking.tickets.filter(status='active').count()

        booking.status = 'cancelled'
        booking.save()

        booking.tickets.filter(status='active').update(status='cancelled')

        # ✅ Release reserved seats.
        self._release_session_seats(booking, seats_to_release)

        self._update_event_counts(event)

        try:
            email_result = self._send_cancellation_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Cancellation email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'seats_released': seats_to_release,
            'email_sent': email_result.get('success', False),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def refund_booking(self, request, pk=None):
        booking = self.get_object()

        if booking.status not in ['paid', 'confirmed']:
            return Response({
                'error': f'Only paid or confirmed bookings can be refunded. Current status: {booking.status}',
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status == 'refunded':
            return Response({
                'error': 'Booking is already refunded',
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status == 'completed':
            return Response({
                'error': 'Cannot refund a completed booking (all tickets already used)',
            }, status=status.HTTP_400_BAD_REQUEST)

        event = booking.event
        seats_to_release = booking.tickets.filter(status='active').count()

        booking.status = 'refunded'
        booking.save()

        booking.tickets.filter(status='active').update(status='refunded')

        # ✅ Release reserved seats.
        self._release_session_seats(booking, seats_to_release)

        self._update_event_counts(event)

        try:
            email_result = self._send_refund_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Refund email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'seats_released': seats_to_release,
            'email_sent': email_result.get('success', False),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def tickets(self, request, pk=None):
        booking = self.get_object()
        tickets = booking.tickets.all()
        serializer = TicketSerializer(tickets, many=True)
        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'tickets': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def checkins(self, request, pk=None):
        booking = self.get_object()
        tickets = booking.tickets.all()
        checkins = CheckInLog.objects.filter(ticket__in=tickets)
        serializer = CheckInLogSerializer(checkins, many=True)
        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'checkins': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def verify_tickets(self, request, pk=None):
        if not settings.DEBUG:
            return Response(
                {'error': 'Debug endpoint disabled in production'},
                status=status.HTTP_404_NOT_FOUND,
            )

        booking = self.get_object()
        tickets = booking.tickets.all()

        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'ticket_count': tickets.count(),
            'tickets': [
                {
                    'id': str(t.id),
                    'code': t.unique_code,
                    'attendee': t.attendee_name,
                    'status': t.status,
                    'session_id': str(t.session.id) if t.session else None,
                    'tier_name': t.tier.name if t.tier else None,
                    'created_at': t.created_at.isoformat() if t.created_at else None,
                }
                for t in tickets
            ],
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def confirm_payment(self, request, pk=None):
        return self.mark_payment_received(request, pk)

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        return self.refund_booking(request, pk)

    @action(detail=True, methods=['post'])
    def apply_discount(self, request, pk=None):
        booking = self.get_object()
        discount_code = request.data.get('discount_code')
        user = request.user

        if not (user.is_staff or user.is_superuser):
            is_organizer = (
                (hasattr(user, 'profile') and user.profile.is_organizer)
                or hasattr(user, 'organizer')
            )
            if is_organizer and booking.event.organizer_id != user.id:
                return Response(
                    {'error': 'You cannot apply discounts to this booking'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not is_organizer and booking.user_id != user.id:
                return Response(
                    {'error': 'You cannot apply discounts to this booking'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if not discount_code:
            return Response(
                {'error': 'discount_code is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from ticket_bookings.models import Discount

        try:
            discount = Discount.objects.get(code=discount_code, is_active=True)

            if not (user.is_staff or user.is_superuser):
                if discount.organizer_id != user.id:
                    return Response(
                        {'error': 'Invalid discount code'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

            if discount.valid_from and discount.valid_from > timezone.now():
                return Response({'error': 'Discount is not yet valid'}, status=status.HTTP_400_BAD_REQUEST)

            if discount.valid_to and discount.valid_to < timezone.now():
                return Response({'error': 'Discount has expired'}, status=status.HTTP_400_BAD_REQUEST)

            if discount.max_uses and discount.used_count >= discount.max_uses:
                return Response({'error': 'Discount has reached maximum uses'}, status=status.HTTP_400_BAD_REQUEST)

            if discount.type == 'percentage':
                discount_amount = (booking.total_amount * discount.value) / 100
                if discount.max_discount and discount_amount > discount.max_discount:
                    discount_amount = discount.max_discount
            else:
                discount_amount = discount.value
                if discount_amount > booking.total_amount:
                    discount_amount = booking.total_amount

            booking.discount_applied = discount_amount
            booking.discount_code = discount_code
            booking.save()

            discount.used_count += 1
            discount.save()

            return Response({
                'status': 'success',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'discount_applied': discount_amount,
                'discount_code': discount_code,
                'new_total': booking.total_amount - discount_amount,
            }, status=status.HTTP_200_OK)

        except Discount.DoesNotExist:
            return Response({'error': 'Invalid discount code'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def resend_tickets(self, request, pk=None):
        """
        POST /api/bookings/<id>/resend_tickets/

        ✅ FIX [P3]: if the client supplies an `email` that differs from
        the stored `booking.customer_email`, REJECT with 400 instead of
        silently warning-and-continuing. The old behaviour would send
        tickets to `booking.customer_email` while the client thought the
        mail was going elsewhere.
        """
        booking = self.get_object()

        client_supplied_email = None
        if isinstance(request.data, dict):
            client_supplied_email = request.data.get('email')

        if client_supplied_email:
            normalised_client = str(client_supplied_email).strip().lower()
            normalised_stored = (booking.customer_email or '').strip().lower()
            if normalised_client != normalised_stored:
                logger.warning(
                    "⛔ resend_tickets rejected: client supplied email %r "
                    "does not match stored recipient %r for booking %s",
                    client_supplied_email,
                    booking.customer_email,
                    booking.booking_reference,
                )
                return Response(
                    {
                        'error': (
                            'The supplied email does not match the email '
                            'on this booking. If the customer has changed '
                            'their email, update the booking first.'
                        ),
                        'code': 'EMAIL_MISMATCH',
                        'stored_recipient': booking.customer_email,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        tickets = booking.tickets.filter(status='active')

        if not tickets.exists():
            return Response(
                {'error': 'No active tickets to resend'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = self._send_tickets_email(booking)

            if result.get('success'):
                return Response({
                    'status': 'success',
                    'booking_id': str(booking.id),
                    'reference': booking.booking_reference,
                    'recipient': booking.customer_email,
                    'tickets_sent': tickets.count(),
                    'formats': result.get('formats', ''),
                    'combined': result.get('combined', False),
                    'attachments': result.get('attachments', 0),
                    'message': f'Tickets resent successfully ({result.get("formats", "")})',
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'status': 'failed',
                    'error': result.get('message', 'Failed to send tickets'),
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"Error resending tickets: {str(e)}")
            return Response(
                {'error': f'Failed to send tickets: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )