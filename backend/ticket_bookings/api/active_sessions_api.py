# backend/ticket_bookings/api/active_sessions_api.py
"""
SuperAdmin-only endpoint that lists all active sessions.

Merges:
  1. React App JWT users (tracked via UserProfile.last_active).
  2. Django Admin sessions (traditional database sessions).

Read-only. No mutation of sessions here.
"""
import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ticket_bookings.models import UserProfile

logger = logging.getLogger(__name__)
User = get_user_model()


class ActiveSessionsView(APIView):
    """
    GET /api/admin/active-sessions/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # ── SuperAdmin only ──
        if not request.user.is_superuser:
            return Response(
                {'error': 'Only super admins can view active sessions.'},
                status=403,
            )

        include_anonymous = request.query_params.get('include_anonymous', '0') in ('1', 'true', 'yes')
        try:
            idle_minutes = int(request.query_params.get('idle_minutes', 30))
        except (TypeError, ValueError):
            idle_minutes = 30
        idle_threshold_seconds = max(0, idle_minutes) * 60

        now = timezone.now()
        out = []
        unique_user_ids = set()

        # ─────────────────────────────────────────────────────────────
        # 1. Fetch Active JWT Users (Web App)
        # Match the 12h JWT refresh lifetime so active users don't
        # drop off the dashboard just because they stopped clicking.
        # ─────────────────────────────────────────────────────────────
        jwt_threshold = now - timedelta(hours=12)
        active_profiles = (
            UserProfile.objects
            .filter(last_active__gte=jwt_threshold)
            .select_related('user')
        )

        jwt_user_ids = set()
        for profile in active_profiles:
            u = profile.user
            jwt_user_ids.add(u.id)
            unique_user_ids.add(u.id)

            role = 'user'
            if u.is_superuser:
                role = 'super_admin'
            elif u.is_staff:
                role = 'admin'
            elif profile.is_organizer:
                role = 'organizer'

            idle_seconds = int((now - profile.last_active).total_seconds())

            out.append({
                'session_key': 'JWT',
                'user_id': u.id,
                'username': u.username,
                'email': u.email,
                'full_name': f'{u.first_name} {u.last_name}'.strip() or u.username,
                'role': role,
                'is_staff': u.is_staff,
                'is_superuser': u.is_superuser,
                'is_organizer': profile.is_organizer,
                'expires_at': None,
                'seconds_to_expiry': None,
                'last_activity': profile.last_active.isoformat(),
                'idle_seconds': idle_seconds,
                'idle': idle_seconds >= idle_threshold_seconds,
                'ip_address': None,
                'user_agent': 'React App (JWT)',
            })

        # ─────────────────────────────────────────────────────────────
        # ✅ FALLBACK: Always show the current SuperAdmin making this
        # request. Middleware fires AFTER the view, so on the very first
        # load of this page the requester themselves won't have a fresh
        # last_active stamp yet. This guarantees the page is never empty
        # for a SuperAdmin who is literally looking at it right now.
        # ─────────────────────────────────────────────────────────────
        if request.user.id not in jwt_user_ids:
            u = request.user
            out.insert(0, {
                'session_key': 'JWT (You)',
                'user_id': u.id,
                'username': u.username,
                'email': u.email,
                'full_name': f'{u.first_name} {u.last_name}'.strip() or u.username,
                'role': 'super_admin' if u.is_superuser else 'admin',
                'is_staff': u.is_staff,
                'is_superuser': u.is_superuser,
                'is_organizer': False,
                'expires_at': None,
                'seconds_to_expiry': None,
                'last_activity': now.isoformat(),
                'idle_seconds': 0,
                'idle': False,
                'ip_address': None,
                'user_agent': 'React App (Current View)',
            })
            unique_user_ids.add(u.id)

        # ─────────────────────────────────────────────────────────────
        # 2. Fetch Django Admin Sessions (cookie-based)
        # Skip anyone already shown above to avoid duplicates.
        # ─────────────────────────────────────────────────────────────
        qs = Session.objects.filter(expire_date__gt=now).order_by('-expire_date')
        raw_sessions = list(qs)

        decoded = []
        user_ids = set()
        for sess in raw_sessions:
            try:
                data = sess.get_decoded()
            except Exception:
                continue
            uid = data.get('_auth_user_id')
            if uid:
                try:
                    uid_int = int(uid)
                    if uid_int not in jwt_user_ids and uid_int not in unique_user_ids:
                        user_ids.add(uid_int)
                except (TypeError, ValueError):
                    pass
            decoded.append((sess, data))

        users_by_id = {
            u.id: u
            for u in User.objects.filter(id__in=user_ids).select_related('profile')
        }

        for sess, data in decoded:
            uid_raw = data.get('_auth_user_id')
            user = None
            if uid_raw:
                try:
                    user = users_by_id.get(int(uid_raw))
                except (TypeError, ValueError):
                    user = None

            if user is None and not include_anonymous:
                continue

            if user:
                unique_user_ids.add(user.id)

            # Django's default SESSION_COOKIE_AGE is 8 hours (28800s).
            estimated_last_activity = sess.expire_date - timedelta(seconds=28800)
            idle_seconds = int((now - estimated_last_activity).total_seconds())

            role = 'user'
            is_organizer = False
            if user:
                if user.is_superuser:
                    role = 'super_admin'
                elif user.is_staff:
                    role = 'admin'
                elif hasattr(user, 'profile') and user.profile.is_organizer:
                    role = 'organizer'
                    is_organizer = True

            out.append({
                'session_key': sess.session_key[:8] + '…',
                'user_id': user.id if user else None,
                'username': user.username if user else None,
                'email': user.email if user else None,
                'full_name': (
                    f'{user.first_name} {user.last_name}'.strip()
                    if user else None
                ) or (user.username if user else None),
                'role': role,
                'is_staff': bool(user.is_staff) if user else False,
                'is_superuser': bool(user.is_superuser) if user else False,
                'is_organizer': is_organizer,
                'expires_at': sess.expire_date.isoformat(),
                'seconds_to_expiry': max(0, int((sess.expire_date - now).total_seconds())),
                'last_activity': estimated_last_activity.isoformat(),
                'idle_seconds': idle_seconds,
                'idle': idle_seconds >= idle_threshold_seconds,
                'ip_address': None,
                'user_agent': 'Django Admin (Cookie)',
            })

        out.sort(key=lambda s: (not s['idle'], s['last_activity'] or ''), reverse=True)

        return Response({
            'generated_at': now.isoformat(),
            'idle_threshold_seconds': idle_threshold_seconds,
            'summary': {
                'total_sessions': len(out),
                'authenticated_sessions': sum(1 for s in out if s['user_id']),
                'anonymous_sessions': sum(1 for s in out if not s['user_id']),
                'idle_sessions': sum(1 for s in out if s['idle']),
                'unique_users': len(unique_user_ids),
            },
            'sessions': out,
        })