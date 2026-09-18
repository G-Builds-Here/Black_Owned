"""
bb-post-comment.py — Post a top-level comment on a Bitbucket PR (GPTS).

Not a reply — use post-bb-reply.py for threaded replies to an existing
comment (requires a real parent id, never 0).

Decrypts credentials internally via read-cred.py — never exposes tokens in
CLI args.

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --passphrase <pin>   REQUIRED  Decryption passphrase for Bitbucket credentials
    --workspace <name>   REQUIRED  Bitbucket workspace name
    --repo <name>        REQUIRED  Repository slug
    --pr-id <n>          REQUIRED  Pull request id (integer)
    --text <text>        REQUIRED  Comment body (markdown, JSON-safe encoded)

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    success: {"ok": true, "status": "posted", "id": N, "response": {...}}
    failure: {"ok": false, "status": "error|precondition", "reason": ..., "fix": ...}

Examples:
    $UB bb-post-comment --passphrase <pin> --workspace acme --repo app --pr-id 42 --text "@agent review this"
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

from toolkit import Tool, UsageError, Precondition, ToolError, audit_append

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

TOOLS_DIR = Path(__file__).parent
BASE_DIR = TOOLS_DIR.parent
READ_CRED = TOOLS_DIR / "read-cred.py"
API_BASE = "https://api.bitbucket.org/2.0/repositories"

WORKSPACE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def get_cred(key, passphrase):
    """Decrypt a Bitbucket credential via read-cred.py (GPTS flag form)."""
    result = subprocess.run(
        [sys.executable, str(READ_CRED),
         "--provider", "bitbucket", "--field", key, "--passphrase", passphrase],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"failed to decrypt {key}: {result.stderr.strip()}", file=sys.stderr)
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
    workspace = v["--workspace"]
    repo = v["--repo"]
    pr_id = v["--pr-id"]
    text = v["--text"]
    base = Path(v.get("--base") or BASE_DIR)

    if not WORKSPACE_RE.match(workspace):
        raise UsageError(f"--workspace value {workspace!r} is not a valid workspace name",
                         "pass --workspace <Bitbucket workspace name>")
    if not REPO_RE.match(repo):
        raise UsageError(f"--repo value {repo!r} is not a valid repo slug",
                         "pass --repo <repository slug>")
    if not text.strip():
        raise UsageError("--text must not be empty", "pass --text <comment body>")

    user = get_cred("BITBUCKET_USER", passphrase)
    token = get_cred("BITBUCKET_TOKEN", passphrase)
    creds = base64.b64encode(f"{user}:{token}".encode()).decode()

    url = f"{API_BASE}/{workspace}/{repo}/pullrequests/{pr_id}/comments"
    payload = {"content": {"raw": text}}
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Basic {creds}"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        audit_append(base, "bb-post-comment", "post_comment",
                     key=f"{workspace}/{repo}/pullrequests/{pr_id}",
                     result=f"failed_http_{e.code}")
        raise ToolError(
            f"HTTP {e.code}: {err_body[:500]}",
            "check the pr id and credentials, then re-run bb-post-comment with the same flags",
            code=1,
        )

    audit_append(base, "bb-post-comment", "post_comment",
                 key=f"{workspace}/{repo}/pullrequests/{pr_id}", result="posted")
    return {"status": "posted", "id": body.get("id"), "response": body}


TOOL = Tool(
    name="bb-post-comment",
    version="2.0",
    summary="Post a top-level comment on a Bitbucket PR (bot trigger / general comment — not a reply).",
    flags={
        "--passphrase": {"required": True, "type": "str",
                         "description": "Decryption passphrase for Bitbucket credentials (read-cred.py)."},
        "--workspace": {"required": True, "type": "str",
                        "description": "Bitbucket workspace name."},
        "--repo": {"required": True, "type": "str",
                   "description": "Repository slug."},
        "--pr-id": {"required": True, "type": "int",
                    "description": "Pull request id (integer)."},
        "--text": {"required": True, "type": "str",
                   "description": "Comment body (markdown)."},
    },
    exit_codes={
        "0": "posted — payload carries the comment id and full API response",
        "1": "usage/validation error or Bitbucket HTTP error (http_code + truncated body in reason)",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
    },
    examples=[
        "$UB bb-post-comment --passphrase <pin> --workspace acme --repo app --pr-id 42 --text \"@agent review this\"",
    ],
    idempotent="Not idempotent — each run posts a new comment.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
