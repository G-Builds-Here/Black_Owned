"""
bb-fetch.py — Authenticated Bitbucket REST API fetcher (GPTS).

Like jira-fetch.py but for Bitbucket. Decrypts credentials internally via
read-cred.py — never exposes tokens in CLI args.

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --passphrase <pin>   REQUIRED  Decryption passphrase for Bitbucket credentials
    --url <url>          REQUIRED  Bitbucket Cloud REST URL (https://api.bitbucket.org/...)
    --output <path>      optional  Write the raw response to this file instead
                                   of embedding it in the envelope payload

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    success: {"ok": true, "status": "fetched", "url": ..., "bytes": N,
              "data": <Bitbucket response>}      (without --output)
            {"ok": true, "status": "fetched", "url": ..., "bytes": N,
             "output": "<path>"}                 (with --output; raw JSON -> file)
    failure: {"ok": false, "status": "error|precondition", "reason": ..., "fix": ...}

Behavior preserved from the legacy CLI (`bb-fetch.py <passphrase> <url>
[output_file]`):
    - Basic auth from BITBUCKET_USER/BITBUCKET_TOKEN via read-cred.py
    - raw response JSON to stdout by default
    - "OK: N bytes -> path" on --output (now on stderr, like jira-fetch)
    - credential decryption failure -> precondition (exit 3)

Examples:
    $UB bb-fetch --passphrase <pin> --url "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pullrequests?q=source.branch.name=%22feature%2FX%22"
    $UB bb-fetch --passphrase <pin> --url "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pullrequests/42" --output out.json
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

from toolkit import Tool, UsageError, Precondition, ToolError

# Force UTF-8 stdout on Windows (cp1252 chokes on Unicode in API responses)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SCRIPT_DIR = Path(__file__).parent

URL_RE = re.compile(r"^https://api\.bitbucket\.org/")


def get_cred(key, passphrase):
    """Decrypt a Bitbucket credential via read-cred.py (GPTS flag form).

    Raises Precondition (exit 3) when read-cred.py fails; never prints the
    credential value.
    """
    result = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "read-cred.py"),
         "--provider", "bitbucket", "--field", key, "--passphrase", passphrase],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"failed to decrypt bitbucket/{key}: {result.stderr.strip()}", file=sys.stderr)
        raise Precondition(
            f"failed to decrypt bitbucket/{key}: {result.stderr.strip()}",
            "establish a credential session (confirm-passphrase) or pass a valid --passphrase",
        )
    try:
        return str(json.loads(result.stdout)["value"])
    except (json.JSONDecodeError, KeyError, TypeError):
        raise Precondition(
            f"read-cred returned an unexpected payload for bitbucket/{key}",
            "re-run read-cred --check --passphrase <pin> to verify the credential session",
        )


def handle(v):
    passphrase = v["--passphrase"]
    url = v["--url"]
    output_file = v.get("--output")

    if not URL_RE.match(url):
        raise UsageError(
            f"URL {url!r} must be a Bitbucket Cloud REST URL",
            "pass --url \"https://api.bitbucket.org/2.0/...\" — see --help for the contract",
        )

    user = get_cred("BITBUCKET_USER", passphrase)
    token = get_cred("BITBUCKET_TOKEN", passphrase)
    auth = base64.b64encode(f"{user}:{token}".encode()).decode()

    req = urllib.request.Request(url, headers={
        "Authorization": f"Basic {auth}",
        "Accept": "application/json",
    })

    try:
        resp = urllib.request.urlopen(req)
        data = resp.read().decode()
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise ToolError(
            f"HTTP {e.code}: {body[:500]}",
            "check the URL, fields query, and credentials, then re-run bb-fetch with the same flags",
            code=1,
        )
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", None) or str(e)
        raise ToolError(
            f"URL error: {reason}",
            "check --url and network connectivity, then re-run bb-fetch with the same flags",
            code=1,
        )

    try:
        parsed = json.loads(data)
    except (json.JSONDecodeError, ValueError):
        parsed = data  # non-JSON response: embed the raw text

    if output_file:
        out = Path(output_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(data, encoding="utf-8")
        print(f"OK: {len(data)} bytes -> {output_file}", file=sys.stderr)
        return {"status": "fetched", "url": url, "bytes": len(data), "output": str(out)}

    return {"status": "fetched", "url": url, "bytes": len(data), "data": parsed}


TOOL = Tool(
    name="bb-fetch",
    version="2.0",
    summary="Authenticated Bitbucket REST API fetcher — GET a Bitbucket Cloud URL with internal Basic auth.",
    flags={
        "--passphrase": {"required": True, "type": "str",
                         "description": "Decryption passphrase for Bitbucket credentials (read-cred.py)."},
        "--url": {"required": True, "type": "str",
                  "description": "Bitbucket Cloud REST URL (must start with https://api.bitbucket.org/)."},
        "--output": {"required": False, "type": "path",
                     "description": "Optional file to write the raw response to; the envelope then carries 'output' instead of 'data'."},
    },
    exit_codes={
        "0": "fetched — payload carries the Bitbucket response ('data') or the written file ('output')",
        "1": "usage/validation error or Bitbucket HTTP error (http_code + truncated body in reason)",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
    },
    examples=[
        "$UB bb-fetch --passphrase <pin> --url \"https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pullrequests?q=source.branch.name=%22feature%2FX%22\"",
        "$UB bb-fetch --passphrase <pin> --url \"https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pullrequests/42\" --output out.json",
    ],
    idempotent="Read-only GET — safe to re-run; re-running repeats the fetch.",
)


if __name__ == "__main__":
    TOOL.run(handle)
