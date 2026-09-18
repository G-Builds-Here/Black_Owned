"""
jira-attach-file.py — Upload one or more local files as attachments to a Jira issue (GPTS).

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --passphrase <pin>     REQUIRED  Decryption passphrase for Jira credentials
    --issue-key <key>      REQUIRED  Jira issue key, e.g. PAY-7666
    --files <p1,p2,...>    REQUIRED  Comma-separated local file paths to attach
    --instance <url>       optional  Jira instance URL (default: read from assets/config.md)
    --base <path>          optional  Base dir for config + audit log (default: self-located)

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    success: {"ok": true, "status": "attached", "issue_key": "PAY-7666",
              "results": [{"file": "findings.md", "ok": true, "status_code": 200}, ...]}
    failure: {"ok": false, "status": "error|precondition|not_found",
              "reason": ..., "fix": ...}

Mutating tool: appends one audit line to <base>/logs/audit/audit.jsonl
(best-effort).

Behavior preserved from the legacy CLI
(`jira-attach-file.py <passphrase> <issue-key> <file1> [file2 ...] [--instance <url>]`):
    - multipart/form-data POST to /rest/api/3/issue/<key>/attachments with
      X-Atlassian-Token: no-check (required by the Jira attachment endpoint)
    - per-file mime sniffing (mimetypes), application/octet-stream fallback
    - all files are attempted; a Jira HTTP error on one file does not stop
      the remaining uploads
    - Jira HTTP errors -> exit 1 (status_code + truncated body per failed file)
    - credential decryption failure -> precondition (exit 3)

Examples:
    $UB jira-attach-file --passphrase <pin> --issue-key PAY-7666 --files findings.md,methodology.md
    $UB jira-attach-file --passphrase <pin> --issue-key PAY-7666 --files notes.md --instance https://procare.atlassian.net
"""
import sys
import io
import re
import json
import base64
import mimetypes
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

from toolkit import Tool, UsageError, NotFound, Precondition, ToolError, audit_append

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


def read_instance_from_config(base):
    """Read the Jira instance URL from <base>/assets/config.md."""
    config_path = Path(base) / "assets" / "config.md"
    if not config_path.exists():
        return None
    text = config_path.read_text(encoding="utf-8")
    match = re.search(r'\bInstance\b.*?(https://[^\s`"\']+)', text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip("/")
    return None


def upload_file(instance, issue_key, filepath, auth):
    """POST one file as a Jira attachment; return (ok, status_code, error)."""
    filename = filepath.name
    file_bytes = filepath.read_bytes()
    mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    boundary = "----JiraAttachBoundary"

    body = b""
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    body += f"Content-Type: {mime_type}\r\n\r\n".encode()
    body += file_bytes
    body += f"\r\n--{boundary}--\r\n".encode()

    url = f"{instance}/rest/api/3/issue/{issue_key}/attachments"
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Basic {auth}",
        "X-Atlassian-Token": "no-check",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    })

    try:
        resp = urllib.request.urlopen(req)
        return True, resp.status, None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return False, e.code, err_body[:500]
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", None) or str(e)
        return False, 0, f"URL error: {reason}"


def handle(v):
    passphrase = v["--passphrase"]
    issue_key = v["--issue-key"]
    files = v["--files"]
    base = v.get("--base") or str(BASE_DIR)

    instance = v.get("--instance")
    if instance:
        instance = instance.rstrip("/")
        if not re.match(r"^https?://", instance):
            raise UsageError(
                f"--instance {instance!r} must start with http:// or https://",
                "pass --instance <https://...>")

    if not files:
        raise UsageError("no files specified",
                         "pass --files <path>[,<path>...] with at least one file")

    resolved_paths = []
    for f in files:
        p = Path(f)
        if not p.exists():
            raise NotFound(f"file not found: {f}",
                           "pass --files with paths that exist on this machine")
        resolved_paths.append(p)

    if not instance:
        instance = read_instance_from_config(base)
    if not instance:
        raise UsageError(
            "Jira instance URL not found",
            "provide --instance <url> or set it in assets/config.md")

    user = get_cred("jira", "JIRA_USER", passphrase)
    token = get_cred("jira", "JIRA_TOKEN", passphrase)
    auth = base64.b64encode(f"{user}:{token}".encode()).decode()

    results = []
    for p in resolved_paths:
        ok, code, err = upload_file(instance, issue_key, p, auth)
        entry = {"file": p.name, "ok": ok, "status_code": code}
        if err:
            entry["error"] = err
        results.append(entry)

    failed = [r for r in results if not r["ok"]]
    if failed:
        detail = "; ".join(f"{r['file']} -> {r['status_code']} {r.get('error', '')}"
                           for r in failed)
        raise ToolError(
            f"attachment failed: {detail}",
            "check the files and Jira permissions, then re-run jira-attach-file with the same flags",
            code=1,
        )

    audit_append(base, "jira-attach-file", "attach", key=issue_key,
                 result=f"{len(results)}/{len(results)} attached")

    return {"status": "attached", "issue_key": issue_key, "results": results}


TOOL = Tool(
    name="jira-attach-file",
    version="1.0",
    summary="Upload one or more local files as Jira attachments (multipart POST, internal Basic auth).",
    flags={
        "--passphrase": {"required": True, "type": "str",
                         "description": "Decryption passphrase for Jira credentials (read-cred.py)."},
        "--issue-key": {"required": True, "type": "key",
                        "description": "Jira issue key, e.g. PAY-7666."},
        "--files": {"required": True, "type": "list",
                    "description": "Comma-separated local file paths to attach (file names must not contain commas)."},
        "--instance": {"required": False, "type": "str",
                       "description": "Jira instance URL; default: read from assets/config.md."},
    },
    exit_codes={
        "0": "attached — payload carries per-file results",
        "1": "usage/validation error or Jira HTTP error (status_code + truncated body per failed file)",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
        "4": "an attachment file was not found",
    },
    examples=[
        "$UB jira-attach-file --passphrase <pin> --issue-key PAY-7666 --files findings.md,methodology.md",
        "$UB jira-attach-file --passphrase <pin> --issue-key PAY-7666 --files notes.md --instance https://procare.atlassian.net",
    ],
    idempotent="No — each run adds new attachments to the issue.",
    base_default=BASE_DIR,
)


def main():
    TOOL.run(handle)


if __name__ == "__main__":
    main()
