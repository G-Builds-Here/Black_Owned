#!/usr/bin/env python3
"""Pre-scan a repository to extract structural/mechanical data for survey subagents.

Produces a structured JSON summary of everything a subagent needs to know before
doing judgment work: project layout, config files, test groups, static singletons,
base classes, env var reads. Eliminates redundant discovery across multiple subagents.

Usage:
    python pre-scan.py <repo_root>
    python pre-scan.py <repo_root> --json
    python pre-scan.py <repo_root> --markdown

Output (JSON by default):
    {
        "projects": [...],
        "config_files": [...],
        "environments": [...],
        "test_groups": [...],
        "static_state": [...],
        "base_classes": [...],
        "env_var_reads": [...],
        "fixtures": [...],
        "entry_points": [...],
        "directory_tree": "...",
        "summary": {...}
    }
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SKIP_DIRS = {'bin', 'obj', 'node_modules', '.git', 'packages', '.vs', '.idea', 'TestResults'}


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

def scan_dotnet_projects(repo_root):
    """Parse .sln and .csproj files for project structure."""
    projects = []

    for abs_path, rel_path in walk_files(repo_root, ['.csproj']):
        content = read_file(abs_path)
        proj = {
            'path': rel_path,
            'name': Path(rel_path).stem,
            'type': 'unknown',
            'target_framework': None,
            'output_type': None,
            'packages': [],
            'excluded_dirs': [],
        }

        # Target framework
        tf_match = re.search(r'<TargetFramework>(.*?)</TargetFramework>', content)
        if tf_match:
            proj['target_framework'] = tf_match.group(1)

        # Output type
        ot_match = re.search(r'<OutputType>(.*?)</OutputType>', content)
        if ot_match:
            proj['output_type'] = ot_match.group(1)

        # Package references
        for pkg_match in re.finditer(r'<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?', content):
            proj['packages'].append({
                'name': pkg_match.group(1),
                'version': pkg_match.group(2) or 'unspecified',
            })

        # Project type heuristics
        pkg_names = {p['name'] for p in proj['packages']}
        if any('xunit' in p.lower() or 'nunit' in p.lower() or 'mstest' in p.lower() for p in pkg_names):
            proj['type'] = 'test'
        elif any('Microsoft.NET.Sdk.Web' in content for _ in [1]):
            proj['type'] = 'web'
        elif proj['target_framework'] and 'netstandard' in proj['target_framework']:
            proj['type'] = 'library'
        elif proj['output_type'] and proj['output_type'].lower() == 'exe':
            proj['type'] = 'executable'

        # Excluded directories (compile remove)
        for exc_match in re.finditer(r'<Compile\s+Remove="([^"]+)"', content):
            proj['excluded_dirs'].append(exc_match.group(1))

        projects.append(proj)

    # Also check for npm projects
    for abs_path, rel_path in walk_files(repo_root, ['package.json']):
        if 'node_modules' in rel_path:
            continue
        content = read_file(abs_path)
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            continue

        deps = list(data.get('dependencies', {}).keys())
        dev_deps = list(data.get('devDependencies', {}).keys())
        projects.append({
            'path': rel_path,
            'name': data.get('name', Path(rel_path).parent.name),
            'type': 'npm',
            'target_framework': None,
            'output_type': None,
            'packages': [{'name': d, 'version': 'dep'} for d in deps] +
                        [{'name': d, 'version': 'devDep'} for d in dev_deps],
            'excluded_dirs': [],
        })

    return projects


# --- Config files ---

def scan_config_files(repo_root):
    """Find configuration files and extract environment info."""
    configs = []
    environments = set()

    patterns = [
        ('appsettings*.json', 'dotnet-config'),
        ('.env*', 'env-file'),
        ('*.runsettings', 'test-settings'),
        ('*buildspec*', 'ci-config'),
        ('*.yml', 'yaml-config'),
        ('*.yaml', 'yaml-config'),
    ]

    for abs_path, rel_path in walk_files(repo_root):
        filename = os.path.basename(rel_path)

        # appsettings files
        appsettings_match = re.match(r'appsettings\.?(\w*)\.json$', filename, re.IGNORECASE)
        if appsettings_match:
            env_name = appsettings_match.group(1)
            configs.append({
                'path': rel_path,
                'type': 'dotnet-config',
                'environment': env_name or 'base',
            })
            if env_name:
                environments.add(env_name)
            continue

        # runsettings
        if filename.endswith('.runsettings'):
            content = read_file(abs_path)
            timeout_match = re.search(r'<TestSessionTimeout>(\d+)</TestSessionTimeout>', content)
            configs.append({
                'path': rel_path,
                'type': 'test-settings',
                'environment': None,
                'timeout_ms': int(timeout_match.group(1)) if timeout_match else None,
            })
            continue

        # buildspec files
        if 'buildspec' in filename.lower() and (filename.endswith('.yml') or filename.endswith('.yaml')):
            configs.append({
                'path': rel_path,
                'type': 'ci-config',
                'environment': None,
            })
            continue

    return configs, sorted(environments)


# --- Environment resolution ---

def scan_env_resolution(repo_root):
    """Find how the codebase resolves its environment name."""
    env_reads = []

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)

        # ASPNETCORE_ENVIRONMENT / DOTNET_ENVIRONMENT reads
        for match in re.finditer(r'GetEnvironmentVariable\(\s*"(\w+ENVIRONMENT\w*)"', content):
            line_num = content[:match.start()].count('\n') + 1
            env_reads.append({
                'file': rel_path,
                'line': line_num,
                'var_name': match.group(1),
            })

        # Environment alias mappings (e.g., "qa" -> "QualityAssurance")
        for match in re.finditer(r'"(\w+)"\s*(?:=>|:)\s*"(\w+)"', content):
            if match.group(1).lower() in ('dev', 'qa', 'int', 'stage', 'prod', 'local'):
                env_reads.append({
                    'file': rel_path,
                    'line': content[:match.start()].count('\n') + 1,
                    'alias': match.group(1),
                    'resolved': match.group(2),
                })

    return env_reads


# --- Test groups ---

def scan_test_groups(repo_root):
    """Find all test grouping attributes and map them to files."""
    groups = {}

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)

        for match in re.finditer(r'\[Trait\s*\(\s*"Grouping"\s*,\s*"(\w+)"\s*\)\]', content):
            group_name = match.group(1)
            if group_name not in groups:
                groups[group_name] = {'name': group_name, 'files': [], 'test_count': 0}
            if rel_path not in groups[group_name]['files']:
                groups[group_name]['files'].append(rel_path)

        # Count test methods (xUnit)
        test_methods = len(re.findall(r'\[(Fact|Theory)\b', content))
        if test_methods > 0:
            # Find which group this file belongs to
            file_groups = re.findall(r'\[Trait\s*\(\s*"Grouping"\s*,\s*"(\w+)"\s*\)\]', content)
            for g in file_groups:
                if g in groups:
                    groups[g]['test_count'] += test_methods

    return sorted(groups.values(), key=lambda g: g['name'])


# --- Static state ---

def scan_static_state(repo_root):
    """Find static singletons, fields, and shared state in infrastructure code.

    Focuses on classes that manage shared state across tests: fixtures, helpers,
    configuration, data stores. Skips test data constants (card/ACH data, enums,
    test data elements) which are just readonly lookup values, not shared mutable state.
    """
    # Directories that contain infrastructure (shared state we care about)
    INFRA_DIRS = {'Fixture', 'AwsHelper', 'DataRetention', 'Configuration', 'DbHelper'}
    # Directories that contain test data constants (skip)
    DATA_DIRS = {'CardClasses', 'ACHClasses', 'TestDataElements', 'Enumerations',
                 'Models', 'DTO', 'Serialization', 'DbHelperModels'}

    statics = []

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        # Skip test classes entirely
        if 'PPGTests' in rel_path and '_Diagnostics' not in rel_path:
            continue

        # Check if this file is in an infrastructure directory
        path_parts = set(Path(rel_path).parts)
        in_infra = bool(path_parts & INFRA_DIRS)
        in_data = bool(path_parts & DATA_DIRS)

        # Skip test data directories
        if in_data and not in_infra:
            continue

        content = read_file(abs_path)
        class_match = re.search(r'(?:public|internal)\s+(?:static\s+)?class\s+(\w+)', content)
        if not class_match:
            continue

        class_name = class_match.group(1)

        # For non-infra files, only capture if the class has initialization methods
        # (indicates it's a singleton/service, not a data class)
        if not in_infra:
            has_init = bool(re.search(r'(?:Initialize|Init|LoadFrom|ReadFrom)\w*Async?\s*\(', content))
            has_singleton = bool(re.search(r'static\s+\w+\??\s+\w+\s*\{[^}]*get\s*\{', content))
            if not has_init and not has_singleton:
                continue

        # Static properties (public/internal — these are the API surface)
        for match in re.finditer(
            r'(?:public|internal)\s+static\s+(\w+\??)\s+(\w+)\s*\{',
            content
        ):
            prop_type = match.group(1)
            prop_name = match.group(2)
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': class_name,
                'member': prop_name,
                'kind': 'static property',
                'type': prop_type,
                'file': rel_path,
                'line': line_num,
            })

        # Static fields with non-trivial types (skip string constants, skip readonly data)
        for match in re.finditer(
            r'(?:private|protected|internal|public)\s+static\s+(?!const\b)(?!readonly\s+string\b)(\w+\??)\s+(\w+)\s*[;=]',
            content
        ):
            field_type = match.group(1)
            field_name = match.group(2)
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': class_name,
                'member': field_name,
                'kind': 'static field',
                'type': field_type,
                'file': rel_path,
                'line': line_num,
            })

        # Lock objects (thread safety indicators)
        for match in re.finditer(r'static\s+(?:readonly\s+)?object\s+(\w+)\s*=\s*new\s+object', content):
            lock_name = match.group(1)
            line_num = content[:match.start()].count('\n') + 1
            statics.append({
                'class': class_name,
                'member': lock_name,
                'kind': 'lock object',
                'type': 'object',
                'file': rel_path,
                'line': line_num,
            })

    return sorted(statics, key=lambda s: (s['class'], s['member']))


# --- Base classes and fixtures ---

def scan_base_classes(repo_root):
    """Find test base classes and their constructor signatures."""
    bases = []

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)

        # Abstract or base classes
        for match in re.finditer(
            r'(?:public|internal)\s+(?:abstract\s+)?class\s+(\w+(?:Base|Test|Fixture)\w*)',
            content
        ):
            class_name = match.group(1)
            # Skip test classes that just end in Test/Tests
            if re.search(r'_Tests?$', class_name):
                continue

            # Find constructor params
            ctor_match = re.search(
                rf'(?:public|protected)\s+{re.escape(class_name)}\s*\(([^)]*)\)',
                content
            )
            params = ctor_match.group(1).strip() if ctor_match else None

            # Find what it provides (protected/public fields/properties)
            provides = []
            for prov_match in re.finditer(
                r'(?:protected|public)\s+(?:readonly\s+)?(\w+)\s+(\w+)\s*[{;]',
                content
            ):
                provides.append({
                    'type': prov_match.group(1),
                    'name': prov_match.group(2),
                })

            # Find parent class
            parent_match = re.search(
                rf'class\s+{re.escape(class_name)}\s*:\s*(\w+)',
                content
            )
            parent = parent_match.group(1) if parent_match else None

            bases.append({
                'name': class_name,
                'file': rel_path,
                'constructor_params': params,
                'parent': parent,
                'provides': provides[:10],  # Cap at 10 to avoid noise
            })

    return bases


def scan_fixtures(repo_root):
    """Find assembly-level fixtures and their initialization steps."""
    fixtures = []

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)

        # Assembly fixture registration
        if 'AssemblyFixture' in content:
            fixture_match = re.search(r'AssemblyFixture\s*\(\s*typeof\s*\(\s*(\w+)\s*\)', content)
            if fixture_match:
                fixtures.append({
                    'name': fixture_match.group(1),
                    'registration_file': rel_path,
                    'type': 'assembly',
                })

        # IClassFixture / ICollectionFixture
        for match in re.finditer(r'I(?:Class|Collection)Fixture<(\w+)>', content):
            fixtures.append({
                'name': match.group(1),
                'registration_file': rel_path,
                'type': 'class' if 'IClassFixture' in content else 'collection',
            })

    return fixtures


# --- Env var reads ---

def scan_env_var_reads(repo_root):
    """Find all Environment.GetEnvironmentVariable calls."""
    reads = []
    seen = set()

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)

        for match in re.finditer(r'GetEnvironmentVariable\(\s*"(\w+)"', content):
            var_name = match.group(1)
            if var_name not in seen:
                seen.add(var_name)
                line_num = content[:match.start()].count('\n') + 1
                reads.append({
                    'var_name': var_name,
                    'file': rel_path,
                    'line': line_num,
                })

    return sorted(reads, key=lambda r: r['var_name'])


def scan_endpoints(repo_root):
    """Find HTTP endpoints from controller/minimal-API route attributes.

    Covers:
    - ASP.NET attribute routing: [HttpGet("path")], [Route("path")]
    - Minimal API: app.MapGet / MapPost / MapPut / MapDelete
    - xUnit-style test annotations with endpoint strings
    """
    endpoints = []
    seen = set()

    # HTTP method attributes
    http_attr_pattern = re.compile(
        r'\[(?:Http(Get|Post|Put|Delete|Patch)|Route)\s*\(\s*"([^"]+)"',
        re.IGNORECASE
    )
    # Controller class + optional [Route] prefix
    controller_route_pattern = re.compile(
        r'\[Route\s*\(\s*"([^"]+)"\s*\)\].*?class\s+(\w+Controller)',
        re.DOTALL
    )
    # Minimal API
    minimal_api_pattern = re.compile(
        r'app\.Map(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"',
        re.IGNORECASE
    )

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        # Only scan controller files and startup/program files
        filename = Path(abs_path).name
        is_controller = 'Controller' in filename or 'Endpoint' in filename
        is_startup = filename in ('Program.cs', 'Startup.cs', 'RouteConfig.cs')
        if not is_controller and not is_startup:
            continue

        content = read_file(abs_path)

        # Detect controller-level route prefix
        controller_prefix = ""
        cp_match = re.search(r'\[Route\s*\(\s*"([^"]+)"', content)
        if cp_match:
            controller_prefix = cp_match.group(1).rstrip('/')

        # Controller action attributes
        class_match = re.search(r'class\s+(\w+)\s*:', content)
        class_name = class_match.group(1) if class_match else Path(abs_path).stem

        for match in http_attr_pattern.finditer(content):
            method = match.group(1) or 'ANY'
            path = match.group(2)
            if not path.startswith('/') and controller_prefix:
                full_path = f"/{controller_prefix}/{path}".replace('//', '/')
            elif not path.startswith('/'):
                full_path = f"/{path}"
            else:
                full_path = path
            key = f"{method.upper()}:{full_path}"
            if key not in seen:
                seen.add(key)
                endpoints.append({
                    'method': method.upper() if method else 'ANY',
                    'path': full_path,
                    'controller': class_name,
                    'file': rel_path,
                })

        # Minimal API routes
        for match in minimal_api_pattern.finditer(content):
            method = match.group(1).upper()
            path = match.group(2)
            if not path.startswith('/'):
                path = '/' + path
            key = f"{method}:{path}"
            if key not in seen:
                seen.add(key)
                endpoints.append({
                    'method': method,
                    'path': path,
                    'controller': Path(abs_path).stem,
                    'file': rel_path,
                })

    return sorted(endpoints, key=lambda e: (e['path'], e['method']))


# --- Class inventory ---

def scan_class_inventory(repo_root):
    """Map every public class to its base class, file, and folder group."""
    by_folder = {}
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        folder = str(Path(rel_path).parent)
        for match in re.finditer(
            r'(?:public|internal)\s+(?:abstract\s+|sealed\s+|static\s+|partial\s+)*class\s+(\w+)'
            r'(?:\s*:\s*([\w<>, ]+))?',
            content
        ):
            class_name = match.group(1)
            bases_raw = match.group(2)
            base = bases_raw.strip().split(',')[0].strip() if bases_raw else None
            public_method_count = len(re.findall(
                r'public\s+(?:static\s+)?(?:async\s+)?(?:Task|void|\w+)\s+\w+\s*\(',
                content
            ))
            by_folder.setdefault(folder, []).append({
                'class': class_name,
                'base': base,
                'file': rel_path,
                'public_method_count': public_method_count,
            })
    return by_folder


# --- Test class URL index ---

def scan_test_class_urls(repo_root):
    """Extract URL suffix passed to base(output, "...") constructor per test class."""
    mappings = []
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        if 'PPGTests' not in rel_path and 'Features' not in rel_path:
            continue
        content = read_file(abs_path)
        class_match = re.search(r'(?:public|internal)\s+class\s+(\w+)', content)
        if not class_match:
            continue
        url_match = re.search(r':\s*base\s*\(\s*\w+\s*,\s*"([^"]+)"', content)
        if not url_match:
            continue
        group_match = re.search(r'\[Trait\s*\(\s*"Grouping"\s*,\s*"(\w+)"', content)
        test_count = len(re.findall(r'\[(Fact|Theory)\b', content))
        mappings.append({
            'class': class_match.group(1),
            'url': url_match.group(1),
            'group': group_match.group(1) if group_match else None,
            'test_count': test_count,
            'file': rel_path,
        })
    return sorted(mappings, key=lambda m: (m.get('group') or '', m['url']))


# --- Serialization usage ---

def scan_serialization_usage(repo_root):
    """Map Newtonsoft vs System.Text.Json usage per file."""
    result = {'newtonsoft': [], 'system_text_json': [], 'both': []}
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        has_newtonsoft = bool(re.search(r'JsonConvert\.|Newtonsoft\.Json', content))
        has_stj = bool(re.search(r'JsonSerializer\.|System\.Text\.Json', content))
        if has_newtonsoft and has_stj:
            result['both'].append(rel_path)
        elif has_newtonsoft:
            result['newtonsoft'].append(rel_path)
        elif has_stj:
            result['system_text_json'].append(rel_path)
    return result


# --- SQL / DB access ---

def scan_sql_access(repo_root):
    """Find files that contain direct SQL/database calls."""
    SQL_PATTERN = re.compile(
        r'new\s+SqlConnection|new\s+SqlCommand|SqlDataReader|SqlParameter|'
        r'Microsoft\.Data\.SqlClient|using\s+Microsoft\.Data|'
        r'ExecuteReaderAsync|ExecuteNonQueryAsync|ExecuteScalarAsync'
    )
    # Simplified label extraction — capture the unique keyword tokens found
    TOKEN_LABELS = [
        (re.compile(r'Microsoft\.Data\.SqlClient|new\s+SqlConnection'), 'SqlConnection'),
        (re.compile(r'new\s+SqlCommand'), 'SqlCommand'),
        (re.compile(r'SqlDataReader'), 'SqlDataReader'),
        (re.compile(r'ExecuteReaderAsync'), 'ExecuteReaderAsync'),
        (re.compile(r'ExecuteNonQueryAsync'), 'ExecuteNonQueryAsync'),
        (re.compile(r'ExecuteScalarAsync'), 'ExecuteScalarAsync'),
    ]
    hits = []
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        if not SQL_PATTERN.search(content):
            continue
        found_labels = [label for pat, label in TOKEN_LABELS if pat.search(content)]
        hits.append({'file': rel_path, 'calls': found_labels})
    return hits


# --- Helper public surface ---

def scan_helper_public_surface(repo_root):
    """Extract public method names from Helpers/ and Configuration/ classes.

    Groups by class name — partial classes across multiple files are merged.
    Eliminates agent file reads for helper API surface discovery.
    """
    surface = {}
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        if 'Helpers' not in rel_path and 'Configuration' not in rel_path:
            continue
        content = read_file(abs_path)
        # All class declarations in this file (handles partial classes)
        class_names = re.findall(
            r'(?:public|internal)\s+(?:static\s+|abstract\s+|partial\s+)*class\s+(\w+)',
            content
        )
        if not class_names:
            continue
        # Use the first declared class as the key (file-level owner)
        class_name = class_names[0]
        methods = re.findall(
            r'public\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?'
            r'(?:Task(?:<[^>]+>)?|void|\w+)\s+(\w+)\s*[<(]',
            content
        )
        # Filter noise: constructors (same as class name), property accessors
        noise = set(class_names) | {'get', 'set', 'add', 'remove'}
        methods = [m for m in methods if m not in noise]
        if methods:
            if class_name not in surface:
                surface[class_name] = {'file': rel_path, 'methods': []}
            # Merge (partial class files)
            for m in methods:
                if m not in surface[class_name]['methods']:
                    surface[class_name]['methods'].append(m)
    return surface


# --- Init sequence ---

def scan_init_sequence(repo_root):
    """Extract ordered await calls from InitializeAsync implementations in fixture files.

    Captures step names like 'AwsHelper.InitializeAsync', 'CognitoTokenHelper.InitializeAsync'.
    """
    sequences = []
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        # Match any InitializeAsync method body (implementation, not call site)
        # Look for the method declaration followed by a block
        for init_match in re.finditer(
            r'(?:public|protected|private)\s+(?:static\s+)?(?:async\s+)?Task\s+(Initialize\w*Async)\s*\([^)]*\)\s*\{',
            content
        ):
            start = init_match.end()
            # Grab next 8000 chars as the body (enough for even large init methods)
            body = content[start:start + 8000]
            # Extract await call targets: "await X.Y.Z(" or "await X.Y.Z.ConfigureAwait"
            calls = re.findall(
                r'await\s+([\w]+(?:\.[\w]+)+)(?:\s*\(|\s*\.ConfigureAwait)',
                body
            )
            # Dedupe while preserving order
            seen = set()
            unique_calls = []
            for c in calls:
                if c not in seen:
                    seen.add(c)
                    unique_calls.append(c)
            if unique_calls:
                sequences.append({'file': rel_path, 'init_calls': unique_calls})
            break  # one InitializeAsync per file is enough
    return sequences


# --- Using / namespace imports ---

def scan_using_namespaces(repo_root):
    """Collect all top-level using directives across .cs files.

    Produces a namespace→file_count map — used to detect which NuGet packages
    are actually imported (vs. referenced in .csproj but never used).
    """
    namespace_counts = {}
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        for match in re.finditer(r'^using\s+([\w.]+)\s*;', content, re.MULTILINE):
            ns = match.group(1)
            namespace_counts[ns] = namespace_counts.get(ns, 0) + 1
    return dict(sorted(namespace_counts.items(), key=lambda x: -x[1]))


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
        key_extensions = {'.sln', '.csproj', '.json', '.yml', '.yaml', '.runsettings', '.md'}
        key_files = [f for f in files_here if any(f.endswith(ext) for ext in key_extensions)]
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
    projects = scan_dotnet_projects(repo_root)
    configs, environments = scan_config_files(repo_root)
    env_resolution = scan_env_resolution(repo_root)
    test_groups = scan_test_groups(repo_root)
    static_state = scan_static_state(repo_root)
    base_classes = scan_base_classes(repo_root)
    fixtures = scan_fixtures(repo_root)
    env_var_reads = scan_env_var_reads(repo_root)
    endpoints = scan_endpoints(repo_root)
    directory_tree = build_directory_tree(repo_root)
    class_inventory = scan_class_inventory(repo_root)
    test_class_urls = scan_test_class_urls(repo_root)
    serialization_usage = scan_serialization_usage(repo_root)
    sql_access = scan_sql_access(repo_root)
    helper_surface = scan_helper_public_surface(repo_root)
    init_sequence = scan_init_sequence(repo_root)
    using_namespaces = scan_using_namespaces(repo_root)

    cs_count = sum(1 for _ in walk_files(repo_root, ['.cs']))

    return {
        'projects': projects,
        'config_files': configs,
        'environments': environments,
        'env_resolution': env_resolution,
        'test_groups': test_groups,
        'static_state': static_state,
        'base_classes': base_classes,
        'fixtures': fixtures,
        'env_var_reads': env_var_reads,
        'endpoints': endpoints,
        'directory_tree': directory_tree,
        'class_inventory': class_inventory,
        'test_class_urls': test_class_urls,
        'serialization_usage': serialization_usage,
        'sql_access': sql_access,
        'helper_surface': helper_surface,
        'init_sequence': init_sequence,
        'using_namespaces': using_namespaces,
        'summary': {
            'project_count': len(projects),
            'config_count': len(configs),
            'environment_count': len(environments),
            'test_group_count': len(test_groups),
            'static_members': len(static_state),
            'endpoint_count': len(endpoints),
            'cs_files': cs_count,
            'helper_classes': len(helper_surface),
            'sql_access_files': len(sql_access),
        }
    }


def format_markdown(result):
    """Format pre-scan results as markdown for subagent context."""
    lines = []

    lines.append('# Pre-Scan Results')
    lines.append('')

    # Summary
    s = result['summary']
    lines.append(f"**{s['project_count']} projects, {s['cs_files']} .cs files, "
                 f"{s['environment_count']} environments, {s['test_group_count']} test groups, "
                 f"{s['static_members']} static state members, {s.get('endpoint_count', 0)} endpoints**")
    lines.append('')

    # Projects (summary table only — no per-project package lists)
    lines.append('## Projects')
    lines.append('| Project | Type | Framework | Packages |')
    lines.append('|---------|------|-----------|----------|')
    for p in result['projects']:
        pkg_count = len(p['packages'])
        lines.append(f"| {p['name']} | {p['type']} | {p['target_framework'] or 'n/a'} | {pkg_count} |")
    lines.append('')

    # Excluded dirs (compact)
    all_exclusions = [(p['name'], exc) for p in result['projects'] for exc in p['excluded_dirs']]
    if all_exclusions:
        lines.append('### Excluded from compilation')
        for proj_name, exc in all_exclusions:
            lines.append(f"- {proj_name}: `{exc}`")
        lines.append('')

    # Config files
    lines.append('## Config Files')
    for c in result['config_files']:
        env = f" [{c.get('environment', '')}]" if c.get('environment') else ''
        extra = f" (timeout: {c['timeout_ms']}ms)" if c.get('timeout_ms') else ''
        lines.append(f"- `{c['path']}` — {c['type']}{env}{extra}")
    lines.append('')

    # Environments
    if result['environments']:
        lines.append('## Environments (from config files)')
        lines.append(', '.join(result['environments']))
        lines.append('')

    # Env resolution
    if result['env_resolution']:
        lines.append('## Environment Resolution')
        for er in result['env_resolution']:
            if 'alias' in er:
                lines.append(f"- Alias: `{er['alias']}` → `{er['resolved']}` ({er['file']}:{er['line']})")
            else:
                lines.append(f"- Reads `{er['var_name']}` ({er['file']}:{er['line']})")
        lines.append('')

    # Test groups
    lines.append('## Test Groups')
    lines.append('| Group | Files | Test Methods |')
    lines.append('|-------|-------|-------------|')
    for g in result['test_groups']:
        lines.append(f"| {g['name']} | {len(g['files'])} | {g['test_count']} |")
    lines.append('')

    # Static state (summarized by class — explorer reads actual files for detail)
    lines.append('## Static State (Infrastructure)')
    classes = {}
    for st in result['static_state']:
        key = st['class']
        if key not in classes:
            classes[key] = {'file': st['file'], 'members': []}
        classes[key]['members'].append(f"{st['member']} ({st['kind']})")
    for cls_name in sorted(classes):
        info = classes[cls_name]
        members_str = ', '.join(info['members'][:6])
        if len(info['members']) > 6:
            members_str += f', ... +{len(info["members"]) - 6} more'
        lines.append(f"- **{cls_name}** (`{info['file']}`): {members_str}")
    lines.append('')

    # Base classes
    lines.append('## Base Classes & Fixtures')
    for b in result['base_classes']:
        parent = f" : {b['parent']}" if b['parent'] else ''
        lines.append(f"**{b['name']}**{parent} (`{b['file']}`)")
        if b['constructor_params']:
            lines.append(f"  Constructor: `({b['constructor_params']})`")
        if b['provides']:
            provides_str = ', '.join(f"`{p['name']}` ({p['type']})" for p in b['provides'])
            lines.append(f"  Provides: {provides_str}")
        lines.append('')

    # Fixtures
    if result['fixtures']:
        lines.append('### Fixture Registrations')
        for f in result['fixtures']:
            lines.append(f"- **{f['name']}** ({f['type']}) — registered in `{f['registration_file']}`")
        lines.append('')

    # Env var reads (names only — explorer traces usage by reading code)
    lines.append('## Environment Variable Reads')
    if result['env_var_reads']:
        var_names = [ev['var_name'] for ev in result['env_var_reads']]
        lines.append(f"**{len(var_names)} env vars read:** {', '.join(f'`{v}`' for v in var_names)}")
    lines.append('')

    # Endpoints (authoritative — Agent 2 should not re-discover routes)
    if result.get('endpoints'):
        lines.append('## HTTP Endpoints (authoritative — do not re-discover)')
        lines.append('| Method | Path | Controller | File |')
        lines.append('|--------|------|-----------|------|')
        for ep in result['endpoints']:
            lines.append(f"| {ep['method']} | `{ep['path']}` | {ep['controller']} | `{ep['file']}` |")
        lines.append('')
        lines.append('> Agent 2: use this table as your endpoint list. Read the referenced files for request/response shapes, auth, and status codes — do not re-scan for routes.')
        lines.append('')

    # Init sequence (authoritative — Agent 3 should not re-read fixture files for call order)
    if result.get('init_sequence'):
        lines.append('## Init Sequence (authoritative — do not re-read fixture files for call order)')
        for seq in result['init_sequence']:
            lines.append(f"**`{seq['file']}`** InitializeAsync call order:")
            for i, call in enumerate(seq['init_calls'], 1):
                lines.append(f"  {i}. `{call}`")
        lines.append('')

    # Helper public surface (authoritative — Agent 3 should not re-read helper files for method names)
    if result.get('helper_surface'):
        lines.append('## Helper Public Surface (authoritative — do not re-read helper files)')
        lines.append('| Class | File | Public Methods |')
        lines.append('|-------|------|---------------|')
        for cls, info in sorted(result['helper_surface'].items()):
            methods_str = ', '.join(f'`{m}`' for m in info['methods'][:8])
            if len(info['methods']) > 8:
                methods_str += f' +{len(info["methods"]) - 8} more'
            lines.append(f"| {cls} | `{info['file']}` | {methods_str} |")
        lines.append('')

    # Serialization usage (authoritative — Agent 1 should not re-scan for JSON library usage)
    ser = result.get('serialization_usage', {})
    if any(ser.values()):
        lines.append('## Serialization Usage (authoritative — do not re-scan)')
        if ser.get('newtonsoft'):
            lines.append(f"**Newtonsoft only ({len(ser['newtonsoft'])} files):** " +
                         ', '.join(f'`{f}`' for f in ser['newtonsoft'][:6]))
            if len(ser['newtonsoft']) > 6:
                lines.append(f"  ... +{len(ser['newtonsoft']) - 6} more")
        if ser.get('system_text_json'):
            lines.append(f"**System.Text.Json only ({len(ser['system_text_json'])} files):** " +
                         ', '.join(f'`{f}`' for f in ser['system_text_json'][:6]))
            if len(ser['system_text_json']) > 6:
                lines.append(f"  ... +{len(ser['system_text_json']) - 6} more")
        if ser.get('both'):
            lines.append(f"**Both (mixed — {len(ser['both'])} files):** " +
                         ', '.join(f'`{f}`' for f in ser['both']))
        lines.append('')

    # SQL / DB access
    if result.get('sql_access'):
        lines.append('## SQL / DB Access (authoritative — do not re-scan)')
        for hit in result['sql_access']:
            lines.append(f"- `{hit['file']}`: {', '.join(f'`{c}`' for c in hit['calls'])}")
        lines.append('')

    # Test class URL index (authoritative — Agent 3 should not re-read test files for URL mapping)
    if result.get('test_class_urls'):
        lines.append('## Test Class URL Index (authoritative — do not re-read test files)')
        lines.append('| Class | URL | Group | Tests |')
        lines.append('|-------|-----|-------|-------|')
        for m in result['test_class_urls']:
            lines.append(f"| {m['class']} | `{m['url']}` | {m.get('group') or '—'} | {m['test_count']} |")
        lines.append('')

    # Namespace/using import counts (top 30 — used for unused package detection)
    if result.get('using_namespaces'):
        lines.append('## Namespace Import Counts (top 30 by usage)')
        top = list(result['using_namespaces'].items())[:30]
        for ns, count in top:
            lines.append(f"- `{ns}`: {count} files")
        lines.append('')

    # Class inventory by folder (Agent 2 component mapping)
    if result.get('class_inventory'):
        lines.append('## Class Inventory by Folder (authoritative — do not re-glob for class names)')
        for folder in sorted(result['class_inventory']):
            classes = result['class_inventory'][folder]
            lines.append(f"**`{folder}/`** ({len(classes)} classes)")
            for cls in classes:
                base = f" : {cls['base']}" if cls['base'] else ''
                lines.append(f"  - `{cls['class']}`{base} ({cls['public_method_count']} public methods) — `{cls['file']}`")
        lines.append('')

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Pre-scan repository for survey subagent context')
    parser.add_argument('repo_root', help='Path to repository root')
    parser.add_argument('--json', action='store_true', help='Output as JSON (default)')
    parser.add_argument('--markdown', action='store_true', help='Output as markdown')
    args = parser.parse_args()

    result = scan(os.path.abspath(args.repo_root))

    if args.markdown:
        print(format_markdown(result))
    elif args.json:
        print(json.dumps(result, indent=2))
    else:
        # Default to markdown for human readability / subagent consumption
        print(format_markdown(result))


if __name__ == '__main__':
    main()
