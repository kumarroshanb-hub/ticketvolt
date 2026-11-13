import hashlib
import json

from django.db import migrations


def backfill(apps, schema_editor):
    AuditLog = apps.get_model('ticket_bookings', 'AuditLog')
    prev = ''
    for index, log in enumerate(AuditLog.objects.order_by('created_at', 'id'), start=1):
        payload = {
            'sequence': index,
            'organization_id': str(log.organization_id or ''),
            'actor_id': log.actor_id,
            'action': log.action,
            'method': log.method,
            'path': log.path,
            'status_code': log.status_code,
            'entity_type': log.entity_type,
            'entity_id': log.entity_id,
            'ip_address': str(log.ip_address or ''),
            'detail': log.detail or {},
        }
        raw = f"{prev}:{json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)}"
        entry_hash = hashlib.sha256(raw.encode()).hexdigest()
        AuditLog.objects.filter(pk=log.pk).update(
            sequence=index, prev_hash=prev, entry_hash=entry_hash,
        )
        prev = entry_hash


def reverse(apps, schema_editor):
    AuditLog = apps.get_model('ticket_bookings', 'AuditLog')
    AuditLog.objects.update(sequence=None, prev_hash='', entry_hash='')


class Migration(migrations.Migration):
    dependencies = [('ticket_bookings', '0069_audit_hash_chain')]
    operations = [migrations.RunPython(backfill, reverse)]
