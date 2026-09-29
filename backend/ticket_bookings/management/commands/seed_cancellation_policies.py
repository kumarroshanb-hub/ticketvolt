# backend/ticket_bookings/management/commands/seed_cancellation_policies.py

FLEXIBLE = {
    'version': 1,
    'refund_tiers': [
        {'min_hours_before': 48, 'refund_percent': 100, 'label': '2+ days before'},
        {'min_hours_before': 24, 'refund_percent': 50,  'label': '24-48 hours'},
        {'min_hours_before': 0,  'refund_percent': 0,   'label': 'Within 24 hours'},
    ],
    'cancellation_fee': 0,
    'allow_partial_cancellation': True,
    'allow_after_checkin': False,
    'reschedule_allowed': False,
    'notes': 'Free cancellation up to 2 days before the event.',
}

STANDARD = {
    'version': 1,
    'refund_tiers': [
        {'min_hours_before': 168, 'refund_percent': 100, 'label': '7+ days before'},
        {'min_hours_before': 24,  'refund_percent': 50,  'label': '24h - 7 days'},
        {'min_hours_before': 0,   'refund_percent': 0,   'label': 'Within 24h'},
    ],
    'cancellation_fee': 0,
    'allow_partial_cancellation': True,
    'allow_after_checkin': False,
    'reschedule_allowed': False,
    'notes': 'Free cancellation up to 7 days before. 50% refund up to 24h before.',
}

STRICT = {
    'version': 1,
    'refund_tiers': [
        {'min_hours_before': 336, 'refund_percent': 100, 'label': '14+ days before'},
        {'min_hours_before': 168, 'refund_percent': 50,  'label': '7-14 days'},
        {'min_hours_before': 0,   'refund_percent': 0,   'label': 'Within 7 days'},
    ],
    'cancellation_fee': 50,
    'allow_partial_cancellation': False,
    'allow_after_checkin': False,
    'reschedule_allowed': False,
    'notes': 'Full refund up to 14 days before. ₹50 fee applies to any refund.',
}