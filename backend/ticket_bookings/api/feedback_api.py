"""Event feedback configuration, delivery and public responses."""
from __future__ import annotations

from django.db import IntegrityError
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Event, EventFeedbackResponse, Ticket
from ..services.feedback import read_feedback_token, send_feedback_invites
from ..services.tenancy import can_manage_event_data, visible_events


class EventFeedbackSendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, event_id):
        event = Event.objects.filter(pk=event_id).first()
        if event is None or not can_manage_event_data(request.user, event):
            return Response({'error': 'Event not found.'}, status=404)
        if not event.feedback_enabled or not (event.feedback_questions or []):
            return Response({'error': 'Configure and enable the feedback form first.'}, status=400)
        result = send_feedback_invites(event)
        return Response({'success': True, **result})


def _validate_answers(questions, answers):
    if not isinstance(answers, dict):
        return 'answers must be an object.'
    errors = []
    for question in questions or []:
        qid = str(question.get('id') or '')
        label = question.get('label') or 'Question'
        value = answers.get(qid)
        required = bool(question.get('required'))
        if required and (value is None or value == '' or value == []):
            errors.append(f'{label} is required.')
            continue
        if value in (None, ''):
            continue
        qtype = question.get('type')
        if qtype == 'rating':
            try:
                if not 1 <= int(value) <= 5:
                    errors.append(f'{label} must be between 1 and 5.')
            except (TypeError, ValueError):
                errors.append(f'{label} must be a number.')
        elif qtype == 'select':
            if str(value) not in [str(o) for o in (question.get('options') or [])]:
                errors.append(f'{label} has an invalid option.')
        elif qtype == 'text':
            if not isinstance(value, str) or len(value) > 2000:
                errors.append(f'{label} must be text under 2000 characters.')
    return errors


@api_view(['GET', 'POST'])
@permission_classes([permissions.AllowAny])
def public_feedback(request, token):
    payload = read_feedback_token(token)
    if not payload:
        return Response({'error': 'This feedback link is invalid or expired.'}, status=400)
    ticket = Ticket.objects.filter(pk=payload.get('ticket'), event_id=payload.get('event')).select_related('event', 'booking').first()
    if ticket is None:
        return Response({'error': 'Feedback is not available.'}, status=404)
    event = ticket.event
    if not event.feedback_enabled:
        return Response({'error': 'Feedback is not enabled for this event.'}, status=400)

    if request.method == 'GET':
        return Response({
            'event_title': event.title,
            'title': event.feedback_title,
            'intro': event.feedback_intro,
            'questions': event.feedback_questions or [],
            'attendee_name': ticket.attendee_name or ticket.booking.customer_name,
            'already_submitted': EventFeedbackResponse.objects.filter(event=event, ticket=ticket).exists(),
        })

    if EventFeedbackResponse.objects.filter(event=event, ticket=ticket).exists():
        return Response({'error': 'You have already submitted feedback for this event.'}, status=409)
    errors = _validate_answers(event.feedback_questions, request.data.get('answers'))
    if errors:
        return Response({'error': ' '.join(errors)}, status=400)
    try:
        EventFeedbackResponse.objects.create(
            event=event,
            ticket=ticket,
            attendee_email=ticket.attendee_email or ticket.booking.customer_email,
            answers=request.data.get('answers') or {},
        )
    except IntegrityError:
        return Response({'error': 'You have already submitted feedback for this event.'}, status=409)
    return Response({'success': True, 'message': 'Thank you for your feedback.'}, status=status.HTTP_201_CREATED)
