"""
fetch-bb-comments.py — Fetch PR comments from Bitbucket with pagination and
deduplication (GPTS).

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --workspace <name>   REQUIRED  Bitbucket workspace name
    --repo <name>        REQUIRED  Repository slug
    --pr-id <n>          REQUIRED  Pull request id (integer)
    Auth (one of):
      --passphrase <pin> REQUIRED  Decryption passphrase (read-cred.py)
      --user <email> + --token <token>   REQUIRED pair  Direct auth
    --count-only         optional  Return only the total count

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    default:    {"ok": true, "status": "fetched", "count": N, "comments": [...]}
    --count-only: {"ok": true, "status": "counted", "size": N}
    failure:    {"ok": false, "status": "error|precondition", "reason": ..., "fix": ...}

Deduplication: comments are deduplicated by id after merging pages (cursor
drift can cause duplicates across pages if comments are posted mid-fetch).

Note: the 'comments' array is the raw API comment objects — pass this file's
stdout (or a saved copy) to classify-pr-comments, which accepts this
envelope, the raw API response ("values"), or a plain array.

Behavior preserved from the legacy CLI
(`fetch-bb-comments.py <workspace> <repo> <pr_id> --passphrase <pin>
[--count-only]` / `--user <email> --token <token>`):
    - pagination via "next" cursor, pagelen=100
    - count-only mode uses pagelen=1 and reports total size
    - ATATT3x token-shape warning on stderr
    - auth conflict (both --passphrase and --user/--token) is now a usage
      error (legacy silently preferred --user/--token)

Used by: Harvey (Steps 0 and 1), Blackgate (Step 3).
"""

import json
import os
import subprocess
import sys
import urllib.request
import base64

from toolkit import Tool, UsageError, Precondition, ToolError

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
READ_CRED = os.path.join(TOOLS_DIR, "read-cred.py")
API_BASE = "https://api.bitbucket.org/2.0/repositories"


def get_creds_from_passphrase(passphrase):
    """Decrypt Bitbucket credentials via read-cred.py (GPTS flag form).

    read-cred prints a JSON envelope; the plaintext is its "value" field.
    """

    def one(field):
        result = subprocess.run(
            [sys.executable, READ_CRED,
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


def fetch_url(url, auth_header):
    """Fetch a URL with auth. Returns parsed JSON or raises."""
    req = urllib.request.Request(url, headers={"Authorization": auth_header})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise ToolError(
            f"HTTP {e.code}: {body[:500]}",
            "check the workspace/repo/pr id and credentials, then re-run fetch-bb-comments with the same flags",
            code=1,
        )


def fetch_all_comments(workspace, repo, pr_id, auth_header):
    """Fetch all comments with pagination, deduplicate by ID."""
    url = f"{API_BASE}/{workspace}/{repo}/pullrequests/{pr_id}/comments?pagelen=100"
    seen_ids = set()
    all_comments = []

    while url:
        data = fetch_url(url, auth_header)
        for comment in data.get("values", []):
            cid = comment.get("id")
            if cid not in seen_ids:
                seen_ids.add(cid)
                all_comments.append(comment)
        url = data.get("next")

    return all_comments


def fetch_count_only(workspace, repo, pr_id, auth_header):
    """Fetch with pagelen=1 to get just the total size."""
    url = f"{API_BASE}/{workspace}/{repo}/pullrequests/{pr_id}/comments?pagelen=1"
    data = fetch_url(url, auth_header)
    return data.get("size", 0)


def handle(v):
    workspace = v["--workspace"]
    repo = v["--repo"]
    pr_id = v["--pr-id"]
    count_only = bool(v.get("--count-only"))

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
        pass  # already have them
    elif passphrase:
        user, token = get_creds_from_passphrase(passphrase)
    else:
        raise UsageError(
            "no auth provided",
            "pass --passphrase <pin> (read-cred.py) or --user <email> --token <token>",
        )

    # Validate token shape
    if not token.startswith("ATATT3x"):
        print("Warning: BITBUCKET_TOKEN doesn't start with 'ATATT3x' — may be invalid", file=sys.stderr)

    if count_only:
        size = fetch_count_only(workspace, repo, pr_id, make_auth_header(user, token))
        return {"status": "counted", "workspace": workspace, "repo": repo,
                "pr_id": pr_id, "size": size}

    comments = fetch_all_comments(workspace, repo, pr_id, make_auth_header(user, token))
    return {"status": "fetched", "workspace": workspace, "repo": repo,
            "pr_id": pr_id, "count": len(comments), "comments": comments}


TOOL = Tool(
    name="fetch-bb-comments",
    version="2.0",
    summary="Fetch all Bitbucket PR comments (paginated, deduplicated) or just the total count.",
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
        "--count-only": {"required": False, "type": "bool",
                         "description": "Return only the total comment count ({\"size\": N})."},
    },
    exit_codes={
        "0": "fetched (payload carries 'comments') or counted (payload carries 'size')",
        "1": "usage/validation error, auth conflict, or Bitbucket HTTP error (http_code + truncated body in reason)",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
    },
    examples=[
        "$UB fetch-bb-comments --passphrase <pin> --workspace acme --repo app --pr-id 42",
        "$UB fetch-bb-comments --passphrase <pin> --workspace acme --repo app --pr-id 42 --count-only",
        "$UB fetch-bb-comments --user <email> --token <token> --workspace acme --repo app --pr-id 42",
    ],
    idempotent="Read-only GET — safe to re-run; re-running repeats the fetch.",
)


if __name__ == "__main__":
    TOOL.run(handle)
