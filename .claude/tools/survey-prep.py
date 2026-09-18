#!/usr/bin/env python3
"""survey-prep.py -- Luke S2 survey preparation in one call.

Runs pre-scan, pre-scan-rust, check-unused-deps, find-helper-duplication, and
map-token-usage concurrently, then sequentially runs c4-extract, c4-render, and
generate-artifact-skeletons. Replaces ~10 sequential UB calls.

Contract:  python survey-prep.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB survey-prep --repo-root <repo_root>
    $UB survey-prep --repo-root <repo_root> --output-dir <path>

Output:
    JSON envelope with paths to all generated files.
    Sub-step failures print [WARN] lines to stderr -- partial results are preserved.

Exit codes: 0 prepared · 1 usage/validation · 4 not found (repo root)
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

TOOLS_DIR = Path(__file__).parent
BASE_DIR = Path(__file__).resolve().parent.parent

from toolkit import Tool, UsageError, NotFound, audit_append


def run_script(script_name, args, capture_stdout=False):
    """Run a script from TOOLS_DIR. Returns (success, stdout, stderr)."""
    script_path = TOOLS_DIR / script_name
    if not script_path.exists():
        return False, "", f"Script not found: {script_path}"
    cmd = [sys.executable, str(script_path)] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False, result.stdout, result.stderr
    return True, result.stdout, result.stderr


def parse_envelope(stdout):
    """Parse a GPTS tool's JSON envelope from stdout. None if unparseable/not a dict."""
    try:
        doc = json.loads(stdout)
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
    return doc if isinstance(doc, dict) else None


def failure_reason(stdout, stderr):
    """Prefer the GPTS envelope's reason; fall back to stderr/stdout text."""
    doc = parse_envelope(stdout)
    if doc and doc.get("reason"):
        return str(doc["reason"]).strip()
    return (stderr or stdout or "unknown error").strip()


def envelope_data(stdout):
    """Extract the 'data' payload from a GPTS envelope; None if absent."""
    doc = parse_envelope(stdout)
    if doc and isinstance(doc.get("data"), dict):
        return doc["data"]
    return None


def script_accepts_flag(script_name, flag):
    """Check if a script accepts a given flag by inspecting its --help output."""
    script_path = TOOLS_DIR / script_name
    if not script_path.exists():
        return False
    result = subprocess.run(
        [sys.executable, str(script_path), "--help"],
        capture_output=True, text=True
    )
    return flag in result.stdout or flag in result.stderr


def run_parallel_analysis(repo_root, tmp_dir):
    """Run the 5 analysis scripts concurrently. Returns dict of output paths."""
    os.makedirs(str(tmp_dir), exist_ok=True)

    pre_scan_json = tmp_dir / "pre-scan.json"
    pre_scan_rust_json = tmp_dir / "pre-scan-rust.json"
    unused_deps_json = tmp_dir / "unused-deps.json"
    duplication_json = tmp_dir / "duplication.json"
    token_usage_json = tmp_dir / "token-usage.json"

    def run_pre_scan():
        ok, out, err = run_script("pre-scan.py", ["--repo-root", str(repo_root), "--json"])
        if not ok:
            print(f"[WARN] pre-scan.py failed: {failure_reason(out, err)}", file=sys.stderr)
            return None
        data = envelope_data(out)
        if data is None:
            print("[WARN] pre-scan.py: no 'data' payload in envelope", file=sys.stderr)
            return None
        pre_scan_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return str(pre_scan_json)

    def run_pre_scan_rust():
        """Run pre-scan-rust if the repo contains Rust code."""
        if not any(repo_root.glob("*/Cargo.toml")) and not (repo_root / "Cargo.toml").exists():
            return None  # No Rust in this repo
        ok, out, err = run_script("pre-scan-rust.py", ["--repo-root", str(repo_root), "--json"])
        if not ok:
            print(f"[WARN] pre-scan-rust.py failed: {failure_reason(out, err)}", file=sys.stderr)
            return None
        data = envelope_data(out)
        if data is None:
            print("[WARN] pre-scan-rust.py: no 'data' payload in envelope", file=sys.stderr)
            return None
        pre_scan_rust_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return str(pre_scan_rust_json)

    def run_unused_deps():
        ok, out, err = run_script("check-unused-deps.py", ["--repo-root", str(repo_root)])
        if not ok:
            print(f"[WARN] check-unused-deps.py failed: {failure_reason(out, err)}", file=sys.stderr)
            return None
        data = envelope_data(out)
        if data is None:
            print("[WARN] check-unused-deps.py: no 'data' payload in envelope", file=sys.stderr)
            return None
        unused_deps_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return str(unused_deps_json)

    def run_duplication():
        # Check if --json flag is supported
        if script_accepts_flag("find-helper-duplication.py", "--json"):
            ok, out, err = run_script(
                "find-helper-duplication.py", ["--repo-root", str(repo_root), "--json"]
            )
        else:
            ok, out, err = run_script("find-helper-duplication.py", ["--repo-root", str(repo_root)])
        if not ok:
            print(f"[WARN] find-helper-duplication.py failed: {failure_reason(out, err)}", file=sys.stderr)
            return None
        data = envelope_data(out)
        if data is None:
            print("[WARN] find-helper-duplication.py: no 'data' payload in envelope", file=sys.stderr)
            return None
        duplication_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return str(duplication_json)

    def run_token_usage():
        ok, out, err = run_script("map-token-usage.py", ["--repo-root", str(repo_root), "--json"])
        if not ok:
            print(f"[WARN] map-token-usage.py failed: {failure_reason(out, err)}", file=sys.stderr)
            return None
        token_usage_json.write_text(out, encoding="utf-8")
        return str(token_usage_json)

    tasks = {
        "pre_scan": run_pre_scan,
        "pre_scan_rust": run_pre_scan_rust,
        "unused_deps": run_unused_deps,
        "duplication": run_duplication,
        "token_usage": run_token_usage,
    }

    results = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fn): key for key, fn in tasks.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                print(f"[WARN] {key} raised exception: {exc}", file=sys.stderr)
                results[key] = None

    return results


def run_c4(repo_root, output_dir):
    """Run c4-extract and c4-render. Returns (c4_json_path, c4_html_path)."""
    c4_json = output_dir / "c4-skeleton.json"
    c4_html = output_dir / "c4.html"

    # c4-extract (GPTS) emits an envelope; the C4 JSON is under "data"
    ok, out, err = run_script("c4-extract.py", ["--repo-root", str(repo_root)])
    if not ok:
        print(f"[WARN] c4-extract.py failed: {failure_reason(out, err)}", file=sys.stderr)
        return None, None
    data = envelope_data(out)
    if data is None:
        print("[WARN] c4-extract.py: no 'data' payload in envelope", file=sys.stderr)
        return None, None
    c4_json.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # c4-render (GPTS) reads the JSON and writes HTML
    ok, out, err = run_script(
        "c4-render.py", ["--c4-data", str(c4_json), "--output", str(c4_html)]
    )
    if not ok:
        print(f"[WARN] c4-render.py failed: {failure_reason(out, err)}", file=sys.stderr)
        return str(c4_json), None

    return str(c4_json), str(c4_html)


def run_artifact_skeletons(repo_root, pre_scan_path, duplication_path, output_dir):
    """Run generate-artifact-skeletons. Returns count of files written."""
    args = ["--repo-root", str(repo_root)]
    if pre_scan_path:
        args += ["--pre-scan", str(pre_scan_path)]
    if duplication_path:
        args += ["--duplication", str(duplication_path)]

    ok, out, err = run_script("generate-artifact-skeletons.py", args)
    if not ok:
        print(f"[WARN] generate-artifact-skeletons.py failed: {failure_reason(out, err)}", file=sys.stderr)
        return 0

    doc = parse_envelope(out)
    if doc and isinstance(doc.get("written"), int):
        return doc["written"]
    # Fallback for legacy (pre-GPTS) copies of the tool in repo-local .claude/tools/
    return sum(1 for line in out.splitlines() if "[write]" in line)


def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.is_dir():
        raise NotFound(
            f"repo_root does not exist or is not a directory: {repo_root}",
            "pass an existing repository directory: $UB survey-prep --repo-root <repo-root>",
        )

    if v.get("--output-dir"):
        output_dir = Path(v["--output-dir"]).resolve()
    else:
        output_dir = repo_root / ".claude" / "codebase"

    os.makedirs(str(output_dir), exist_ok=True)
    tmp_dir = output_dir / "survey_tmp"

    # Step 1: parallel analysis
    analysis = run_parallel_analysis(repo_root, tmp_dir)

    # Step 2: c4-extract + c4-render (sequential, after analysis)
    c4_json, c4_html = run_c4(repo_root, output_dir)

    # Step 3: generate-artifact-skeletons (sequential, needs pre-scan + duplication)
    skeletons_written = run_artifact_skeletons(
        repo_root,
        analysis.get("pre_scan"),
        analysis.get("duplication"),
        output_dir,
    )

    audit_append(Path(v["--base"]), "survey-prep", "prepare", key=str(repo_root), result="prepared")

    return {
        "status": "prepared",
        "repo_root": str(repo_root),
        "output_dir": str(output_dir),
        "pre_scan": analysis.get("pre_scan"),
        "pre_scan_rust": analysis.get("pre_scan_rust"),
        "unused_deps": analysis.get("unused_deps"),
        "duplication": analysis.get("duplication"),
        "token_usage": analysis.get("token_usage"),
        "c4_json": c4_json,
        "c4_html": c4_html,
        "skeletons_written": skeletons_written,
    }


TOOL = Tool(
    name="survey-prep",
    version="1.0",
    summary="Luke S2 survey prep — run pre-scan, pre-scan-rust (when Cargo.toml present), check-unused-deps, find-helper-duplication, map-token-usage in parallel, then c4-extract + c4-render and generate-artifact-skeletons sequentially.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Path to the repository root (must exist)."},
        "--output-dir": {"required": False, "type": "path",
                         "description": "Output directory for artifacts (default: <repo-root>/.claude/codebase/)."},
    },
    exit_codes={
        "0": "prepared — payload carries paths to generated files (failed sub-steps report null paths; [WARN] lines on stderr)",
        "1": "usage or validation error",
        "4": "not found: repo root does not exist or is not a directory",
    },
    examples=["$UB survey-prep --repo-root /path/to/myrepo"],
    idempotent="Re-running regenerates the analysis JSONs, C4 skeleton/HTML, and deterministic skeleton files.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
