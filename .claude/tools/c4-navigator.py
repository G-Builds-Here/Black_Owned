#!/usr/bin/env python3
"""Generate index.md navigation hub in planning/{slug}/ directory.

Scans the directory for generated artifacts and creates a structured
index.md with links to all documents, organized by C4 level.
"""
import argparse
import os
from pathlib import Path


def find_artifacts(directory: Path) -> dict:
    """Find all artifacts in the planning/reverse-engineering directory."""
    artifacts = {
        'c4_html': False,
        'c4_json': False,
        'decisions': [],
        'adrs': [],
        'risks': False,
        'nfr': False,
        'other': []
    }

    for item in directory.iterdir():
        if item.name == 'index.md':
            continue

        if item.name == 'c4.html' and item.is_file():
            artifacts['c4_html'] = True
        elif item.name == 'c4-skeleton.json' and item.is_file():
            artifacts['c4_json'] = True
        elif item.name == 'Design-Decisions.md':
            artifacts['decisions'].append(item.name)
        elif item.name.startswith('ADR-'):
            artifacts['adrs'].append(item.name)
        elif item.name == 'Risk-Register.md':
            artifacts['risks'] = True
        elif item.name == 'NFR-Analysis.md':
            artifacts['nfr'] = True
        elif item.name.endswith('.md'):
            artifacts['other'].append(item.name)

    return artifacts


def generate_index_content(slug: str, artifacts: dict) -> str:
    """Generate the index.md content."""
    lines = [
        f"# Architecture Documentation: {slug}",
        "",
        "Navigation hub for all design artifacts.",
        "",
    ]

    # C4 diagrams
    if artifacts['c4_html'] or artifacts['c4_json']:
        lines.append("## C4 Diagrams")
        lines.append("")
        if artifacts['c4_html']:
            lines.append("- [Interactive C4 Diagram (C1/C2/C3)](c4.html)")
        if artifacts['c4_json']:
            lines.append("- [C4 Model Data (JSON)](c4-skeleton.json)")
        lines.append("")
    
    # Design decisions
    if artifacts['decisions']:
        lines.append("## Design Decisions")
        lines.append("")
        for name in artifacts['decisions']:
            lines.append(f"- [{name}]({name})")
        lines.append("")
    
    # ADRs
    if artifacts['adrs']:
        lines.append("## Architecture Decision Records")
        lines.append("")
        for name in artifacts['adrs']:
            lines.append(f"- [{name}]({name})")
        lines.append("")
    
    # Risk and NFR
    if artifacts['risks'] or artifacts['nfr']:
        lines.append("## Analysis")
        lines.append("")
        if artifacts['risks']:
            lines.append("- [Risk Register](Risk-Register.md)")
        if artifacts['nfr']:
            lines.append("- [NFR Analysis](NFR-Analysis.md)")
        lines.append("")
    
    # Other
    if artifacts['other']:
        lines.append("## Other")
        lines.append("")
        for name in artifacts['other']:
            lines.append(f"- [{name}]({name})")
        lines.append("")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Generate index.md navigation hub in planning/{slug}/'
    )
    parser.add_argument(
        'directory',
        help='Path to planning/{slug}/ directory'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Overwrite existing index.md'
    )
    
    args = parser.parse_args()
    
    dir_path = Path(args.directory)
    if not dir_path.is_dir():
        print(f"Error: {dir_path} is not a directory")
        return 1
    
    index_path = dir_path / 'index.md'
    if index_path.exists() and not args.force:
        print(f"index.md already exists. Use --force to overwrite.")
        return 1
    
    artifacts = find_artifacts(dir_path)
    slug = dir_path.name
    content = generate_index_content(slug, artifacts)
    
    index_path.write_text(content, encoding='utf-8')
    print(f"Generated {index_path}")
    return 0


if __name__ == '__main__':
    exit(main())
