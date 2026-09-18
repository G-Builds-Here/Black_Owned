"""
jira-fetch.py — Authenticated Jira REST API fetcher (GPTS).

Like azdo-fetch.py but for Jira. Decrypts credentials internally via
read-cred.py — never exposes tokens in CLI args.

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --passphrase <pin>   REQUIRED  Decryption passphrase for Jira credentials
    --url <url>          REQUIRED  Jira REST API URL (http/https)
    --output <path>      optional  Write the raw response to this file instead
                                   of embedding it in the envelope payload
    --data <json>        optional  JSON body -> sends POST instead of GET
                                   (e.g. changelog/bulkfetch issueIdsOrKeys)

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    success: {"ok": true, "status": "fetched", "url": ..., "bytes": N,
              "data": <Jira response>}      (without --output)
            {"ok": true, "status": "fetched", "url": ..., "bytes": N,
              "output": "<path>"}           (with --output; raw JSON -> file)
    failure: {"ok": false, "status": "error|precondition", "reason": ...,
              "fix": ...}

Behavior preserved from the legacy CLI (`jira-fetch.py <passphrase> <url>
[output_file]`):
    - /rest/api/3/search auto-migrates to /rest/api/3/search/jql (410 since 2026-04)
    - Basic auth from JIRA_USER/JIRA_TOKEN via read-cred.py
    - legacy exit 1 is kept for Jira HTTP errors (http_code + body in reason)
    - credential decryption failure -> precondition (exit 3)

Examples:
    $UB jira-fetch --passphrase <pin> --url "https://procare.atlassian.net/rest/api/3/search/jql?jql=..."
    $UB jira-fetch --passphrase <pin> --url "https://procare.atlassian.net/rest/api/3/issue/PAY-1234/changelog" --output out.json
    $UB jira-fetch --passphrase <pin> --url "https://procare.atlassian.net/rest/api/3/changelog/bulkfetch" --data '{"issueIdsOrKeys":["10001","10002"],"fieldIds":["status"]}'
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

# Force UTF-8 stdout on Windows (cp1252 chokes on Unicode in Jira responses)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SCRIPT_DIR = Path(__file__).parent


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


def handle(v):
    passphrase = v["--passphrase"]
    url = v["--url"]
    output_file = v.get("--output")
    data_arg = v.get("--data")

    if not re.match(r"^https?://", url):
        raise UsageError(
            f"URL {url!r} must start with http:// or https://",
            "pass --url <https://...> — see --help for the contract",
        )

    # Auto-migrate deprecated /rest/api/3/search -> /rest/api/3/search/jql (410 since 2026-04)
    url = re.sub(r'/rest/api/3/search(?!/jql)\b', '/rest/api/3/search/jql', url)

    body = None
    if data_arg is not None:
        try:
            json.loads(data_arg)  # validate it's well-formed JSON before sending
        except (json.JSONDecodeError, ValueError) as e:
            raise UsageError(
                f"--data is not valid JSON: {e}",
                "pass a JSON object string, e.g. --data '{\"issueIdsOrKeys\":[\"10001\"]}'",
            )
        body = data_arg.encode()

    user = get_cred("jira", "JIRA_USER", passphrase)
    token = get_cred("jira", "JIRA_TOKEN", passphrase)
    auth = base64.b64encode(f"{user}:{token}".encode()).decode()

    headers = {
        "Authorization": f"Basic {auth}",
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=headers, method="POST" if body is not None else "GET")

    try:
        resp = urllib.request.urlopen(req)
        data = resp.read().decode()
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise ToolError(
            f"HTTP {e.code}: {body[:500]}",
            "check the URL, fields query, and credentials, then re-run jira-fetch with the same flags",
            code=1,
        )
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", None) or str(e)
        raise ToolError(
            f"URL error: {reason}",
            "check --url and network connectivity, then re-run jira-fetch with the same flags",
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
    name="jira-fetch",
    version="2.0",
    summary="Authenticated Jira REST API fetcher — GET a Jira URL with internal Basic auth.",
    flags={
        "--passphrase": {"required": True, "type": "str",
                         "description": "Decryption passphrase for Jira credentials (read-cred.py)."},
        "--url": {"required": True, "type": "str",
                  "description": "Jira REST API URL (http/https). /rest/api/3/search auto-migrates to /rest/api/3/search/jql."},
        "--output": {"required": False, "type": "path",
                     "description": "Optional file to write the raw response to; the envelope then carries 'output' instead of 'data'."},
        "--data": {"required": False, "type": "str",
                   "description": "JSON body — presence switches the request from GET to POST (e.g. changelog/bulkfetch)."},
    },
    exit_codes={
        "0": "fetched — payload carries the Jira response ('data') or the written file ('output')",
        "1": "usage/validation error or Jira HTTP error (http_code + truncated body in reason)",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
    },
    examples=[
        "$UB jira-fetch --passphrase <pin> --url \"https://procare.atlassian.net/rest/api/3/search/jql?jql=...\"",
        "$UB jira-fetch --passphrase <pin> --url \"https://procare.atlassian.net/rest/api/3/issue/PAY-1234/changelog\" --output out.json",
    ],
    idempotent="GET is safe to re-run. POST (via --data) is idempotent only for read-style bulk endpoints like changelog/bulkfetch — do not use --data against write endpoints.",
)


def main():
    TOOL.run(handle)


if __name__ == "__main__":
    main()
