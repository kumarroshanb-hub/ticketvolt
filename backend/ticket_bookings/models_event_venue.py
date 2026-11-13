# backend/ticket_bookings/models_event_venue.py
"""
EventVenuePlan — the event's own use of a VenueMaster.

INVARIANTS (do not violate these; the whole design collapses if you do):

  1. An EventVenuePlan points at ONE specific VenueMaster version via a
     PROTECT FK. The pointer never changes after creation. Historical
     events therefore keep resolving their seat map even after the venue
     is re-versioned or soft-removed.

  2. EventSeatCategory rows are event-scoped COPIES of the master's
     palette at plan-creation time. Editing them NEVER writes back to
     VenueMaster or to the org's SeatCategory table.

  3. seat_assignments is { seat_id: EventSeatCategory.id }. It is the
     only place a seat's category lives — VenueMaster.snapshot.seats
     carries coordinates only, never categories.

  4. Once `published_snapshot` is set (event goes live), it is IMMUTABLE.
     Every buyer-facing read uses it, never the live categories or
     assignments. If the organizer later edits categories, only the next
     event is affected.

  5. A plan cannot outlive its VenueMaster (PROTECT), but it can outlive
     its Event (CASCADE). If an event is deleted, so is the plan.
"""
import uuid

from django.core.exceptions import ValidationError
from django.db import models


class EventVenuePlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

    event = models.OneToOneField(
        'ticket_bookings.Event',
        on_delete=models.CASCADE,
        related_name='venue_plan',
    )

    # PROTECT is load-bearing: historical events must keep resolving their
    # seat map even after the venue master is re-versioned or the venue
    # row is soft-removed.
    venue_master = models.ForeignKey(
        'ticket_bookings.VenueMaster',
        on_delete=models.PROTECT,
        related_name='event_plans',
        help_text='The exact venue version this event was built against.',
    )

    # { "<seat_id>": "<EventSeatCategory.id>" }
    seat_assignments = models.JSONField(default=dict, blank=True)

    # FROZEN copy of everything the buyer needs to see once the event is
    # published. Set exactly once, at publish time. Never touched again.
    #
    # Shape (documented in services/event_venue_plan.py):
    #   {
    #     "schema_version": 1,
    #     "frozen_at": "<iso8601>",
    #     "venue_master_id": "<uuid>",
    #     "venue_master_version": <int>,
    #     "layout": { canvas_width, canvas_height, background_image, seats[] },
    #     "categories": [ {id, name, hex_color, price} ],
    #     "seat_assignments": { seat_id: category_id },
    #   }
    published_snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            'Immutable buyer-facing snapshot. Set once when the event is '
            'published. Buyers, tickets, and refunds ALL read from this — '
            'never from the live categories or assignments.'
        ),
    )
    published_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f'VenuePlan for event {self.event_id} '
            f'(master v{self.venue_master.version})'
        )

    # ---- Validation ----

    def clean(self):
        # The plan's master must belong to the same Venue the event
        # points to, if the event has one.
        if (
            self.event_id and self.venue_master_id
            and self.event.venue_id
            and self.event.venue_id != self.venue_master.venue_id
        ):
            raise ValidationError({
                'venue_master': (
                    'VenueMaster belongs to a different Venue than the event.'
                )
            })

    # ---- Mutation guards ----

    @property
    def is_frozen(self) -> bool:
        return bool(self.published_snapshot)

    def save(self, *args, **kwargs):
        # Refuse any write to a frozen plan through the normal save path.
        # Callers that MUST write after freeze (the freeze itself, or a
        # reviewed correction) should go through services.event_venue_plan
        # which uses queryset.update() or a superuser override.
        if self.pk and not kwargs.pop('_allow_frozen', False):
            if EventVenuePlan.objects.filter(
                pk=self.pk, published_snapshot__isnull=False,
            ).exclude(published_snapshot={}).exists():
                raise ValidationError(
                    'This venue plan is frozen (event published). '
                    'Use the correction endpoint or create a new event.'
                )
        super().save(*args, **kwargs)


class EventSeatCategory(models.Model):
    """
    A category used *by this event*. Copied from the master palette at
    plan-creation time so the event keeps a stable snapshot even if the
    org later renames / reprices the master category.

    Editing this row NEVER affects the master.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

    venue_plan = models.ForeignKey(
        EventVenuePlan,
        on_delete=models.CASCADE,
        related_name='categories',
    )

    # Audit-only: which palette entry this was copied from. SET_NULL
    # (via empty string) because the master palette entry may be deleted
    # later — the event keeps its own copy regardless.
    source_palette_category_id = models.CharField(
        max_length=64, blank=True, default='',
        help_text='VenueMaster palette category id this was copied from (audit only).',
    )

    name = models.CharField(max_length=100)
    hex_color = models.CharField(max_length=7, default='#4CAF50')

    # Event-specific price. Never flows back to SeatCategory.
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = [('venue_plan', 'name')]

    def __str__(self):
        return f'{self.name} (event={self.venue_plan.event_id})'