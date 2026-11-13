import json
from channels.generic.websocket import AsyncWebSocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from datetime import timedelta
from .models import SeatReservation, Seat

class SeatMapConsumer(AsyncWebSocketConsumer):
    async def connect(self):
        self.event_id = self.scope['url_route']['kwargs']['event_id']
        self.room_group_name = f'seat_map_{self.event_id}'
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')
        
        if action == 'hold_seat':
            seat_id = data.get('seat_id')
            session_id = data.get('session_id')
            user_id = data.get('user_id')
            
            success = await self.hold_seat(seat_id, session_id, user_id)
            
            if success:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'seat_held',
                        'seat_id': seat_id,
                        'user_id': user_id,
                    }
                )
        
        elif action == 'release_seat':
            seat_id = data.get('seat_id')
            session_id = data.get('session_id')
            
            await self.release_seat(seat_id, session_id)
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'seat_released',
                    'seat_id': seat_id,
                }
            )

    @database_sync_to_async
    def hold_seat(self, seat_id, session_id, user_id):
        try:
            seat = Seat.objects.get(id=seat_id)
            
            # Check if already held/booked
            existing = SeatReservation.objects.filter(
                event_id=self.event_id,
                session_id=session_id,
                seat=seat,
                status__in=['held', 'booked']
            ).first()
            
            if existing:
                # If held by same user, refresh the timeout
                if existing.status == 'held' and str(existing.user_id) == str(user_id):
                    existing.held_until = timezone.now() + timedelta(minutes=10)
                    existing.save()
                    return True
                return False
            
            # Create new hold
            SeatReservation.objects.create(
                event_id=self.event_id,
                session_id=session_id,
                seat=seat,
                status='held',
                user_id=user_id,
                held_until=timezone.now() + timedelta(minutes=10)
            )
            return True
        except Exception as e:
            print(f"Error holding seat: {e}")
            return False

    @database_sync_to_async
    def release_seat(self, seat_id, session_id):
        try:
            SeatReservation.objects.filter(
                event_id=self.event_id,
                session_id=session_id,
                seat_id=seat_id,
                status='held'
            ).delete()
        except Exception as e:
            print(f"Error releasing seat: {e}")

    async def seat_held(self, event):
        await self.send(text_data=json.dumps({
            'type': 'seat_held',
            'seat_id': event['seat_id'],
            'user_id': event['user_id'],
        }))

    async def seat_released(self, event):
        await self.send(text_data=json.dumps({
            'type': 'seat_released',
            'seat_id': event['seat_id'],
        }))