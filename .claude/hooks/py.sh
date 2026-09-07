#!/bin/bash
# Python resolver for hooks. Single point of change if Python moves.
# Hook runner uses /usr/bin/bash with minimal env — HOME and PATH may be incomplete.
: "${HOME:=/c/Users/${USERNAME:-${USER}}}"

# Try known Windows install paths first — these work even when PATH is stripped.
for p in /c/Python*/python.exe \
         "$HOME"/AppData/Local/Programs/Python/*/python.exe \
         "$HOME"/AppData/Local/Microsoft/WindowsApps/python3.exe; do
    if [ -x "$p" ]; then
        exec "$p" "$@"
    fi
done
# Fall back to PATH-based lookup (works on Linux/macOS and full-env Windows).
for cmd in python3 python python3.exe python.exe; do
    if command -v "$cmd" &>/dev/null; then
        exec "$cmd" "$@"
    fi
done
echo "py.sh: python not found" >&2
exit 1
