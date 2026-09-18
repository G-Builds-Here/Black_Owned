#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pre-scan a Rust repository to extract structural/mechanical data for survey subagents.

Produces a structured JSON summary of everything a subagent needs to know before
doing judgment work: project layout, crate dependencies, test groups, HTTP endpoints,
async patterns, database access. Eliminates redundant discovery across multiple subagents.

Contract:  python pre-scan-rust.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB pre-scan-rust --repo-root <repo_root>
    $UB pre-scan-rust --repo-root <repo_root> --markdown

Output: JSON envelope; "data" carries the legacy scan document (Cargo projects,
config files, environments, env resolution, test groups, static state,
endpoints, db access, async patterns, directory_tree, summary). With --markdown
the payload also carries "markdown" (legacy rendering).

Exit codes: 0 scanned · 1 usage/validation · 4 not found (repo root)
"""

import json
import os
import re
import sys
import io
from pathlib import Path

from toolkit import Tool, NotFound


SKIP_DIRS = {'target', 'node_modules', '.git', '.claude', '.worktrees', 'vendor', 'benchmarks', 'examples'}


def walk_files(repo_root, extensions=None):
    """Walk repo yielding (abs_path, rel_path) tuples, skipping build dirs."""
    for root, dirs, files in os.walk(repo_root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if extensions and not any(f.endswith(ext) for ext in extensions):
                continue
            abs_path = os.path.join(root, f)
            rel_path = os.path.relpath(abs_path, repo_root)
            yield abs_path, rel_path


def read_file(path):
    """Read file content, return empty string on failure."""
    try:
        return open(path, 'r', encoding='utf-8-sig').read()
    except (IOError, UnicodeDecodeError):
        return ''


# --- Project structure ---

def scan_cargo_projects(repo_root):
    """Parse Cargo.toml files for project structure."""
    projects = []

    for abs_path, rel_path in walk_files(repo_root, ['Cargo.toml']):
        content = read_file(abs_path)
        if not content:
            continue

        # Extract package info
        name_match = re.search(r'^name\s*=\s*"([^"]+)"', content, re.MULTILINE)
        version_match = re.search(r'^version\s*=\s*"([^"]+)"', content, re.MULTILINE)
        edition_match = re.search(r'^edition\s*=\s*"([^"]+)"', content, re.MULTILINE)

        if not name_match:
            continue

        proj_name = name_match.group(1)
        proj = {
            'path': rel_path,
            'name': proj_name,
            'type': 'unknown',
            'edition': edition_match.group(1) if edition_match else '2021',
            'version': version_match.group(1) if version_match else 'unknown',
            'packages': [],
            'features': {},
            'excluded_dirs': [],
        }

        # Detect project type from [lib] or [[bin]] sections
        has_lib = bool(re.search(r'\[lib\]', content))
        has_bin = bool(re.search(r'\[\[bin\]\]', content))

        # Check for test dependencies
        test_deps = ['criterion', 'mockall', 'proptest', 'quickcheck', 'testcontainers']
        content_lower = content.lower()
        if any(dep in content_lower for dep in test_deps):
            proj['type'] = 'test'
        elif has_bin:
            proj['type'] = 'executable'
        elif has_lib:
            proj['type'] = 'library'
        else:
            # Check if it's a workspace member
            parent = Path(abs_path).parent
            workspace_toml = parent.parent / 'Cargo.toml'
            if workspace_toml.exists():
                workspace_content = read_file(str(workspace_toml))
                if f'path = "{rel_path}"' in workspace_content or f'path = "./{Path(rel_path).parent}"' in workspace_content:
                    proj['type'] = 'library'

        # Extract dependencies
        dep_section = re.search(r'\[dependencies\](.*?)(?=\n\[|\Z)', content, re.DOTALL)
        if dep_section:
            deps_text = dep_section.group(1)
            for dep_match in re.finditer(r'^([\w-]+)\s*=', deps_text, re.MULTILINE):
                dep_name = dep_match.group(1)
                # Check if it's a dev dependency
                dev_section = re.search(r'\[dev-dependencies\](.*?)(?=\n\[|\Z)', content, re.DOTALL)
                is_dev = dev_section and dep_name in dev_section.group(1)
                proj['packages'].append({
                    'name': dep_name,
                    'version': 'specified',
                    'is_dev': is_dev,
                })

        # Extract features
        features_section = re.search(r'\[features\](.*?)(?=\n\[|\Z)', content, re.DOTALL)
        if features_section:
            features_text = features_section.group(1)
            for feat_match in re.finditer(r'^([\w-]+)\s*=\s*\[(.*?)\]', features_text, re.DOTALL):
                feat_name = feat_match.group(1)
                feat_deps = [d.strip().strip('"\'') for d in feat_match.group(2).split(',') if d.strip()]
                proj['features'][feat_name] = feat_deps

        # Check for common Rust patterns to refine type
        if 'axum' in content_lower or 'actix' in content_lower or 'warp' in content_lower:
            proj['type'] = 'web'
        elif 'tokio' in content_lower and 'worker' in content_lower:
            proj['type'] = 'worker'
        elif 'testcontainers' in content_lower:
            proj['type'] = 'integration-test'

        projects.append(proj)

    return projects


# --- Config files ---

def scan_config_files(repo_root):
    """Find configuration files."""
    configs = []
    environments = set()

    for abs_path, rel_path in walk_files(repo_root):
        filename = os.path.basename(rel_path)

        # .env files
        if filename.startswith('.env'):
            env_name = filename.replace('.env', '') or 'default'
            configs.append({
                'path': rel_path,
                'type': 'env-file',
                'environment': env_name,
            })
            if env_name != 'default':
                environments.add(env_name)
            continue

        # Cargo config
        if filename == 'config.toml' and 'target' in rel_path.lower():
            configs.append({
                'path': rel_path,
                'type': 'cargo-config',
                'environment': None,
            })
            continue

        # Docker Compose
        if 'docker-compose' in filename.lower() and (filename.endswith('.yml') or filename.endswith('.yaml')):
            configs.append({
                'path': rel_path,
                'type': 'docker-compose',
                'environment': None,
            })
            continue

    return configs, sorted(environments)


# --- Environment resolution ---

def scan_env_resolution(repo_root):
    """Find how the codebase resolves environment variables."""
    env_reads = []
    seen_vars = set()

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # dotenv! macro usage
        for match in re.finditer(r'dotenv!\s*\(\s*"([^"]+)"\s*\)', content):
            line_num = content[:match.start()].count('\n') + 1
            env_reads.append({
                'file': rel_path,
                'line': line_num,
                'var_name': match.group(1),
                'method': 'dotenv macro',
            })

        # std::env::var usage
        for match in re.finditer(r'std::env::var\s*\(\s*"([^"]+)"', content):
            line_num = content[:match.start()].count('\n') + 1
            env_reads.append({
                'file': rel_path,
                'line': line_num,
                'var_name': match.group(1),
                'method': 'std::env::var',
            })

        # env! macro usage — deduplicated across the whole scan
        for match in re.finditer(r'env!\s*\(\s*"([^"]+)"', content):
            line_num = content[:match.start()].count('\n') + 1
            var_name = match.group(1)
            if var_name not in seen_vars:
                seen_vars.add(var_name)
                env_reads.append({
                    'file': rel_path,
                    'line': line_num,
                    'var_name': var_name,
                    'method': 'env! macro',
                })

        # figment / config crate patterns
        for match in re.finditer(r'\.select\s*\(\s*["\'](\w+)["\']', content):
            line_num = content[:match.start()].count('\n') + 1
            env_reads.append({
                'file': rel_path,
                'line': line_num,
                'var_name': match.group(1),
                'method': 'figment select',
            })

    return env_reads


# --- Test groups ---

def scan_test_groups(repo_root):
    """Find all test modules and their structure."""
    groups = {}

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # Test modules
        for match in re.finditer(r'#\[cfg\s*\(\s*test\s*\)\]\s*mod\s+(\w+)', content):
            module_name = match.group(1)
            if module_name not in groups:
                groups[module_name] = {'name': module_name, 'files': [], 'test_count': 0}
            if rel_path not in groups[module_name]['files']:
                groups[module_name]['files'].append(rel_path)

        # Count test functions
        test_count = len(re.findall(r'#\[test\]\s*fn\s+\w+', content))
        if test_count > 0:
            # Find which module this belongs to
            module_match = re.search(r'mod\s+(\w+)\s*\{', content[:content.find('#[test]') if '#[test]' in content else len(content)])
            if module_match:
                mod_name = module_match.group(1)
                if mod_name in groups:
                    groups[mod_name]['test_count'] += test_count

        # Integration test files (tests/ directory)
        if 'tests/' in rel_path:
            test_name = Path(rel_path).stem
            if test_name not in groups:
                groups[test_name] = {'name': test_name, 'files': [], 'test_count': 0}
            groups[test_name]['files'].append(rel_path)
            # Count tests in integration file
            test_count = len(re.findall(r'#\[test\]\s*fn\s+\w+', content))
            groups[test_name]['test_count'] += test_count

    return sorted(groups.values(), key=lambda g: g['name'])


# --- Static state ---

def scan_static_state(repo_root):
    """Find static singletons, lazy statics, and shared state in Rust code."""
    statics = []

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # lazy_static! macro
        for match in re.finditer(r'lazy_static!\s*\{\s*static\s+pub\s+(?:fn\s+)?(\w+)', content):
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': 'lazy_static',
                'member': match.group(1),
                'kind': 'lazy static',
                'file': rel_path,
                'line': line_num,
            })

        # static keyword (unsafe or const)
        for match in re.finditer(r'(?:pub\s+)?(?:static\s+|static\s+mut\s+|const\s+)(\w+)', content):
            static_name = match.group(1)
            # Skip common non-state constants
            if static_name.upper() in ('MAX', 'MIN', 'LEN', 'VERSION', 'NAME', 'DESC'):
                continue
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': 'static',
                'member': static_name,
                'kind': 'static',
                'file': rel_path,
                'line': line_num,
            })

        # OnceCell / Lazy patterns
        for match in re.finditer(r'(?:static\s+)?(?:pub\s+)?(?:static\s+)?(\w+):\s*(?:once_cell::sync::|std::sync::)?(?:Lazy|OnceCell)', content):
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': 'once_cell',
                'member': match.group(1),
                'kind': 'OnceCell/Lazy',
                'file': rel_path,
                'line': line_num,
            })

        # Singleton patterns (static ref, etc.)
        for match in re.finditer(r'static\s+ref\s+(\w+)', content):
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': 'static_ref',
                'member': match.group(1),
                'kind': 'static ref',
                'file': rel_path,
                'line': line_num,
            })

    return sorted(statics, key=lambda s: (s['class'], s['member']))


# --- Base classes and fixtures ---

def scan_base_classes(repo_root):
    """Find trait implementations and test fixtures in Rust."""
    bases = []

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # Trait implementations
        for match in re.finditer(r'impl\s+(\w+)\s+for\s+(\w+)', content):
            trait_name = match.group(1)
            impl_name = match.group(2)
            line_num = content[:match.start()].count('\n') + 1
            bases.append({
                'name': impl_name,
                'trait': trait_name,
                'file': rel_path,
                'line': line_num,
                'type': 'trait_impl',
            })

        # Test fixtures (structs with Default or constructor patterns)
        for match in re.finditer(r'pub\s+struct\s+(\w+)\s*\{', content):
            struct_name = match.group(1)
            # Check if it has a new() or default() method
            has_new = bool(re.search(rf'impl\s+\w+.*?pub\s+fn\s+new\s*\(', content, re.DOTALL))
            has_default = bool(re.search(rf'impl\s+Default\s+for\s+{struct_name}', content))
            if has_new or has_default:
                bases.append({
                    'name': struct_name,
                    'file': rel_path,
                    'constructor_params': 'new()' if has_new else 'default()' if has_default else None,
                    'parent': None,
                    'provides': [],
                    'type': 'fixture',
                })

    return bases


# --- Fixtures ---

def scan_fixtures(repo_root):
    """Find test fixture registrations."""
    fixtures = []

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # Testcontainers fixtures
        if 'testcontainers' in content.lower():
            for match in re.finditer(r'ContainerRunnable(?:<(\w+)>)?', content):
                fixtures.append({
                    'name': match.group(1) or 'Container',
                    'registration_file': rel_path,
                    'type': 'testcontainer',
                })

        # tokio test macros
        if '#[tokio::test]' in content:
            fixtures.append({
                'name': 'tokio-runtime',
                'registration_file': rel_path,
                'type': 'async-runtime',
            })

    return fixtures


# --- Endpoints ---

def scan_endpoints(repo_root):
    """Find HTTP endpoints from Axum/Actix/Warp routes."""
    endpoints = []
    seen = set()

    # Axum patterns
    AXUM_PATTERNS = [
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*get\s*\(\s*(\w+)\s*\)', 'GET'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*post\s*\(\s*(\w+)\s*\)', 'POST'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*put\s*\(\s*(\w+)\s*\)', 'PUT'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*delete\s*\(\s*(\w+)\s*\)', 'DELETE'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*patch\s*\(\s*(\w+)\s*\)', 'PATCH'),
        # Axum method chaining
        (r'\.get\s*\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)', 'GET'),
        (r'\.post\s*\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)', 'POST'),
    ]

    # Actix patterns
    ACTIX_PATTERNS = [
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*web::get\s*\(\)', 'GET'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*web::post\s*\(\)', 'POST'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*web::put\s*\(\)', 'PUT'),
        (r'\.route\s*\(\s*"([^"]+)"\s*,\s*web::delete\s*\(\)', 'DELETE'),
        (r'#[get\(["\']([^"\']+)["\']\)]', 'GET'),
        (r'#[post\(["\']([^"\']+)["\']\)]', 'POST'),
        (r'#[put\(["\']([^"\']+)["\']\)]', 'PUT'),
        (r'#[delete\(["\']([^"\']+)["\']\)]', 'DELETE'),
    ]

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # Axum routes
        for pattern, method in AXUM_PATTERNS:
            for match in re.finditer(pattern, content):
                path = match.group(1)
                handler = match.group(2)
                key = f"{method}:{path}"
                if key not in seen:
                    seen.add(key)
                    endpoints.append({
                        'method': method,
                        'path': path,
                        'handler': handler,
                        'file': rel_path,
                    })

        # Actix routes
        for pattern, method in ACTIX_PATTERNS:
            for match in re.finditer(pattern, content):
                path = match.group(1)
                key = f"{method}:{path}"
                if key not in seen:
                    seen.add(key)
                    endpoints.append({
                        'method': method,
                        'path': path,
                        'handler': 'actix-handler',
                        'file': rel_path,
                    })

        # Warp patterns
        for match in re.finditer(r'path\s*\(\s*"([^"]+)"\s*\)\s*\.\s*(get|post|put|delete)\s*\(\s*\(\)\s*=>', content):
            path = match.group(1)
            method = match.group(2).upper()
            key = f"{method}:{path}"
            if key not in seen:
                seen.add(key)
                endpoints.append({
                    'method': method,
                    'path': path,
                    'handler': 'warp-filter',
                    'file': rel_path,
                })

    return sorted(endpoints, key=lambda e: (e['path'], e['method']))


# --- Database access ---

def scan_db_access(repo_root):
    """Find database access patterns."""
    db_access = []

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # ClickHouse patterns
        if 'clickhouse' in content.lower():
            for match in re.finditer(r'client\.query\s*\(\s*"([^"]+)"', content):
                line_num = content[:match.start()].count('\n') + 1
                db_access.append({
                    'file': rel_path,
                    'line': line_num,
                    'db_type': 'clickhouse',
                    'query': match.group(1)[:100],  # First 100 chars
                })

        # SQLx patterns
        if 'sqlx' in content.lower():
            for match in re.finditer(r'sqlx::query\s*\(\s*"([^"]+)"', content):
                line_num = content[:match.start()].count('\n') + 1
                db_access.append({
                    'file': rel_path,
                    'line': line_num,
                    'db_type': 'sqlx',
                    'query': match.group(1)[:100],
                })

        # Diesel patterns
        if 'diesel' in content.lower():
            for match in re.finditer(r'\.execute\s*\(\s*connection', content):
                line_num = content[:match.start()].count('\n') + 1
                db_access.append({
                    'file': rel_path,
                    'line': line_num,
                    'db_type': 'diesel',
                    'query': 'diesel-query',
                })

    return db_access


# --- Async patterns ---

def scan_async_patterns(repo_root):
    """Find async runtime patterns and tokio usage."""
    patterns = {
        'tokio_runtime': False,
        'async_std': False,
        'actix_runtime': False,
        'spawn_count': 0,
        'async_fn_count': 0,
    }

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)

        # Tokio runtime
        if '#[tokio::main]' in content or 'tokio::runtime::Runtime' in content:
            patterns['tokio_runtime'] = True

        # Async-std
        if '#[async_std::main]' in content or 'async_std::runtime' in content:
            patterns['async_std'] = True

        # Actix runtime
        if '#[actix_web::main]' in content or 'actix::system::System' in content:
            patterns['actix_runtime'] = True

        # Spawn patterns
        patterns['spawn_count'] += len(re.findall(r'tokio::spawn|async_std::task::spawn|actix::spawn', content))

        # Async fn count
        patterns['async_fn_count'] += len(re.findall(r'pub\s+async\s+fn|async\s+fn', content))

    return patterns


# --- Directory tree ---

def build_directory_tree(repo_root, max_depth=3):
    """Build a directory tree string for the repo."""
    lines = ['/']

    def _walk(path, prefix, depth):
        if depth > max_depth:
            return
        try:
            entries = sorted(os.listdir(path))
        except PermissionError:
            return

        dirs = [e for e in entries if os.path.isdir(os.path.join(path, e)) and e not in SKIP_DIRS and not e.startswith('.')]
        files_here = [e for e in entries if os.path.isfile(os.path.join(path, e))]

        # Show key files at this level
        key_files = [f for f in files_here if f in ('Cargo.toml', 'Cargo.lock', 'README.md', '.env', '.env.example')]
        for f in key_files[:5]:
            lines.append(f'{prefix}{f}')
        if len(key_files) > 5:
            lines.append(f'{prefix}... +{len(key_files) - 5} more config files')

        for d in dirs:
            lines.append(f'{prefix}{d}/')
            _walk(os.path.join(path, d), prefix + '  ', depth + 1)

    _walk(repo_root, '  ', 1)
    return '\n'.join(lines)


# --- Main ---

def scan(repo_root):
    """Run all scans and return combined result."""
    projects = scan_cargo_projects(repo_root)
    configs, environments = scan_config_files(repo_root)
    env_resolution = scan_env_resolution(repo_root)
    test_groups = scan_test_groups(repo_root)
    static_state = scan_static_state(repo_root)
    bases = scan_base_classes(repo_root)
    fixtures = scan_fixtures(repo_root)
    endpoints = scan_endpoints(repo_root)
    db_access = scan_db_access(repo_root)
    async_patterns = scan_async_patterns(repo_root)
    directory_tree = build_directory_tree(repo_root)

    rs_count = sum(1 for _ in walk_files(repo_root, ['.rs']))

    return {
        'projects': projects,
        'config_files': configs,
        'environments': environments,
        'env_resolution': env_resolution,
        'test_groups': test_groups,
        'static_state': static_state,
        'base_classes': bases,
        'fixtures': fixtures,
        'endpoints': endpoints,
        'db_access': db_access,
        'async_patterns': async_patterns,
        'directory_tree': directory_tree,
        'summary': {
            'project_count': len(projects),
            'config_count': len(configs),
            'environment_count': len(environments),
            'test_group_count': len(test_groups),
            'static_members': len(static_state),
            'endpoint_count': len(endpoints),
            'rs_files': rs_count,
            'async_fn_count': async_patterns['async_fn_count'],
            'spawn_count': async_patterns['spawn_count'],
        }
    }


def format_markdown(result):
    """Format pre-scan results as markdown for subagent context."""
    lines = []

    lines.append('# Pre-Scan Results (Rust)')
    lines.append('')

    # Summary
    s = result['summary']
    lines.append(f"**{s['project_count']} Cargo projects, {s['rs_files']} .rs files, "
                 f"{s['environment_count']} environments, {s['test_group_count']} test groups, "
                 f"{s['endpoint_count']} HTTP endpoints, {s['async_fn_count']} async functions**")
    lines.append('')

    # Projects
    lines.append('## Cargo Projects')
    lines.append('| Project | Type | Edition | Packages | Features |')
    lines.append('|---------|------|---------|----------|----------|')
    for p in result['projects']:
        pkg_count = len(p['packages'])
        feat_count = len(p['features'])
        lines.append(f"| {p['name']} | {p['type']} | {p['edition']} | {pkg_count} | {feat_count} |")
    lines.append('')

    # Config files
    lines.append('## Config Files')
    for c in result['config_files']:
        env = f" [{c.get('environment', '')}]" if c.get('environment') else ''
        lines.append(f"- `{c['path']}` — {c['type']}{env}")
    lines.append('')

    # Environment resolution
    if result['env_resolution']:
        lines.append('## Environment Variable Reads')
        for er in result['env_resolution']:
            lines.append(f"- Reads `{er['var_name']}` via {er['method']} ({er['file']}:{er['line']})")
        lines.append('')

    # Test groups
    lines.append('## Test Groups')
    lines.append('| Group | Files | Test Count |')
    lines.append('|-------|-------|------------|')
    for g in result['test_groups']:
        lines.append(f"| {g['name']} | {len(g['files'])} | {g['test_count']} |")
    lines.append('')

    # Static state
    if result['static_state']:
        lines.append('## Static State')
        for st in result['static_state']:
            lines.append(f"- `{st['member']}` ({st['kind']}) in `{st['file']}:{st['line']}`")
        lines.append('')

    # Endpoints
    if result['endpoints']:
        lines.append('## HTTP Endpoints')
        lines.append('| Method | Path | Handler | File |')
        lines.append('|--------|------|---------|------|')
        for ep in result['endpoints']:
            lines.append(f"| {ep['method']} | `{ep['path']}` | {ep['handler']} | `{ep['file']}` |")
        lines.append('')

    # Async patterns
    ap = result['async_patterns']
    lines.append('## Async Runtime')
    if ap['tokio_runtime']:
        lines.append('- Tokio runtime detected')
    if ap['async_std']:
        lines.append('- Async-std runtime detected')
    if ap['actix_runtime']:
        lines.append('- Actix runtime detected')
    lines.append(f"- Total async functions: {ap['async_fn_count']}")
    lines.append(f"- Total spawn calls: {ap['spawn_count']}")
    lines.append('')

    # DB access
    if result['db_access']:
        lines.append('## Database Access')
        for db in result['db_access']:
            lines.append(f"- `{db['file']}:{db['line']}` — {db['db_type']}: `{db['query'][:50]}...`")
        lines.append('')

    # Directory tree
    lines.append('## Directory Structure')
    lines.append(result['directory_tree'])
    lines.append('')

    return '\n'.join(lines)


def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.is_dir():
        raise NotFound(
            f"repo root not found: {repo_root}",
            "pass an existing repository directory: $UB pre-scan-rust --repo-root <repo>",
        )

    data = scan(str(repo_root))
    payload = {"status": "scanned", "repo_root": str(repo_root), "data": data}

    if v.get("--markdown", False):
        payload["markdown"] = format_markdown(data)
    return payload


TOOL = Tool(
    name="pre-scan-rust",
    version="1.0",
    summary="Pre-scan a Rust repository for structural/mechanical survey data: Cargo projects, "
            "crate dependencies, config files, test groups, static state, HTTP endpoints, "
            "database access, and async runtime patterns.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Path to the repository root (must exist)."},
        "--json": {"required": False, "type": "bool",
                   "description": "Accepted for back-compat; the JSON envelope is the only stdout mode."},
        "--markdown": {"required": False, "type": "bool",
                       "description": "Include the legacy markdown rendering of the scan as 'markdown' in the payload."},
    },
    exit_codes={
        "0": "scanned — payload carries 'data' (full scan document) and 'markdown' when --markdown",
        "1": "usage or validation error",
        "4": "not found: repo root is not a directory",
    },
    examples=[
        "$UB pre-scan-rust --repo-root .",
        "$UB pre-scan-rust --repo-root . --markdown",
    ],
    idempotent="Read-only: re-running on the same repo state returns identical data.",
)


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    TOOL.run(handle)
