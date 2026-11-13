# backend/ticket_bookings/api/event_venue_plan_api.py
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Event
from ..models_event_venue import EventSeatCategory, EventVenuePlan
from ..services.tenancy import can_manage_event_data
from .serializers_event_venue import (
    EventSeatAssignmentBulkSerializer,
    EventSeatCategoryCreateSerializer,
    EventSeatCategorySerializer,
    EventSeatCategoryWriteSerializer,
    EventSeatUnassignSerializer,
    EventVenuePlanReadSerializer,
)


def _get_event_or_403(request, event_id):
    event = get_object_or_404(Event, pk=event_id)
    if not can_manage_event_data(request.user, event):
        return None, Response(
            {'error': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return event, None


def _get_plan_or_404(event):
    plan = getattr(event, 'venue_plan', None)
    if plan is None:
        return None, Response(
            {'detail': 'No venue plan configured for this event.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    return plan, None


def _reject_if_frozen(plan):
    if plan.is_frozen:
        return Response(
            {
                'detail': (
                    'This event is published and its venue plan is frozen. '
                    'Editing categories or assignments is no longer allowed.'
                ),
                'code': 'PLAN_FROZEN',
            },
            status=status.HTTP_409_CONFLICT,
        )
    return None


# ---------------------------------------------------------------------------
# GET plan (organizer view)
# ---------------------------------------------------------------------------

class EventVenuePlanView(APIView):
    """GET /api/events/<id>/venue-plan/"""

    def get(self, request, event_id):
        event, err = _get_event_or_403(request, event_id)
        if err:
            return err
        plan, err = _get_plan_or_404(event)
        if err:
            return err
        return Response(EventVenuePlanReadSerializer(plan).data)


# ---------------------------------------------------------------------------
# Categories — create / update / delete
# ---------------------------------------------------------------------------

class EventSeatCategoryCreateView(APIView):
    """POST /api/events/<id>/venue-plan/categories/"""

    def post(self, request, event_id):
        event, err = _get_event_or_403(request, event_id)
        if err:
            return err
        plan, err = _get_plan_or_404(event)
        if err:
            return err
        if (frozen := _reject_if_frozen(plan)):
            return frozen

        ser = EventSeatCategoryCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        if plan.categories.filter(name=ser.validated_data['name']).exists():
            return Response(
                {'error': 'A category with this name already exists.'},
                status=status.HTTP_409_CONFLICT,
            )

        cat = EventSeatCategory.objects.create(
            venue_plan=plan,
            name=ser.validated_data['name'],
            hex_color=ser.validated_data['hex_color'],
            price=ser.validated_data['price'],
        )
        return Response(
            EventSeatCategorySerializer(cat).data,
            status=status.HTTP_201_CREATED,
        )


class EventSeatCategoryUpdateView(APIView):
    """PATCH / DELETE /api/events/<id>/venue-plan/categories/<cat_id>/"""

    def patch(self, request, event_id, category_id):
        event, err = _get_event_or_403(request, event_id)
        if err:
            return err
        plan, err = _get_plan_or_404(event)
        if err:
            return err
        if (frozen := _reject_if_frozen(plan)):
            return frozen

        cat = plan.categories.filter(pk=category_id).first()
        if cat is None:
            return Response(
                {'detail': 'Category not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        ser = EventSeatCategoryWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)

        # Reject name collision.
        new_name = ser.validated_data.get('name')
        if new_name and new_name != cat.name:
            if plan.categories.filter(name=new_name).exclude(pk=cat.pk).exists():
                return Response(
                    {'error': 'A category with this name already exists.'},
                    status=status.HTTP_409_CONFLICT,
                )

        for field, value in ser.validated_data.items():
            setattr(cat, field, value)
        cat.save()

        return Response(EventSeatCategorySerializer(cat).data)

    def delete(self, request, event_id, category_id):
        event, err = _get_event_or_403(request, event_id)
        if err:
            return err
        plan, err = _get_plan_or_404(event)
        if err:
            return err
        if (frozen := _reject_if_frozen(plan)):
            return frozen

        cat = plan.categories.filter(pk=category_id).first()
        if cat is None:
            return Response(
                {'detail': 'Category not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # If any seat still references this category, reject — require an
        # explicit unassign first so a delete can't silently blank seats.
        still_assigned = [
            seat_id for seat_id, cid in (plan.seat_assignments or {}).items()
            if cid == str(cat.id)
        ]
        if still_assigned:
            return Response(
                {
                    'error': (
                        f'{len(still_assigned)} seat(s) are still assigned to '
                        f'this category. Unassign them first.'
                    ),
                    'code': 'CATEGORY_IN_USE',
                },
                status=status.HTTP_409_CONFLICT,
            )

        cat.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Assignments — bulk assign / unassign
# ---------------------------------------------------------------------------

class EventSeatAssignBulkView(APIView):
    """POST /api/events/<id>/venue-plan/assign/"""

    def post(self, request, event_id):
        event, err = _get_event_or_403(request, event_id)
        if err:
            return err
        plan, err = _get_plan_or_404(event)
        if err:
            return err
        if (frozen := _reject_if_frozen(plan)):
            return frozen

        ser = EventSeatAssignmentBulkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        cat = plan.categories.filter(pk=ser.validated_data['category_id']).first()
        if cat is None:
            return Response(
                {'detail': 'Category not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        master_snapshot = plan.venue_master.snapshot or {}
        seat_layout = master_snapshot.get('layout') or {}
        valid_seat_ids = {s['id'] for s in seat_layout.get('seats', [])}

        assignments = dict(plan.seat_assignments or {})
        updated = 0
        rejected = []
        for seat_id in ser.validated_data['seat_ids']:
            seat_str = str(seat_id)
            if seat_str not in valid_seat_ids:
                rejected.append(seat_str)
                continue
            assignments[seat_str] = str(cat.id)
            updated += 1

        plan.seat_assignments = assignments
        plan.save(update_fields=['seat_assignments', 'updated_at'])

        return Response({
            'updated': updated,
            'rejected': rejected,
            'assignments': assignments,
        })


class EventSeatUnassignView(APIView):
    """POST /api/events/<id>/venue-plan/unassign/"""

    def post(self, request, event_id):
        event, err = _get_event_or_403(request, event_id)
        if err:
            return err
        plan, err = _get_plan_or_404(event)
        if err:
            return err
        if (frozen := _reject_if_frozen(plan)):
            return frozen

        ser = EventSeatUnassignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        assignments = dict(plan.seat_assignments or {})
        removed = 0
        for seat_id in ser.validated_data['seat_ids']:
            if assignments.pop(str(seat_id), None) is not None:
                removed += 1

        plan.seat_assignments = assignments
        plan.save(update_fields=['seat_assignments', 'updated_at'])

        return Response({'removed': removed, 'assignments': assignments})
