"""Encryption for tenant payment credentials.

Production deployments should configure AWS KMS:
  KMS_PROVIDER=aws
  KMS_KEY_ID=arn:aws:kms:...
  AWS_REGION=ap-east-1

Without KMS, a SECRET_KEY-derived local key is used for development and
small deployments. KMS-encrypted values are prefixed and can be
decrypted even after migrating from the local backend.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)
_KMS_PREFIX = 'kms:aws:'


def _fernet():
    digest = hashlib.sha256(
        f'{settings.SECRET_KEY}:org-payment-config'.encode()
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _kms():
    import boto3
    kwargs = {}
    if getattr(settings, 'AWS_REGION', ''):
        kwargs['region_name'] = settings.AWS_REGION
    return boto3.client('kms', **kwargs)


def backend_name():
    if getattr(settings, 'KMS_PROVIDER', '') == 'aws' and getattr(settings, 'KMS_KEY_ID', ''):
        return 'aws-kms'
    return 'local-fernet'


def encrypt(value):
    if not value:
        return ''
    if getattr(settings, 'KMS_PROVIDER', '') == 'aws':
        if not getattr(settings, 'KMS_KEY_ID', ''):
            raise RuntimeError('KMS_PROVIDER=aws requires KMS_KEY_ID')
        result = _kms().encrypt(
            KeyId=settings.KMS_KEY_ID,
            Plaintext=str(value).encode(),
            EncryptionContext={'app': 'ticketvolt', 'purpose': 'payment-credentials'},
        )
        return _KMS_PREFIX + base64.b64encode(result['CiphertextBlob']).decode()
    return _fernet().encrypt(str(value).encode()).decode()


def decrypt(value):
    if not value:
        return ''
    if str(value).startswith(_KMS_PREFIX):
        blob = base64.b64decode(str(value)[len(_KMS_PREFIX):])
        result = _kms().decrypt(
            CiphertextBlob=blob,
            EncryptionContext={'app': 'ticketvolt', 'purpose': 'payment-credentials'},
        )
        return result['Plaintext'].decode()
    try:
        return _fernet().decrypt(str(value).encode()).decode()
    except (InvalidToken, ValueError):
        return ''
