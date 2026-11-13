"""Automatic English → Traditional Chinese translation for public event content.

The product lets organisers publish an event in both languages with a single
toggle. We translate and persist the result so the public page can render both
languages without a runtime translation call.
"""
from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)

_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
_TIMEOUT = 6


def translate_text(text: str, target: str = 'zh-TW') -> str:
    text = (text or '').strip()
    if not text:
        return ''
    try:
        response = requests.get(
            _ENDPOINT,
            params={
                'client': 'gtx',
                'sl': 'en',
                'tl': target,
                'dt': 't',
                'q': text,
            },
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        parts = payload[0] if payload else []
        translated = ''.join(part[0] for part in parts if part and part[0])
        return translated.strip() or ''
    except Exception as exc:  # pragma: no cover - network/provider failure
        logger.warning('Event auto-translation failed: %s', exc)
        return ''


def translate_event_content(event) -> None:
    """Populate `*_zh` fields from the English source fields and save."""
    if not getattr(event, 'show_bilingual_content', False):
        return

    updates = []
    for source_field, target_field in (
        ('title', 'title_zh'),
        ('description', 'description_zh'),
    ):
        translated = translate_text(getattr(event, source_field, ''))
        if translated and translated != getattr(event, target_field, ''):
            setattr(event, target_field, translated)
            updates.append(target_field)

    faqs = getattr(event, 'faqs', None) or []
    if isinstance(faqs, list):
        translated_faqs = []
        changed = False
        for item in faqs:
            if not isinstance(item, dict):
                translated_faqs.append(item)
                continue
            next_item = dict(item)
            if item.get('question'):
                q_zh = translate_text(item['question'])
                if q_zh and q_zh != item.get('question_zh'):
                    next_item['question_zh'] = q_zh
                    changed = True
            if item.get('answer'):
                a_zh = translate_text(item['answer'])
                if a_zh and a_zh != item.get('answer_zh'):
                    next_item['answer_zh'] = a_zh
                    changed = True
            translated_faqs.append(next_item)
        if changed:
            event.faqs = translated_faqs
            updates.append('faqs')

    if updates:
        event.save(update_fields=list(dict.fromkeys(updates)))
