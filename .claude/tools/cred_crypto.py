"""
cred_crypto.py — Shared encryption/decryption module for credential files.

Encryption: Fernet (AES-128-CBC + HMAC-SHA256)
Key derivation: PBKDF2-HMAC-SHA256, 600k iterations
Salt: random 32 bytes, stored at <BASE_DIR>/assets/creds/.cred-salt (derived from __file__)
Vault binding: vault name is mixed into the salt, so changing the vault breaks decryption.
Passphrase: user provides a PIN or keyword — either works, same code path.

Usage (as library):
    from cred_crypto import derive_key, encrypt_value, decrypt_value, validate_passphrase

Not intended to be run directly.
"""

import base64
import hashlib
import os
import re

from cryptography.fernet import Fernet, InvalidToken

_BASE_DIR = os.path.join(os.path.expanduser("~"), ".claude")  # repo copy: personal credential store
SALT_FILE = os.path.join(_BASE_DIR, "assets", "creds", ".cred-salt")
# Set CRED_VAULT_NAME env var to match the vault name used when credentials were first encrypted.
# Changing this breaks decryption of existing credentials (it's mixed into the key derivation salt).
VAULT_NAME = os.environ.get("CRED_VAULT_NAME", "gotham")
PBKDF2_ITERATIONS = 600_000
ENC_PREFIX = "ENC["
ENC_SUFFIX = "]"
ENC_PATTERN = re.compile(r"^ENC\[(.+)\]$")


def get_or_create_salt():
    """Load existing salt or generate a new one. Returns raw bytes."""
    if os.path.exists(SALT_FILE):
        with open(SALT_FILE, "rb") as f:
            return f.read()
    salt = os.urandom(32)
    with open(SALT_FILE, "wb") as f:
        f.write(salt)
    return salt


def derive_key(passphrase, salt=None):
    """Derive a Fernet key from passphrase (PIN or keyword) + salt + vault name.

    The vault name is cryptographically bound to the key — changing it
    produces a different key, making existing encrypted values unrecoverable.
    """
    if salt is None:
        salt = get_or_create_salt()
    # Mix vault name into salt so changing it breaks the key
    combined_salt = salt + VAULT_NAME.encode("utf-8")
    raw_key = hashlib.pbkdf2_hmac(
        "sha256",
        passphrase.encode("utf-8"),
        combined_salt,
        PBKDF2_ITERATIONS,
    )
    # Fernet requires a 32-byte url-safe base64-encoded key
    return base64.urlsafe_b64encode(raw_key)


def encrypt_value(plaintext, fernet_key):
    """Encrypt a plaintext string. Returns ENC[...] wrapped string."""
    f = Fernet(fernet_key)
    token = f.encrypt(plaintext.encode("utf-8"))
    return f"{ENC_PREFIX}{token.decode('utf-8')}{ENC_SUFFIX}"


def decrypt_value(enc_string, fernet_key):
    """Decrypt an ENC[...] wrapped string. Returns plaintext."""
    match = ENC_PATTERN.match(enc_string)
    if not match:
        raise ValueError(f"Not an encrypted value: {enc_string[:30]}...")
    token = match.group(1).encode("utf-8")
    f = Fernet(fernet_key)
    return f.decrypt(token).decode("utf-8")


def is_encrypted(value):
    """Check if a value is ENC[...] wrapped."""
    return bool(ENC_PATTERN.match(value))


def validate_passphrase(passphrase):
    """Try to decrypt a known test value to verify the passphrase is correct.

    Stores a validation token alongside the salt. Returns True if valid.
    """
    validation_file = os.path.join(os.path.dirname(SALT_FILE), ".cred-check")
    fernet_key = derive_key(passphrase)

    if os.path.exists(validation_file):
        # Verify against existing token
        with open(validation_file, "r", encoding="utf-8") as f:
            stored = f.read().strip()
        try:
            result = decrypt_value(stored, fernet_key)
            return result == "gotham-cred-check"
        except (InvalidToken, ValueError):
            return False
    else:
        # First time — create the validation token
        token = encrypt_value("gotham-cred-check", fernet_key)
        with open(validation_file, "w", encoding="utf-8") as f:
            f.write(token)
        return True
