# backend/ticket_bookings/tests/test_security_regressions.py
"""
Regression tests for the 2026-11-14 pentest findings (F1, F5, F6).

These lock in the security behaviour so a later refactor cannot silently
reintroduce the issue.
"""
import io
import os
import tempfile
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from ticket_bookings.models import Organization


def png_bytes(size=(300, 300), color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new('RGB', size, color).save(buf, format='PNG')
    return buf.getvalue()


class LogoUploadSecurityTests(TestCase):
    """F1 — SVG must never be accepted as an organization logo."""

    def setUp(self):
        self.media_dir = tempfile.mkdtemp(prefix='tv-media-')
        self.override = override_settings(MEDIA_ROOT=self.media_dir)
        self.override.enable()

        self.user = User.objects.create_user(
            username='pentest-admin', email='pentest-admin@example.com',
            password='pw-12345678', is_superuser=True, is_staff=True,
        )
        self.org = Organization.objects.create(name='Pentest Org', slug='pentest-org')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.override.disable()

    def _upload(self, name, content, content_type):
        return self.client.post(
            '/api/uploads/organization-logo/',
            {
                'organization_id': str(self.org.id),
                'logo': SimpleUploadedFile(name, content, content_type=content_type),
            },
            format='multipart',
        )

    def test_svg_is_rejected(self):
        svg = (
            b'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">'
            b'<script>alert(document.domain)</script></svg>'
        )
        resp = self._upload('logo.svg', svg, 'image/svg+xml')
        self.assertEqual(resp.status_code, 400, resp.content[:300])
        self.assertIn('PNG, JPG or WEBP', resp.json()['error'])

    def test_svg_masquerading_as_png_is_rejected(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        resp = self._upload('logo.png', svg, 'image/png')
        self.assertEqual(resp.status_code, 400, resp.content[:300])

    def test_valid_png_is_accepted(self):
        resp = self._upload('logo.png', png_bytes(), 'image/png')
        self.assertEqual(resp.status_code, 201, resp.content[:300])
        self.assertTrue(resp.json()['path'].endswith('.png'))


class WhatsAppWebhookAuthTests(TestCase):
    """F5 — the inbound webhook must require a shared secret."""

    URL = '/api/whatsapp/webhook/'
    BODY = {'type': 'unknown', 'phone_number': '+10000000000'}

    def test_unconfigured_secret_fails_closed(self):
        with mock.patch.dict(os.environ, {'WHATSAPP_WEBHOOK_SECRET': ''}):
            resp = self.client.post(self.URL, self.BODY, content_type='application/json')
        self.assertEqual(resp.status_code, 503)

    def test_missing_token_is_rejected(self):
        with mock.patch.dict(os.environ, {'WHATSAPP_WEBHOOK_SECRET': 's3cret-token'}):
            resp = self.client.post(self.URL, self.BODY, content_type='application/json')
        self.assertEqual(resp.status_code, 401)

    def test_wrong_token_is_rejected(self):
        with mock.patch.dict(os.environ, {'WHATSAPP_WEBHOOK_SECRET': 's3cret-token'}):
            resp = self.client.post(
                self.URL, self.BODY, content_type='application/json',
                HTTP_X_WEBHOOK_TOKEN='not-the-token',
            )
        self.assertEqual(resp.status_code, 401)

    def test_correct_token_is_accepted(self):
        with mock.patch.dict(os.environ, {'WHATSAPP_WEBHOOK_SECRET': 's3cret-token'}):
            resp = self.client.post(
                self.URL, self.BODY, content_type='application/json',
                HTTP_X_WEBHOOK_TOKEN='s3cret-token',
            )
        self.assertEqual(resp.status_code, 200)


class RefundAuthTests(TestCase):
    """F6 — refunds must require authentication at the permission layer."""

    def test_anonymous_refund_is_unauthorized(self):
        resp = self.client.post(
            '/api/payments/00000000-0000-0000-0000-000000000000/refund/',
            {'amount': '1.00'}, content_type='application/json',
        )
        self.assertIn(resp.status_code, (401, 403))


class TicketSendAuthorizationTests(TestCase):
    """F10 — ticket endpoints must enforce object-level authorization."""

    def setUp(self):
        from datetime import timedelta
        from django.utils import timezone
        from ticket_bookings.models import Event, Booking, Ticket

        self.owner = User.objects.create_user(username='ticket-owner', password='pw-12345678')
        self.other = User.objects.create_user(username='ticket-other', password='pw-12345678')
        self.org = Organization.objects.create(name='Ticket Auth Org', slug='ticket-auth-org')
        self.event = Event.objects.create(
            organization=self.org,
            organizer=self.owner, title='Auth Test Event',
            start_date=timezone.now(), end_date=timezone.now() + timedelta(days=1),
            status='active',
        )
        self.booking = Booking.objects.create(
            user=self.owner, event=self.event,
            customer_name='Owner', customer_email='owner@example.com',
            customer_phone='1234567890', total_amount=10,
        )
        self.ticket = Ticket.objects.create(
            booking=self.booking, event=self.event, attendee_name='Owner',
        )

    def test_other_user_cannot_send_someone_elses_ticket(self):
        client = APIClient()
        client.force_authenticate(user=self.other)
        resp = client.post(
            '/api/whatsapp/send-ticket/',
            {'ticket_id': str(self.ticket.id), 'phone_number': '+10000000000'},
            format='json',
        )
        self.assertEqual(resp.status_code, 404, resp.content[:300])

    def test_anonymous_cannot_send_ticket(self):
        resp = self.client.post(
            '/api/whatsapp/send-ticket/',
            {'ticket_id': str(self.ticket.id), 'phone_number': '+10000000000'},
            format='json',
        )
        self.assertIn(resp.status_code, (401, 403))



class JWTCompatTests(TestCase):
    """DRF 3.15 / simplejwt 5.5 compatibility: login then use the token."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='jwt-user', email='jwt@example.com', password='pw-12345678',
        )

    def test_login_then_authenticated_request(self):
        resp = self.client.post(
            '/api/auth/login/',
            {'email': 'jwt@example.com', 'password': 'pw-12345678'},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200, resp.content[:300])
        access = resp.json()['access']

        me = self.client.get('/api/auth/me/', HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(me.status_code, 200, me.content[:300])

    def test_refresh_token_round_trip(self):
        resp = self.client.post(
            '/api/auth/login/',
            {'email': 'jwt@example.com', 'password': 'pw-12345678'},
            content_type='application/json',
        )
        refresh = resp.json()['refresh']
        rotated = self.client.post(
            '/api/auth/refresh/', {'refresh': refresh}, content_type='application/json',
        )
        self.assertEqual(rotated.status_code, 200, rotated.content[:300])
        self.assertIn('access', rotated.json())

