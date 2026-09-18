"""
confirm-passphrase.py -- Validates a user-provided passphrase and establishes
a credential session.

This is the ONLY way to unlock credential access for a pipeline session.
The cred-gate hook blocks all credential scripts (read-cred.py, jira-fetch.py,
azdo-fetch.py, etc.) until this tool has validated a passphrase and written
the .cred-session file.

GPTS flag-only CLI. --help / -h / no-args prints this JSON contract and exits 0.

Flags:
  --passphrase <pin>   Validate the passphrase; on success write the
                       .cred-session file (8h TTL enforced by cred-gate hook).
  --status             Report the session state (no unlock).
  --clear              End the session (delete .cred-session).
  --base <dir>         Base directory override (test/sim only; default:
                       self-located).

Exactly one of --passphrase / --status / --clear per invocation.

Exit codes:
  0 = valid / session active / session cleared / no session to clear
  1 = usage error · invalid passphrase

The session file's validated_at is ISO-8601 UTC (datetime.now(timezone.utc));
cred-gate.py parses it with fromisoformat(ts.replace("Z", "+00:00")).
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cred_crypto import validate_passphrase
from toolkit import Tool, UsageError, ToolError, audit_append, now_iso

BASE_DIR = Path.home() / ".claude"  # repo copy: personal credential store
SESSION_REL = "assets/creds/.cred-session"


class InvalidPassphrase(ToolError):
    status = "invalid"
    code = 1


def _session_path(base):
    return Path(base) / "assets" / "creds" / ".cred-session"


def handle(v):
    base = Path(v["--base"])
    modes = [name for name in ("--passphrase", "--status", "--clear") if v.get(name)]
    if len(modes) > 1:
        raise UsageError(
            f"mutually exclusive modes: {', '.join(modes)}",
            "pass exactly one of --passphrase <pin>, --status, or --clear",
        )

    session = _session_path(base)

    if "--clear" in modes:
        if session.is_file():
            session.unlink()
            audit_append(base, "confirm-passphrase", "clear", result="cleared")
            return {"status": "cleared", "session_file": SESSION_REL}
        return {"status": "no_session", "session_file": SESSION_REL}

    if "--status" in modes:
        if session.is_file():
            data = json.loads(session.read_text(encoding="utf-8"))
            return {"status": "active", "session": data, "session_file": SESSION_REL}
        return {"status": "no_session", "session_file": SESSION_REL}

    # --passphrase: validate + unlock
    if not v.get("--passphrase"):
        raise UsageError(
            "pass exactly one of --passphrase, --status, --clear",
            "pass --passphrase <pin> to validate and establish the session",
        )
    passphrase = v["--passphrase"]
    if validate_passphrase(passphrase):
        data = {
            "validated_at": now_iso(),
            "source": "confirm-passphrase",
        }
        session.parent.mkdir(parents=True, exist_ok=True)
        session.write_text(json.dumps(data), encoding="utf-8")
        audit_append(base, "confirm-passphrase", "validate", result="valid")
        return {"status": "valid", "session_file": SESSION_REL,
                "validated_at": data["validated_at"]}
    raise InvalidPassphrase(
        "passphrase validation failed",
        "ask the user for the correct passphrase and retry",
    )


TOOL = Tool(
    name="confirm-passphrase",
    version="2.0",
    summary="Validate a passphrase and establish (or inspect/clear) the credential session.",
    flags={
        "--passphrase": {
            "required": False,
            "type": "str",
            "description": "Passphrase to validate; on success writes assets/creds/.cred-session (8h TTL).",
        },
        "--status": {
            "type": "bool",
            "description": "Report the current session state without changing it.",
        },
        "--clear": {
            "type": "bool",
            "description": "End the session by deleting .cred-session.",
        },
    },
    exit_codes={
        "0": "valid (session established) · session active · session cleared · no session to clear",
        "1": "usage error · invalid passphrase",
    },
    examples=[
        "$UB confirm-passphrase --passphrase <pin>",
        "$UB confirm-passphrase --status",
        "$UB confirm-passphrase --clear",
    ],
    idempotent="clear with no active session is a no-op (no_session, exit 0); re-validating simply rewrites the session file.",
    base_default=BASE_DIR,
)


def main():
    TOOL.run(handle)


if __name__ == "__main__":
    main()
