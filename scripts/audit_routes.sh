#!/bin/bash
# audit_routes.sh — Wrapper chạy Python script audit_routes.py
# (bash 3.x trên macOS không hỗ trợ associative array, dùng Python)
set -e
cd "$(dirname "$0")/.."
python3 scripts/audit_routes.py "$@"
