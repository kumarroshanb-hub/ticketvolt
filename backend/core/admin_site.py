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
    site_header = 'TiketVault Platform Admin'
    site_title = 'TiketVault'
    index_title = 'Platform administration'

    def has_permission(self, request):
        return (
            request.user.is_active
            and request.user.is_authenticated
            and request.user.is_superuser
        )

    def login(self, request, extra_context=None):
        # An authenticated non-superuser who lands on the login page
        # gets an explicit 403 instead of the login form. They cannot
        # brute-force a superuser password from here because they have
        # no valid credentials to submit.
        if request.user.is_authenticated and not request.user.is_superuser:
            return HttpResponseForbidden(
                'Django admin is restricted to Platform Admin accounts.'
            )
        return super().login(request, extra_context=extra_context)

    def index(self, request, extra_context=None):
        # Defence-in-depth: the URLconf gate in core/urls.py already
        # rejects non-superusers, but the index view is also reachable
        # if a superuser is demoted mid-session.
        if not self.has_permission(request):
            return HttpResponseForbidden(
                'Django admin is restricted to Platform Admin accounts.'
            )
        return super().index(request, extra_context=extra_context)