"""
UtilityBelt — single dispatcher for all pipeline tools.

Resolves BASE_DIR and HOME_DIR from its own location so the model
never constructs or passes directory paths. Normalizes all paths to
forward slashes. Auto-injects base_dir/home_dir/platform where needed.

Usage:
  $PY <BASE_DIR>/tools/utility-belt.py <tool> [args...]
  $PY <BASE_DIR>/tools/utility-belt.py --list
  $PY <BASE_DIR>/tools/utility-belt.py --paths

Gotham convention:  $UB = $PY <BASE_DIR>/tools/utility-belt.py

Examples:
  $UB oracle-startup
  $UB oracle-startup --refresh --ticket PAY-123
  $UB read-handoff --type alfred --key PAY-123
  $UB read-handoff --key PAY-123 --route --repo-root /c/Users/GUM/source/repos/foo
  $UB make-handoff <<'HANDOFF'
  {"type":"oracle","ticket_key":"KEY","self_evolution":[],"fields":{}}
  HANDOFF
  $UB stamp-handoffs <<'STAMP'
  {"ticket_key":"KEY","mode":"standard","committed_ac":["AC1"]}
  STAMP
  $UB preflight-check
  $UB clean-temp signal
  $UB read-reference oracle-reference.md --section "AIDLC"
  $UB aidlc-detect /path/to/repo
  $UB confirm-passphrase mypin
  $UB archive-ticket --key PAY-123
  $UB claim-ac PAY-123 AC1 damian-a3f7
  $UB audit-skill ~/.claude/skills/oracle/SKILL.md
"""
import ast
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
HOME_DIR = Path.home()
TOOLS_DIR = BASE_DIR / "tools"

if sys.platform == "win32" or os.name == "nt":
    PLATFORM = "win32"
else:
    PLATFORM = "darwin" if "Darwin" in os.popen("uname 2>/dev/null").read() else "linux"


def _posix(p):
    return str(p).replace("\\", "/")


# Tools where BASE_DIR is always prepended as arg 1.
PREPEND_BASE = {"read-pipeline-notes", "pipeline-notes"}  # Tools that take base_dir as first positional arg

# Tools where a JSON arg gets base_dir auto-injected.
JSON_INJECT = {"make-handoff", "stamp-handoffs"}

# Marker file for handoff guard — write-guard.py checks this to allow
# legitimate tool-mediated writes to handoffs/.
_HANDOFF_MARKER = BASE_DIR / "logs" / "compliance" / ".handoff-make-active"


def _replace_outside_strings(text, old, new):
    """Replace old with new only when outside JSON string literals.

    Walks the raw string tracking quote state so that True/False/None inside
    Gherkin steps or other string values are never corrupted.
    """
    result = []
    i = 0
    in_string = False
    escape_next = False
    while i < len(text):
        ch = text[i]
        if escape_next:
            result.append(ch)
            escape_next = False
            i += 1
            continue
        if in_string and ch == '\\':
            result.append(ch)
            escape_next = True
            i += 1
            continue
        if ch == '"':
            in_string = not in_string
            result.append(ch)
            i += 1
            continue
        if not in_string and text[i:i + len(old)] == old:
            before = text[i - 1] if i > 0 else ' '
            after = text[i + len(old)] if i + len(old) < len(text) else ' '
            if not (before.isalnum() or before == '_') and not (after.isalnum() or after == '_'):
                result.append(new)
                i += len(old)
                continue
        result.append(ch)
        i += 1
    return ''.join(result)


def _lenient_json(raw):
    """Parse JSON leniently, auto-correcting common model mistakes."""
    # Strip comment lines (// and #)
    stripped = re.sub(r"^\s*(?://|#).*$", "", raw, flags=re.MULTILINE)
    # Try strict JSON first
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    # Fix Python booleans/None (word-boundary only, outside string literals)
    fixed = _replace_outside_strings(stripped, "True", "true")
    fixed = _replace_outside_strings(fixed, "False", "false")
    fixed = _replace_outside_strings(fixed, "None", "null")
    # Strip trailing commas before } or ]
    fixed = re.sub(r",\s*([}\]])", r"\1", fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass
    # Last resort: try ast.literal_eval (handles single-quoted Python dicts)
    try:
        obj = ast.literal_eval(stripped)
        return json.loads(json.dumps(obj))
    except (ValueError, SyntaxError):
        pass
    # Nothing worked — raise with the original error for diagnostics
    return json.loads(raw)


def resolve_script(name):
    for variant in [f"{name}.py", f"{name.replace('-', '_')}.py"]:
        p = TOOLS_DIR / variant
        if p.exists():
            return p
    return None


def run(script, args, stdin_data=None, _return=False):
    result = subprocess.run(
        [sys.executable, str(script)] + args,
        input=stdin_data, text=bool(stdin_data),
    )
    if _return:
        return result.returncode
    sys.exit(result.returncode)


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print(__doc__.strip())
        sys.exit(0)

    if sys.argv[1] == "--list":
        scripts = sorted(
            p.stem for p in TOOLS_DIR.glob("*.py")
            if not p.name.startswith("_")
            and p.stem != "utility-belt"
        )
        for s in scripts:
            print(s)
        sys.exit(0)

    if sys.argv[1] == "--paths":
        print(json.dumps({
            "base_dir": _posix(BASE_DIR),
            "home_dir": _posix(HOME_DIR),
            "tools_dir": _posix(TOOLS_DIR),
            "platform": PLATFORM,
        }, indent=2))
        sys.exit(0)

    # --- gen-id: inline UUID generation (no external script needed) ---
    if sys.argv[1] == "gen-id":
        import uuid
        skill = sys.argv[2] if len(sys.argv) > 2 else "agent"
        print(f"{skill}-{uuid.uuid4().hex[:4]}")
        sys.exit(0)

    tool = sys.argv[1]
    args = sys.argv[2:]

    # Intercept --help on downstream tools — usage is inline in skill docs.
    if "--help" in args or "-h" in args:
        print(f"{tool}: usage is inline in your skill instructions. If needed: $UB read-reference REGISTRY.md --section \"{tool}\"")
        sys.exit(0)

    # Auto-substitute <BASE_DIR>/<base_dir> and <HOME_DIR>/<home_dir> in any
    # argument so the model never needs to resolve these at call time.
    # Both case variants exist across skill templates — cover them here.
    base_str = _posix(BASE_DIR)
    home_str = _posix(HOME_DIR)
    args = [
        a.replace("<BASE_DIR>", base_str).replace("<base_dir>", base_str)
         .replace("<HOME_DIR>", home_str).replace("<home_dir>", home_str)
        for a in args
    ]

    script = resolve_script(tool)
    if not script:
        print(f"Unknown tool: {tool}. Use --list to see available tools.", file=sys.stderr)
        sys.exit(1)

    # --- oracle-startup: always pass HOME_DIR ---
    if tool == "oracle-startup":
        run(script, [_posix(HOME_DIR)] + args)

    # --- preflight-check: inject base_dir, platform, home, cache ---
    elif tool == "preflight-check":
        full = [_posix(BASE_DIR), "--platform", PLATFORM, "--home", _posix(HOME_DIR)]
        if "--write-cache" not in args:
            cache = BASE_DIR / "handoffs" / "oracle" / "preflight-cache.md"
            full += ["--write-cache", _posix(cache)]
        run(script, full + args)

    # --- read-reference: resolve short filenames to references/ then skills/ ---
    # Optional --repo-root <path> extends the search to repo artifact and audit dirs.
    # Resolution order: references/ → tools/ → skills/ → aidlc-docs/ → audits/
    elif tool == "read-reference":
        # Extract --repo-root <path> from args before passing to script
        repo_root = None
        if "--repo-root" in args:
            rr_idx = args.index("--repo-root")
            if rr_idx + 1 < len(args):
                repo_root = Path(os.path.expanduser(args[rr_idx + 1]))
                args = args[:rr_idx] + args[rr_idx + 2:]  # strip flag + value

        if args and not args[0].startswith("-"):
            p = Path(os.path.expanduser(args[0]))
            if not p.is_absolute():
                resolved = BASE_DIR / "references" / p.name
                if not resolved.exists():
                    resolved = BASE_DIR / "references" / p
                if not resolved.exists():
                    resolved = BASE_DIR / "tools" / p.name
                if not resolved.exists():
                    resolved = BASE_DIR / "commands" / p.name
                # Repo-scoped fallbacks when --repo-root supplied
                if not resolved.exists() and repo_root:
                    resolved = repo_root / "aidlc-docs" / "inception" / "reverse-engineering" / p.name
                if not resolved.exists() and repo_root:
                    # audit.md lives at audits/<ticket>/audit.md — pass ticket as name
                    resolved = repo_root / "audits" / p
                args[0] = _posix(resolved)
            else:
                args[0] = _posix(p)
        run(script, args)

    # --- read-handoff: prepend BASE_DIR in type/key mode ---
    # Supports positional shorthand: $UB read-handoff <type> <key> [flags...]
    # rewrites to: read-handoff.py BASE_DIR --type <type> --key <key> [flags...]
    # Also handles: $UB read-handoff <type> without --key (scan mode)
    elif tool == "read-handoff":
        # Check if --type is provided
        type_idx = -1
        try:
            type_idx = args.index("--type")
        except ValueError:
            pass

        if type_idx >= 0:
            # --type was provided
            if "--key" not in args:
                # No --key: scan mode for active handoff of this type
                run(script, [_posix(BASE_DIR)] + args)
            else:
                # Both --type and --key: standard mode
                run(script, [_posix(BASE_DIR)] + args)
        elif args and not args[0].startswith("-"):
            p = Path(os.path.expanduser(args[0]))
            if p.is_file():
                args[0] = _posix(p)
                run(script, args)
            elif (len(args) >= 2 and not args[1].startswith("-")
                  and "/" not in args[0] and "\\" not in args[0]):
                args = ["--type", args[0], "--key", args[1]] + args[2:]
                run(script, [_posix(BASE_DIR)] + args)
            else:
                run(script, [_posix(BASE_DIR)] + args)
        else:
            run(script, [_posix(BASE_DIR)] + args)

    # --- JSON injection: read from stdin (heredoc), inject base_dir ---
    # Always heredoc — no inline arg path. One way to call it, no choices.
    # Pipes JSON to the downstream script via stdin (not argv) to avoid
    # Windows CreateProcess quote corruption on long or special-char payloads.
    elif tool in JSON_INJECT:
        if sys.stdin.isatty():
            print(f"{tool} reads JSON from stdin. Use a heredoc:\n"
                  f"  $UB {tool} <<'HANDOFF'\n"
                  f"  {{\"type\":\"...\", ...}}\n"
                  f"  HANDOFF", file=sys.stderr)
            sys.exit(1)
        raw = sys.stdin.read()
        try:
            data = _lenient_json(raw)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON: {e}", file=sys.stderr)
            sys.exit(1)
        if "base_dir" not in data:
            data["base_dir"] = _posix(BASE_DIR)
        else:
            data["base_dir"] = data["base_dir"].replace("\\", "/")
        data.setdefault("self_evolution", [])
        data.setdefault("meta_efficiency", "")
        _HANDOFF_MARKER.parent.mkdir(parents=True, exist_ok=True)
        _HANDOFF_MARKER.write_text(str(time.time()))
        try:
            rc = run(script, args, stdin_data=json.dumps(data), _return=True)
        finally:
            _HANDOFF_MARKER.unlink(missing_ok=True)
        sys.exit(rc)

    # --- write-temp: reads JSON from stdin (heredoc) or --from-file <path> ---
    elif tool == "write-temp":
        # Support: $UB write-temp <skill> <filename> --from-file <path>
        # This avoids heredoc quoting issues with large/complex JSON payloads.
        if len(args) == 4 and args[2] == "--from-file":
            from pathlib import Path as _Path
            import os as _os
            # Normalize POSIX paths (/tmp/...) to Windows paths on Windows
            _raw_path = args[3]
            if _raw_path.startswith("/") and _os.name == "nt":
                import tempfile as _tempfile
                _tmp = _tempfile.gettempdir()
                # /tmp/foo → <TEMP>\foo
                _raw_path = _os.path.join(_tmp, _raw_path.lstrip("/tmp/").lstrip("/"))
            src = _Path(_os.path.expandvars(_raw_path)).resolve()
            if not src.exists():
                print(f"--from-file: file not found: {src}", file=sys.stderr)
                sys.exit(1)
            raw = src.read_text(encoding="utf-8")
        elif sys.stdin.isatty():
            print(f"write-temp reads JSON from stdin or a file. Use a heredoc:\n"
                  f"  $UB write-temp <skill> <filename> <<'JSON'\n"
                  f"  {{\"key\": \"value\"}}\n"
                  f"  JSON\n"
                  f"Or use --from-file for large payloads:\n"
                  f"  $UB write-temp <skill> <filename> --from-file <path>", file=sys.stderr)
            sys.exit(1)
        else:
            raw = sys.stdin.read()
        try:
            json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON: {e}", file=sys.stderr)
            sys.exit(1)
        _HANDOFF_MARKER.parent.mkdir(parents=True, exist_ok=True)
        _HANDOFF_MARKER.write_text(str(time.time()))
        try:
            rc = run(script, [_posix(BASE_DIR)] + args, stdin_data=raw, _return=True)
        finally:
            _HANDOFF_MARKER.unlink(missing_ok=True)
        sys.exit(rc)

    # --- base_dir-first tools: always prepend ---
    elif tool in PREPEND_BASE:
        run(script, [_posix(BASE_DIR)] + args)

    # --- remember: passthrough (argparse handles everything, reads stdin) ---
    elif tool == "remember":
        run(script, args)

    # --- everything else: passthrough ---
    else:
        run(script, args)


if __name__ == "__main__":
    main()
