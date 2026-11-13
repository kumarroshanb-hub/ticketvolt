# backend/ticket_bookings/models_venue_master.py
"""
VenueMaster — the immutable, versioned, cross-tenant venue catalog.

Every time a Venue is created or its snapshot-relevant fields change,
a new VenueMaster row is written with an incremented version. The
latest version (is_current=True) is what tenants browse when creating
events.

INVARIANTS
----------
  1. Rows are IMMUTABLE after creation. Once `is_current=False` is set,
     the row is never mutated again. Editing a venue produces a new row,
     never an update to an old one.

  2. `snapshot` describes the PHYSICAL venue only — no seat→category
     assignments, no pricing. Seat coordinates only. The category
     palette (name + colour + suggested price) is captured separately
     as an unassigned vocabulary, never as an assignment.

  3. PROTECT on the EventVenuePlan FK back to this model means a
     VenueMaster row cannot be deleted while any event plan still
     references it. This is the audit trail.

See services/venue_snapshot.py for the exact schema emitted into
`snapshot`.
"""
import uuid

from django.conf import settings
from django.db import models


class VenueMaster(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

    # The live tenant Venue this master is a snapshot of.
    # PROTECT — deleting a Venue that has versioned masters requires
    # explicitly removing those masters first, which preserves the
    # audit trail.
    venue = models.ForeignKey(
        'ticket_bookings.Venue',
        on_delete=models.PROTECT,
        related_name='masters',
    )

    version = models.PositiveIntegerField()
    is_current = models.BooleanField(default=True, db_index=True)

    # Full denormalized snapshot. Schema version 2 — see
    # services/venue_snapshot.build_venue_snapshot.
    snapshot = models.JSONField(default=dict, blank=True)

    # Denormalized convenience flags for cheap list queries.
    has_layout = models.BooleanField(default=False)
    has_reserved_seating = models.BooleanField(default=False)

    # Denormalized search fields — the master catalog is filtered by
    # name/city/country without joining back to Venue.
    name = models.CharField(max_length=255)
    city = models.CharField(max_length=100, blank=True, default='')
    country = models.CharField(max_length=100, blank=True, default='')
    venue_type = models.CharField(max_length=20, blank=True, default='')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='venue_masters_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('venue', 'version')]
        indexes = [
            models.Index(fields=['is_current', 'has_reserved_seating']),
            models.Index(fields=['is_current', 'has_layout']),
            models.Index(fields=['name']),
            models.Index(fields=['city']),
        ]

    def __str__(self):
        return f'{self.name} v{self.version}'