"""
jira-write.py — Authenticated Jira REST API writer (GPTS).

PUT/POST companion to jira-fetch.py. Decrypts credentials internally via
read-cred.py — never exposes tokens in CLI args.

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --passphrase <pin>    REQUIRED  Decryption passphrase for Jira credentials
    --method <PUT|POST>   REQUIRED  HTTP method
    --url <url>           REQUIRED  Jira REST API URL (http/https)
    --data-file <path|->  optional  Request body JSON file; "-" = stdin (default)
    --base <path>         optional  Base dir for the audit log (default: self-located)

Auto-detects ADF input: if the JSON payload has a "sections" key, it runs
build-adf-json.py conversion automatically and wraps it in
{"fields": {"description": <adf>}}. No temp files needed — use stdin.
Payloads with a "fields" key: any field value carrying a "sections" key is
converted in place.

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    success: {"ok": true, "status": "written", "method": ..., "url": ...,
              "http_status": N, "body": <response JSON or raw text>}
    failure: {"ok": false, "status": "error|precondition|not_found",
              "reason": ..., "fix": ...}

Mutating tool: appends one audit line to <base>/logs/audit/audit.jsonl
(best-effort).

Behavior preserved from the legacy CLI
(`jira-write.py <passphrase> <method> <url> <data_file|->`):
    - ADF sections auto-detection and wrapping
    - Jira HTTP errors -> exit 1 (http_code + truncated body in reason)
    - credential decryption failure -> precondition (exit 3)

Examples:
    $UB jira-write --passphrase <pin> --method PUT --url "https://procare.atlassian.net/rest/api/3/issue/PAY-1234" --data-file payload.json
    $UB jira-write --passphrase <pin> --method POST --url "https://procare.atlassian.net/rest/api/3/issue/PAY-1234/comment" --data-file -
    (heredoc into stdin: {"sections":[{"type":"paragraph","text":"Comment text"}]})
"""
import sys
import io
import json
import re
import subprocess
import urllib.request
import urllib.error
import base64
from pathlib import Path

from toolkit import Tool, UsageError, Precondition, NotFound, ToolError, audit_append

# Force UTF-8 stdout on Windows (cp1252 chokes on Unicode in Jira responses)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent


def get_cred(provider, field, passphrase):
    """Decrypt a credential via read-cred.py (GPTS envelope contract).

    Calls `read-cred.py --provider <p> --field <f> --passphrase <pin>` and
    reads the plaintext from the envelope's "value". Raises Precondition
    (exit 3) when decryption fails; never prints the credential value.
    """
    result = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "read-cred.py"),
         "--provider", provider, "--field", field, "--passphrase", passphrase],
        capture_output=True, text=True,
    )
    reason = f"failed to decrypt {provider}/{field}: {result.stderr.strip() or 'no stderr'}"
    fix = "establish a credential session (confirm-passphrase) or pass a valid --passphrase"
    try:
        doc = json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError):
        doc = None
    if isinstance(doc, dict):
        if doc.get("ok") is True and doc.get("value") is not None:
            return doc["value"]
        reason = doc.get("reason") or reason
        fix = doc.get("fix") or fix
    print(f"Failed to decrypt {provider}/{field}: {reason}", file=sys.stderr)
    raise Precondition(reason, fix)


def build_adf(sections_data):
    """Import build-adf-json.py and convert a sections dict to an ADF document."""
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("build_adf", str(SCRIPT_DIR / "build-adf-json.py"))
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.build_adf(sections_data)


def handle(v):
    passphrase = v["--passphrase"]
    method = v["--method"]
    url = v["--url"]
    data_file = v.get("--data-file") or "-"
    base = v.get("--base") or str(BASE_DIR)

    if not re.match(r"^https?://", url):
        raise UsageError(
            f"URL {url!r} must start with http:// or https://",
            "pass --url <https://...> — see --help for the contract",
        )

    user = get_cred("jira", "JIRA_USER", passphrase)
    token = get_cred("jira", "JIRA_TOKEN", passphrase)
    auth = base64.b64encode(f"{user}:{token}".encode()).decode()

    # Read payload
    if data_file == "-":
        payload = sys.stdin.buffer.read()
        if not payload:
            raise UsageError("--data-file - given but stdin is empty",
                             "pipe the JSON payload into stdin, or pass --data-file <path>")
    else:
        p = Path(data_file)
        if not p.exists():
            raise NotFound(f"payload file not found: {data_file}",
                           "pass --data-file <existing JSON file> or - for stdin")
        payload = p.read_bytes()

    # Auto-detect ADF input (preserved from legacy behavior)
    try:
        parsed = json.loads(payload)
        if isinstance(parsed, dict) and "sections" in parsed:
            adf = build_adf(parsed)
            payload = json.dumps({"fields": {"description": adf}}, ensure_ascii=False).encode("utf-8")
        elif isinstance(parsed, dict) and "fields" in parsed:
            # Already wrapped -- check if any field value has a "sections" key and convert it
            fields = parsed["fields"]
            changed = False
            for key, val in fields.items():
                if isinstance(val, dict) and "sections" in val:
                    fields[key] = build_adf(val)
                    changed = True
            if changed:
                payload = json.dumps(parsed, ensure_ascii=False).encode("utf-8")
    except (json.JSONDecodeError, ValueError):
        pass  # non-JSON payload: send as-is

    req = urllib.request.Request(url, data=payload, method=method, headers={
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })

    try:
        resp = urllib.request.urlopen(req)
        status = resp.status
        body_raw = resp.read().decode() if resp.length else ""
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise ToolError(
            f"HTTP {e.code}: {body[:500]}",
            "check the URL, payload, and Jira permissions, then re-run jira-write with the same flags",
            code=1,
        )
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", None) or str(e)
        raise ToolError(
            f"URL error: {reason}",
            "check --url and network connectivity, then re-run jira-write with the same flags",
            code=1,
        )

    try:
        body = json.loads(body_raw)
    except (json.JSONDecodeError, ValueError):
        body = body_raw  # non-JSON response: embed the raw text

    key_m = re.search(r"/issue/([A-Z][A-Z0-9]*-\d{3,4})", url)
    audit_append(base, "jira-write", method.lower(), key=key_m.group(1) if key_m else None,
                 result=f"HTTP {status}")

    return {"status": "written", "method": method, "url": url, "http_status": status, "body": body}


TOOL = Tool(
    name="jira-write",
    version="1.0",
    summary="Authenticated Jira REST API writer — PUT/POST a JSON payload with internal Basic auth.",
    flags={
        "--passphrase": {"required": True, "type": "str",
                         "description": "Decryption passphrase for Jira credentials (read-cred.py)."},
        "--method": {"required": True, "type": "choice", "choices": ["PUT", "POST"],
                     "description": "HTTP method to send."},
        "--url": {"required": True, "type": "str",
                  "description": "Jira REST API URL (http/https)."},
        "--data-file": {"required": False, "type": "path", "default": "-",
                        "description": "Request body JSON file; '-' reads stdin (heredoc). Payloads with a 'sections' key auto-convert to ADF."},
    },
    exit_codes={
        "0": "written — payload carries http_status + response body",
        "1": "usage/validation error, Jira HTTP error (http_code + truncated body in reason), or network error",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
        "4": "payload file not found",
    },
    examples=[
        "$UB jira-write --passphrase <pin> --method PUT --url \"https://procare.atlassian.net/rest/api/3/issue/PAY-1234\" --data-file payload.json",
        "$UB jira-write --passphrase <pin> --method POST --url \"https://procare.atlassian.net/rest/api/3/issue/PAY-1234/comment\" --data-file -   # heredoc JSON on stdin",
    ],
    idempotent="PUT of the same payload is safe to re-run (last write wins); POST creates a new resource on each call (e.g. a comment).",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
