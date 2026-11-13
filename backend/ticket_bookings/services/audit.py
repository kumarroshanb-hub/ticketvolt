"""Tamper-evident audit-chain verification."""
import hashlib
import json


def _payload(log, sequence):
    return {
        'sequence': sequence,
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


def verify_chain(queryset, limit=5000):
    prev = ''
    checked = 0
    for log in queryset.order_by('sequence', 'created_at', 'id')[:limit]:
        sequence = log.sequence or checked + 1
        payload = _payload(log, sequence)
        raw = f"{prev}:{json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)}"
        expected = hashlib.sha256(raw.encode()).hexdigest()
        if log.entry_hash and log.entry_hash != expected:
            return {'valid': False, 'checked': checked, 'failed_id': str(log.id)}
        prev = log.entry_hash or expected
        checked += 1
    return {'valid': True, 'checked': checked}
