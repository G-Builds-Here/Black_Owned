"""
post-bb-reply.py — Post reply comments to a Bitbucket PR (GPTS).

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --workspace <name>    REQUIRED  Bitbucket workspace name
    --repo <name>         REQUIRED  Repository slug
    --pr-id <n>           REQUIRED  Pull request id (integer)
    Auth (one of):
      --passphrase <pin>  REQUIRED  Decryption passphrase (read-cred.py)
      --user <email> + --token <token>   REQUIRED pair  Direct auth
                                               (paste mode; never echo the token)
    Single reply:
      --parent-id <n>     REQUIRED  Parent comment id (real id, never 0)
      --text <text>       REQUIRED  Reply body
    Batch:
      --batch             set       Read a JSON array from --file or stdin:
                                     [{"parent_id": 123, "text": "Fixed."}, ...]
      --file <path>       optional  Batch input file (default: stdin)

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    single:  {"ok": true, "status": "posted", "id": N, "response": {...}}
    batch:   {"ok": true, "status": "batch_completed", "posted": N,
              "failed": M, "results": [{"parent_id": N, "status": "ok"|"error",
                                        "message": "..."}, ...]}
    failure: {"ok": false, "status": "error|precondition", "reason": ..., "fix": ...}

Behavior preserved from the legacy CLI
(`post-bb-reply.py <workspace> <repo> <pr_id> <parent_id> <text>
--passphrase <pin>` / `--batch [--file replies.json]` / `--user <email>
--token <token>`):
    - threaded replies via POST .../pullrequests/<id>/comments with
      {"parent": {"id": <parent_id>}}
    - batch input from --file or stdin; per-item results keep the legacy
      shape (parent_id, status ok|error, "Comment N posted" message)
    - batch partial failure does not fail the call (results carry per-item
      status, exit 0) — legacy behavior
    - warning on stderr when the token does not start with 'ATATT3x'
    - auth conflict (both --passphrase and --user/--token) is now a usage
      error (legacy silently preferred --user/--token)

Used by: Harvey (Step 5 reply posting, Return Mode Procedure).
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


def get_creds_from_passphrase(passphrase):
    """Decrypt Bitbucket credentials via read-cred.py (GPTS flag form)."""

    def one(field):
        result = subprocess.run(
            [sys.executable, str(READ_CRED),
             "--provider", "bitbucket", "--field", field, "--passphrase", passphrase],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"failed to decrypt bitbucket/{field}: {result.stderr.strip()}",
                  file=sys.stderr)
            raise Precondition(
                f"failed to decrypt bitbucket/{field}: {result.stderr.strip()}",
                "pass a valid --passphrase, or use --user <email> --token <token> instead",
            )
        try:
            return str(json.loads(result.stdout)["value"])
        except (json.JSONDecodeError, KeyError, TypeError):
            raise Precondition(
                f"read-cred returned an unexpected payload for bitbucket/{field}",
                "re-run read-cred --check --passphrase <pin> to verify the credential session",
            )

    return one("BITBUCKET_USER"), one("BITBUCKET_TOKEN")


def make_auth_header(user, token):
    """Create Basic auth header."""
    creds = base64.b64encode(f"{user}:{token}".encode()).decode()
    return f"Basic {creds}"


def resolve_auth(v):
    """Resolve Basic auth from flags. Never echoes secrets."""
    user = v.get("--user")
    token = v.get("--token")
    passphrase = v.get("--passphrase")
    if passphrase and (user or token):
        raise UsageError(
            "ambiguous auth: --passphrase conflicts with --user/--token",
            "use either --passphrase <pin> OR --user <email> --token <token>",
        )
    if bool(user) != bool(token):
        raise UsageError(
            "--user and --token must be passed together",
            "pass both --user <email> --token <token>, or use --passphrase <pin>",
        )
    if user and token:
        return user, token
    if not passphrase:
        raise UsageError(
            "no auth provided",
            "pass --passphrase <pin> (read-cred.py) or --user <email> --token <token>",
        )
    return get_creds_from_passphrase(passphrase)


def post_reply(workspace, repo, pr_id, parent_id, text, auth_header):
    """Post a single reply to a PR comment. Returns (success, message)."""
    url = f"{API_BASE}/{workspace}/{repo}/pullrequests/{pr_id}/comments"
    payload = {"content": {"raw": text}, "parent": {"id": int(parent_id)}}
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": auth_header,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return True, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return False, {"status": e.code, "message": body}


def handle(v):
    workspace = v["--workspace"]
    repo = v["--repo"]
    pr_id = v["--pr-id"]
    base = Path(v.get("--base") or BASE_DIR)

    if not WORKSPACE_RE.match(workspace):
        raise UsageError(f"--workspace value {workspace!r} is not a valid workspace name",
                         "pass --workspace <Bitbucket workspace name>")
    if not REPO_RE.match(repo):
        raise UsageError(f"--repo value {repo!r} is not a valid repo slug",
                         "pass --repo <repository slug>")

    batch = bool(v.get("--batch"))
    if batch and (v.get("--parent-id") is not None or v.get("--text")):
        raise UsageError(
            "--batch does not take --parent-id/--text",
            "batch reads [{\"parent_id\": N, \"text\": \"...\"}] from --file or stdin; "
            "for one reply drop --batch and pass --parent-id <id> --text <reply>",
        )
    if not batch and (v.get("--parent-id") is None or not v.get("--text")):
        raise UsageError(
            "single reply mode requires --parent-id and --text",
            "pass --parent-id <comment id> --text <reply>, or use --batch for a JSON array",
        )

    user, token = resolve_auth(v)
    if not token.startswith("ATATT3x"):
        print("Warning: token doesn't start with 'ATATT3x' — may be invalid", file=sys.stderr)
    auth_header = make_auth_header(user, token)

    key = f"{workspace}/{repo}/pullrequests/{pr_id}"
    if batch:
        batch_file = v.get("--file")
        if batch_file:
            try:
                with open(batch_file, "r", encoding="utf-8") as f:
                    replies = json.load(f)
            except FileNotFoundError:
                raise UsageError(f"batch file not found: {batch_file}",
                                 f"pass --file <path> to an existing replies JSON array, or pipe the array via stdin")
            except (json.JSONDecodeError, ValueError) as e:
                raise UsageError(f"invalid JSON in {batch_file}: {e}",
                                 "pass --file <path> to a JSON array of {\"parent_id\": N, \"text\": \"...\"}")
        else:
            try:
                replies = json.load(sys.stdin)
            except (json.JSONDecodeError, ValueError) as e:
                raise UsageError(f"invalid JSON on stdin: {e}",
                                 "pipe a JSON array of {\"parent_id\": N, \"text\": \"...\"}, or pass --file <path>")
        if not isinstance(replies, list):
            raise UsageError("batch input must be a JSON array",
                             "pass an array of {\"parent_id\": N, \"text\": \"...\"}")
        results = []
        for reply in replies:
            try:
                parent_id = reply["parent_id"]
                text = reply["text"]
            except (KeyError, TypeError):
                raise UsageError(
                    f"batch item missing 'parent_id' or 'text': {reply!r}",
                    "each batch item must be {\"parent_id\": N, \"text\": \"...\"}",
                )
            ok, msg = post_reply(workspace, repo, pr_id, parent_id, text, auth_header)
            results.append({
                "parent_id": parent_id,
                "status": "ok" if ok else "error",
                "message": msg if not ok else f"Comment {msg.get('id', '?')} posted",
            })
        posted = sum(1 for r in results if r["status"] == "ok")
        audit_append(base, "post-bb-reply", "post_reply_batch",
                     key=key, result=f"batch_completed_{posted}_{len(results)}")
        return {
            "status": "batch_completed",
            "posted": posted,
            "failed": len(results) - posted,
            "results": results,
        }

    parent_id = v["--parent-id"]
    text = v["--text"]
    ok, msg = post_reply(workspace, repo, pr_id, parent_id, text, auth_header)
    if ok:
        audit_append(base, "post-bb-reply", "post_reply", key=key, result="posted")
        return {"status": "posted", "id": msg.get("id"), "response": msg}
    audit_append(base, "post-bb-reply", "post_reply",
                 key=key, result=f"failed_http_{msg.get('status')}")
    detail = str(msg.get("message", ""))[:500]
    raise ToolError(
        f"HTTP {msg.get('status')}: {detail}",
        f"check --parent-id {parent_id} exists on PR {pr_id} and credentials, then re-run post-bb-reply",
        code=1,
    )


TOOL = Tool(
    name="post-bb-reply",
    version="2.0",
    summary="Post threaded reply comment(s) on a Bitbucket PR — single reply or JSON batch.",
    flags={
        "--workspace": {"required": True, "type": "str",
                        "description": "Bitbucket workspace name."},
        "--repo": {"required": True, "type": "str",
                   "description": "Repository slug."},
        "--pr-id": {"required": True, "type": "int",
                    "description": "Pull request id (integer)."},
        "--passphrase": {"required": False, "type": "str",
                         "description": "Decryption passphrase for Bitbucket credentials (read-cred.py). One of this or --user/--token is required."},
        "--user": {"required": False, "type": "str",
                   "description": "Direct-auth Bitbucket user email (paste mode; use with --token)."},
        "--token": {"required": False, "type": "str",
                    "description": "Direct-auth Bitbucket app token (paste mode; use with --user)."},
        "--parent-id": {"required": False, "type": "int",
                        "description": "Parent comment id for single-reply mode (real id, never 0)."},
        "--text": {"required": False, "type": "str",
                   "description": "Reply body for single-reply mode."},
        "--batch": {"required": False, "type": "bool",
                    "description": "Batch mode: read a JSON array from --file or stdin."},
        "--file": {"required": False, "type": "path",
                   "description": "Batch input file (JSON array of {\"parent_id\": N, \"text\": \"...\"}); default stdin."},
    },
    exit_codes={
        "0": "posted / batch_completed — payload carries the posted comment(s)",
        "1": "usage/validation error, auth conflict, or Bitbucket HTTP error (http_code + truncated body in reason)",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
    },
    examples=[
        "$UB post-bb-reply --passphrase <pin> --workspace acme --repo app --pr-id 42 --parent-id 1234 --text \"Fixed — see commit abc123\"",
        "$UB post-bb-reply --passphrase <pin> --workspace acme --repo app --pr-id 42 --batch --file replies.json",
        "echo \"[{\\\"parent_id\\\": 1234, \\\"text\\\": \\\"Fixed.\\\"}]\" | $UB post-bb-reply --passphrase <pin> --workspace acme --repo app --pr-id 42 --batch",
    ],
    idempotent="Not idempotent — each run posts new comment(s). Batch partial failure still exits 0; per-item status in 'results'.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
