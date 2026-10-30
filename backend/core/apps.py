# backend/core/apps.py
from django.apps import AppConfig
from django.contrib.admin import apps as admin_apps


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        """
        Swap the default AdminSite for SuperuserOnlyAdminSite.

        We reuse the default site's registry so all @admin.register
        decorators from ticket_bookings/admin.py continue to apply,
        but we tighten `has_permission()` to superuser-only.
        """
        from .admin_site import SuperuserOnlyAdminSite
        from django.contrib import admin

        # Copy the registry and widget data from the default site.
        admin.site.__class__ = SuperuserOnlyAdminSite