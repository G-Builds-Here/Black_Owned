#!/usr/bin/env python3
"""Check for unused dependencies in npm (package.json) and NuGet (.csproj) projects.

Scans dependency declarations and searches for actual imports/usages in source
files. Reports dependencies with zero import hits as potentially unused.

Usage:
    python check-unused-deps.py [project_root]
    python check-unused-deps.py [project_root] --type npm
    python check-unused-deps.py [project_root] --type nuget

    project_root: path to scan (defaults to current directory)
    --type:       npm | nuget | all (default: all)

Output: JSON to stdout
    {
        "npm": [
            {"project": "path/to/package.json", "unused": [
                {"name": "mssql", "section": "dependencies", "reason": "no imports found"}
            ], "skipped": [
                {"name": "@types/mssql", "reason": "type-only package"}
            ], "total": 6, "unused_count": 1}
        ],
        "nuget": [...],
        "summary": {"total": 20, "unused": 3, "skipped": 5}
    }
"""

import json
import re
import sys
from pathlib import Path

# npm packages that are build tools / runtimes — never imported in source
NPM_TOOL_PACKAGES = {
    "typescript", "ts-node", "tsx", "webpack", "vite", "esbuild",
    "rollup", "parcel", "babel-cli", "@babel/cli", "eslint",
    "prettier", "stylelint", "husky", "lint-staged", "nodemon",
    "concurrently", "npm-run-all", "cross-env", "rimraf", "copyfiles",
    "playwright",  # browser engine — @playwright/test is the import
}

# NuGet packages that are build/test infrastructure — never appear in using statements
NUGET_TOOL_PACKAGES = {
    "coverlet.collector", "coverlet.msbuild",
    "Microsoft.NET.Test.Sdk",
    "xunit.runner.visualstudio", "xunit.v3", "xunit.v3.assert", "xunit.v3.core",
    "xunit.v3.runner.utility", "xunit.v3.runner.console", "xunit.v3.runner.msbuild",
    "xunit", "xunit.core", "xunit.assert",
    "NUnit3TestAdapter", "MSTest.TestAdapter",
    "Microsoft.CodeAnalysis.NetAnalyzers", "Microsoft.CodeAnalysis.Analyzers",
    "StyleCop.Analyzers", "StyleCop.Analyzers.Unstable",
    "Microsoft.SourceLink.GitHub",
}

# NuGet packages that are runtime/transitive dependencies — loaded by other packages,
# not directly referenced via using statements
NUGET_RUNTIME_PACKAGES = {
    "AWSSDK.Core",         # base types used by all AWSSDK.* packages
    "AWSSDK.SSO",          # loaded by AWSSDK credential providers at runtime
    "AWSSDK.SSOOIDC",      # loaded by AWSSDK credential providers at runtime
    "System.IdentityModel.Tokens.Jwt",  # used transitively by JwtBearer auth
}

# NuGet packages that provide extension methods — no using statement needed,
# called as .MethodName() on framework interfaces (e.g. IConfigurationBuilder)
NUGET_EXTENSION_METHOD_PACKAGES = {
    "Microsoft.Extensions.Configuration.EnvironmentVariables": [
        r"\.AddEnvironmentVariables\(",
    ],
    "Microsoft.Extensions.Configuration.Json": [
        r"\.AddJsonFile\(",
    ],
    "Microsoft.Extensions.Configuration.UserSecrets": [
        r"\.AddUserSecrets[<(]",
    ],
    "Microsoft.Extensions.Configuration.CommandLine": [
        r"\.AddCommandLine\(",
    ],
    "Microsoft.Extensions.DependencyInjection": [
        r"\.AddSingleton[<(]", r"\.AddScoped[<(]", r"\.AddTransient[<(]",
    ],
    "Microsoft.Extensions.Logging.Console": [
        r"\.AddConsole\(",
    ],
    "Microsoft.Extensions.Http": [
        r"\.AddHttpClient[<(]",
    ],
}

# Known NuGet package → namespace mappings where they differ
NUGET_NAMESPACE_MAP = {
    "AWSSDK.KeyManagementService": ["Amazon.KeyManagementService"],
    "AWSSDK.SecretsManager": ["Amazon.SecretsManager"],
    "AWSSDK.SimpleSystemsManagement": ["Amazon.SimpleSystemsManagement"],
    "AWSSDK.SSO": ["Amazon.SSO"],
    "AWSSDK.SSOOIDC": ["Amazon.SSOOIDC"],
    "AWSSDK.S3": ["Amazon.S3"],
    "AWSSDK.SQS": ["Amazon.SQS"],
    "AWSSDK.SNS": ["Amazon.SimpleNotificationService"],
    "AWSSDK.DynamoDBv2": ["Amazon.DynamoDBv2"],
    "AWSSDK.Lambda": ["Amazon.Lambda"],
    "AWSSDK.SecurityToken": ["Amazon.SecurityToken"],
    "AWSSDK.CloudWatch": ["Amazon.CloudWatch"],
    "AWSSDK.Extensions.NETCore.Setup": ["Amazon.Extensions.NETCore.Setup"],
    "Duende.IdentityModel": ["Duende.IdentityModel"],
    "Microsoft.AspNetCore.Authentication.JwtBearer": ["Microsoft.AspNetCore.Authentication.JwtBearer"],
    "Microsoft.Data.SqlClient": ["Microsoft.Data.SqlClient"],
    "Microsoft.IdentityModel.Tokens": ["Microsoft.IdentityModel.Tokens"],
    "Microsoft.IO.RecyclableMemoryStream": ["Microsoft.IO"],
    "System.IdentityModel.Tokens.Jwt": ["System.IdentityModel.Tokens.Jwt"],
    "Newtonsoft.Json": ["Newtonsoft.Json"],
    "Serilog": ["Serilog"],
    "Serilog.AspNetCore": ["Serilog"],
    "Serilog.Sinks.File": ["Serilog"],
    "Serilog.Sinks.Console": ["Serilog"],
    "Serilog.Sinks.NewRelic.Logs": ["Serilog"],
    "Serilog.Sinks.PeriodicBatching": ["Serilog"],
    "Serilog.Sinks.TestCorrelator": ["Serilog.Sinks.TestCorrelator"],
    "NSubstitute": ["NSubstitute"],
    "UAParser": ["UAParser"],
    "Moq": ["Moq"],
    "AutoMapper": ["AutoMapper"],
    "FluentAssertions": ["FluentAssertions"],
    "MediatR": ["MediatR"],
    "Polly": ["Polly"],
    "Dapper": ["Dapper"],
}


def file_search(pattern, search_path, extensions=None):
    """Search files for regex pattern using pure Python. Returns match count."""
    search_path = Path(search_path)
    compiled = re.compile(pattern)
    count = 0

    if extensions is None:
        extensions = set()
    elif isinstance(extensions, str):
        # Parse glob like "*.{ts,tsx,js}" into a set of extensions
        match = re.match(r"\*\.\{(.+)\}", extensions)
        if match:
            extensions = {"." + ext for ext in match.group(1).split(",")}
        else:
            ext_match = re.match(r"\*\.(\w+)", extensions)
            extensions = {"." + ext_match.group(1)} if ext_match else set()

    for fpath in search_path.rglob("*"):
        if not fpath.is_file():
            continue
        if "node_modules" in fpath.parts or "bin" in fpath.parts or "obj" in fpath.parts:
            continue
        if extensions and fpath.suffix not in extensions:
            continue
        try:
            text = fpath.read_text(encoding="utf-8", errors="ignore")
            count += len(compiled.findall(text))
        except OSError:
            continue

    return count


def check_npm(project_root):
    """Find package.json files and check for unused dependencies."""
    results = []
    for pkg_json in project_root.rglob("package.json"):
        # Skip node_modules
        if "node_modules" in pkg_json.parts:
            continue

        try:
            data = json.loads(pkg_json.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        pkg_dir = pkg_json.parent
        unused = []
        skipped = []
        total = 0

        for section in ["dependencies", "devDependencies"]:
            deps = data.get(section, {})
            for name in deps:
                total += 1

                # Skip @types/* — they're type declarations, never imported
                if name.startswith("@types/"):
                    skipped.append({"name": name, "reason": "type-only package"})
                    continue

                # Skip known build tools
                if name in NPM_TOOL_PACKAGES:
                    skipped.append({"name": name, "reason": "build tool"})
                    continue

                # Search for import/require of this package
                # Handles: import ... from 'pkg', require('pkg'), import 'pkg'
                escaped = re.escape(name)
                q = """['"]"""
                pattern = f"(from\\s+{q}{escaped}|require\\(\\s*{q}{escaped}|import\\s+{q}{escaped})"
                hits = file_search(pattern, pkg_dir, "*.{ts,tsx,js,jsx,mjs,cjs}")

                if hits == 0:
                    unused.append({
                        "name": name,
                        "section": section,
                        "reason": "no imports found"
                    })

        results.append({
            "project": str(pkg_json.relative_to(project_root)),
            "unused": unused,
            "skipped": skipped,
            "total": total,
            "unused_count": len(unused),
        })

    return results


def _is_private_assets_all(csproj_content, pkg_name):
    """Check if a PackageReference has PrivateAssets=all (build-time only)."""
    # Match both attribute style and child element style
    escaped = re.escape(pkg_name)
    # Attribute: <PackageReference Include="X" PrivateAssets="all" />
    if re.search(rf'<PackageReference\s+Include="{escaped}"[^>]*PrivateAssets="all"', csproj_content):
        return True
    # Child element: <PrivateAssets>all</PrivateAssets> inside the PackageReference block
    match = re.search(rf'<PackageReference\s+Include="{escaped}".*?</PackageReference>', csproj_content, re.DOTALL)
    if match and "<PrivateAssets>all</PrivateAssets>" in match.group(0):
        return True
    return False


def check_nuget(project_root):
    """Find .csproj files and check for unused PackageReference dependencies."""
    results = []
    for csproj in project_root.rglob("*.csproj"):
        content = csproj.read_text(encoding="utf-8")
        pkg_refs = re.findall(r'<PackageReference\s+Include="([^"]+)"', content)

        if not pkg_refs:
            continue

        proj_dir = csproj.parent
        unused = []
        skipped = []
        total = len(pkg_refs)

        for pkg_name in pkg_refs:
            # Skip known tool packages
            if pkg_name in NUGET_TOOL_PACKAGES:
                skipped.append({"name": pkg_name, "reason": "build/test tool"})
                continue

            # Skip known runtime/transitive packages
            if pkg_name in NUGET_RUNTIME_PACKAGES:
                skipped.append({"name": pkg_name, "reason": "runtime/transitive dependency"})
                continue

            # Note: PrivateAssets=all is a packaging directive (prevents transitive propagation),
            # NOT a usage signal. Packages can have it set and still be unused.
            # Only use it as a skip signal for known tool categories (analyzers, runners)
            # which are already covered by NUGET_TOOL_PACKAGES above.

            # Check extension method packages — search for method call patterns
            if pkg_name in NUGET_EXTENSION_METHOD_PACKAGES:
                ext_found = False
                for pattern in NUGET_EXTENSION_METHOD_PACKAGES[pkg_name]:
                    hits = file_search(pattern, proj_dir, "*.cs")
                    if hits > 0:
                        ext_found = True
                        break
                if ext_found:
                    continue
                # If extension methods not found, fall through to unused

            # Determine search namespaces
            if pkg_name in NUGET_NAMESPACE_MAP:
                namespaces = NUGET_NAMESPACE_MAP[pkg_name]
            else:
                # Default: search for the package name as a namespace
                namespaces = [pkg_name]

            found = False
            for ns in namespaces:
                escaped = re.escape(ns)
                # Search for: using Namespace, Namespace.Something in code
                hits = file_search(f"using\\s+{escaped}", proj_dir, "*.cs")
                if hits > 0:
                    found = True
                    break

                # Also check for direct type usage (e.g., Serilog.Log.Information)
                hits = file_search(f"{escaped}\\.", proj_dir, "*.cs")
                if hits > 0:
                    found = True
                    break

            # Also check DI registration (AddSingleton, AddScoped, etc.) which may
            # reference the package without a using statement (via full qualification)
            if not found:
                escaped = re.escape(pkg_name)
                hits = file_search(escaped, proj_dir, "*.cs")
                if hits > 0:
                    found = True

            if not found:
                unused.append({
                    "name": pkg_name,
                    "reason": "no using statements or references found"
                })

        results.append({
            "project": str(csproj.relative_to(project_root)),
            "unused": unused,
            "skipped": skipped,
            "total": total,
            "unused_count": len(unused),
        })

    return results


def main():
    project_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    check_type = "all"

    for i, arg in enumerate(sys.argv):
        if arg == "--type" and i + 1 < len(sys.argv):
            check_type = sys.argv[i + 1]

    npm_results = []
    nuget_results = []

    if check_type in ("all", "npm"):
        npm_results = check_npm(project_root)
    if check_type in ("all", "nuget"):
        nuget_results = check_nuget(project_root)

    total_deps = sum(r["total"] for r in npm_results + nuget_results)
    total_unused = sum(r["unused_count"] for r in npm_results + nuget_results)
    total_skipped = sum(len(r["skipped"]) for r in npm_results + nuget_results)

    output = {
        "npm": npm_results,
        "nuget": nuget_results,
        "summary": {
            "total": total_deps,
            "unused": total_unused,
            "skipped": total_skipped,
        }
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
