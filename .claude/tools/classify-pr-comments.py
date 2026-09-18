"""
classify-pr-comments.py — Classify PR comments into bot vs human, resolved
vs unresolved (GPTS).

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --file <path>    REQUIRED  Comments JSON file, or '-' for stdin
    --author <name>  optional  PR author display name — author comments are
                               excluded from the actionable count

Input: Bitbucket PR comments JSON — one of:
    - raw API response ({"values": [...]}),
    - the fetch-bb-comments envelope ({"ok": true, ..., "comments": [...]}),
    - a plain array of comment objects.
  Supports merged paginated responses.

Output: exactly one JSON document on stdout:
{"ok": true, "status": "classified",
  "total": 15, "bot": 6, "bot_triggers": 1, "author": 0, "human": 9,
  "human_resolved": 4, "human_unresolved": 5, "actionable": 5,
  "bot_authors": ["Rovo Dev", "sonarcloud[bot]"], "pr_author": "unknown",
  "threads": [
    {"id": 123, "author": "jsmith", "is_bot": false, "is_pr_author": false,
     "is_bot_trigger": false, "resolved": false, "snippet": "This logic..."}
  ]}

"actionable" = human_unresolved (non-bot, non-resolved, non-deleted
top-level comments, excluding PR-author comments when --author is given).
"threads" lists only top-level comments (no parent) — replies are threaded
under them.

Behavior preserved from the legacy CLI
(`classify-pr-comments.py <comments_json_file | -> [--author 'Name']`):
    - bot author/content/trigger detection (same patterns as Harvey)
    - all count fields and the threads list, field-for-field
    - no auth needed

Used by: Blackgate (Step 3b comment resolution), Harvey (Step 3 bot/human
split).
"""

import json
import re
import sys

from toolkit import Tool, UsageError, NotFound


# Bot author patterns — same as Harvey's detection logic
BOT_NAME_EXACT = {"bot"}
BOT_NAME_SUFFIXES = {"-bot", "[bot]"}
BOT_KNOWN_AUTHORS = {
    "sonarcloud",
    "codeclimate",
    "dependabot",
    "renovate",
    "rovo dev",
}

# Bot content patterns
BOT_CONTENT_PATTERNS = [
    re.compile(r"\U0001F916"),  # 🤖 emoji
    re.compile(r"AI Code Review Summary", re.IGNORECASE),
    re.compile(r"AI Code Review \u2022", re.IGNORECASE),  # AI Code Review •
]

# Bot trigger patterns — human comments that are just invoking a bot, not real review feedback
BOT_TRIGGER_PATTERN = re.compile(r"^\s*@\w+\s", re.IGNORECASE)


def is_bot_author(display_name):
    """Check if a comment author is a bot based on name patterns."""
    if not display_name:
        return False
    name_lower = display_name.lower().strip()

    if name_lower in BOT_NAME_EXACT:
        return True
    for suffix in BOT_NAME_SUFFIXES:
        if name_lower.endswith(suffix):
            return True
    for known in BOT_KNOWN_AUTHORS:
        if known in name_lower:
            return True
    return False


def is_bot_content(raw_content):
    """Check if comment content matches bot patterns."""
    if not raw_content:
        return False
    for pattern in BOT_CONTENT_PATTERNS:
        if pattern.search(raw_content):
            return True
    return False


def classify_comments(comments, pr_author=None):
    """Classify a list of Bitbucket PR comment objects.

    Args:
        comments: list of Bitbucket comment objects
        pr_author: display name of the PR author (optional). If provided,
                   author comments are excluded from the actionable count —
                   only reviewer comments count as actionable.
    """
    # Filter to top-level comments only (no parent = thread starter)
    top_level = [c for c in comments if not c.get("parent")]

    # Filter out deleted comments
    top_level = [c for c in top_level if not c.get("deleted", False)]

    total = len(top_level)
    bot_count = 0
    bot_trigger_count = 0
    author_count = 0
    human_resolved = 0
    human_unresolved = 0
    bot_authors = set()
    threads = []

    pr_author_lower = pr_author.lower().strip() if pr_author else None

    for comment in top_level:
        author_name = ""
        author = comment.get("author") or comment.get("user")
        if author:
            author_name = author.get("display_name", "") or author.get("nickname", "")

        raw_content = ""
        content = comment.get("content")
        if content:
            raw_content = content.get("raw", "")

        is_bot = is_bot_author(author_name) or is_bot_content(raw_content)
        is_pr_author = (pr_author_lower and author_name.lower().strip() == pr_author_lower)
        is_bot_trigger = bool(not is_bot and BOT_TRIGGER_PATTERN.match(raw_content))
        is_resolved = comment.get("resolved", False)
        comment_id = comment.get("id", 0)
        snippet = raw_content[:80].replace("\n", " ").strip() if raw_content else ""

        if is_bot:
            bot_count += 1
            bot_authors.add(author_name)
        elif is_pr_author:
            author_count += 1
        elif is_bot_trigger:
            bot_trigger_count += 1
        elif is_resolved:
            human_resolved += 1
        else:
            human_unresolved += 1

        threads.append({
            "id": comment_id,
            "author": author_name,
            "is_bot": is_bot,
            "is_pr_author": is_pr_author,
            "is_bot_trigger": is_bot_trigger,
            "resolved": is_resolved,
            "snippet": snippet,
        })

    human = total - bot_count
    actionable = human_unresolved  # excludes bots, PR author, and resolved

    return {
        "total": total,
        "bot": bot_count,
        "bot_triggers": bot_trigger_count,
        "author": author_count,
        "human": human,
        "human_resolved": human_resolved,
        "human_unresolved": human_unresolved,
        "actionable": actionable,
        "bot_authors": sorted(bot_authors),
        "pr_author": pr_author or "unknown",
        "threads": threads,
    }


def _extract_comments(data, source):
    """Accept raw API response, fetch-bb-comments envelope, or plain array."""
    if isinstance(data, dict):
        if "values" in data:
            comments = data["values"]
        elif "comments" in data:
            comments = data["comments"]
        else:
            raise UsageError(
                f"{source}: expected a JSON array, or an object with 'values' or 'comments' key",
                "pass --file <path> to Bitbucket comment JSON (raw API response, fetch-bb-comments output, or a plain array)",
            )
    elif isinstance(data, list):
        comments = data
    else:
        raise UsageError(
            f"{source}: expected JSON array or object with 'values' key, got {type(data).__name__}",
            "pass --file <path> to Bitbucket comment JSON (raw API response, fetch-bb-comments output, or a plain array)",
        )
    if not isinstance(comments, list):
        raise UsageError(
            f"{source}: comment list must be a JSON array",
            "pass --file <path> to Bitbucket comment JSON (raw API response, fetch-bb-comments output, or a plain array)",
        )
    return comments


def handle(v):
    source = v["--file"]
    pr_author = v.get("--author")

    if source == "-":
        text = sys.stdin.read()
    else:
        try:
            with open(source, "r", encoding="utf-8") as f:
                text = f.read()
        except FileNotFoundError:
            raise NotFound(
                f"comments file not found: {source}",
                "pass --file <path> to an existing comments JSON file, or - for stdin",
            )
        except OSError as e:
            raise UsageError(f"cannot read {source}: {e}",
                             "pass --file <path> to a readable file, or - for stdin")

    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError) as e:
        raise UsageError(f"invalid JSON in {source}: {e}",
                         "pass --file <path> to a valid comments JSON file (or - for stdin)")

    comments = _extract_comments(data, source)
    result = classify_comments(comments, pr_author=pr_author)
    return {"status": "classified", **result}


TOOL = Tool(
    name="classify-pr-comments",
    version="2.0",
    summary="Classify Bitbucket PR comments: bot vs human, resolved vs unresolved, actionable count.",
    flags={
        "--file": {"required": True, "type": "str",
                   "description": "Comments JSON file path, or '-' for stdin. Accepts raw API response ({\"values\": [...]}), fetch-bb-comments output ({\"comments\": [...]}), or a plain array."},
        "--author": {"required": False, "type": "str",
                     "description": "PR author display name — excludes author comments from the actionable count."},
    },
    exit_codes={
        "0": "classified — payload carries all counts and the threads list",
        "1": "usage/validation error (invalid JSON, unexpected shape)",
        "4": "comments file not found",
    },
    examples=[
        "$UB classify-pr-comments --file handoffs/harvey/temp/comments.json",
        "python fetch-bb-comments.py ... | $UB classify-pr-comments --file - --author \"Display Name\"",
    ],
    idempotent="Read-only — re-running with the same input gives identical output.",
)


if __name__ == "__main__":
    TOOL.run(handle)
