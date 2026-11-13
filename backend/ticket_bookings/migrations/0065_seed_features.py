from django.db import migrations


FEATURES = [
    ('public_event_page', 'Public event page', 'Shareable event website with FAQs and map.', 'Event experience'),
    ('donation_quick_picks', 'Donation quick picks', 'Preset donation amounts and donor name.', 'Checkout'),
    ('event_bilingual', 'Bilingual event content', 'English and Traditional Chinese event copy.', 'Localisation'),
    ('wallet_passes', 'Wallet passes', 'Apple Wallet / Google Wallet ticket links.', 'Fulfilment'),
    ('advanced_exports', 'Advanced exports', 'Orders, attendees, check-ins and donation exports.', 'Reporting'),
    ('patrons_tracking', 'Patrons tracking', 'Patron outreach list and contacted tracking.', 'Reporting'),
]

FEATURE_KEYS = [f[0] for f in FEATURES]


def seed(apps, schema_editor):
    FeatureDefinition = apps.get_model('ticket_bookings', 'FeatureDefinition')
    FeaturePackage = apps.get_model('ticket_bookings', 'FeaturePackage')
    Organization = apps.get_model('ticket_bookings', 'Organization')

    for key, name, description, category in FEATURES:
        FeatureDefinition.objects.update_or_create(
            key=key,
            defaults={
                'name': name, 'description': description,
                'category': category, 'default_enabled': True,
            },
        )

    package, _ = FeaturePackage.objects.update_or_create(
        code='standard',
        defaults={
            'name': 'Standard',
            'description': 'Default feature set for existing organisations.',
            'feature_keys': FEATURE_KEYS,
            'is_default': True,
        },
    )
    Organization.objects.filter(feature_package__isnull=True).update(
        feature_package=package,
    )


def unseed(apps, schema_editor):
    FeatureDefinition = apps.get_model('ticket_bookings', 'FeatureDefinition')
    FeaturePackage = apps.get_model('ticket_bookings', 'FeaturePackage')
    FeatureDefinition.objects.filter(key__in=FEATURE_KEYS).delete()
    FeaturePackage.objects.filter(code='standard').delete()


class Migration(migrations.Migration):
    dependencies = [('ticket_bookings', '0064_feature_entitlements')]
    operations = [migrations.RunPython(seed, unseed)]
