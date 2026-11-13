"""Tenant payment gateway configuration API."""
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models_payments import OrganizationPaymentConfig, PaymentGateway
from ..services import tenancy
from ..services.payments.crypto import encrypt


def _mask(value):
    if not value:
        return ''
    return f'{value[:4]}…{value[-4:]}' if len(value) > 8 else '••••'


def _serialize(config):
    return {
        'id': str(config.id),
        'gateway': config.gateway,
        'mode': config.mode,
        'key_id': config.key_id,
        'has_key_secret': bool(config.key_secret_encrypted),
        'has_webhook_secret': bool(config.webhook_secret_encrypted),
        'is_active': config.is_active,
        'verified_at': config.verified_at,
        'webhook_url': f'/api/payments/webhook/{config.organization_id}/{config.gateway}/',
    }


class OrganizationPaymentConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _org(self, request):
        org_id = request.query_params.get('organization_id') or request.data.get('organization_id')
        if org_id:
            from ..models import Organization
            org = Organization.objects.filter(pk=org_id).first()
            if org is None:
                return None, Response({'error': 'Organization not found.'}, status=404)
        else:
            org = None
            for candidate in tenancy.user_org_ids(request.user):
                from ..models import Organization
                org = Organization.objects.filter(pk=candidate).first()
                if org and tenancy.can_view_finance(request.user, org):
                    break
        if org is None:
            return None, Response({'error': 'Organization required.'}, status=400)
        if not tenancy.can_view_finance(request.user, org) and not request.user.is_superuser:
            return None, Response({'error': 'Permission denied.'}, status=403)
        return org, None

    def get(self, request):
        org, err = self._org(request)
        if err:
            return err
        config = OrganizationPaymentConfig.objects.filter(organization=org).first()
        if config is None:
            return Response({
                'gateway': PaymentGateway.RAZORPAY,
                'mode': 'test', 'key_id': '', 'has_key_secret': False,
                'has_webhook_secret': False, 'is_active': False,
                'verified_at': None, 'webhook_url': '',
            })
        return Response(_serialize(config))

    def put(self, request):
        org, err = self._org(request)
        if err:
            return err
        config, _ = OrganizationPaymentConfig.objects.get_or_create(
            organization=org,
            defaults={'gateway': PaymentGateway.RAZORPAY},
        )
        data = request.data
        gateway = data.get('gateway') or config.gateway
        if gateway not in dict(PaymentGateway.choices):
            return Response({'gateway': 'Unsupported gateway.'}, status=400)
        config.gateway = gateway
        config.mode = data.get('mode') or config.mode
        config.key_id = (data.get('key_id') or '').strip()
        if data.get('key_secret'):
            config.key_secret_encrypted = encrypt(data['key_secret'])
        if data.get('webhook_secret'):
            config.webhook_secret_encrypted = encrypt(data['webhook_secret'])
        config.is_active = bool(data.get('is_active'))
        if config.is_active and config.key_id and config.key_secret_encrypted:
            from django.utils import timezone
            config.verified_at = timezone.now()
        config.save()
        return Response(_serialize(config))
