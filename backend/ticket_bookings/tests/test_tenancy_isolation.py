# backend/ticket_bookings/tests/test_tenancy_isolation.py
"""
The critical security tests. If any of these fail, cross-tenant leaks
are possible.
"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from ticket_bookings.models import (
    Event, Venue, Booking, Discount, CancellationPolicy,
    Organization, OrganizationMembership,
)


class TenancyIsolation(TestCase):
    def setUp(self):
        # Two tenants, two managers, one regular user each.
        self.academy = Organization.objects.create(name='Malayalam Academy HK', owner=None)  # temp
        self.kala = Organization.objects.create(name='Kala', owner=None)

        self.academy_admin = User.objects.create_user('acad_admin', password='pw-12345678')
        self.kala_admin = User.objects.create_user('kala_admin', password='pw-12345678')
        self.academy.user if False else None  # noqa
        self.academy.owner = self.academy_admin; self.academy.save()
        self.kala.owner = self.kala_admin; self.kala.save()

        OrganizationMembership.objects.create(organization=self.academy, user=self.academy_admin, role='owner')
        OrganizationMembership.objects.create(organization=self.kala, user=self.kala_admin, role='owner')

        self.academy_venue = Venue.objects.create(name='Hall A', organization=self.academy)
        self.kala_venue = Venue