"""
post-jira-comment.py — Convert a sections-format JSON file to ADF and POST it as a
Jira comment in one call (GPTS).

Collapses the build-adf-json -> wrap -> jira-write chain into a single invocation.

Flags (flag-only, order-irrelevant; --help / -h / no-args prints this JSON
contract and exits 0):
    --passphrase <pin>          REQUIRED  Decryption passphrase for Jira credentials
    --issue-key <key>           REQUIRED  Jira issue key, e.g. PAY-6921
    --sections-file <path>      REQUIRED  Path to an input file. Three accepted formats:
                                           - build-adf-json sections format (default)
                                           - Pre-built ADF doc (use --raw-adf flag)
                                           - Plain markdown text (use --markdown flag)
    --instance <url>            optional  Override Jira instance URL (default: read from assets/config.md)
    --raw-adf                   optional  Treat the input file as a pre-built ADF doc
                                           rather than converting from sections format. Accepts:
                                           - {"type":"doc","version":1,"content":[...]}
                                           - {"body": {"type":"doc",...}}  (unwraps body key)
    --markdown                  optional  Treat the input file as plain markdown text
                                           instead of a JSON sections file. Converts headings
                                           (#/##/###), bullets (-/*), ordered lists (1.), rules
                                           (---), and paragraphs; inline **bold**, *italic*,
                                           `code` pass through as-is. Fast path for QA/status
                                           comments.
    --base <path>               optional  Base dir for config + audit log (default: self-located)

Markdown mode line rules:
    ### text        -> heading level 3
    ## text         -> heading level 2
    # text          -> heading level 1
    - text / * text -> bullet list item (consecutive lines group into one list)
    1. text         -> ordered list item (consecutive lines group into one list)
    ---             -> horizontal rule (must be alone on its line)
    (blank line)    -> paragraph/list break
    anything else   -> paragraph text (consecutive non-blank lines join into one
                       paragraph; blank line starts a new one)

Sections format natural shorthands (no "type" key needed):
    {"heading2": "text"}       heading level 2
    {"heading3": "text"}       heading level 3
    {"paragraph": "text"}      paragraph
    {"bullets": ["a","b"]}     bullet list  (shorthand key is "bullets"; typed form uses "items")
    {"ordered": ["a","b"]}     ordered list
    {"rule": true}             horizontal rule
    {"blockquote": "text"}     blockquote
    {"expand": "title",        collapsible expand (nestedExpand when inside another expand)
     "content": [...]}         content is a nested sections array

Bullet list forms -- all accepted:
    {"bullets": ["first", "second"]}                    shorthand
    {"type": "bullet_list", "items": ["first", "second"]}   typed
    {"type": "bulletList",  "items": ["first", "second"]}   alias (camelCase)

Output: exactly one JSON document on stdout (diagnostics go to stderr).
    success: {"ok": true, "status": "posted", "issue_key": ..., "http_status": N}
    failure: {"ok": false, "status": "error|precondition|not_found", "reason": ..., "fix": ...}

Mutating tool: appends one audit line to <base>/logs/audit/audit.jsonl (best-effort).

Examples:
    $UB post-jira-comment --passphrase <pin> --issue-key PAY-6921 --sections-file /tmp/comment-sections.json
    $UB post-jira-comment --passphrase <pin> --issue-key PAY-6921 --sections-file /tmp/comment-adf.json --raw-adf
"""

import sys
import io
import json
import re
import base64
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

from toolkit import Tool, UsageError, NotFound, Precondition, ToolError, audit_append

# Force UTF-8 stdout on Windows (cp1252 chokes on Unicode in Jira responses)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent  # <BASE_DIR>/tools/../  => <BASE_DIR>


def get_cred(service, key, passphrase):
    """Decrypt a credential via read-cred.py (GPTS envelope contract).

    Calls `read-cred.py --provider <s> --field <k> --passphrase <pin>` and
    reads the plaintext from the envelope's "value". Raises Precondition
    (exit 3) when decryption fails; never prints the credential value.
    """
    result = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "read-cred.py"),
         "--provider", service, "--field", key, "--passphrase", passphrase],
        capture_output=True, text=True
    )
    reason = f"failed to decrypt {service}/{key}: {result.stderr.strip() or 'no stderr'}"
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
    print(f"Failed to decrypt {service}/{key}: {reason}", file=sys.stderr)
    raise Precondition(reason, fix)


def read_instance_from_config(base=BASE_DIR):
    """
    Read the Jira instance URL from assets/config.md.
    Looks for a line matching:
        - Instance: `https://...`
    under the ## Jira section.
    """
    config_path = Path(base) / "assets" / "config.md"
    if not config_path.exists():
        return None

    text = config_path.read_text(encoding="utf-8")
    # Match lines like: - **Instance:** `https://procare.atlassian.net`
    # or: - Instance: `https://...`
    match = re.search(r'\bInstance\b.*?(https://[^\s`"\']+)', text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip("/")
    return None


def build_adf_from_sections(sections_data):
    """Import build-adf-json.py and convert sections dict to an ADF document."""
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("build_adf_json", str(SCRIPT_DIR / "build-adf-json.py"))
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.build_adf(sections_data)


_HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$')
_BULLET_RE = re.compile(r'^\s*[-*]\s+(.*)$')
_ORDERED_RE = re.compile(r'^\s*\d+\.\s+(.*)$')
_RULE_RE = re.compile(r'^\s*-{3,}\s*$')


def parse_markdown_to_sections(text):
    """Parse plain markdown text into build-adf-json sections format.

    Supports: headings (#/##/###), bullet lists (-/*), ordered lists (1.),
    horizontal rules (---), blank-line-separated paragraphs. Inline
    **bold**/*italic*/`code` is left as-is -- build-adf-json's paragraph/
    heading/bullet builders already run text through parse_inline_marks.
    """
    sections = []
    bullet_buf = []
    ordered_buf = []
    para_buf = []

    def flush_bullets():
        if bullet_buf:
            sections.append({"bullets": bullet_buf[:]})
            bullet_buf.clear()

    def flush_ordered():
        if ordered_buf:
            sections.append({"ordered": ordered_buf[:]})
            ordered_buf.clear()

    def flush_para():
        if para_buf:
            sections.append({"paragraph": " ".join(para_buf)})
            para_buf.clear()

    def flush_all():
        flush_bullets()
        flush_ordered()
        flush_para()

    for raw_line in text.splitlines():
        line = raw_line.rstrip()

        if not line.strip():
            flush_all()
            continue

        if _RULE_RE.match(line):
            flush_all()
            sections.append({"rule": True})
            continue

        heading_match = _HEADING_RE.match(line)
        if heading_match:
            flush_all()
            level = len(heading_match.group(1))
            heading_text = heading_match.group(2).strip()
            if level == 1:
                # build-adf-json's shorthand only covers heading2-6; use the typed form for level 1
                sections.append({"type": "heading", "text": heading_text, "level": 1})
            else:
                sections.append({f"heading{level}": heading_text})
            continue

        bullet_match = _BULLET_RE.match(line)
        if bullet_match:
            flush_ordered()
            flush_para()
            bullet_buf.append(bullet_match.group(1).strip())
            continue

        ordered_match = _ORDERED_RE.match(line)
        if ordered_match:
            flush_bullets()
            flush_para()
            ordered_buf.append(ordered_match.group(1).strip())
            continue

        # Plain text line -- continues a paragraph, closes any open list
        flush_bullets()
        flush_ordered()
        para_buf.append(line.strip())

    flush_all()
    return {"sections": sections}


def post_comment(instance, issue_key, comment_body, passphrase):
    """POST the ADF comment body to the Jira issue comment endpoint."""
    user = get_cred("jira", "JIRA_USER", passphrase)
    token = get_cred("jira", "JIRA_TOKEN", passphrase)
    auth = base64.b64encode(f"{user}:{token}".encode()).decode()

    url = f"{instance}/rest/api/3/issue/{issue_key}/comment"
    payload = json.dumps({"body": comment_body}, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })

    try:
        resp = urllib.request.urlopen(req)
        status = resp.status
        body = resp.read().decode("utf-8") if resp.length else ""
        return status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        raise ToolError(
            f"HTTP {e.code}: {body[:500]}",
            "check the issue key, ADF comment body, and Jira permissions, then re-run post-jira-comment with the same flags",
            code=1,
        )
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", None) or str(e)
        raise ToolError(
            f"URL error: {reason}",
            "check the instance URL and network connectivity, then re-run post-jira-comment with the same flags",
            code=1,
        )


def handle(v):
    passphrase = v["--passphrase"]
    issue_key = v["--issue-key"]
    sections_file = v["--sections-file"]
    raw_adf = v.get("--raw-adf", False)
    markdown = v.get("--markdown", False)
    base = v.get("--base") or str(BASE_DIR)

    if raw_adf and markdown:
        raise UsageError("--raw-adf and --markdown are mutually exclusive",
                         "pass only one of --raw-adf or --markdown")

    # Resolve instance from config if not provided
    instance = v.get("--instance")
    if instance:
        instance = instance.rstrip("/")
        if not re.match(r"^https?://", instance):
            raise UsageError(f"--instance {instance!r} must start with http:// or https://",
                             "pass --instance <https://...>")
    else:
        instance = read_instance_from_config(base)
    if not instance:
        raise UsageError(
            "Jira instance URL not found",
            "provide --instance <url> or set it in assets/config.md")

    # Read input file
    sections_path = Path(sections_file)
    if not sections_path.exists():
        raise NotFound(f"input file not found: {sections_file}",
                       "pass --sections-file <existing file>")

    if markdown:
        sections_data = parse_markdown_to_sections(
            sections_path.read_text(encoding="utf-8"))
    else:
        try:
            with open(sections_path, "r", encoding="utf-8") as f:
                sections_data = json.load(f)
        except (json.JSONDecodeError, ValueError) as e:
            raise UsageError(f"invalid JSON in sections file: {e}",
                             "write valid JSON in the sections file and re-run")

    if raw_adf:
        # File is already a valid ADF doc ({"type":"doc","version":1,"content":[...]})
        # or wrapped with a "body" key — unwrap if needed
        if isinstance(sections_data, dict) and sections_data.get("type") == "doc":
            adf_doc = sections_data
        elif isinstance(sections_data, dict) and "body" in sections_data:
            adf_doc = sections_data["body"]
        else:
            adf_doc = sections_data
    else:
        # Convert sections -> ADF
        adf_doc = build_adf_from_sections(sections_data)

    # POST comment
    status, body = post_comment(instance, issue_key, adf_doc, passphrase)
    audit_append(base, "post-jira-comment", "comment", key=issue_key, result=f"HTTP {status}")

    out = {"status": "posted", "issue_key": issue_key, "http_status": status}
    if body:
        out["body"] = body
    return out


TOOL = Tool(
    name="post-jira-comment",
    version="1.0",
    summary="Convert a sections-format JSON file to ADF and POST it as a Jira comment in one call.",
    flags={
        "--passphrase": {"required": True, "type": "str",
                         "description": "Decryption passphrase for Jira credentials (read-cred.py)."},
        "--issue-key": {"required": True, "type": "key",
                        "description": "Jira issue key, e.g. PAY-6921."},
        "--sections-file": {"required": True, "type": "path",
                            "description": "Path to the input file: build-adf-json sections format (default), a pre-built ADF doc (with --raw-adf), or plain markdown (with --markdown)."},
        "--instance": {"required": False, "type": "str",
                       "description": "Override Jira instance URL; default: read from assets/config.md."},
        "--raw-adf": {"required": False, "type": "bool",
                      "description": "Treat the input file as a pre-built ADF doc ({\"type\":\"doc\",...} or {\"body\": {...}}) instead of converting from sections format."},
        "--markdown": {"required": False, "type": "bool",
                       "description": "Treat --sections-file as plain markdown text instead of a JSON sections file (fast path for QA/status comments)."},
    },
    exit_codes={
        "0": "posted — payload carries issue_key and http_status",
        "1": "usage/validation error, Jira HTTP error (status + truncated body in reason), or network error",
        "3": "credential decryption failure (no valid read-cred session/passphrase)",
        "4": "input file not found",
    },
    examples=[
        "$UB post-jira-comment --passphrase <pin> --issue-key PAY-6921 --sections-file /tmp/comment-sections.json",
        "$UB post-jira-comment --passphrase <pin> --issue-key PAY-6921 --sections-file /tmp/comment-adf.json --raw-adf",
        "$UB post-jira-comment --passphrase <pin> --issue-key PAY-6921 --sections-file /tmp/QA-verdict.md --markdown",
    ],
    idempotent="No — each run adds a new comment to the issue.",
    base_default=BASE_DIR,
)


def main():
    TOOL.run(handle)


if __name__ == "__main__":
    main()
