# backend/ticket_bookings/tests/test_baseline.py
"""
Characterization tests. Run BEFORE any multi-tenancy change.
They capture today's behavior so the refactor can be checked
against a stable baseline.
"""
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta

from ticket_bookings.models import Event, Booking, Venue


def make_user(username, **kw):
    return User.objects.create_user(username=username, password='pw-12345678', **kw)


def make_event(organizer, title='E'):
    return Event.objects.create(
        organizer=organizer,
        title=title,
        start_date=timezone.now(),
        end_date=timezone.now() + timedelta(days=1),
        status='active',
    )


class BaselineIsolation(TestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        self.alice_event = make_event(self.alice, 'Alice Event')
        self.bob_event = make_event(self.bob, 'Bob Event')

    def test_organizer_only_sees_own_bookings(self):
        b1 = Booking.objects.create(
            user=self.alice, event=self.alice_event,
            customer_name='A', customer_email='a@x.com',
            customer_phone='1234567', total_amount=10,
        )
        b2 = Booking.objects.create(
            user=self.bob, event=self.bob_event,
            customer_name='B', customer_email='b@x.com',
            customer_phone='1234567', total_amount=10,
        )
        visible = Booking.objects.visible_to(self.alice)
        self.assertIn(b1, visible)
        self.assertNotIn(b2, visible)