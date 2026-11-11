# backend/core/apps.py
from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        """
        Swap the default AdminSite for SuperuserOnlyAdminSite.

        The old implementation reassigned ``admin.site.__class__``. That
        was unreliable:

          • ``AdminSite.urls`` is a cached property computed from the
            class's MRO on first access. If anything touched
            ``admin.site.urls`` before ``ready()`` ran (or after a
            reload), the stock ``has_permission()`` survived.
          • ``AdminSite.index()`` and ``AdminSite.login()`` read
            ``self.has_permission()`` on the *instance*, but only after
            Django had already resolved the URLconf against the stock
            site.

        This version instantiates ``SuperuserOnlyAdminSite`` fresh,
        copies the default site's registry / widgets / model-admins
        across, and then assigns the instance to ``admin.site`` so
        every existing ``@admin.register`` decorator (which references
        ``django.contrib.admin.site`` at decoration time) still applies.

        Registration order matters: this runs on app-ready. Apps that
        run their ``admin.py`` module *after* ``core`` (i.e. everything
        below it in ``INSTALLED_APPS``) will decorate the *new* site.
        Apps that ran *before* ``core`` have already decorated the
        stock site, which is why we copy the registry rather than
        relying on re-registration.
        """
        from django.contrib import admin
        from django.contrib.admin import sites as admin_sites

        # Nothing to do if we've already swapped (guards against
        # double-invocation when tests reload the app registry).
        if isinstance(admin.site, _get_superuser_site_cls()):
            return

        from .admin_site import SuperuserOnlyAdminSite

        default_site = admin.site
        new_site = SuperuserOnlyAdminSite(name='admin')

        # ---- Copy the registry from the default site ----
        #
        # ``_registry`` is an OrderedDict[model, ModelAdmin]. Assigning
        # it directly keeps every ``@admin.register`` decorator that
        # already ran (for apps above ``core`` in INSTALLED_APPS) and
        # every in-place ``ModelAdmin`` configuration intact.
        new_site._registry = dict(default_site._registry)

        # ---- Copy autodiscover bookkeeping ----
        #
        # ``autodiscover()`` has already run by the time ``ready()``
        # fires, so the flag is True. Preserving it prevents the
        # stock ``autodiscover`` from re-registering models twice.
        if hasattr(default_site, '_autodiscovered'):
            new_site._autodiscovered = default_site._autodiscovered

        # ---- Copy cosmetic branding (defence-in-depth) ----
        new_site.site_header = getattr(
            default_site, 'site_header', new_site.site_header
        )
        new_site.site_title = getattr(
            default_site, 'site_title', new_site.site_title
        )
        new_site.index_title = getattr(
            default_site, 'index_title', new_site.index_title
        )

        # ---- Swap every reference ----
        #
        # ``django.contrib.admin.site`` is imported by name into
        # ``django.contrib.admin.views.decorators``, the admin urls
        # module, and every ``admin.py`` module. Rebinding the module-
        # level name is the only way to reach all of them.
        admin.site = new_site
        admin_sites.site = new_site
        admin_sites.DefaultAdminSite = SuperuserOnlyAdminSite


def _get_superuser_site_cls():
    """Lazy import so ``apps.py`` doesn't require Django admin at import time."""
    from .admin_site import SuperuserOnlyAdminSite
    return SuperuserOnlyAdminSite