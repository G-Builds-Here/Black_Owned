"""
Check if a Dupin subagent is making progress.

Usage:
  $UB check-agent-progress <ticket> --phase <N> --repo-root <path> [--timeout N]

Output JSON:
  {"ticket": "LOC-1", "phase": 2, "phase_stories": [...],
   "acs_merged": [...], "summary": {...},
   "acs": {"AC1": {"deps_met": true, "blocked_by": [], ...}},
   "dispatch": [{"ac_id": "AC1", "stage": "impl", "is_redisplay": false, "resume_findings": null}, ...],
   "blocked": [...], ...}
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


HANDOFF_STAGES = ["impl", "commit-impl", "qa", "commit-qa", "pr"]
DISPATCH_STAGES = ["impl", "commit-impl", "qa", "commit-qa"]  # stages the model dispatches
LEASE_TTL_MINUTES = 30
MAX_CONCURRENT_AGENTS = 5
COOLDOWN_MINUTES = 5  # anti-flap: skip re-dispatch if agent was active within this window

# ── helpers ──────────────────────────────────────────────────────────────────


def determine_next_stage(chain: dict) -> str | None:
    """Return the next stage to dispatch based on handoff chain state.

    Pipeline order: impl → commit-impl → qa → commit-qa
    Returns the first stage that is missing or incomplete, or None if all done.
    """
    for stage in DISPATCH_STAGES:
        stage_info = chain.get(stage, {})
        if not stage_info.get("exists") or not stage_info.get("complete"):
            return stage
    return None


def get_findings_path(base_dir: Path, story_key: str, ac_id: str) -> str | None:
    """Return posix path to findings file if it exists, else None."""
    findings_file = base_dir / "handoffs" / "dupin" / "findings" / f"{ac_id}.md"
    if findings_file.exists():
        return _posix(findings_file)
    return None

def _posix(p):
    return str(p).replace("\\", "/")

def _load_epic_tickets(base_dir: Path):
    """Lazy-load epic-tickets module via importlib (hyphenated filename)."""
    path = base_dir / "tools" / "epic-tickets.py"
    if not path.exists():
        return None
    spec = importlib.util.spec_from_file_location("epic_tickets", str(path))
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def parse_ts(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None

def claim_age_minutes(claim: dict) -> float | None:
    ts = claim.get("claimed_at")
    if not ts:
        return None
    dt = parse_ts(ts)
    if not dt:
        return None
    return round((datetime.now(timezone.utc) - dt).total_seconds() / 60, 1)

def is_claim_stale(claim: dict) -> bool:
    age = claim_age_minutes(claim)
    return age is not None and age >= LEASE_TTL_MINUTES

def parse_progress_entry(entry: dict) -> dict:
    text = entry.get("text", "")
    result = {"step": None, "step_status": None, "work": None}
    for part in text.split("|"):
        part = part.strip()
        if part.startswith("step:"):
            result["step"] = part.split(":", 1)[1].strip()
        elif part.startswith("status:"):
            result["step_status"] = part.split(":", 1)[1].strip()
        elif part.startswith("work:"):
            result["work"] = part.split(":", 1)[1].strip()
    return result

def _is_stale(claim: dict) -> bool:
    try:
        claimed_at = datetime.fromisoformat(claim["claimed_at"])
        age_minutes = (datetime.now(timezone.utc) - claimed_at).total_seconds() / 60
        return claim.get("status") != "done" and age_minutes > 30
    except (KeyError, ValueError):
        return True


def is_claim_dead(claim: dict) -> bool:
    """Check if a claim should be auto-released: stale + no task_id + no progress.

    A claim with no task_id means the wrapper agent failed to complete setup
    (didn't call claim-ac --update-task-id). If it's also stale (>30 min),
    the agent never started working — release the claim.
    """
    if claim.get("status") == "done":
        return False
    if claim.get("task_id"):
        return False
    age = claim_age_minutes(claim)
    return age is not None and age >= LEASE_TTL_MINUTES


def cleanup_dead_claims(base_dir: Path, ticket: str = None) -> list[dict]:
    """Auto-release dead claims (stale + no task_id).

    Returns list of released claims for logging.
    """
    claims_dir = base_dir / "claims"
    if not claims_dir.exists():
        return []
    released = []
    for f in claims_dir.glob("*.claim"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if ticket and data.get("story") != ticket and data.get("epic") != ticket:
                continue
            if is_claim_dead(data):
                released.append({
                    "claim_file": f.name,
                    "ac_id": data.get("ac"),
                    "agent_id": data.get("agent_id"),
                    "claimed_at": data.get("claimed_at"),
                    "reason": "stale with no task_id — agent never started work",
                })
                f.unlink()
        except (OSError, json.JSONDecodeError):
            continue
    return released


# ── phase/dependency helpers (migrated from check-deps.py) ────────────────────

def get_phase_stories(story_deps: list[dict], phase: int) -> list[str]:
    """Return story keys assigned to the given phase.

    Priority 1: Use the explicit 'phase' field from the story_deps (from epic ticket).
    Priority 2: Fall back to topological sort if no phase field exists (returns 1-based phases).
    """
    # Priority 1: Check for explicit phase assignments in the story_deps
    explicit_phase_stories = [s["story"] for s in story_deps
                              if s.get("phase") is not None
                              and str(s["phase"]) == str(phase)]
    if explicit_phase_stories:
        return explicit_phase_stories

    # Priority 2: Fallback to topological sort if no explicit phases found
    # Uses 1-based phase numbering to match epic-tickets.py and Dupin expectations
    stories_by_key = {s["story"]: s for s in story_deps}
    all_stories = list(stories_by_key.keys())
    assigned = {}
    remaining = set(all_stories)
    phase_num = 1  # Start at 1 for 1-based phase numbering
    while remaining:
        phase_stories = []
        for story in remaining:
            deps = stories_by_key.get(story, {}).get("depends_on", [])
            story_deps_normalized = []
            for d in deps:
                normalized = re.sub(r"-AC\d+$", "", d)
                if normalized in stories_by_key:
                    story_deps_normalized.append(normalized)
            all_deps_assigned = all(
                dep in assigned and assigned[dep] < phase_num
                for dep in story_deps_normalized
            )
            if all_deps_assigned:
                phase_stories.append(story)
        if not phase_stories:
            phase_stories = list(remaining)
        for s in phase_stories:
            assigned[s] = phase_num
            remaining.discard(s)
        if phase_num == phase:
            return phase_stories
        phase_num += 1
    return []

def check_git_commit(repo_root: Path, grep_pattern: str, on_branch: str = None) -> bool:
    """Check if a commit matching grep_pattern exists, optionally on a specific branch."""
    try:
        args = ["git", "-C", _posix(repo_root), "log", "--oneline", f"--grep={grep_pattern}"]
        if on_branch:
            args.append(on_branch)
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=10,
        )
        return bool(result.stdout.strip())
    except (subprocess.TimeoutExpired, OSError):
        return False

def validate_handoff_chain(base_dir: Path, story_key: str, ac_id: str) -> dict:
    """Validate that the full handoff chain exists and is complete.

    Required chain: impl → commit-impl → qa → commit-qa
    All four must exist with status: complete for the AC to be truly done.

    Returns {
        "valid": bool,
        "chain": {stage: {exists, complete, path}},
        "missing_stages": [str],
        "incomplete_stages": [str],
    }
    """
    # PR handoffs don't have a chain - they're standalone
    if ac_id.startswith("pr-"):
        return {
            "valid": True,
            "chain": {},
            "missing_stages": [],
            "incomplete_stages": [],
            "is_pr_handoff": True,
        }
    bare_match = re.search(r"(AC\d+)$", ac_id)
    bare_ac = bare_match.group(1) if bare_match else ac_id
    stages = [
        ("impl", f"impl-{story_key}-{bare_ac}.md"),
        ("commit-impl", f"commit-impl-{story_key}-{bare_ac}.md"),
        ("qa", f"qa-{story_key}-{bare_ac}.md"),
        ("commit-qa", f"commit-qa-{story_key}-{bare_ac}.md"),
    ]
    handoff_dir = base_dir / "handoffs" / "dupin" / story_key
    chain = {}
    missing = []
    incomplete = []

    for stage_name, filename in stages:
        path = handoff_dir / filename
        if not path.exists():
            chain[stage_name] = {"exists": False, "complete": False, "path": None}
            missing.append(stage_name)
            continue
        try:
            content = path.read_text(encoding="utf-8")
            # QA handoffs use "pass" as completion status; other stages use "complete"
            if stage_name == "qa":
                complete = (
                    "status: complete" in content or "**Status:** complete" in content
                    or "status: pass" in content or "**Status:** pass" in content
                )
            else:
                complete = "status: complete" in content or "**Status:** complete" in content
            chain[stage_name] = {
                "exists": True,
                "complete": complete,
                "path": str(path).replace("\\", "/"),
            }
            if not complete:
                incomplete.append(stage_name)
        except OSError:
            chain[stage_name] = {"exists": True, "complete": False, "path": str(path).replace("\\", "/")}
            incomplete.append(stage_name)

    return {
        "valid": len(missing) == 0 and len(incomplete) == 0,
        "chain": chain,
        "missing_stages": missing,
        "incomplete_stages": incomplete,
    }


def parse_qa_result(base_dir: Path, story_key: str, ac_id: str) -> str | None:
    """Extract QA result field from the dupin-qa handoff.

    Returns 'pass', 'partial', 'fail', 'blocked', or None if not found.
    """
    handoff_dir = base_dir / "handoffs" / "dupin" / story_key
    if not handoff_dir.exists():
        return None
    bare_match = re.search(r"(AC\d+)$", ac_id)
    bare_ac = bare_match.group(1) if bare_match else ac_id
    qa_path = handoff_dir / f"qa-{story_key}-{bare_ac}.md"
    if not qa_path.exists():
        return None
    try:
        content = qa_path.read_text(encoding="utf-8")
        # Match common patterns: "result": "pass", **result:** pass, "QA Result": "pass", **QA Result:** pass
        # Pattern for **QA Result:** pass (colon is inside the bold markers)
        match = re.search(r'\*\*QA Result:\*\*\s*(\w+)', content)
        if match:
            return match.group(1).lower()
        # Fallback: look for result field in JSON format
        match = re.search(r'"result"\s*:\s*"(\w+)"', content, re.IGNORECASE)
        if match:
            return match.group(1).lower()
    except OSError:
        pass
    return None


def parse_file_list(value: str) -> list[str]:
    """Parse a file list from handoff format.

    Handles both Python array syntax and plain comma-separated:
    - ['file1.rs', 'file2.rs'] -> ['file1.rs', 'file2.rs']
    - file1.rs, file2.rs -> ['file1.rs', 'file2.rs']

    Args:
        value: Raw string value from handoff

    Returns:
        List of cleaned file paths
    """
    value = value.strip()
    if not value or value.lower() == "n/a":
        return []

    # Strip Python array brackets if present
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1].strip()

    files = []
    for item in value.split(","):
        item = item.strip().strip("'\"")
        if item:
            files.append(item)
    return files


def extract_artifact_names(handoff_content: str) -> list[str]:
    """Extract artifact/component names from handoff content.

    Parses both "Components Created" and "Files Changed" fields,
    returning unique artifact names (first parent directory for paths,
    or file stems for bare filenames).

    Args:
        handoff_content: Handoff file content

    Returns:
        List of unique artifact names (e.g., ["bw-types", "bw-ingestion"])
    """
    artifact_names = []
    seen = set()

    FIELD_PATTERNS = [
        r'\*\*Components Created:\*\*\s*(.*)',
        r'\*\*Files Changed:\*\*\s*(.*)',
    ]

    for pattern in FIELD_PATTERNS:
        match = re.search(pattern, handoff_content)
        if match:
            for item in parse_file_list(match.group(1)):
                path = Path(item)
                # For paths with directories (e.g., bw-types/src/lib.rs),
                # extract the FIRST parent directory name (bw-types)
                # For bare filenames (e.g., lib.rs), use the stem
                parts = path.parts
                if len(parts) >= 2:
                    # Get the first directory in the path
                    name = parts[0]
                else:
                    name = path.stem
                if name and name.lower() not in ("n/a", "none", "") and name not in seen:
                    artifact_names.append(name)
                    seen.add(name)

    return artifact_names


def parse_delivery_data(handoff_content: str) -> dict:
    """Parse structured delivery data from handoff content.

    Extracts from inline **Field:** value format:
    - Components Created: [file paths]
    - Files Changed: [file paths]

    Args:
        handoff_content: Handoff file content

    Returns:
        {"components": [], "files": []}
    """
    delivery = {"components": [], "files": []}

    FIELD_MAP = [
        (r'\*\*Components Created:\*\*\s*(.*)', "components"),
        (r'\*\*Files Changed:\*\*\s*(.*)', "files"),
    ]

    for pattern, key in FIELD_MAP:
        match = re.search(pattern, handoff_content)
        if match:
            delivery[key] = parse_file_list(match.group(1))

    return delivery


def verify_ac_completion(
    base_dir: Path,
    ticket: str,
    ac_id: str,
    story_key: str,
    repo_root: Path | None,
    worktree_path: Path | None = None,
) -> dict:
    """Verify that an AC's claimed completion has actual code behind it.

    Six checks:
    1. git-commits: commits exist for this AC on the story branch
    2. files-exist: files listed in handoff exist + files from git diff exist
    3. artifact-integration: components/artifacts are wired (not orphaned)
    4. delivery-data: structured delivery data documented in handoff
    5. qa-result: QA handoff result is 'pass' or 'partial'
    6. meaningful-diff: diff has actual code changes (>5 lines)

    The integration check catches "component exists but never imported" scenarios
    that caused LOC-0049 E2E failures.

    Returns {"verified": bool, "checks": {...}, "failures": [str]}
    """
    checks = {}
    failures = []

    # Check 1: git commits exist for this AC
    # Dupin creates AC-specific branches: feature/{STORY-AC} (e.g., feature/LOC-0031-AC2)
    git_commits_pass = False
    commit_count = 0
    checked_branch = None
    if repo_root:
        # Try AC-specific branch first (e.g., feature/LOC-0031-AC2)
        ac_branch = f"feature/{ac_id}"
        try:
            # Check if branch exists and has commits (don't grep by message)
            result = subprocess.run(
                ["git", "-C", _posix(repo_root), "rev-parse", "--verify", ac_branch],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                # Branch exists, count all commits on it
                result = subprocess.run(
                    ["git", "-C", _posix(repo_root), "rev-list", "--count", ac_branch],
                    capture_output=True, text=True, timeout=10,
                )
                if result.stdout.strip():
                    git_commits_pass = True
                    commit_count = int(result.stdout.strip())
                    checked_branch = ac_branch
        except (subprocess.TimeoutExpired, OSError):
            pass

        # Fallback: try story branch if AC branch has no commits
        if not git_commits_pass:
            story_branch = f"feature/{story_key}"
            try:
                result = subprocess.run(
                    ["git", "-C", _posix(repo_root), "rev-parse", "--verify", story_branch],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    result = subprocess.run(
                        ["git", "-C", _posix(repo_root), "rev-list", "--count", story_branch],
                        capture_output=True, text=True, timeout=10,
                    )
                    if result.stdout.strip():
                        git_commits_pass = True
                        commit_count = int(result.stdout.strip())
                        checked_branch = story_branch
            except (subprocess.TimeoutExpired, OSError):
                pass
    checks["git_commits"] = {
        "pass": git_commits_pass,
        "commit_count": commit_count,
        "branch": checked_branch,
        "details": f"{commit_count} commits found on {checked_branch}" if git_commits_pass else "no commits found",
    }
    if not git_commits_pass:
        failures.append(f"git_commits: no commits found for {ac_id} on feature/{ac_id} or feature/{story_key}")

    # Check 2: files exist (from handoff Files field + git diff)
    files_pass = True
    missing_files = []
    checked_files = []

    if repo_root:
        # Source A: git diff changed files
        try:
            diff_result = subprocess.run(
                ["git", "-C", _posix(repo_root), "diff",
                 f"feature/{story_key}~1..feature/{story_key}", "--name-only"],
                capture_output=True, text=True, timeout=10,
            )
            for f in diff_result.stdout.strip().splitlines():
                f = f.strip()
                if not f:
                    continue
                checked_files.append(f)
                # Check in worktree first, then repo_root
                file_exists = False
                if worktree_path and (worktree_path / f).exists():
                    file_exists = True
                elif (repo_root / f).exists():
                    file_exists = True
                if not file_exists:
                    missing_files.append(f)
        except (subprocess.TimeoutExpired, OSError):
            pass

        # Source B: handoff Files Changed field
        bare_match = re.search(r"(AC\d+)$", ac_id)
        bare_ac = bare_match.group(1) if bare_match else ac_id
        handoff_dir = base_dir / "handoffs" / "dupin" / story_key
        for stage in ["commit-impl", "impl"]:
            handoff_path = handoff_dir / f"{stage}-{story_key}-{bare_ac}.md"
            if handoff_path.exists():
                try:
                    content = handoff_path.read_text(encoding="utf-8")
                    files_match = re.search(r'\*\*Files Changed:\*\*\s*(.*)', content)
                    if files_match:
                        for f in parse_file_list(files_match.group(1)):
                            if f not in checked_files:
                                checked_files.append(f)
                                # Check in worktree first, then repo_root
                                file_exists = False
                                if worktree_path and (worktree_path / f).exists():
                                    file_exists = True
                                elif (repo_root / f).exists():
                                    file_exists = True
                                if not file_exists:
                                    missing_files.append(f)
                except OSError:
                    pass

    if missing_files:
        files_pass = False
        failures.append(f"files_exist: missing {len(missing_files)} files: {', '.join(missing_files[:5])}")
    checks["files_exist"] = {
        "pass": files_pass,
        "missing": missing_files,
        "checked": checked_files,
        "details": f"{len(checked_files)} checked, {len(missing_files)} missing",
    }

    # Check 3: Artifact integration (components/modules wired into app)
    integration_result = {"pass": True, "details": "no repo_root provided", "matched": []}
    if repo_root:
        integration_result = check_artifact_integration(repo_root, ac_id, base_dir=base_dir, story_key=story_key)
    checks["artifact_integration"] = integration_result
    if not integration_result["pass"]:
        failures.append(f"artifact_integration: {integration_result['details']}")

    # Check 3b: Structured delivery data validation
    # Parse handoff for Components/Routes/Integrations sections and validate
    delivery_result = {"pass": True, "details": "no delivery data found", "delivery": {}}
    bare_match = re.search(r"(AC\d+)$", ac_id)
    bare_ac = bare_match.group(1) if bare_match else ac_id
    handoff_dir = base_dir / "handoffs" / "dupin" / story_key
    for stage in ["impl", "commit-impl"]:
        handoff_path = handoff_dir / f"{stage}-{story_key}-{bare_ac}.md"
        if handoff_path.exists():
            try:
                content = handoff_path.read_text(encoding="utf-8")
                delivery = parse_delivery_data(content)
                delivery_result["delivery"] = delivery

                # If nothing was claimed, flag it
                if not delivery["components"] and not delivery["files"]:
                    delivery_result["pass"] = False
                    delivery_result["details"] = "No delivery data documented in handoff"
                    failures.append("delivery_data: no components/routes/files documented")

                break  # Found a handoff, stop searching
            except OSError:
                pass

    checks["delivery_data"] = delivery_result

    # Check 4: QA result is pass or partial
    qa_result = parse_qa_result(base_dir, story_key, ac_id)
    qa_pass = qa_result in ("pass", "partial")
    checks["qa_result"] = {
        "pass": qa_pass,
        "result": qa_result or "absent",
        "details": f"QA result: {qa_result}" if qa_result else "no QA handoff found",
    }
    if not qa_pass:
        failures.append(f"qa_result: {qa_result or 'absent'} (need pass or partial)")

    # Check 5: meaningful diff (>5 lines changed)
    # Check the AC-specific branch (feature/{AC_ID}), not the story branch
    meaningful_pass = False
    checked_branch = None
    if repo_root:
        # Try AC-specific branch first
        ac_branch = f"feature/{ac_id}"
        try:
            branch_check = subprocess.run(
                ["git", "-C", _posix(repo_root), "rev-parse", "--verify", ac_branch],
                capture_output=True, text=True, timeout=10,
            )
            if branch_check.returncode == 0:
                checked_branch = ac_branch
            else:
                # Fallback to story branch
                story_branch = f"feature/{story_key}"
                branch_check = subprocess.run(
                    ["git", "-C", _posix(repo_root), "rev-parse", "--verify", story_branch],
                    capture_output=True, text=True, timeout=10,
                )
                if branch_check.returncode == 0:
                    checked_branch = story_branch

            if not checked_branch:
                checks["meaningful_diff"] = {"pass": True, "details": "no branch found — skipping"}
                meaningful_pass = True
            else:
                numstat = subprocess.run(
                    ["git", "-C", _posix(repo_root), "diff",
                     f"{checked_branch}~1..{checked_branch}", "--numstat"],
                    capture_output=True, text=True, timeout=10,
                )
                total_lines = 0
                for line in numstat.stdout.strip().splitlines():
                    parts = line.split()
                    if len(parts) >= 2:
                        try:
                            total_lines += int(parts[0]) + int(parts[1])
                        except ValueError:
                            pass
                meaningful_pass = total_lines > 5
                checks["meaningful_diff"] = {
                    "pass": meaningful_pass,
                    "total_lines": total_lines,
                    "branch": checked_branch,
                    "details": f"{total_lines} lines changed on {checked_branch}",
                }
                if not meaningful_pass:
                    failures.append(f"meaningful_diff: only {total_lines} lines changed (need >5)")
        except (subprocess.TimeoutExpired, OSError):
            checks["meaningful_diff"] = {"pass": False, "details": "git diff failed"}
            failures.append("meaningful_diff: git diff failed")
    else:
        checks["meaningful_diff"] = {"pass": False, "details": "no repo_root provided"}
        failures.append("meaningful_diff: no repo_root provided")

    return {
        "verified": len(failures) == 0,
        "checks": checks,
        "failures": failures,
    }


def check_artifact_integration(repo_root: Path, ac_id: str, base_dir: Path = None, story_key: str = None) -> dict:
    """Check if artifacts created by this AC are imported somewhere in the repo.

    Derives component/module names from the AC's impl handoff (Components Created,
    Files Changed fields) rather than using a hardcoded list. Falls back to a
    pass-with-skip if no artifacts can be identified -- avoids false negatives on
    projects where the handoff doesn't document component names.

    Returns {"pass": bool, "details": str, "matched": [str]}
    """
    # Derive artifact names from the impl handoff if available
    artifact_names = []
    if base_dir and story_key:
        bare_match = re.search(r"(AC\d+)$", ac_id)
        bare_ac = bare_match.group(1) if bare_match else ac_id
        handoff_dir = base_dir / "handoffs" / "dupin" / story_key
        for stage in ["impl", "commit-impl"]:
            handoff_path = handoff_dir / f"{stage}-{story_key}-{bare_ac}.md"
            if not handoff_path.exists():
                continue
            try:
                content = handoff_path.read_text(encoding="utf-8")
                artifact_names = extract_artifact_names(content)
                if artifact_names:
                    break
            except OSError:
                continue

    # No artifacts identified — skip check rather than false-fail
    if not artifact_names:
        return {"pass": True, "details": "skipped — no artifact names found in handoff", "matched": []}

    # Detect project type from artifact file extensions
    # Rust: .rs, TypeScript/JS: .ts/.tsx/.js/.jsx, Python: .py, etc.
    source_extensions = set()
    has_rust = False
    for name in artifact_names:
        ext = Path(name).suffix.lower()
        if ext == ".rs":
            has_rust = True
        if ext in (".rs", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rb", ".java"):
            source_extensions.add(ext)

    # Default to common web extensions if no extension detected
    if not source_extensions:
        source_extensions = {".ts", ".tsx", ".js", ".jsx"}

    # Build import patterns based on project type
    # Rust uses "use" statements, JS/TS uses "import" statements
    # Note: Rust module names use underscores, so convert dashes to underscores
    # Filter out non-crate names (Cargo.toml, .github, etc.)
    # Also filter out "leaf" crates (apps, services) that aren't meant to be imported
    skip_names = {"cargo", ".github", "src", "lib", "tests", "examples", "benches"}

    # For Rust, identify which artifacts are "library" crates vs "leaf" crates
    # Leaf crates (apps, services) shouldn't be checked for integration
    if has_rust:
        library_crates = []
        for name in artifact_names:
            if name.lower() in skip_names:
                continue
            # Check if this is a library crate (has src/lib.rs) vs leaf crate (only src/main.rs)
            crate_path = repo_root / name
            if crate_path.exists():
                lib_rs = crate_path / "src" / "lib.rs"
                main_rs = crate_path / "src" / "main.rs"
                if lib_rs.exists() and not main_rs.exists():
                    # Library crate - include for integration check
                    library_crates.append(name)
                elif not lib_rs.exists() and main_rs.exists():
                    # Leaf crate (app/service) - skip integration check
                    continue
                elif lib_rs.exists() and main_rs.exists():
                    # Both exist - treat as library (can be imported)
                    library_crates.append(name)
                # else: neither exists - skip (unknown crate structure)
            else:
                # Crate directory not found - skip (cannot verify)
                continue
        artifact_names = library_crates

    filtered_artifacts = [n for n in artifact_names if n.lower() not in skip_names]

    integration_patterns = []
    for name in filtered_artifacts:
        if has_rust:
            # Rust: use bw_types::... (convert bw-types to bw_types)
            rust_name = name.replace("-", "_")
            integration_patterns.append(rf"use\s+{re.escape(rust_name)}")
        else:
            # JS/TS: import ... from
            integration_patterns.append(rf"import\s+[^;]*\b{re.escape(name)}\b[^;]*from")

    matched = []
    # Include Rust-specific directories for Rust projects
    source_dirs = ["src", "frontend/src", "app", "pages", "lib", "src/lib"]
    if has_rust:
        source_dirs = ["src", "lib", "bw-types", "bw-ingestion", "bw-api", "frontend/src"]

    # Build glob patterns for each extension
    glob_patterns = [f"*{ext}" for ext in source_extensions]

    for pattern, name in zip(integration_patterns, artifact_names):
        for src_dir in source_dirs:
            src_path = repo_root / src_dir
            if not src_path.exists():
                continue
            try:
                # Try each extension pattern
                for glob_pat in glob_patterns:
                    for src_file in src_path.rglob(glob_pat):
                        try:
                            content = src_file.read_text(encoding="utf-8")
                            if re.search(pattern, content):
                                matched.append(f"{name} -> {_posix(src_file.relative_to(repo_root))}")
                                break
                        except OSError:
                            continue
                    if any(name in m for m in matched):
                        break
                if any(name in m for m in matched):
                    break
            except OSError:
                continue

    passed = len(matched) > 0
    checked = len(artifact_names)
    return {
        "pass": passed,
        "details": f"Found {len(matched)}/{checked} artifacts wired" if passed else f"0/{checked} artifacts found in imports — may be orphaned",
        "matched": matched[:5],
    }


def check_ac_deps_met(
    ac_id: str,
    dep_acs: list[str],
    acs_merged: list[str],
    repo_root: Path | None,
    claims_dir: Path,
    base_dir: Path,
    story_key: str,
    epic_branch: str = None,
) -> tuple[bool, list[dict]]:
    """Check if all dependencies for an AC are met.

    A dependency is met ONLY when ALL THREE conditions are true, in order:
    1. Handoff chain complete: impl → commit-impl → qa → commit-qa
    2. Git commit exists on the feature branch for this AC
    3. AC is merged into the epic branch (listed in acs_merged)

    If ANY condition fails → dependency NOT met. No overrides.

    Returns (all_met, details).
    """
    details = []
    all_met = True

    for dep_ac in dep_acs:
        dep_info = {"dep_ac": dep_ac, "met": False, "method": None}
        dep_story_key = re.sub(r"-AC\d+$", "", dep_ac)

        # Condition 1: Handoff chain complete
        chain = validate_handoff_chain(base_dir, dep_story_key, dep_ac)
        if not chain["valid"]:
            missing = chain.get("missing_stages", [])
            incomplete = chain.get("incomplete_stages", [])
            chain_failures = []
            if missing:
                chain_failures.append(f"missing: {', '.join(missing)}")
            if incomplete:
                chain_failures.append(f"incomplete: {', '.join(incomplete)}")
            chain_msg = "; ".join(chain_failures) if chain_failures else "no handoff files"
            dep_info["met"] = False
            dep_info["method"] = "handoff_incomplete"
            dep_info["reason"] = chain_msg
            details.append(dep_info)
            all_met = False
            continue

        # Condition 2: Git commit on feature branch
        if not repo_root:
            dep_info["met"] = False
            dep_info["method"] = "no_repo_root"
            dep_info["reason"] = "handoff complete but cannot verify git commit (no repo_root)"
            details.append(dep_info)
            all_met = False
            continue

        # Dupin creates branches like feature/LOC-0034-AC1, not feature/LOC-0034
        # Check both patterns
        dep_branch_ac = f"feature/{dep_ac}"
        dep_branch_story = f"feature/{dep_story_key}"
        has_commit = (
            check_git_commit(repo_root, dep_ac, on_branch=dep_branch_ac) or
            check_git_commit(repo_root, dep_story_key, on_branch=dep_branch_ac) or
            check_git_commit(repo_root, dep_ac, on_branch=dep_branch_story) or
            check_git_commit(repo_root, dep_story_key, on_branch=dep_branch_story)
        )
        if not has_commit:
            dep_info["met"] = False
            dep_info["method"] = "no_commit_on_branch"
            dep_info["reason"] = "handoff complete but no git commit on feature branch"
            details.append(dep_info)
            all_met = False
            continue

        # Condition 3: Merged into epic
        if dep_ac not in acs_merged and dep_story_key not in acs_merged:
            dep_info["met"] = False
            dep_info["method"] = "not_merged"
            dep_info["reason"] = "handoff complete + commit exists but not in acs_merged"
            details.append(dep_info)
            all_met = False
            continue

        # All three conditions met
        dep_info["met"] = True
        dep_info["method"] = "complete"
        details.append(dep_info)

    return all_met, details


def expand_ac_shorthand(ac_entry: str) -> list[str]:
    """Expand shorthand AC notation into individual AC IDs.

    Examples:
        LOC-0031(1-3) -> ["LOC-0031-AC1", "LOC-0031-AC2", "LOC-0031-AC3"]
        LOC-0031(1)   -> ["LOC-0031-AC1"]
        LOC-0031-AC1  -> ["LOC-0031-AC1"]
        LOC-0031      -> ["LOC-0031"]
    """
    range_match = re.match(r"^([A-Za-z0-9-]+)\((\d+)-(\d+)\)$", ac_entry.strip())
    if range_match:
        story = range_match.group(1)
        start = int(range_match.group(2))
        end = int(range_match.group(3))
        return [f"{story}-AC{i}" for i in range(start, end + 1)]

    single_match = re.match(r"^([A-Za-z0-9-]+)\((\d+)\)$", ac_entry.strip())
    if single_match:
        story = single_match.group(1)
        num = single_match.group(2)
        return [f"{story}-AC{num}"]

    return [ac_entry.strip()]


def parse_acs_merged_from_handoff(base_dir: Path, epic_key: str) -> list[str]:
    """Read ACs Merged list from the Dupin handoff file."""
    # Priority 1: Main handoff file (handoffs/dupin/{key}.md)
    main_handoff = base_dir / "handoffs" / "dupin" / f"{epic_key}.md"
    if main_handoff.exists():
        try:
            content = main_handoff.read_text(encoding="utf-8")
            match = re.search(r"\*\*ACs Merged:\*\*\s*`?([^`\n]+)`?", content)
            if match:
                raw = match.group(1).strip()
                if raw and raw not in ("—", "-", "none", ""):
                    expanded = []
                    for entry in raw.split(","):
                        entry = entry.strip()
                        if entry:
                            expanded.extend(expand_ac_shorthand(entry))
                    return expanded
            match = re.search(r'"ACs Merged":\s*"([^"]*)"', content)
            if match:
                raw = match.group(1).strip()
                if raw:
                    expanded = []
                    for entry in raw.split(","):
                        entry = entry.strip()
                        if entry:
                            expanded.extend(expand_ac_shorthand(entry))
                    return expanded
        except OSError:
            pass

    # Priority 2: Skill-created handoff (handoffs/dupin/{key}/Dupin-{key}.md)
    skill_handoff = base_dir / "handoffs" / "dupin" / epic_key / f"Dupin-{epic_key}.md"
    if skill_handoff.exists():
        try:
            content = skill_handoff.read_text(encoding="utf-8")
            match = re.search(r"\*\*ACs Merged:\*\*\s*`?([^`\n]+)`?", content)
            if match:
                raw = match.group(1).strip()
                if raw and raw not in ("—", "-", "none", ""):
                    expanded = []
                    for entry in raw.split(","):
                        entry = entry.strip()
                        if entry:
                            expanded.extend(expand_ac_shorthand(entry))
                    return expanded
            match = re.search(r'"ACs Merged":\s*"([^"]*)"', content)
            if match:
                raw = match.group(1).strip()
                if raw:
                    expanded = []
                    for entry in raw.split(","):
                        entry = entry.strip()
                        if entry:
                            expanded.extend(expand_ac_shorthand(entry))
                    return expanded
        except OSError:
            pass

    # Priority 3: Legacy handoff files
    dupin_handoff_paths = [
        base_dir / "handoffs" / "dupin" / f"Dupin-{epic_key}.md",
    ]
    dupin_dir = base_dir / "handoffs" / "dupin"
    if dupin_dir.exists():
        for f in dupin_dir.rglob(f"*{epic_key}*.md"):
            dupin_handoff_paths.append(f)

    for hp in dupin_handoff_paths:
        if hp.exists():
            try:
                content = hp.read_text(encoding="utf-8")
                match = re.search(r"\*\*ACs Merged:\*\*\s*`?([^`\n]+)`?", content)
                if match:
                    raw = match.group(1).strip()
                    if raw and raw not in ("—", "-", "none", ""):
                        expanded = []
                        for entry in raw.split(","):
                            entry = entry.strip()
                            if entry:
                                expanded.extend(expand_ac_shorthand(entry))
                        return expanded
                match = re.search(r'"ACs Merged":\s*"([^"]*)"', content)
                if match:
                    raw = match.group(1).strip()
                    if raw:
                        expanded = []
                        for entry in raw.split(","):
                            entry = entry.strip()
                            if entry:
                                expanded.extend(expand_ac_shorthand(entry))
                        return expanded
            except OSError:
                continue
    return []


# ── existing check-agent-progress helpers ────────────────────────────────────

def check_audit_progress(base_dir: Path, ticket: str, ac_id: str, agent_id: str = None) -> list:
    spec = importlib.util.spec_from_file_location(
        "audit_log",
        str(base_dir / "tools" / "audit-log.py")
    )
    if spec is None or spec.loader is None:
        return []
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    log = mod.read_log(str(base_dir), ticket, last_n=50)
    if not log.get("exists"):
        return []
    entries = log.get("entries", [])
    progress_entries = [e for e in entries if e.get("type") == "progress"]
    if agent_id:
        progress_entries = [e for e in progress_entries if e.get("source") == agent_id]
    return progress_entries

def check_claim(base_dir: Path, ac_id: str) -> dict:
    claims_dir = base_dir / "claims"
    claim_path = claims_dir / f"{ac_id}.claim"
    if claim_path.exists():
        try:
            data = json.loads(claim_path.read_text(encoding="utf-8"))
            return {"exists": True, "agent_id": data.get("agent_id"), "status": data.get("status"),
                    "task_id": data.get("task_id"), "claimed_at": data.get("claimed_at"),
                    "worktree_path": data.get("worktree_path")}
        except (OSError, json.JSONDecodeError):
            return {"exists": True, "agent_id": None, "status": None, "task_id": None, "claimed_at": None, "worktree_path": None}
    if claims_dir.exists():
        for f in claims_dir.glob(f"*-{ac_id}.claim"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                return {"exists": True, "agent_id": data.get("agent_id"), "status": data.get("status"),
                        "task_id": data.get("task_id"), "claimed_at": data.get("claimed_at"),
                        "worktree_path": data.get("worktree_path"),
                        "claim_type": f.stem.split("-")[0], "claim_file": f.name}
            except (OSError, json.JSONDecodeError):
                return {"exists": True, "agent_id": None, "status": None, "task_id": None, "claimed_at": None, "worktree_path": None}
    return {"exists": False}

def find_handoff(base_dir: Path, ticket: str, ac_id: str) -> dict:
    match = re.match(r"^(.+)-AC\d+$", ac_id)
    story_key = match.group(1) if match else ticket
    # Handle PR handoffs: ac_id = "pr-<STORY_KEY>"
    pr_match = re.match(r"^pr-(.+)$", ac_id)
    if pr_match:
        story_key = pr_match.group(1)
    handoff_dir = base_dir / "handoffs" / "dupin" / story_key
    if not handoff_dir.exists():
        return {"exists": False}
    completed = {"exists": False, "complete": False}
    first_found = {"exists": False, "complete": False}
    # Extract bare AC ID (e.g. "AC1") from full ID (e.g. "LOC-0002-AC1")
    bare_ac_match = re.match(r"^.+-(AC\d+)$", ac_id)
    bare_ac = bare_ac_match.group(1) if bare_ac_match else ac_id
    for stage in HANDOFF_STAGES:
        # For PR handoffs, the file is named "pr-<STORY_KEY>.md" not "pr-pr-<STORY_KEY>.md"
        if stage == "pr" and ac_id.startswith("pr-"):
            candidate = handoff_dir / f"{ac_id}.md"
        else:
            candidate = handoff_dir / f"{stage}-{story_key}-{bare_ac}.md"
        if not candidate.exists():
            continue
        try:
            content = candidate.read_text(encoding="utf-8")
            # QA handoffs use "pass" as completion status; other stages use "complete"
            if stage == "qa":
                complete = (
                    "status: complete" in content or "**Status:** complete" in content
                    or "status: pass" in content or "**Status:** pass" in content
                )
            else:
                complete = "status: complete" in content or "**Status:** complete" in content
            result = {
                "exists": True,
                "complete": complete,
                "type": stage,
                "path": str(candidate).replace("\\", "/"),
            }
            if complete:
                completed = result
            if not first_found["exists"]:
                first_found = result
        except OSError:
            continue
    if completed["exists"]:
        return completed
    return first_found

def check_findings(base_dir: Path, ticket: str, ac_id: str) -> dict:
    findings_file = base_dir / "handoffs" / "dupin" / "findings" / f"{ac_id}.md"
    if findings_file.exists():
        content = findings_file.read_text(encoding="utf-8")
        sections = re.findall(r"^## (.+)", content, re.MULTILINE)
        return {"exists": True, "sections": sections}
    return {"exists": False}

def check_recent_activity(worktree_path: Path | None, base_dir: Path, ac_id: str,
                          window_minutes: int) -> dict:
    """Check if an AC had any agent activity within the cooldown window.
    
    Uses the worktree directory mtime as the primary signal — files modified
    by the agent are the most reliable indicator of recent activity, even
    after the claim file and audit entries are cleaned up.
    
    Falls back to findings file mtime if worktree is unavailable.
    
    Returns {"recently_active": bool, "method": str, "last_seen_minutes_ago": float|None}.
    Used to prevent immediate re-dispatch of just-failed agents whose
    claim was cleaned up but the old process may still be alive.
    """
    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - window_minutes * 60

    # Primary: worktree mtime
    if worktree_path and worktree_path.exists():
        try:
            mtime = worktree_path.stat().st_mtime
            age = round((now - mtime) / 60, 1)
            if mtime >= cutoff:
                return {"recently_active": True, "method": "worktree_mtime", "last_seen_minutes_ago": age}
        except OSError:
            pass
        # Also check git HEAD timestamp (catches worktree activity even if dir mtime is stale)
        git_head = worktree_path / ".git" / "HEAD"
        if git_head.exists():
            try:
                mtime = git_head.stat().st_mtime
                age = round((now - mtime) / 60, 1)
                if mtime >= cutoff:
                    return {"recently_active": True, "method": "git_head_mtime", "last_seen_minutes_ago": age}
            except OSError:
                pass

    # Fallback: findings file mtime
    findings_path = base_dir / "handoffs" / "dupin" / "findings" / f"{ac_id}.md"
    if findings_path.exists():
        try:
            mtime = findings_path.stat().st_mtime
            age = round((now - mtime) / 60, 1)
            if mtime >= cutoff:
                return {"recently_active": True, "method": "findings_mtime", "last_seen_minutes_ago": age}
        except OSError:
            pass

    return {"recently_active": False, "last_seen_minutes_ago": None}


def is_claim_active(claim: dict, base_dir: Path, ac_id: str, timeout_minutes: int = LEASE_TTL_MINUTES) -> bool:
    """Check if a claim represents an actively running agent.

    A claim is active if:
    1. It has a task_id that is still running (via task API), OR
    2. It has a task_id with fresh output (within timeout window), OR
    3. It has recent audit progress entries (within timeout window)

    Returns False if the claim is stale or the agent has completed.
    """
    if not claim.get("exists"):
        return False

    # Check task_id activity
    task_id = claim.get("task_id")
    if task_id:
        # First check if task is still running via task API
        # This catches agents from previous sessions that are still alive
        task_output = check_task_output(base_dir, task_id, timeout_minutes)
        if task_output.get("exists"):
            # Task output exists - if it's fresh, agent is still active
            if task_output.get("fresh"):
                return True
            # If task is complete, agent is done
            if task_output.get("complete"):
                return False
            # Task exists but not fresh and not complete - still potentially active
            return True

    # Check audit progress for recent activity
    agent_id = claim.get("agent_id")
    if agent_id:
        progress_entries = check_audit_progress(base_dir, ac_id.split("-AC")[0] + "-*" if "-" in ac_id else ac_id, ac_id, agent_id=agent_id)
        if progress_entries:
            last_entry = progress_entries[-1]
            last_ts = parse_ts(last_entry.get("timestamp"))
            if last_ts:
                age_minutes = (datetime.now(timezone.utc) - last_ts).total_seconds() / 60
                if age_minutes < timeout_minutes:
                    return True

    return False


def check_task_output(base_dir: Path, task_id: str, timeout_minutes: int) -> dict:
    if not task_id:
        return {"task_output_found": False, "reason": "no task_id"}
    temp_dir = Path(os.environ.get("TEMP") or os.environ.get("TMP") or "")
    if not temp_dir.exists():
        return {"task_output_found": False, "reason": "no temp dir"}
    encoded = str(base_dir.resolve()).replace(":", "-").replace("\\", "-").replace("/", "-")
    base = temp_dir / "claude" / encoded
    if not base.exists():
        return {"task_output_found": False, "reason": "no claude task dir"}
    for session_dir in base.iterdir():
        if not session_dir.is_dir():
            continue
        task_file = session_dir / "tasks" / f"{task_id}.output"
        if task_file.exists():
            mtime = datetime.fromtimestamp(task_file.stat().st_mtime, tz=timezone.utc)
            age = (datetime.now(timezone.utc) - mtime).total_seconds() / 60
            size = task_file.stat().st_size
            try:
                content = task_file.read_text(encoding="utf-8", errors="ignore")
                # Task is complete only if the output contains completion keywords.
                # Age alone is NOT completion — the agent may still be alive.
                has_keywords = bool(re.search(r'\b(completed|finished|terminated|exit_code)\b', content.lower()))
                return {
                    "task_output_found": True,
                    "fresh": age < timeout_minutes,
                    "complete": has_keywords,
                    "age_minutes": round(age, 1),
                    "size": size,
                    "path": str(task_file),
                }
            except OSError:
                return {
                    "task_output_found": True,
                    "fresh": age < timeout_minutes,
                    "complete": False,
                    "age_minutes": round(age, 1),
                    "size": size,
                    "path": str(task_file),
                }
    return {"task_output_found": False, "reason": "output file not found"}

def check_worktree_activity(worktree_dir: Path, timeout_minutes: int) -> dict:
    if not worktree_dir or not worktree_dir.exists():
        return {"worktree_changed": False, "reason": "no worktree dir"}
    cutoff = datetime.now(timezone.utc).timestamp() - timeout_minutes * 60
    git_head = worktree_dir / ".git" / "HEAD"
    if git_head.exists():
        try:
            mtime = git_head.stat().st_mtime
            if mtime >= cutoff:
                age = round((datetime.now(timezone.utc).timestamp() - mtime) / 60, 1)
                return {"worktree_changed": True, "method": "git_head", "age_minutes": age}
        except OSError:
            pass
    try:
        dir_mtime = worktree_dir.stat().st_mtime
        if dir_mtime >= cutoff:
            age = round((datetime.now(timezone.utc).timestamp() - dir_mtime) / 60, 1)
            return {"worktree_changed": True, "method": "dir_mtime", "age_minutes": age}
    except OSError:
        pass
    try:
        result = subprocess.run(
            ["git", "-C", _posix(worktree_dir), "status", "--porcelain"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            lines = [l for l in result.stdout.splitlines() if l.strip()]
            return {"worktree_changed": True, "method": "git_status", "files_changed": len(lines)}
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return {"worktree_changed": False, "reason": "no recent file changes"}

def check_build_processes(worktree_dir: Path) -> dict:
    if not worktree_dir or not worktree_dir.exists():
        return {"build_processes_running": False, "reason": "no worktree dir"}
    worktree_str = str(worktree_dir).lower()
    import platform
    if platform.system() == "Windows":
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 f"Get-CimInstance Win32_Process -Filter \"Name='dotnet.exe'\" | Select-Object -ExpandProperty CommandLine"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                for line in result.stdout.splitlines():
                    if not line.strip():
                        continue
                    if worktree_str in line.lower():
                        return {"build_processes_running": True, "match": "dotnet in worktree"}
        except Exception:
            pass
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-Process dotnet,node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"],
                capture_output=True, text=True, timeout=5
            )
            if result.stdout.strip():
                pids = [int(p) for p in result.stdout.strip().split() if p.strip().isdigit()]
                if pids:
                    return {"build_processes_running": True, "match": "any dotnet/node", "pids": pids}
        except Exception:
            pass
    else:
        try:
            result = subprocess.run(
                ["pgrep", "-x", "dotnet"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                pids = [int(p) for p in result.stdout.strip().split()]
                return {"build_processes_running": True, "match": "dotnet", "pids": pids}
        except Exception:
            pass
    return {"build_processes_running": False}

# ── per-AC status check (existing) ───────────────────────────────────────────

def check_one_ac(base_dir: Path, ticket: str, ac_id: str, timeout_minutes: int,
                 worktree_dir: Path = None, task_status: str = None,
                 story_key: str = None, repo_root: Path = None) -> dict:
    claim = check_claim(base_dir, ac_id)
    handoff = find_handoff(base_dir, ticket, ac_id) if not story_key else find_handoff(base_dir, story_key or ticket, ac_id)
    findings = check_findings(base_dir, ticket, ac_id)

    task_info = {"task_id": None, "exists": False, "complete": False, "alive": False}
    if claim.get("exists") and claim.get("task_id"):
        task_info["task_id"] = claim["task_id"]
        task_output = check_task_output(base_dir, claim["task_id"], timeout_minutes)
        task_info["exists"] = task_output.get("task_output_found", False)
        task_info["complete"] = task_output.get("complete", False)
        task_info["alive"] = task_output.get("fresh", False)
        task_info["age_minutes"] = task_output.get("age_minutes")

    if handoff.get("complete"):
        # Verify completion has actual code behind it
        sk = story_key or ticket
        verification = verify_ac_completion(base_dir, ticket, ac_id, sk, repo_root, worktree_dir)
        chain = validate_handoff_chain(base_dir, sk, ac_id)
        if verification["verified"] and chain["valid"]:
            return {
                "ac_id": ac_id, "status": "complete",
                "handoff_exists": True, "handoff_type": handoff.get("type"),
                "handoff_path": handoff.get("path"),
                "claim_exists": claim["exists"],
                "findings_file_exists": findings["exists"],
                "task": task_info,
                "verification": verification,
                "handoff_chain": chain,
            }
        else:
            reasons = []
            if not verification["verified"]:
                reasons.extend(verification["failures"])
            if not chain["valid"]:
                if chain["missing_stages"]:
                    reasons.append(f"handoff chain missing: {', '.join(chain['missing_stages'])}")
                if chain["incomplete_stages"]:
                    reasons.append(f"handoff chain incomplete: {', '.join(chain['incomplete_stages'])}")
            return {
                "ac_id": ac_id, "status": "needs_verification",
                "handoff_exists": True, "handoff_complete": True,
                "handoff_type": handoff.get("type"),
                "handoff_path": handoff.get("path"),
                "claim_exists": claim["exists"],
                "findings_file_exists": findings["exists"],
                "task": task_info,
                "verification": verification,
                "handoff_chain": chain,
                "needs_verification_reason": "; ".join(reasons),
            }

    if task_status in ("completed", "failed") and claim.get("exists"):
        return {
            "ac_id": ac_id, "status": "dead",
            "claim_exists": True, "claim_owner": claim.get("agent_id"),
            "handoff_exists": handoff["exists"], "handoff_complete": False,
            "findings_file_exists": findings["exists"],
            "task_status": task_status,
            "dead_reason": f"task API reports {task_status} but no complete handoff found",
        }

    agent_id = claim.get("agent_id") if claim.get("exists") else None
    progress_entries = check_audit_progress(base_dir, ticket, ac_id, agent_id=agent_id)
    result = {
        "ac_id": ac_id,
        "claim_exists": claim["exists"],
        "claim_owner": claim.get("agent_id"),
        "handoff_exists": handoff["exists"],
        "handoff_complete": handoff.get("complete", False),
        "findings_file_exists": findings["exists"],
        "findings_sections": findings.get("sections"),
    }
    if task_status:
        result["task_status"] = task_status

    if not claim["exists"]:
        result["status"] = "unknown"
        return result

    if not progress_entries:
        stale = is_claim_stale(claim)
        worktree_alive = False
        task_output_alive = task_info.get("alive", False)
        if task_info.get("task_id"):
            result["task"] = task_info
        if task_info.get("complete"):
            result["status"] = "dead"
            result["dead_reason"] = "task output file exists and is complete, but no handoff submitted"
            return result
        if stale and not task_output_alive:
            wt_path = claim.get("worktree_path")
            if wt_path:
                wt_info = check_worktree_activity(Path(wt_path), LEASE_TTL_MINUTES)
                worktree_alive = wt_info.get("worktree_changed", False)
                result["worktree"] = wt_info
        build_alive = False
        if stale and not task_output_alive and not worktree_alive:
            wt_path = claim.get("worktree_path") or ""
            if wt_path:
                b_info = check_build_processes(Path(wt_path))
                build_alive = b_info.get("build_processes_running", False)
                result["build_processes"] = b_info
        if stale and not task_output_alive and not worktree_alive and not build_alive:
            result["status"] = "unknown"
            result["stale_claim_released"] = True
            result["stale_claim_reason"] = f"claim age > {LEASE_TTL_MINUTES}m, no progress, no task output, no worktree changes, no build processes"
        else:
            result["status"] = "starting"
        return result

    last = progress_entries[-1]
    parsed = parse_progress_entry(last)
    last_ts = parse_ts(last.get("timestamp"))
    age_minutes = None
    if last_ts:
        age_minutes = round((datetime.now(timezone.utc) - last_ts).total_seconds() / 60, 1)

    result.update({
        "step": parsed["step"],
        "step_status": parsed["step_status"],
        "work": parsed["work"],
        "last_progress": last.get("timestamp"),
        "age_minutes": age_minutes,
        "timeout_minutes": timeout_minutes,
    })

    if age_minutes is not None and age_minutes >= timeout_minutes:
        task_id = claim.get("task_id")
        task_output_info = check_task_output(base_dir, task_id, timeout_minutes) if task_id else {}
        if task_output_info.get("complete"):
            result["status"] = "dead"
            result["dead_reason"] = "task output file exists and is complete, but no handoff submitted"
            result["task"] = {"task_id": task_id, "exists": True, "complete": True, "age_minutes": task_output_info.get("age_minutes")}
            return result
        worktree_dir_to_check = worktree_dir or (Path(claim.get("worktree_path")) if claim.get("worktree_path") else None)
        worktree_info = check_worktree_activity(worktree_dir_to_check, timeout_minutes) if worktree_dir_to_check else {}
        build_info = check_build_processes(worktree_dir_to_check) if worktree_dir_to_check else {}
        alive = task_output_info.get("fresh") or worktree_info.get("worktree_changed") or build_info.get("build_processes_running")
        if alive:
            result["status"] = "active"
            if task_output_info.get("fresh"):
                result["liveness"] = "task_output"
            elif worktree_info.get("worktree_changed"):
                result["liveness"] = "worktree"
            else:
                result["liveness"] = "build_processes"
        else:
            result["status"] = "stalled"
            if task_status == "running":
                result["task_api_alive"] = True
        if task_output_info:
            result["task_output"] = task_output_info
        if worktree_info:
            result["worktree"] = worktree_info
        if build_info:
            result["build_processes"] = build_info
    else:
        result["status"] = "active"

    return result


BASE_DIR = Path(__file__).resolve().parent.parent


# ── phase-scoped dispatch check ──────────────────────────────────────────────

def run_phase_check(base_dir: Path, ticket: str, phase: int, repo_root: Path | None,
                    timeout_minutes: int) -> dict:
    """Phase-scoped AC check with full dependency and dispatch classification."""
    et = _load_epic_tickets(base_dir)
    if et is None:
        return {"error": f"epic-tickets.py not found in {base_dir}/tools/"}

    # Load story-level deps (for phase computation)
    story_deps = et.find_epic_story_deps(str(base_dir), ticket)

    # Auto-release dead claims (stale + no task_id)
    dead_claims = cleanup_dead_claims(base_dir, ticket)

    # Load AC-level deps (for per-AC dependency verification)
    all_acs = et.find_local_acs(str(base_dir), ticket)

    # Compute phase stories
    phase_stories = get_phase_stories(story_deps, phase)

    # Read ACs Merged from Dupin handoff
    acs_merged = parse_acs_merged_from_handoff(base_dir, ticket)

    # Load epic branch from handoff
    epic_branch = None
    dupin_dir = base_dir / "handoffs" / "dupin"
    for f in dupin_dir.rglob(f"*{ticket}*.md"):
        try:
            content = f.read_text(encoding="utf-8")
            m = re.search(r'\*\*epic_branch:\*\*\s*`?([^`\n]+)`?', content)
            if m:
                epic_branch = m.group(1).strip()
                break
            m = re.search(r'"epic_branch":\s*"([^"]*)"', content)
            if m:
                epic_branch = m.group(1).strip()
                break
        except OSError:
            continue

    # Filter ACs to current phase
    phase_acs = [ac for ac in all_acs if ac["story_key"] in phase_stories]

    claims_dir = base_dir / "claims"
    ac_map = {}
    blocked = []
    blocked_details = []
    in_progress = []
    ready_to_merge = []
    needs_verification = []
    needs_verification_details = []
    recovered = []  # ACs with no claim but recent audit activity (anti-flap)

    for ac in phase_acs:
        ac_id = ac["ac_id"]
        story_key = ac["story_key"]
        dep_acs = ac.get("depends_on", [])

        # Normalize dep ACs: "AC1" -> "{story_key}-AC1"
        normalized_deps = []
        for d in dep_acs:
            if re.match(r"^AC\d+$", d):
                normalized_deps.append(f"{story_key}-{d}")
            else:
                normalized_deps.append(d)

        # Get worktree path from claim for file existence checks
        claim = check_claim(base_dir, ac_id)
        worktree_path = Path(claim["worktree_path"]) if claim.get("worktree_path") else None

        # Check claim, handoff, progress (existing logic)
        ac_status = check_one_ac(base_dir, ticket, ac_id, timeout_minutes, story_key=story_key, repo_root=repo_root, worktree_dir=worktree_path)

        # Check deps — ALL THREE must be true: handoffs + commit + merge
        deps_met, dep_details = check_ac_deps_met(
            ac_id, normalized_deps, acs_merged, repo_root,
            claims_dir, base_dir, story_key, epic_branch,
        )
        ac_status["story_key"] = story_key
        ac_status["deps_met"] = deps_met
        ac_status["dep_details"] = dep_details
        ac_status["blocked_by"] = [d["dep_ac"] for d in dep_details if not d["met"]]
        ac_status["normalized_deps"] = normalized_deps

        # ── Classify ──────────────────────────────────────────────────────────
        # RULE: An AC is only "completed" if it has ALL 4 handoff stages
        # (impl, commit-impl, qa, commit-qa) complete AND is in acs_merged.
        # Merged code without handoffs is unverified — flag for revert.
        handoff_done = ac_status.get("handoff_complete", False)
        claim_exists = ac_status.get("claim_exists", False)
        claim_status = ac_status.get("claim_status") or (check_claim(base_dir, ac_id).get("status") if claim_exists else None)

        chain = validate_handoff_chain(base_dir, story_key, ac_id)
        chain_valid = chain["valid"]
        in_acs_merged = ac_id in acs_merged

        if chain_valid:
            # All 4 handoff stages complete
            qa_result = parse_qa_result(base_dir, story_key, ac_id)

            if qa_result not in ("pass", "partial"):
                # QA didn't pass — AC is NOT done
                ac_status["dispatch_status"] = "blocked"
                ac_status["blocked_reason"] = f"qa_result_{qa_result or 'missing'}"
                ac_status["qa_result"] = qa_result
                ac_status["handoff_chain"] = chain
                blocked.append(ac_id)
                blocked_details.append({
                    "ac_id": ac_id,
                    "unmet_deps": [],
                    "reason": f"qa_result_{qa_result or 'missing'}",
                })
            elif in_acs_merged:
                # Handoffs complete AND merged — truly done
                ac_status["dispatch_status"] = "completed"
                ac_status["handoff_chain"] = chain
                ac_status["qa_result"] = qa_result
            else:
                # Handoffs complete but NOT merged — ready to merge
                ac_status["dispatch_status"] = "ready-to-merge"
                ac_status["handoff_chain"] = chain
                ac_status["qa_result"] = qa_result
                ready_to_merge.append(ac_id)
        else:
            # Handoff chain incomplete
            missing = chain.get("missing_stages", [])
            incomplete = chain.get("incomplete_stages", [])
            chain_failures = []
            if missing:
                chain_failures.append(f"missing: {', '.join(missing)}")
            if incomplete:
                chain_failures.append(f"incomplete: {', '.join(incomplete)}")
            chain_msg = "; ".join(chain_failures)

            if in_acs_merged:
                # Merged but no proof of verification — garbage, recommend revert
                ac_status["dispatch_status"] = "needs_verification"
                ac_status["blocked_reason"] = f"merged but handoff incomplete: {chain_msg}. Cannot verify — recommend revert."
                ac_status["handoff_chain"] = chain
                ac_status["verification_failures"] = chain_failures
                needs_verification.append(ac_id)
                needs_verification_details.append({
                    "ac_id": ac_id,
                    "reason": f"merged but handoff incomplete: {chain_msg}",
                    "action": "recommend revert — no proof of verification",
                    "verification_failures": chain_failures,
                })
            elif claim_exists and claim_status in ("claimed", "in_progress"):
                # Check if claim is stale but handoff is complete — if so, mark as completed
                if chain_valid:
                    # Handoff chain is complete — AC is done, ignore stale claim
                    ac_status["dispatch_status"] = "completed"
                    ac_status["handoff_chain"] = chain
                    qa_result = parse_qa_result(base_dir, story_key, ac_id)
                    ac_status["qa_result"] = qa_result
                elif is_claim_active(claim, base_dir, ac_id, timeout_minutes):
                    # Claim is active (has task_id or recent progress) — truly in progress
                    ac_status["dispatch_status"] = "in_progress"
                    in_progress.append(ac_id)
                else:
                    # Claim is stale but handoff incomplete — treat as dispatchable
                    ac_status["dispatch_status"] = "dispatchable"
            elif deps_met:
                # Ready for dispatch — stage determined later by determine_next_stage()
                ac_status["dispatch_status"] = "dispatchable"
            else:
                ac_status["dispatch_status"] = "blocked"
                unmet = [d["dep_ac"] for d in dep_details if not d["met"]]
                blocked.append(ac_id)
                blocked_details.append({"ac_id": ac_id, "unmet_deps": unmet})

        ac_map[ac_id] = ac_status

    # Build dispatch[] — single source of truth for what to dispatch
    # Includes ACs that are ready for dispatch (dispatchable or completed)
    dispatch = []
    for acid, s in ac_map.items():
        ds = s.get("dispatch_status")
        if ds not in ("dispatchable", "completed"):
            continue
        # Determine next stage from handoff chain
        chain_data = s.get("handoff_chain") or validate_handoff_chain(base_dir, s.get("story_key", ticket), acid)
        chain = chain_data.get("chain", chain_data) if isinstance(chain_data, dict) else {}
        next_stage = determine_next_stage(chain)
        if next_stage is None:
            continue  # all stages complete — should be ready_to_merge
        # DOUBLE-CHECK: Verify the suggested stage actually doesn't exist
        # This prevents re-dispatching stages that have already completed
        stage_info = chain.get(next_stage, {})
        if stage_info.get("exists") and stage_info.get("complete"):
            # Stage is already complete — skip, should be marked as ready_to_merge
            continue
        # Determine if re-dispatch
        is_redisplay = s.get("status") in ("dead", "stalled", "needs_verification")
        resume_findings = get_findings_path(base_dir, s.get("story_key", ticket), acid) if is_redisplay else None
        dispatch.append({
            "ac_id": acid,
            "stage": next_stage,
            "is_redisplay": is_redisplay,
            "resume_findings": resume_findings,
        })

    # Sort dispatch: re-dispatches first (fix broken agents), then first-time
    dispatch.sort(key=lambda d: (0 if d["is_redisplay"] else 1, DISPATCH_STAGES.index(d["stage"]), d["ac_id"]))

    # Hard concurrency cap: count already-running agents (active + starting),
    # then cap dispatch[] to slots_remaining.
    running_count = sum(
        1 for s in ac_map.values()
        if s.get("status") in ("active", "starting")
    )
    slots_remaining = max(0, MAX_CONCURRENT_AGENTS - running_count)

    concurrency_capped = []
    dispatch_allowed = dispatch[:slots_remaining]
    dispatch_capped = dispatch[slots_remaining:]
    for entry in dispatch_capped:
        concurrency_capped.append(entry["ac_id"])
        ac_map[entry["ac_id"]]["concurrency_capped"] = True
    dispatch = dispatch_allowed

    return {
        "ticket": ticket,
        "phase": phase,
        "phase_stories": phase_stories,
        "acs_merged": acs_merged,
        "epic_branch": epic_branch,
        "acs": ac_map,
        "dispatch": dispatch,
        "recovered": recovered,
        "blocked": blocked,
        "blocked_details": blocked_details,
        "in_progress": in_progress,
        "ready_to_merge": ready_to_merge,
        "needs_verification": needs_verification,
        "needs_verification_details": needs_verification_details,
        "concurrency_capped": concurrency_capped,
        "dead_claims_released": dead_claims,
        "concurrency": {
            "max": MAX_CONCURRENT_AGENTS,
            "running": running_count,
            "slots_remaining": slots_remaining,
        },
        "summary": {
            "total_acs": len(phase_acs),
            "dispatch": len(dispatch),
            "recovered": len(recovered),
            "blocked": len(blocked),
            "in_progress": len(in_progress),
            "ready_to_merge": len(ready_to_merge),
            "needs_verification": len(needs_verification),
            "concurrency_capped": len(concurrency_capped),
            "dead_claims_released": len(dead_claims),
        },
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: $UB check-agent-progress <ticket> --phase <N> --repo-root <path> [--timeout N]",
              file=sys.stderr)
        sys.exit(1)

    base_dir = BASE_DIR
    ticket = sys.argv[1]

    timeout = 20
    if "--timeout" in sys.argv:
        idx = sys.argv.index("--timeout")
        if idx + 1 < len(sys.argv):
            timeout = int(sys.argv[idx + 1])

    # --phase N: phase-scoped mode with dependency checking (ONLY MODE)
    if "--phase" in sys.argv:
        idx = sys.argv.index("--phase")
        if idx + 1 >= len(sys.argv):
            print("--phase requires a phase number", file=sys.stderr)
            sys.exit(1)
        try:
            phase = int(sys.argv[idx + 1])
        except ValueError:
            print(f"Invalid phase: {sys.argv[idx + 1]}", file=sys.stderr)
            sys.exit(1)

        repo_root = None
        for i, arg in enumerate(sys.argv[3:], start=3):
            if arg == "--repo-root" and i + 1 < len(sys.argv):
                repo_root = Path(sys.argv[i + 1])

        result = run_phase_check(base_dir, ticket, phase, repo_root, timeout)
        print(json.dumps(result, indent=2, default=str))
        return

    # No other modes supported
    print("Error: Only --phase mode is supported.", file=sys.stderr)
    print("Usage: $UB check-agent-progress <ticket> --phase <N> --repo-root <path> [--timeout N]", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
