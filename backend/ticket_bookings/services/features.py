"""Feature entitlement resolution."""
from ..models_features import FeatureDefinition, FeaturePackage, OrganizationFeature


def _package_keys(organization):
    package = getattr(organization, 'feature_package', None)
    if package and package.is_active:
        return set(package.feature_keys or [])
    default = FeaturePackage.objects.filter(is_default=True, is_active=True).first()
    return set(default.feature_keys or []) if default else set()


def enabled_features(organization):
    if organization is None:
        return set()
    keys = _package_keys(organization)
    for override in OrganizationFeature.objects.filter(
        organization=organization,
    ).select_related('feature'):
        if not override.feature.is_active:
            continue
        if override.enabled:
            keys.add(override.feature.key)
        else:
            keys.discard(override.feature.key)
    return {k for k in keys if FeatureDefinition.objects.filter(key=k, is_active=True).exists()}


def has_feature(organization, key):
    return key in enabled_features(organization)


def payload(organization):
    return {
        'package': {
            'code': organization.feature_package.code,
            'name': organization.feature_package.name,
        } if organization and organization.feature_package else None,
        'features': sorted(enabled_features(organization)),
        'definitions': [
            {
                'key': f.key, 'name': f.name, 'category': f.category,
                'description': f.description,
                'enabled': has_feature(organization, f.key),
            }
            for f in FeatureDefinition.objects.filter(is_active=True)
        ],
    }
