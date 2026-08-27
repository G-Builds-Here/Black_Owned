#!/usr/bin/env python3
"""Map authentication token/credential usage to endpoints and test groups.

Finds all distinct token/credential variables used in a codebase, then maps
each to the test files, test classes, and URL patterns where it appears.
Useful for survey artifacts that need to document "which token for which endpoint."

Usage:
    python map-token-usage.py <repo_root> [--json]

Auto-detection:
    Searches for token/credential patterns:
    - C#: static properties ending in Token, Key, Secret, Credential
    - Config references: CLIENT_ID, CLIENT_SECRET, TOKEN, API_KEY
    - OAuth helper classes: *TokenHelper*, *AuthHelper*, *CredentialHelper*

Output (JSON):
    {
        "tokens": [
            {
                "name": "CognitoToken",
                "source": "CognitoTokenHelper.cs:15",
                "env_vars": ["PPG_CLIENT_ID", "PPG_CLIENT_SECRET"],
                "scope": "integration-service-resource-server/payments_scope",
                "used_in": [
                    {"file": "Transactions_POST_Tests.cs", "line": 25, "context": "this.cognitoToken = CognitoTokenHelper.CognitoToken"},
                    ...
                ],
                "endpoint_families": ["transactions", "refunds", "payors"],
                "test_groups": ["Txn", "TxnDependent", "Main"]
            }
        ],
        "summary": {
            "tokens_found": 4,
            "files_scanned": 80,
            "unmapped_endpoints": []
        }
    }
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path


# Patterns for finding token declarations (C#)
TOKEN_DECL_PATTERNS = [
    # Static property: public static string? CognitoToken
    re.compile(r'public\s+static\s+\w+\??\s+(\w*(?:Token|Key|Secret|Credential)\w*)\b'),
    # Field assignment from helper: this.cognitoToken = SomeHelper.SomeToken
    re.compile(r'(\w+(?:Token|Key|Secret|Credential)\w*)\s*[{;]?\s*(?:get|set)'),
]

# Patterns for finding env var names in credential setup code
ENV_VAR_PATTERN = re.compile(r'["\'](\w+(?:CLIENT_ID|CLIENT_SECRET|TOKEN|API_KEY|CREDENTIAL)\w*)["\']')

# Pattern for OAuth scope URLs
SCOPE_PATTERN = re.compile(r'["\']([a-z0-9._-]+/[a-z0-9._-]+(?:_scope)?)["\']', re.IGNORECASE)

# Pattern for finding token usage in test files
TOKEN_USAGE_PATTERNS = [
    # this.cognitoToken = CognitoTokenHelper.CognitoToken
    re.compile(r'(\w+(?:Token|Key)\w*)\s*=\s*\w+(?:Helper|Provider)\.\w+'),
    # CognitoTokenHelper.CognitoToken (direct reference)
    re.compile(r'(?:\w+(?:Helper|Provider))\.(\w*(?:Token|Key)\w*)'),
    # Bearer token usage
    re.compile(r'(?:cognitoToken|token|authToken|bearerToken)\s*(?:=|,|\))'),
]

# URL patterns for endpoint extraction
URL_PATTERN = re.compile(r'["\'](?:/rest/)?(?:merchants/\w+/)?(\w+)(?:/|["\'])')

# Trait/group pattern
TRAIT_PATTERN = re.compile(r'\[Trait\s*\(\s*"Grouping"\s*,\s*"(\w+)"\s*\)\]')


def find_cs_files(repo_root, skip_dirs=('bin', 'obj', 'node_modules', '.git', 'packages')):
    """Find all .cs files in repo."""
    files = []
    for root, dirs, filenames in os.walk(repo_root):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for f in filenames:
            if f.endswith('.cs'):
                files.append(os.path.join(root, f))
    return files


def find_token_declarations(cs_files, repo_root):
    """Find all token/credential declarations."""
    tokens = {}

    for filepath in cs_files:
        try:
            content = open(filepath, 'r', encoding='utf-8-sig').read()
        except (IOError, UnicodeDecodeError):
            continue

        rel_path = os.path.relpath(filepath, repo_root)

        # Find static token properties
        for match in re.finditer(r'public\s+static\s+\w+\??\s+(\w*(?:Token|Key)\w*)\s*\{', content):
            name = match.group(1)
            if name not in tokens:
                line_num = content[:match.start()].count('\n') + 1
                tokens[name] = {
                    'name': name,
                    'source': f"{rel_path}:{line_num}",
                    'env_vars': [],
                    'scope': None,
                    'used_in': [],
                    'endpoint_families': set(),
                    'test_groups': set()
                }

    return tokens


def find_env_vars_for_token(cs_files, repo_root, token_name):
    """Find env var names associated with a token."""
    env_vars = []

    for filepath in cs_files:
        try:
            content = open(filepath, 'r', encoding='utf-8-sig').read()
        except (IOError, UnicodeDecodeError):
            continue

        # Look for env var references near the token name
        if token_name.lower() not in content.lower():
            continue

        for match in ENV_VAR_PATTERN.finditer(content):
            env_var = match.group(1)
            if env_var not in env_vars:
                env_vars.append(env_var)

    return env_vars


def find_scope_for_token(cs_files, repo_root, token_name):
    """Find OAuth scope associated with a token."""
    for filepath in cs_files:
        try:
            content = open(filepath, 'r', encoding='utf-8-sig').read()
        except (IOError, UnicodeDecodeError):
            continue

        if token_name.lower() not in content.lower():
            continue

        # Look for scope URLs near the token name
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if token_name.lower() in line.lower():
                # Search nearby lines for scope
                context = '\n'.join(lines[max(0, i-10):i+10])
                scope_match = SCOPE_PATTERN.search(context)
                if scope_match:
                    return scope_match.group(1)

    return None


def find_token_usage(cs_files, repo_root, token_name):
    """Find where a token is used in test files."""
    usages = []

    for filepath in cs_files:
        try:
            content = open(filepath, 'r', encoding='utf-8-sig').read()
        except (IOError, UnicodeDecodeError):
            continue

        rel_path = os.path.relpath(filepath, repo_root)
        lines = content.split('\n')

        # Find direct references to the token
        for i, line in enumerate(lines):
            if token_name in line and not line.strip().startswith('//'):
                usages.append({
                    'file': rel_path,
                    'line': i + 1,
                    'context': line.strip()[:120]
                })

        # Find the test groups (Traits) for this file
        groups = set()
        for match in TRAIT_PATTERN.finditer(content):
            groups.add(match.group(1))

        # Find URL patterns in files that use this token
        endpoints = set()
        if token_name in content:
            for match in URL_PATTERN.finditer(content):
                endpoint = match.group(1).lower()
                if endpoint not in ('merchantid', 'rest', 'merchants', 'string', 'http', 'https'):
                    endpoints.add(endpoint)

    return usages


def map_token_to_endpoints(cs_files, repo_root, token_name):
    """Map a token to the endpoint families and test groups where it's used."""
    endpoint_families = set()
    test_groups = set()

    for filepath in cs_files:
        try:
            content = open(filepath, 'r', encoding='utf-8-sig').read()
        except (IOError, UnicodeDecodeError):
            continue

        if token_name not in content:
            continue

        # Extract test groups
        for match in TRAIT_PATTERN.finditer(content):
            test_groups.add(match.group(1))

        # Extract URL-based endpoint families from constructor base() calls
        for match in re.finditer(r'base\s*\(\s*\w+\s*,\s*"([^"]+)"', content):
            url = match.group(1)
            # Extract resource name from URL path
            parts = [p for p in url.split('/') if p and p not in ('rest', 'merchants', 'merchantId')]
            if parts:
                endpoint_families.add(parts[0])

    return endpoint_families, test_groups


def analyze(repo_root):
    """Main analysis: find all tokens and map their usage."""
    cs_files = find_cs_files(repo_root)
    tokens = find_token_declarations(cs_files, repo_root)

    # For each token, find its env vars, scope, and usage
    for name, token_info in tokens.items():
        # Find associated env vars (look in the token helper's source file)
        source_file = token_info['source'].split(':')[0]
        source_dir = os.path.dirname(os.path.join(repo_root, source_file))
        helper_files = [f for f in cs_files if os.path.dirname(f) == source_dir or
                        os.path.basename(f).replace('.cs', '') in source_file]
        token_info['env_vars'] = find_env_vars_for_token(cs_files, repo_root, name)
        token_info['scope'] = find_scope_for_token(cs_files, repo_root, name)

        # Find usage in test files
        token_info['used_in'] = find_token_usage(
            [f for f in cs_files if 'Tests' in os.path.basename(f) or 'Test' in os.path.basename(f)],
            repo_root, name
        )

        # Map to endpoints and groups
        endpoints, groups = map_token_to_endpoints(cs_files, repo_root, name)
        token_info['endpoint_families'] = sorted(endpoints)
        token_info['test_groups'] = sorted(groups)

    # Convert sets to sorted lists for JSON serialization
    result = {
        'tokens': sorted(tokens.values(), key=lambda t: t['name']),
        'summary': {
            'tokens_found': len(tokens),
            'files_scanned': len(cs_files),
        }
    }

    return result


def format_human(result):
    """Format as human-readable text."""
    lines = []
    lines.append(f"Found {result['summary']['tokens_found']} token types across {result['summary']['files_scanned']} files\n")

    for t in result['tokens']:
        lines.append(f"  {t['name']}")
        lines.append(f"    Source: {t['source']}")
        if t['env_vars']:
            lines.append(f"    Env vars: {', '.join(t['env_vars'][:6])}")
        if t['scope']:
            lines.append(f"    Scope: {t['scope']}")
        if t['endpoint_families']:
            lines.append(f"    Endpoints: {', '.join(t['endpoint_families'])}")
        if t['test_groups']:
            lines.append(f"    Test groups: {', '.join(t['test_groups'])}")
        lines.append(f"    Used in {len(t['used_in'])} test files")
        lines.append('')

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Map token/credential usage to endpoints')
    parser.add_argument('repo_root', help='Path to repository root')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    args = parser.parse_args()

    result = analyze(os.path.abspath(args.repo_root))

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(format_human(result))


if __name__ == '__main__':
    main()
