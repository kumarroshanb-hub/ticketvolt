"""Platform security and compliance status for system administrators."""
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsPlatformAdmin

from ..models import AuditLog
from ..services.audit import verify_chain
from ..services.payments.crypto import backend_name


class SecurityStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        chain = verify_chain(AuditLog.objects.all())
        return Response({
            'audit': {
                'entries': AuditLog.objects.count(),
                'chain': chain,
                'export_url': '/api/audit-logs/export/',
                'verify_url': '/api/audit-logs/verify/',
            },
            'secrets': {
                'payment_credential_backend': backend_name(),
                'kms_configured': backend_name() == 'aws-kms',
            },
            'mfa': {
                'enforced_for_platform_admins': False,
                'status': 'not_implemented',
            },
            'checklist': [
                {'key': 'audit_chain', 'label': 'Tamper-evident audit chain', 'ok': bool(chain.get('valid'))},
                {'key': 'kms', 'label': 'Payment secrets backed by KMS', 'ok': backend_name() == 'aws-kms'},
                {'key': 'mfa', 'label': 'MFA enforced for administrators', 'ok': False},
                {'key': 'waf', 'label': 'WAF / edge rate limiting', 'ok': False},
                {'key': 'asv', 'label': 'Quarterly ASV scans', 'ok': False},
                {'key': 'pentest', 'label': 'Annual penetration test', 'ok': False},
            ],
        })
