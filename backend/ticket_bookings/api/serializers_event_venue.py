# backend/ticket_bookings/api/serializers_event_venue.py
from rest_framework import serializers

from ..models_event_venue import EventSeatCategory, EventVenuePlan
from ..models_venue_master import VenueMaster  # adjust import if named differently


# ---------------------------------------------------------------------------
# Read serializers
# ---------------------------------------------------------------------------

class EventSeatCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EventSeatCategory
        fields = [
            'id', 'name', 'hex_color', 'price',
            'source_palette_category_id',
        ]
        read_only_fields = fields


class EventVenuePlanReadSerializer(serializers.ModelSerializer):
    """
    Full read payload for the organizer's plan editor.
    Includes the master's layout so the canvas can render without a
    second request — but ONLY the seat coordinates, not the palette.
    """
    categories = EventSeatCategorySerializer(many=True, read_only=True)
    master_version = serializers.IntegerField(
        source='venue_master.version', read_only=True,
    )
    master_venue_id = serializers.UUIDField(
        source='venue_master.venue_id', read_only=True,
    )
    master_name = serializers.CharField(
        source='venue_master.name', read_only=True,
    )
    layout = serializers.SerializerMethodField()
    has_reserved_seating = serializers.SerializerMethodField()
    is_frozen = serializers.BooleanField(read_only=True)

    class Meta:
        model = EventVenuePlan
        fields = [
            'id',
            'venue_master', 'master_version', 'master_venue_id', 'master_name',
            'layout', 'has_reserved_seating',
            'categories', 'seat_assignments',
            'is_frozen', 'published_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_layout(self, obj):
        snap = obj.venue_master.snapshot or {}
        return snap.get('layout') or {}

    def get_has_reserved_seating(self, obj):
        snap = obj.venue_master.snapshot or {}
        return bool(snap.get('has_reserved_seating'))


class EventVenuePlanBuyerSerializer(serializers.Serializer):
    """
    Buyer-facing read serializer. Reads ONLY from published_snapshot —
    never from the live categories/assignments, and never from
    venue_master.snapshot. This is the whole point of freezing.
    """
    def to_representation(self, plan):
        snap = plan.published_snapshot or {}
        return {
            'layout': snap.get('layout') or {},
            'categories': snap.get('categories') or [],
            'seat_assignments': snap.get('seat_assignments') or {},
            'venue_master_version': snap.get('venue_master_version'),
            'frozen_at': snap.get('frozen_at'),
        }


# ---------------------------------------------------------------------------
# Write serializers
# ---------------------------------------------------------------------------

class EventVenuePlanCreateSerializer(serializers.Serializer):
    """
    Used only on event create. Non-trivial logic lives in
    services.event_venue_plan.provision_venue_plan.
    """
    venue_master_id = serializers.UUIDField(required=True)
    seat_assignments = serializers.DictField(
        child=serializers.CharField(), required=False, default=dict,
        help_text='{ seat_id: category_name | palette_id | event_category_id }',
    )
    category_overrides = serializers.ListField(
        child=serializers.DictField(), required=False, default=list,
        help_text='[{ name, hex_color, price }] — extra event-only categories.',
    )

    def validate_venue_master_id(self, value):
        try:
            return VenueMaster.objects.get(pk=value, is_current=True)
        except VenueMaster.DoesNotExist:
            raise serializers.ValidationError(
                'Venue master not found or not the current version.'
            )


class EventSeatCategoryWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    hex_color = serializers.CharField(max_length=7, required=False)
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False,
    )


class EventSeatCategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=True)
    hex_color = serializers.CharField(max_length=7, required=False, default='#4CAF50')
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, default=0,
    )


class EventSeatAssignmentBulkSerializer(serializers.Serializer):
    category_id = serializers.UUIDField(required=True)
    seat_ids = serializers.ListField(
        child=serializers.UUIDField(), required=True, min_length=1,
    )


class EventSeatUnassignSerializer(serializers.Serializer):
    seat_ids = serializers.ListField(
        child=serializers.UUIDField(), required=True, min_length=1,
    )