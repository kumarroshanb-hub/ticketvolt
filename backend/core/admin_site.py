# backend/core/admin_site.py
"""
Superuser-only Django AdminSite.

Per the permission matrix, Django admin is a Platform Admin surface.
`is_staff=True` alone MUST NOT grant access — a tenant Admin would
otherwise see every tenant's rows in every model page.
"""
from django.contrib.admin import AdminSite
from django.http import HttpResponseForbidden


class SuperuserOnlyAdminSite(AdminSite):
    site_header = 'TicketVolt Platform Admin'
    site_title = 'TicketVolt'
    index_title = 'Platform administration'

    def has_permission(self, request):
        return (
            request.user.is_active
            and request.user.is_authenticated
            and request.user.is_superuser
        )

    def login(self, request, extra_context=None):
        if request.user.is_authenticated and not request.user.is_superuser:
            return HttpResponseForbidden(
                'Django admin is restricted to Platform Admin accounts.'
            )
        return super().login(request, extra_context=extra_context)