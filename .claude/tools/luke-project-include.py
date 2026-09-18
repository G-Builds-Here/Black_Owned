#!/usr/bin/env python3
"""Add Luke-generated files under .claude/ to the project and solution.

For dotnet repos: adds <None Include> entries to the main .csproj for any
.claude/ files not already included. Also adds/updates a
solution folder in the .sln.

Contract:  python luke-project-include.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB luke-project-include --repo-root <repo-root>
    $UB luke-project-include --repo-root <repo-root> --dry-run

Output: JSON envelope — payload carries {"csproj_updated": bool, "sln_updated": bool,
        "added": [...], "skipped": [...]} (plus csproj/sln notes where applicable).

Exit codes: 0 included/no-op · 1 usage/validation · 3 precondition (no Luke files to include) · 4 not found (repo root)
"""

import os
import re
from pathlib import Path

from toolkit import Tool, UsageError, Precondition, NotFound, audit_append

BASE_DIR = Path(__file__).resolve().parent.parent


SKIP_EXTENSIONS = set()  # no blanket extension skips — use SKIP_FILES for specifics
SKIP_FILES = {'settings.local.json'}
# JSON sidecars (.claude/codebase/*.json) are excluded below by checking if a same-named .md exists

LUKE_DIRS = ['.claude']


def find_main_csproj(repo_root):
    """Find the main (non-Features) .csproj in the repo root."""
    for f in os.listdir(repo_root):
        if f.endswith('.csproj') and os.path.isfile(os.path.join(repo_root, f)):
            return os.path.join(repo_root, f)
    return None


def find_sln(repo_root):
    """Find the .sln file in the repo root."""
    for f in os.listdir(repo_root):
        if f.endswith('.sln') and os.path.isfile(os.path.join(repo_root, f)):
            return os.path.join(repo_root, f)
    return None


def ensure_memory_gitkeep(repo_root):
    """Ensure .claude/memory/.gitkeep exists so git tracks the empty directory."""
    memory_dir = os.path.join(repo_root, '.claude', 'memory')
    gitkeep = os.path.join(memory_dir, '.gitkeep')
    if os.path.isdir(memory_dir) and not os.path.exists(gitkeep):
        open(gitkeep, 'w').close()


def collect_luke_files(repo_root):
    """Collect all .claude/ files that should be included (incl. .claude/codebase/ docs)."""
    ensure_memory_gitkeep(repo_root)
    files = []
    for dir_rel in LUKE_DIRS:
        dir_abs = os.path.join(repo_root, dir_rel)
        if not os.path.isdir(dir_abs):
            continue
        for abs_path, dirs, filenames in os.walk(dir_abs):
            dirs[:] = [d for d in dirs if d not in {'node_modules', '__pycache__'}]
            for fname in filenames:
                if fname in SKIP_FILES:
                    continue
                full = os.path.join(abs_path, fname)
                # Skip JSON sidecars — files where a same-named .md exists alongside them
                if Path(fname).suffix.lower() == '.json':
                    if os.path.exists(os.path.join(abs_path, Path(fname).stem + '.md')):
                        continue
                rel = os.path.relpath(full, repo_root).replace('/', '\\')
                files.append(rel)
    return sorted(files)


def get_existing_none_includes(csproj_content):
    """Extract all existing <None Include="..."> paths from csproj."""
    return {
        m.group(1).replace('/', '\\').lower()
        for m in re.finditer(r'<None\s+Include="([^"]+)"', csproj_content, re.IGNORECASE)
    }


def update_csproj(csproj_path, files_to_add, dry_run=False):
    """Add <None Include> entries for missing files. Returns (added, skipped)."""
    with open(csproj_path, 'r', encoding='utf-8') as f:
        content = f.read()

    existing = get_existing_none_includes(content)
    to_add = [f for f in files_to_add if f.lower() not in existing]
    skipped = [f for f in files_to_add if f.lower() in existing]

    if not to_add:
        return [], skipped

    # Build the new ItemGroup
    items = '\n'.join(f'\t  <None Include="{f}" />' for f in to_add)
    new_group = f'\n\t<ItemGroup>\n{items}\n\t</ItemGroup>\n'

    # Insert before </Project>
    new_content = content.replace('</Project>', new_group + '</Project>')

    if not dry_run:
        with open(csproj_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

    return to_add, skipped


def update_sln(sln_path, files_to_add, dry_run=False):
    """Add or update a 'Claude' solution folder in the .sln."""
    with open(sln_path, 'r', encoding='utf-8') as f:
        content = f.read()

    FOLDER_GUID = '{C1A2B3D4-E5F6-4789-ABCD-EF0123456789}'
    FOLDER_TYPE = '{2150E333-8FDC-42A3-9474-1A3956D46DE8}'

    # Build solution items block
    items = '\n'.join(f'\t\t{f} = {f}' for f in files_to_add)
    new_folder = (
        f'Project("{FOLDER_TYPE}") = "Claude", "Claude", "{FOLDER_GUID}"\n'
        f'\tProjectSection(SolutionItems) = preProject\n'
        f'{items}\n'
        f'\tEndProjectSection\n'
        f'EndProject\n'
    )

    # Check if folder already exists
    if FOLDER_GUID in content:
        # Replace the existing block
        pattern = re.compile(
            r'Project\("[^"]+"\) = "Claude".*?EndProject\n',
            re.DOTALL
        )
        if pattern.search(content):
            new_content = pattern.sub(lambda _: new_folder, content)
        else:
            new_content = content  # guid exists but pattern didn't match — leave alone
    else:
        # Insert before Global
        new_content = content.replace('Global\n', new_folder + 'Global\n')

    if new_content == content:
        return False

    if not dry_run:
        with open(sln_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

    return True


def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.is_dir():
        raise NotFound(
            f"repo root not found: {repo_root}",
            "pass an existing repository directory: $UB luke-project-include --repo-root <repo-root>",
        )

    dry_run = bool(v.get("--dry-run", False))
    base = Path(v["--base"])

    files = collect_luke_files(str(repo_root))

    if not files:
        raise Precondition(
            "No .claude/ files found — nothing to include",
            "run the Luke survey S4/S5 first ($UB survey-finalize --repo-root "
            f"{repo_root}) so .claude/ content exists, then re-run",
        )

    result = {"csproj_updated": False, "sln_updated": False, "added": [], "skipped": [], "dry_run": dry_run}

    csproj = find_main_csproj(str(repo_root))
    if csproj:
        added, skipped = update_csproj(csproj, files, dry_run=dry_run)
        result["csproj_updated"] = bool(added)
        result["added"] = added
        result["skipped"] = skipped
        result["csproj"] = os.path.basename(csproj)
    else:
        result["csproj_note"] = "No .csproj found at repo root — skipped"

    sln = find_sln(str(repo_root))
    if sln:
        updated = update_sln(sln, files, dry_run=dry_run)
        result["sln_updated"] = updated
        result["sln"] = os.path.basename(sln)
    else:
        result["sln_note"] = "No .sln found at repo root — skipped"

    if not dry_run:
        audit_append(base, "luke-project-include", "include", key=str(repo_root), result="included")

    result["repo_root"] = str(repo_root)
    result["status"] = "dry_run" if dry_run else "included"
    return result


TOOL = Tool(
    name="luke-project-include",
    version="1.0",
    summary="Include Luke-generated files under .claude/ (incl. codebase/ survey docs) in a dotnet project: add <None Include> entries to the main .csproj and a 'Claude' solution folder to the .sln.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Path to the repository root (must exist)."},
        "--dry-run": {"required": False, "type": "bool",
                      "description": "Report changes without writing."},
    },
    exit_codes={
        "0": "included (or dry-run reported) — payload carries csproj_updated, sln_updated, added, skipped",
        "1": "usage or validation error",
        "3": "precondition: no .claude/ files found to include",
        "4": "not found: repo root does not exist",
    },
    examples=[
        "$UB luke-project-include --repo-root /path/to/myrepo",
        "$UB luke-project-include --repo-root /path/to/myrepo --dry-run",
    ],
    idempotent="Files already <None Include>d are reported in 'skipped' and not duplicated.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
