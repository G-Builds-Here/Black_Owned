#!/usr/bin/env python3
"""Extract C4 architectural data from a repository.

Produces structured JSON for C4 Level 1-3 diagrams following the C4 model specification:
- C1 Context: System boundary, people, external software systems
- C2 Containers: Applications and data stores within the system
- C3 Components: Major structural building blocks within containers

C4 Model Reference: https://c4model.com/

Usage:
    python c4-extract.py <repo_root>

Output JSON schema:
    {
        "c1_context": {
            "system_name": str,
            "description": str,
            "people": [...],
            "external_systems": [...]
        },
        "c2_containers": {
            "system_name": str,
            "description": str,
            "containers": [...]
        },
        "c3_components": {
            "containers": {
                "<container_name>": {
                    "components": [...]
                }
            }
        },
        "relationships": {
            "c1": [...],
            "c2": [...]
        }
    }
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

SKIP_DIRS = {'bin', 'obj', 'node_modules', '.git', '.vs', '.idea', 'TestResults',
             'packages', '.next', '.nuxt', 'dist', 'build', 'target', '.claude',
             'coverage', '.pytest_cache', '__pycache__', 'venv', '.venv',
             'examples', 'benchmarks'}


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


def sanitize_id(name):
    """Convert name to valid HTML/CSS ID."""
    return name.lower().replace(' ', '-').replace('.', '-').replace('_', '-').replace('/', '-')


# =============================================================================
# C1 CONTEXT EXTRACTION
# =============================================================================

def extract_people(repo_root):
    """Identify people (users, roles, personas) from auth config and UI elements."""
    people = []
    seen = set()

    # HTML/ARIA roles to exclude (not actual people)
    EXCLUDE_ROLES = {'combobox', 'button', 'row', 'group', 'textbox', 'checkbox', 'radio', 'menu', 'menubar', 'tab', 'tablist', 'tabpanel', 'listbox', 'option', 'slider', 'spinbutton', 'toolbar', 'tooltip', 'dialog', 'alertdialog', 'log', 'marquee', 'status', 'progressbar', 'timer', 'tree', 'treeitem', 'feed', 'figure', 'heading', 'img', 'list', 'listitem', 'navigation', 'none', 'presentation', 'article', 'banner', 'complementary', 'contentinfo', 'form', 'main', 'region', 'search', 'math', 'note', 'searchbox', 'switch', 'term'}

    # Check for auth/identity config
    for abs_path, rel_path in walk_files(repo_root, ['.cs', '.json', '.yml', '.yaml', '.ts', '.js']):
        content = read_file(abs_path)

        # ASP.NET Identity roles
        for match in re.finditer(r'Role\s*\(\s*["\'](\w+)["\']\s*\)', content):
            role = match.group(1)
            if role.lower() in EXCLUDE_ROLES:
                continue
            if role not in seen:
                seen.add(role)
                people.append({
                    'id': sanitize_id(role),
                    'name': role,
                    'c4_type': 'Person',
                    'description': f'A user with the {role} role',
                    'source': rel_path,
                })

        # Policy-based auth
        for match in re.finditer(r'Policy\s*\(\s*["\'](\w+)["\']\s*\)', content):
            policy = match.group(1)
            if policy.lower() in EXCLUDE_ROLES:
                continue
            if policy not in seen:
                seen.add(policy)
                people.append({
                    'id': sanitize_id(policy),
                    'name': policy,
                    'c4_type': 'Person',
                    'description': f'A user authorized under {policy} policy',
                    'source': rel_path,
                })

    # Check for OAuth/JWT claims — collapse all ClaimTypes hits to one Authenticated User
    claims_found = False
    claims_source = None
    for abs_path, rel_path in walk_files(repo_root, ['.cs', '.ts', '.js']):
        content = read_file(abs_path)
        if re.search(r'ClaimTypes\.', content):
            claims_found = True
            claims_source = rel_path
            break
    if claims_found and 'authenticated-user' not in seen:
        seen.add('authenticated-user')
        people.append({
            'id': 'authenticated-user',
            'name': 'Authenticated User',
            'c4_type': 'Person',
            'description': 'An authenticated end user of the system',
            'source': claims_source,
        })

    # Supabase / domain-level actors: check for business owner patterns
    for abs_path, rel_path in walk_files(repo_root, ['.ts', '.tsx', '.js', '.jsx']):
        if 'node_modules' in rel_path or '.next' in rel_path:
            continue
        content = read_file(abs_path)
        if re.search(r'(?i)business\s*owner|black\s*business\s*owner|owner_name|ownerName', content):
            if 'business-owner' not in seen:
                seen.add('business-owner')
                people.append({
                    'id': 'business-owner',
                    'name': 'Business Owner',
                    'c4_type': 'Person',
                    'description': 'A Black business owner who registers and manages their business profile',
                    'source': rel_path,
                })
            break

    # Fallback for systems without any detected roles: add a default person
    if not people:
        system_name = Path(repo_root).name.replace('_', ' ').replace('-', ' ')
        people.append({
            'id': 'user',
            'name': 'User',
            'c4_type': 'Person',
            'description': f'A user of the {system_name} system',
            'source': 'inferred',
        })

    return people


def extract_external_systems(repo_root):
    """Identify external software systems from dependencies and config."""
    systems = []
    seen = set()

    # Known external system patterns
    EXTERNAL_SYSTEMS = {
        # NuGet packages
        'AWSSDK': ('AWS', 'Amazon Web Services - cloud computing platform'),
        'Azure': ('Azure', 'Microsoft Azure - cloud computing platform'),
        'Google.Cloud': ('GCP', 'Google Cloud Platform'),
        'RabbitMQ': ('RabbitMQ', 'Message broker for asynchronous communication'),
        'MassTransit': ('MassTransit', 'Distributed application framework'),
        'Kafka': ('Kafka', 'Event streaming platform'),
        'Redis': ('Redis', 'In-memory data store and cache'),
        'MongoDB': ('MongoDB', 'Document database'),
        'Elasticsearch': ('Elasticsearch', 'Search and analytics engine'),
        'SendGrid': ('SendGrid', 'Email delivery service'),
        'Twilio': ('Twilio', 'SMS and voice communication service'),
        'Stripe': ('Stripe', 'Payment processing platform'),
        'Okta': ('Okta', 'Identity and access management'),
        'Auth0': ('Auth0', 'Authentication and authorization platform'),
        # NPM packages
        '@supabase': ('Supabase', 'Backend-as-a-Service providing auth, database, and storage'),
        'stripe': ('Stripe', 'Payment processing platform'),
        'firebase': ('Firebase', 'Google Firebase - application development platform'),
        # Rust crates
        'supabase-rs': ('Supabase', 'Backend-as-a-Service providing auth, database, and storage'),
        'reqwest': ('External API', 'HTTP client for calling external services'),
        'tonic': ('gRPC', 'gRPC framework for inter-service communication'),
        # NOTE: Infrastructure services (ClickHouse, NATS, Grafana, Prometheus, MinIO)
        # are detected from docker-compose files and go to C2, not C1
    }

    for abs_path, rel_path in walk_files(repo_root, ['.csproj', 'package.json', 'Cargo.toml', '.toml']):
        content = read_file(abs_path)
        if not content:
            continue

        for pattern, (name, desc) in EXTERNAL_SYSTEMS.items():
            if pattern.lower() in content.lower() and name not in seen:
                # Verify it's a real dependency, not just a comment
                if re.search(rf'(Include|dependencies|"|package).*{re.escape(pattern)}', content, re.IGNORECASE):
                    seen.add(name)
                    systems.append({
                        'id': sanitize_id(name),
                        'name': name,
                        'c4_type': 'Software System',
                        'description': desc,
                        'source': rel_path,
                        'technology': _detect_system_technology(name),
                    })

    # Source-level scan: detect HTTP API calls and well-known service patterns
    SOURCE_API_PATTERNS = [
        # (regex on source content, name, description, technology)
        (r'TransIT|TransitApi|transitApi|transit_api|GetTransactionFromTransit|TSYS', 'TSYS TransIT', 'TSYS TransIT card processing API', 'Payment API / REST'),
        (r'VaultOptions|VaultProfile|vault.*url|vaultUrl|vault.*endpoint', 'Vault Service', 'Payor vault — stores and retrieves saved payment methods', 'REST API'),
        (r'Cognito|cognito.*token|CognitoToken', 'AWS Cognito', 'AWS Cognito — OAuth2 token endpoint for service-to-service auth', 'OAuth2 / AWS'),
        (r'EventBridge|eventBridge|PutEvents', 'AWS EventBridge', 'AWS EventBridge — publishes domain events', 'AWS / Event Bus'),
        (r'SecretsManager|secretsmanager|AwsSecretsManager', 'AWS Secrets Manager', 'AWS Secrets Manager — stores credentials and config at startup', 'AWS'),
        (r'KeyManagementService|\.Encrypt|\.Decrypt.*KMS|CryptographyService', 'AWS KMS', 'AWS KMS — encrypts and decrypts PAN data', 'AWS'),
        (r'SimpleSystemsManagement|ParameterStore|GetParameter', 'AWS SSM', 'AWS SSM Parameter Store — loads app configuration at startup', 'AWS'),
        (r'SqlClient|Dapper.*sql|IDbConnection|ConnectionStrings', 'SQL Server', 'SQL Server — primary relational database', 'MS SQL / Dapper'),
        (r'NewRelic|new.relic|Serilog.*NewRelic', 'New Relic', 'New Relic — log aggregation and APM', 'SaaS / Logging'),
    ]
    for abs_path, rel_path in walk_files(repo_root, ['.cs', '.ts', '.js', '.json']):
        if any(skip in rel_path.lower() for skip in ['test', 'spec', 'obj', 'bin']):
            continue
        content = read_file(abs_path)
        if not content:
            continue
        for pattern, name, desc, tech in SOURCE_API_PATTERNS:
            if name not in seen and re.search(pattern, content):
                seen.add(name)
                systems.append({
                    'id': sanitize_id(name),
                    'name': name,
                    'c4_type': 'Software System',
                    'description': desc,
                    'source': rel_path,
                    'technology': tech,
                })

    # Drop the generic "AWS" bucket if more specific AWS services were detected
    specific_aws = {'AWS Cognito', 'AWS KMS', 'AWS SSM', 'AWS Secrets Manager', 'AWS EventBridge'}
    if any(s['name'] in specific_aws for s in systems):
        systems = [s for s in systems if s['name'] != 'AWS']

    return systems


def _detect_system_technology(name):
    """Detect technology for an external system."""
    tech_map = {
        'AWS': 'Cloud Platform',
        'Azure': 'Cloud Platform',
        'GCP': 'Cloud Platform',
        'Supabase': 'BaaS (Auth, PostgreSQL, Storage)',
        'Stripe': 'Payment API',
        'Redis': 'In-memory Store',
        'MongoDB': 'Document Database',
        'PostgreSQL': 'Relational Database',
        'ClickHouse': 'OLAP Database',
        'NATS': 'Message Broker',
        'Grafana': 'Analytics Platform',
        'Prometheus': 'Monitoring',
        'MinIO': 'Object Storage',
        'RabbitMQ': 'Message Broker',
        'Kafka': 'Event Streaming',
    }
    return tech_map.get(name, 'External Service')


def extract_c1_context(repo_root):
    """Extract C1 Context level data."""
    people = extract_people(repo_root)
    external_systems = extract_external_systems(repo_root)

    system_name = Path(repo_root).name.replace('_', ' ').replace('-', ' ')

    return {
        'system_name': system_name,
        'description': f'{system_name} software system',
        'people': people,
        'external_systems': external_systems,
    }


# =============================================================================
# C2 CONTAINER EXTRACTION
# =============================================================================

def extract_c2_containers(repo_root):
    """Extract C2 Container level data."""
    containers = []
    seen_ids = set()

    # --- .NET projects ---
    DOTNET_TEST_PACKAGES = {'xunit', 'nunit', 'mstest', 'microsoft.net.test.sdk', 'nunit3testadapter', 'xunit.runner.visualstudio'}
    DOTNET_FRAMEWORK_TAGS = [
        ('Grpc.AspNetCore', 'gRPC'),
        ('MassTransit', 'MassTransit'),
        ('MediatR', 'MediatR'),
        ('Microsoft.AspNetCore.SignalR', 'SignalR'),
        ('Microsoft.EntityFrameworkCore', 'EF Core'),
    ]

    # Pre-scan: does this repo have non-test .csproj files at the root (depth <= 2)?
    # Helper/tool projects in sub-folders don't count — we check the primary project.
    _all_csprojs = list(walk_files(repo_root, ['.csproj']))
    _has_non_test = any(
        len(Path(rp).parts) <= 3 and
        not any(p in read_file(ap).lower() for p in DOTNET_TEST_PACKAGES)
        for ap, rp in _all_csprojs
    )

    for abs_path, rel_path in walk_files(repo_root, ['.csproj']):
        content = read_file(abs_path)
        proj_name = Path(rel_path).stem

        packages_lower = content.lower()
        is_test_project = any(p in packages_lower for p in DOTNET_TEST_PACKAGES)

        # Skip test projects when non-test projects also exist; otherwise treat as a container
        if is_test_project and _has_non_test:
            continue

        is_exe = bool(re.search(r'<OutputType>Exe</OutputType>', content, re.IGNORECASE))
        is_web = bool(re.search(r'Microsoft\.NET\.Sdk\.Web', content))
        is_worker = bool(re.search(r'Microsoft\.NET\.Sdk\.Worker', content))
        is_grpc = bool(re.search(r'Grpc\.AspNetCore', content))
        is_blazor = bool(re.search(r'Microsoft\.NET\.Sdk\.BlazorWebAssembly|blazor', content, re.IGNORECASE))
        has_hosted_service = bool(re.search(r'IHostedService|BackgroundService', content))

        tf_match = re.search(r'<TargetFramework>(.*?)</TargetFramework>', content)
        target_framework = tf_match.group(1) if tf_match else ''
        # Normalise net8.0 -> .NET 8, net6.0-windows -> .NET 6
        tf_friendly = re.sub(r'^net(\d+)\.0.*$', r'.NET \1', target_framework) if target_framework else ''

        packages = [m.group(1) for m in re.finditer(r'Include="([^"]+)"', content)]

        # Build technology string
        base_tech = f'C# / {tf_friendly}' if tf_friendly else 'C#'
        framework_extras = [tag for pkg, tag in DOTNET_FRAMEWORK_TAGS if pkg.lower() in packages_lower]
        if is_web or is_blazor:
            framework_extras.insert(0, 'ASP.NET Core')
        technology = base_tech + ((' / ' + ' / '.join(framework_extras)) if framework_extras else '')

        # Classify container type and description
        if is_test_project:
            description = 'Integration test suite'
            container_type = 'test'
            technology = (base_tech + ' / xUnit') if 'xunit' in packages_lower else (base_tech + ' / NUnit') if 'nunit' in packages_lower else base_tech
        elif is_grpc:
            description = 'gRPC service handling inter-service communication'
            container_type = 'service'
        elif is_blazor:
            description = 'Blazor WebAssembly single-page application'
            container_type = 'service'
        elif is_web and 'controller' in packages_lower:
            description = 'ASP.NET Core Web API handling HTTP requests'
            container_type = 'service'
        elif is_web:
            description = 'ASP.NET Core web application handling HTTP requests'
            container_type = 'service'
        elif is_worker or has_hosted_service:
            description = 'Background worker service running long-running tasks'
            container_type = 'service'
        elif is_exe:
            description = 'Console application'
            container_type = 'service'
        else:
            description = 'C# class library providing shared functionality'
            container_type = 'library'

        cid = sanitize_id(proj_name)
        if cid not in seen_ids:
            seen_ids.add(cid)
            containers.append({
                'id': cid,
                'name': proj_name,
                'c4_type': 'Container',
                'container_type': container_type,
                'description': description,
                'technology': technology,
                'path': rel_path,
                'packages': packages[:20],
                '_project_refs': [m.group(1) for m in re.finditer(r'<ProjectReference\s+Include="([^"]+)"', content)],
                # .projitems shared modules are linked via <Import Project=... Label="Shared"> not ProjectReference
                '_projitems_imports': [m.group(1) for m in re.finditer(r'<Import\s+Project="([^"]+\.projitems)"', content)],
            })

    # --- .NET .projitems shared modules → containers (logical domain boundaries) ---
    for abs_path, rel_path in walk_files(repo_root, ['.projitems']):
        content = read_file(abs_path)
        if not content:
            continue
        proj_name = Path(rel_path).stem
        # Extract namespace from Import_RootNamespace
        ns_match = re.search(r'<Import_RootNamespace>(.*?)</Import_RootNamespace>', content)
        display_name = ns_match.group(1) if ns_match else proj_name
        cid = sanitize_id(display_name)
        if cid in seen_ids:
            continue
        seen_ids.add(cid)
        # Infer description from namespace suffix
        name_lower = display_name.lower()
        if 'auth' in name_lower:
            description = 'Shared module — authentication and authorization infrastructure'
        elif 'crypto' in name_lower:
            description = 'Shared module — cryptography and key management'
        elif 'common' in name_lower:
            description = 'Shared module — common utilities and cross-cutting concerns'
        elif 'validation' in name_lower:
            description = 'Shared module — request validation logic'
        elif 'transaction' in name_lower:
            description = 'Shared module — transaction search, retrieval and refund logic'
        elif 'payor' in name_lower:
            description = 'Shared module — payor (stored payment method) CRUD operations'
        elif 'event' in name_lower:
            description = 'Shared module — EventBridge event publishing'
        elif 'duplicate' in name_lower:
            description = 'Shared module — duplicate transaction detection'
        elif 'bin' in name_lower:
            description = 'Shared module — BIN lookup and card network identification'
        elif 'panhash' in name_lower:
            description = 'Shared module — PAN hashing for PCI-safe storage'
        elif 'available' in name_lower and 'refund' in name_lower:
            description = 'Shared module — available refund calculation'
        elif 'categor' in name_lower:
            description = 'Shared module — Category 1 decline handling'
        else:
            description = 'Shared source module (source-linked into main API)'
        containers.append({
            'id': cid,
            'name': display_name,
            'c4_type': 'Container',
            'container_type': 'library',
            'description': description,
            'technology': 'C# / .NET 8 / Shared Module',
            'path': rel_path,
            'packages': [],
            '_project_refs': [],
        })

    # --- .NET DbContext subclasses → database containers ---
    seen_db_contexts = set()
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        if not content:
            continue
        for match in re.finditer(r'class\s+(\w+(?:Context|DbContext))\s*[:{<]', content):
            ctx_name = match.group(1)
            cid = sanitize_id(ctx_name)
            if cid in seen_ids or cid in seen_db_contexts:
                continue
            seen_db_contexts.add(cid)
            seen_ids.add(cid)
            # Try to infer technology from EF Core usage
            tech = 'Entity Framework Core / SQL'
            if 'npgsql' in content.lower() or 'postgres' in content.lower():
                tech = 'EF Core / PostgreSQL'
            elif 'sqlserver' in content.lower():
                tech = 'EF Core / SQL Server'
            containers.append({
                'id': cid,
                'name': ctx_name,
                'c4_type': 'Container',
                'description': 'Relational database accessed via Entity Framework Core',
                'technology': tech,
                'type': 'database',
                'path': rel_path,
                'packages': [],
                '_project_refs': [],
            })

    # --- Node.js projects ---
    for abs_path, rel_path in walk_files(repo_root, ['package.json']):
        content = read_file(abs_path)
        if not content:
            continue
        try:
            pkg_data = json.loads(content)
        except json.JSONDecodeError:
            continue

        proj_name = pkg_data.get('name', Path(rel_path).parent.name)
        scripts = pkg_data.get('scripts', {})
        deps = pkg_data.get('dependencies', {})

        has_next = 'next' in deps or any('next' in v for v in scripts.values())
        has_start = 'start' in scripts
        is_test = 'test' in rel_path.lower() and not has_start

        if is_test:
            continue

        if has_next:
            technology = 'Next.js / React / TypeScript'
            description = 'Single-page application providing the user interface'
        elif 'express' in deps or 'fastify' in deps:
            technology = 'Node.js / Express'
            description = 'Server-side web application handling API requests'
        else:
            technology = 'Node.js'
            description = 'Node.js application'

        cid = sanitize_id(proj_name)
        if cid not in seen_ids:
            seen_ids.add(cid)
            containers.append({
                'id': cid,
                'name': proj_name,
                'c4_type': 'Container',
                'container_type': 'service',
                'description': description,
                'technology': technology,
                'path': rel_path,
                'packages': list(deps.keys())[:20],
            })

    # --- Rust projects ---
    for abs_path, rel_path in walk_files(repo_root, ['Cargo.toml']):
        content = read_file(abs_path)
        if not content:
            continue

        name_match = re.search(r'^name\s*=\s*"([^"]+)"', content, re.MULTILINE)
        if not name_match:
            continue
        proj_name = name_match.group(1)

        lib_path = Path(abs_path).parent / 'src' / 'lib.rs'
        bin_path = Path(abs_path).parent / 'src' / 'main.rs'
        is_lib = lib_path.exists()
        is_bin = bin_path.exists()

        # Detect framework usage
        content_lower = content.lower()
        is_web = any(pkg in content_lower for pkg in ['axum', 'actix-web', 'warp', 'rocket'])
        is_worker = any(pkg in content_lower for pkg in ['tokio', 'async-std', 'actix'])
        is_test = any(tag in proj_name.lower() for tag in ['-test', '_test', 'test-', 'mock', 'bench'])

        # Build technology string
        edition_match = re.search(r'^edition\s*=\s*"([^"]+)"', content, re.MULTILINE)
        edition = edition_match.group(1) if edition_match else '2021'
        base_tech = f'Rust {edition}'

        framework_extras = []
        if 'axum' in content_lower:
            framework_extras.append('Axum')
        if 'actix' in content_lower:
            framework_extras.append('Actix')
        if 'warp' in content_lower:
            framework_extras.append('Warp')
        if 'tokio' in content_lower:
            framework_extras.append('Tokio')

        technology = base_tech + ((' / ' + ' / '.join(framework_extras)) if framework_extras else '')

        if is_test:
            description = 'Rust test suite'
            container_type = 'test'
        elif is_web:
            description = 'Rust web service handling HTTP requests'
            container_type = 'service'
        elif is_bin:
            description = 'Rust binary executable'
            container_type = 'service'
        elif is_worker:
            description = 'Rust async worker service'
            container_type = 'service'
        elif is_lib:
            description = 'Rust library providing shared functionality'
            container_type = 'library'
        else:
            description = 'Rust crate'
            container_type = 'library'

        # Extract dependencies from [dependencies] section only
        packages = []
        seen_pkgs = set()
        dep_section = re.search(r'\[dependencies\](.*?)(?=\n\[|\Z)', content, re.DOTALL)
        if dep_section:
            for dep_match in re.finditer(r'^([\w-]+)\s*=', dep_section.group(1), re.MULTILINE):
                pkg_name = dep_match.group(1)
                if pkg_name not in seen_pkgs:
                    seen_pkgs.add(pkg_name)
                    packages.append(pkg_name)

        cid = sanitize_id(proj_name)
        if cid not in seen_ids:
            seen_ids.add(cid)
            containers.append({
                'id': cid,
                'name': proj_name,
                'c4_type': 'Container',
                'container_type': container_type,
                'description': description,
                'technology': technology,
                'path': rel_path,
                'packages': packages[:20],
            })

    # --- Docker Compose services ---
    docker_compose_files = []
    for abs_path, rel_path in walk_files(repo_root, ['.yml', '.yaml']):
        if 'docker-compose' in rel_path.lower():
            docker_compose_files.append((abs_path, rel_path))

    for abs_path, rel_path in docker_compose_files:
        content = read_file(abs_path)
        services_match = re.search(r'^services:\s*\n(.*?)(?=\n\w|\Z)', content, re.MULTILINE | re.DOTALL)
        if not services_match:
            continue

        services_section = services_match.group(1)

        for match in re.finditer(r'^  (\w[\w-]*):', services_section, re.MULTILINE):
            svc_name = match.group(1)

            technology = 'Docker'
            container_type = 'service'
            description = f'Docker container running {svc_name}'

            svc_block = re.search(rf'{svc_name}:.*?(?=\n  \w|\Z)', services_section, re.DOTALL)
            if svc_block:
                block = svc_block.group(0)
                img_match = re.search(r'image:\s*["\']?([^"\'\s]+)', block)
                if img_match:
                    img = img_match.group(1)
                    tech_lower = img.lower()
                    if 'clickhouse' in tech_lower:
                        technology = 'ClickHouse'
                        container_type = 'database'
                        description = 'Column-oriented OLAP database for analytics queries'
                    elif 'nats' in tech_lower:
                        technology = 'NATS'
                        container_type = 'queue'
                        description = 'Lightweight messaging system for inter-service communication'
                    elif 'grafana' in tech_lower:
                        technology = 'Grafana'
                        container_type = 'service'
                        description = 'Observability platform for dashboards and alerting'
                    elif 'prometheus' in tech_lower:
                        technology = 'Prometheus'
                        container_type = 'database'
                        description = 'Time-series database for metrics collection'
                    elif 'supabase' in tech_lower:
                        technology = 'Supabase'
                        container_type = 'service'
                        if 'gotrue' in tech_lower:
                            description = 'Authentication service (GoTrue)'
                        elif 'studio' in tech_lower:
                            description = 'Web-based administration dashboard'
                        elif 'storage' in tech_lower or 'storage-api' in tech_lower:
                            description = 'S3-compatible object storage API'
                        else:
                            description = 'Backend-as-a-Service supporting service'
                    elif 'postgrest' in tech_lower:
                        technology = 'PostgREST (Supabase)'
                        container_type = 'service'
                        description = 'RESTful API gateway for PostgreSQL'
                    elif 'postgres' in tech_lower:
                        technology = 'PostgreSQL (Supabase)'
                        container_type = 'database'
                        description = 'Relational database for persistent data storage'
                    elif 'redis' in tech_lower or 'valkey' in tech_lower:
                        technology = 'Redis/Valkey'
                        container_type = 'database'
                        description = 'In-memory data store for caching and sessions'
                    elif 'minio' in tech_lower:
                        technology = 'MinIO'
                        container_type = 'database'
                        description = 'S3-compatible object storage for files and media'
                    else:
                        technology = img.split('/')[-1].split(':')[0]
                        container_type = 'service'
                        description = f'Docker container running {technology}'

            cid = sanitize_id(svc_name)
            if cid not in seen_ids:
                seen_ids.add(cid)
                containers.append({
                    'id': cid,
                    'name': svc_name,
                    'c4_type': 'Container',
                    'container_type': container_type,
                    'description': description,
                    'technology': technology,
                    'path': rel_path,
                    'packages': [],
                })

    # --- Deduplicate ---
    unique_containers = []
    seen_ids_final = set()
    for c in containers:
        if c['id'] not in seen_ids_final:
            seen_ids_final.add(c['id'])
            unique_containers.append(c)

    system_name = Path(repo_root).name.replace('_', ' ').replace('-', ' ')

    return {
        'system_name': system_name,
        'description': f'Container view of {system_name}',
        'containers': unique_containers,
    }


# =============================================================================
# C3 COMPONENT EXTRACTION
# =============================================================================

def extract_c3_components(repo_root):
    """Extract C3 Component level data for each container."""
    components_by_container = {}

    # .NET component detection
    DOTNET_COMPONENT_PATTERNS = [
        (r'class\s+(\w+Controller)\s*[:{<]', 'Handles HTTP requests and returns responses', 'ASP.NET Controller'),
        (r'class\s+(\w+Service)\s*[:{<]', 'Implements business logic and workflow', 'C# Service'),
        (r'class\s+(\w+Repository)\s*[:{<]', 'Handles data access and persistence', 'C# Repository'),
        (r'class\s+(\w+Handler)\s*[:{<]', 'Handles a command or query (MediatR)', 'MediatR Handler'),
        (r'class\s+(\w+Middleware)\s*[:{<]', 'ASP.NET request pipeline middleware', 'ASP.NET Middleware'),
        (r'class\s+(\w+Validator)\s*[:{<]', 'Validates input objects (FluentValidation)', 'FluentValidation Validator'),
        (r'class\s+(\w+(?:Mapper|Profile))\s*[:{<]', 'Maps between domain and DTO objects', 'AutoMapper Profile'),
        (r'class\s+(\w+Hub)\s*[:{<]', 'Handles real-time connections (SignalR)', 'SignalR Hub'),
        (r'class\s+(\w+(?:Consumer|Saga))\s*[:{<]', 'Processes messages from a queue (MassTransit)', 'MassTransit Consumer'),
        (r'class\s+(\w+BackgroundService)\s*[:{<]', 'Runs background tasks on a schedule', 'Hosted Background Service'),
        (r'class\s+(\w+DbContext)\s*[:{<]', 'Entity Framework database context', 'EF DbContext'),
        (r'class\s+(\w+Manager)\s*[:{<]', 'Implements business logic and coordination', 'C# Manager'),
    ]

    DOTNET_TEST_SKIP = {'xunit', 'nunit', 'mstest', 'microsoft.net.test.sdk'}

    # Build a map from directory prefix -> project name for faster C3 attribution
    _csproj_prefix_map = {}
    for abs_path, rel_path in walk_files(repo_root, ['.csproj']):
        proj_dir = str(Path(rel_path).parent).replace('\\', '/')
        _csproj_prefix_map[proj_dir] = Path(rel_path).stem

    def _get_proj_name(rel_path):
        parts = Path(rel_path).parts
        # Walk from longest prefix to shortest to find nearest .csproj
        for length in range(len(parts) - 1, 0, -1):
            prefix = '/'.join(parts[:length]).replace('\\', '/')
            if prefix in _csproj_prefix_map:
                return _csproj_prefix_map[prefix]
        # Fallback: find .csproj in a parent directory of this file
        abs_file = Path(repo_root) / rel_path
        for parent in abs_file.parents:
            for csproj in parent.glob('*.csproj'):
                return csproj.stem
            if parent == Path(repo_root):
                break
        # Last resort: if only one non-test csproj exists in the repo, attribute to it
        non_test = [v for k, v in _csproj_prefix_map.items()
                    if not any(t in v.lower() for t in ('test', 'spec'))]
        if len(non_test) == 1:
            return non_test[0]
        return parts[0] if parts else 'unknown'

    # First pass: collect all components so we can resolve IInterface -> component id later
    _all_components = {}  # comp_name_lower -> comp_id (across all containers)
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        if not content:
            continue
        if any(p in rel_path.lower() for p in ['test', 'spec', 'fixture']):
            continue
        proj_name = _get_proj_name(rel_path)
        if any(p in proj_name.lower() for p in ['test', 'spec']):
            continue
        for pattern, _, _ in DOTNET_COMPONENT_PATTERNS:
            for match in re.finditer(pattern, content):
                cname = match.group(1)
                _all_components[cname.lower()] = sanitize_id(cname)

    # Second pass: extract components + constructor injection edges
    c3_edges = []  # {source, target, label}
    seen_edges = set()

    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        if not content:
            continue
        proj_name = _get_proj_name(rel_path)

        # Skip test files and test projects
        if any(p in rel_path.lower() for p in ['test', 'spec', 'fixture']):
            continue
        if any(p in proj_name.lower() for p in ['test', 'spec']):
            continue

        # Detect components
        found_in_file = []
        for pattern, description, technology in DOTNET_COMPONENT_PATTERNS:
            for match in re.finditer(pattern, content):
                comp_name = match.group(1)
                if proj_name not in components_by_container:
                    components_by_container[proj_name] = {'components': []}
                components_by_container[proj_name]['components'].append({
                    'id': sanitize_id(comp_name),
                    'name': comp_name,
                    'c4_type': 'Component',
                    'description': description,
                    'technology': technology,
                    'path': rel_path,
                })
                found_in_file.append(sanitize_id(comp_name))

        # Detect minimal API route groups (MapGroup, MapGet, MapPost etc.)
        for match in re.finditer(r'(?:app|group|routes)\s*\.\s*Map(?:Get|Post|Put|Delete|Patch)\s*\(\s*[\'"]([^\'"]+)[\'"]', content):
            route = match.group(1)
            comp_name = f'Route: {route}'
            if proj_name not in components_by_container:
                components_by_container[proj_name] = {'components': []}
            components_by_container[proj_name]['components'].append({
                'id': sanitize_id(comp_name),
                'name': comp_name,
                'c4_type': 'Component',
                'description': f'Minimal API endpoint handling {route}',
                'technology': 'ASP.NET Minimal API',
                'path': rel_path,
            })
            found_in_file.append(sanitize_id(comp_name))

        # Extract constructor injection edges: IFoo _foo -> source depends on Foo
        if found_in_file:
            src_id = found_in_file[0]
            # Find constructor parameter list(s)
            for ctor_match in re.finditer(
                r'public\s+\w+\s*\(([^)]{10,})\)',  # public ClassName(params)
                content
            ):
                params = ctor_match.group(1)
                # Each param: ITypeName varName (interface)
                for param_match in re.finditer(r'\bI([A-Z]\w+)\s+\w+', params):
                    iface_impl = param_match.group(1)  # strip leading I
                    tgt_id = _all_components.get(iface_impl.lower())
                    if tgt_id and tgt_id != src_id:
                        edge_key = (src_id, tgt_id)
                        if edge_key not in seen_edges:
                            seen_edges.add(edge_key)
                            c3_edges.append({
                                'source': src_id,
                                'target': tgt_id,
                                'label': 'Uses',
                            })
                # Also detect concrete type dependencies (e.g., ApplicationDbContext, AuthenticationManager)
                # Match any capitalized type name that's not an interface (doesn't start with I)
                for param_match in re.finditer(r'\b([A-Z]\w+)\s+\w+', params):
                    concrete_type = param_match.group(1)
                    # Skip if it looks like an interface implementation (starts with I and exists as component)
                    if concrete_type.startswith('I') and concrete_type.lower() in _all_components:
                        continue
                    # Look for the concrete type in components
                    tgt_id = _all_components.get(concrete_type.lower())
                    if tgt_id and tgt_id != src_id:
                        edge_key = (src_id, tgt_id)
                        if edge_key not in seen_edges:
                            seen_edges.add(edge_key)
                            c3_edges.append({
                                'source': src_id,
                                'target': tgt_id,
                                'label': 'Uses',
                            })

    # --- Rust component detection ---
    # Build cargo prefix map for C3 attribution
    _cargo_prefix_map = {}
    for abs_path, rel_path in walk_files(repo_root, ['Cargo.toml']):
        proj_dir = str(Path(rel_path).parent).replace('\\', '/')
        content = read_file(abs_path)
        name_match = re.search(r'^name\s*=\s*"([^"]+)"', content, re.MULTILINE)
        if name_match:
            _cargo_prefix_map[proj_dir] = name_match.group(1)

    def _get_rust_proj_name(rel_path):
        parts = Path(rel_path).parts
        for length in range(len(parts) - 1, 0, -1):
            prefix = '/'.join(parts[:length]).replace('\\', '/')
            if prefix in _cargo_prefix_map:
                return _cargo_prefix_map[prefix]
        return parts[0] if parts else 'unknown'

    RUST_COMPONENT_PATTERNS = [
        (r'(?:pub\s+)?(?:async\s+)?fn\s+(\w+_handler)\s*\([^)]*\)',
         'Handles incoming HTTP requests', 'Rust async handler'),
        (r'(?:pub\s+)?(?:async\s+)?fn\s+(\w+)_route\s*\([^)]*\)',
         'Handles incoming HTTP requests', 'Rust async handler'),
        (r'(?:pub\s+)?struct\s+(\w+Service)\s*[{<]',
         'Implements business logic and workflow', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Repository)\s*[{<]',
         'Handles data access and persistence', 'Rust struct'),
        (r'(?:pub\s+)?trait\s+(\w+Repository)',
         'Defines data access interface', 'Rust trait'),
        (r'(?:pub\s+)?(?:async\s+)?fn\s+handle_(\w+)\s*\(',
         'Handles a specific operation', 'Rust handler function'),
        (r'(?:pub\s+)?fn\s+router\s*\(\)\s*->',
         'Defines route configuration', 'Rust router'),
        (r'(?:pub\s+)?fn\s+create_routes\s*\(\)',
         'Defines route configuration', 'Rust router'),
        (r'(?:pub\s+)?(?:async\s+)?fn\s+(\w+_middleware)\s*\(',
         'Request/response middleware', 'Rust middleware'),
        (r'impl\s+Handler\s+for\s+(\w+)',
         'Implements request handling', 'Rust Handler impl'),
        (r'impl\s+IntoResponse\s+for\s+(\w+)',
         'Implements response conversion', 'Rust IntoResponse impl'),
        (r'(?:pub\s+)?struct\s+(\w+Manager)\s*[{<]',
         'Manages resources and operations', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Processor)\s*[{<]',
         'Processes data and events', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Handler)\s*[{<]',
         'Handles specific events or requests', 'Rust struct'),
        (r'(?:pub\s+)?trait\s+(\w+Service)',
         'Defines service interface', 'Rust trait'),
        (r'(?:pub\s+)?struct\s+(\w+Client)\s*[{<]',
         'Client for external service', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Context)\s*[{<]',
         'Application context/state', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+State)\s*[{<]',
         'Application state container', 'Rust struct'),
        (r'pub\s+fn\s+(\w+_service)\s*\(',
         'Service factory function', 'Rust function'),
        (r'(?:pub\s+)?(?:async\s+)?fn\s+(\w+_consumer)\s*\(',
         'Consumes messages from queue', 'Rust async consumer'),
        (r'(?:pub\s+)?struct\s+(\w+Consumer)\s*[{<]',
         'Message consumer implementation', 'Rust struct'),
        (r'(?:pub\s+)?(?:async\s+)?fn\s+(\w+_jetstream)',
         'NATS JetStream handler', 'Rust async handler'),
        (r'(?:pub\s+)?struct\s+(\w+Resolver)\s*[{<]',
         'GraphQL resolver', 'Rust struct'),
        (r'#[\s]*graphql.*\n\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)',
         'GraphQL mutation/query', 'GraphQL resolver'),
        (r'(?:pub\s+)?struct\s+(\w+Auth)\s*[{<]',
         'Authentication handler', 'Rust struct'),
        (r'(?:pub\s+)?(?:async\s+)?fn\s+(\w+_auth)\s*\(',
         'Authentication handler', 'Rust async function'),
        (r'(?:pub\s+)?struct\s+(\w+Validator)\s*[{<]',
         'Input validation logic', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Cache)\s*[{<]',
         'Caching layer', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Metrics)\s*[{<]',
         'Metrics collection', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Limiter)\s*[{<]',
         'Rate limiting logic', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Registry)\s*[{<]',
         'Manages resource lifecycle', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Store)\s*[{<]',
         'Stores and retrieves data', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Builder)\s*[{<]',
         'Builder pattern for constructing objects', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Writer)\s*[{<]',
         'Writes data to a target', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Handle)\s*[{<]',
         'Aggregates service connections', 'Rust struct'),
        # Request/Response DTOs
        (r'(?:pub\s+)?struct\s+(\w+Request)\s*[{<]',
         'Request data transfer object', 'API Request'),
        (r'(?:pub\s+)?struct\s+(\w+Response)\s*[{<]',
         'Response data transfer object', 'API Response'),
        # Statistics and analytics types
        (r'(?:pub\s+)?struct\s+(\w+Statistics)\s*[{<]',
         'Statistics/aggregation data', 'Analytics'),
        # Domain entities
        (r'(?:pub\s+)?struct\s+(Business)\s*[{<]',
         'Business entity', 'Domain Model'),
        (r'(?:pub\s+)?struct\s+(Review)\s*[{<]',
         'Review entity', 'Domain Model'),
        (r'(?:pub\s+)?struct\s+(User)\s*[{<]',
         'User entity', 'Domain Model'),
        (r'(?:pub\s+)?struct\s+(Verification)\s*[{<]',
         'Verification entity', 'Domain Model'),
        # Event/message types
        (r'(?:pub\s+)?struct\s+(Message)\s*[{<]',
         'Message type', 'Event'),
        (r'(?:pub\s+)?struct\s+(Event)\s*[{<]',
         'Event type', 'Event'),
        # GraphQL types (Node suffix, Input suffix, Connection suffix)
        (r'(?:pub\s+)?struct\s+(\w+Node)\s*[{<]',
         'GraphQL node type', 'GraphQL type'),
        (r'(?:pub\s+)?struct\s+(\w+Input)\s*[{<]',
         'GraphQL input type', 'GraphQL input'),
        (r'(?:pub\s+)?struct\s+(\w+Connection)\s*[{<]',
         'GraphQL connection type', 'GraphQL connection'),
        # Result/Config types
        (r'(?:pub\s+)?struct\s+(\w+Result)\s*[{<]',
         'Result type', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Config)\s*[{<]',
         'Configuration type', 'Rust struct'),
        # Claims types (JWT/auth)
        (r'(?:pub\s+)?struct\s+(\w+Claims)\s*[{<]',
         'JWT claims type', 'Auth'),
        # Payload types
        (r'(?:pub\s+)?struct\s+(\w+Payload)\s*[{<]',
         'Data payload type', 'Rust struct'),
        # Generator/Builder types
        (r'(?:pub\s+)?struct\s+(\w+Generator)\s*[{<]',
         'Object generator', 'Rust struct'),
        # Service types
        (r'(?:pub\s+)?struct\s+(\w+Service)\s*[{<]',
         'Business service', 'Rust struct'),
        # Row/Record types (database)
        (r'(?:pub\s+)?struct\s+(\w+Row)\s*[{<]',
         'Database row type', 'Data Access'),
        # Template types
        (r'(?:pub\s+)?struct\s+(\w+Template)\s*[{<]',
         'Email/template type', 'Rust struct'),
        # Event handler types
        (r'(?:pub\s+)?struct\s+(\w+Event)\s*[{<]',
         'Event type', 'Event'),
        # Registry/Pool types
        (r'(?:pub\s+)?struct\s+(\w+Registry)\s*[{<]',
         'Resource registry', 'Rust struct'),
        # State types
        (r'(?:pub\s+)?struct\s+(\w+State)\s*[{<]',
         'Application state', 'Rust struct'),
        # Client types
        (r'(?:pub\s+)?struct\s+(\w+Client)\s*[{<]',
         'External service client', 'Rust struct'),
        # Config types
        (r'(?:pub\s+)?struct\s+(\w+Config)\s*[{<]',
         'Configuration holder', 'Rust struct'),
        # Result types
        (r'(?:pub\s+)?struct\s+(\w+Result)\s*[{<]',
         'Operation result type', 'Rust struct'),
        # Context types
        (r'(?:pub\s+)?struct\s+(\w+Context)\s*[{<]',
         'Context/ambient data', 'Rust struct'),
        # Cache types
        (r'(?:pub\s+)?struct\s+(\w+Cache)\s*[{<]',
         'Cache implementation', 'Rust struct'),
        # Processor types
        (r'(?:pub\s+)?struct\s+(\w+Processor)\s*[{<]',
         'Data processor', 'Rust struct'),
        # Writer types
        (r'(?:pub\s+)?struct\s+(\w+Writer)\s*[{<]',
         'Data writer', 'Rust struct'),
        # Builder types
        (r'(?:pub\s+)?struct\s+(\w+Builder)\s*[{<]',
         'Object builder', 'Rust struct'),
        # Entry types (audit/log)
        (r'(?:pub\s+)?struct\s+(\w+Entry)\s*[{<]',
         'Log/audit entry', 'Rust struct'),
        # URL types
        (r'(?:pub\s+)?struct\s+(\w+Url)\s*[{<]',
         'URL type', 'Rust struct'),
        # Metrics/analytics types
        (r'(?:pub\s+)?struct\s+(\w+Metrics)\s*[{<]',
         'Metrics collector', 'Rust struct'),
        (r'(?:pub\s+)?struct\s+(\w+Analytics)\s*[{<]',
         'Analytics data', 'Analytics'),
        (r'(?:pub\s+)?struct\s+(\w+Stats)\s*[{<]',
         'Statistics data', 'Analytics'),
        # Snapshot types
        (r'(?:pub\s+)?struct\s+(\w+Snapshot)\s*[{<]',
         'Data snapshot', 'Analytics'),
        # Bucket types
        (r'(?:pub\s+)?struct\s+(\w+Bucket)\s*[{<]',
         'Data bucket', 'Analytics'),
        # Distribution types
        (r'(?:pub\s+)?struct\s+(\w+Distribution)\s*[{<]',
         'Statistical distribution', 'Analytics'),
        # Job types
        (r'(?:pub\s+)?struct\s+(\w+Job)\s*[{<]',
         'Background job', 'Rust struct'),
        # Store types
        (r'(?:pub\s+)?struct\s+(\w+Store)\s*[{<]',
         'Data store', 'Data Access'),
        # Record types
        (r'(?:pub\s+)?struct\s+(\w+Record)\s*[{<]',
         'Data record', 'Data Access'),
        # Input types
        (r'(?:pub\s+)?struct\s+(\w+Input)\s*[{<]',
         'Input data type', 'Rust struct'),
        # Handle types
        (r'(?:pub\s+)?struct\s+(\w+Handle)\s*[{<]',
         'Resource handle', 'Rust struct'),
        # Payload types
        (r'(?:pub\s+)?struct\s+(\w+Payload)\s*[{<]',
         'Data payload', 'Rust struct'),
        # Generator types
        (r'(?:pub\s+)?struct\s+(\w+Generator)\s*[{<]',
         'Value generator', 'Rust struct'),
        # Template types
        (r'(?:pub\s+)?struct\s+(\w+Template)\s*[{<]',
         'Template type', 'Rust struct'),
        # Connection types
        (r'(?:pub\s+)?struct\s+(\w+Connection)\s*[{<]',
         'GraphQL connection', 'GraphQL connection'),
        # Node types
        (r'(?:pub\s+)?struct\s+(\w+Node)\s*[{<]',
         'GraphQL node', 'GraphQL type'),
    ]

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)
        if not content:
            continue

        if 'tests' in rel_path.replace('\\', '/').split('/'):
            continue

        proj_name = _get_rust_proj_name(rel_path)

        for pattern, description, technology in RUST_COMPONENT_PATTERNS:
            for match in re.finditer(pattern, content):
                comp_name = match.group(1)
                # Skip test functions and mock structs
                if comp_name.lower().startswith(('test_', 'mock')):
                    continue
                # Check for #[test] annotation in preceding lines
                preceding = content[max(0, match.start() - 80):match.start()]
                if '#[test]' in preceding:
                    continue
                if proj_name not in components_by_container:
                    components_by_container[proj_name] = {'components': []}

                existing_ids = {c['id'] for c in components_by_container[proj_name]['components']}
                comp_id = sanitize_id(comp_name)
                if comp_id not in existing_ids:
                    components_by_container[proj_name]['components'].append({
                        'id': comp_id,
                        'name': comp_name,
                        'c4_type': 'Component',
                        'description': description,
                        'technology': technology,
                        'path': rel_path,
                    })

    # Rust C3 relationship helper
    def add_c3_rel(src, tgt, label, tech=''):
        edge_key = (src, tgt)
        if edge_key not in seen_edges and src != tgt:
            seen_edges.add(edge_key)
            c3_edges.append({'source': src, 'target': tgt, 'label': label, 'technology': tech})

    # Build comp_to_container mapping early so nested functions can access it
    comp_to_container = {}
    for proj_name, container_data in components_by_container.items():
        for comp in container_data.get('components', []):
            comp_to_container[comp['id']] = proj_name

    # Try AST-based Rust parsing first (graceful fallback to regex)
    def try_rust_ast_parser():
        """Try to use compiled Rust parser for better accuracy. Falls back silently on failure."""
        import subprocess
        import json
        import os

        # Try both release and debug binaries (global tools location)
        script_dir = os.path.dirname(__file__)
        bin_paths = [
            os.path.normpath(os.path.join(script_dir, 'c4-rust-parser', 'target', 'release', 'c4-rust-parser.exe')),
            os.path.normpath(os.path.join(script_dir, 'c4-rust-parser', 'target', 'release', 'c4-rust-parser')),
            os.path.normpath(os.path.join(script_dir, 'c4-rust-parser', 'target', 'debug', 'c4-rust-parser.exe')),
            os.path.normpath(os.path.join(script_dir, 'c4-rust-parser', 'target', 'debug', 'c4-rust-parser')),
        ]

        for bin_path in bin_paths:
            abs_bin_path = os.path.abspath(bin_path)
            if not os.path.exists(abs_bin_path):
                continue
            try:
                result = subprocess.run(
                    [abs_bin_path, repo_root],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                if result.returncode == 0:
                    data = json.loads(result.stdout)
                    # Add all AST-detected components first
                    seen_comp_ids = set(comp_to_container.keys())
                    for comp in data.get('components', []):
                        if comp['id'] not in seen_comp_ids:
                            comp_path = comp.get('path', '')
                            if comp_path.startswith(repo_root):
                                rel_path = comp_path[len(repo_root):].lstrip('\\/')
                            else:
                                rel_path = comp_path
                            proj_name = _get_rust_proj_name(rel_path)
                            if proj_name not in components_by_container:
                                components_by_container[proj_name] = {'components': []}
                            components_by_container[proj_name]['components'].append({
                                'id': comp['id'],
                                'name': comp['name'],
                                'c4_type': 'Component',
                                'description': f"{comp['name']} ({comp['kind']})",
                                'technology': 'AST detection',
                                'path': rel_path,
                            })
                            seen_comp_ids.add(comp['id'])
                            comp_to_container[comp['id']] = proj_name

                    # Add all AST-detected relationships and any missing components they reference
                    for rel in data.get('relationships', []):
                        src_id = rel['source']
                        tgt_id = rel['target']

                        def get_container_for_id(cid):
                            if cid in comp_to_container:
                                return comp_to_container[cid]
                            return 'bw-api'

                        src_container = get_container_for_id(src_id)
                        tgt_container = get_container_for_id(tgt_id)

                        if src_id not in seen_comp_ids:
                            if src_container not in components_by_container:
                                components_by_container[src_container] = {'components': []}
                            components_by_container[src_container]['components'].append({
                                'id': src_id,
                                'name': src_id.replace('-', '_').title(),
                                'c4_type': 'Component',
                                'description': 'Function or method',
                                'technology': 'AST detection',
                                'path': f'{src_container}/src/lib.rs',
                            })
                            seen_comp_ids.add(src_id)
                            comp_to_container[src_id] = src_container

                        if tgt_id not in seen_comp_ids:
                            if tgt_container not in components_by_container:
                                components_by_container[tgt_container] = {'components': []}
                            components_by_container[tgt_container]['components'].append({
                                'id': tgt_id,
                                'name': tgt_id.replace('-', '_').title(),
                                'c4_type': 'Component',
                                'description': 'Type or struct',
                                'technology': 'AST detection',
                                'path': f'{tgt_container}/src/lib.rs',
                            })
                            seen_comp_ids.add(tgt_id)
                            comp_to_container[tgt_id] = tgt_container

                        add_c3_rel(
                            src_id,
                            tgt_id,
                            rel.get('label', 'Uses'),
                            rel.get('technology', 'AST detection')
                        )
                    return True
            except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, Exception):
                continue
        return False

    # Run AST parser for relationships (uses comp_to_container from outer scope)
    try_rust_ast_parser()

    # Rust C3 relationship detection: cross-file use/call analysis (fallback/补充)
    rust_comp_map = {}
    for proj_name, data in components_by_container.items():
        rust_comp_map[proj_name] = {}
        for comp in data.get('components', []):
            key = comp['name'].lower()
            rust_comp_map[proj_name].setdefault(key, []).append((comp['id'], comp.get('path', '')))

    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)
        if not content:
            continue
        if 'tests' in rel_path.replace('\\', '/').split('/'):
            continue
        proj_name = _get_rust_proj_name(rel_path)
        if proj_name not in rust_comp_map:
            continue
        local_comps = []
        for comp_name_lower, entries in rust_comp_map[proj_name].items():
            for comp_id, cpath in entries:
                if cpath == rel_path:
                    local_comps.append((comp_name_lower, comp_id))
        if not local_comps:
            continue
        local_comp_ids = {cid for _, cid in local_comps}
        content_lower = content.lower()
        for comp_name_lower, entries in rust_comp_map[proj_name].items():
            if not entries:
                continue
            target_id = entries[0][0]
            if target_id in local_comp_ids:
                continue
            target_path = entries[0][1]
            if target_path == rel_path:
                continue
            use_pattern = r'use\s+(?:\w+::)+\s*' + re.escape(comp_name_lower) + r'\b'
            call_pattern = re.escape(comp_name_lower) + r'::'
            struct_pattern = re.escape(comp_name_lower) + r'\s*[{<(]'
            if (re.search(use_pattern, content, re.IGNORECASE) or
                re.search(call_pattern, content_lower) or
                re.search(struct_pattern, content_lower)):
                for _, src_id in local_comps:
                    add_c3_rel(src_id, target_id, 'Calls', 'Method call')

    # Node.js component detection
    for abs_path, rel_path in walk_files(repo_root, ['.ts', '.js']):
        content = read_file(abs_path)
        if 'node_modules' in rel_path:
            continue

        proj_name = Path(rel_path).parts[0] if len(Path(rel_path).parts) > 1 else 'unknown'

        # Detect route handlers
        for match in re.finditer(r'(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*[\'"](.+?)[\'"]', content):
            route = match.group(1)
            comp_name = f'Route Handler: {route}'
            if proj_name not in components_by_container:
                components_by_container[proj_name] = {'components': []}
            components_by_container[proj_name]['components'].append({
                'id': sanitize_id(comp_name),
                'name': comp_name,
                'c4_type': 'Component',
                'description': f'Handles HTTP requests for {route}',
                'technology': 'Express/Fastify route',
                'path': rel_path,
            })

    # Build C3.5 Types layer - extract all unique types from relationships + source code
    # These are the actual types (structs, enums, type aliases, interfaces) that form the code structure
    # Maps Rust types to their .NET equivalents using the known equivalence table
    #   Rust struct → .NET class/struct/record
    #   Rust enum (data) → .NET class with discriminated union pattern
    #   Rust enum (flags) → .NET enum
    #   Rust trait → .NET interface
    #   Rust impl Trait → .NET interface implementation
    #   Rust Result → .NET custom Result or exceptions
    #   Rust Option → .NET nullable/nullable reference types

    types_by_container = {}
    type_relationships = []
    seen_types = set()
    seen_type_rels = set()

    DOTNET_TYPE_PATTERNS = [
        # Entity/domain model patterns (map to Rust struct)
        # Use [ \t] instead of \s to prevent cross-line matching
        (r'(?:public|internal|private|protected)?[ \t]*(?:sealed[ \t]+)?(?:abstract[ \t]+)?class[ \t]+(?!\w*(?:Controller|Service|Repository|Handler|Middleware|Validator|Mapper|Profile|Hub|Consumer|Saga|BackgroundService|DbContext|Manager|Startup|Program|Provider|Factory|Builder|Helper|Extension|Options|Attribute|Filter|Action|Result|Page|ViewComponent|TagHelper|HostedService))\b(\w+)\b', 'Domain entity or model class', 'class', 'struct'),
        # Explicit struct declarations (value types → Rust struct)
        (r'(?:public|internal|private|protected)?[ \t]*(?:readonly[ \t]+)?(?:partial[ \t]+)?struct[ \t]+(\w+)', 'Value type struct', 'struct', 'struct'),
        # Record types (C# 9+, immutable data carriers → Rust struct)
        (r'(?:public|internal|private|protected)?[ \t]*(?:record[ \t]+(?:class[ \t]+)?(?:struct[ \t]+)?)(\w+)', 'Immutable data record', 'record', 'struct'),
        # Interface declarations (→ Rust trait)
        (r'(?:public|internal|private|protected)?[ \t]*interface[ \t]+(\w+)', 'Interface (equivalent to Rust trait)', 'interface', 'trait'),
        # Enum declarations (→ Rust enum)
        (r'(?:public|internal|private|protected)?[ \t]*enum[ \t]+(\w+)', 'Enumeration type', 'enum', 'enum'),
        # DTO/ViewModel patterns (→ Rust struct)
        (r'(?:public|internal|private|protected)?[ \t]*(?:sealed[ \t]+)?class[ \t]+(\w+(?:Dto|DTO|ViewModel|View|Model|Request|Response|Command|Query|Event|Message))\b', 'Data transfer object or view model', 'class', 'struct'),
    ]

    DOTNET_TEST_SKIP = {'xunit', 'nunit', 'mstest', 'microsoft.net.test.sdk'}

    # .NET type extraction from source files
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        if not content:
            continue
        if any(p in rel_path.lower() for p in ['test', 'spec', 'fixture']):
            continue
        proj_name = _get_proj_name(rel_path)
        if any(p in proj_name.lower() for p in ['test', 'spec']):
            continue

        for pattern, description, dotnet_kind, rust_equivalent in DOTNET_TYPE_PATTERNS:
            for match in re.finditer(pattern, content):
                type_name = match.group(1)
                type_id = sanitize_id(type_name)
                if type_id not in seen_types:
                    seen_types.add(type_id)
                    cont_key = sanitize_id(proj_name)
                    if cont_key not in types_by_container:
                        types_by_container[cont_key] = {'types': []}
                    types_by_container[cont_key]['types'].append({
                        'id': type_id,
                        'name': type_name,
                        'type_kind': dotnet_kind,
                        'rust_equivalent': rust_equivalent,
                        'description': description,
                        'source_kind': '.NET source',
                        'path': rel_path,
                    })
                    comp_to_container[type_id] = proj_name

        # Extract inheritance/implementation edges (→ trait impl)
        # class Foo : IBar → Foo depends on IBar
        for inherit_match in re.finditer(r'class\s+(\w+)\s*:\s*(\w+(?:,\s*\w+)*)', content):
            child_name = inherit_match.group(1)
            parents = [p.strip() for p in inherit_match.group(2).split(',')]
            child_id = sanitize_id(child_name)
            for parent in parents:
                parent_id = sanitize_id(parent)
                if parent_id in seen_types and child_id in seen_types:
                    rel_key = (child_id, parent_id, 'Implements')
                    if rel_key not in seen_type_rels:
                        seen_type_rels.add(rel_key)
                        type_relationships.append({
                            'source': child_id,
                            'target': parent_id,
                            'label': 'Implements',
                            'technology': 'inheritance',
                        })

    # Also derive types from Rust relationship edges (existing behavior)
    for rel in c3_edges:
        src_id = rel['source']
        tgt_id = rel['target']

        if src_id not in seen_types:
            seen_types.add(src_id)
            container = sanitize_id(comp_to_container.get(src_id, 'bw-api'))
            if container not in types_by_container:
                types_by_container[container] = {'types': []}
            types_by_container[container]['types'].append({
                'id': src_id,
                'name': src_id.replace('-', '_').title(),
                'type_kind': 'function' if any(kw in src_id for kw in ['execute', 'build', 'parse', 'extract', 'generate', 'make', 'sign', 'validate', 'insert', 'query', 'record', 'publish', 'set', 'update', 'is_', 'by_']) else 'struct',
                'rust_equivalent': 'function' if any(kw in src_id for kw in ['execute', 'build', 'parse', 'extract', 'generate', 'make', 'sign', 'validate', 'insert', 'query', 'record', 'publish', 'set', 'update', 'is_', 'by_']) else 'struct',
                'description': 'Function' if any(kw in src_id for kw in ['execute', 'build', 'parse', 'extract', 'generate', 'make', 'sign', 'validate', 'insert', 'query', 'record', 'publish', 'set', 'update', 'is_', 'by_']) else 'Type',
                'source_kind': 'Rust relationship',
            })

        if tgt_id not in seen_types:
            seen_types.add(tgt_id)
            container = sanitize_id(comp_to_container.get(tgt_id, 'bw-api'))
            if container not in types_by_container:
                types_by_container[container] = {'types': []}
            types_by_container[container]['types'].append({
                'id': tgt_id,
                'name': tgt_id.replace('-', '_').title(),
                'type_kind': 'struct',
                'rust_equivalent': 'struct',
                'description': 'Data type',
                'source_kind': 'Rust relationship',
            })

        rel_key = (src_id, tgt_id, rel['label'])
        if rel_key not in seen_type_rels:
            seen_type_rels.add(rel_key)
            type_relationships.append(rel)

    # Add .NET type-to-type relationships from inheritance scans
    # (already populated above during source scan)

    return {
        'containers': components_by_container,
        'relationships': c3_edges,
        'types': types_by_container,
        'type_relationships': type_relationships,
    }


# =============================================================================
# RELATIONSHIP EXTRACTION
# =============================================================================

def extract_relationships(repo_root, c1, c2):
    """Extract relationships between elements."""
    relationships = {'c1': [], 'c2': []}

    # C1: People to software system
    sys_id = sanitize_id(c1['system_name'])
    for person in c1.get('people', []):
        relationships['c1'].append({
            'source': person['id'],
            'target': sys_id,
            'label': 'Uses',
            'technology': '',
        })

    # C1: Software system to external systems
    for ext in c1.get('external_systems', []):
        relationships['c1'].append({
            'source': sys_id,
            'target': ext['id'],
            'label': 'Uses',
            'technology': ext.get('technology', ''),
        })

    containers = c2.get('containers', [])
    container_by_id = {c['id']: c for c in containers}
    seen_rels = set()

    def add_rel(source, target, label, tech=''):
        key = (source, target, label)
        if key not in seen_rels and source != target:
            seen_rels.add(key)
            relationships['c2'].append({'source': source, 'target': target, 'label': label, 'technology': tech})

    # C2: ProjectReference deps (ground truth for .NET container-to-container)
    for cont in containers:
        for ref_path in cont.get('_project_refs', []):
            ref_stem = sanitize_id(Path(ref_path).stem)
            if ref_stem in container_by_id:
                add_rel(cont['id'], ref_stem, 'Depends on', 'ProjectReference')

    # C2: .projitems shared modules linked via <Import Project=... Label="Shared">
    # The module is compiled directly into the consumer — emit source=module, target=consumer
    for cont in containers:
        for import_path in cont.get('_projitems_imports', []):
            # Resolve to the projitems display name by matching container paths
            import_stem = Path(import_path).stem
            # Find the container whose path ends with this projitems file
            for lib in containers:
                lib_path = lib.get('path', '')
                if Path(lib_path).stem == import_stem or sanitize_id(import_stem) == lib['id']:
                    add_rel(lib['id'], cont['id'], 'Linked into', 'Shared Module')
                    break

    # C2: HttpClient / IHttpClientFactory registrations → external calls
    for abs_path, rel_path in walk_files(repo_root, ['.cs']):
        content = read_file(abs_path)
        if not re.search(r'IHttpClientFactory|AddHttpClient|HttpClient', content):
            continue
        proj_name = Path(rel_path).parts[0] if len(Path(rel_path).parts) > 1 else None
        if proj_name:
            cid = sanitize_id(proj_name)
            # Find named clients (AddHttpClient("MyService", ...))
            for match in re.finditer(r'AddHttpClient\s*\(\s*["\'](\w+)["\']', content):
                client_name = match.group(1)
                ext_id = sanitize_id(client_name)
                # Only add if it looks like an external system, not another container
                if ext_id not in container_by_id:
                    add_rel(cid, ext_id, f'Calls [{client_name}]', 'HTTP')

    # C2: Connection strings in appsettings.json → database relationships
    for abs_path, rel_path in walk_files(repo_root, ['.json']):
        if 'appsettings' not in rel_path.lower():
            continue
        content = read_file(abs_path)
        try:
            import json as _json
            data = _json.loads(content)
        except Exception:
            continue
        conn_strings = data.get('ConnectionStrings', {})
        proj_dir = Path(abs_path).parent
        # Find nearest .csproj to attribute connection strings
        csproj = next((p for p in proj_dir.glob('*.csproj')), None)
        if not csproj:
            csproj = next((p for p in proj_dir.parent.glob('*.csproj')), None)
        if not csproj:
            continue
        src_id = sanitize_id(csproj.stem)
        for db_name, conn_str in conn_strings.items():
            # Try to find a matching container by name
            db_id = sanitize_id(db_name)
            if db_id in container_by_id:
                add_rel(src_id, db_id, 'Reads/Writes', 'SQL')
            else:
                # Infer technology from connection string
                tech = 'SQL'
                if 'postgresql' in conn_str.lower() or 'npgsql' in conn_str.lower():
                    tech = 'PostgreSQL'
                elif 'sqlserver' in conn_str.lower() or 'data source' in conn_str.lower():
                    tech = 'SQL Server'
                # Check if there's a DbContext container we should link to instead
                db_context_id = sanitize_id('applicationdbcontext')
                if db_context_id in container_by_id:
                    add_rel(src_id, db_context_id, 'Reads/Writes', tech)
                else:
                    add_rel(src_id, db_id, f'Reads/Writes [{db_name}]', tech)

    # C2: Node.js proxy/upstream env patterns → infer calls to .NET API container
    for abs_path, rel_path in walk_files(repo_root, ['.ts', '.js']):
        if 'node_modules' in rel_path:
            continue
        content = read_file(abs_path)
        if not re.search(r'UPSTREAM_BASE_URL|PROXY_TARGET|API_BASE_URL|SERVICE_URL', content):
            continue
        # Find the Node container whose package.json dir contains this file
        file_dir = str(Path(rel_path).parent).replace('\\', '/')
        src_id = None
        for cid, cont in container_by_id.items():
            pkg_dir = str(Path(cont.get('path', '')).parent).replace('\\', '/')
            if file_dir.startswith(pkg_dir) and cont.get('technology', '').startswith('Node'):
                src_id = cid
                break
        if not src_id:
            continue
        # Add relationship to all .NET Web API containers in the same repo
        for cid, cont in container_by_id.items():
            if cid != src_id and 'asp.net' in cont.get('technology', '').lower():
                add_rel(src_id, cid, 'Proxies requests to', 'HTTPS')

    # C2: Cargo dependency relationships (Rust)
    for abs_path, rel_path in walk_files(repo_root, ['Cargo.toml']):
        content = read_file(abs_path)
        if not content:
            continue
        name_match = re.search(r'^name\s*=\s*"([^"]+)"', content, re.MULTILINE)
        if not name_match:
            continue
        src_name = sanitize_id(name_match.group(1))
        dep_section = re.search(r'\[dependencies\](.*?)(?=\n\[|\Z)', content, re.DOTALL)
        if dep_section:
            for dep_match in re.finditer(r'^([\w-]+)\s*=', dep_section.group(1), re.MULTILINE):
                dep_name = sanitize_id(dep_match.group(1))
                if dep_name in container_by_id:
                    add_rel(src_name, dep_name, 'Depends on', 'Cargo dependency')
            # Also handle `name.workspace = true` syntax
            for dep_match in re.finditer(r'^([\w-]+)\.workspace\s*=\s*true', dep_section.group(1), re.MULTILINE):
                dep_name = sanitize_id(dep_match.group(1))
                if dep_name in container_by_id:
                    add_rel(src_name, dep_name, 'Depends on', 'Cargo dependency')
        # Also check [dev-dependencies] and [build-dependencies]
        for dep_section_name in ['dev-dependencies', 'build-dependencies']:
            dev_dep_section = re.search(r'\[' + dep_section_name + r'\](.*?)(?=\n\[|\Z)', content, re.DOTALL)
            if dev_dep_section:
                for dep_match in re.finditer(r'^([\w-]+)\s*=', dev_dep_section.group(1), re.MULTILINE):
                    dep_name = sanitize_id(dep_match.group(1))
                    if dep_name in container_by_id:
                        add_rel(src_name, dep_name, 'Depends on (dev)', 'Cargo dependency')
                for dep_match in re.finditer(r'^([\w-]+)\.workspace\s*=\s*true', dev_dep_section.group(1), re.MULTILINE):
                    dep_name = sanitize_id(dep_match.group(1))
                    if dep_name in container_by_id:
                        add_rel(src_name, dep_name, 'Depends on (dev)', 'Cargo dependency')
                # Extract testcontainers-modules features as container connections
                tc_match = re.search(
                    r'testcontainers-modules\s*=\s*\{.*?features\s*=\s*\[(.*?)\]',
                    dev_dep_section.group(1), re.DOTALL
                )
                if tc_match:
                    for feature in re.findall(r'"([^"]+)"', tc_match.group(1)):
                        if feature in container_by_id:
                            add_rel(src_name, feature, 'Connects to (test)', 'Testcontainers')

    # C2: Docker Compose depends_on → container relationships
    for abs_path, rel_path in walk_files(repo_root, ['.yml', '.yaml']):
        if 'docker-compose' not in rel_path.lower():
            continue
        content = read_file(abs_path)
        services_match = re.search(r'^services:\s*\n(.*?)(?=\n\w|\Z)', content, re.MULTILINE | re.DOTALL)
        if not services_match:
            continue
        services_section = services_match.group(1)
        for match in re.finditer(r'^  (\w[\w-]*):', services_section, re.MULTILINE):
            svc_name = match.group(1)
            svc_block = re.search(rf'{svc_name}:.*?(?=\n  \w|\Z)', services_section, re.DOTALL)
            if not svc_block:
                continue
            block = svc_block.group(0)
            src_id = sanitize_id(svc_name)
            if src_id not in container_by_id:
                continue
            # PGRST_DB_URI / DATABASE_URL referencing another container
            env_matches = re.finditer(r'(?:PGRST_DB_URI|DATABASE_URL)\s*:\s*[^@]+@(\w+)', block, re.IGNORECASE)
            for env_match in env_matches:
                target_id = sanitize_id(env_match.group(1))
                if target_id in container_by_id:
                    add_rel(src_id, target_id, 'Reads/Writes', 'PostgreSQL')
            # GOTRUE_SITE_URL referencing the frontend
            if re.search(r'GOTRUE_SITE_URL\s*:\s*http://localhost:\d+', block):
                if 'black-wall-street' in container_by_id:
                    add_rel(src_id, 'black-wall-street', 'Redirects to', 'HTTPS')
            # depends_on
            dep_match = re.search(r'depends_on:\s*\n(.*?)(?=\n  \w|\Z)', block, re.DOTALL)
            if dep_match:
                for dep_line in re.finditer(r'^\s{4}(\w[\w-]*)', dep_match.group(1), re.MULTILINE):
                    dep_name = dep_line.group(1)
                    dep_id = sanitize_id(dep_name)
                    if dep_id in container_by_id:
                        add_rel(src_id, dep_id, 'Connects to', 'Docker network')

    # C2: Rust source-level database connection patterns
    for abs_path, rel_path in walk_files(repo_root, ['.rs']):
        content = read_file(abs_path)
        if not content:
            continue
        parts = Path(rel_path).parts
        src_id = None
        # Walk path segments inward to find the crate directory that matches a container
        for i in range(len(parts) - 1, 0, -1):
            candidate = sanitize_id(parts[i - 1])
            if candidate in container_by_id:
                src_id = candidate
                break
        if not src_id:
            continue
        if 'clickhouse' in content.lower() and re.search(r'Client::create|clickhouse::Client', content):
            add_rel(src_id, 'clickhouse', 'Reads/Writes', 'ClickHouse')
        if 'nats' in content.lower() and re.search(r'nats::connect|nats::Connection', content):
            add_rel(src_id, 'nats', 'Publishes/Subscribes', 'NATS')
        if 'redis' in content.lower() and re.search(r'redis::Client|redis::Connection', content):
            target = 'redis' if 'redis' in container_by_id else ('valkey' if 'valkey' in container_by_id else None)
            if target:
                add_rel(src_id, target, 'Reads/Writes', 'Redis/Valkey')
        if re.search(r'MINIO_ROOT_USER|MinioClient|MinioClientImpl|PresignConfig|minio_bucket', content):
            if 'minio' in container_by_id:
                add_rel(src_id, 'minio', 'Reads/Writes', 'S3-compatible API')

    # C2: Prometheus scrape config → container relationships
    for abs_path, rel_path in walk_files(repo_root, ['.yml', '.yaml']):
        if 'datasource' in rel_path.lower() or 'dashboard' in rel_path.lower():
            continue
        content = read_file(abs_path)
        if 'targets:' not in content or 'prometheus' not in content.lower():
            continue
        if 'prometheus' not in container_by_id:
            continue
        for match in re.finditer(r'targets:\s*\[([^\]]+)\]', content):
            for target_match in re.finditer(r'"([\w-]+):(\d+)"', match.group(1)):
                target_id = sanitize_id(target_match.group(1))
                if target_id in container_by_id:
                    add_rel('prometheus', target_id, 'Scrapes metrics from', 'Prometheus')

    # C2: Grafana datasource provisioning → container relationships
    for abs_path, rel_path in walk_files(repo_root, ['.yml', '.yaml']):
        if 'datasource' not in rel_path.lower():
            continue
        content = read_file(abs_path)
        if 'black-wall-street' in container_by_id and 'grafana' in container_by_id:
            for match in re.finditer(r'url:\s*http://([\w-]+):(\d+)', content):
                target_id = sanitize_id(match.group(1))
                if target_id in container_by_id:
                    add_rel('grafana', target_id, 'Reads metrics from', 'Grafana datasource')

    # C2: Fallback — package-name substring matching for non-.NET containers
    for cont in containers:
        if cont.get('_project_refs') is not None:
            continue  # Already handled via ProjectReference above
        for pkg in cont.get('packages', []):
            pkg_lower = pkg.lower()
            # SDK-to-container mappings (drawn before generic substring matching)
            if 'supabase' in pkg_lower:
                # @supabase/supabase-js SDK connects to: auth, rest, storage — NOT studio/postgres
                for other in containers:
                    oid = other['id']
                    if oid != cont['id'] and oid in ('auth', 'rest', 'storage'):
                        add_rel(cont['id'], oid, 'Connects to', 'Supabase SDK')
            elif 'nats.ws' in pkg_lower:
                for other in containers:
                    if other['id'] != cont['id'] and other['id'] == 'nats':
                        add_rel(cont['id'], other['id'], 'Connects to', 'NATS WebSocket')
            elif 'aws-sdk' in pkg_lower or 'aws.' in pkg_lower:
                for other in containers:
                    if other['id'] != cont['id'] and other['id'] == 'minio':
                        add_rel(cont['id'], other['id'], 'Connects to', 'S3-compatible API')
            # Generic substring fallback: container name in package name
            for other in containers:
                if other['id'] != cont['id'] and other['name'].lower().replace('-', '') in pkg_lower:
                    add_rel(cont['id'], other['id'], 'Depends on', 'Package reference')

    # C2: Frontend source-level MinIO URL references
    for abs_path, rel_path in walk_files(repo_root, ['.ts', '.tsx', '.js', '.jsx']):
        if 'node_modules' in rel_path or '.next' in rel_path:
            continue
        content = read_file(abs_path)
        if 'MINIO_URL' in content or 'MINIO_BASE_URL' in content or 'MINIO_BUCKET' in content:
            src_id = 'black-wall-street' if 'black-wall-street' in container_by_id else None
            if src_id and 'minio' in container_by_id:
                add_rel(src_id, 'minio', 'Reads/Writes', 'S3-compatible API')
            break

    # Strip internal _project_refs from output
    for cont in containers:
        cont.pop('_project_refs', None)

    # Sort C2 relationships so source-level patterns render before generic deps
    def c2_rel_key(r):
        order = {'Reads/Writes': 0, 'Publishes/Subscribes': 1, 'Scrapes metrics from': 2, 'Reads metrics from': 3, 'Connects to (test)': 4, 'Depends on': 5, 'Depends on (dev)': 6}
        return order.get(r.get('label', ''), 7)
    relationships['c2'].sort(key=c2_rel_key)

    return relationships


# =============================================================================
# MAIN
# =============================================================================

def extract_all(repo_root):
    """Extract all C4 data from repository."""
    c1 = extract_c1_context(repo_root)
    c2 = extract_c2_containers(repo_root)
    c3 = extract_c3_components(repo_root)
    relationships = extract_relationships(repo_root, c1, c2)
    relationships['c3'] = c3.get('relationships', [])

    return {
        'c1_context': c1,
        'c2_containers': c2,
        'c3_components': {'containers': c3['containers']},
        'c3_5_types': {'containers': c3.get('types', {})},
        'relationships': relationships,  # Keep as dict: {c1, c2, c3}
        'type_relationships': c3.get('type_relationships', []),
    }


def main():
    # Force UTF-8 output on Windows
    if sys.platform == 'win32':
        sys.stdout.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description='Extract C4 architectural data from repository')
    parser.add_argument('repo_root', help='Path to repository root')
    parser.add_argument('--json', action='store_true', help='Output as JSON (default)')
    args = parser.parse_args()

    repo_root = os.path.abspath(args.repo_root)
    if not os.path.isdir(repo_root):
        print(f"Error: {repo_root} is not a directory", file=sys.stderr)
        sys.exit(1)

    data = extract_all(repo_root)
    print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
