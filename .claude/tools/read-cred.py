"""
read-cred.py — Decrypts and returns credential values at runtime (credential authority).

GOTS (Gotham Pipeline Tool Standard) flag-only CLI. --help / -h / no-args
prints this JSON contract and exits 0. stdout is exactly one JSON document;
diagnostics go to stderr.

Flags:
  --provider <name>      Service: azdo | bitbucket | newrelic | jira | github
                         (required for decryption modes)
  --field <FIELD>        Single credential key, e.g. JIRA_TOKEN. Omit to
                         resolve ALL fields for the provider.
  --passphrase <pin>     Decryption passphrase. Required when any stored value
                         is encrypted. Never echoed to stdout/stderr/audit.
  --check                Validate passphrase only (requires --passphrase).
  --services             Metadata-only service listing; no decryption.
  --base <dir>           Base directory override (test/sim only; default:
                         self-located).

Output modes:
  --provider + --field:  {"ok": true, "status": "resolved", "value": "<plaintext>"}
  --provider (all):      {"ok": true, "status": "resolved", "values": {...}}
  --check:               {"ok": true, "status": "valid"} / exit 1 invalid
  --services:            BARE service map {svc: {file, exists, encrypted, keys}}
                         (legacy shape, no envelope — preflight-check.py
                         json.loads() it directly)

Exit codes:
  0 = resolved / valid / services listing
  1 = usage or validation error, invalid passphrase, wrong passphrase
  3 = precondition: credential file not found (run sync-1pass-creds.py first)

Module API (stable, imported by sibling tools):
  parse_cred_file(filepath) -> dict
  list_services() -> dict
  SERVICE_FILES, ASSETS_DIR, main()
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cred_crypto import derive_key, decrypt_value, is_encrypted, validate_passphrase
from cryptography.fernet import InvalidToken
from toolkit import Tool, UsageError, Precondition, ToolError, emit

_BASE_DIR = Path.home() / ".claude"  # repo copy: personal credential store
ASSETS_DIR = str(_BASE_DIR / "assets" / "creds")

SERVICE_FILES = {
    "azdo": "azuredevops-creds.md",
    "bitbucket": "bitbucket-creds.md",
    "newrelic": "newrelic-creds.md",
    "jira": "jira-creds.md",
    "github": "github-creds.md",
}


class InvalidPassphrase(ToolError):
    status = "invalid"
    code = 1


def parse_cred_file(filepath):
    """Parse a KEY=VALUE credential file. Returns dict of all key-value pairs."""
    pairs = {}
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("<!--"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                pairs[key.strip()] = val.strip()
    return pairs


def _service_map(base):
    """List available services and whether their cred files exist/are encrypted."""
    result = {}
    assets = Path(base) / "assets" / "creds"
    for svc, filename in SERVICE_FILES.items():
        filepath = assets / filename
        info = {"file": filename, "exists": filepath.exists(), "encrypted": False}
        if info["exists"]:
            pairs = parse_cred_file(filepath)
            info["encrypted"] = any(is_encrypted(v) for v in pairs.values())
            info["keys"] = list(pairs.keys())
        result[svc] = info
    return result


def list_services():
    """List available services and whether their cred files exist/are encrypted."""
    return _service_map(_BASE_DIR)


def _decrypt_pairs(pairs, passphrase):
    """Decrypt encrypted values in place (raises InvalidPassphrase on bad key)."""
    if passphrase:
        fernet_key = derive_key(passphrase)
        for key, val in pairs.items():
            if is_encrypted(val):
                try:
                    pairs[key] = decrypt_value(val, fernet_key)
                except InvalidToken:
                    raise InvalidPassphrase(
                        f"decryption failed for '{key}' — wrong passphrase?",
                        "re-run with the correct --passphrase",
                    )
    elif any(is_encrypted(v) for v in pairs.values()):
        raise UsageError(
            "credentials are encrypted; --passphrase is required",
            "pass --passphrase <pin-or-keyword>",
        )
    return pairs


def handle(v):
    base = Path(v["--base"])
    passphrase = v.get("--passphrase")

    # --services: metadata-only; emits the legacy bare service map (preflight-check.py
    # json.loads() it directly), not the standard envelope.
    if v.get("--services"):
        if v.get("--check") or v.get("--provider"):
            raise UsageError(
                "--services is a standalone mode",
                "drop --check and --provider when using --services",
            )
        emit(_service_map(base))
        raise SystemExit(0)

    # --check: validate passphrase only
    if v.get("--check"):
        if not passphrase:
            raise UsageError(
                "--check requires --passphrase",
                "pass --check --passphrase <pin-or-keyword>",
            )
        if validate_passphrase(passphrase):
            return {"status": "valid"}
        raise InvalidPassphrase(
            "passphrase validation failed",
            "ask the user for the correct passphrase and retry",
        )

    # Decryption mode
    provider = v.get("--provider")
    if not provider:
        raise UsageError(
            "--provider is required for decryption modes",
            f"pass --provider <one of: {', '.join(SERVICE_FILES)}>, or use --check / --services",
        )
    field = v.get("--field")

    filepath = base / "assets" / "creds" / SERVICE_FILES[provider]
    if not filepath.is_file():
        raise Precondition(
            f"credential file not found: {filepath}",
            "run sync-1pass-creds.py first to create it",
        )

    pairs = _decrypt_pairs(parse_cred_file(filepath), passphrase)

    if field:
        if field not in pairs:
            raise UsageError(
                f"field {field!r} not found in {provider}",
                f"available fields: {', '.join(pairs)}",
            )
        return {"status": "resolved", "provider": provider, "field": field,
                "value": pairs[field]}
    return {"status": "resolved", "provider": provider, "values": pairs}


TOOL = Tool(
    name="read-cred",
    version="2.0",
    summary="Decrypt and return credential values from assets/creds (credential authority).",
    flags={
        "--provider": {
            "required": False,
            "type": "choice",
            "choices": sorted(SERVICE_FILES),
            "description": "Service to read. Required for decryption modes; ignored by --check/--services.",
        },
        "--field": {
            "required": False,
            "type": "str",
            "description": "Single credential key (e.g. JIRA_TOKEN). Omit to resolve all fields for the provider.",
        },
        "--passphrase": {
            "required": False,
            "type": "str",
            "description": "Decryption passphrase (required when values are encrypted). Never echoed to output or audit.",
        },
        "--check": {
            "requires": ["--passphrase"],
            "type": "bool",
            "description": "Validate passphrase only; no decryption.",
        },
        "--services": {
            "type": "bool",
            "description": "Metadata-only service listing (emits bare service-map JSON; no decryption).",
        },
    },
    exit_codes={
        "0": "resolved (single field / all fields) · valid (--check) · services listing",
        "1": "usage or validation error · invalid passphrase (--check) · wrong passphrase on decrypt",
        "3": "precondition: credential file not found (run sync-1pass-creds.py first)",
    },
    examples=[
        "$UB read-cred --provider jira --field JIRA_TOKEN --passphrase <pin>",
        "$UB read-cred --provider azdo --passphrase <pin>",
        "$UB read-cred --check --passphrase <pin>",
        "$UB read-cred --services",
    ],
    idempotent="Read-only; repeated calls return identical values and mutate no state.",
    base_default=_BASE_DIR,
)


def main():
    TOOL.run(handle)


if __name__ == "__main__":
    main()
