# backend/ticket_bookings/services/serializers_helpers.py
import os
import re
import logging
from django.contrib.auth.models import User
from ..models import UserProfile

logger = logging.getLogger(__name__)


def get_or_create_whatsapp_bot_user():
    """
    Returns the service account used for WhatsApp bookings.
    Ensures the password matches the WHATSAPP_BOT_PASSWORD environment variable.
    """
    service_password = os.environ.get('WHATSAPP_BOT_PASSWORD')

    if not service_password:
        logger.critical(
            "❌ WHATSAPP_BOT_PASSWORD environment variable is not set! "
            "Cannot create or use the whatsapp_bot service account securely."
        )
        raise ValueError(
            "WHATSAPP_BOT_PASSWORD environment variable is required "
            "to create the whatsapp_bot service account."
        )

    if len(service_password) < 16:
        raise ValueError("WHATSAPP_BOT_PASSWORD must be at least 16 characters.")

    whatsapp_user, created = User.objects.get_or_create(
        username='whatsapp_bot',
        defaults={
            'email': 'whatsapp@ticketvolt.com',
            'is_active': True,
            'is_staff': False,
            'is_superuser': False,
        },
    )

    if created:
        whatsapp_user.set_password(service_password)
        whatsapp_user.save()
        logger.info("✅ Created whatsapp_bot service account.")
    else:
        if not whatsapp_user.check_password(service_password):
            whatsapp_user.set_password(service_password)
            whatsapp_user.save(update_fields=['password'])
            logger.warning(
                "🔑 whatsapp_bot password did NOT match WHATSAPP_BOT_PASSWORD — "
                "rotated to the value from the environment."
            )

    return whatsapp_user


def resolve_or_create_user_for_booking(*, customer_email, customer_name, customer_phone):
    """
    Finds an existing user by email, or creates a new passwordless user for the booking.
    Falls back to the WhatsApp bot service account if no email is provided.
    """
    if not customer_email:
        return get_or_create_whatsapp_bot_user()

    existing = User.objects.filter(email__iexact=customer_email).first()
    if existing is not None:
        logger.info(
            "♻️ Booking purchaser email %r already belongs to user %r — reusing.",
            customer_email, existing.username,
        )
        return existing

    try:
        base_username = re.sub(r'[^a-zA-Z0-9_]', '_', customer_email.split('@')[0])[:140] or 'user'
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}_{counter}"[:150]
            counter += 1

        name_parts = (customer_name or '').split()
        first_name = (name_parts[0] if name_parts else customer_name or '')[:150]
        last_name = (' '.join(name_parts[1:]) if len(name_parts) > 1 else '')[:150]

        # Create user with unusable password (passwordless flow)
        user = User.objects.create_user(
            username=username,
            email=customer_email,
            password=None,
            first_name=first_name,
            last_name=last_name,
        )
        user.is_active = True
        user.save(update_fields=['is_active'])

        try:
            UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'email': customer_email,
                    'phone': customer_phone or '',
                    'whatsapp_number': customer_phone or '',
                },
            )
        except Exception as profile_err:
            logger.warning(f"⚠️ Could not create UserProfile: {profile_err}")

        return user
    except Exception:
        logger.exception("Error creating user from booking email")
        return get_or_create_whatsapp_bot_user()