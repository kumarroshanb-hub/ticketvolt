# backend/ticket_bookings/signals.py
import logging

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='ticket_bookings.Venue')
def on_venue_saved(sender, instance, created, **kwargs):
    from .services.venue_versioning import bump_venue_master
    bump_venue_master(
        instance,
        actor=None,
        reason='venue_created' if created else 'venue_saved',
    )


@receiver(post_save, sender='ticket_bookings.SeatLayout')
def on_layout_saved(sender, instance, created, **kwargs):
    from .services.venue_versioning import bump_venue_master
    bump_venue_master(instance.venue, actor=None, reason='layout_saved')


@receiver(post_save, sender='ticket_bookings.Seat')
@receiver(post_delete, sender='ticket_bookings.Seat')
def on_seat_changed(sender, instance, **kwargs):
    from .services.venue_versioning import bump_venue_master
    layout = getattr(instance, 'layout', None)
    if layout is None:
        return
    bump_venue_master(layout.venue, actor=None, reason='seat_changed')


@receiver(post_save, sender='ticket_bookings.SeatCategory')
@receiver(post_delete, sender='ticket_bookings.SeatCategory')
def on_seat_category_changed(sender, instance, **kwargs):
    """The master snapshot carries the org's category palette.

    A palette change (create/rename/repricing/delete) must therefore
    produce a new master version for every venue in that organization.
    Without this, newly created categories never reach the Event wizard
    (the event plan is provisioned from `snapshot.category_palette`).
    """
    from .models import Venue
    from .services.venue_versioning import bump_venue_master

    org_id = getattr(instance, 'organization_id', None)
    if not org_id:
        return
    for venue in Venue.objects.filter(organization_id=org_id).only(
        'id', 'name', 'city', 'country', 'venue_type',
    ):
        bump_venue_master(venue, actor=None, reason='seat_category_changed')
