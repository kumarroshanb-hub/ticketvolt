# backend/core/middleware.py
from django.utils.deprecation import MiddlewareMixin
from django.utils import timezone
from datetime import timedelta

class HealthCheckMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if request.path == '/health/':
            from django.http import HttpResponse
            return HttpResponse("OK")
        return None


class ActivityTrackingMiddleware(MiddlewareMixin):
    """
    ✅ Tracks active JWT users for the SuperAdmin "Active Sessions" page.
    
    IMPORTANT: We use process_response, NOT process_request.
    DRF's JWT authentication happens inside the view. By the time the
    request enters middleware, request.user is still AnonymousUser.
    process_response guarantees the view has finished and request.user
    is fully populated.
    """
    def process_response(self, request, response):
        if request.user and request.user.is_authenticated:
            from ticket_bookings.models import UserProfile
            
            now = timezone.now()
            
            # Only update if the last stamp is older than 2 minutes,
            # to avoid spamming the DB on every poll / auto-refresh.
            two_minutes_ago = now - timedelta(minutes=2)
            
            updated = UserProfile.objects.filter(
                user=request.user,
                last_active__lt=two_minutes_ago,
            ).update(last_active=now)
            
            # Catch the very first request (or rows where last_active is NULL)
            if updated == 0:
                UserProfile.objects.filter(
                    user=request.user,
                    last_active__isnull=True,
                ).update(last_active=now)
        return response

class TenantDomainMiddleware:
    """Resolve a verified custom hostname to its tenant.

    Sets ``request.organization`` when the request host matches a verified
    Organization.custom_domain. The rest of the stack can use this for
    host-based public pages and future per-domain routing.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.organization = None
        host = request.get_host().split(':')[0].lower()
        if host and host not in ('localhost', '127.0.0.1', 'testserver'):
            try:
                from ticket_bookings.models import Organization
                request.organization = Organization.objects.filter(
                    custom_domain__iexact=host,
                    domain_verified=True,
                    is_active=True,
                ).first()
            except Exception:
                request.organization = None
        return self.get_response(request)


class AuditLogMiddleware:
    """Record mutating API requests for the tenant audit trail."""

    SKIP_PREFIXES = ('/api/auth/', '/api/payments/webhook/', '/api/platform/stripe-webhook/')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            if (
                request.method in ('POST', 'PUT', 'PATCH', 'DELETE')
                and request.path.startswith('/api/')
                and not any(request.path.startswith(p) for p in self.SKIP_PREFIXES)
                and getattr(request, 'user', None)
                and request.user.is_authenticated
            ):
                from ticket_bookings.models import AuditLog
                org = getattr(request, 'organization', None)
                if org is None:
                    from ticket_bookings.models import Organization
                    from ticket_bookings.services import tenancy
                    for candidate in Organization.objects.filter(
                        id__in=tenancy.user_org_ids(request.user),
                    ):
                        if tenancy.can_manage_org(request.user, candidate):
                            org = candidate
                            break
                AuditLog.objects.create(
                    organization=org,
                    actor=request.user,
                    action=f'{request.method} {request.path}',
                    method=request.method,
                    path=request.path[:500],
                    status_code=getattr(response, 'status_code', None),
                    ip_address=request.META.get('REMOTE_ADDR'),
                )
        except Exception:
            pass
        return response
