#!/usr/bin/env python3
"""
find-helper-duplication.py — Detect local methods in test/consumer classes that
duplicate functionality available in shared helper classes.

Flags cases where private/protected methods bypass shared infrastructure,
potentially missing cross-cutting concerns (logging, error handling).

Usage:
    python find-helper-duplication.py <repo_root> [--helpers <glob>] [--consumers <glob>] [--threshold <0-100>] [--json]

Args:
    repo_root       Path to the repository root
    --helpers       Glob pattern for shared helper files (default: auto-detect)
    --consumers     Glob pattern for consumer/test files (default: auto-detect)
    --threshold     Name similarity threshold 0-100 (default: 70)
    --json          Output as JSON (default: human-readable)

Auto-detection strategy:
    Helpers:  **/Helpers/**/*.cs, **/Shared/**/*.cs, **/Common/**/*.cs,
              **/Utilities/**/*.cs, **/Infrastructure/**/*.cs
    Consumers: **/*Tests.cs, **/*Test.cs, **/*Spec.cs

Output (JSON):
    {
        "helpers": [{"file", "class", "methods": [{"name", "access", "return_type", "params", "line"}]}],
        "duplicates": [{
            "consumer_file", "consumer_class", "consumer_method", "consumer_line",
            "consumer_access", "helper_file", "helper_class", "helper_method",
            "match_type", "similarity", "cross_cutting_risk"
        }],
        "summary": {"helpers_scanned", "consumers_scanned", "duplicates_found", "high_risk"}
    }
"""

import argparse
import glob
import json
import os
import re
import sys
from difflib import SequenceMatcher


# --- Method extraction (C#) ---

# C# access/modifier keywords
CS_MODIFIERS = {'public', 'private', 'protected', 'internal', 'static', 'async',
                'virtual', 'override', 'sealed', 'abstract', 'new'}

# Skip these — control flow, not methods
SKIP_NAMES = {'get', 'set', 'if', 'for', 'foreach', 'while', 'switch', 'catch',
              'using', 'return', 'throw', 'lock', 'else', 'var'}

# Two-pass method extraction to handle tuple return types like Task<(Foo, Bar)>
# Pass 1: find MethodName( pattern, then walk backwards for modifiers and return type
METHOD_NAME_RE = re.compile(r'\b(\w+)\s*\(')


def extract_methods(filepath):
    """Extract method signatures from a C# file."""
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            content = f.read()
    except (IOError, UnicodeDecodeError):
        return None, []

    # Extract class name
    class_match = re.search(r'class\s+(\w+)', content)
    class_name = class_match.group(1) if class_match else os.path.basename(filepath).replace('.cs', '')

    lines = content.split('\n')
    methods = []

    for line_idx, line in enumerate(lines):
        stripped = line.strip()
        # Quick filters — skip comments, attributes, control flow
        if (not stripped or stripped.startswith('//') or stripped.startswith('/*')
            or stripped.startswith('*') or stripped.startswith('[')
            or stripped.startswith('{') or stripped.startswith('}')):
            continue

        # Find potential method declarations: word followed by (
        for match in METHOD_NAME_RE.finditer(stripped):
            name = match.group(1)
            if name in SKIP_NAMES or name == class_name:
                continue

            # Check what comes before the method name
            prefix = stripped[:match.start()].strip()
            if not prefix:
                continue

            # Split prefix into tokens
            tokens = prefix.split()
            if not tokens:
                continue

            # Extract modifiers and return type
            modifiers = []
            visibility = 'private'  # C# default
            return_type_tokens = []

            for token in tokens:
                clean = token.strip()
                if clean in CS_MODIFIERS:
                    if clean in ('public', 'private', 'protected', 'internal'):
                        visibility = clean
                    else:
                        modifiers.append(clean)
                else:
                    return_type_tokens.append(clean)

            # Must have at least one modifier to be a method declaration
            if visibility == 'private' and not modifiers and not any(t in CS_MODIFIERS for t in tokens):
                # No modifiers at all — probably not a method declaration
                # Unless explicitly 'private'
                if 'private' not in tokens:
                    continue

            return_type = ' '.join(return_type_tokens)
            if not return_type or return_type in SKIP_NAMES:
                continue

            # Extract params — find the matching closing paren (handling nested parens for tuples)
            param_start = stripped.index('(', match.start())
            depth = 0
            param_end = -1
            for i in range(param_start, len(stripped)):
                if stripped[i] == '(':
                    depth += 1
                elif stripped[i] == ')':
                    depth -= 1
                    if depth == 0:
                        param_end = i
                        break

            params = stripped[param_start + 1:param_end].strip() if param_end > param_start else ''

            methods.append({
                'name': name,
                'access': visibility,
                'modifiers': modifiers,
                'return_type': return_type,
                'params': params,
                'line': line_idx + 1
            })
            break  # One method per line

    return class_name, methods


def normalize_name(name):
    """Normalize method name for comparison — strip common prefixes/suffixes, lowercase."""
    # Remove common test helper prefixes
    for prefix in ('Get', 'Create', 'Build', 'Make', 'Generate', 'Setup', 'Init', 'Verify', 'Assert', 'Validate', 'Check'):
        if name.startswith(prefix) and len(name) > len(prefix):
            name = name[len(prefix):]
            break
    # Remove Async suffix
    if name.endswith('Async'):
        name = name[:-5]
    return name.lower()


def param_similarity(params_a, params_b):
    """Compare parameter lists by type names (ignoring param names)."""
    def extract_types(params_str):
        if not params_str.strip():
            return []
        types = []
        for p in params_str.split(','):
            p = p.strip()
            parts = p.split()
            if len(parts) >= 2:
                # Last part is param name, rest is type
                types.append(' '.join(parts[:-1]).lower())
            elif len(parts) == 1:
                types.append(parts[0].lower())
        return types

    types_a = extract_types(params_a)
    types_b = extract_types(params_b)

    if not types_a and not types_b:
        return 1.0
    if not types_a or not types_b:
        return 0.0

    return SequenceMatcher(None, types_a, types_b).ratio()


def name_similarity(name_a, name_b):
    """Compare method names with normalization."""
    norm_a = normalize_name(name_a)
    norm_b = normalize_name(name_b)

    # Exact normalized match
    if norm_a == norm_b:
        return 1.0

    # One contains the other
    if norm_a in norm_b or norm_b in norm_a:
        return 0.85

    # Sequence similarity
    return SequenceMatcher(None, norm_a, norm_b).ratio()


# --- Cross-cutting concern detection ---

CROSS_CUTTING_KEYWORDS = {
    'logging': ['log', 'logger', 'testoutputhelper', 'writeline', 'requestlogger', 'ilogger'],
    'error_handling': ['try', 'catch', 'exception', 'throw', 'error'],
    'auth': ['token', 'bearer', 'auth', 'credential', 'cognito'],
    'throttling': ['throttl', 'retry', 'delay', 'backoff', 'sendthrottled'],
}


def check_cross_cutting_risk(helper_methods, helper_file):
    """Check if the helper file contains cross-cutting concerns that local duplicates would miss."""
    try:
        with open(helper_file, 'r', encoding='utf-8-sig') as f:
            content = f.read().lower()
    except (IOError, UnicodeDecodeError):
        return []

    risks = []
    for concern, keywords in CROSS_CUTTING_KEYWORDS.items():
        if any(kw in content for kw in keywords):
            risks.append(concern)
    return risks


# --- Auto-detection ---

def find_files(repo_root, patterns):
    """Find files matching glob patterns relative to repo root."""
    files = set()
    for pattern in patterns:
        full_pattern = os.path.join(repo_root, pattern)
        for f in glob.glob(full_pattern, recursive=True):
            # Skip bin/obj/node_modules
            rel = os.path.relpath(f, repo_root)
            skip_dirs = ('bin', 'obj', 'node_modules', '.git', 'packages')
            if not any(part in rel.split(os.sep) for part in skip_dirs):
                files.add(f)
    return sorted(files)


HELPER_PATTERNS = [
    '**/Helpers/**/*.cs',
    '**/Shared/**/*.cs',
    '**/Common/**/*.cs',
    '**/Utilities/**/*.cs',
    '**/Infrastructure/**/*.cs',
    '**/Extensions/**/*.cs',
]

CONSUMER_PATTERNS = [
    '**/*Tests.cs',
    '**/*Test.cs',
    '**/*Spec.cs',
]


# --- Method body extraction ---

def extract_method_body(filepath, method_line):
    """Extract the body of a method starting at method_line (1-indexed)."""
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
    except (IOError, UnicodeDecodeError):
        return ''

    # Find the opening brace
    brace_depth = 0
    started = False
    body_lines = []

    for i in range(method_line - 1, len(lines)):
        line = lines[i]
        for ch in line:
            if ch == '{':
                brace_depth += 1
                started = True
            elif ch == '}':
                brace_depth -= 1
                if started and brace_depth == 0:
                    return ''.join(body_lines)
        if started and brace_depth > 0:
            body_lines.append(line)

    return ''.join(body_lines)


def find_wrapper_calls(method_body, helper_class_names, helper_method_names):
    """Check if a method body calls helper class methods directly.
    Returns list of (class_or_field, method) tuples found."""
    calls = []
    # Match patterns: ClassName.MethodName( or this.fieldName.MethodName( or fieldName.MethodName(
    call_re = re.compile(r'(?:this\.)?(\w+)\.(\w+)\s*\(')
    for match in call_re.finditer(method_body):
        target = match.group(1)
        method = match.group(2)
        # Check if calling a known helper class or a field that's a helper instance
        target_lower = target.lower()
        if (target in helper_class_names or
            any(hcn.lower() in target_lower for hcn in helper_class_names) or
            method in helper_method_names):
            calls.append((target, method))
    return calls


# --- Main analysis ---

def analyze(repo_root, helper_globs, consumer_globs, threshold):
    """Find duplicate methods between helpers and consumers."""

    helper_files = find_files(repo_root, helper_globs)
    consumer_files = find_files(repo_root, consumer_globs)

    # Don't compare a file against itself — remove overlap
    helper_set = set(helper_files)
    consumer_files = [f for f in consumer_files if f not in helper_set]

    # Extract helper methods
    helpers = []
    all_helper_methods = []
    helper_class_names = set()
    helper_method_names = set()

    for hf in helper_files:
        class_name, methods = extract_methods(hf)
        if methods:
            rel_path = os.path.relpath(hf, repo_root)
            cross_cutting = check_cross_cutting_risk(methods, hf)
            helper_class_names.add(class_name)
            helpers.append({
                'file': rel_path,
                'class': class_name,
                'methods': [{'name': m['name'], 'access': m['access'], 'return_type': m['return_type'],
                             'params': m['params'], 'line': m['line']} for m in methods],
                'cross_cutting': cross_cutting
            })
            for m in methods:
                if m['access'] in ('public', 'protected', 'internal'):
                    helper_method_names.add(m['name'])
                    all_helper_methods.append({
                        'file': rel_path,
                        'class': class_name,
                        'method': m,
                        'cross_cutting': cross_cutting
                    })

    # Build a map of helper class -> cross-cutting concerns
    helper_cc_map = {}
    for h in helpers:
        helper_cc_map[h['class']] = h['cross_cutting']

    # Scan consumer methods
    duplicates = []
    wrappers = []
    consumers_scanned = 0

    for cf in consumer_files:
        class_name, methods = extract_methods(cf)
        if not methods:
            continue
        consumers_scanned += 1
        rel_path = os.path.relpath(cf, repo_root)

        # Only check private/protected methods (local helpers)
        local_methods = [m for m in methods if m['access'] in ('private', 'protected')]

        for lm in local_methods:
            # --- Pass 1: Name similarity ---
            best_match = None
            best_score = 0

            for hm in all_helper_methods:
                n_sim = name_similarity(lm['name'], hm['method']['name'])
                if n_sim < threshold / 100.0:
                    continue

                p_sim = param_similarity(lm['params'], hm['method']['params'])
                combined = (n_sim * 0.7) + (p_sim * 0.3)

                if combined > best_score:
                    best_score = combined
                    match_type = 'exact_name' if n_sim == 1.0 else 'similar_name'
                    if p_sim > 0.7:
                        match_type += '+similar_params'

                    best_match = {
                        'consumer_file': rel_path,
                        'consumer_class': class_name,
                        'consumer_method': lm['name'],
                        'consumer_line': lm['line'],
                        'consumer_access': lm['access'],
                        'helper_file': hm['file'],
                        'helper_class': hm['class'],
                        'helper_method': hm['method']['name'],
                        'helper_line': hm['method']['line'],
                        'match_type': match_type,
                        'similarity': round(combined * 100),
                        'cross_cutting_risk': hm['cross_cutting']
                    }

            if best_match and best_score >= threshold / 100.0:
                duplicates.append(best_match)
                continue  # Already flagged — skip wrapper check

            # --- Pass 2: Wrapper detection ---
            # Read the method body and check if it calls helper methods directly
            body = extract_method_body(cf, lm['line'])
            if not body:
                continue

            calls = find_wrapper_calls(body, helper_class_names, helper_method_names)
            if not calls:
                continue

            # This local method wraps shared helper calls — flag it
            called_helpers = []
            combined_cc = set()
            for target, method in calls:
                called_helpers.append(f"{target}.{method}")
                # Gather cross-cutting risks from called helper classes
                for hcn, cc in helper_cc_map.items():
                    if hcn.lower() in target.lower() or hcn == target:
                        combined_cc.update(cc)

            # Only flag if there are cross-cutting concerns being bypassed
            # (a wrapper around helpers isn't a problem if no concerns are missed)
            if combined_cc:
                wrappers.append({
                    'consumer_file': rel_path,
                    'consumer_class': class_name,
                    'consumer_method': lm['name'],
                    'consumer_line': lm['line'],
                    'consumer_access': lm['access'],
                    'helper_file': '(multiple)',
                    'helper_class': '(multiple)',
                    'helper_method': ', '.join(called_helpers[:5]),
                    'helper_line': 0,
                    'match_type': 'wrapper',
                    'similarity': 0,
                    'cross_cutting_risk': sorted(combined_cc),
                    'calls_into_helpers': called_helpers
                })

    # Combine and sort by risk then similarity
    all_findings = duplicates + wrappers
    all_findings.sort(key=lambda d: (-len(d['cross_cutting_risk']), -d['similarity']))

    high_risk = sum(1 for d in all_findings if d['cross_cutting_risk'])

    return {
        'helpers': helpers,
        'duplicates': all_findings,
        'summary': {
            'helpers_scanned': len(helpers),
            'consumers_scanned': consumers_scanned,
            'duplicates_found': len(all_findings),
            'name_matches': len(duplicates),
            'wrappers': len(wrappers),
            'high_risk': high_risk
        }
    }


def format_human(result):
    """Format results as human-readable text."""
    lines = []
    s = result['summary']
    lines.append(f"Scanned {s['helpers_scanned']} helper files, {s['consumers_scanned']} consumer files")
    lines.append(f"Found {s['duplicates_found']} findings ({s.get('name_matches', 0)} name matches, {s.get('wrappers', 0)} wrappers, {s['high_risk']} high-risk)\n")

    if not result['duplicates']:
        lines.append("No findings.")
        return '\n'.join(lines)

    for d in result['duplicates']:
        risk = ' [RISK: ' + ', '.join(d['cross_cutting_risk']) + ']' if d['cross_cutting_risk'] else ''

        if d['match_type'] == 'wrapper':
            lines.append(f"  {d['consumer_class']}.{d['consumer_method']} ({d['consumer_file']}:{d['consumer_line']})")
            lines.append(f"    WRAPPER — calls: {d['helper_method']}")
            lines.append(f"    Bypasses shared infrastructure{risk}")
        else:
            lines.append(f"  {d['consumer_class']}.{d['consumer_method']} ({d['consumer_file']}:{d['consumer_line']})")
            lines.append(f"    ~ {d['helper_class']}.{d['helper_method']} ({d['helper_file']}:{d['helper_line']})")
            lines.append(f"    Match: {d['match_type']} ({d['similarity']}%){risk}")
        lines.append('')

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Find local methods that duplicate shared helpers')
    parser.add_argument('repo_root', help='Path to repository root')
    parser.add_argument('--helpers', nargs='*', help='Glob patterns for helper files')
    parser.add_argument('--consumers', nargs='*', help='Glob patterns for consumer/test files')
    parser.add_argument('--threshold', type=int, default=70, help='Name similarity threshold 0-100 (default: 70)')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    args = parser.parse_args()

    repo_root = os.path.abspath(args.repo_root)
    if not os.path.isdir(repo_root):
        print(f"Error: {repo_root} is not a directory", file=sys.stderr)
        sys.exit(1)

    helper_globs = args.helpers or HELPER_PATTERNS
    consumer_globs = args.consumers or CONSUMER_PATTERNS

    result = analyze(repo_root, helper_globs, consumer_globs, args.threshold)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(format_human(result))


if __name__ == '__main__':
    main()
