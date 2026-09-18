"""
toolkit.py — Gotham Pipeline Tool Standard (GPTS) shared core.

Standard:   references/tooling-standards.md
Contracts:  tools/REGISTRY.md (per-tool flag/exit-code/output blocks)
Discovery:  every standard tool answers `--help` / `-h` / no-args with its
            machine-readable JSON contract (exit 0).

Design rules (GPTS §1-§10):
  - flags only, no positional args, order-irrelevant
  - stdout = exactly one JSON document: {"ok": true, "status": ..., ...}
    or {"ok": false, "status": "error|conflict|precondition|not_found",
         "reason": ..., "fix": ...}
  - exit codes: 0 ok · 1 usage/validation · 2 conflict · 3 precondition · 4 not found
  - all identifiers validated against strict patterns before use
  - subprocess argv lists only, never shell=True
  - shared logic lives here (and in liveness.py / dupin_shared.py) — tools
    must not re-implement parsing, envelopes, audit, or path safety

Usage in a tool:

    from toolkit import Tool, Conflict, NotFound, audit_append

    def handle(v):
        ...
        return {"status": "claimed", "path": str(path)}

    TOOL = Tool(
        name="claim-unit",
        version="1.0",
        summary="Atomically claim a work unit for an agent.",
        flags={
            "--ticket":   {"required": True, "type": "key",   "description": "..."},
            "--unit":     {"required": True, "type": "unit",  "description": "..."},
            "--agent-id": {"required": True, "type": "agent", "description": "..."},
        },
        exit_codes={"0": "claimed or already_owned", "2": "conflict",
                    "3": "deps not met", "1": "usage or validation error"},
        examples=["$UB claim-unit --ticket LOC-0076 --unit LOC-0077 --agent-id dup-impl-a1b2"],
        idempotent="Re-claim by the same agent is a no-op (already_owned, exit 0).",
    )

    if __name__ == "__main__":
        TOOL.run(handle)
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# --------------------------------------------------------------- identifiers

PATTERN_KEY = r"^[A-Z][A-Z0-9]*-\d{3,4}$"
PATTERN_UNIT = r"^(?:[A-Z][A-Z0-9]*-\d{3,4}(?:-AC\d+)?|AC\d+)$"
PATTERN_AGENT = r"^[a-z0-9][a-z0-9-]{0,31}$"

_TYPE_PATTERNS = {
    "key": PATTERN_KEY,
    "unit": PATTERN_UNIT,
    "agent": PATTERN_AGENT,
}


def now_iso() -> str:
    """ISO-8601 UTC timestamp (GPTS §8: the only timestamp shape allowed)."""
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------- error envelope

class ToolError(Exception):
    """Base class for structured tool errors (GPTS §2)."""
    status = "error"
    code = 1

    def __init__(self, reason: str, fix: str = None, status: str = None, code: int = None):
        super().__init__(reason)
        self.reason = reason
        self.fix = fix
        if status is not None:
            self.status = status
        if code is not None:
            self.code = code


class UsageError(ToolError):
    status = "error"
    code = 1


class Conflict(ToolError):
    status = "conflict"
    code = 2


class Precondition(ToolError):
    status = "precondition"
    code = 3


class NotFound(ToolError):
    status = "not_found"
    code = 4


def emit(doc: dict) -> None:
    """The ONLY stdout writer for standard tools: one JSON document."""
    print(json.dumps(doc, indent=2, default=str))

def error_doc(exc: ToolError, default_fix: str = None) -> dict:
    return {
        "ok": False,
        "status": exc.status,
        "reason": exc.reason,
        "fix": exc.fix or default_fix or "run with --help to see the full flag contract",
    }


# ------------------------------------------------------------- path safety

def safe_subpath(base, *parts) -> Path:
    """Join parts under base and prove containment (GPTS §6).

    Rejects empty parts, '..'/'.' , absolute paths, NUL bytes, drive
    letters. The resolved result must stay inside the resolved base.
    """
    base = Path(base).resolve()
    p = base
    for part in parts:
        part = str(part)
        if not part or part in ("..", ".") or "\0" in part or os.path.isabs(part):
            raise UsageError(
                f"path part {part!r} is not allowed",
                "pass relative, base-contained path parts — no '..' or absolute paths",
            )
        p = p / part
    try:
        p.resolve().relative_to(base)
    except (ValueError, OSError):
        raise UsageError(
            "resulting path escapes the base directory",
            "use paths that stay inside the base",
        )
    return p


# ------------------------------------------------------------------ audit
def audit_append(base, tool: str, op: str, key=None, agent_id=None, result=None) -> None:
    """Best-effort structured audit line (GPTS §9). Never raises."""
    try:
        d = Path(base) / "logs" / "audit"
        d.mkdir(parents=True, exist_ok=True)
        entry = {"ts": now_iso(), "tool": tool, "op": op}
        if key is not None:
            entry["key"] = key
        if agent_id is not None:
            entry["agent_id"] = agent_id
        entry["result"] = result if result is not None else "ok"
        with open(d / "audit.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass


# ------------------------------------------------------------------ flags

_BOOL_RE = re.compile(r"^(true|false)$", re.IGNORECASE)


def _coerce(flag: str, ftype: str, raw: str, spec: dict):
    if ftype == "bool":
        if _BOOL_RE.match(raw):
            return raw.lower() == "true"
        raise UsageError(
            f"{flag} accepts true|false, got {raw!r}",
            f"drop {flag} for false, or pass {flag} true",
        )
    if ftype == "int":
        try:
            return int(raw)
        except ValueError:
            raise UsageError(f"{flag} must be an integer, got {raw!r}", f"pass {flag} <int>")
    if ftype == "list":
        return [x.strip() for x in raw.split(",") if x.strip()]
    if ftype == "choice":
        choices = spec.get("choices", [])
        if raw not in choices:
            raise UsageError(
                f"{flag} must be one of: {', '.join(choices)}",
                f"pass {flag} <one of those>",
            )
        return raw
    if ftype in _TYPE_PATTERNS:
        if not re.match(_TYPE_PATTERNS[ftype], raw):
            raise UsageError(
                f"{flag} value {raw!r} does not match the {ftype} pattern "
                f"{_TYPE_PATTERNS[ftype]}",
                f"pass {flag} <valid {ftype}> — see the --help contract",
            )
        return raw
    # "str" / "path": non-empty, no NUL
    if not raw or "\0" in raw:
        raise UsageError(f"{flag} value is empty or invalid", f"pass {flag} <value>")
    return raw


class Tool:
    """Flag-only CLI + JSON envelope + help contract (GPTS §1-§3)."""

    def __init__(self, name: str, version: str, summary: str, flags: dict,
                 exit_codes: dict = None, examples=None, idempotent=None,
                 base_default: Path = None):
        self.name = name
        self.version = version
        self.summary = summary
        self.flags = dict(flags)
        if base_default is not None:
            self.flags.setdefault("--base", {
                "required": False, "type": "path", "default": str(base_default),
                "description": "Base directory override (test/sim only; default: self-located).",
            })
        self.exit_codes = exit_codes or {"0": "success", "1": "usage or validation error"}
        self.examples = list(examples or [])
        self.idempotent = idempotent

    # ------------------------------------------------------------- help

    def help_doc(self) -> dict:
        flags = {}
        for name, spec in self.flags.items():
            entry = {
                "required": bool(spec.get("required", False)),
                "type": spec.get("type", "str"),
            }
            if "pattern" in _TYPE_PATTERNS.get(spec.get("type", ""), "") or spec.get("type") in _TYPE_PATTERNS:
                entry["pattern"] = _TYPE_PATTERNS[spec["type"]]
            if "choices" in spec:
                entry["choices"] = spec["choices"]
            if "default" in spec:
                entry["default"] = spec["default"]
            if "description" in spec:
                entry["description"] = spec["description"]
            flags[name] = entry
        doc = {
            "tool": self.name,
            "version": self.version,
            "summary": self.summary,
            "flags": flags,
            "exit_codes": self.exit_codes,
        }
        if self.examples:
            doc["examples"] = self.examples
        if self.idempotent:
            doc["idempotent"] = self.idempotent
        return doc

    def print_help(self) -> None:
        emit(self.help_doc())

    def _default_fix(self) -> str:
        valid = ", ".join(self.flags)
        return f"valid flags: {valid} — see `--help` for the full contract"

    # ------------------------------------------------------------ parse

    def parse(self, argv) -> dict:
        """Parse flag-only argv. No positionals. Order-irrelevant."""
        if not argv or argv[0] in ("--help", "-h", "help"):
            self.print_help()
            raise SystemExit(0)

        values = {}
        i = 0
        while i < len(argv):
            arg = argv[i]
            if not arg.startswith("--"):
                raise UsageError(
                    f"unexpected positional argument {arg!r} — this tool is flag-only",
                    f"map every value to a flag; valid flags: {', '.join(self.flags)}",
                )
            if arg not in self.flags:
                raise UsageError(
                    f"unknown flag {arg!r}",
                    f"valid flags: {', '.join(self.flags)}",
                )
            spec = self.flags[arg]
            ftype = spec.get("type", "str")
            if ftype == "bool":
                if i + 1 < len(argv) and not argv[i + 1].startswith("--") and _BOOL_RE.match(argv[i + 1]):
                    values[arg] = _coerce(arg, ftype, argv[i + 1], spec)
                    i += 2
                else:
                    values[arg] = True
                    i += 1
            else:
                if i + 1 >= len(argv):
                    raise UsageError(
                        f"{arg} requires a value",
                        f"pass {arg} <value>",
                    )
                raw = argv[i + 1]
                if raw.startswith("--") and ftype not in ("str", "path"):
                    raise UsageError(
                        f"{arg} requires a value, got flag {raw!r}",
                        f"pass {arg} <value> {raw} <its value>",
                    )
                values[arg] = _coerce(arg, ftype, raw, spec)
                i += 2

        for name, spec in self.flags.items():
            if spec.get("required") and name not in values:
                raise UsageError(
                    f"missing required flag {name}",
                    f"pass {name} <value> — see --help for the contract",
                )
            if name not in values and "default" in spec:
                values[name] = spec["default"]
        return values

    # ------------------------------------------------------------- run

    def run(self, handler) -> None:
        """Entry point: parse → handler → envelope. Catches ToolError + unexpected."""
        try:
            values = self.parse(sys.argv[1:])
        except SystemExit:
            raise
        except ToolError as e:
            emit(error_doc(e, self._default_fix()))
            sys.exit(e.code)
        except Exception as e:
            emit({"ok": False, "status": "error",
                  "reason": f"failed to parse arguments: {type(e).__name__}: {e}",
                  "fix": self._default_fix()})
            sys.exit(1)

        try:
            payload = handler(values) or {}
        except ToolError as e:
            emit(error_doc(e, self._default_fix()))
            sys.exit(e.code)
        except Exception as e:
            emit({"ok": False, "status": "error",
                  "reason": f"internal error: {type(e).__name__}: {e}",
                  "fix": f"re-run with the same flags to reproduce; this is a tool bug — report the reason text"})
            sys.exit(1)

        status = payload.pop("status", "ok")
        doc = {"ok": True, "status": status}
        doc.update(payload)
        emit(doc)
        sys.exit(0)


# ------------------------------------------------------------ payload tools

def payload_error(reason: str, fix: str, code: int = 1) -> None:
    """For JSON-payload tools (make-handoff & co.): emit the envelope and exit.

    Payload tools keep their stdin/heredoc interface but must fail with the
    same JSON envelope as flag tools (GPTS §2, §6: no bare text errors).
    """
    emit({"ok": False, "status": "error", "reason": reason, "fix": fix})
    sys.exit(code)
