#!/bin/bash
# UtilityBelt shortcut — single entry point for all pipeline tools.
# Usage: bash ~/.claude/hooks/ub.sh <tool> [args...]
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$DIR/hooks/py.sh" "$DIR/tools/utility-belt.py" "$@"
